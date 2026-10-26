import assert from 'node:assert/strict'
import { createServer } from 'node:http'

/** 127.0.0.1 随机端口上的本地 fixture 站点，只回放 page.html，不访问任何外网。 */
export async function startFixtureServer(fixtureHtml) {
  const server = createServer((request, response) => {
    if (request.url === '/favicon.ico') { response.writeHead(204).end(); return }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(fixtureHtml)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  server.unref()
  const address = server.address()
  assert(address && typeof address !== 'string')
  return {
    url: `http://127.0.0.1:${address.port}/fixture`,
    close: () => new Promise((resolve) => server.close(resolve))
  }
}
