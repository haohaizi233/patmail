import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { mkdtemp } from 'node:fs/promises'
import { projectRoot, tmpPath } from './paths.mjs'

export const streamBridgePort = Number(process.env.PATMAIL_TEST_BRIDGE_PORT || 42843)
export const streamBridgeBase = `http://127.0.0.1:${streamBridgePort}`

export async function ensureStreamBridge() {
  const ready = async () => {
    try {
      const info = await fetch(streamBridgeBase + '/health', { signal: AbortSignal.timeout(1000) }).then(response =>
        response.json(),
      )
      return info.protocol === 'patmail-stream-v1' && info.version === 2
    } catch {
      return false
    }
  }
  if (await ready()) return () => {}
  const args = [join(projectRoot, 'scripts', 'download', 'bridge', 'stream-download-bridge.py'), '--port', String(streamBridgePort)]
  if (process.env.PATMAIL_TEST_BRIDGE_PORT) args.push('--cache-dir', await mkdtemp(tmpPath('bridge-cache-')))
  const child = spawn('python', args, { windowsHide: true, stdio: 'ignore' })
  let failed = false
  child.on('error', () => {
    failed = true
  })
  for (let index = 0; index < 25 && !failed; index++) {
    await new Promise(resolve => setTimeout(resolve, 200))
    if (await ready())
      return () => {
        child.kill()
      }
  }
  child.kill()
  throw new Error('本机下载桥接未启动，检查Python和42843端口。')
}
