export const HAGUE_SESSION_CHANNEL = 'PATMAIL_HAGUE_SESSION'
export const HAGUE_ORIGIN = 'https://hague.wipo.int'
export const HAGUE_HOME = `${HAGUE_ORIGIN}/#/landing/home`
export interface HagueTab { id: number; title: string }
export interface HagueSession { tabId: number; title: string; documentId: string; verifiedAt: number; expiresAt: number }
