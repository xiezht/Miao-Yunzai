import { rmSync } from 'node:fs'

rmSync('./data/webm2mp4/mp4', {
  recursive: true
})
