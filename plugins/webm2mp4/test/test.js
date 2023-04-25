import ffmpeg from 'fluent-ffmpeg'
import { createWriteStream } from 'node:fs'


const testFile = `./data/webm2mp4/webm/a.webm`
const outpath = `./data/webm2mp4/mp4/temp.mp4`

async function transCode() {
  console.log('开始处理文件')
  // const wStream = createWriteStream(`${outpath}/temp.mp4`)
  // ffmpeg.getAvailableEncoders(function(err, encoders) {
  //   console.log('Available encoders:');
  //   console.dir(encoders);
  // })
  // ffmpeg.getAvailableFormats(function(err, formats) {
  //   console.log('Available formats:');
  //   console.dir(formats);
  // });
  
  const transcodeRes = await new Promise((resolve) => {
    ffmpeg(testFile)
      .format('mp4')
      .output(outpath)
      .on('progress', function(progress) {
        console.log('[webm2mp4] Processing: ' + progress.percent + '% done');
      })
      .on('end', () => {
        resolve({ status: 0, msg: 'Success' })
      })
      .on('stderr', function(stderrLine) {
        console.log('Stderr output: ' + stderrLine);
      })
      .on('error', (err) => {
        console.warn(`[webm2mp4] 文件转码出错 ${testFile}`)
        resolve({ status: 1, msg: 'Fail', err })
      })
      .run()
  })
  // wStream.close()
  console.log(`转码结束`, transcodeRes.msg, transCode.err)
}

await transCode()