export interface HagueActionInput {busy:boolean;checking:boolean;listing:boolean;stopping:boolean;verified:boolean;workspaceReady:boolean;materialsDurable:boolean;pending:number;drafts:number;saved:number}
/** Every toolbar action derives from the same operation/session state. Stop remains independent of authentication. */
export function hagueActionState(s:HagueActionInput){
 const configure=!s.busy&&!s.checking&&!s.listing&&!s.stopping&&s.workspaceReady
 const authenticated=configure&&s.verified
 return{configure,process:authenticated&&s.materialsDurable&&s.pending>0,draft:authenticated&&s.materialsDurable&&s.drafts>0,exportSaved:authenticated&&s.saved>0,stop:s.busy&&!s.stopping}
}
