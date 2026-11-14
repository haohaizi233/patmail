import {parse} from '@babel/parser'
const HALT=Symbol('return'),UNKNOWN=Symbol('dynamic'), cache=new Map()
const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return (h>>>0).toString(16).padStart(8,'0')}
const limits={maxSourceBytes:262144,maxNodes:30000,maxDepth:100,maxTimeMs:100,maxDecodeDepth:2}
const path=n=>n?.type==='Identifier'?n.name:n?.type==='MemberExpression'&&!n.computed?`${path(n.object)}.${n.property.name}`:''
function run(source,options={},execution=false){
 const o={...limits,...options},start=Date.now(),calls=[],actions=[],unresolved=new Set();let nodes=0
 for(const k of Object.keys(limits))o[k]=Math.max(0,Math.min(limits[k],Number(o[k])||0))
 const guard=d=>{if(nodes++>=o.maxNodes)throw Error('node_limit');if(d>o.maxDepth)throw Error('depth_limit');if(Date.now()-start>o.maxTimeMs)throw Error('time_limit')}
 function value(n,env,d=0){
  guard(d);if(!n)return UNKNOWN
  if(['StringLiteral','BooleanLiteral','NumericLiteral','NullLiteral'].includes(n.type))return n.value??null
  if(n.type==='ThisExpression')return options.elementId??UNKNOWN
  if(n.type==='Identifier')return env.has(n.name)?env.get(n.name):UNKNOWN
  if(n.type==='TemplateLiteral'){let s=n.quasis[0].value.cooked??'';for(let i=0;i<n.expressions.length;i++){const v=value(n.expressions[i],env,d+1);if(v===UNKNOWN||typeof v==='object')return UNKNOWN;s+=String(v)+(n.quasis[i+1].value.cooked??'')}return s}
  if(n.type==='BinaryExpression'&&n.operator==='+'){const a=value(n.left,env,d+1),b=value(n.right,env,d+1);return a===UNKNOWN||b===UNKNOWN||typeof a==='object'||typeof b==='object'?UNKNOWN:a+b}
  if(n.type==='ConditionalExpression'){const t=value(n.test,env,d+1);return t===UNKNOWN?UNKNOWN:value(t?n.consequent:n.alternate,env,d+1)}
  if(n.type==='ObjectExpression'){const obj=Object.create(null);for(const p of n.properties){if(p.type!=='ObjectProperty'||p.computed)return UNKNOWN;const k=p.key.name??p.key.value;obj[k]=value(p.value,env,d+1)}return obj}
  if(n.type==='ArrayExpression')return n.elements.map(e=>value(e,env,d+1))
  if(n.type==='MemberExpression'){const obj=value(n.object,env,d+1),key=n.computed?value(n.property,env,d+1):n.property.name;return obj!==UNKNOWN&&obj!==null&&typeof obj==='object'&&Object.hasOwn(obj,key)?obj[key]:UNKNOWN}
  if(n.type==='CallExpression'){
   const name=path(n.callee);if(env.has(name.split('.')[0]))return UNKNOWN;const args=n.arguments.map(a=>value(a,env,d+1));if(args.some(a=>a===UNKNOWN))return UNKNOWN
   try{if(name==='atob'&&typeof args[0]==='string'&&args[0].length<=32768)return atob(args[0]);if(name==='String.fromCharCode'&&args.length<=4096&&args.every(a=>Number.isInteger(a)&&a>=0&&a<=65535))return String.fromCharCode(...args)}catch{}
  }
  return UNKNOWN
 }
 function analyze(text,decodeDepth=0,baseEnv=new Map(),invoke=false){
  if(text.length>o.maxSourceBytes){unresolved.add('source_limit');return}
  let ast;try{ast=parse(text,{sourceType:'unambiguous',allowReturnOutsideFunction:true})}catch{unresolved.add('parse_error');return}
  const env=new Map(baseEnv),functions=new Map(),aliases=new Map()
  function inspectFunction(f,name,d){
   const saved=new Map(env),savedAliases=new Map(aliases)
   for(const p of f.params??[])if(p.type==='Identifier'){env.set(p.name,UNKNOWN);aliases.delete(p.name)}
   env.set('arguments',UNKNOWN);visit(f.body,d+1,name,false)
   env.clear();for(const [k,v]of saved)env.set(k,v);aliases.clear();for(const [k,v]of savedAliases)aliases.set(k,v)
  }
  function visit(n,d=0,fn='',active=true){
   if(!n)return;guard(d)
   if(n.type==='Program'){for(const child of n.body){const result=visit(child,d+1,fn,active);if(execution&&result===HALT)return HALT}return}
   if(execution&&n.type==='ReturnStatement'){visit(n.argument,d+1,fn,active);return HALT}
   if(n.type==='BlockStatement'){const saved=new Map(env),savedAliases=new Map(aliases),savedFunctions=new Map(functions);let result;for(const child of n.body){result=visit(child,d+1,fn,active);if(execution&&result===HALT)break}env.clear();for(const [k,v]of saved)env.set(k,v);aliases.clear();for(const [k,v]of savedAliases)aliases.set(k,v);functions.clear();for(const [k,v]of savedFunctions)functions.set(k,v);return result}

   if(execution&&['FunctionExpression','ArrowFunctionExpression','ObjectMethod','ClassMethod','ClassPrivateMethod'].includes(n.type))return
   if(execution&&active&&['ClassDeclaration','ClassExpression','ThrowStatement','LabeledStatement','ForInStatement','ForOfStatement','WithStatement','BreakStatement','ContinueStatement','AwaitExpression','YieldExpression','UpdateExpression','IfStatement','ConditionalExpression','LogicalExpression','ForStatement','WhileStatement','DoWhileStatement','SwitchStatement','TryStatement'].includes(n.type)){unresolved.add('conditional_control');return}
   if(n.type==='FunctionDeclaration'){functions.set(n.id.name,n);if(!execution&&!invoke)inspectFunction(n,n.id.name,d);return}
   if(n.type==='VariableDeclaration'&&n.kind!=='const'){if(execution)unresolved.add('mutable_binding');for(const dec of n.declarations){if(dec.id.type==='Identifier')env.set(dec.id.name,UNKNOWN);else if(dec.id.type==='ObjectPattern'){for(const p of dec.id.properties)if(p.value?.type==='Identifier')env.set(p.value.name,UNKNOWN)}if(!execution)visit(dec.init,d+1,fn,active)}return}
   if(n.type==='VariableDeclarator'&&n.id.type==='Identifier'){
    if(['FunctionExpression','ArrowFunctionExpression'].includes(n.init?.type)){functions.set(n.id.name,n.init);if(!execution&&!invoke)inspectFunction(n.init,n.id.name,d);return}
    env.set(n.id.name,value(n.init,env));const alias=path(n.init);if(alias)aliases.set(n.id.name,aliases.get(alias)??alias)
   }
   if(n.type==='VariableDeclarator'&&n.id.type==='ObjectPattern'){
    const initVal=value(n.init,env)
    for(const p of n.id.properties){
     if(p.type==='ObjectProperty'&&p.key?.name&&p.value?.type==='Identifier'){
      const k=p.key.name,vName=p.value.name
      if(initVal!==UNKNOWN&&initVal!==null&&typeof initVal==='object'&&Object.hasOwn(initVal,k))env.set(vName,initVal[k])
      else env.set(vName,UNKNOWN)
     }
    }
   }
   if(n.type==='AssignmentExpression'&&n.left.type!=='Identifier'){if(execution)unresolved.add('mutation');const root=path(n.left).split('.')[0];env.set(root,UNKNOWN);return}
   if(n.type==='AssignmentExpression'&&n.left.type==='Identifier'){
    if(['FunctionExpression','ArrowFunctionExpression'].includes(n.right.type)){functions.set(n.left.name,n.right);if(!execution&&!invoke)inspectFunction(n.right,n.left.name,d);return}
    // Mutable bindings are never treated as constants.
    env.set(n.left.name,UNKNOWN);aliases.delete(n.left.name)
   }
   if(n.type==='CallExpression'||n.type==='NewExpression'){
    const raw=path(n.callee),name=aliases.get(raw)??(env.has(raw.split('.')[0])?'':raw),args=n.arguments
    // Verified eHague save confirmation: a loading-only callback followed by one AJAX callback.
    // bcn stops on false; never flatten arbitrary callback arrays or ignore cancellation guards.
    if(execution&&active&&name==='PrimeFaces.bcn'){
     const callbacks=args[2]?.type==='ArrayExpression'?args[2].elements:null
     const validFunction=f=>f?.type==='FunctionExpression'&&!f.async&&!f.generator&&f.params.length===1&&f.params[0].type==='Identifier'&&f.params[0].name==='event'
     const prefix=callbacks?.[0]?.body?.body,load=prefix?.[0]?.expression,last=callbacks?.[1]?.body?.body,request=last?.[0]?.expression
     const valid=raw==='PrimeFaces.bcn'&&args.length===3&&args[0].type==='ThisExpression'&&args[1].type==='Identifier'&&args[1].name==='event'&&callbacks?.length===2&&callbacks.every(validFunction)
      &&prefix.length===1&&prefix[0].type==='ExpressionStatement'&&load?.type==='CallExpression'&&path(load.callee)==='showBlockUIOnSend'&&load.arguments.length===1&&load.arguments[0].type==='StringLiteral'&&load.arguments[0].value===''&&!env.has('showBlockUIOnSend')&&!functions.has('showBlockUIOnSend')&&!aliases.has('showBlockUIOnSend')
      &&last.length===2&&last[0].type==='ExpressionStatement'&&request?.type==='CallExpression'&&path(request.callee)==='PrimeFaces.ab'&&last[1].type==='ReturnStatement'&&last[1].argument?.type==='BooleanLiteral'&&last[1].argument.value===false
     if(!valid){unresolved.add('unsupported_callback_chain');return}
     visit(callbacks[1].body,d+1,fn,active);return
    }
    // Detached protocol execution never runs UI helpers. Ignore only literal PF widget visibility calls.
    // Keep unknown methods, arguments, computed access and shadowed helpers fail-closed.
    const ui=n.callee,widget=ui.type==='MemberExpression'&&!ui.computed?ui.object:null
    if(execution&&active&&n.type==='CallExpression'&&widget?.type==='CallExpression'&&widget.callee.type==='Identifier'&&widget.callee.name==='PF'&&!env.has('PF')&&!functions.has('PF')&&!aliases.has('PF')&&['show','hide'].includes(ui.property.name)&&args.length===0&&widget.arguments.length===1&&widget.arguments[0].type==='StringLiteral'&&/^[A-Za-z_$][A-Za-z0-9_$]{0,119}$/.test(widget.arguments[0].value))return

    if(functions.has(name)&&active){const f=functions.get(name);if(f.generator||f.async){unresolved.add('unsupported_function_kind');return}const local=new Map(env),vals=args.map(a=>value(a,env));f.params.forEach((p,i)=>{if(p.type==='Identifier')local.set(p.name,vals[i]??UNKNOWN)});local.set('arguments',vals)
     const savedAliases=new Map(aliases);for(const p of f.params)if(p.type==='Identifier')aliases.delete(p.name);const saved=new Map(env);for(const [k,v] of local)env.set(k,v);visit(f.body,d+1,name,true);env.clear();for(const [k,v] of saved)env.set(k,v);aliases.clear();for(const [k,v] of savedAliases)aliases.set(k,v);return}
    if(execution&&active&&!functions.has(name)&&!['PrimeFaces.ab','mojarra.ab','jsf.ajax.request','mojarra.jsfcljs','PrimeFaces.cw'].includes(name))unresolved.add('unsupported_call')
    if(['PrimeFaces.ab','mojarra.ab','jsf.ajax.request','mojarra.jsfcljs','PrimeFaces.cw'].includes(name)){
     let cfg={},pa,full=false,widget={}
     if(name==='PrimeFaces.ab'){const v=value(args[0],env);cfg=v===UNKNOWN?{source:UNKNOWN}:{source:v.s??v.source,form:v.f??v.form,process:v.p??v.process,update:v.u??v.update,event:v.e??v.event};pa=v.pa}
     if(name==='mojarra.ab')cfg={source:value(args[0],env),event:value(args[2],env),process:value(args[3],env),update:value(args[4],env)}
     if(name==='jsf.ajax.request'){const v=value(args[2],env);cfg={source:value(args[0],env),process:v.execute,update:v.render,event:v.event}}
     if(name==='mojarra.jsfcljs'){const v=value(args[1],env);const keys=v!==UNKNOWN&&v?Object.keys(v):[];cfg={source:keys.length===1?keys[0]:UNKNOWN,form:options.formId};full=true}
     if(name==='PrimeFaces.cw'){const v=value(args[2],env);cfg={componentId:v.id,process:v.process,update:v.update};const type=value(args[0],env);if(['FileUpload','DataTable'].includes(type))widget.widgetType=type;if(v.paginator&&typeof v.paginator==='object')widget.paginator=Object.fromEntries(['rows','rowCount','page'].filter(k=>Number.isSafeInteger(v.paginator[k])&&v.paginator[k]>=0).map(k=>[k,v.paginator[k]]))}
     const reasons=Object.entries(cfg).filter(([,v])=>v===UNKNOWN).map(([k])=>`${k}:dynamic`)
     const params=Object.create(null)
     if(pa!==undefined){if(Array.isArray(pa)&&pa.every(p=>p&&typeof p.name==='string'&&['string','number','boolean'].includes(typeof p.value))){for(const p of pa)params[p.name]=String(p.value)}else reasons.push('parameters:dynamic')}
     calls.push({kind:name,sourceLayer:decodeDepth,...widget,...Object.fromEntries(Object.entries(cfg).filter(([,v])=>typeof v==='string')),parameterNames:Object.keys(params),locationAnchors:[n.callee.loc?.start,n.callee.type==='MemberExpression'?n.callee.property.loc?.start:undefined].filter(Boolean).map(p=>({line:p.line,column:p.column})),location:{line:n.loc.start.line,column:n.loc.start.column},functionName:fn||undefined,confidence:reasons.length?'unresolved':'static',unresolvedReasons:reasons})
     // Definitions can yield a validated static action without invoking callbacks. Unknown pa is permitted only in a definition; actual wrapper invocation must resolve it.
     if(execution&&active&&name!=='PrimeFaces.cw'&&typeof cfg.source==='string'&&Object.values(cfg).every(v=>v===undefined||typeof v==='string')&&(!reasons.length||(!active&&reasons.every(r=>r==='parameters:dynamic'))))actions.push({_active:active,...Object.fromEntries(Object.entries(cfg).filter(([,v])=>v!==undefined)),...(full?{full:true}:{}),...(Object.keys(params).length?{params}:{}),_kind:name,_line:n.loc.start.line,_column:n.loc.start.column})
    }
    if(['eval','Function','setTimeout','setInterval'].includes(name)||['appendChild','insertBefore','append','write'].some(k=>name.endsWith('.'+k))){
     const v=value(args[name==='Function'?args.length-1:0],env);calls.push({kind:name,sourceLayer:decodeDepth,location:{line:n.loc.start.line,column:n.loc.start.column},parameterNames:[],confidence:typeof v==='string'?'static':'unresolved',unresolvedReasons:typeof v==='string'?[]:['dynamic_code']})
     if(typeof v==='string'&&['eval','Function','setTimeout','setInterval'].includes(name)){if(decodeDepth<o.maxDecodeDepth)analyze(v,decodeDepth+1);else unresolved.add('decode_depth_limit')}else unresolved.add('dynamic_code')
    }
   }
   for(const key of Object.keys(n).filter(k=>!['loc','start','end','extra','leadingComments','innerComments','trailingComments'].includes(k))){const child=n[key];for(const c of Array.isArray(child)?child:[child])if(c?.type)visit(c,d+1,fn,active)}
  }
  // A conservative binding audit prevents hoist/reassignment guesses. Duplicate names
  // across nested scopes are unsupported rather than interpreted as global state.
  if(execution){
   const bindings=new Set(),pending=[ast]
   while(pending.length){const node=pending.pop();guard(0)
    const binding=node.type==='FunctionDeclaration'?node.id:node.type==='VariableDeclarator'?node.id:node.type==='AssignmentExpression'?node.left:null
    if(binding?.type==='Identifier'&&['PF','showBlockUIOnSend'].includes(binding.name)){unresolved.add('shadowed_ui_helper');return}
    if(binding?.type==='Identifier'){if(bindings.has(binding.name)){unresolved.add('duplicate_binding');return}bindings.add(binding.name)}
    for(const key of Object.keys(node)){if(['loc','extra','leadingComments','trailingComments','innerComments'].includes(key))continue;const child=node[key];for(const c of Array.isArray(child)?child:[child])if(c?.type)pending.push(c)}
   }
  }
  // Only declarations are hoisted. Assignment wrappers become callable on visit.
  for(const n of ast.program.body)if(n.type==='FunctionDeclaration')functions.set(n.id.name,n)

  visit(ast)
 }
 try{analyze((options.definitions?options.definitions+'\n':'')+source)}catch(e){unresolved.add(['node_limit','depth_limit','time_limit'].includes(e.message)?e.message:'analysis_error')}
 return {calls,actions,scriptHash:hash(source),unresolved:[...unresolved],fingerprint:hash(JSON.stringify(calls.map(c=>[c.kind,c.source,c.form,c.process,c.update,c.parameterNames]))),stats:{nodes,durationMs:Date.now()-start}}
}
// Public reports contain identifiers only; unknown strings are redacted at this boundary.
const safe=s=>typeof s==='string'&&/^(?:@(?:this|all|none|form)|(?:designForm|Designationform|ApplicantForm|CreatorForm|PriorityForm|DescriptionForm|PublicationForm|headerForm|quickSearchPanel|portfolio|locarnoClassForm|signForm)(?::[A-Za-z0-9_:-]+)?)(?:\s+(?:@[a-z]+|[A-Za-z][A-Za-z0-9_:-]*))*$/.test(s)?s:'[redacted]'
export function analyzeJavaScript(source,options={}){
 const definitions=options.definitions??'';if(source.length>limits.maxSourceBytes||definitions.length>limits.maxSourceBytes)return {calls:[],unresolved:['source_limit'],scriptHash:hash(source.slice(0,limits.maxSourceBytes)),fingerprint:hash('source_limit'),stats:{nodes:0,durationMs:0}};const key=JSON.stringify([hash(source),source.length,hash(definitions),definitions.length,...Object.keys(limits).map(k=>Math.max(0,Math.min(limits[k],Number(options[k]??limits[k])||0))),hash(options.elementId??''),hash(options.formId??'')]);if(cache.has(key))return structuredClone(cache.get(key))
 const r=run(source,options);delete r.actions
 for(const c of r.calls){for(const k of ['source','form','process','update','componentId'])if(c[k])c[k]=safe(c[k]);if(c.event&&!['change','click','blur','keyup','valueChange','action'].includes(c.event))c.event='[redacted]';c.parameterNames=c.parameterNames.map(s=>/^[A-Za-z][A-Za-z0-9_:.-]{0,80}$/.test(s)?s:'[redacted]');if(c.functionName&&!/^(selectOffice|processFile|refreshOptionsUI|refreshDesignUI|refreshDesignationUI)$/.test(c.functionName))c.functionName='[function]'}
 if(cache.size>=16)cache.delete(cache.keys().next().value);cache.set(key,r);return structuredClone(r)
}
export function extractStaticActions(source,options={}){const r=run(source,options,true);return r.unresolved.length?[]:r.actions.filter(a=>a._active).map(({_active,...a})=>a)}

