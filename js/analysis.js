import {legalMoves,applyMove,winner,key} from './game.js';
const invert=o=>o==='win'?'loss':o==='loss'?'win':o;
export function analyze(root,{maxStates=60000,timeMs=1800}={}){
 const start=performance.now(),memo=new Map();let count=0;
 const check=()=>{if(++count>maxStates||performance.now()-start>timeMs)throw Error('limit');};
 const terminal=s=>{const w=winner(s);return w===null?null:{outcome:w===s.turn?'win':'loss',distance:0};};
 try{
 if(root.rule==='cutoff'){
 const visit=s=>{const k=key(s);if(memo.has(k))return memo.get(k);check();let r=terminal(s);if(!r){const children=legalMoves(s).map(m=>visit(applyMove(s,m))),losers=children.filter(c=>c.outcome==='loss');r=losers.length?{outcome:'win',distance:1+Math.min(...losers.map(c=>c.distance))}:{outcome:'loss',distance:1+Math.max(...children.map(c=>c.distance))};}memo.set(k,r);return r;};visit(root);
 }else{
 const nodes=[],ids=new Map();const add=s=>{const k=key(s);if(ids.has(k))return ids.get(k);check();const id=nodes.length;ids.set(k,id);nodes.push({s,k,children:[],parents:[],result:terminal(s),max:0});return id;};add(root);
 for(let i=0;i<nodes.length;i++){const node=nodes[i];node.children=[...new Set(legalMoves(node.s).map(m=>add(applyMove(node.s,m))))];node.remaining=node.children.length;for(const j of node.children)nodes[j].parents.push(i);}
 const q=nodes.flatMap((v,i)=>v.result?[i]:[]);
 for(let qi=0;qi<q.length;qi++){if(performance.now()-start>timeMs)throw Error('limit');const child=nodes[q[qi]];for(const p of child.parents){const parent=nodes[p];if(parent.result)continue;if(child.result.outcome==='loss'){parent.result={outcome:'win',distance:child.result.distance+1};q.push(p);}else{parent.max=Math.max(parent.max,child.result.distance);if(--parent.remaining===0){parent.result={outcome:'loss',distance:parent.max+1};q.push(p);}}}}
 for(const v of nodes)memo.set(v.k,v.result||{outcome:'draw',distance:null});
 }
 return {complete:true,...memo.get(key(root)),states:memo.size,moves:legalMoves(root).map(move=>{const state=applyMove(root,move),r=memo.get(key(state));return {move,state,outcome:invert(r.outcome),distance:r.distance===null?null:r.distance+1};})};
 }catch(e){if(e.message!=='limit')throw e;return {complete:false,outcome:'unknown',distance:null,states:count,moves:legalMoves(root).map(move=>({move,state:applyMove(root,move),outcome:'unknown',distance:null}))};}
}
export function chooseMove(s,level='medium',options={}){
 const moves=legalMoves(s);if(!moves.length)return {move:null,method:'終了'};
 if(level==='easy')return {move:moves[Math.floor(Math.random()*moves.length)],method:'ランダム'};
 if(level==='strong'){const r=analyze(s,options);if(r.complete){const scores={win:2,draw:1,loss:0};const sorted=[...r.moves].sort((a,b)=>scores[b.outcome]-scores[a.outcome]||(a.outcome==='loss'?b.distance-a.distance:a.distance-b.distance));return {move:sorted[0].move,method:'完全解析',analysis:r};}}
 const deadline=performance.now()+250;let visits=0;
 const score=(p,depth)=>{const w=winner(p);if(w!==null)return w===p.turn?10000+depth:-10000-depth;if(!depth||++visits>20000||performance.now()>deadline)return p.hands[p.turn].filter(Boolean).length-p.hands[1-p.turn].filter(Boolean).length;return Math.max(...legalMoves(p).map(m=>-score(applyMove(p,m),depth-1)));};
 let best=moves[0],value=-Infinity;for(const m of moves){const t=applyMove(s,m);if(winner(t)===s.turn)return {move:m,method:'近似探索：即勝ち'};const danger=legalMoves(t).some(r=>winner(applyMove(t,r))===t.turn);const v=-score(t,3)-(danger?5000:0);if(v>value){value=v;best=m;}}
 return {move:best,method:level==='strong'?'上限到達・近似探索（未解析）':'近似探索（4手）'};
}
