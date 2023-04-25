/**
 * 处理 webm 文件转码为 mp4 文件
 * TODO
 *  1. 队列，避免同时处理太多视频
 *    + 收到文件 -> 存储 -> 解码 -> 返回 -> 删除本地 -> 获取队列 -> 处理下一个缓存文件
 *  2. 视频质量（尽量减少cpu负载）
 *  3. ffmpeg 安装，是否有封装好的npm包？要不要自己维护一个？
 */

// import { segment } from "icqq"
import common from "../../lib/common/common.js"
import plugin from "../../lib/plugins/plugin.js"
import ffmpeg from 'fluent-ffmpeg'
import { mkdirSync, rmSync } from 'node:fs'

export class webm2mp4 extends plugin {
  // TODO 这里好像每次消息来了都会实例化一次插件，是不是得把 queue/handling 放到顶层变量
  constructor() {
    logger.mark(`[webm2mp4] 正在实例化 webm2mp4 插件`)
    super({
      name: 'webm2mp4',
      dsc: '',
      /** https://oicqjs.github.io/oicq/#events */
      event: 'message',
      priority: 500,
    })
    this.ffmpeg = ffmpeg
    /**
     * @type {Array<{ fileUrl: string, fid: string, name: string, groupId: number, path: string, outputPath: string }>}
     */
    this.queue = []
    this.handling = false
    this.cacheDir = './data/webm2mp4/webm'
    this.resDir = './data/webm2mp4/mp4'
    this.inited = false
    this.initCacheDir()
  }
  
  async accept() {
    try {
      if (!this.e.isGroup || !this.e.file) return
      const { name, fid } = this.e.file
      if (!name.endsWith('.webm')) return
      const fileUrl = await this.e.group.getFileUrl(fid)
      const filePath = `${this.cacheDir}/${fid}.webm`
      const outputPath = `${this.resDir}/${fid}.mp4`

      this.e.reply(`文件 [${name}] 已加入处理队列`)
      await common.downFile(fileUrl, filePath)
      this.queue.push({
        groupId: this.e.group_id,
        fid,
        fileUrl,
        name,
        path: filePath,
        outputPath,
      })
      if (!this.handling) {
        this.startTranscode()
      }
    } catch (err) {
      logger.error(`[webm2mp4] 处理失败 ${err.toString()}`)
    }
  }
  async startTranscode() {
    if (this.queue.length && !this.handling) {
      logger.mark('[webm2mp4] 开始处理队列')
      // // 缓存当前队列
      // const tempQueue = [].concat(this.queue)
      const top = this.queue.shift()
      this.handling = true
      await new Promise((resolve) => {
        this.ffmpeg(top.path)
          .inputOptions([
            '-threads 4'
          ])
          .output(top.outputPath)
          .on('progress', function(progress) {
            logger.mark('[webm2mp4] Processing: ' + progress.percent + '% done');
          })
          .on('end', () => {
            resolve({ status: 0, msg: 'Success' })
          })
          .on('error', (err) => {
            logger.error(`[webm2mp4] 文件转码出错 ${top.name} fid：${top.fid}`)
            resolve({ status: 1, msg: err.toString() })
          })
          .run()
      })
      // TODO 这里是不是可以等队列处理完了，统一回传到群消息
      await this.e.group.fs.upload(
        top.outputPath,
        '/',
        top.name.replace('.webm', '.mp4'),
        (percent) => {
          logger.mark(`[webm2mp4] mp4文件上传中：${percent} % done`)
        }
      )
      logger.info(`[webm2mp4] 转码结束：${top.name}`)
      if (this.queue.length === 0) {
        this.handling = false
        logger.info('[webm2mp4] 转码队列处理完毕')
        this.clearCacheDir()
        return
      } else {
        process.nextTick(this.startTranscode.bind(this))
      }
    }
  }

  initCacheDir() {
    if (this.inited) return
    logger.mark('[webm2mp4] 初始化webm2mp4目录')
    mkdirSync(this.cacheDir, { recursive: true })
    mkdirSync(this.resDir, { recursive: true })
    this.inited = true
  }

  // 队列处理完成后，统一清理一次缓存目录，避免溢出
  clearCacheDir() {
    logger.mark('[webm2mp4] 清理缓存并重新创建目录')
    rmSync(this.cacheDir, { recursive: true })
    rmSync(this.resDir, { recursive: true })
    // 重新创建目录
    mkdirSync(this.cacheDir, { recursive: true })
    mkdirSync(this.resDir, { recursive: true })
  }
}