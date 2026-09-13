import { feature } from "topojson-client";
import worldRaw from "world-atlas/countries-110m.json?raw";
import { geoNaturalEarth1, geoPath, geoGraticule10 } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { GEO_IDS, GEO_NAME_HINTS } from "../game/countries";
import { Projection, addCoordinateTransforms, addProjection } from "ol/proj";

/** Interior size of the map canvas. The SVG scales this to its container. */
export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = 500;

export interface WorldFeature extends Feature<Geometry> {
  /** Playable-country id ("USA", "CHN", …) when this polygon is a game nation. */
  countryId?: string;
  /** Display name from Natural Earth. */
  label: string;
}

// ── Load topology once, at module scope ────────────────────────────

interface TopoLike {
  objects: { countries: unknown };
}

function loadFeatures(): WorldFeature[] {
  const topology = JSON.parse(worldRaw) as TopoLike;
  const collection = feature(
    topology as never,
    topology.objects.countries as never
  ) as unknown as FeatureCollection<Geometry, { name?: string }>;

  return collection.features.map((f) => {
    const props = (f.properties ?? {}) as { name?: string };
    const label = props.name ?? "";
    const rawId = (f as { id?: string | number }).id;
    const numeric = rawId === undefined || rawId === null ? "" : String(rawId);

    let countryId = numeric ? NUMERIC_TO_COUNTRY[numeric] : undefined;

    // Natural Earth stores a handful of features with id "-99"; fall back
    // to matching the display name for those.
    if (!countryId) {
      const target = label.toLowerCase();
      for (const [cid, hints] of Object.entries(GEO_NAME_HINTS)) {
        if (hints.some((h) => h.toLowerCase() === target)) {
          countryId = cid;
          break;
        }
      }
    }

    const out: WorldFeature = { ...f, label };
    if (countryId) out.countryId = countryId;
    return out;
  });
}

const NUMERIC_TO_COUNTRY: Record<string, string> = Object.fromEntries(
  Object.entries(GEO_IDS).map(([countryId, geoId]) => [geoId, countryId])
);

/**
 * Territories that Natural Earth carries as their own polygon but that belong
 * to one of the playable nations.
 *
 * Natural Earth is a US-published dataset and splits Taiwan (id 158) from China
 * (id 156). Rendering that split would draw Taiwan outside Chinese territory
 * and — because the background is labelled as non-participating states — would
 * present it as a separate country. It is merged into China here so the island
 * is drawn, and clicks, as part of China.
 */
const TERRITORY_MERGES: { territory: string; into: string }[] = [
  { territory: "158", into: "CHN" }, // Taiwan → China
];

/** Normalise a Polygon/MultiPolygon geometry to a list of polygons. */
function toPolygons(geometry: Geometry): number[][][][] {
  if (geometry.type === "Polygon") return [geometry.coordinates as unknown as number[][][]];
  if (geometry.type === "MultiPolygon") return geometry.coordinates as unknown as number[][][][];
  return [];
}

/** Fold each listed territory's polygons into its parent nation's geometry. */
function applyMerges(features: WorldFeature[]): WorldFeature[] {
  const byGeoId = new Map<string, WorldFeature>();
  for (const f of features) {
    const rawId = (f as { id?: string | number }).id;
    if (rawId !== undefined && rawId !== null) byGeoId.set(String(rawId), f);
  }

  const consumed = new Set<WorldFeature>();
  for (const { territory, into } of TERRITORY_MERGES) {
    const source = byGeoId.get(territory);
    const target = features.find((f) => f.countryId === into);
    if (!source || !target || source === target) continue;

    target.geometry = {
      type: "MultiPolygon",
      coordinates: [...toPolygons(target.geometry), ...toPolygons(source.geometry)],
    } as Geometry;
    consumed.add(source);
  }

  return features.filter((f) => !consumed.has(f));
}

export const WORLD_FEATURES: WorldFeature[] = applyMerges(loadFeatures());

export const PLAYABLE_FEATURES: Map<string, WorldFeature> = new Map(
  WORLD_FEATURES.filter((f) => f.countryId).map((f) => [f.countryId!, f])
);

export const REST_FEATURES: WorldFeature[] = WORLD_FEATURES.filter((f) => !f.countryId);

// ── Projection ─────────────────────────────────────────────────────

export const projection = geoNaturalEarth1().fitSize(
  [MAP_WIDTH, MAP_HEIGHT],
  { type: "FeatureCollection", features: WORLD_FEATURES } as FeatureCollection
);

const pathGen = geoPath(projection);

/** Precomputed SVG path data — built once so re-renders stay cheap. */
export const FEATURE_PATHS: Map<WorldFeature, string> = new Map(
  WORLD_FEATURES.map((f) => [f, pathGen(f) ?? ""])
);

