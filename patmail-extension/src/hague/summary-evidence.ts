import {sha256Hex} from '../automation/sha256'
/** Store only a digest. Canonical fields, image identities and order must match
 * the Summary confirmed before closing; transient JSF controls are excluded. */
export function summaryEvidenceKey(doc:Document):string{
 const body=doc.body.cloneNode(true) as HTMLElement
 for(const node of body.querySelectorAll('script,style,noscript,input,button,select,textarea,iframe'))node.remove()
 const text=(doc.title+' '+body.textContent).normalize('NFKC').replace(/\s+/g,' ').trim()
 const images=[...body.querySelectorAll('img')].map(img=>[img.getAttribute('src')??'',img.getAttribute('alt')??''])
 return'sha256:'+sha256Hex(JSON.stringify({text,images}))
}
