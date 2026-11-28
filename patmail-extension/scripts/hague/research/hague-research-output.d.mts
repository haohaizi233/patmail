export class ResearchOutputBudget {constructor(options?:{maxPerMinute?:number;maxPending?:number;maxBytes?:number;now?:()=>number});dropped:number;pending:number;peakPending:number;submit(kind:string,event:Record<string,unknown>,write:(kind:string,event:Record<string,unknown>)=>unknown):boolean}
export function safeAnalysisOutput(raw:unknown):Record<string,unknown>|null
