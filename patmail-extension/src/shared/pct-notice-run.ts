export interface PctNoticeRunOwner {
  runId: string
  origin: string
  operatorId: string
}

export interface PctNoticeWriteTag extends PctNoticeRunOwner {
  importRound?: 1 | 2
}
