import {expect,it} from 'vitest'
import {preferredModeOrigin} from '../../../src/settings/customer-mode'
import {canCommitWorkspaceResponse} from '../../../src/app/composables/useWorkspace'
import {originsForMode} from '../../../src/settings/customer-mode'
import {EasyConnectionController} from '../../../src/shared/connection'
it.each([['large','http://183.36.43.66:88','http://d.hiseeip.com:88'],['sme','http://183.36.43.44:88','http://z.hiseeip.com:88']] as const)('accepts discovery for exact %s aliases, retaining strict established scopes', (mode,ip,domain)=>{
 const input={requestId:1,latestRequestId:1,expectedOrigin:ip,responseOrigin:domain,responseOperatorId:'verified-user',responseAuthenticated:true}
 expect(canCommitWorkspaceResponse({...input,discoveryOrigins:originsForMode(mode)})).toBe(true)
 expect(canCommitWorkspaceResponse(input)).toBe(false)
 expect(canCommitWorkspaceResponse({...input,responseOrigin:'http://evil.test',discoveryOrigins:originsForMode(mode)})).toBe(false)
 expect(canCommitWorkspaceResponse({...input,kind:'mutation',discoveryOrigins:originsForMode(mode)})).toBe(false)
})
it('remembers the bound domain when its browser tab closes',()=>{
 const connection=new EasyConnectionController()
 connection.beginBind({id:9,url:'http://z.hiseeip.com:88/'})
 connection.detach(9)
 expect(connection.context.easyOrigin).toBe('http://z.hiseeip.com:88')
})
it('keeps the approved alias for reconnecting, without mixing customer systems',()=>{
 expect(preferredModeOrigin('sme','http://z.hiseeip.com:88')).toBe('http://z.hiseeip.com:88')
 expect(preferredModeOrigin('large','http://d.hiseeip.com:88')).toBe('http://d.hiseeip.com:88')
 expect(preferredModeOrigin('large','http://z.hiseeip.com:88')).toBe('http://183.36.43.66:88')
 expect(preferredModeOrigin('sme','http://z.hiseeip.com.evil.test:88')).toBe('http://183.36.43.44:88')
})
