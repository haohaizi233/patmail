export interface EvidenceResult {layers:Record<'REQUEST'|'HTTP'|'JSF_PROTOCOL'|'DOM'|'BUSINESS'|'CERTAINTY',string>;REQUEST:string;HTTP:string;JSF_PROTOCOL:string;DOM:string;BUSINESS:string;CERTAINTY:string;missingEvidence:string[];explanation:string;eventCount:number}
export function analyzeEvidence(events?:readonly unknown[],selector?:Record<string,unknown>):EvidenceResult
export const buildRequestEvidence:typeof analyzeEvidence
