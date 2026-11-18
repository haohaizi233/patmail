import { expect,it } from 'vitest'
import { sanitizeSummaryCss } from '../../../src/hague/summary-css'
it('removes external URLs and imports from embedded styles as well as fetched sheets',()=>{
 const css='@import url("https://example.com/fonts.css"); @font-face {src:url("https://example.com/font.woff")} .a{background:url(/remote.png)} .b{background:url(data:image/png;base64,AA==)}'
 const safe=sanitizeSummaryCss(css)
 expect(safe).not.toMatch(/https?:|@import|\/remote/)
 expect(safe).toContain('url(data:image/png;base64,AA==)')
})
