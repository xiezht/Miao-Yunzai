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
 * 这个队列似乎可以放到 redis 中
 * @type {Array<{ fileUrl: string, fid: string, name: string, groupId: number, path: string, outputPath: string }>}
 */
const queue = []
let inited = false
let handling = false

export class webm2mp4 extends plugin {
  constructor() {
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
        await this.startTranscode()
      }
    } catch (err) {
      logger.error(`[webm2mp4] ${err}`)
    }
  }
  async startTranscode() {
    if (queue.length && !handling) {
      try {
        logger.mark(`[webm2mp4] 开始处理队列，队列长度 ${queue.length}`)
        const top = queue.shift()
        logger.mark(`栈顶元素 ${JSON.stringify(top)}`)
        handling = true
        // 下载文件
        top.fileUrl = await this.e.group.getFileUrl(top.fid)
        if (!await common.downFile(top.fileUrl, top.path)) {
          throw new Error(`文件[${top.name}]下载失败：${top.fileUrl}`)
        }
        // 进行文件转码
        const transJob = () => {
          return new Promise((resolve, reject) => {
            ffmpeg(top.path)
              .output(top.outputPath)
              .on('end', () => {
                logger.info(`[webm2mp4] 转码结束：${top.name}`)
                resolve({ status: 0, msg: 'Success' })
              })
              .on('error', (err) => {
                reject(`ffmpeg转码失败 [${err}]`)
              })
              .run()
          })
        }
        await this.startJobAndLogTime(transJob, `视频转码[${top.name}]`)
        
        // 转码成功，则进行文件上传，否则群消息提示
        // NOTE：这里的upload 需要使用 callback 参数计算进度，没法使用 startJobAndLogTime 函数
        const uploadJob = async () => {
          const start = performance.now()
          const newName = top.name.replace('.webm', '.mp4')
          return await this.e.group.fs.upload(
            top.outputPath,
            '/',
            newName,
            (perc) => {
              if (perc > 99.9) {
                const end = performance.now()
                logger.mark(`[webm2mp4] 任务：文件上传[${newName}] 执行时长：${end - start}ms`)
              }
            }
          )
        }
        await uploadJob()
      } catch (err) {
        this.e.reply(`处理失败，原因： ${err.message}`)
        logger.error(`[webm2mp4] 处理失败，原因： ${err.message}`)
      } finally {
        logger.info('[webm2mp4] 单次处理结束，判定是否继续处理')
        handling = false
        if (queue.length === 0) {
          logger.info('[webm2mp4] 转码队列处理完毕')
          this.clearCacheDir()
          return
        } else {
          setTimeout(async() => {
            await this.startTranscode()
          }, 0)
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
   * @param {Function} func 注意自行绑定this
   * @param {string} name 
   * @returns 返回 func 函数本身执行的结果，是否返回 Promise 取决于 func
   */
  startJobAndLogTime(func, name = 'Job') {
    const start = performance.now()
    const funcRes = func()
    // 如果函数返回了一个 promise，那么把计算时长的逻辑放到 then 里面
    if (funcRes.then) {
      return funcRes.then((res) => {
        const end = performance.now()
        logger.mark(`[webm2mp4] 任务：${name} 执行时长：${end - start}ms`)
        return res
      })
    } else {
      const end = performance.now()
      logger.mark(`[webm2mp4] 任务：${name} 执行时长：${end - start}ms`)
      return funcRes
    }
  }
}