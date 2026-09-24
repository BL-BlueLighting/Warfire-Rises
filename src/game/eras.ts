import { Country, GovernmentType } from "./types";
import { COUNTRIES } from "./countries";
import { REGIONS } from "../map/provinces";
import eraRegions from "../map/data/eraRegions.json";

/**
 * Historical scenarios.
 *
 * Each scenario is a set of real borders — historical-basemaps' world of 1938,
 * 1945, 1994 or 2000 — loaded by the map in place of the present day, plus the
 * numbers and alignments the twelve nations had that year.
 *
 * The borders themselves live in `public/eras/<id>.json`, built by
 * `scripts/build-eras.mjs`; the provinces the simulation fights over come from
 * the same source, turned into ownership by `eraProvinceOwners`.

 * A nation missing from an era's roster did not exist yet: it is out of play
 * and its modern territory is held by whoever the era's borders say holds it.
 */

export type EraId = "ww2-eve" | "ww2-fight" | "ww2-war" | "late-20c" | "early-21c";

export interface EraNation {
  /** What this nation was called that year, as an i18n key prefix. */
  nameKey?: string;
  /**
   * What kind of state it was that year. A nation that changed its nature
   * keeps its modern label unless the scenario says otherwise — which is how
   * the Republic of China came to be displayed as a communist state.
   */
  government?: GovernmentType;
  /** Its name in English, for the paths that never localise. */
  name?: string;
  /** Millions. */
  population?: number;
  economy?: number;
  military?: number;
  stability?: number;
  publicSupport?: number;
  /** Billions. */
  treasury?: number;
  /** Manpower pool, thousands. */
  manpower?: number;
  /** Warheads; a scenario before 1945 has none, whatever the nation is. */
  nuclear?: boolean;
  nukes?: number;
  /** Standing divisions. */
  divisions?: number;
  /** Kept out of the roster on purpose: see `Era.nations`. */
  absent?: never;
}

export interface Era {
  id: EraId;
  nameKey: string;
  descKey: string;
  /** The calendar day the campaign opens on. */
  start: { year: number; month: number; day: number };
  /** The twelve-nation roster with this era's numbers. A nation left out did
   *  not exist yet: it is out of play, and its land is whoever's the borders
   *  say it is. */
  nations: Record<string, EraNation>;
  /** Starting opinions, overriding the modern table. Only the pairs listed. */
  relations?: Record<string, Record<string, number>>;
  allies?: Record<string, string[]>;
  enemies?: Record<string, string[]>;
  /**
   * The flag each nation actually flew, by file name in `public/flags/hist/`.
   * A nation left out kept the flag it still uses today — Britain, and the
   * whole roster after the war. See `flagSrc` in flags.ts.
   */
  flags?: Record<string, string>;
  /**
   * Wars already under way when the scenario opens.
   *
   * The first pair involving the player becomes the live war, so a campaign
   * that begins mid-war actually begins mid-war rather than one declaration
   * short of it.
   */
  atWar?: [string, string][];
  /** Provinces the central government did not actually run. See `EraAutonomy`. */
  autonomous?: EraAutonomy[];
  /**
   * Government types that differ from the modern roster's, by country id.
   * A nation left out keeps the label it has today.
   */
  governments?: Record<string, GovernmentType>;
}

/**
 * Land that is one country on paper and somebody else's on the ground.
 *
 * Not a separate nation: the borders do not move, and the province stays in
 * the country it belongs to for war, peace and every list in the game. What
 * the map draws differently is the *control* — the provinces the capital did
 * not govern. The Republic of China is the case this exists for: it was one
 * country and a dozen governments' worth of country, and a 1938 map that
 * colours it as uniformly as France is not a map of 1938.
 */
export interface EraAutonomy {
  /** Who actually runs these provinces: `faction.jin` → 晋系. */
  nameKey: string;
  /** The provinces, named as the region dataset names them: `"CHN:Shanxi"`. */
  regions: string[];
}

/**
 * The lang key for a scenario's blurb about a nation: `era.ww2_eve.CHN.desc`.
 *
 * Derived rather than declared, so a scenario can write about as many of the
 * twelve as it has something to say about — a nation with no such key keeps
 * its modern blurb. The id's hyphens become underscores, as they do in every
 * other era key.
 */
