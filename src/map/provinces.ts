import { geoPath } from "d3-geo";
import admin1 from "./data/admin1.json";
import { projection } from "./geo";

/**
 * First-order administrative regions (provinces, states, oblasts, Länder) for
 * the twelve playable nations.
 *
 * Source: Natural Earth `ne_10m_admin_1_states_provinces_lakes`, trimmed to the
 * playable nations, stripped of interior rings and simplified to map
 * resolution — see the build notes in the README. Stored as raw lon/lat and
 * projected here with the same projection the country outlines use, so the two
 * can never drift apart.
 */
type Ring = [number, number][];

interface RawRegion {
  /** English name. */
  e: string;
  /** Chinese name. */
  z: string;
  /** Natural Earth's cartographic label point, lon/lat. */
  l: [number, number];
  /** Exterior rings. */
  r: Ring[];
}

export interface Region {
  id: string;
  en: string;
  zh: string;
  /** Projected label anchor. */
  anchor: [number, number];
  /** Projected SVG path data, one entry per ring. */
  paths: string[];
  /** Projected area, used to decide whether a label is worth drawing. */
  area: number;
}

const RAW = admin1 as unknown as Record<string, RawRegion[]>;

/**
 * Name corrections applied on top of Natural Earth's own.
 *
 * Natural Earth is a US-published dataset, and its `name_zh` field is a
 * translation of the international (often the administering power's) name
 * rather than the name Chinese official usage requires. Where the two differ
 * on a matter of territory, the dataset is not neutral — it is simply wrong,
 * so it is corrected here.
 *
 * Keyed `"<countryId>:<Natural Earth English name>"`.
 */
const REGION_NAME_OVERRIDES: Record<string, { zh?: string; en?: string }> = {
  // India's "Arunachal Pradesh" is South Tibet. China does not recognise the
  // state India administers there, and Chinese maps label the area 藏南地区.
  "IND:Arunachal Pradesh": { zh: "藏南地区" },
};

const pathGen = geoPath(projection);

/** Shoelace area of a projected ring. */
function ringArea(points: [number, number][]): number {
  let sum = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    sum += (points[j][0] - points[i][0]) * (points[j][1] + points[i][1]);
  }
  return Math.abs(sum / 2);
}

function buildRegions(): Map<string, Region[]> {
  const out = new Map<string, Region[]>();

  for (const [countryId, list] of Object.entries(RAW)) {
    const regions: Region[] = [];

    for (const [index, raw] of list.entries()) {
      // geoPath is used rather than projecting by hand so rings crossing the
      // antimeridian — Russia's, mainly — get cut instead of smearing across
      // the whole map.
      const paths = raw.r
        .map((ring) => pathGen({ type: "LineString", coordinates: ring }) ?? "")
        .filter((d) => d.length > 0);
      if (paths.length === 0) continue;

      const anchor = projection(raw.l) as [number, number] | null;
      if (!anchor) continue;

      // Area from the largest ring, which is the one that decides whether the
      // region reads as a shape at the current zoom.
      let area = 0;
      for (const ring of raw.r) {
        const projected = ring
          .map((c) => projection(c) as [number, number] | null)
          .filter((p): p is [number, number] => p !== null);
        if (projected.length >= 3) area = Math.max(area, ringArea(projected));
      }

      const override = REGION_NAME_OVERRIDES[`${countryId}:${raw.e}`];
      regions.push({
        id: `${countryId}-${index}`,
        en: override?.en ?? raw.e,
        zh: override?.zh ?? raw.z,
        anchor,
        paths,
        area,
      });
    }
    out.set(countryId, regions);
  }
  return out;
}

/** Regions keyed by nation. Built once — projecting 17k points per frame would not do. */
export const REGIONS: Map<string, Region[]> = buildRegions();

/** Convenience: just the stroke geometry, for the border layer. */
export const PROVINCE_PATHS: Map<string, string[]> = new Map(
  [...REGIONS.entries()].map(([countryId, regions]) => [
    countryId,
    regions.flatMap((r) => r.paths),
  ])
);

export const PROVINCE_COUNT = [...REGIONS.values()].reduce((n, r) => n + r.length, 0);

/** Below this zoom, region labels are noise; only the outlines show. */
export const REGION_LABEL_MIN_ZOOM = 2.2;
