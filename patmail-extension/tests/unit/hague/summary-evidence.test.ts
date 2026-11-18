import {expect,it} from 'vitest'
import {summaryEvidenceKey} from '../../../src/hague/summary-evidence'
const doc=(content:string)=>new DOMParser().parseFromString(`<title>WIPO reference 123</title><body>${content}</body>`,'text/html')
it('ignores transient JSF state and scripts but binds saved Summary fields and image identity',()=>{
 const a=doc('<p>Company One Road</p><img src="/DesignServlet?id=1"><input value="old"><script>old()</script>')
 const b=doc('<p>Company   One Road</p><img src="/DesignServlet?id=1"><input value="new"><script>new()</script>')
 expect(summaryEvidenceKey(a)).toMatch(/^sha256:[a-f0-9]{64}$/)
 expect(summaryEvidenceKey(a)).toBe(summaryEvidenceKey(b))
 expect(summaryEvidenceKey(a)).not.toBe(summaryEvidenceKey(doc('<p>Other One Road</p><img src="/DesignServlet?id=1">')))
 expect(summaryEvidenceKey(a)).not.toBe(summaryEvidenceKey(doc('<p>Company One Road</p><img src="/DesignServlet?id=2">')))
})
