import {afterEach,expect,it,vi} from 'vitest'
import {webcrypto} from 'node:crypto'
import {File as NativeFile} from 'node:buffer'
import {createPlanIdentity,comparePlanIdentity} from '../../../src/hague/plan-identity'
afterEach(()=>vi.unstubAllGlobals())
const steps=(text:string,time=1)=>[{command:{op:'upload' as const,name:'1.1.jpg',base64:'',mime:'image/jpeg',count:0},file:new NativeFile([text],'1.1.jpg',{lastModified:time}) as unknown as File},{command:{op:'signature' as const,reference:'P1HAGUE',representative:'Example'}}]
it('identifies file bytes, not filesystem timestamps or object property order',async()=>{
 vi.stubGlobal('crypto',webcrypto)
 const one=await createPlanIdentity(steps('a',1)),two=await createPlanIdentity(steps('a',2))
 expect(one).toEqual(two)
 const three=await createPlanIdentity([{command:{reference:'P1HAGUE',op:'signature',representative:'Example'}}])
 expect(three.steps[0]).toBe(one.steps[1])
 expect(comparePlanIdentity(one,await createPlanIdentity(steps('b')),0).outcome).toBe('changed')
})
it('permits only changes after the persisted current uncertain step',async()=>{
 vi.stubGlobal('crypto',webcrypto)
 const one=await createPlanIdentity(steps('a')),changed=steps('a');changed[1].command={op:'signature',reference:'P1HAGUE',representative:'Changed'}
 const two=await createPlanIdentity(changed)
 expect(comparePlanIdentity(one,two,0)).toEqual({outcome:'future-changed',changed:[1]})
 expect(comparePlanIdentity(one,two,1).outcome).toBe('changed')
 expect(comparePlanIdentity(one,two,2).outcome).toBe('changed')
})
