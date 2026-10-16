import {validate,clone,winner,applyMove,undo} from './game.js';
import {AttackSequence,attackDurations,attackFormula,clampInteger} from './presentation.js';

const $=id=>document.getElementById(id), names=['A','B'];
let values=[[1,1],[1,1]], state, initial, history=[], selected=null;
let worker=null, busy=false, analysisOpen=false, animation=null, workGeneration=0;
const sequence=new AttackSequence();
let renderedN=5;
const maxInitial=()=>$('rule').value==='modulo'?Number($('n').value)-1:Number($('n').value);

function formula() {
  const n=$('n').value;
  $('formula').textContent=$('rule').value==='modulo'
    ? `Modulo：攻撃後 = (相手の値 + 自分の値) mod ${n}`
    : `Cutoff：合計が${n}以下ならその値、${n}を超えたら0（消滅）`;
}
function stepper(id,value,min,max,label,attributes='') {
  return `<div class="stepper"><button type="button" data-step="-1" data-for="${id}" aria-label="${label}を減らす" ${value<=min?'disabled':''}>−</button><input id="${id}" type="number" inputmode="numeric" min="${min}" max="${max}" required value="${value}" aria-label="${label}" ${attributes}><button type="button" data-step="1" data-for="${id}" aria-label="${label}を増やす" ${value>=max?'disabled':''}>＋</button></div>`;
}
function syncButtons(input) {
  const container=input.closest('.stepper');
  container.querySelector('[data-step="-1"]').disabled=Number(input.value)<=Number(input.min);
  container.querySelector('[data-step="1"]').disabled=Number(input.value)>=Number(input.max);
}
function handCards(p) {
  const h=values[p],max=maxInitial();
  return h.map((v,i)=>`<div class="initial-hand ${v===0?'is-zero':''}"><label for="initial-${p}-${i}">手 ${i+1}</label>${stepper(`initial-${p}-${i}`,v,0,max,`プレイヤー${names[p]} 手${i+1}の初期値`,`data-p="${p}" data-i="${i}"`)}<span class="initial-hint">${v===0?'0 · 消滅':'初期値'}</span></div>`).join('');
}
function inputs() {
  const max=maxInitial();let adjusted=false;
  values=values.map(h=>h.map(v=>{const x=clampInteger(v,0,max);if(x!==v)adjusted=true;return x;}));
  $('initial').innerHTML=values.map((h,p)=>`<div class="initial-player"><div class="initial-title"><strong>プレイヤー${names[p]}の初期値</strong><div class="count-control"><span>手の数</span>${stepper(`count-${p}`,h.length,1,6,`プレイヤー${names[p]}の手の数`,`data-count="${p}"`)}</div></div><div class="hand-inputs">${handCards(p)}</div></div>`).join('');
  $('adjust').textContent=adjusted?'範囲外の初期値を新しい上限に調整しました。':`各手に0〜${max}を指定できます。0は消滅した手です。`;
  renderedN=Number($('n').value);syncButtons($('n'));formula();
}
function updateNumber(input,final=false) {
  if(final)input.value=clampInteger(input.value,Number(input.min),Number(input.max));
  // 直接入力の途中（空欄など）は確定まで待つ。
  if(input.value===''||!input.validity.valid)return;
  const value=Number(input.value);
  if(input.id==='n') { if(value!==renderedN)inputs(); }
  else if(input.dataset.count!==undefined) {
    const p=Number(input.dataset.count);
    if(values[p].length===value){syncButtons(input);return;}
    values[p]=Array.from({length:value},(_,i)=>values[p][i]??1);
    input.closest('.initial-player').querySelector('.hand-inputs').innerHTML=handCards(p);
  } else if(input.dataset.p!==undefined) {
    values[Number(input.dataset.p)][Number(input.dataset.i)]=value;
    const card=input.closest('.initial-hand');
    card.classList.toggle('is-zero',value===0);
    card.querySelector('.initial-hint').textContent=value===0?'0 · 消滅':'初期値';
  }
  if(input.isConnected)syncButtons(input);
}
$('form').addEventListener('click',e=>{
  const button=e.target.closest('button[data-step]');
  if(!button||button.disabled)return;
  const input=$(button.dataset.for);
  input.value=clampInteger(Number(input.value)+Number(button.dataset.step),Number(input.min),Number(input.max));
  updateNumber(input,true);
  // 再描画でボタンが消える手数変更後もキーボードのフォーカスを維持。
  const replacement=document.querySelector(`button[data-for="${button.dataset.for}"][data-step="${button.dataset.step}"]`);
  if(replacement&&!replacement.disabled)replacement.focus({preventScroll:true});
});
$('form').addEventListener('input',e=>{
  if(e.target.type==='number')updateNumber(e.target);
});
$('form').addEventListener('change',e=>{if(e.target.type==='number')updateNumber(e.target,true);});
$('form').addEventListener('focusout',e=>{if(e.target.type==='number'&&e.target.isConnected)updateNumber(e.target,true);});
$('rule').addEventListener('change',inputs);
function read() {
  // 再描画する前に全入力を確定。Enter送信でも未確定の値を失わない。
  $('n').value=clampInteger($('n').value,2,20);
  for(const input of $('initial').querySelectorAll('input[data-p]')) {
    values[Number(input.dataset.p)][Number(input.dataset.i)]=clampInteger(input.value,0,maxInitial());
  }
  for(const input of $('initial').querySelectorAll('input[data-count]')) {
    const p=Number(input.dataset.count),count=clampInteger(input.value,1,6);
    values[p]=Array.from({length:count},(_,i)=>values[p][i]??1);
  }
  inputs();
  if(!$('form').reportValidity())return null;
  try {
    $('error').textContent='';
    return validate({rule:$('rule').value,n:Number($('n').value),hands:values.map(h=>[...h]),turn:Number($('turn').value)});
  } catch(e) { $('error').textContent=e.message;return null; }
}
function cancel() {
  workGeneration++;
  worker?.terminate();worker=null;
  sequence.cancel();animation=null;busy=false;
}
function run(type,callback) {
  cancel();busy=true;
  const generation=workGeneration;
  const task=worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
  task.onmessage=({data})=>{
    if(generation!==workGeneration||worker!==task)return;
    task.terminate();worker=null;busy=false;
    if(data.error) {
      $('calculation').textContent=data.error;$('result').textContent=data.error;
      if(type==='cpu')render();return;
    }
    callback(data.result);
  };
  task.onerror=()=>{
    if(generation!==workGeneration||worker!==task)return;
    cancel();
    $('calculation').textContent='計算を実行できませんでした。HTTPサーバー経由で開いてください。';
    $('result').textContent='解析エラー。HTTPサーバー経由で開いてください。';
    if(type==='cpu')render();
  };
  task.postMessage({type,state,level:$('level').value});
}
const isCPU=()=>$('mode').value==='cpu'&&state.turn!==Number($('human').value);
function render() {
  const w=winner(state),actor=animation?.actor??state.turn;
  const cpuTurn=animation?animation.cpu:isCPU();
  // 見出しと操作説明は手番の間は固定。演出段階はカードの色とラベルで示す。
  $('status').textContent=!animation&&w!==null?`プレイヤー${names[w]}の勝利！`
    :cpuTurn?`CPUの手番（プレイヤー${names[actor]}）`:`プレイヤー${names[actor]}の手番`;
  $('status').className=!animation&&w!==null?'victory':'';
  $('rule-name').textContent=state.rule==='modulo'?'Modulo型':'Cutoff型';
  $('rule-n').textContent=`n = ${state.n}`;
  $('rule-summary').textContent=state.rule==='modulo'?'nで割った余り。0なら消滅':'nを超えたら消滅';
  $('help').textContent=!animation&&w!==null?'ゲーム終了。同じ局面でもう一度、戦略を試してみましょう。'
    :cpuTurn?'CPUの攻撃を見守ってください。'
    :selected!==null||animation?'攻撃する相手の手を選んでください。':'自分の生きている手を選んでください。';
  $('board').setAttribute('aria-busy',String(busy||!!animation));
  $('board').innerHTML=[1,0].map(p=>`<div class="player ${actor===p?'active':''}"><div class="player-title"><span>プレイヤー${names[p]} ${$('mode').value==='cpu'?(p===Number($('human').value)?'· あなた':'· CPU'):''}</span><span>${state.hands[p].filter(Boolean).length} / ${state.hands[p].length} 手</span></div><div class="hands">${state.hands[p].map((v,i)=>{
    const source=animation?p===actor&&i===animation.move.from:p===state.turn&&selected===i;
    const target=animation&&animation.phase!=='source'&&p===1-actor&&i===animation.move.to;
    const impact=target&&animation.phase==='impact';
    const available=!animation&&!busy&&selected!==null&&p!==state.turn&&v>0&&w===null;
    const hint=source?'↗ 攻撃元':impact?(v===0?'✕ 消滅':'✦ 変化'):target?'◎ 攻撃先':v===0?'消滅':available?'◎ 攻撃できる':`手 ${i+1}`;
    return `<button class="hand ${v===0?'dead':''} ${source?'attack-source':''} ${target?'attack-target':''} ${impact?'attack-impact':''} ${impact&&v===0?'vanishing':''} ${available?'target-available':''}" data-player="${p}" data-hand="${i}" aria-label="プレイヤー${names[p]} 手${i+1} 値${v} ${hint}" aria-pressed="${!!source}" ${v===0||w!==null||busy||animation||isCPU()?'disabled':''}><span class="hand-value">${v}</span><small>${hint}</small></button>`;
  }).join('')}</div></div>`).join('');
  $('history').replaceChildren(...history.slice(1).map(item=>{const li=document.createElement('li');li.textContent=item.text;return li;}));
  $('undo').disabled=history.length<=1;
}
async function move(m,method='') {
  if(animation||busy||winner(state)!==null)return;
  const before=clone(state),after=applyMove(before,m),actor=before.turn,cpuAttack=!!method;
  const calc=attackFormula(before,m);
  const text=`${names[actor]} 手${m.from+1} → ${names[1-actor]} 手${m.to+1}：${calc}`;
  const lasting=text+(method?` ／ CPU：${method}`:'');
  const description=`${cpuAttack?'CPU':`プレイヤー${names[actor]}`}：${before.hands[actor][m.from]}の手で${before.hands[1-actor][m.to]}の手を攻撃（${names[actor]} 手${m.from+1} → ${names[1-actor]} 手${m.to+1}）`;
  selected=null;
  const duration=cpuAttack?attackDurations[$('speed').value]:320;
  // impactまでは内部局面もカードの数字も攻撃前。impactで局面と棋譜を一度だけ確定する。
  const finished=await sequence.play(duration,phase=>{
    if(phase==='done') { animation=null;render();return; }
    animation={actor,move:m,phase,cpu:cpuAttack};
    if(phase==='source') {
      $('attack-message').textContent=description;
      $('calculation').textContent='';
    }
    // 攻撃内容は最初から最後まで維持し、数字が変わるときに計算結果を加える。
    if(phase==='impact') {
      state=after;history.push({state:clone(state),text});
      $('calculation').textContent=lasting;
    }
    render();
  });
  if(finished)cpu();
}
function cpu() {
  if(winner(state)===null&&isCPU()) {
    $('attack-message').textContent='CPUが考えています…';
    run('cpu',r=>{if(r.move)void move(r.move,r.method);});render();
  }
}
function start() {
  cancel();state=clone(initial);history=[{state:clone(state)}];selected=null;analysisOpen=false;
  $('setup').hidden=true;$('analysis').hidden=true;$('play').hidden=false;
  $('attack-message').textContent='攻撃内容はここに表示されます。';
  $('calculation').textContent='最初の一手を考えよう。';render();cpu();
  $('play').scrollIntoView({block:'start'});
}
$('form').onsubmit=e=>{e.preventDefault();const s=read();if(s){initial=s;start();}};
$('board').onclick=e=>{
  const b=e.target.closest('button[data-player]');
  if(!b||b.disabled||animation||busy)return;
  const p=Number(b.dataset.player),i=Number(b.dataset.hand);
  if(p===state.turn) { selected=selected===i?null:i;render(); }
  else if(selected!==null)void move({from:selected,to:i});
};
$('undo').onclick=()=>{
  cancel();history=undo(history,$('mode').value==='cpu',Number($('human').value));
  state=clone(history.at(-1).state);selected=null;
  $('attack-message').textContent='直前の操作を戻しました。';
  $('calculation').textContent=history.at(-1).text??'最初の一手を考えよう。';render();cpu();
};
$('restart').onclick=start;
function back() {
  cancel();selected=null;analysisOpen=false;
  $('setup').hidden=false;$('play').hidden=true;$('analysis').hidden=true;
  $('setup').scrollIntoView({block:'start'});
}
for(const id of ['new','back','close-analysis'])$(id).onclick=back;
const label={win:'勝ち',loss:'負け',draw:'引き分け',unknown:'未解析'};
$('analyze').onclick=()=>{const s=read();if(!s)return;state=s;analysisOpen=true;$('setup').hidden=true;$('play').hidden=true;$('analysis').hidden=false;$('result').textContent='状態遷移を解析しています…';run('analysis',r=>{if(!analysisOpen)return;$('result').innerHTML=`<p class="evaluation">${names[state.turn]}の手番：${label[r.outcome]}</p><p>${r.complete?'完全解析済み':'未解析：時間・状態数の上限に到達'} ／ ${r.states.toLocaleString()} 状態</p><p>${r.distance!==null?`終局まで ${r.distance} 手（双方が最善の場合）`:r.outcome==='draw'?'双方が負けを回避できる無限プレイです。':'終局までの手数は確定していません。'}</p><p class="note">勝つ側は最短勝利、負ける側は最長抵抗。各手の評価は、現在の手番のプレイヤーから見た評価です。</p><div class="table-scroll"><table><thead><tr><th>合法手</th><th>遷移後 A / B</th><th>評価</th><th>終局まで</th></tr></thead><tbody>${r.moves.map(m=>`<tr><td>手${m.move.from+1} → 相手の手${m.move.to+1}</td><td>[${m.state.hands[0]}] / [${m.state.hands[1]}]</td><td>${label[m.outcome]}${m.outcome==='win'?' · 必勝手':''}</td><td>${m.distance??'—'}</td></tr>`).join('')}</tbody></table></div>${!r.moves.length?'<p>終局のため合法手はありません。</p>':''}`;});};
inputs();
