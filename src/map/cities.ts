import { projection } from "./geo";
import cityData from "./data/cities.json";

/**
 * Provincial capitals and major cities for the twelve playable nations.
 *
 * Source: Natural Earth `ne_10m_populated_places`, trimmed to the playable
 * nations. Cities are bucketed into three tiers so the map can reveal them
 * progressively rather than dropping 881 labels on screen at once.
 */
interface RawCity {
  /** English name. */
  n: string;
  /** Chinese name. */
  z: string;
  /** lon/lat. */
  l: [number, number];
  /** Population. */
  p: number;
  /** 3 = national capital, 2 = major (province capital / prefecture city), 1 = notable. */
  t: 1 | 2 | 3;
  /** 1 when this city is a province capital. */
  c: 0 | 1;
}

export interface City {
  id: string;
  en: string;
  zh: string;
  anchor: [number, number];
  population: number;
  /** 3 = national capital, 2 = major, 1 = notable. */
  tier: 1 | 2 | 3;
  /** True for province capitals — the 省会, toggled separately from other cities. */
  isProvinceCapital: boolean;
}

const RAW = cityData as unknown as Record<string, RawCity[]>;

function build(): Map<string, City[]> {
  const out = new Map<string, City[]>();
  for (const [countryId, list] of Object.entries(RAW)) {
    const cities: City[] = [];
    for (const [index, raw] of list.entries()) {
      const anchor = projection(raw.l);
      if (!anchor) continue;
      cities.push({
        id: `${countryId}-${index}`,
        en: raw.n,
        zh: raw.z,
        anchor: anchor as [number, number],
        population: raw.p,
        tier: raw.t,
        isProvinceCapital: raw.c === 1,
      });
    }
    out.set(countryId, cities);
  }
  return out;
}

export const CITIES: Map<string, City[]> = build();

export const CITY_COUNT = [...CITIES.values()].reduce((n, c) => n + c.length, 0);

/**
 * Zoom at which each tier starts being drawn.
 *
 * Natural Earth's own ranking fields are unreliable outside the US — for China
 * they put Zibo above Suzhou and rank Foshan level with Zunyi — so the tier
 * comes from a curated table in the build script (see the note there), not from
 * `POP_MAX` or `SCALERANK`.
 */
export const CITY_MIN_ZOOM: Record<1 | 2 | 3, number> = {
  3: 1.5,  // national capitals
  2: 2.4,  // major cities: province capitals and prefecture-level cities
  1: 4.4,  // remaining notable cities
};
