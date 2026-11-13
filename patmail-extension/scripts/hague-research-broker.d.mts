export class AnalysisWorker {
 constructor(options?:{timeoutMs?:number;workerUrl?:URL})
 analyze(kind:string,value:unknown,options?:Record<string,unknown>):Promise<any>
 resetMetrics():void
 stats:Record<string,number>
 pending:Map<number,unknown>
 reserve():boolean
 release():void
 capacity():number
 sample():Record<string,number>
 clear():void
}
