/**
 * User-Agent 文字列から端末/OS/ブラウザを推定する軽量パーサ。
 * 問い合わせメールの triage 用途のため best-effort（外部ライブラリ非依存）。
 */
export type ParsedUserAgent = {
  /** 端末/OS 表記（例: "iPhone (iOS 17.5)", "Android 14 (Pixel 8)", "Windows", "macOS"） */
  device: string;
  /** ブラウザ表記（例: "Safari 17.5", "Chrome 125"） */
  browser: string;
};

const UNKNOWN = "不明";

function detectOs(ua: string): { name: string; version: string } | null {
  // iOS (iPhone / iPad / iPod)
  const ios = ua.match(/(?:iPhone|iPad|iPod).*?OS (\d+(?:_\d+)*)/);
  if (ios) return { name: "iOS", version: ios[1].replace(/_/g, ".") };

  const android = ua.match(/Android (\d+(?:\.\d+)*)/);
  if (android) return { name: "Android", version: android[1] };

  if (/Windows NT/.test(ua)) return { name: "Windows", version: "" };

  const mac = ua.match(/Mac OS X (\d+(?:[._]\d+)*)/);
  if (mac) return { name: "macOS", version: mac[1].replace(/_/g, ".") };

  if (/CrOS/.test(ua)) return { name: "ChromeOS", version: "" };
  if (/Linux/.test(ua)) return { name: "Linux", version: "" };
  return null;
}

function detectDeviceModel(ua: string): string | null {
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/iPod/.test(ua)) return "iPod";
  // Android の端末モデル: "Android 14; Pixel 8 Build/..." の "Pixel 8" を抽出
  const android = ua.match(/Android [\d.]+;\s?([^;)]+?)(?:\s+Build|;|\))/);
  if (android) {
    const model = android[1].trim();
    // Chrome の UA 削減で "K" 等の無意味値になる場合は除外
    if (model && model !== "K" && !/^wv$/i.test(model)) return model;
    return "Android端末";
  }
  return null;
}

function detectBrowser(ua: string): { name: string; version: string } | null {
  // 順序が重要（Edge/Chrome/Firefox を Safari より先に判定）
  const edge = ua.match(/Edg(?:iOS|A)?\/(\d+)/);
  if (edge) return { name: "Edge", version: edge[1] };

  const firefox = ua.match(/(?:Firefox|FxiOS)\/(\d+)/);
  if (firefox) return { name: "Firefox", version: firefox[1] };

  const chrome = ua.match(/(?:Chrome|CriOS)\/(\d+)/);
  if (chrome && !/OPR|Edg/.test(ua)) return { name: "Chrome", version: chrome[1] };

  const opera = ua.match(/OPR\/(\d+)/);
  if (opera) return { name: "Opera", version: opera[1] };

  const safari = ua.match(/Version\/(\d+(?:\.\d+)?).*Safari/);
  if (safari) return { name: "Safari", version: safari[1] };

  if (/Safari/.test(ua)) return { name: "Safari", version: "" };
  return null;
}

export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  if (!ua || ua.trim().length === 0) {
    return { device: UNKNOWN, browser: UNKNOWN };
  }

  const os = detectOs(ua);
  const model = detectDeviceModel(ua);

  let device: string;
  const osLabel = os ? (os.version ? `${os.name} ${os.version}` : os.name) : null;
  if (model && osLabel) {
    device = `${model} (${osLabel})`;
  } else if (model) {
    device = model;
  } else if (osLabel) {
    // デスクトップOSは端末名が取れないため OS 名 + デスクトップ表記
    const isDesktop = os && ["Windows", "macOS", "Linux", "ChromeOS"].includes(os.name);
    device = isDesktop ? `デスクトップ (${osLabel})` : osLabel;
  } else {
    device = UNKNOWN;
  }

  const browserInfo = detectBrowser(ua);
  const browser = browserInfo
    ? browserInfo.version
      ? `${browserInfo.name} ${browserInfo.version}`
      : browserInfo.name
    : UNKNOWN;

  return { device, browser };
}
