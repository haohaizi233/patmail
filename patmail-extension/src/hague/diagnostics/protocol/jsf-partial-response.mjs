import { SaxesParser } from 'saxes'
import { safeComponentId } from '../schema.mjs'
const MAX_BYTES=256*1024
const viewId=id=>id.length<=200&&/^(?:[A-Za-z0-9_.-]{1,64}:){0,8}(?:javax|jakarta)\.faces\.ViewState(?::\d{1,10})?$/.test(id)
const limit=(value,fallback)=>Number.isSafeInteger(value)&&value>0?Math.min(value,fallback):fallback
function empty(){return {protocolStatus:'valid',xmlParsed:false,parserError:false,jsfError:false,validationFailed:false,redirectDetected:false,updateCount:0,insertCount:0,deleteCount:0,attributeCount:0,evalCount:0,extensionCount:0,unknownNodeCount:0,updatedComponents:[],expectedUpdates:[],viewStatePresent:false,viewStateLength:0,bodyStatus:'body_available'}}
function parseInternal(body,options={},onViewState){
 const out=empty(),fail=(status,code,bodyStatus=status==='invalid_xml'?'body_parse_failed':['unsupported','html'].includes(status)?'body_unsupported':'body_available')=>Object.assign(out,{protocolStatus:status,errorCode:code,bodyStatus})
 let text
 try{text=typeof body==='string'?body:new TextDecoder('utf-8',{fatal:true}).decode(body??new Uint8Array())}catch{return Object.assign(fail('invalid_xml','INVALID_XML'),{parserError:true})}
 if(new TextEncoder().encode(text).byteLength>limit(options.maxBytes,MAX_BYTES))return fail('unsupported','PROTOCOL_UNSUPPORTED','body_too_large')
 if(!text.trim())return fail('empty','EMPTY_RESPONSE')
 const mime=(options.mime??'').split(';')[0].trim().toLowerCase()
 if(/^(?:<!doctype\s+html|<html\b)/i.test(text.trim()))return fail('html','PROTOCOL_UNSUPPORTED')
 if(mime&&!['text/xml','application/xml','application/xhtml+xml'].includes(mime)&&!mime.endsWith('+xml'))return fail('unsupported','INVALID_MIME')
 if(/^[{[]/.test(text.trim()))return fail('unsupported','PROTOCOL_UNSUPPORTED')
 const stack=[],views=[],ids=new Set();let nodes=0,root='',invalid=false
 const known=new Set(['partial-response','changes','update','insert','before','after','delete','attributes','attribute','eval','extension','error','error-name','error-message','redirect'])
 const parser=new SaxesParser({xmlns:true})
 parser.on('error',()=>{invalid=true;throw new Error('invalid_xml')})
 parser.on('doctype',()=>{throw new Error('forbidden_doctype')})
 parser.on('opentag',tag=>{
  if(++nodes>limit(options.maxNodes,30000)||stack.length>=limit(options.maxDepth,100))throw new Error('xml_limit')
  const name=tag.local,attrs=Object.values(tag.attributes),id=attrs.find(a=>a.local==='id')?.value??'',frame={name,id,text:''}
  if(!stack.length)root=name
  stack.push(frame)
  if(!known.has(name))out.unknownNodeCount++
  const key={update:'updateCount',insert:'insertCount',delete:'deleteCount',attributes:'attributeCount',eval:'evalCount',extension:'extensionCount'}[name]
  if(key)out[key]++
  if(name==='error')out.jsfError=true
  if(name==='redirect')out.redirectDetected=true
  if(name==='update'&&viewId(id)){out.viewStatePresent=true}
  else if(['update','before','after','delete','attributes'].includes(name)&&id&&ids.size<120)ids.add(safeComponentId(id))
 })
 const content=value=>{for(let i=stack.length-1;i>=0;i--){const frame=stack[i];if(frame.name==='extension'||(frame.name==='update'&&viewId(frame.id))){frame.text+=value;break}}}
 parser.on('text',content);parser.on('cdata',content)
 parser.on('closetag',()=>{const frame=stack.pop();if(frame.name==='update'&&viewId(frame.id)){out.viewStateLength+=frame.text.length;views.push(frame.text)}if(frame.name==='extension'){try{const extension=JSON.parse(frame.text);if(extension&&typeof extension==='object'&&extension.validationFailed===true)out.validationFailed=true}catch{/* non-JSON extensions carry no validation evidence */}}})
 try{parser.write(text).close()}catch{invalid=true}
 if(invalid)return Object.assign(empty(),{protocolStatus:'invalid_xml',errorCode:'INVALID_XML',parserError:true,bodyStatus:'body_parse_failed'})
 out.xmlParsed=true
 if(root!=='partial-response')return fail('unsupported','PROTOCOL_UNSUPPORTED')
 out.updatedComponents=[...ids];out.expectedUpdates=[...ids]
 if(out.jsfError)fail('jsf_error','JSF_ERROR')
 else if(out.validationFailed)fail('jsf_validation_failed','JSF_VALIDATION_FAILED')
 else if(out.redirectDetected)fail('redirect','JSF_REDIRECT')
 if(views.length&&onViewState)onViewState(views,out)
 return out
}
export function parseJsfPartialResponse(body,options={}){return parseInternal(body,options)}
export function createJsfProtocolAnalyzer(){
 let secret=globalThis.crypto.getRandomValues(new Uint8Array(32)),generation=0;const tags=new Map()
 return {async analyze(body,options={}){let pending;const active=generation;const result=parseInternal(body,options,(views,out)=>{
  if(typeof options.contextKey!=='string'||!options.contextKey||options.contextKey.length>512)return
  pending=(async()=>{const key=await globalThis.crypto.subtle.importKey('raw',secret,{name:'HMAC',hash:'SHA-256'},false,['sign'])
  const tag=new Uint8Array(await globalThis.crypto.subtle.sign('HMAC',key,new TextEncoder().encode(JSON.stringify(views))))
  if(active!==generation)return
  const previous=tags.get(options.contextKey)
  if(previous!==undefined)out.viewStateChanged=previous.some((v,i)=>v!==tag[i])
  tags.delete(options.contextKey);tags.set(options.contextKey,tag)
  if(tags.size>128)tags.delete(tags.keys().next().value)
  })()
 });await pending;return result},clear(){generation++;tags.clear();secret.fill(0);secret=globalThis.crypto.getRandomValues(new Uint8Array(32))}}
}
const standard=new Set(['partial.ajax','source','partial.execute','partial.render','ViewState','ClientWindow','partial.resetValues','behavior.event','partial.event'].flatMap(n=>['javax.faces.'+n,'jakarta.faces.'+n]))
const components=value=>value.split(/\s+/).filter(Boolean).slice(0,30).map(v=>/^@(all|form|this|none)$/.test(v)?v:safeComponentId(v)).join(' ')
export function parseJsfRequest(request={}){
 const mime=String(request.mime??request.contentType??'').toLowerCase(),isUpload=request.isUpload===true||mime.startsWith('multipart/')
 const out={eligibleAjax:false,isUpload,parameterNames:[],requestMetadataStatus:'unsupported',protocolConfidence:'unresolved',unresolvedReasons:[]}
 if(isUpload||mime&&!mime.startsWith('application/x-www-form-urlencoded')){out.requestFamily=isUpload?'multipart':'unsupported';return out}
 const data=request.postData
 if(typeof data!=='string'){out.requestMetadataStatus='unsupported';out.unresolvedReasons.push('missing_post_data');return out}
 if(new TextEncoder().encode(data).byteLength>MAX_BYTES)return {...out,requestMetadataStatus:'too_large',unresolvedReasons:['post_data_too_large']}
 // Bound form allocation and iteration independently of the byte budget.
 let pairs=1
 for(let i=0;i<data.length;i++)if(data[i]==='&'&&++pairs>256)return {...out,requestMetadataStatus:'too_large',unresolvedReasons:['too_many_parameters']}
 const params=new URLSearchParams(data);out.requestMetadataStatus='parsed'
 let javaxCount=0,jakartaCount=0,duplicateCount=0
 const seenKeys=new Set(),unknownKeys=new Set()
 for(const [key,value]of params){
  if(seenKeys.has(key))duplicateCount++
  seenKeys.add(key)
  if(key.startsWith('javax.faces.'))javaxCount++
  else if(key.startsWith('jakarta.faces.'))jakartaCount++
  else if(!standard.has(key))unknownKeys.add(key)
  if(!standard.has(key))continue
  if(!out.parameterNames.includes(key))out.parameterNames.push(key)
  const suffix=key.replace(/^(javax|jakarta)\.faces\./,'')
  if(suffix==='partial.ajax'&&value==='true'){out.eligibleAjax=true;out.ajaxMarkerPresent=true}
  if(suffix==='source')out.sourceComponent=safeComponentId(value)
  if(suffix==='partial.execute'){
   out.process=components(value)
   out.executeComponents=value.split(/\s+/).filter(Boolean).slice(0,30).map(v=>/^@(all|form|this|none)$/.test(v)?v:safeComponentId(v))
  }
  if(suffix==='partial.render'){
   out.update=components(value)
   out.renderComponents=value.split(/\s+/).filter(Boolean).slice(0,30).map(v=>/^@(all|form|this|none)$/.test(v)?v:safeComponentId(v))
  }
  if(suffix==='behavior.event')out.behaviorEvent=value
  else if(suffix==='partial.event'&&!out.behaviorEvent)out.behaviorEvent=value
  if(suffix==='ViewState')out.viewStatePresent=true
 }
 let facesNamespace='unknown'
 if(javaxCount>0&&jakartaCount>0){facesNamespace='mixed';out.unresolvedReasons.push('namespace_conflict')}
 else if(javaxCount>0)facesNamespace='javax'
 else if(jakartaCount>0)facesNamespace='jakarta'
 out.facesNamespace=facesNamespace
 const source=params.get('javax.faces.source')??params.get('jakarta.faces.source')
 if(source?.includes(':'))out.form=safeComponentId(source.split(':')[0])
 out.requestFamily=out.eligibleAjax?'faces_ajax':'form_post'
 out.duplicateParameterCount=duplicateCount
 out.unknownParameterCount=unknownKeys.size
 out.viewStatePresent=out.viewStatePresent??(params.has('javax.faces.ViewState')||params.has('jakarta.faces.ViewState'))
 out.ajaxMarkerPresent=out.ajaxMarkerPresent??false
 out.protocolConfidence=out.unresolvedReasons.length===0&&out.eligibleAjax&&out.sourceComponent?'exact':out.eligibleAjax?'partial':'unresolved'
 return out
}

