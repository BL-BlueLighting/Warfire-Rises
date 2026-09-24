/**
 * Build the historical scenarios from aourednik/historical-basemaps.
 *
 * The game ships four eras, each a set of borders drawn from that dataset:
 *
 *   1938  the eve of the war      1945  the war's end
 *   1994  the end of the century  2000  the century's first year
 *
 * Two artefacts come out of this:
 *
 *   public/eras/<era>.json        the borders, simplified, one feature per
 *                                 nation of the game (plus "other" for the rest
 *                                 of the world), loaded by the map on demand
 *   src/map/data/eraRegions.json  which modern province each nation holds in
 *                                 that era, worked out by testing province
 *                                 label points against the era's polygons —
 *                                 the simulation needs provinces, not polygons
 *
 * Run with:  node scripts/build-eras.mjs
 *
 * The dataset is GPL-3.0 (see NOTICE.md); its licence is why this project is
 * GPL-3.0 rather than LGPL.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { geoContains } from "d3-geo";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = join(root, "tmp/eras");
const out = join(root, "public/eras");
const BASE = "https://raw.githubusercontent.com/aourednik/historical-basemaps/master/geojson";

const ERAS = [
  { id: "ww2-eve", year: 1938 },
  // The dataset has no year between 1938 and 1945, so the mid-war scenario is
  // the 1938 geometry with the changes the war had actually made by 1942 —
  // see CONQUEST_1942, and the note in NOTICE.md.
  { id: "ww2-fight", year: 1938, overrides: "1942" },
  { id: "ww2-war", year: 1945 },
  { id: "late-20c", year: 1994 },
  { id: "early-21c", year: 2000 },
];

/**
 * What the war had redrawn by 1942, applied on top of the 1938 borders.
 *
 * Annexations and the overseas empires only. A nation under occupation keeps
 * its own land: the game has no way to represent a country that still exists
 * but is not in charge of itself, and handing France's territory to Germany
 * would simply delete France from the board.
 */
const CONQUEST_1942 = {
  // The Reich: Austria, the Czech lands, Poland, Luxembourg.
  austria: "DEU",
  czechoslovakia: "DEU",
  czechia: "DEU",
  poland: "DEU",
  luxembourg: "DEU",
  // The Soviet Union: the Baltic states, annexed in 1940.
  estonia: "RUS",
  latvia: "RUS",
  lithuania: "RUS",
  // The Japanese empire at its height: the whole southern operation.
  philippines: "JPN",
  "netherlands indies": "JPN",
  "dutch east indies": "JPN",
  malaya: "JPN",
  "british malaya": "JPN",
  singapore: "JPN",
  burma: "JPN",
  "french indo-china": "JPN",
  "hong kong": "JPN",
  guam: "JPN",
  brunei: "JPN",
  sarawak: "JPN",
  "north borneo": "JPN",
  "gilbert and ellice islands": "JPN",
};

/**
 * The same year, one level down: provinces inside a country that the war
 * divided without moving the country's outline. Japan held the Chinese coast
 * and the north in 1942; the country-level map says only "China", so these have
 * to be named region by region.
 */
const PROVINCE_OVERRIDES_1942 = {
  "CHN:Hebei": "JPN",
  "CHN:Shandong": "JPN",
  "CHN:Shanxi": "JPN",
  "CHN:Jiangsu": "JPN",
  "CHN:Zhejiang": "JPN",
  "CHN:Fujian": "JPN",
  "CHN:Guangdong": "JPN",
  "CHN:Beijing": "JPN",
  "CHN:Shanghai": "JPN",
  "CHN:Tianjin": "JPN",
};

/**
 * Which nation of the game a historical entity belongs to.
 *
 * The dataset carries `SUBJECTO`, the sovereign power, so a colony comes along
 * with its empire ("Algeria (France)" → FRA). A few names are pressed into
 * service as their modern counterpart: the British Raj is the game's India, so
 * a 1938 player can be India and hold the Raj's territory.
 */
