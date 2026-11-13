/** Offline printing must never resolve remote font or background resources. */
export function sanitizeSummaryCss(css:string):string {
  return css.replace(/@import[^;]+;/gi,'').replace(/url\(([^)]+)\)/gi,(_match,s:string)=>s.replace(/["']/g,'').trim().startsWith('data:')?`url(${s})`:'none')
}
