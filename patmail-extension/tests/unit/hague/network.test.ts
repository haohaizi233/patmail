import { expect, it } from 'vitest'
import { EasyTransport } from '../../../src/api/transport'
import { PermitPool } from '../../../src/utils/permit-pool'

it('holds network permits through the body and frees them before case cleanup', async () => {
  let requests = 0
  const bodies: (() => void)[] = [], cleanup: (() => void)[] = []
  const transport = new EasyTransport('http://183.36.43.66:88', { fetcher: async () => {
    requests++
    const response = new Response('{}', { status: 200 })
    response.text = () => new Promise(resolve => bodies.push(() => resolve('{}')))
    return response
  } })
  const pool = new PermitPool(6)
  const tasks = Array.from({ length: 8 }, async () => {
    await transport.post('hagueApplicants', new URLSearchParams({ Call: 'GetCaseApplicant' }), undefined, undefined, undefined, pool)
    await new Promise<void>(resolve => cleanup.push(resolve))
  })
  await new Promise(resolve => setTimeout(resolve, 0)); expect(requests).toBe(6)
  bodies.shift()!(); await new Promise(resolve => setTimeout(resolve, 0))
  expect(requests).toBe(7); expect(cleanup).toHaveLength(1)
  bodies.shift()!(); await new Promise(resolve => setTimeout(resolve, 0)); expect(requests).toBe(8)
  while (bodies.length) { bodies.shift()!(); await new Promise(resolve => setTimeout(resolve, 0)) }
  cleanup.forEach(resolve => resolve()); await Promise.all(tasks)
})
