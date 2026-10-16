// 検証専用。製品側の合法手・遷移・正規化・解析関数は一切使用しない。
// カード順を区別した全状態を、同期的な不動点反復で分類する。
export const identity=s=>JSON.stringify([s.turn,...s.hands]);
export function terminal(s) {
  const alive=s.hands.map(hand=>hand.some(value=>value!==0));
  if(alive[0]&&alive[1])return null;
  return alive[s.turn]?'win':'loss';
}
export function edges(s) {
  if(terminal(s))return [];
  const result=[];
  for(let from=0;from<s.hands[s.turn].length;from++) {
    const a=s.hands[s.turn][from];if(a===0)continue;
    for(let to=0;to<s.hands[1-s.turn].length;to++) {
      const b=s.hands[1-s.turn][to];if(b===0)continue;
      const hands=s.hands.map(hand=>hand.slice()),sum=a+b;
      hands[1-s.turn][to]=s.rule==='modulo'?sum-Math.floor(sum/s.n)*s.n:sum<=s.n?sum:0;
      result.push({move:{from,to},state:{...s,hands,turn:1-s.turn}});
    }
  }
  return result;
}
function tuples(base,length) {
  if(length===0)return [[]];
  return tuples(base,length-1).flatMap(prefix=>Array.from({length:base},(_,value)=>[...prefix,value]));
}
export function universe(rule,n,a,b) {
  const base=rule==='modulo'?n:n+1,nodes=new Map();
  for(const left of tuples(base,a))for(const right of tuples(base,b)) {
    if([...left,...right].every(value=>value===0))continue;
    for(const turn of [0,1]) {
      const state={rule,n,hands:[left,right],turn};
      nodes.set(identity(state),{state,edges:edges(state),outcome:terminal(state),distance:terminal(state)?0:null});
    }
  }
  // キューによる逆向き伝播とは独立に、全状態を毎ラウンド走査。
  for(;;) {
    const updates=[];
    for(const [id,node] of nodes) {
      if(node.outcome)continue;
      const children=node.edges.map(edge=>nodes.get(identity(edge.state)));
      const losing=children.filter(child=>child.outcome==='loss');
      if(losing.length)updates.push([id,'win',1+Math.min(...losing.map(child=>child.distance))]);
      else if(children.every(child=>child.outcome==='win'))updates.push([id,'loss',1+Math.max(...children.map(child=>child.distance))]);
    }
    if(!updates.length)break;
    for(const [id,outcome,distance] of updates)Object.assign(nodes.get(id),{outcome,distance});
  }
  for(const node of nodes.values())if(!node.outcome)node.outcome='draw';
  return nodes;
}
export function reachable(root) {
  const found=new Map([[identity(root),root]]),queue=[root];
  for(let i=0;i<queue.length;i++)for(const edge of edges(queue[i])) {
    const id=identity(edge.state);
    if(!found.has(id)){found.set(id,edge.state);queue.push(edge.state);}
  }
  return found.size;
}
