// UI専用。局面の計算と勝敗判定はgame.jsに委ねる。
export const attackDurations = {slow:3000, normal:2000, fast:800};
export function clampInteger(value, min, max) {
  const number = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(number) ? Math.round(number) : min));
}
export function attackFormula(state, move) {
  const a = state.hands[state.turn][move.from];
  const b = state.hands[1-state.turn][move.to];
  const sum = a+b;
  if (state.rule === 'modulo') return `${a} + ${b} = ${sum} → ${sum%state.n}（mod ${state.n}）`;
  return sum > state.n ? `${a} + ${b} = ${sum} > ${state.n} → 消滅（0）` : `${a} + ${b} = ${sum} ≤ ${state.n} → ${sum}`;
}
// 中断時は待機を解放する。世代番号で、すでにキューに入ったコールバックも無効化する。
export class AttackSequence {
  constructor(clock = globalThis) { this.clock=clock; this.generation=0; this.pending=null; }
  cancel() {
    this.generation++;
    if(this.pending) {
      this.clock.clearTimeout(this.pending.timer);
      this.pending.resolve(false);
      this.pending=null;
    }
  }
  async play(duration, onPhase) {
    this.cancel();
    const generation=this.generation;
    const wait=ms=>new Promise(resolve=>{
      const timer=this.clock.setTimeout(()=>{this.pending=null;resolve(true);},ms);
      this.pending={timer,resolve};
    });
    for(const [phase,fraction] of [['source',.2],['target',.2],['formula',.3],['impact',.3]]) {
      if(generation!==this.generation)return false;
      onPhase(phase);
      if(generation!==this.generation)return false;
      if(!await wait(duration*fraction) || generation!==this.generation)return false;
    }
    onPhase('done');
    return true;
  }
}
