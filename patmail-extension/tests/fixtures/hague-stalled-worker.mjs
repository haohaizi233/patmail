import { parentPort } from 'node:worker_threads'
parentPort.on('message',()=>{while(true){ /* intentionally stalled isolated fixture */ }})
