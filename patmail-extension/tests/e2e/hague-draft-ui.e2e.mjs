import assert from 'node:assert/strict'
import { writeFile, unlink, cp } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { createHagueFixture } from './support/hague-fixture.mjs'
import { resultPath } from './support/paths.mjs'

// UI integration only: all external requests are denied; every destination reply is synthetic.
const fixture=await createHagueFixture({designCount:2})
const server=await createServer({server:{host:'127.0.0.1',port:0}})
await server.listen()
const browser=await chromium.launch({executablePath:process.env.HAGUE_TEST_CHROME,headless:true})
const context=await browser.newContext({viewport:{width:1440,height:1000}})
await context.route(/^https?:/,route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort())
try{
 const page=await context.newPage()
 const jpeg=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=10;c.height=10;c.getContext('2d').fillRect(0,0,10,10);return c.toDataURL('image/jpeg').split(',')[1]})
 for(const n of [1,2])for(let i=1;i<=8;i++){await writeFile(path.join(fixture.root,'PO2631874HAGUE',`${n}.${i}.jpg`),Buffer.from(jpeg,'base64'));await unlink(path.join(fixture.root,'PO2631874HAGUE',`${n}.${i}.png`))}
 await page.addInitScript(()=>{
  const applicant={name:'Example Ltd.',address:'No. 1, Nanshan District',city:'Shenzhen',region:'Guangdong',postalCode:'518000',country:'China'}
  const source=JSON.stringify({GetCaseApplicant:[{TableRows:[{applicant_name_en:applicant.name,contact_address_en:applicant.address,city:'深圳市',province:'广东省',postcode:'518000',country_zh_cn:'中国'},{applicant_name_en:'Second Ltd.',contact_address_en:'No. 2, Xuhui District, Shanghai',city:'徐汇区',province:'上海市',postcode:'200233',country_zh_cn:'中国'}]}],GetCaseInventor:[{TableRows:[{inventor_name_cn:'张三'},{inventor_name_cn:'陈丽偲',first_name_en:'Lisi',last_name_en:'CHEN',inventor_name_en:'Lisi CHEN'}]}],GetCaseInfo:[{CaseInfo:[{remark:'海牙指定欧盟、日本；公开情况：6个月'}]}]})
  const commands=[],storage={},destinations=new Map([[7,'portfolio']]);let nextTab=100
  window.__draftCommands=commands
  window.__draftStorage=storage
  Object.assign(window.chrome??(window.chrome={}),{runtime:{id:'fixture',lastError:null,onMessage:{addListener(){},removeListener(){}},sendMessage(message,callback){
   if(message.channel==='patmail-call')message=message.message
   if(message.channel==='PATMAIL_HAGUE_SESSION'){
    if(message.action==='listTabs')callback({ok:true,tabs:[{id:7,title:'WIPO fixture'}]})
    else callback({ok:true,session:{tabId:message.tabId??7,title:'WIPO fixture',documentId:'doc',verifiedAt:Date.now(),expiresAt:Date.now()+300000}})
   }else if(message.type==='WORKSPACE'){
    const input=JSON.parse(source);if(window.__unsupportedApplicant)input.GetCaseApplicant[0].TableRows[0].applicant_type='自然人'
    callback({type:'WORKSPACE_RESULT',payload:{ok:true,message:'fixture',connection:{easyOrigin:'http://183.36.43.66:88',easyTabId:1,operatorId:'test',lastOperatorId:'test',sessionStatus:'authenticated',lastCheckedAt:'',displayName:'test',message:'',connectionVersion:1},tabs:[],customers:[],templates:[],rules:null,tasks:[],appTab:null,forwarded:{type:'READ_HAGUE_CASE_RESULT',payload:{text:JSON.stringify(input)}}}})
   }
   else if(message.channel==='PATMAIL_HAGUE_DRAFT'){
    const command=message.command;commands.push({...command,tabId:message.tabId,base64:command.base64?'omitted':undefined})
    if(command.op==='create'||command.op==='backToApplication')destinations.set(message.tabId,'application')
    if(command.op==='summary')destinations.set(message.tabId,'summary')
    if(command.op==='saveDraft')destinations.set(message.tabId,'portfolio')
    const destination=destinations.get(message.tabId)??'portfolio'
    setTimeout(()=>callback({ok:true,page:destination,documentId:'doc',draftSaved:destination==='portfolio'&&!!message.reference,...(destination==='portfolio'?{}:{reference:message.tabId===7?'123':String(message.tabId)}),...(command.op==='print'?{downloadId:42}:{})}),10)
   }
  }},storage:{local:{get:async key=>({[key]:storage[key]}),set:async value=>Object.assign(storage,value)}},downloads:{show(){}},tabs:{create:()=>{const id=nextTab++;destinations.set(id,'portfolio');return Promise.resolve({id})},get:id=>Promise.resolve({id,status:'complete',url:'https://hague.wipo.int/HagueEFilingWeb/protected/portfolioManager.xhtml'}),onUpdated:{addListener(){},removeListener(){}},onRemoved:{addListener(){},removeListener(){}}}})
  window.addEventListener('patmail-agent-workflow',event=>{const job=event.detail;job.accepted=true;const refs=[...job.message.matchAll(/^案件文号：(.+)$/gm)].map(m=>m[1]);job.resolve(JSON.stringify({results:refs.map(caseVolume=>({caseVolume,decision:{applicant,creators:[{sourceName:'张三',givenName:'san',familyName:'zhang'}],parties:['EM','JP'],publicationMonths:6,priorities:[],warnings:[],evidence:['fixture']}}))}))})
 })
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/e2e/hague-harness.html`)
 // 空状态卡片：平时提示可拖入，拖着文件夹经过时高亮并改写文案。
 const dropZone=page.locator('.hague-empty')
 assert.match(await dropZone.innerText(),/也可以把总文件夹直接拖到这里/)
 await page.evaluate(()=>{
  const zone=document.querySelector('.hague-page')
  const transfer=new DataTransfer();transfer.items.add(new File([''],'placeholder.docx'))
  for(const type of ['dragenter','dragover'])zone.dispatchEvent(new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer:transfer}))
 })
 await page.locator('.hague-page.is-dragging').waitFor()
 assert.match(await dropZone.innerText(),/松手即可导入这个文件夹/)
 await dropZone.screenshot({path:resultPath('hague-drop-zone.png')})
 await page.evaluate(()=>document.querySelector('.hague-page').dispatchEvent(new DragEvent('dragleave',{bubbles:true,cancelable:true,dataTransfer:new DataTransfer()})))
 await page.locator('.hague-page.is-dragging').waitFor({state:'detached'})
 const concurrencySelect=page.getByRole('combobox',{name:'草稿并发路数',exact:true})
 const transportSelect=page.getByRole('combobox',{name:'草稿填写方式',exact:true})
 assert.match(await concurrencySelect.innerText(),/6 路/)
 assert.equal((await transportSelect.innerText()).trim(),'接口链')
 assert.doesNotMatch(await page.locator('.hague-page').innerText(),/试运行/)
 await transportSelect.click()
 await page.getByRole('option',{name:'页面填写',exact:true}).click()
 await page.getByLabel('选择海牙申请总文件夹').setInputFiles(fixture.root)
 await page.getByText('等待 eHague 登录验证',{exact:false}).first().waitFor()
 await page.getByRole('button',{name:'连接并检测登录',exact:true}).click()
 const create=page.getByRole('button',{name:'填写并保存本案草稿',exact:true})
 await create.waitFor();assert.equal(await create.isEnabled(),true)
 await create.click()
 await page.getByRole('button',{name:'草稿已保存',exact:true}).waitFor({timeout:30000})
 const commands=await page.evaluate(()=>window.__draftCommands)
 const upload=commands.filter(c=>c.op==='upload')
 assert.equal(upload.length,16)
 assert.deepEqual(upload.map(c=>c.name),[1,2].flatMap(n=>Array.from({length:8},(_,i)=>`${n}.${i+1}.jpg`)))
 assert.deepEqual(commands.filter(c=>c.op==='applicant').map(c=>({index:c.index,name:c.data.name})),[{index:0,name:'Example Ltd.'},{index:1,name:'Second Ltd.'}])
 assert.deepEqual(commands.filter(c=>c.op==='design').map(c=>({index:c.index,product:c.product})),[{index:0,product:'Preview fixture 1'},{index:1,product:'Preview fixture 2'}])
 assert.equal(commands.filter(c=>c.op==='closeDesign').length,2)
 const firstSave=commands.findIndex(c=>c.op==='closeDesign'),secondAdd=commands.findIndex(c=>c.op==='design'&&c.index===1)
 assert.ok(firstSave<secondAdd,'first design must be saved before the second Add design')
 assert.equal(commands.filter(c=>c.op==='upload'&&c.count===0).length,2,'each design has its own upload counter')
 assert.equal(commands.find(c=>c.op==='design').subclass,'3')
 assert.equal(commands.filter(c=>c.op==='create').length,1)
 assert.equal(commands.filter(c=>c.op==='signature').length,1)
 assert.deepEqual(commands.filter(c=>c.op==='creator').map(c=>`${c.givenName} ${c.familyName}`),['San ZHANG','Lisi CHEN'])
 assert.match(await page.locator('.hague-result-grid').innerText(),/AI 拼音转写（张三）/)
 assert.equal(commands.some(c=>/pay|submit/i.test(c.op)),false)
 assert.match(await page.locator('.hague-draft').innerText(),/123/)
 assert.equal(await page.locator('.test-top-actions [role=progressbar]').getAttribute('aria-valuenow'),'100')
 assert.equal(await page.locator('.hague-page [role=progressbar]').count(),0)
 await page.screenshot({path:resultPath('hague-draft-ui.png'),fullPage:true})
 await page.getByRole('button',{name:'我知道了',exact:true}).click()
 for(let i=1;i<=7;i++)await cp(path.join(fixture.root,'PO2631874HAGUE'),path.join(fixture.root,`PO260000${i}HAGUE`),{recursive:true})
 await page.getByLabel('选择海牙申请总文件夹').setInputFiles(fixture.root)
 await page.waitForFunction(()=>document.querySelectorAll('.hague-cases button').length===8&&document.body.innerText.includes('成功 8'))
 assert.match(await concurrencySelect.innerText(),/6 路/)
 const beforeBatch=await page.evaluate(()=>window.__draftCommands.length)
 await page.getByRole('button',{name:'批量填写并存草稿',exact:true}).click()
 await page.locator('.hague-status').filter({hasText:'草稿批次已结束：成功 7，异常 0，跳过 0。'}).waitFor({timeout:45000})
 const batchCommands=await page.evaluate(n=>window.__draftCommands.slice(n),beforeBatch)
 assert.equal(batchCommands.filter(c=>c.op==='create').length,7)
 assert.equal(new Set(batchCommands.map(c=>c.tabId)).size,6)
 assert.equal(batchCommands.filter(c=>c.op==='upload').length,7*16)
 assert.equal(batchCommands.filter(c=>c.op==='saveDraft').length,7)
 assert.equal(new Set(batchCommands.filter(c=>c.op==='signature').map(c=>c.reference)).size,7)
 const firstSaveIndex=batchCommands.findIndex(c=>c.op==='saveDraft')
 assert.equal(batchCommands.slice(0,firstSaveIndex).filter(c=>c.op==='create').length,6,'six cases must start before any is saved')
 assert.equal(await page.locator('.test-top-actions [role=progressbar]').getAttribute('aria-valuenow'),'100')
 await page.getByRole('button',{name:'我知道了',exact:true}).click()
 await page.evaluate(()=>{for(const key of Object.keys(window.__draftStorage))delete window.__draftStorage[key];window.__unsupportedApplicant=true})
 await page.getByLabel('选择海牙申请总文件夹').setInputFiles(fixture.root)
 await page.waitForFunction(()=>!document.querySelector('.hague-page button.solid')?.disabled&&document.querySelectorAll('.hague-cases button').length===8&&document.body.innerText.includes('成功 8'))
 const beforeSkipped=await page.evaluate(()=>window.__draftCommands.length)
 await page.getByRole('button',{name:'批量填写并存草稿',exact:true}).click()
 await page.locator('.hague-status').filter({hasText:'草稿批次已结束：成功 0，异常 0，跳过 8。请在各案查看原因及原站现场。'}).waitFor()
 assert.equal(await page.locator('.hague-cases button').filter({hasText:'暂未填写，查看原因'}).count(),8)
 assert.equal(await page.evaluate(()=>window.__draftCommands.length),beforeSkipped)
 console.log('Hague UI: single/multi-lane drafts, 112 images, independent receipts and skipped-material labels passed; no external writes')
}finally{await context.close();await browser.close();await server.close();await fixture.cleanup()}
