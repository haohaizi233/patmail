/** 后台没接住下载时的兜底：和原站 GetFile 一样挂隐藏 iframe 到取包地址，浏览器自己下载并留下下载记录。 */
export function startArchiveDownload(owner: Document, url: string): void {
  const frame = owner.createElement('iframe')
  frame.style.display = 'none'
  frame.src = url
  ;(owner.body ?? owner.documentElement).appendChild(frame)
  setTimeout(() => frame.remove(), 60_000)
}
