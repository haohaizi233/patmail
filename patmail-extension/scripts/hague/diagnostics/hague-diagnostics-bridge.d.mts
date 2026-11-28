export function buildCdpUiBridgeExpression(records:unknown[]):string
export function allowedCdpUiBridgeCommand(target:Record<string,unknown>,command:Record<string,unknown>):boolean
export class CdpUiBridge {
 constructor(send:(command:{method:string;sessionId:string;params:Record<string,unknown>})=>Promise<unknown>,targets:()=>Record<string,unknown>[])
 state:string
 enqueue(raw:unknown):void
 flush():Promise<void>
 clear():void
}
