export function validate(s) {
  if (!['modulo','cutoff'].includes(s.rule) || !Number.isInteger(s.n) || s.n<2 || s.n>20 || ![0,1].includes(s.turn)) throw Error('ルール・n・手番を確認してください');
  const max=s.rule==='modulo'?s.n-1:s.n;
  if (!Array.isArray(s.hands)||s.hands.length!==2 || s.hands.some(h=>!Array.isArray(h)||h.length<1||h.length>6||h.some(v=>!Number.isInteger(v)||v<0||v>max))) throw Error(`各手は0〜${max}の整数、各プレイヤー1〜6手で指定してください`);
  if(s.hands.flat().every(v=>v===0)) throw Error('両者の全手が0の局面は開始できません');
  return s;
}
export const clone=s=>({...s,hands:s.hands.map(h=>[...h])});
export function winner(s){if(s.hands[0].every(v=>v===0))return 1;if(s.hands[1].every(v=>v===0))return 0;return null;}
export function legalMoves(s){if(winner(s)!==null)return [];return s.hands[s.turn].flatMap((v,from)=>v?s.hands[1-s.turn].flatMap((w,to)=>w?[{from,to}]:[]):[]);}
export function applyMove(s,m){if(!legalMoves(s).some(x=>x.from===m.from&&x.to===m.to))throw Error('不正な手です');const t=clone(s),sum=s.hands[s.turn][m.from]+s.hands[1-s.turn][m.to];t.hands[1-s.turn][m.to]=s.rule==='modulo'?sum%s.n:sum>s.n?0:sum;t.turn=1-s.turn;return t;}
export const key=s=>`${s.rule}:${s.n}:${s.turn}:${s.hands.map(h=>[...h].sort((a,b)=>a-b).join(',')).join('|')}`;
export const rank=s=>s.hands.flat().reduce((a,v)=>a+(v?s.n+1-v:0),0);
export function undo(history,cpu=false,human=0){if(history.length<=1)return history;let i=history.length-2;if(cpu)while(i>0&&history[i].state.turn!==human)i--;return history.slice(0,i+1);}
