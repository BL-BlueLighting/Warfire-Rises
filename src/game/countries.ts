import { Country } from "./types";

const BASE = {
  publicSupport: 55,
  forceValue: 20,
  atWarWith: [] as string[],
  // Research / industry / army defaults. Starting divisions and manpower are
  // filled in by createInitialState, which knows each nation's power level.
  researched: [] as string[],
  buildings: [] as string[],
  nukes: 0,
  nukeProgress: 0,
  nukedBy: [] as string[],
  manpower: 0,
  divisions: [] as import("./types").Division[],
  warGoals: [] as string[],
  overlordId: null as string | null,
  destroyed: false,
  generals: [] as import("./types").General[],
  armyGroups: [] as import("./types").ArmyGroup[],
  autoArmy: false,
  staffSilencedUntil: 0,
};

/** Warheads each nuclear power starts with, and standing divisions per tier. */
export const STARTING_NUKES: Record<string, number> = {
  USA: 50, RUS: 55, CHN: 20, GBR: 10, FRA: 8, IND: 5, PRK: 3, ISR: 4, IRN: 0,
};

export const DIVISIONS_BY_POWER: Record<string, number> = {
  superpower: 20,
  major: 14,
  regional: 8,
  minor: 4,
};

export const COUNTRIES: Country[] = [
  {
    ...BASE, id: "USA", name: "United States", flag: "🇺🇸",
    government: "democracy", power: "superpower",
    economy: 95, military: 98, stability: 72, nuclear: true,
    treasury: 32000, population: 335,
    description: "country.USA.desc",
    allies: ["GBR", "FRA", "DEU", "JPN", "ISR"], enemies: ["PRK", "IRN"],
    relations: { GBR: 90, FRA: 85, DEU: 80, JPN: 88, ISR: 92, CHN: -30, RUS: -60, PRK: -90, IRN: -80, IND: 60, BRA: 55 },
  },
  {
    ...BASE, id: "CHN", name: "China", flag: "🇨🇳",
    government: "communist", power: "superpower",
    economy: 90, military: 85, stability: 80, nuclear: true,
    treasury: 28000, population: 1410,
    description: "country.CHN.desc",
    allies: ["RUS", "PRK"], enemies: ["USA"],
    relations: { RUS: 75, PRK: 60, USA: -30, GBR: -10, FRA: 0, DEU: 10, JPN: -50, ISR: 10, IRN: 40, IND: -40, BRA: 30 },
  },
  {
    ...BASE, id: "RUS", name: "Russia", flag: "🇷🇺",
    government: "authoritarian", power: "major",
    economy: 40, military: 88, stability: 60, nuclear: true,
    treasury: 6000, population: 144,
    description: "country.RUS.desc",
    allies: ["CHN", "PRK", "IRN"], enemies: ["USA", "GBR", "FRA", "DEU"],
    relations: { CHN: 75, PRK: 50, IRN: 55, USA: -60, GBR: -55, FRA: -50, DEU: -45, JPN: -40, ISR: -20, IND: 40, BRA: 20 },
  },
  {
    ...BASE, id: "GBR", name: "United Kingdom", flag: "🇬🇧",
    government: "democracy", power: "major",
    economy: 75, military: 72, stability: 68, nuclear: true,
    treasury: 11000, population: 68,
    description: "country.GBR.desc",
    allies: ["USA", "FRA", "DEU"], enemies: ["RUS"],
    relations: { USA: 90, FRA: 75, DEU: 70, JPN: 60, ISR: 55, CHN: -10, RUS: -55, PRK: -60, IRN: -50, IND: 50, BRA: 40 },
  },
  {
    ...BASE, id: "FRA", name: "France", flag: "🇫🇷",
    government: "democracy", power: "major",
    economy: 72, military: 70, stability: 60, nuclear: true,
    treasury: 9500, population: 65,
    description: "country.FRA.desc",
    allies: ["USA", "GBR", "DEU"], enemies: ["RUS"],
    relations: { USA: 85, GBR: 75, DEU: 78, JPN: 50, ISR: 40, CHN: 0, RUS: -50, PRK: -55, IRN: -45, IND: 45, BRA: 35 },
  },
  {
    ...BASE, id: "DEU", name: "Germany", flag: "🇩🇪",
    government: "democracy", power: "major",
    economy: 85, military: 55, stability: 74, nuclear: false,
    treasury: 14000, population: 83,
    description: "country.DEU.desc",
    allies: ["USA", "GBR", "FRA"], enemies: ["RUS"],
    relations: { USA: 80, GBR: 70, FRA: 78, JPN: 55, ISR: 45, CHN: 10, RUS: -45, PRK: -50, IRN: -40, IND: 40, BRA: 30 },
  },
  {
    ...BASE, id: "JPN", name: "Japan", flag: "🇯🇵",
    government: "democracy", power: "regional",
    economy: 82, military: 45, stability: 85, nuclear: false,
    treasury: 10000, population: 125,
    description: "country.JPN.desc",
    allies: ["USA", "GBR"], enemies: ["PRK"],
    relations: { USA: 88, GBR: 60, FRA: 50, DEU: 55, ISR: 30, CHN: -50, RUS: -40, PRK: -85, IRN: -30, IND: 45, BRA: 25 },
  },
  {
    ...BASE, id: "IND", name: "India", flag: "🇮🇳",
    government: "democracy", power: "regional",
    economy: 65, military: 68, stability: 55, nuclear: true,
    treasury: 8000, population: 1420,
    description: "country.IND.desc",
    allies: [], enemies: ["CHN"],
    relations: { USA: 60, GBR: 50, FRA: 45, DEU: 40, JPN: 45, CHN: -40, RUS: 40, PRK: -20, IRN: 20, ISR: 35, BRA: 30 },
  },
  {
    ...BASE, id: "PRK", name: "North Korea", flag: "🇰🇵",
    government: "authoritarian", power: "minor",
    economy: 5, military: 60, stability: 90, nuclear: true,
    treasury: 20, population: 26,
    description: "country.PRK.desc",
    allies: ["CHN", "RUS"], enemies: ["USA", "JPN", "GBR", "FRA", "DEU"],
    relations: { CHN: 60, RUS: 50, USA: -90, GBR: -60, FRA: -55, DEU: -50, JPN: -85, ISR: -70, IRN: 30, IND: -20, BRA: -10 },
  },
  {
    ...BASE, id: "IRN", name: "Iran", flag: "🇮🇷",
    government: "theocracy", power: "regional",
    economy: 30, military: 55, stability: 50, nuclear: true,
    treasury: 800, population: 88,
    description: "country.IRN.desc",
    allies: ["RUS", "PRK"], enemies: ["USA", "ISR"],
    relations: { RUS: 55, CHN: 40, PRK: 30, USA: -80, GBR: -50, FRA: -45, DEU: -40, JPN: -30, ISR: -95, IND: 20, BRA: 15 },
  },
  {
    ...BASE, id: "ISR", name: "Israel", flag: "🇮🇱",
    government: "democracy", power: "regional",
    economy: 70, military: 82, stability: 45, nuclear: true,
    treasury: 2500, population: 9.5,
    description: "country.ISR.desc",
    allies: ["USA"], enemies: ["IRN"],
    relations: { USA: 92, GBR: 55, FRA: 40, DEU: 45, JPN: 30, CHN: 10, RUS: -20, PRK: -70, IRN: -95, IND: 35, BRA: 20 },
  },
  {
    ...BASE, id: "BRA", name: "Brazil", flag: "🇧🇷",
    government: "democracy", power: "regional",
    economy: 55, military: 35, stability: 48, nuclear: false,
    treasury: 3000, population: 215,
    description: "country.BRA.desc",
    allies: [], enemies: [],
    relations: { USA: 55, GBR: 40, FRA: 35, DEU: 30, JPN: 25, CHN: 30, RUS: 20, PRK: -10, IRN: 15, ISR: 20, IND: 30 },
  },
];

