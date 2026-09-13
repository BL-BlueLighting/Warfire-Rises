import { ExchangeRates } from "./types";

const FALLBACK_RATES: ExchangeRates = {
  USD_CNY: 7.24,
  USD_HKD: 7.82,
  USD_EUR: 0.92,
  USD_GBP: 0.79,
  USD_JPY: 156.3,
  USD_RUB: 89.5,
};

const FALLBACK_KEYWORDS: string[] = [
  "Geopolitical tensions",
  "Economic uncertainty",
  "Energy transition",
  "AI arms race",
  "Supply chain reshuffling",
  "Climate policy debate",
  "Naval posturing",
  "Trade disputes",
];

export async function fetchExchangeRates(): Promise<ExchangeRates> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { rates: Record<string, number> };
    return {
      USD_CNY: data.rates.CNY ?? FALLBACK_RATES.USD_CNY,
      USD_HKD: data.rates.HKD ?? FALLBACK_RATES.USD_HKD,
      USD_EUR: data.rates.EUR ?? FALLBACK_RATES.USD_EUR,
      USD_GBP: data.rates.GBP ?? FALLBACK_RATES.USD_GBP,
      USD_JPY: data.rates.JPY ?? FALLBACK_RATES.USD_JPY,
      USD_RUB: data.rates.RUB ?? FALLBACK_RATES.USD_RUB,
    };
  } catch {
    return { ...FALLBACK_RATES };
  }
}

/** The news feed the game reads; the Rust side allowlists this prefix. */
const NEWS_FEED = "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en";

/**
 * Fetch the feed.
 *
 * Inside the desktop app this goes through Rust: the feed sends no CORS
 * headers, so a plain `fetch` from the webview is blocked before it leaves and
 * the game falls back to its bundled keywords for every campaign. The browser
 * build (`npm run dev`) has no Rust to ask, and keeps taking the same fallback.
 */
async function fetchNewsFeed(): Promise<string> {
  const invoke = (
    window as unknown as { __TAURI_INTERNALS__?: { invoke?: (cmd: string, args?: unknown) => Promise<unknown> } }
  ).__TAURI_INTERNALS__?.invoke;

  if (invoke) {
    const xml = (await invoke("fetch_feed", { url: NEWS_FEED })) as string;
    if (!xml) throw new Error("empty feed");
    return xml;
  }

  const res = await fetch(NEWS_FEED, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export async function fetchWorldKeywords(): Promise<string[]> {
  try {
    const xml = await fetchNewsFeed();

    const headlines: string[] = [];
    const titleRegex = /<title>(.*?)<\/title>/g;
    let match: RegExpExecArray | null;
    let skipFirst = true; // first <title> is the feed title
    while ((match = titleRegex.exec(xml)) !== null) {
      if (skipFirst) {
        skipFirst = false;
        continue;
      }
      const title = match[1]
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
      if (title && title.length > 10) headlines.push(title);
    }

    if (headlines.length === 0) return FALLBACK_KEYWORDS;

    const keywords = extractKeywords(headlines.slice(0, 20));
    return keywords.length >= 3 ? keywords : FALLBACK_KEYWORDS;
  } catch {
    return [...FALLBACK_KEYWORDS];
  }
}

const KEYWORD_PATTERNS: [RegExp, string][] = [
  [/war|conflict|invasion|strike|military|troops|missile|naval|air force/gi, "Military conflict"],
  [/economy|inflation|market|stock|trade|tariff|sanction|gdp|recession/gi, "Economic turmoil"],
  [/election|vote|president|prime minister|government|parliament|coup|protest/gi, "Political upheaval"],
  [/china|beijing|chinese|xi|taiwan|south china sea/gi, "China tensions"],
  [/russia|moscow|putin|kremlin|ukraine/gi, "Russia-Ukraine conflict"],
  [/nuclear|atomic|uranium|enrichment|icbm|weapon/gi, "Nuclear concerns"],
  [/climate|emission|carbon|warming|flood|hurricane|earthquake|wildfire/gi, "Climate crisis"],
  [/cyber|hack|ransomware|data breach|ai|artificial intelligence/gi, "Cyber warfare"],
  [/oil|gas|energy|opec|petroleum|fuel/gi, "Energy crisis"],
  [/terror|extremist|bombing|attack|militant|insurgent/gi, "Terrorism threat"],
  [/alliance|nato|treaty|diplomacy|summit|un security council/gi, "Diplomatic realignment"],
  [/refugee|migrant|border|humanitarian|famine|drought/gi, "Humanitarian crisis"],
  [/tech|silicon|semiconductor|chip|technology|startup/gi, "Tech competition"],
  [/pandemic|virus|outbreak|disease|health|who/gi, "Health crisis"],
  [/debt|crisis|default|imf|world bank|bailout/gi, "Financial instability"],
];

function extractKeywords(headlines: string[]): string[] {
  const scored = new Map<string, number>();

  for (const headline of headlines) {
    for (const [pattern, keyword] of KEYWORD_PATTERNS) {
      if (pattern.test(headline)) {
        scored.set(keyword, (scored.get(keyword) ?? 0) + 1);
      }
    }
  }

  return [...scored.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([keyword]) => keyword);
}

export function getTodayDate(): string {
  const now = new Date();
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
}
