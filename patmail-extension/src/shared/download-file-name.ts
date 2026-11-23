/** Chrome returns an absolute path. Only expose the basename to workflow UIs. */
export function browserDownloadName(path?: string): string | undefined {
  return path?.split(/[\\/]/).at(-1) || undefined
}

export function matchesBrowserDownloadPath(path: string, requestedPath: string): boolean {
  const normalized = path.replaceAll('\\', '/').replace(/ \(\d+\)(?=\.[^./]+$)/, '').toLowerCase()
  const expected = requestedPath.toLowerCase()
  return normalized === expected || normalized.endsWith(`/${expected}`)
}