export function eraDescKey(eraId: string, countryId: string): string {
  return `era.${eraId.replace(/-/g, "_")}.${countryId}.desc`;
}

/**
 * The codes a decision file's `PlayTime` accepts.
 *
 * They are the initials of the scenario names in English — 梦魇 Nightmare,
 * 死斗 Death Grapple, 初醒 First Awakening, 解体 Dissolution, 复兴 Revival —
 * rather than the era ids: a decision file is written by hand, and `ww2-fight`
 * is not what 1942 is called.
 */
export const PLAY_TIME_CODES: Record<string, EraId> = {
  ngtm: "ww2-eve",
  dfig: "ww2-fight",
  waku: "ww2-war",
  splt: "late-20c",
  resm: "early-21c",
};

/** The scenario a decision with no `PlayTime` belongs to. */
export const DEFAULT_PLAY_TIME = "resm";

/** Is this a code the game knows? Used to report a file that got one wrong. */
export function isPlayTimeCode(code: unknown): boolean {
  return typeof code === "string" && PLAY_TIME_CODES[code.trim().toLowerCase()] !== undefined;
}

/**
 * The scenarios a decision is for — one code, or a list of them.
 *
 * No `PlayTime` means `resm`: a decision that does not say when it belongs is
 * for the present day, which is what decision files written before this field
 * existed were for anyway.
 */
export function playTimeEras(playTime: string | string[] | undefined): EraId[] {
  const codes =
    playTime === undefined ? [DEFAULT_PLAY_TIME] : Array.isArray(playTime) ? playTime : [playTime];
  const eras: EraId[] = [];
  for (const code of codes) {
    const era = isPlayTimeCode(code) ? PLAY_TIME_CODES[code.trim().toLowerCase()] : undefined;
    if (era && !eras.includes(era)) eras.push(era);
  }
  return eras;
}

/** A short label for the picker: "1936" rather than a slogan. */
export function eraYear(era: Era): string {
  return String(era.start.year);
}

