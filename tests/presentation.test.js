import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AttackSequence,attackDurations,attackFormula,clampInteger} from '../js/presentation.js';
import {applyMove,clone} from '../js/game.js';

function fakeClock() {
  let id=0,time=0;const pending=new Map();
  return {
    setTimeout(callback,delay){pending.set(++id,{callback,delay});return id;},
    clearTimeout(key){pending.delete(key);},
    async next(){const [key,task]=pending.entries().next().value;pending.delete(key);time+=task.delay;task.callback();await Promise.resolve();},
    get size(){return pending.size;},get time(){return time;}
  };
}
test('演出速度の総時間・4段階と終了の順序',async()=>{
  for(const duration of Object.values(attackDurations)) {
    const clock=fakeClock(),sequence=new AttackSequence(clock),phases=[];
    const done=sequence.play(duration,p=>phases.push(p));
    assert.deepEqual(phases,['source']);
    for(let i=0;i<4;i++)await clock.next();
    assert.equal(await done,true);
    assert.deepEqual(phases,['source','target','formula','impact','done']);
    assert.equal(clock.time,duration);assert.equal(clock.size,0);
  }
});
test('各段階で中断し、古いタイマー・後続段階を実行しない',async()=>{
  for(let stop=0;stop<4;stop++) {
    const clock=fakeClock(),sequence=new AttackSequence(clock),phases=[];
    const done=sequence.play(2000,p=>phases.push(p));
    for(let i=0;i<stop;i++)await clock.next();
    sequence.cancel();assert.equal(await done,false);
    assert.equal(clock.size,0);assert.equal(phases.length,stop+1);
  }
});
test('再実行は前回を無効にし、確定を二重実行しない',async()=>{
  const clock=fakeClock(),sequence=new AttackSequence(clock);let old=0,current=0;
  const first=sequence.play(2000,p=>{if(p==='impact')old++;});
  const second=sequence.play(800,p=>{if(p==='impact')current++;});
  for(let i=0;i<4;i++)await clock.next();
  assert.equal(await first,false);assert.equal(await second,true);
  assert.equal(old,0);assert.equal(current,1);assert.equal(clock.size,0);
});
test('攻撃前の値を計算まで維持し、impactで一度だけ確定',async()=>{
  const initial={rule:'modulo',n:5,turn:1,hands:[[4],[3]]};
  const clock=fakeClock(),sequence=new AttackSequence(clock),move={from:0,to:0};
  let state=clone(initial),commits=0;
  const done=sequence.play(2000,phase=>{
    if(['source','target','formula'].includes(phase))assert.deepEqual(state,initial);
    if(phase==='impact'){state=applyMove(state,move);commits++;}
  });
  for(let i=0;i<4;i++)await clock.next();await done;
  assert.deepEqual(state.hands,[[2],[3]]);assert.equal(commits,1);
});
test('Modulo・Cutoffの計算式、境界と消滅',()=>{
  const p={rule:'modulo',n:5,turn:1,hands:[[4],[3]]};
  assert.equal(attackFormula(p,{from:0,to:0}),'3 + 4 = 7 → 2（mod 5）');
  assert.equal(attackFormula({...p,rule:'cutoff'},{from:0,to:0}),'3 + 4 = 7 > 5 → 消滅（0）');
  assert.equal(attackFormula({...p,rule:'cutoff',hands:[[2],[3]]},{from:0,to:0}),'3 + 2 = 5 ≤ 5 → 5');
});
test('整数入力のクランプ：上下限・空欄・小数・非数値',()=>{
  assert.equal(clampInteger(1,2,20),2);assert.equal(clampInteger(99,2,20),20);
  assert.equal(clampInteger('',1,6),1);assert.equal(clampInteger(2.6,1,6),3);
  assert.equal(clampInteger('bad',0,4),0);assert.equal(clampInteger(0,0,4),0);
});
