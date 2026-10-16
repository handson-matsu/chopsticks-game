// 共通教材と同じGASカウンター。ゲームの操作イベントには接続しない。
(() => {
  if (window.chopsticksAccessRecorded) return;
  window.chopsticksAccessRecorded = true;
  try {
    fetch('https://script.google.com/macros/s/AKfycbxssCIHsD-N97SHxNC_GN0ihYeC0qy-lb-EY0KmSs6Gnztaph1sITMerLVEnNWOGkYc/exec?app=chopsticks-game', {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      credentials: 'omit',
      keepalive: true,
    }).catch(() => {});
  } catch {
    // fetch未対応・同期例外も無視する。再送・表示・ログ出力はしない。
  }
})();