/** `{ year, month (1-12), day }` for a campaign that has run `days` days. */
export function eraDate(era: Era, days: number): { year: number; month: number; day: number } {
  const date = new Date(Date.UTC(era.start.year, era.start.month - 1, era.start.day));
  date.setUTCDate(date.getUTCDate() + Math.max(0, Math.floor(days)));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/** "September 3, 1939". */
export function formatEraDate(era: Era, days: number): string {
  const { year, month, day } = eraDate(era, days);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${months[month - 1]} ${day}, ${year}`;
}

// ── The scenarios ───────────────────────────────────────────────────
//
// Numbers are the historical ones as best they are known — millions for people,
// billions for money, divisions and manpower as fielded. The territory of each
// scenario is not written here: it comes from the generated borders.

/**
 * What the twelve nations flew between 1938 and 1945.
 *
 * Britain's flag is the one exception: the Union Jack of 1938 is the Union
 * Jack of today, so it is not listed. Everything here is the original file
 * from Wikimedia Commons, downloaded by `scripts/fetch-flags.py` — nothing is
 * drawn by hand.
 */
const WW2_FLAGS: Record<string, string> = {
  USA: "usa", // 48 stars
  CHN: "roc", // the Republic, not the People's Republic
  RUS: "ussr",
  DEU: "reich",
  JPN: "jpn", // 1870-1999, the empire's
  IND: "raj", // the Raj, not the republic
  IRN: "iran", // the lion and sun
  BRA: "bra",
};

/** 1942 only: France is Free France, and flies the Cross of Lorraine. */
const WW2_FIGHT_FLAGS: Record<string, string> = { ...WW2_FLAGS, FRA: "fra_free" };

/**
 * Who actually ran China's provinces, 1938-1942.
 *
 * The Northern Expedition did not disarm the cliques; it made them sign on.
 * The war was fought by 晋系 in Shanxi, 桂系 in Guangxi, 滇系 in Yunnan and
 * the 三马 in the northwest — under Chongqing's flag, and not always on
 * Chongqing's orders. 新疆 answered to 盛世才 and, behind him, to Moscow;
 * 西藏 had governed itself since 1912.
 *
 * Xinjiang drops out in 1945 (see below) — 盛世才 broke with Moscow in 1942
 * and was removed by Chongqing in 1944, and the province was the Nationalist
 * government's for the last year of the war.
 */
const WARLORD_CHINA: EraAutonomy[] = [
  { nameKey: "faction.jin", regions: ["CHN:Shanxi"] }, // 阎锡山
  { nameKey: "faction.gui", regions: ["CHN:Guangxi"] }, // 李宗仁、白崇禧
  { nameKey: "faction.dian", regions: ["CHN:Yunnan"] }, // 龙云
  { nameKey: "faction.ma", regions: ["CHN:Ningxia", "CHN:Qinghai", "CHN:Gansu"] }, // 三马
  { nameKey: "faction.xinjiang", regions: ["CHN:Xinjiang"] }, // 盛世才
  { nameKey: "faction.tibet", regions: ["CHN:Tibet"] }, // 噶厦
];

/**
 * What kind of state each of the twelve was in the war years.
 *
 * Only the ones that differ from today are listed. The Republic of China was
 * a one-party Nationalist state, not a communist one; the Reich and Vargas's
 * Estado Novo were dictatorships, not democracies; the Empire of Japan, the
 * Raj and Reza Shah's Iran were all monarchies.
 */
const WW2_GOVERNMENTS: Record<string, GovernmentType> = {
  CHN: "authoritarian", // 中华民国: KMT one-party rule (训政)
  RUS: "communist",
  DEU: "authoritarian", // the Reich
  JPN: "monarchy", // the Empire
  IND: "monarchy", // the Raj, under the Crown
  IRN: "monarchy", // Imperial State of Iran
  BRA: "authoritarian", // Vargas's Estado Novo, 1937-1945
};

/**
 * 1994: two of the twelve had changed nature since the war years and changed
 * back later. Yeltsin's Russia was three years old and still counted as a
 * democracy; the DPRK was Kim Il-sung's, and he had months to live.
 */
const LATE_20C_GOVERNMENTS: Record<string, GovernmentType> = {
  RUS: "democracy",
  PRK: "communist",
};

/** 1945: the same map, minus Xinjiang. */
const WARLORD_CHINA_1945: EraAutonomy[] = WARLORD_CHINA.filter(
  (bloc) => bloc.nameKey !== "faction.xinjiang"
);

/**
 * 1938: the eve of the war.
 *
 * The Anschluss has not happened: Austria is still its own country, the Reich
 * is where Versailles left it, Britain holds the Raj and Palestine, Japan
 * holds Korea, and the Soviet Union is the whole of the old empire.
 *
 * The borders are the dataset's 1938; the campaign opens that January.
 */
const WW2_EVE: Era = {
  id: "ww2-eve",
  nameKey: "era.ww2_eve.name",
  descKey: "era.ww2_eve.desc",
  start: { year: 1938, month: 1, day: 1 },
  nations: {
    USA: { population: 128, economy: 42, military: 30, stability: 62, treasury: 3000, divisions: 8, manpower: 1200 },
    CHN: {
      nameKey: "era.ww2_eve.CHN", name: "Republic of China", population: 500, economy: 12, military: 22, stability: 30, treasury: 200, divisions: 10, manpower: 4000 },
    RUS: {
      nameKey: "era.ww2_eve.RUS", name: "Soviet Union", population: 168, economy: 30, military: 55, stability: 45, treasury: 1500, divisions: 22, manpower: 2500 },
    GBR: {
      nameKey: "era.ww2_eve.GBR", name: "British Empire", population: 47, economy: 55, military: 45, stability: 66, treasury: 2500, divisions: 7, manpower: 480 },
    FRA: {
      nameKey: "era.ww2_eve.FRA", name: "French Third Republic", population: 42, economy: 45, military: 45, stability: 58, treasury: 1200, divisions: 6, manpower: 400 },
    DEU: {
      nameKey: "era.ww2_eve.DEU", name: "German Reich", population: 68, economy: 60, military: 55, stability: 62, treasury: 2000, divisions: 9, manpower: 700 },
    JPN: {
      nameKey: "era.ww2_eve.JPN", name: "Empire of Japan", population: 71, economy: 48, military: 62, stability: 70, treasury: 1500, divisions: 12, manpower: 900 },
    IND: {
      nameKey: "era.ww2_eve.IND", name: "British India", population: 380, economy: 18, military: 25, stability: 40, treasury: 400, divisions: 6, manpower: 3000 },
    IRN: {
      nameKey: "era.ww2_eve.IRN", name: "Imperial State of Iran", population: 15, economy: 12, military: 18, stability: 42, treasury: 150, divisions: 3, manpower: 150 },
    BRA: {
      nameKey: "era.ww2_eve.BRA", name: "United States of Brazil", population: 44, economy: 22, military: 16, stability: 50, treasury: 300, divisions: 3, manpower: 300 },
  },
  relations: {
    DEU: { GBR: -40, FRA: -50, RUS: -60, JPN: 30, USA: -20 },
    RUS: { DEU: -60, GBR: -30, USA: -20, JPN: -30 },
    JPN: { CHN: -70, USA: -25, RUS: -30, GBR: -20 },
    GBR: { DEU: -40, RUS: -30, JPN: -20, USA: 70 },
    FRA: { DEU: -50, RUS: -25, USA: 65 },
    CHN: { JPN: -70, RUS: 10, USA: 20 },
  },
  allies: { DEU: [], RUS: [], GBR: ["FRA"], FRA: ["GBR", "USA"], USA: ["GBR"], JPN: [], CHN: [], IND: [], IRN: [], BRA: [] },
  enemies: { DEU: ["RUS", "FRA"], RUS: ["DEU", "JPN"], JPN: ["CHN", "RUS"], CHN: ["JPN"] },
  // The quiet is Europe's: Japan and China have been fighting since July 1937,
  // and a January 1938 campaign that opened in peace would be the wrong war.
  atWar: [["JPN", "CHN"]],
  flags: WW2_FLAGS,
  autonomous: WARLORD_CHINA,
  governments: WW2_GOVERNMENTS,
};

/**
 * 1942: the death grapple.
 *
 * The fifth year of the war in China, and the year the Axis stood furthest from
 * home: Japan holds the whole southern operation — the Philippines, the Indies,
 * Malaya, Burma, the Chinese coast — while the Reich has swallowed Austria, the
 * Czech lands and Poland, and the Soviet Union has taken the Baltic states.
 *
 * The borders are the 1938 ones with those changes applied: the dataset has no
 * year between 1938 and 1945.
 */
const WW2_FIGHT: Era = {
  id: "ww2-fight",
  nameKey: "era.ww2_fight.name",
  descKey: "era.ww2_fight.desc",
  start: { year: 1942, month: 1, day: 1 },
  nations: {
    USA: { population: 134, economy: 52, military: 55, stability: 64, treasury: 4200, divisions: 12, manpower: 1400 },
    CHN: {
      nameKey: "era.ww2_fight.CHN", name: "Republic of China", population: 520, economy: 8, military: 28, stability: 22, treasury: 120, divisions: 14, manpower: 3800 },
    RUS: {
      nameKey: "era.ww2_fight.RUS", name: "Soviet Union", population: 130, economy: 26, military: 68, stability: 42, treasury: 1400, divisions: 30, manpower: 2200 },
    GBR: {
      nameKey: "era.ww2_fight.GBR", name: "British Empire", population: 48, economy: 54, military: 52, stability: 68, treasury: 2200, divisions: 11, manpower: 520 },
    FRA: {
      nameKey: "era.ww2_fight.FRA", name: "Free France", population: 40, economy: 34, military: 38, stability: 40, treasury: 600, divisions: 6, manpower: 300 },
    DEU: {
      nameKey: "era.ww2_fight.DEU", name: "German Reich", population: 90, economy: 58, military: 82, stability: 66, treasury: 2600, divisions: 26, manpower: 1100 },
    JPN: {
      nameKey: "era.ww2_fight.JPN", name: "Empire of Japan", population: 76, economy: 52, military: 80, stability: 74, treasury: 1900, divisions: 24, manpower: 1200 },
    IND: {
      nameKey: "era.ww2_fight.IND", name: "British India", population: 400, economy: 20, military: 34, stability: 40, treasury: 600, divisions: 9, manpower: 3600 },
    IRN: {
      nameKey: "era.ww2_fight.IRN", name: "Imperial State of Iran", population: 16, economy: 14, military: 20, stability: 40, treasury: 200, divisions: 4, manpower: 160 },
    BRA: {
      nameKey: "era.ww2_fight.BRA", name: "United States of Brazil", population: 46, economy: 25, military: 20, stability: 52, treasury: 380, divisions: 4, manpower: 330 },
  },
  relations: {
    DEU: { GBR: -95, FRA: -95, RUS: -95, JPN: 80, USA: -85, IND: -30 },
    RUS: { DEU: -95, GBR: -10, USA: -10, JPN: -60 },
    JPN: { CHN: -100, USA: -95, RUS: -60, GBR: -90 },
    GBR: { DEU: -95, RUS: -10, JPN: -90, USA: 85, FRA: 70 },
    FRA: { DEU: -95, GBR: 70, USA: 80, RUS: -10 },
    CHN: { JPN: -100, RUS: 30, USA: 55, GBR: 45 },
  },
  allies: {
    DEU: ["JPN"], JPN: ["DEU"], GBR: ["USA", "RUS", "FRA"], USA: ["GBR", "RUS", "CHN"],
    RUS: ["GBR", "USA"], CHN: ["USA", "GBR"], FRA: ["GBR"], IND: ["GBR"], IRN: ["GBR", "RUS"], BRA: ["USA"],
  },
  enemies: {
    DEU: ["GBR", "USA", "RUS", "FRA"], JPN: ["CHN", "USA", "GBR"],
    GBR: ["DEU", "JPN"], USA: ["DEU", "JPN"], RUS: ["DEU"], CHN: ["JPN"], FRA: ["DEU"],
  },
  atWar: [["DEU", "GBR"], ["JPN", "CHN"]],
  flags: WW2_FIGHT_FLAGS,
  autonomous: WARLORD_CHINA,
  governments: WW2_GOVERNMENTS,
};

/**
 * 1945: the war.
 *
 * Its last year, which is the closest the dataset gets to the fighting: Japan
 * and Germany are still theirs — the occupation zones the dataset draws are
 * garrisons, not annexations — Manchuria is back in Chinese hands, and the
 * Soviet Union stands astride eastern Europe.
 */
const WW2_WAR: Era = {
  id: "ww2-war",
  nameKey: "era.ww2_war.name",
  descKey: "era.ww2_war.desc",
  start: { year: 1945, month: 1, day: 1 },
  nations: {
    USA: { population: 131, economy: 45, military: 34, stability: 60, treasury: 3200, divisions: 8, manpower: 1200 },
    CHN: {
      nameKey: "era.ww2_war.CHN", name: "Republic of China", population: 515, economy: 10, military: 25, stability: 25, treasury: 150, divisions: 12, manpower: 4200 },
    RUS: {
      nameKey: "era.ww2_war.RUS", name: "Soviet Union", population: 170, economy: 32, military: 62, stability: 45, treasury: 1800, divisions: 26, manpower: 2800 },
    GBR: {
      nameKey: "era.ww2_war.GBR", name: "British Empire", population: 47, economy: 58, military: 48, stability: 70, treasury: 2600, divisions: 9, manpower: 500 },
    FRA: {
      nameKey: "era.ww2_war.FRA", name: "French Republic", population: 42, economy: 46, military: 46, stability: 55, treasury: 1300, divisions: 10, manpower: 420 },
    DEU: {
      nameKey: "era.ww2_war.DEU", name: "Germany", population: 79, economy: 62, military: 72, stability: 68, treasury: 2400, divisions: 18, manpower: 900 },
    JPN: {
      nameKey: "era.ww2_war.JPN", name: "Empire of Japan", population: 73, economy: 50, military: 70, stability: 72, treasury: 1700, divisions: 16, manpower: 950 },
    IND: {
      nameKey: "era.ww2_war.IND", name: "British India", population: 390, economy: 18, military: 28, stability: 42, treasury: 500, divisions: 7, manpower: 3200 },
    IRN: {
      nameKey: "era.ww2_war.IRN", name: "Imperial State of Iran", population: 15, economy: 13, military: 18, stability: 42, treasury: 180, divisions: 3, manpower: 150 },
    BRA: {
      nameKey: "era.ww2_war.BRA", name: "United States of Brazil", population: 45, economy: 23, military: 17, stability: 50, treasury: 320, divisions: 3, manpower: 310 },
  },
  relations: {
    DEU: { GBR: -80, FRA: -85, RUS: -40, JPN: 60, USA: -60, IND: -20 },
    RUS: { DEU: -40, GBR: -50, USA: -50, JPN: -40 },
    JPN: { CHN: -90, USA: -70, RUS: -40, GBR: -50 },
    GBR: { DEU: -80, RUS: -50, JPN: -50, USA: 75, FRA: 80 },
    FRA: { DEU: -85, RUS: -40, USA: 70, GBR: 80 },
    CHN: { JPN: -90, RUS: 20, USA: 40, GBR: 30 },
  },
  allies: {
    DEU: ["JPN"], JPN: ["DEU"], GBR: ["USA", "RUS"], USA: ["GBR", "RUS", "CHN"],
    RUS: ["GBR", "USA"], CHN: ["USA"], FRA: ["GBR"], IND: ["GBR"], IRN: [], BRA: ["USA"],
  },
  enemies: { DEU: ["FRA", "GBR", "USA", "RUS"], RUS: ["DEU"], JPN: ["CHN", "USA"], CHN: ["JPN"], GBR: ["DEU", "JPN"], FRA: ["DEU"] },
  atWar: [["DEU", "USA"], ["JPN", "CHN"]],
  flags: WW2_FLAGS,
  autonomous: WARLORD_CHINA_1945,
  governments: WW2_GOVERNMENTS,
};

/**
 * 1994: the end of the short twentieth century.
 *
 * The Soviet Union is gone, every nation of the twelve exists, and the blocs
 * of the Cold War are three years in the past.
 */
const LATE_20C: Era = {
  id: "late-20c",
  nameKey: "era.late_20c.name",
  descKey: "era.late_20c.desc",
  start: { year: 1994, month: 1, day: 1 },
  nations: {
    USA: { population: 253, economy: 88, military: 92, stability: 66, treasury: 20000, divisions: 18, manpower: 900, nuclear: true, nukes: 40 },
    CHN: { population: 1160, economy: 40, military: 62, stability: 60, treasury: 3000, divisions: 20, manpower: 8000, nuclear: true, nukes: 10 },
    RUS: { population: 148, economy: 30, military: 78, stability: 40, treasury: 1200, divisions: 22, manpower: 2000, nuclear: true, nukes: 50 },
    GBR: { population: 57, economy: 68, military: 62, stability: 64, treasury: 6000, divisions: 8, manpower: 300, nuclear: true, nukes: 6 },
    FRA: { population: 57, economy: 65, military: 60, stability: 58, treasury: 5500, divisions: 8, manpower: 300, nuclear: true, nukes: 5 },
    DEU: { population: 80, economy: 82, military: 48, stability: 70, treasury: 8000, divisions: 6, manpower: 400 },
    JPN: { population: 124, economy: 85, military: 42, stability: 80, treasury: 9000, divisions: 5, manpower: 240 },
    IND: { population: 890, economy: 28, military: 45, stability: 48, treasury: 1000, divisions: 10, manpower: 3000 },
    PRK: { population: 21, economy: 6, military: 55, stability: 85, treasury: 20, divisions: 6, manpower: 400 },
    IRN: { population: 56, economy: 22, military: 42, stability: 45, treasury: 300, divisions: 6, manpower: 500 },
    ISR: { population: 5, economy: 55, military: 66, stability: 44, treasury: 600, divisions: 5, manpower: 100, nuclear: true, nukes: 2 },
    BRA: { population: 150, economy: 40, military: 28, stability: 42, treasury: 900, divisions: 5, manpower: 600 },
  },
  relations: {
    USA: { RUS: 20, CHN: 0, PRK: -70, IRN: -50, ISR: 70, GBR: 70, FRA: 65, DEU: 70, JPN: 75, IND: 45, BRA: 45 },
    RUS: { USA: 20, CHN: 55, PRK: 30, IRN: 40, GBR: 25, FRA: 25, DEU: 30, JPN: 15, ISR: -20, IND: 35, BRA: 25 },
    CHN: { USA: 0, RUS: 55, PRK: 40, JPN: -20, IND: -25, GBR: 10, FRA: 10, DEU: 15, ISR: 5, IRN: 25, BRA: 20 },
    JPN: { USA: 75, CHN: -20, RUS: 15, PRK: -75, GBR: 50, FRA: 45, DEU: 50, IND: 35, ISR: 25, IRN: -10, BRA: 25 },
  },
  governments: LATE_20C_GOVERNMENTS,
  allies: { USA: ["GBR", "FRA", "DEU", "JPN", "ISR"], GBR: ["USA", "FRA", "DEU"], FRA: ["USA", "GBR", "DEU"], DEU: ["USA", "GBR", "FRA"], JPN: ["USA"], ISR: ["USA"], RUS: [], CHN: ["PRK"], PRK: ["CHN"], IND: [], IRN: [], BRA: [] },
  enemies: { USA: ["PRK", "IRN"], PRK: ["USA", "JPN"], IRN: ["USA", "ISR"], ISR: ["IRN"], CHN: ["JPN"], RUS: [] },
};

/**
 * 2000: the turn of the century, and the year the borders are drawn from.
 *
 * Every nation of the twelve exists; the alignments are the ones of the war on
 * terror, with the blocs of the last decade already cooling.
 */
const EARLY_21C: Era = {
  id: "early-21c",
  nameKey: "era.early_21c.name",
  descKey: "era.early_21c.desc",
  start: { year: 2000, month: 1, day: 1 },
  nations: {
    USA: { population: 285, economy: 92, military: 96, stability: 70, treasury: 26000, divisions: 20, manpower: 1100, nuclear: true, nukes: 45 },
    CHN: { population: 1270, economy: 62, military: 72, stability: 74, treasury: 6000, divisions: 22, manpower: 9000, nuclear: true, nukes: 15 },
    RUS: { population: 146, economy: 38, military: 74, stability: 52, treasury: 2500, divisions: 18, manpower: 1800, nuclear: true, nukes: 52 },
    GBR: { population: 59, economy: 74, military: 66, stability: 68, treasury: 7500, divisions: 9, manpower: 320, nuclear: true, nukes: 6 },
    FRA: { population: 61, economy: 70, military: 64, stability: 62, treasury: 6500, divisions: 9, manpower: 320, nuclear: true, nukes: 5 },
    DEU: { population: 82, economy: 84, military: 50, stability: 72, treasury: 9000, divisions: 6, manpower: 420 },
    JPN: { population: 127, economy: 84, military: 46, stability: 82, treasury: 8500, divisions: 6, manpower: 250 },
    IND: { population: 1050, economy: 38, military: 58, stability: 55, treasury: 2200, divisions: 13, manpower: 4000, nuclear: true, nukes: 4 },
    PRK: { population: 23, economy: 5, military: 60, stability: 88, treasury: 25, divisions: 7, manpower: 450, nuclear: true, nukes: 2 },
    IRN: { population: 65, economy: 28, military: 50, stability: 48, treasury: 500, divisions: 8, manpower: 600 },
    ISR: { population: 6, economy: 62, military: 74, stability: 46, treasury: 800, divisions: 6, manpower: 130, nuclear: true, nukes: 3 },
    BRA: { population: 175, economy: 45, military: 32, stability: 46, treasury: 1100, divisions: 6, manpower: 700 },
  },
  relations: {
    USA: { RUS: -10, CHN: -20, PRK: -85, IRN: -75, ISR: 85, GBR: 80, FRA: 65, DEU: 75, JPN: 80, IND: 55, BRA: 50 },
    RUS: { USA: -10, CHN: 55, PRK: 40, IRN: 45, GBR: 15, FRA: 20, DEU: 35, JPN: 10, ISR: -20, IND: 45, BRA: 25 },
    CHN: { USA: -20, RUS: 55, PRK: 45, JPN: -35, IND: -30, GBR: 0, FRA: 5, DEU: 15, ISR: 0, IRN: 35, BRA: 25 },
    JPN: { USA: 80, CHN: -35, RUS: 10, PRK: -80, GBR: 55, FRA: 45, DEU: 55, IND: 40, ISR: 25, IRN: -20, BRA: 25 },
    IRN: { USA: -75, ISR: -95, RUS: 45, CHN: 35, GBR: -40, FRA: -35, DEU: -35, JPN: -20, IND: 15, PRK: 35, BRA: 15 },
  },
  allies: { USA: ["GBR", "FRA", "DEU", "JPN", "ISR"], GBR: ["USA", "FRA", "DEU"], FRA: ["USA", "GBR", "DEU"], DEU: ["USA", "GBR", "FRA"], JPN: ["USA"], ISR: ["USA"], RUS: ["CHN"], CHN: ["RUS", "PRK"], PRK: ["CHN"], IND: ["RUS"], IRN: ["RUS", "CHN"], BRA: [] },
  enemies: { USA: ["PRK", "IRN"], PRK: ["USA", "JPN"], IRN: ["USA", "ISR"], ISR: ["IRN"], CHN: ["JPN"], RUS: [] },
};

export const ERAS: Era[] = [WW2_EVE, WW2_FIGHT, WW2_WAR, LATE_20C, EARLY_21C];

export const DEFAULT_ERA: EraId = "early-21c";

export function getEra(id: EraId | string | undefined): Era {
  return ERAS.find((era) => era.id === id) ?? ERAS[ERAS.length - 1];
}

const rosterCache = new Map<string, Country[]>();

/**
 * The twelve as this era has them, for the screens that run before a campaign
 * exists. A nation the era has not invented is not in the list.
 *
 * The title screen used to read the static roster and show 1938's China with
 * 2026's numbers, and offer Israel as a neighbour in a year it did not exist.
 * The numbers are the same ones `createInitialState` applies, so what the
 * player picks from is what they get.
 */
export function eraRoster(eraId: string): Country[] {
  const cached = rosterCache.get(eraId);
  if (cached) return cached;

  const era = getEra(eraId);
  const roster = COUNTRIES.filter((c) => era.nations[c.id]).map((c) => {
    const nation = era.nations[c.id];
    return {
      ...c,
      relations: { ...c.relations },
      allies: [...(era.allies?.[c.id] ?? [])],
      enemies: [...(era.enemies?.[c.id] ?? [])],
      nameKey: nation.nameKey,
      // The same key `applyEra` sets on a running campaign, so the title
      // screen and the game it starts describe a nation identically.
      descKey: eraDescKey(era.id, c.id),
      government: era.governments?.[c.id] ?? c.government,
      name: nation.name ?? c.name,
      population: nation.population ?? c.population,
      economy: nation.economy ?? c.economy,
      military: nation.military ?? c.military,
      stability: nation.stability ?? c.stability,
      publicSupport: nation.publicSupport ?? c.publicSupport,
      treasury: nation.treasury ?? c.treasury,
      manpower: nation.manpower ?? c.manpower,
      nuclear: nation.nuclear ?? false,
      nukes: nation.nukes ?? 0,
      divisions: c.divisions.slice(0, nation.divisions ?? c.divisions.length),
      ...(era.relations?.[c.id]
        ? { relations: { ...c.relations, ...era.relations[c.id] } }
        : {}),
    };
  });

  rosterCache.set(eraId, roster);
  return roster;
}

/**
 * Which nation holds which modern province in this era, as province ids.
 *
 * `src/map/data/eraRegions.json` is generated by `scripts/build-eras.mjs` from
 * the era's own borders — a province belongs to whoever's polygon its label
 * point falls in. Keyed by `"CTY:Region name"` there, because province ids are
 * positional and would change the moment the map data is regenerated.
 *
 * A province that is not listed keeps its modern owner: the generator only
 * records the places that changed hands.
 */
/**
 * The scenario's autonomous provinces, resolved to region ids.
 *
 * Same lookup as `eraProvinceOwners`, and for the same reason: the table is
 * written with province names so it stays readable, and the simulation works
 * in ids.
 */
export function eraAutonomousRegions(era: Era): AutonomousRegion[] {
  const out: AutonomousRegion[] = [];
  for (const bloc of era.autonomous ?? []) {
    for (const key of bloc.regions) {
      const [country, region] = key.split(":");
      const match = REGIONS.get(country)?.find((r) => r.en === region);
      if (match) out.push({ regionId: match.id, nameKey: bloc.nameKey });
    }
  }
  return out;
}

/** One province the capital did not govern, and who did. */
export interface AutonomousRegion {
  regionId: string;
  /** i18n key for who runs it: `faction.jin` → 晋系. */
  nameKey: string;
}

export function eraProvinceOwners(era: Era): Record<string, string> {
  const table = (eraRegions as Record<string, Record<string, string>>)[era.id] ?? {};
  const owners: Record<string, string> = {};
  for (const [key, nationId] of Object.entries(table)) {
    const [country, region] = key.split(":");
    const match = REGIONS.get(country)?.find((r) => r.en === region);
    if (match) owners[match.id] = nationId;
  }
  return owners;
}