const NATIONS = {
  "united states": "USA",
  usa: "USA",
  china: "CHN",
  ussr: "RUS",
  "soviet union": "RUS",
  russia: "RUS",
  "russian federation": "RUS",
  "united kingdom": "GBR",
  "united kingdom of great britain and ireland": "GBR",
  france: "FRA",
  germany: "DEU",
  "empire of japan": "JPN",
  japan: "JPN",
  india: "IND",
  "british raj": "IND",
  iran: "IRN",
  persia: "IRN",
  israel: "ISR",
  brazil: "BRA",
  "north korea": "PRK",
  manchuria: "CHN",
  // 1938 has no single Chinese feature: the republic is split between the
  // warlord-held core, Xinjiang and Tibet. The game draws China whole, so its
  // 1938 self is the union of them.
  "chinese warlords": "CHN",
  xinjiang: "CHN",
  tibet: "CHN",
  // The Mongolian People's Republic was a Soviet satellite from 1924.
  mongolia: "RUS",
};

/**
 * The dataset carries a few anachronisms, and one of them matters here: it
 * labels Palestine "Israel" in years before the state existed. Until 1948 that
 * land is the British mandate's.
 */
const YEAR_OVERRIDES = {
  1938: { israel: "GBR" },
  1945: { israel: "GBR" },
};

/** Entities that keep their own name even when someone else is sovereign. */
const SELF_RULE = new Set(["india", "british raj"]);

/** "Japan (USA)" is occupied Japan, not American territory. */
const bareName = (value) => String(value ?? "").replace(/\s*\(.*\)\s*$/, "").trim().toLowerCase();

const nationOf = (properties, year, overrides) => {
  const name = String(properties.NAME ?? "").trim().toLowerCase();
  const bare = bareName(properties.NAME);
  const subject = bareName(properties.SUBJECTO) || String(properties.SUBJECTO ?? "").trim().toLowerCase();

  // A named nation keeps its land whoever is garrisoning it: the occupation
  // zones of Germany and Japan are troops, not annexations. The Raj is the
  // game's India even though the dataset files it under the United Kingdom.
  const conquest = overrides?.[bare];
  if (conquest) return conquest;
  const override = YEAR_OVERRIDES[year]?.[bare];
  if (override) return override;
  if (SELF_RULE.has(name) || SELF_RULE.has(bare)) return NATIONS[bare] ?? "other";
  return NATIONS[bare] ?? NATIONS[name] ?? NATIONS[subject] ?? "other";
};

function download(year) {
  const path = join(tmp, `world_${year}.geojson`);
  if (existsSync(path)) return path;
  mkdirSync(tmp, { recursive: true });
  console.log(`  fetching ${year}…`);
  execFileSync("curl", ["-sL", "-o", path, `${BASE}/world_${year}.geojson`], { stdio: "inherit" });
  return path;
}

/** Merge every feature of one nation into a single MultiPolygon. */
function mergeInto(features, nation) {
  const polygons = [];
  for (const feature of features) {
    const { type, coordinates } = feature.geometry;
    if (type === "Polygon") polygons.push(coordinates);
    else if (type === "MultiPolygon") polygons.push(...coordinates);
  }
  return { type: "Feature", properties: { nation }, geometry: { type: "MultiPolygon", coordinates: polygons } };
}

/**
 * Douglas–Peucker on one ring of lon/lat points.
 *
 * Written out rather than pulled in: this runs once, at build time, and a
 * dependency for thirty lines of geometry is not a trade worth making.
 */
function simplifyRing(points, tolerance) {
  if (points.length <= 4) return points;
  const sqTolerance = tolerance * tolerance;
  const sqSegmentDistance = (p, a, b) => {
    let x = a[0];
    let y = a[1];
    let dx = b[0] - x;
    let dy = b[1] - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) {
        x = b[0];
        y = b[1];
      } else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }
    dx = p[0] - x;
    dy = p[1] - y;
    return dx * dx + dy * dy;
  };

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let index = -1;
    let best = sqTolerance;
    for (let i = first + 1; i < last; i++) {
      const distance = sqSegmentDistance(points[i], points[first], points[last]);
      if (distance > best) {
        best = distance;
        index = i;
      }
    }
    if (index !== -1) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Simplify every ring, and drop the ones that collapse to nothing. */