export function getCountryName(id: string): string {
  const c = COUNTRIES.find((c) => c.id === id);
  return c ? `${c.flag} ${c.name}` : id;
}

export function getCountry(id: string): Country | undefined {
  return COUNTRIES.find((c) => c.id === id);
}

/**
 * Bridge from a playable nation to its polygon in `world-atlas`.
 * Values are ISO 3166-1 numeric codes (as used by Natural Earth / UN M49).
 */
export const GEO_IDS: Record<string, string> = {
  USA: "840",
  CHN: "156",
  RUS: "643",
  GBR: "826",
  FRA: "250",
  DEU: "276",
  JPN: "392",
  IND: "356",
  PRK: "408",
  IRN: "364",
  ISR: "376",
  BRA: "076",
};

/**
 * Fallback matcher for the handful of features whose numeric id is missing
 * in the 110m dataset (notably North Korea, which Natural Earth stores as -99).
 */
export const GEO_NAME_HINTS: Record<string, string[]> = {
  PRK: ["North Korea", "Dem. Rep. Korea", "Korea, Dem. Rep.", "Dem. Rep. Kor."],
  USA: ["United States of America", "United States"],
  GBR: ["United Kingdom", "England"],
  RUS: ["Russia", "Russian Federation"],
  IRN: ["Iran", "Iran (Islamic Republic of)"],
  ISR: ["Israel"],
  BRA: ["Brazil"],
  IND: ["India"],
  JPN: ["Japan"],
  FRA: ["France"],
  DEU: ["Germany"],
  CHN: ["China"],
};

/** Reverse lookup: geo feature id/name → playable country id. */
export const GEO_TO_COUNTRY: Record<string, string> = Object.fromEntries(
  Object.entries(GEO_IDS).map(([countryId, geoId]) => [geoId, countryId])
);
