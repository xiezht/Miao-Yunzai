import plugin from "../../lib/plugins/plugin.js"
import { segment } from "oicq"
import puppeteer from "../../lib/puppeteer/puppeteer.js"


const tierMaps = {
  challenger: '王者',
  grandmaster: '傲视宗师',
  master_plus: '大师以上',
  master: '大师',
  diamond_plus: '钻石以上',
  diamond: '钻石',
  platinum_plus: '铂金以上',
  platinum: '铂金',
  gold_plus: '黄金以上',
  gold: '黄金',
  silver: '白银',
  bronze: '黄铜',
  iron: '黑铁'
}

const posMap = {
  top: '上单',
  jungle: '打野',
  mid: '中单',
  adc: '下路',
  support: '辅助'
}

export class opgg extends plugin {
  constructor() {
    super({
      name: '查询opgg',
      dsc: '',
      /** https://oicqjs.github.io/oicq/#events */
      event: 'message',
      priority: 500,
      rule: [
        {
          /** 命令正则匹配 */
          reg: /^#?[LOL|lol](.*)$/,
          /** 执行方法 */
          fnc: 'handleOpgg'
        }
      ]
    })
  }
  // 获取 opgg 排行部分截图
  async handleOpgg() {
    const {
      tier,
      position
    } = this.resolveCmd(this.e.msg)
    if (!tier || !position) {
      const errStr = `段位/位置解析失败: 段位-${tier}，位置：${position}`
      this.e.reply(errStr)
      logger.error(errStr)
      return
    }
    const opggUrl = `https://www.op.gg/champions?region=global&tier=${tier}&position=${position}`
    try {
      if (!await puppeteer.browserInit()) {
        return
      }
      const browser = puppeteer.browser
      const page = await browser.newPage()
      page.setViewport({
        width: 1920,
        height: 1080,
      })
      await page.goto(opggUrl, { timeout: 30000 })
      const body = await page.$('#content-container')
      const buff = await body.screenshot({
        type: 'jpeg',
      })
      const imageMsg = segment.image(buff)
      page.close().catch((err) => {
        logger.error('页面关闭失败')
        logger.error(err)
      })
      this.e.reply(imageMsg)
    } catch (err) {
      this.e.reply(`${err.toString()}: ${opggUrl}`)
      logger.error('获取opgg数据数据失败')
      logger.error(err)
    }
  }

  /**
   * 解析段位/位置
   */
  resolveCmd(msg) {
    const tierRegStr = '(' + Object.values(tierMaps).join('|') + ')'
    const posRegStr = '(' + Object.values(posMap).join('|') + ')'
    const regx = new RegExp(`#?[LOL|lol]${tierRegStr}${posRegStr}`)
    const matchRes = regx.exec(msg)
    if (!matchRes) {
      return {}
    }
    const [, tierStr, positionStr] = matchRes
    const tier = this.findKeyFromValue(tierStr, tierMaps)
    const position = this.findKeyFromValue(positionStr, posMap)
    return {
      tier,
      position
    }
  }
  findKeyFromValue(value, maps) {
    for (let entry of Object.entries(maps)) {
      if (entry[1] === value) {
        return entry[0]
      }
    }
    return null
  }
}

