export const EASY_PAGE_WORLD_CHANNEL = 'PATMAIL_EASY_MAIN_WORLD'

export interface EasyPageWorldMenuEntry {
  name: string
  url: string
}

export type EasyPageWorldRequest =
  | { channel: typeof EASY_PAGE_WORLD_CHANNEL; action: 'read-menu' }
  | { channel: typeof EASY_PAGE_WORLD_CHANNEL; action: 'open-tab'; tabId: string; title: string; path: string }

export type EasyPageWorldReply =
  | { ok: true; entries?: EasyPageWorldMenuEntry[] }
  | { ok: false; message: string }