export const GRATICULE_PATH: string = pathGen(geoGraticule10()) ?? "";
export const SPHERE_PATH: string = pathGen({ type: "Sphere" } as never) ?? "";

/** Look up the playable feature for a nation, if it has one. */
export function featureFor(countryId: string): WorldFeature | undefined {
  return PLAYABLE_FEATURES.get(countryId);
}

/** Centroid of a nation's polygon, used to anchor map labels. */
export const FEATURE_CENTROIDS: Map<string, [number, number]> = new Map(
  [...PLAYABLE_FEATURES.entries()]
    .map(([id, f]) => {
      const c = pathGen.centroid(f);
      return [id, c] as [string, [number, number]];
    })
    .filter(([, c]) => Number.isFinite(c[0]) && Number.isFinite(c[1]))
);

/**
 * Projected area of each nation in viewBox units². Used to suppress labels for
 * nations too small to carry one at the current zoom — without this, the
 * European nations' labels pile on top of each other.
 */
export const FEATURE_AREAS: Map<string, number> = new Map(
  [...PLAYABLE_FEATURES.entries()].map(([id, f]) => [id, Math.abs(pathGen.area(f))])
);


/**
 * Split a ring wherever it crosses the antimeridian.
 *
 * Russia's country outline, Chukotka's provinces, Antarctica and Fiji all have
 * rings that run from +179° to -179°: a step of two degrees on the ground, but
 * of 358 in longitude. Projected point by point — which is what a map engine
 * does — that segment smears right across the map as a horizontal band. d3's
 * `geoPath` cut these for the SVG renderer; a real engine has to be handed cut
 * geometry. The crossing is interpolated to exactly ±180° so the halves meet on
 * the seam rather than on a diagonal.
 *
 * Interior rings are not handled: this dataset has none, and a cut hole would
 * come out filled.
 *
 * Typed structurally rather than as a tuple of pairs: TypeScript reads
 * `[number, number][]` in a nested array position as a two-element *tuple* of
 * arrays, and refuses the call.
 */
export function cutRingAtAntimeridian(ring: number[][]): number[][][] {
  const pieces: number[][][] = [];
  let current: number[][] = [];

  for (const point of ring) {
    const previous = current[current.length - 1];
    if (previous && Math.abs(point[0] - previous[0]) > 180) {
      const east = previous[0] > 0 ? 180 : -180;
      const span = point[0] - previous[0];
      const t = span === 0 ? 0 : (east - previous[0]) / span;
      const lat = previous[1] + (point[1] - previous[1]) * t;
      current.push([east, lat]);
      if (current.length >= 3) pieces.push(current);
      current = [[-east, lat], point];
      continue;
    }
    current.push(point);
  }
  if (current.length >= 3) pieces.push(current);
  return pieces;
}

// ── OpenLayers projection ──────────────────────────────────────────

/**
 * The same Natural Earth projection the SVG map used, registered with
 * OpenLayers as a coordinate reference system.
 *
 * The engine projects for itself, so it needs a projection rather than
 * pre-baked path data: `addCoordinateTransforms` is what lets a plain
 * longitude/latitude pair go in and the d3 projection's own output come out.
 * Units are nominal — every distance in this map is measured in the fitted
 * 1000×500 box, and inventing metres for them would only add a conversion.
 */
export const MAP_PROJECTION_CODE = "NE1";

export function registerMapProjection(): void {
  const projection_ = new Projection({
    code: MAP_PROJECTION_CODE,
    units: "m",
    // Projected extent (the fitted 1000×500 box) and the geographic one it
    // covers. OpenLayers' graticule and extent maths read `worldExtent` to
    // decide which lines of latitude exist at all; without it they see `null`.
    extent: [0, 0, MAP_WIDTH, MAP_HEIGHT],
    worldExtent: [-180, -90, 180, 90],
    global: false,
  });
  addProjection(projection_);
  // d3 measures y downwards from the top of the box (the SVG convention);
  // OpenLayers measures it upwards from the bottom. Without this flip the whole
  // world renders upside down.
  const flip = (point: [number, number]): [number, number] => [point[0], MAP_HEIGHT - point[1]];

  addCoordinateTransforms(
    "EPSG:4326",
    projection_,
    // d3 returns null for anything it cannot place (poles, clipped corners).
    (coord) => {
      const projected = projection(coord as [number, number]) as [number, number] | null;
      return projected ? flip(projected) : [MAP_WIDTH / 2, MAP_HEIGHT / 2];
    },
    (coord) => {
      const inverted = projection.invert?.(
        flip(coord as [number, number]) as [number, number]
      ) as [number, number] | null;
      return inverted ?? [0, 0];
    }
  );
}
