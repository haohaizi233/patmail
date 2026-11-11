/** Only known Hague read failures may cross the content-script boundary verbatim. */
export class HagueReadError extends Error { readonly name = 'HagueReadError' }
export function hagueReadFailure(error: unknown): string {
  if (error instanceof HagueReadError) return error.message.slice(0, 1000)
  return '海牙案件读取出现异常，请重试本案；其他案件可继续处理。'
}
import type { ContentResponse } from '../shared/message'
export async function hagueReadResponse(read: () => Promise<string>): Promise<ContentResponse> {
  try { return { type: 'READ_HAGUE_CASE_RESULT', payload: { text: await read() } } }
  catch (error) { return { type: 'ERROR', payload: { message: hagueReadFailure(error) } } }
}
