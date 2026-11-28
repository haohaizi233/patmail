import assert from 'node:assert/strict'
import { readFile, readdir, mkdir, writeFile, open, unlink } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_ROOT } from '../../shared/paths.mjs'
import { chromium } from 'playwright'
import { reportsDir, resultPath } from '../../../tests/e2e/support/paths.mjs'
import { launchExtensionContext, extensionWorker } from '../../../tests/e2e/support/browser.mjs'
import { distDir } from '../../../tests/e2e/support/paths.mjs'

// 研究原站既有下载协议。报告只保留时序、字节数和格式，不保留凭据、Cookie、文件名、编号、GUID或文件正文。
const origin = 'http://183.36.43.66:88'
const report = { offline: [], source: [], live: [], checkedAt: new Date().toISOString() }
if (process.env.PATMAIL_AUDIT_APPEND_REPORT === '1') {
  try {
    report.live.push(...JSON.parse(await readFile(resultPath('download-streaming-research.json'), 'utf8')).live)
  // eslint-disable-next-line no-empty -- 存量豁免：空 catch 为有意忽略可恢复异常
  } catch {}
}
const harFolder = pathToFileURL(join(REPO_ROOT, 'HAR') + sep)
const inputs = (await readdir(harFolder)).map(name => new URL(name, harFolder))
if (process.env.PATMAIL_AUDIT_HAR) inputs.push(process.env.PATMAIL_AUDIT_HAR)
for (const path of inputs) {
  let har
  try {
    har = JSON.parse(await readFile(path, 'utf8'))
  } catch {
    continue
  }
  for (const entry of har.log?.entries ?? []) {
    const params = entry.request.postData?.text
      ? new URLSearchParams(entry.request.postData.text)
      : new URLSearchParams((entry.request.postData?.params ?? []).map(item => [item.name, item.value]))
    const call = params.get('Call')
    const url = new URL(entry.request.url)
    if (!['DownLoad', 'DownLoadFiles', 'DownLoadZip'].includes(call) && !/FileHandler(New)?\.ashx/i.test(url.pathname))
      continue
    const headers = Object.fromEntries(
      (entry.response.headers ?? []).map(item => [item.name.toLowerCase(), item.value]),
    )
    let json
    try {
      json = JSON.parse(entry.response.content?.text ?? '')
    // eslint-disable-next-line no-empty -- 存量豁免：空 catch 为有意忽略可恢复异常
    } catch {}
    const finding = {
      source: String(path).split(/[\\/]/).at(-1),
      handler: url.pathname.split('/').at(-1),
      call,
      count: params.get('file_no')?.split(';').filter(Boolean).length ?? null,
      elapsedMs: entry.time,
      timings: entry.timings,
      status: entry.response.status,
      contentType: headers['content-type'],
      contentLength: headers['content-length'],
      transferEncoding: headers['transfer-encoding'],
      bodySize: entry.response.bodySize,
      capturedSize: entry.response.content?.size,
      returnedGuid: Boolean(json?.file_guid),
      reportedFileSize: json?.file_size ?? null,
    }
    report.offline.push(finding)
  }
}
if (process.env.PATMAIL_LIVE_DOWNLOAD_RESEARCH !== '1') {
  await mkdir(reportsDir, { recursive: true })
  await writeFile(resultPath('download-streaming-research.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  process.exit(0)
}
assert(process.env.PATMAIL_AUDIT_USER && process.env.PATMAIL_AUDIT_PASSWORD && process.env.PATMAIL_AUDIT_REQUEST)
const pasted = await readFile(process.env.PATMAIL_AUDIT_REQUEST, 'utf8')
const lines = pasted.split(/\r?\n/)
const values = {}
for (let index = 0; index < lines.length; index++) {
  const key = /^\d+\.\s*(\w+)\s*$/.exec(lines[index])?.[1]
  if (key) values[key] = lines[index + 1]?.trim() ?? ''
}
assert.equal(values.Call, 'DownLoad')
const ids = values.file_no.split(';')
const names = values.file_name.split(';')
assert.equal(ids.length, names.length)
const extensionMode = process.env.PATMAIL_AUDIT_EXTENSION === '1'
const browser = extensionMode ? null : await chromium.launch({ headless: true })
const context = extensionMode ? await launchExtensionContext(distDir) : await browser.newContext()
const page = await context.newPage()
try {
  await page.goto(origin, { waitUntil: 'domcontentloaded' })
  await page.locator('#chk_password').uncheck()
  await page.locator('#txtUser').fill(process.env.PATMAIL_AUDIT_USER)
  await page.locator('#txtPwd').fill(process.env.PATMAIL_AUDIT_PASSWORD)
  await page.locator('#btnLogin').click()
  await page.waitForFunction(
    async () => {
      try {
        const data = await fetch('/AjaxServers/Login.ashx', {
          method: 'POST',
          body: new URLSearchParams({ Call: 'GetUserModel' }),
        }).then(response => response.json())
        return data.ClientInfo?.IsLogin === true && Boolean(data.UserModel?.user_id)
      } catch {
        return false
      }
    },
    undefined,
    { timeout: 45000, polling: 1000 },
  )
  console.log(JSON.stringify({ stage: 'authenticated', sampleCount: ids.length }))
  const formUrl = `${origin}/Forms/Patent/FileSearch.aspx`
  const html = await context.request.get(formUrl).then(response => response.text())
  const scripts = [...html.matchAll(/<script[^>]+src\s*=\s*["']([^"']+)["']/gi)]
    .map(match => new URL(match[1], formUrl))
    .filter(url => url.origin === origin && /FileSearch|public\.js/i.test(url.pathname))
  for (const url of scripts) {
    const code = await context.request.get(url.href).then(response => response.text())
    report.source.push({
      file: url.pathname.split('/').at(-1),
      sha256: createHash('sha256').update(code).digest('hex'),
      bytes: Buffer.byteLength(code),
      downloadCalls: [...new Set([...code.matchAll(/Call\s*:\s*['"](\w*[Dd]own\w*)['"]/g)].map(match => match[1]))],
      handlers: [...new Set([...code.matchAll(/FileHandler\w*\.ashx/g)].map(match => match[0]))],
    })
    await writeFile(resultPath(`research-${url.pathname.split('/').at(-1)}`), code)
  }
  await page.exposeFunction('__reportStreamingResearch', packet => console.log(JSON.stringify(packet)))
  const counts = (process.env.PATMAIL_AUDIT_COUNTS ?? '1,20').split(',').map(Number)
  for (const count of counts) {
    assert(Number.isInteger(count) && count > 0 && count <= 100)
    const params = new URLSearchParams({
      Call: 'DownLoad',
      file_no: ids.slice(0, count).join(';'),
      file_name: names.slice(0, count).join(';'),
      zip_name: '',
      zip_pwd: '',
      down_type: '',
      model: 'FILE',
      childpath: '',
      log_pagename: 'FileSearch.aspx',
    })
    console.log(JSON.stringify({ stage: 'packing-start', count }))
    const result = await page.evaluate(
      async ({ body, count }) => {
        const started = performance.now()
        const controller = new AbortController()
        const stop = setTimeout(() => controller.abort(), 240000)
        const heartbeat = setInterval(
          () =>
            void globalThis.window.__reportStreamingResearch({
              stage: 'packing-wait',
              count,
              elapsedMs: Math.round(performance.now() - started),
            }),
          15000,
        )
        const metrics = {
          count,
          headersMs: null,
          firstBytesMs: null,
          firstGuidMs: null,
          completeMs: null,
          bytes: 0,
          chunks: [],
          status: null,
          headers: {},
          leadingWhitespaceBytes: 0,
        }
        try {
          const response = await fetch('/AjaxServers/BaseInfo.ashx', {
            method: 'POST',
            body: new URLSearchParams(body),
            credentials: 'include',
            signal: controller.signal,
          })
          metrics.headersMs = Math.round(performance.now() - started)
          metrics.status = response.status
          for (const key of ['content-type', 'content-length', 'transfer-encoding', 'content-encoding'])
            metrics.headers[key] = response.headers.get(key)
          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let text = ''
          for (;;) {
            const chunk = await reader.read()
            if (chunk.done) break
            metrics.bytes += chunk.value.byteLength
            const elapsedMs = Math.round(performance.now() - started)
            metrics.firstBytesMs ??= elapsedMs
            text += decoder.decode(chunk.value, { stream: true })
            if (metrics.firstGuidMs === null && /"file_guid"\s*:\s*"[0-9a-f-]{36}"/i.test(text))
              metrics.firstGuidMs = elapsedMs
            const item = { elapsedMs, bytes: chunk.value.byteLength, totalBytes: metrics.bytes }
            metrics.chunks.push(item)
            void globalThis.window.__reportStreamingResearch({ stage: 'packing-chunk', count, ...item })
            if (metrics.bytes > 2 * 1024 * 1024) throw new Error('Unexpected large preparation response')
          }
          text += decoder.decode()
          metrics.completeMs = Math.round(performance.now() - started)
          metrics.leadingWhitespaceBytes = new TextEncoder().encode(/^\s*/.exec(text)?.[0] ?? '').length
          const data = JSON.parse(text.trim())
          return {
            metrics,
            guid: typeof data.file_guid === 'string' ? data.file_guid : null,
            fileSize: data.file_size ?? null,
            login: data.ClientInfo?.IsLogin,
            failedCount: /共(\d+)个文件下载失败/.exec(data.error_message ?? '')?.[1] ?? null,
          }
        } catch (error) {
          return { metrics, error: error instanceof Error ? error.message : String(error) }
        } finally {
          clearTimeout(stop)
          clearInterval(heartbeat)
        }
      },
      { body: params.toString(), count },
    )
    const { guid, ...summary } = result
    if (guid && /^[0-9a-f-]{36}$/i.test(guid)) {
      // 只读新建临时包：请求尾部64KB，检验ZIP结束目录是否已经可用。服务器忽略Range时限制读取量。
      summary.archive = await page.evaluate(async guid => {
        const started = performance.now()
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 60000)
        const result = {
          status: null,
          headers: {},
          headersMs: null,
          firstBytesMs: null,
          elapsedMs: null,
          received: 0,
          ended: false,
          eocdPresent: false,
          entryCount: null,
          zipPrefix: null,
        }
        try {
          const response = await fetch(`/AjaxServers/FileHandler.ashx?guid=${encodeURIComponent(guid)}`, {
            headers: { Range: 'bytes=-65536' },
            signal: controller.signal,
            credentials: 'include',
          })
          result.status = response.status
          result.headersMs = Math.round(performance.now() - started)
          for (const key of [
            'content-type',
            'content-length',
            'content-range',
            'accept-ranges',
            'transfer-encoding',
            'last-modified',
          ])
            result.headers[key] = response.headers.get(key)
          const max = Number(response.headers.get('content-length')) > 8 * 1024 * 1024 ? 131072 : 8 * 1024 * 1024
          const reader = response.body.getReader()
          const chunks = []
          for (;;) {
            const chunk = await reader.read()
            if (chunk.done) {
              result.ended = true
              break
            }
            result.firstBytesMs ??= Math.round(performance.now() - started)
            result.received += chunk.value.byteLength
            chunks.push(chunk.value)
            if (result.received > max) {
              await reader.cancel()
              break
            }
          }
          const bytes = new Uint8Array(result.received)
          let offset = 0
          for (const chunk of chunks) {
            bytes.set(chunk, offset)
            offset += chunk.length
          }
          result.zipPrefix = [...bytes.slice(0, 4)].map(value => value.toString(16).padStart(2, '0')).join('')
          for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65558); index--) {
            if (
              bytes[index] === 0x50 &&
              bytes[index + 1] === 0x4b &&
              bytes[index + 2] === 5 &&
              bytes[index + 3] === 6 &&
              index + 22 + bytes[index + 20] + 256 * bytes[index + 21] === bytes.length &&
              result.ended
            ) {
              result.eocdPresent = true
              result.entryCount = bytes[index + 10] + 256 * bytes[index + 11]
              break
            }
          }
        } catch (error) {
          result.error = error instanceof Error ? error.message : String(error)
        } finally {
          clearTimeout(timer)
          result.elapsedMs = Math.round(performance.now() - started)
        }
        return result
      }, guid)
      if (count <= 2) {
        const alternativeGuid = await page.evaluate(async body => {
          const data = await fetch('/AjaxServers/BaseInfo.ashx', {
            method: 'POST',
            body: new URLSearchParams(body),
            credentials: 'include',
          }).then(response => response.json())
          return data.file_guid
        }, params.toString())
        summary.alternativeHandler = await page.evaluate(async guid => {
          const started = performance.now()
          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), 30000)
          try {
            const response = await fetch(`/AjaxServers/FileHandlerNew.ashx?guid=${encodeURIComponent(guid)}`, {
              signal: controller.signal,
              credentials: 'include',
            })
            const headers = {}
            for (const key of ['content-type', 'content-length', 'transfer-encoding', 'accept-ranges'])
              headers[key] = response.headers.get(key)
            const reader = response.body.getReader()
            const chunk = await reader.read()
            await reader.cancel()
            return {
              freshHandle: true,
              status: response.status,
              headers,
              firstBytesMs: Math.round(performance.now() - started),
              prefix: [...(chunk.value ?? []).slice(0, 4)].map(value => value.toString(16).padStart(2, '0')).join(''),
            }
          } catch (error) {
            return { error: error instanceof Error ? error.message : String(error) }
          } finally {
            clearTimeout(timer)
          }
        }, alternativeGuid)
      }
      if (extensionMode) {
        // 取包句柄可能只能用一次，跨扩展上下文能力测试必须使用新句柄。
        const freshGuid = await page.evaluate(async body => {
          const data = await fetch('/AjaxServers/BaseInfo.ashx', {
            method: 'POST',
            body: new URLSearchParams(body),
            credentials: 'include',
          }).then(response => response.json())
          return data.file_guid
        }, params.toString())
        const worker = await extensionWorker(context)
        const app = await context.newPage()
        await app.goto(`chrome-extension://${new URL(worker.url()).host}/app.html#/files`)
        summary.extensionStreaming = await app.evaluate(
          async ({ guid, origin }) => {
            const capabilities = {
              secureContext: globalThis.isSecureContext,
              filePicker: typeof showSaveFilePicker === 'function',
              readableStream: typeof ReadableStream === 'function',
            }
            let login = null
            try {
              const data = await fetch(`${origin}/AjaxServers/Login.ashx`, {
                method: 'POST',
                body: new URLSearchParams({ Call: 'GetUserModel' }),
                credentials: 'include',
              }).then(response => response.json())
              login = data.ClientInfo?.IsLogin === true
            // eslint-disable-next-line no-empty -- 存量豁免：空 catch 为有意忽略可恢复异常
            } catch {}
            const response = await fetch(`${origin}/AjaxServers/FileHandler.ashx?guid=${encodeURIComponent(guid)}`, {
              credentials: 'include',
            })
            const reader = response.body.getReader()
            const chunk = await reader.read()
            await reader.cancel()
            return {
              ...capabilities,
              freshHandle: true,
              login,
              status: response.status,
              contentType: response.headers.get('content-type'),
              contentLength: response.headers.get('content-length'),
              firstChunkBytes: chunk.value?.byteLength ?? 0,
              prefix: [...(chunk.value ?? []).slice(0, 4)].map(value => value.toString(16).padStart(2, '0')).join(''),
            }
          },
          { guid: freshGuid, origin },
        )
        if (!summary.extensionStreaming.firstChunkBytes)
          summary.extensionStreaming.siteRecheck = await page.evaluate(async guid => {
            const response = await fetch(`/AjaxServers/FileHandler.ashx?guid=${encodeURIComponent(guid)}`, {
              credentials: 'include',
            })
            const reader = response.body.getReader()
            const chunk = await reader.read()
            await reader.cancel()
            return {
              status: response.status,
              bytes: chunk.value?.byteLength ?? 0,
              prefix: [...(chunk.value ?? []).slice(0, 4)].map(value => value.toString(16).padStart(2, '0')).join(''),
            }
          }, freshGuid)
        if (process.env.PATMAIL_AUDIT_LOCAL_ZIP === '1') {
          const validationPath = resultPath('streaming-prototype-validation.zip')
          const validationFile = await open(validationPath, 'w')
          await app.exposeFunction('__writeZipForValidation', async bytes => {
            await validationFile.write(Uint8Array.from(bytes))
          })
          try {
            summary.localZipPrototype = await app.evaluate(
              async ({ origin, files }) => {
                // 仅研究原型：STORE模式顺序ZIP+数据描述符。正式功能应使用经过验证的ZIP64库及完整取消/重试机制。
                const started = performance.now()
                const events = []
                const table = new Uint32Array(256)
                for (let index = 0; index < 256; index++) {
                  let value = index
                  for (let bit = 0; bit < 8; bit++) value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1
                  table[index] = value >>> 0
                }
                const updateCrc = (crc, bytes) => {
                  for (const byte of bytes) crc = (crc >>> 8) ^ table[(crc ^ byte) & 255]
                  return crc >>> 0
                }
                const root = await navigator.storage.getDirectory()
                const fileHandle = await root.getFileHandle('streaming-research.zip', { create: true })
                const output = await fileHandle.createWritable()
                const encoder = new TextEncoder()
                let written = 0
                let maxChunkBytes = 0
                let firstPayloadWriteMs = null
                const records = []
                const write = async bytes => {
                  await output.write(bytes)
                  written += bytes.byteLength
                }
                const part = length => {
                  const bytes = new Uint8Array(length)
                  return [bytes, new DataView(bytes.buffer)]
                }
                // 两个生产者只保留响应流，数据按ZIP条目顺序消费，未消费的响应由流施加背压。
                const jobs = files.map(async (fileNo, index) => {
                  events.push({ stage: 'producer-start', index, elapsedMs: Math.round(performance.now() - started) })
                  const params = new URLSearchParams({
                    Call: 'DownLoad',
                    file_no: fileNo,
                    file_name: `sample-${index + 1}.pdf`,
                    zip_name: '',
                    zip_pwd: '',
                    down_type: '',
                    model: 'FILE',
                    childpath: '',
                    log_pagename: 'FileSearch.aspx',
                  })
                  const prepared = await fetch(`${origin}/AjaxServers/BaseInfo.ashx`, {
                    method: 'POST',
                    credentials: 'include',
                    body: params,
                  }).then(response => response.json())
                  if (!prepared.file_guid) throw new Error('Single-file preparation did not return a handle')
                  const response = await fetch(
                    `${origin}/AjaxServers/FileHandler.ashx?guid=${encodeURIComponent(prepared.file_guid)}`,
                    { credentials: 'include' },
                  )
                  if (!response.ok || !response.body) throw new Error('Original-file stream unavailable')
                  events.push({ stage: 'producer-ready', index, elapsedMs: Math.round(performance.now() - started) })
                  return response.body
                })
                try {
                  for (let index = 0; index < jobs.length; index++) {
                    const name = encoder.encode(`sample-${index + 1}.pdf`)
                    const offset = written
                    const [header, view] = part(30 + name.length)
                    view.setUint32(0, 0x04034b50, true)
                    view.setUint16(4, 20, true)
                    view.setUint16(6, 0x0808, true)
                    view.setUint16(12, 33, true)
                    view.setUint16(26, name.length, true)
                    header.set(name, 30)
                    await write(header)
                    const dataOffset = written
                    const stream = await jobs[index]
                    const reader = stream.getReader()
                    let crc = 0xffffffff
                    let size = 0
                    try {
                      for (;;) {
                        const chunk = await reader.read()
                        if (chunk.done) break
                        maxChunkBytes = Math.max(maxChunkBytes, chunk.value.byteLength)
                        crc = updateCrc(crc, chunk.value)
                        size += chunk.value.byteLength
                        await write(chunk.value)
                        firstPayloadWriteMs ??= Math.round(performance.now() - started)
                      }
                    } finally {
                      reader.releaseLock()
                    }
                    crc = (crc ^ 0xffffffff) >>> 0
                    const [descriptor, desc] = part(16)
                    desc.setUint32(0, 0x08074b50, true)
                    desc.setUint32(4, crc, true)
                    desc.setUint32(8, size, true)
                    desc.setUint32(12, size, true)
                    await write(descriptor)
                    records.push({ name, offset, dataOffset, size, crc })
                    events.push({
                      stage: 'entry-written',
                      index,
                      bytes: written,
                      elapsedMs: Math.round(performance.now() - started),
                    })
                  }
                  const centralOffset = written
                  for (const record of records) {
                    const [header, view] = part(46 + record.name.length)
                    view.setUint32(0, 0x02014b50, true)
                    view.setUint16(4, 20, true)
                    view.setUint16(6, 20, true)
                    view.setUint16(8, 0x0808, true)
                    view.setUint16(14, 33, true)
                    view.setUint32(16, record.crc, true)
                    view.setUint32(20, record.size, true)
                    view.setUint32(24, record.size, true)
                    view.setUint16(28, record.name.length, true)
                    view.setUint32(42, record.offset, true)
                    header.set(record.name, 46)
                    await write(header)
                  }
                  const centralSize = written - centralOffset
                  const [end, view] = part(22)
                  view.setUint32(0, 0x06054b50, true)
                  view.setUint16(8, records.length, true)
                  view.setUint16(10, records.length, true)
                  view.setUint32(12, centralSize, true)
                  view.setUint32(16, centralOffset, true)
                  await write(end)
                  await output.close()
                  const file = await fileHandle.getFile()
                  const tail = new DataView(await file.slice(-22).arrayBuffer())
                  const verified = []
                  for (const record of records) {
                    const reader = file
                      .slice(record.dataOffset, record.dataOffset + record.size)
                      .stream()
                      .getReader()
                    let crc = 0xffffffff
                    for (;;) {
                      const chunk = await reader.read()
                      if (chunk.done) break
                      crc = updateCrc(crc, chunk.value)
                    }
                    verified.push((crc ^ 0xffffffff) >>> 0 === record.crc)
                  }
                  const validationReader = file.stream().getReader()
                  for (;;) {
                    const chunk = await validationReader.read()
                    if (chunk.done) break
                    await globalThis.window.__writeZipForValidation([...chunk.value])
                  }
                  return {
                    passed:
                      tail.getUint32(0, true) === 0x06054b50 &&
                      tail.getUint16(10, true) === 2 &&
                      verified.every(Boolean) &&
                      file.size === written,
                    entries: records.length,
                    archiveBytes: written,
                    payloadBytes: records.map(record => record.size),
                    crcVerified: verified,
                    maxChunkBytes,
                    firstPayloadWriteMs,
                    elapsedMs: Math.round(performance.now() - started),
                    events,
                    blobAssembly: false,
                    storage: 'isolated browser OPFS temporary file',
                    productionFeature: false,
                  }
                } catch (error) {
                  await output.abort().catch(() => {})
                  throw error
                } finally {
                  await root.removeEntry('streaming-research.zip').catch(() => {})
                }
              },
              { origin, files: ids.slice(0, 2) },
            )
            await validationFile.close()
            const python = process.env.PATMAIL_RESEARCH_PYTHON ?? 'python'
            const code =
              'import zipfile,json,sys\nwith zipfile.ZipFile(sys.argv[1]) as archive:\n assert len(archive.infolist()) == 2\n assert archive.testzip() is None\n print(json.dumps({"passed":True,"entries":len(archive.infolist()),"methods":[item.compress_type for item in archive.infolist()],"uncompressedBytes":sum(item.file_size for item in archive.infolist())}))'
            const { stdout } = await promisify(execFile)(python, ['-c', code, validationPath], { windowsHide: true })
            summary.localZipPrototype.independentPythonValidation = JSON.parse(stdout)
          } finally {
            await validationFile.close().catch(() => {})
            await unlink(validationPath).catch(() => {})
          }
        }
        await app.close()
      }
    }
    report.live.push(summary)
    console.log(JSON.stringify({ stage: 'sample-complete', ...summary }))
    await mkdir(reportsDir, { recursive: true })
    await writeFile(resultPath('download-streaming-research.json'), JSON.stringify(report, null, 2))
    if (result.error || result.login === false) break
  }
} finally {
  await mkdir(reportsDir, { recursive: true })
  await writeFile(resultPath('download-streaming-research.json'), JSON.stringify(report, null, 2))
  await context.close()
  await browser?.close()
}
