import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { projectRoot } from './paths.mjs'

export async function ensureStreamBridge() {
  const ready = async () => {
    try { const info = await fetch('http://127.0.0.1:42843/health', { signal: AbortSignal.timeout(1000) }).then(response => response.json()); return info.protocol === 'patmail-stream-v1' && info.version === 2 } catch { return false }
  }
  if (await ready()) return () => {}
  const child = spawn('python', [join(projectRoot, 'scripts', 'stream-download-bridge.py')], { windowsHide: true, stdio: 'ignore' })
  let failed = false
  child.on('error', () => { failed = true })
  for (let index = 0; index < 25 && !failed; index++) {
    await new Promise(resolve => setTimeout(resolve, 200))
    if (await ready()) return () => { child.kill() }
  }
  child.kill()
  throw new Error('本机下载桥接未启动，检查Python和42843端口。')
}
