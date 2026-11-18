import {it,expect} from 'vitest'
import {inspectDesignRecovery,inspectUploadRecovery,recoverableDraftCommand} from '../../../src/hague/draft-recovery'
const command={op:'design' as const,index:0,subclass:'3',product:'Massage apparatus'}
function doc(cells:string[]){return new DOMParser().parseFromString(`<form id="designForm"><button>Add design</button><table><tbody id="designForm:designsDataTable_data">${cells.length?`<tr data-ri="0">${cells.map(c=>`<td>${c}</td>`).join('')}</tr>`:''}</tbody></table></form>`,'text/html')}
it('recovers canonical saved design without creating a duplicate',()=>{
 expect(recoverableDraftCommand(command)).toBe(true)
 expect(inspectDesignRecovery(doc(['1','0','03','Massage apparatus','']),command,'123')).toMatchObject({outcome:'completed',receipt:{reference:'123',designs:1}})
})
it('rejects mismatched product, subclass and already uploaded images',()=>{
 for(const cells of [['1','0','3','Other',''],['1','0','4','Massage apparatus',''],['1','1','3','Massage apparatus','']])expect(inspectDesignRecovery(doc(cells),command,'123').outcome).toBe('unknown')
})
it('permits creation only after canonical empty design list is observed',()=>{
 expect(inspectDesignRecovery(doc([]),command,'123').outcome).toBe('retry')
 expect(inspectDesignRecovery(new DOMParser().parseFromString('<form id="designForm"></form>','text/html'),command,'123').outcome).toBe('unknown')
})

it('recovers uploaded image only from its unique canonical filename and exact count',()=>{
 const d=new DOMParser().parseFromString('<table><tbody id="designForm:reproDT_data"><tr data-ri="0"><td>1</td><td>view</td><td>1.1.jpg</td></tr></tbody></table>','text/html')
 expect(inspectUploadRecovery(d,{op:'upload',name:'1.1.jpg',count:0,base64:'',mime:'image/jpeg'},'123').outcome).toBe('completed')
 expect(inspectUploadRecovery(d,{op:'upload',name:'1.2.jpg',count:0,base64:'',mime:'image/jpeg'},'123').outcome).toBe('unknown')
})


it('does not authorize retry from an incomplete upload page or unverified preceding designs',()=>{
 const page=new DOMParser().parseFromString('<table><tbody id="designForm:reproDT_data"><tr data-ri="0"><td>1</td><td>view</td><td>1.1.jpg</td></tr></tbody></table>','text/html')
 expect(inspectUploadRecovery(page,{op:'upload',name:'1.6.jpg',count:5,base64:'',mime:'image/jpeg'},'123',5).outcome).toBe('unknown')
 expect(inspectDesignRecovery(doc(['1','0','3','Earlier product','']),{...command,index:1},'123').outcome).toBe('unknown')
})
