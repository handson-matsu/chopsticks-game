import {analyze,chooseMove} from './analysis.js';
self.onmessage=({data})=>{try{self.postMessage({result:data.type==='analysis'?analyze(data.state):chooseMove(data.state,data.level)});}catch(e){self.postMessage({error:e.message});}};
