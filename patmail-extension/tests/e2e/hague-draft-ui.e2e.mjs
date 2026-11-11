import assert from 'node:assert/strict'
import { writeFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { createHagueFixture } from './support/hague-fixture.mjs'
import { resultPath } from './support/paths.mjs'

// UI integration only: all external requests are denied; every destination reply is synthetic.
const fixture=await createHagueFixture()
const server=await createServer({server:{host:'127.0.0.1',port:0}})
await server.listen()
const browser=await chromium.launch({executablePath:process.env.HAGUE_TEST_CHROME,headless:true})
const context=await browser.newContext({viewport:{width:1440,height:1000}})
await context.route(/^https?:/,route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort())
try{
 const page=await context.newPage()
 const jpeg=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=10;c.height=10;c.getContext('2d').fillRect(0,0,10,10);return c.toDataURL('image/jpeg').split(',')[1]})
 for(let i=1;i<=8;i++){await writeFile(path.join(fixture.root,'PO2631874HAGUE',`1.${i}.jpg`),Buffer.from(jpeg,'base64'));await unlink(path.join(fixture.root,'PO2631874HAGUE',`1.${i}.png`))}
 await page.addInitScript(()=>{
  const applicant={name:'Example Ltd.',address:'No. 1, Nanshan District',city:'Shenzhen',region:'Guangdong',postalCode:'518000',country:'China'}
  const source=JSON.stringify({GetCaseApplicant:[{TableRows:[{applicant_name_en:applicant.name,contact_address_en:applicant.address,city:'深圳市',province:'广东省',postcode:'518000',country_zh_cn:'中国'}]}],GetCaseInventor:[{TableRows:[{first_name_en:'Lisi',last_name_en:'CHEN',inventor_name_en:'Lisi CHEN'}]}],GetCaseInfo:[{CaseInfo:[{remark:'海牙指定欧盟、日本；公开情况：6个月'}]}]})
  const commands=[],storage={};let destination='portfolio'
  window.__draftCommands=commands
  Object.assign(window.chrome??(window.chrome={}),{runtime:{id:'fixture',lastError:null,onMessage:{addListener(){},removeListener(){}},sendMessage(message,callback){
   if(message.channel==='patmail-call')message=message.message
   if(message.channel==='PATMAIL_HAGUE_SESSION'){
    if(message.action==='listTabs')callback({ok:true,tabs:[{id:7,title:'WIPO fixture'}]})
    else callback({ok:true,session:{tabId:7,title:'WIPO fixture',documentId:'doc',verifiedAt:Date.now(),expiresAt:Date.now()+300000}})
   }else if(message.type==='WORKSPACE')callback({type:'WORKSPACE_RESULT',payload:{ok:true,message:'fixture',connection:{easyOrigin:'http://183.36.43.66:88',easyTabId:1,operatorId:'test',lastOperatorId:'test',sessionStatus:'authenticated',lastCheckedAt:'',displayName:'test',message:'',connectionVersion:1},tabs:[],customers:[],templates:[],rules:null,tasks:[],appTab:null,forwarded:{type:'READ_HAGUE_CASE_RESULT',payload:{text:source}}}})
   else if(message.channel==='PATMAIL_HAGUE_DRAFT'){
    const command=message.command;commands.push({...command,base64:command.base64?'omitted':undefined})
    if(command.op==='create'||command.op==='backToApplication')destination='application'
    if(command.op==='summary')destination='summary'
    if(command.op==='saveDraft')destination='portfolio'
    callback({ok:true,page:destination,documentId:'doc',draftSaved:destination==='portfolio'&&!!message.reference,...(destination==='portfolio'?{}:{reference:'123'}),...(command.op==='print'?{downloadId:42}:{})})
   }
  }},storage:{local:{get:async key=>({[key]:storage[key]}),set:async value=>Object.assign(storage,value)}},downloads:{show(){}},tabs:{onUpdated:{addListener(){},removeListener(){}},onRemoved:{addListener(){},removeListener(){}}}})
  window.addEventListener('patmail-agent-workflow',event=>{const job=event.detail;job.accepted=true;job.resolve(JSON.stringify({results:[{caseVolume:'PO2631874HAGUE',decision:{applicant,creators:[{givenName:'Lisi',familyName:'CHEN'}],parties:['EM','JP'],publicationMonths:6,priorities:[],warnings:[],evidence:['fixture']}}]}))})
 })
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/e2e/hague-harness.html`)
 await page.getByLabel('选择海牙申请总文件夹').setInputFiles(fixture.root)
 await page.getByText('等待 eHague 登录验证',{exact:false}).first().waitFor()
 await page.getByRole('button',{name:'连接并检测登录',exact:true}).click()
 const create=page.getByRole('button',{name:'填写并保存本案草稿',exact:true})
 await create.waitFor();assert.equal(await create.isEnabled(),true)
 await create.click()
 await page.getByRole('button',{name:'草稿已保存',exact:true}).waitFor({timeout:30000})
 const commands=await page.evaluate(()=>window.__draftCommands)
 const upload=commands.filter(c=>c.op==='upload')
 assert.equal(upload.length,8)
 assert.deepEqual(upload.map(c=>c.name),Array.from({length:8},(_,i)=>`1.${i+1}.jpg`))
 assert.equal(commands.find(c=>c.op==='design').subclass,'3')
 assert.equal(commands.filter(c=>c.op==='create').length,1)
 assert.equal(commands.filter(c=>c.op==='signature').length,1)
 assert.equal(commands.some(c=>/pay|submit/i.test(c.op)),false)
 assert.match(await page.locator('.hague-draft').innerText(),/123/)
 assert.equal(await page.locator('.test-top-actions [role=progressbar]').getAttribute('aria-valuenow'),'100')
 assert.equal(await page.locator('.hague-page [role=progressbar]').count(),0)
 await page.screenshot({path:resultPath('hague-draft-ui.png'),fullPage:true})
 console.log('Hague UI: local parse → assistant → serial draft → Summary/PDF → saved receipt and top progress passed; no external writes')
}finally{await context.close();await browser.close();await server.close();await fixture.cleanup()}