function simplifyGeometry(geometry, tolerance) {
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const out = [];
  for (const polygon of polygons) {
    const rings = polygon
      .map((ring) => simplifyRing(ring, tolerance))
      .filter((ring) => ring.length >= 4);
    if (rings.length > 0) out.push(rings);
  }
  return { type: "MultiPolygon", coordinates: out };
}

mkdirSync(out, { recursive: true });
mkdirSync(join(root, "src/map/data"), { recursive: true });

// Province label points, for the ownership pass.
const admin1 = JSON.parse(readFileSync(join(root, "src/map/data/admin1.json"), "utf8"));
const eraRegions = {};

for (const era of ERAS) {
  console.log(`\n${era.id} (${era.year})`);

  const raw = JSON.parse(readFileSync(download(era.year), "utf8"));
  const byNation = new Map();
  for (const feature of raw.features) {
    const nation = nationOf(
      feature.properties ?? {},
      era.year,
      era.overrides === "1942" ? CONQUEST_1942 : undefined
    );
    if (!byNation.has(nation)) byNation.set(nation, []);
    byNation.get(nation).push(feature);
  }
  console.log(`  ${raw.features.length} features → ${byNation.size} groups`);
  for (const [nation, features] of [...byNation].sort((a, b) => b[1].length - a[1].length).slice(0, 6)) {
    console.log(`    ${nation}: ${features.length}`);
  }

  // The twelve nations keep their detail; the rest of the world is backdrop.
  const detailed = [];
  const backdrop = [];
  for (const [nation, features] of byNation) {
    const merged = mergeInto(features, nation);
    (nation === "other" ? backdrop : detailed).push(merged);
  }

  // The twelve keep coastlines worth looking at; the backdrop only has to read
  // as land, and is most of the file if it is left alone.
  const detailedCollection = {
    type: "FeatureCollection",
    features: detailed.map((f) => ({ ...f, geometry: simplifyGeometry(f.geometry, 0.04) })),
  };
  const backdropCollection = {
    type: "FeatureCollection",
    features: backdrop.map((f) => ({ ...f, geometry: simplifyGeometry(f.geometry, 0.35) })),
  };
  const collection = {
    type: "FeatureCollection",
    features: [...detailedCollection.features, ...backdropCollection.features],
  };
  const target = join(out, `${era.id}.json`);
  writeFileSync(target, JSON.stringify(collection));
  console.log(`  wrote ${target} (${(JSON.stringify(collection).length / 1024).toFixed(0)} KB)`);

  // ── Province ownership ──
  // Every modern province belongs to whoever holds its label point in this
  // year's borders. Only the twelve nations' provinces matter: they are the
  // ones the simulation can take, trade and lose.
  const claims = detailedCollection.features.map((f) => ({ nation: f.properties.nation, geometry: f.geometry }));
  const owners = {};
  for (const [countryId, regions] of Object.entries(admin1)) {
    for (const region of regions) {
      const point = region.l;
      const hit = claims.find((c) => geoContains(c.geometry, point));
      if (hit) owners[`${countryId}:${region.e}`] = hit.nation;
      // A scenario can also redraw a province the borders left alone.
      const forced = era.id === "ww2-fight" ? PROVINCE_OVERRIDES_1942[`${countryId}:${region.e}`] : undefined;
      if (forced) owners[`${countryId}:${region.e}`] = forced;
    }
  }
  eraRegions[era.id] = owners;
  const counts = {};
  for (const nation of Object.values(owners)) counts[nation] = (counts[nation] ?? 0) + 1;
  console.log("  provinces by owner:", JSON.stringify(counts));
}

writeFileSync(
  join(root, "src/map/data/eraRegions.json"),
  JSON.stringify(eraRegions, null, 0) + "\n"
);
console.log(`\nwrote src/map/data/eraRegions.json`);
rmSync(tmp, { recursive: true, force: true });