export function extractJsfCallIR(source,options={}){
 const res=analyzeJavaScript(source,options)
 return (res.calls||[]).map(c=>{
  const processList=typeof c.process==='string'&&c.process?c.process.split(/\s+/).filter(Boolean):[]
  const updateList=typeof c.update==='string'&&c.update?c.update.split(/\s+/).filter(Boolean):[]
  const staticConfidence=c.confidence==='static'?'static':c.confidence==='unresolved'?'unresolved':'partial'
  return {
   callType:c.kind||'unknown',
   sourceLocation:c.location||{},
   sourceComponent:c.source,
   form:c.form,
   process:processList,
   update:updateList,
   event:c.event,
   parameterNames:c.parameterNames||[],
   staticConfidence,
   unresolvedReasons:c.unresolvedReasons||[]
  }
 })
}

export function clearAstCache(){cache.clear()}

/** Only literal PrimeFaces widget visibility and return false; never execute handler code. */
export function isStaticUiHandler(source){
 if(typeof source!=='string'||source.length>4096)return false
 try{
  const body=parse(source,{sourceType:'script',allowReturnOutsideFunction:true}).program.body
  return body.length>0&&body.every(n=>{
   if(n.type==='EmptyStatement')return true
   if(n.type==='ReturnStatement')return n.argument?.type==='BooleanLiteral'&&n.argument.value===false
   if(n.type!=='ExpressionStatement'||n.expression.type!=='CallExpression')return false
   const call=n.expression,member=call.callee,widget=member.type==='MemberExpression'&&!member.computed?member.object:null
   return call.arguments.length===0&&['show','hide'].includes(member.property?.name)&&widget?.type==='CallExpression'&&widget.callee.type==='Identifier'&&widget.callee.name==='PF'&&widget.arguments.length===1&&widget.arguments[0].type==='StringLiteral'&&/^[A-Za-z_$][A-Za-z0-9_$]{0,119}$/.test(widget.arguments[0].value)
  })
 }catch{return false}
}

