import {
  getObserverStatus,
  configureHagueDiagnostics,
  runObserverDaemon,
  startObserver,
  stopObserver,
} from './cdp-observer-core.mjs'

function parseArgs(args) {
  const [command, ...rest] = args
  const options = {}
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === '--target') { options.targetId = rest[++index]; continue }
    if (rest[index] === '--endpoint') {
      const endpoint = rest[index + 1]
      if (!endpoint || endpoint.startsWith('--')) throw new Error('--endpoint requires a URL')
      options.endpoint = endpoint
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${rest[index]}`)
  }
  return { command, options }
}

function printResult(result) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

async function runCli() {
  if (process.argv[2] === '__daemon') {
    const token = process.env.PATMAIL_CDP_OBSERVER_TOKEN
    delete process.env.PATMAIL_CDP_OBSERVER_TOKEN
    await runObserverDaemon(token)
    return
  }

  const { command, options } = parseArgs(process.argv.slice(2))
  if (command === 'basic' || ['research-enable','research-disable','research-status'].includes(command)) {
    printResult(await configureHagueDiagnostics(command === 'basic' ? 'disable' : command.slice(9), options.targetId, {mode:'research'})); return
  }
  if (['deep-enable','deep-disable','deep-status'].includes(command)) {
    printResult(await configureHagueDiagnostics(command.slice(5), options.targetId))
    return
  }
  if (command === 'start') {
    printResult(await startObserver(options))
    return
  }
  if (command === 'status') {
    if (options.endpoint) throw new Error('status does not accept --endpoint')
    printResult(await getObserverStatus())
    return
  }
  if (command === 'stop') {
    if (options.endpoint) throw new Error('stop does not accept --endpoint')
    printResult(await stopObserver())
    return
  }
  throw new Error('Usage: node scripts/cdp/cdp-observer.mjs start [--endpoint <localhost-url>] | status | stop')
}

runCli().catch(error => {
  process.stderr.write(`CDP observer: ${error?.message ?? 'command failed'}\n`)
  process.exitCode = 1
})

