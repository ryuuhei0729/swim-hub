// LP v4.2 Deco Dynamic — グローバル型拡張
// Window.__stopStopwatch: ラッププログレスバーのゴールタッチ時にストップウォッチを停止する

declare global {
  interface Window {
    __stopStopwatch?: () => void;
  }
}

export {};