/** Resolve one explicit remote binding; unrelated initializers are never executed or interpreted. */
export function selectRemoteDefinition(sources,name){
 if(!['selectOffice','processFile','refreshOptionsUI','refreshDesignUI','refreshDesignationUI'].includes(name)||!Array.isArray(sources)||sources.length>256)return undefined
 let selected,invalid=false,nodes=0,total=0;const started=Date.now()
 const targets=(n,depth=0)=>{
  if(!n)return false
  if(depth>limits.maxDepth){invalid=true;return true}
  if(n.type==='Identifier')return n.name===name
  if(n.type==='MemberExpression')return n.property?.name===name||n.property?.value===name
  if(n.type==='ObjectPattern')return n.properties.some(p=>targets(p.type==='RestElement'?p.argument:p.value,depth+1))
  if(n.type==='ArrayPattern')return n.elements.some(e=>targets(e,depth+1))
  if(n.type==='AssignmentPattern')return targets(n.left,depth+1)
  if(n.type==='RestElement')return targets(n.argument,depth+1)
  return false
 }
 for(const source of sources){
  if(typeof source!=='string')return undefined
  total+=source.length;if(total>2097152)return undefined
  if(!source.includes(name))continue
  if(source.length>limits.maxSourceBytes)return undefined
  let ast;try{ast=parse(source,{sourceType:'unambiguous',allowReturnOutsideFunction:true})}catch{return undefined}
  const top=new Set(ast.program.body)
  const record=n=>{if(selected!==undefined)invalid=true;else selected=source.slice(n.start,n.end)+';'}
  const visit=(n,parent,depth=0)=>{
   if(!n?.type||invalid)return
   if(++nodes>limits.maxNodes||depth>limits.maxDepth||Date.now()-started>limits.maxTimeMs){invalid=true;return}
   if(n.type==='FunctionDeclaration'&&n.id?.name===name){if(top.has(n)&&!n.async&&!n.generator)record(n);else invalid=true}
   if(n.type==='VariableDeclarator'&&targets(n.id))invalid=true
   if(n.type==='AssignmentExpression'&&targets(n.left)){
    if(n.operator==='='&&n.left.type==='Identifier'&&parent?.type==='ExpressionStatement'&&top.has(parent)&&n.right.type==='FunctionExpression'&&!n.right.async&&!n.right.generator)record(parent)
    else invalid=true
   }
   if((n.type==='UpdateExpression'||n.type==='UnaryExpression'&&n.operator==='delete')&&targets(n.argument))invalid=true
   for(const key of Object.keys(n).filter(k=>!['loc','start','end','extra','leadingComments','innerComments','trailingComments'].includes(k))){const v=n[key];for(const child of Array.isArray(v)?v:[v])if(child?.type)visit(child,n,depth+1)}
  };visit(ast,null)
 }
 return invalid?undefined:selected
}
