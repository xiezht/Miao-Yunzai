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


// 这里好像每次消息来了都会实例化一次插件，似乎得把 queue/handling 放到顶层变量

const cacheDir = './data/webm2mp4/webm'
const resDir = './data/webm2mp4/mp4'
/**
 * @type {Array<{ fileUrl: string, fid: string, name: string, groupId: number, path: string, outputPath: string }>}
 */
const queue = []
let inited = false
let handling = false

export class webm2mp4 extends plugin {
  // TODO 
  constructor() {
    logger.mark(`[webm2mp4] 正在实例化 webm2mp4 插件`)
    super({
      name: 'webm2mp4',
      dsc: '',
      /** https://oicqjs.github.io/oicq/#events */
      event: 'message',
      priority: 500,
    })
    this.initCacheDir()
  }
  
  async accept() {
    try {
      if (!this.e.isGroup || !this.e.file) return
      const { name, fid } = this.e.file
      if (!name.endsWith('.webm')) return
      const filePath = `${cacheDir}/${fid}.webm`
      const outputPath = `${resDir}/${fid}.mp4`
      queue.push({
        groupId: this.e.group_id,
        fid,
        // fileUrl,
        name,
        path: filePath,
        outputPath,
      })
      this.e.reply(`文件 [${name}] 已加入处理队列，队列长度 ${queue.length}`)
      if (!handling) {
        this.startTranscode()
      }
    } catch (err) {
      logger.error(`[webm2mp4] ${err.toString()}`)
    }
  }
  async startTranscode() {
    if (queue.length && !handling) {
      try {
        logger.mark(`[webm2mp4] 开始处理队列，队列长度 ${queue.length}`)
        const top = queue.shift()
        logger.info(`栈顶元素 ${JSON.stringify(top)}`)
        handling = true
        // 下载文件
        top.fileUrl = await this.e.group.getFileUrl(top.fid)
        if (!await common.downFile(top.fileUrl, top.path)) {
          this.e.reply(`服务器下载视频文件失败：${top.name}`)
          throw new Error(`文件下载失败：${top.fileUrl}`)
        }
        // 进行文件转码
        const transJob = async () => {
          return await new Promise((resolve, reject) => {
            ffmpeg(top.path)
              .inputOptions([
                '-threads 4'
              ])
              .output(top.outputPath)
              .on('end', () => {
                logger.info(`[webm2mp4] 转码结束：${top.name}`)
                resolve({ status: 0, msg: 'Success' })
              })
              .on('error', (err) => {
                this.e.reply(`文件 [${top.name}] 转码出错 `)
                reject(err)
              })
              .run()
          })
        }
        await this.startJobAndLogTime(transJob, `视频转码：${top.name}`)
        
        // 转码成功，则进行文件上传，否则群消息提示
        const uploadJob = async () => {
          return await this.e.group.fs.upload(
            top.outputPath,
            '/',
            top.name.replace('.webm', '.mp4')
          )
        }
        await this.startJobAndLogTime(uploadJob, `文件上传：${top.name.replace('.webm', '.mp4')}`)
      } catch (err) {
        logger.error(`[webm2mp4] 文件转码失败 ${err.toString()}`)
      } finally {
        handling = false
        if (queue.length === 0) {
          logger.info('[webm2mp4] 转码队列处理完毕')
          this.clearCacheDir()
          return
        } else {
          process.nextTick(this.startTranscode.bind(this))
        }
      }
    }
  }

  initCacheDir() {
    if (inited) return
    logger.mark('[webm2mp4] 初始化webm2mp4目录')
    mkdirSync(cacheDir, { recursive: true })
    mkdirSync(resDir, { recursive: true })
    inited = true
  }

  // 队列处理完成后，统一清理一次缓存目录，避免溢出
  clearCacheDir() {
    logger.mark('[webm2mp4] 清理缓存并重新创建目录')
    rmSync(cacheDir, { recursive: true })
    rmSync(resDir, { recursive: true })
    // 重新创建目录
    mkdirSync(cacheDir, { recursive: true })
    mkdirSync(resDir, { recursive: true })
  }

  /**
   * 
   * @param {Promise | Function} func 注意自行绑定this
   * @param {string} name 
   * @returns 返回 func 函数本身执行的结果
   */
  startJobAndLogTime(func, name = 'Job') {
    const start = performance.now()
    if (func.then) {
      return func().then((res) => {
        const end = performance.now()
        logger.mark(`[webm2mp4] ${name}执行时长 ${end - start}ms`)
        return res
      })
    } else {
      const res = func()
      const end = performance.now()
      logger.mark(`[webm2mp4] 任务：${name} 执行时长：${end - start}s`)
      return res
    }
  }
}