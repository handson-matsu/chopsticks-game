import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as game from '../js/game.js';
import * as presentation from '../js/presentation.js';
import {analyze,chooseMove} from '../js/analysis.js';

const counter=readFileSync(new URL('../access-counter.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('../js/ui.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replaceAll('import.meta.url',JSON.stringify(new URL('../js/ui.js',import.meta.url).href));
// 既存教材のURLを独立した固定値として照合。実fetchはどのテストにも渡さない。
const endpoint='https://script.google.com/macros/s/AKfycbxssCIHsD-N97SHxNC_GN0ihYeC0qy-lb-EY0KmSs6Gnztaph1sITMerLVEnNWOGkYc/exec';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function counterContext(fetch){const context=vm.createContext({window:{},fetch});vm.runInContext(counter,context);return context;}
test('共通GASへappのみ指定したGETをkeepalive付きで1回送る',()=>{
  const calls=[];counterContext((...args)=>{calls.push(args);return Promise.resolve({});});
  assert.equal(calls.length,1);const [url,options]=calls[0],parsed=new URL(url);
  assert.equal(parsed.origin+parsed.pathname,endpoint);
  assert.deepEqual([...parsed.searchParams],[['app','chopsticks-game']]);
  assert.deepEqual(JSON.parse(JSON.stringify(options)),{method:'GET',mode:'no-cors',cache:'no-store',credentials:'omit',keepalive:true});
});
test('同じページで再実行しても再送せず、新規ページのみ別の1回',()=>{
  let calls=0;const fetch=()=>{calls++;return Promise.resolve({});},context=counterContext(fetch);
  vm.runInContext(counter,context);vm.runInContext(counter,context);assert.equal(calls,1);
  counterContext(fetch);assert.equal(calls,2);
});
test('未完了の通信を待たず、応答本文も読まない',async()=>{
  const context=counterContext(()=>new Promise(()=>{}));
  vm.runInContext('window.ready=true',context);assert.equal(context.window.ready,true);
  const reads=[];counterContext(()=>Promise.resolve({get text(){reads.push('text');},get json(){reads.push('json');}}));
  await tick();assert.deepEqual(reads,[]);
});

// ブラウザや外部通信を起動せず、実ui.jsのイベントハンドラーを最小DOMで実行する。
function harness(fetch){
  const elements=new Map(),timers=new Map();let timerId=0;
  function element(id=''){
    return {id,value:'',hidden:false,disabled:false,textContent:'',innerHTML:'',children:[],dataset:{},validity:{valid:true},
      addEventListener(){},setAttribute(){},scrollIntoView(){},focus(){},
      classList:{toggle(){},add(){},remove(){}},
      querySelector(){return element();},querySelectorAll(){return [];},closest(){return element();},
      replaceChildren(...children){this.children=children;},reportValidity(){return true;}};
  }
  const document={getElementById(id){if(!elements.has(id))elements.set(id,element(id));return elements.get(id);},createElement:()=>element(),querySelector:()=>null};
  for(const [id,value] of Object.entries({rule:'modulo',n:'5',mode:'cpu',level:'medium',turn:'0',human:'0',speed:'fast'}))document.getElementById(id).value=value;
  document.getElementById('n').min='2';document.getElementById('n').max='20';
  class Worker {
    constructor(){this.stopped=false;}
    terminate(){this.stopped=true;}
    postMessage(data){queueMicrotask(()=>{if(!this.stopped)this.onmessage({data:{result:data.type==='analysis'?analyze(data.state):chooseMove(data.state,data.level)}});});}
  }
  const context=vm.createContext({window:{},document,fetch,Worker,URL,...game,...presentation,
    setTimeout(callback){timers.set(++timerId,callback);return timerId;},clearTimeout(id){timers.delete(id);}});
  // 実AttackSequenceに仮想時計を注入する（外部通信とは無関係）。
  context.AttackSequence=class extends presentation.AttackSequence{constructor(){super({setTimeout:context.setTimeout,clearTimeout:context.clearTimeout});}};
  vm.runInContext(counter,context);vm.runInContext(ui,context);
  return {context,document,async drain(){for(let i=0;i<30;i++){await tick();if(!timers.size)return;const [id,callback]=timers.entries().next().value;timers.delete(id);callback();}throw Error('演出が終了しません');}};
}
for(const kind of ['成功','通信拒否','同期例外','fetch未対応','応答未完了'])test(`${kind}：実UIの開始・CPU・Undo・再挑戦・ルール変更・解析・画面切替で追加送信なし`,async()=>{
  let calls=0;
  const mock=()=>{calls++;if(kind==='同期例外')throw Error('blocked');if(kind==='通信拒否')return Promise.reject(Error('offline'));if(kind==='応答未完了')return new Promise(()=>{});return Promise.resolve({});};
  const {context,document,drain}=harness(kind==='fetch未対応'?undefined:mock);
  const click=id=>document.getElementById(id).onclick();
  document.getElementById('form').onsubmit({preventDefault(){}});
  const board=document.getElementById('board');
  const hand=(p,i)=>board.onclick({target:{closest:()=>({disabled:false,dataset:{player:String(p),hand:String(i)}})}});
  hand(0,0);hand(1,0);await drain();
  assert.equal(vm.runInContext('history.length',context),3); // 人間+CPU
  click('undo');await drain();assert.equal(vm.runInContext('history.length',context),1);
  click('restart');assert.equal(vm.runInContext('state.hands[0][0]',context),1);
  click('back');assert.equal(document.getElementById('setup').hidden,false);
  document.getElementById('rule').value='cutoff';vm.runInContext('inputs()',context);
  click('analyze');await drain();assert.match(document.getElementById('result').innerHTML,/完全解析済み/);
  click('close-analysis');assert.equal(document.getElementById('setup').hidden,false);
  vm.runInContext(counter,context);await tick();
  assert.equal(calls,kind==='fetch未対応'?0:1);
  assert.equal(context.window.chopsticksAccessRecorded,true);
});
test('deferスクリプトはHTMLに1個、UI・Worker・解析に送信処理を接続しない',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.equal((html.match(/src="access-counter\.js"/g)||[]).length,1);
  assert.match(html,/<script defer src="access-counter\.js"><\/script>/);
  for(const file of ['ui.js','worker.js','game.js','analysis.js','presentation.js'])assert.doesNotMatch(readFileSync(new URL('../js/'+file,import.meta.url),'utf8'),/script\.google\.com|access-counter|chopsticksAccessRecorded|\bfetch\s*\(/);
  assert.doesNotMatch(counter,/addEventListener|setTimeout|setInterval|document\.|console\.|\bawait\b/);
});
