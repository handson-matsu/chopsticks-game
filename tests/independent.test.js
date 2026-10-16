import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyze,chooseMove} from '../js/analysis.js';
import {universe,identity,terminal,reachable} from './helpers/independent.js';

const invert=outcome=>outcome==='win'?'loss':outcome==='loss'?'win':'draw';
for(const [rule,ns] of [['modulo',[2,3,4,5]],['cutoff',[2,3]]]) {
  test(`${rule}：独立な全状態不動点・最強CPU・終局手数との照合`,()=>{
    const total={states:0,matched:0,mismatched:0,win:0,loss:0,draw:0,edges:0,cpu:0};
    for(const n of ns)for(const a of [1,2])for(const b of [1,2]) {
      const nodes=universe(rule,n,a,b),counts={win:0,loss:0,draw:0};
      const options={maxStates:60000,timeMs:10000};
      for(const node of nodes.values()) {
        const {state,outcome,distance}=node;
        total.states++;counts[outcome]++;total[outcome]++;
        const result=analyze(state,options);
        assert.equal(result.complete,true);
        assert.equal(result.outcome,outcome,JSON.stringify(state));
        assert.equal(result.distance,distance,JSON.stringify(state));
        total.matched++;
        // 製品側の全合法手・遷移先・各手の評価も独立な遷移と照合する。
        assert.equal(result.moves.length,node.edges.length);
        for(const edge of node.edges) {
          const actual=result.moves.find(row=>row.move.from===edge.move.from&&row.move.to===edge.move.to);
          const child=nodes.get(identity(edge.state));
          assert.deepEqual(actual.state,edge.state);
          assert.equal(actual.outcome,invert(child.outcome));
          assert.equal(actual.distance,child.distance===null?null:child.distance+1);
          total.edges++;
        }
        if(terminal(state))continue;
        const children=node.edges.map(edge=>nodes.get(identity(edge.state)));
        if(outcome==='win')assert.ok(children.some(child=>child.outcome==='loss'));
        if(outcome==='loss')assert.ok(children.every(child=>child.outcome==='win'));
        if(outcome==='draw') {
          assert.ok(children.some(child=>child.outcome==='draw'));
          assert.ok(children.every(child=>child.outcome!=='loss'));
        }
        const cpu=chooseMove(state,'strong',options);
        assert.equal(cpu.method,'完全解析');
        const chosen=node.edges.find(edge=>edge.move.from===cpu.move.from&&edge.move.to===cpu.move.to);
        assert.ok(chosen);
        const next=nodes.get(identity(chosen.state));
        assert.equal(next.outcome,invert(outcome));
        if(outcome==='win')assert.equal(next.distance+1,distance);
        if(outcome==='loss')assert.equal(next.distance+1,distance);
        total.cpu++;
      }
      const start={rule,n,hands:[Array(a).fill(1),Array(b).fill(1)],turn:0};
      console.log(JSON.stringify({rule,n,hands:[a,b],states:nodes.size,standardReachable:reachable(start),...counts,mismatch:0}));
    }
    console.log('TOTAL '+rule+' '+JSON.stringify(total));
  });
}
test('時間・状態数上限では全合法手を未解析とし、最強CPUは完全解析を名乗らない',()=>{
  const state={rule:'modulo',n:5,hands:[[1,1],[1,1]],turn:0};
  for(const options of [{maxStates:1},{timeMs:-1}]) {
    const result=analyze(state,options);
    assert.equal(result.complete,false);assert.equal(result.outcome,'unknown');assert.equal(result.distance,null);
    assert.equal(result.moves.length,4);
    assert.ok(result.moves.every(row=>row.outcome==='unknown'&&row.distance===null));
    assert.match(chooseMove(state,'strong',options).method,/未解析/);
  }
});
