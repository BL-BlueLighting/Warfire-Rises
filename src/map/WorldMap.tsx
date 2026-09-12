import React, { useCallback, useMemo, useRef, useState } from "react";
import { useStore, selectCountry, setHovered } from "../game/store";
import { getAttitude, type Country } from "../game/types";
import { t } from "../i18n";
import { countryName } from "../game/names";
import { isSubjectOf } from "../game/subjects";
import {
  FEATURE_AREAS,
  FEATURE_CENTROIDS,
  FEATURE_PATHS,
  GRATICULE_PATH,
  MAP_HEIGHT,
  MAP_WIDTH,
  PLAYABLE_FEATURES,
  REST_FEATURES,
  SPHERE_PATH,
} from "./geo";
import { PALETTE, buildColorMap } from "./colors";
import { PROVINCE_PATHS, REGIONS, REGION_LABEL_MIN_ZOOM, type Region } from "./provinces";
import { CITIES, CITY_MIN_ZOOM, type City } from "./cities";
import { useLanguage } from "../i18n";
import { COUNTRIES } from "../game/countries";
import { useSettings } from "../game/settings";
import "./worldmap.css";

/**
 * Title-screen mode.
 *
 * The map doubles as the nation picker, so it has to render before a campaign
 * exists — with no game state to read, no regions, no cities, and its colours
 * supplied by the caller.
 */
export interface MapPreview {
  /** Fill per country id. */
  colors: Record<string, string>;
  selectedId: string | null;
  onSelect: (countryId: string) => void;
  /** Nation labels; the preview shows names but never interior detail. */
  showLabels?: boolean;
  /**
   * Force every layer on so the browser rasterises it all.
   *
   * The preparation screen uses this: drawing the province borders, region
   * names and the full city roster once means the campaign's first frames are
   * already painted instead of assembling themselves in front of the player.
   */
  warm?: boolean;
}

interface WorldMapProps {
  preview?: MapPreview;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 14;

/** Below this projected area (viewBox units²) a nation's label is suppressed. */
const MIN_LABEL_AREA = 250;

/**
 * Text halo width as a fraction of the font size.
 *
 * The labels scale their font by 1/zoom so they stay a constant size on screen.
 * A fixed `stroke-width` in CSS does not scale with them, so at high zoom the
 * outline ends up wider than the glyphs themselves and the text smears into
 * spikes. Every text element sets its stroke from this ratio instead.
 */
const HALO_RATIO = 0.26;

/** Region labels: same idea, tighter, and only once zoomed past REGION_LABEL_MIN_ZOOM. */
const MIN_REGION_LABEL_AREA = 26;
const MIN_REGION_LABEL_GAP = 46;

interface Transform {
  k: number;
  x: number;
  y: number;
}

/** A nation label with its two text anchors already worked out. */
interface LabelNode {
  id: string;
  country: Country | undefined;
  centroid: [number, number] | undefined;
  area: number;
  flagX: number;
  nameX: number;
  name: string;
}

const IDENTITY: Transform = { k: 1, x: 0, y: 0 };

/**
 * The inert backdrop and the province borders are pure geometry — their paths
 * never change, and they ride along with the parent <g> transform when the map
 * pans or zooms. Memoising them keeps React from re-diffing ~1000 elements on
 * every store notification, which is what the render loop emits.
 */
const InertLayer = React.memo(function InertLayer() {
  return (
    <>
      {REST_FEATURES.map((f, i) => (
        <path
          key={`rest-${i}`}
          d={FEATURE_PATHS.get(f) ?? ""}
          fill={PALETTE.unclaimed}
          stroke={PALETTE.border}
          strokeWidth={0.4}
          vectorEffect="non-scaling-stroke"
          className="worldmap-country worldmap-country--inert"
        />
      ))}
    </>
  );
});

/**
 * Territory that has changed hands.
 *
 * Regions are drawn as stroked line geometry, so filling one closes the ring
 * implicitly — which is exactly the shape wanted. Only regions whose owner
 * differs from the nation they were authored under are painted, so an
 * untouched world costs nothing.
 */
const ConqueredLayer = React.memo(function ConqueredLayer({
  regionOwner,
  colors,
  destroyed,
}: {
  regionOwner: Record<string, string>;
  colors: Record<string, string>;
  destroyed: ReadonlySet<string>;
}) {
  const painted: { d: string; fill: string }[] = [];
  for (const [baseOwner, regions] of REGIONS) {
    // Land that sank is not repainted for whoever had occupied it.
    if (destroyed.has(baseOwner)) continue;
    for (const region of regions) {
      const owner = regionOwner[region.id];
      if (!owner || owner === baseOwner) continue;
      const fill = colors[owner];
      if (!fill) continue;
      for (const d of region.paths) painted.push({ d, fill });
    }
  }
  if (painted.length === 0) return null;

  return (
    <>
      {painted.map((p, i) => (
        <path key={`occ-${i}`} d={p.d} fill={p.fill} stroke="none" opacity={0.9} />
      ))}
    </>
  );
});

const ProvinceLayer = React.memo(function ProvinceLayer({
  destroyed,
}: {
  destroyed: ReadonlySet<string>;
}) {
  return (
    <>
      {[...PLAYABLE_FEATURES.keys()].filter((id) => !destroyed.has(id)).map((countryId) => {
        const rings = PROVINCE_PATHS.get(countryId);
        if (!rings || rings.length === 0) return null;
        return (
          <g
            key={`prov-${countryId}`}
            clipPath={`url(#clip-${countryId})`}
            pointerEvents="none"
            className="worldmap-provinces"
          >
            {rings.map((d, i) => (
              <path key={i} d={d} fill="none" />
            ))}
          </g>
        );
      })}
    </>
  );
});

const WorldMap: React.FC<WorldMapProps> = ({ preview }) => {
  const { state, ui } = useStore();
  const lang = useLanguage();
  const settings = useSettings();
  // Local hover for preview mode, which has no store to write into.
  const [localHover, setLocalHover] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<Transform>(IDENTITY);
  const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ startX: number; startY: number; origin: Transform; moved: boolean } | null>(null);
  // pointerup always fires before click, so the drag record is gone by the time
  // the click handler runs. Latch "this gesture was a pan" here instead.
  const suppressClick = useRef(false);

  // Recompute every render: the store mutates `state` in place, so a
  // dependency-array memo would go stale after any action that does not
  // change a scalar (e.g. a diplomacy action nudging relations). Both of
  // these are O(nations), which is 12.
  const colors = preview ? preview.colors : state ? buildColorMap(state, ui.mapMode) : {};
  const atWarSet = new Set(
    preview ? [] : state?.countries.find((c) => c.id === state.playerCountryId)?.atWarWith ?? []
  );
  const playerId = preview ? null : state?.playerCountryId ?? null;
  /**
   * Nations that have been erased. Their features are simply not drawn, so the
   * ocean path underneath shows through — the land reads as having sunk.
   */
  const destroyedIds = new Set(
    (preview ? [] : state?.countries ?? []).filter((c) => c.destroyed).map((c) => c.id)
  );
  const selectedId = preview ? preview.selectedId : ui.selectedCountryId;
  const hoveredId = preview ? localHover : ui.hoveredCountryId;
  const setHoveredId = preview ? setLocalHover : setHovered;
  /** Country lookup: live state in a campaign, the static roster in a preview. */
  const countryById = (id: string) =>
    (preview ? COUNTRIES : state?.countries)?.find((c) => c.id === id);

  /** Convert a pointer event to viewBox coordinates. */
  const toSvgPoint = useCallback((clientX: number, clientY: number): [number, number] => {
    const svg = svgRef.current;
    if (!svg) return [0, 0];
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return [0, 0];
    const p = pt.matrixTransform(ctm.inverse());
    return [p.x, p.y];
  }, []);

  const onWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      e.preventDefault();
      const [mx, my] = toSvgPoint(e.clientX, e.clientY);
      setView((v) => {
        const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
        const k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.k * factor));
        const scale = k / v.k;
        return { k, x: mx - (mx - v.x) * scale, y: my - (my - v.y) * scale };
      });
    },
    [toSvgPoint]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (e.button !== 0) return;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      suppressClick.current = false;
      drag.current = { startX: e.clientX, startY: e.clientY, origin: view, moved: false };
    },
    [view]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const d = drag.current;
      if (d) {
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.moved = true;
        // Scale screen-space movement into viewBox units.
        const svg = svgRef.current;
        const rect = svg?.getBoundingClientRect();
        const sx = rect ? MAP_WIDTH / rect.width : 1;
        const sy = rect ? MAP_HEIGHT / rect.height : 1;
        setView({ k: d.origin.k, x: d.origin.x + dx * sx, y: d.origin.y + dy * sy });
        return;
      }
      // Only track the pointer while the tooltip is actually visible.
      if (hoveredId) setTooltip({ x: e.clientX, y: e.clientY });
    },
    [hoveredId]
  );

  const endDrag = useCallback(() => {
    if (drag.current?.moved) suppressClick.current = true;
    drag.current = null;
  }, []);

  const handleSelect = useCallback(
    (countryId: string | undefined) => {
      if (suppressClick.current) {
        suppressClick.current = false;
        return;
      }
      if (preview) {
        if (countryId) preview.onSelect(countryId);
        return;
      }
      selectCountry(countryId ?? null);
    },
    [preview]
  );

  const hovered = hoveredId ? countryById(hoveredId) : undefined;

  const relFor = (id: string) => {
    if (!state || !playerId) return 0;
    return state.countries.find((x) => x.id === id)?.relations[playerId] ?? 0;
  };

  if (!state && !preview) return null;
  const showCountryLabels = preview ? preview.showLabels !== false : settings.showCountryNames;
  // Interior detail exists only inside a campaign; the preview is deliberately
  // a clean political map — except while warming, when everything is drawn on
  // purpose so it all gets rasterised before play starts.
  const warming = preview?.warm === true;
  const showInterior = warming || (!preview && settings.showRegionNames);
  const showCities = warming || !preview;

  // Region labels are only worth drawing once you are zoomed in, and there can
  // be hundreds of them, so the candidate set is bucketed: it recomputes when
  // the zoom changes by a quarter step or the map pans a couple of grid cells,
  // not on every store notification.
  const labelKey = `${lang}|${Math.round(view.k * 4)}|${Math.round(view.x / 128)}|${Math.round(view.y / 128)}`;
  /** Changing this string is what makes the memoised label layers recompute. */
  const destroyedKey = [...destroyedIds].sort().join(",");
  const regionLabels = useMemo(() => {
    if (!warming && view.k < REGION_LABEL_MIN_ZOOM) {
      return [] as { region: Region; x: number; y: number }[];
    }

    // Cull to roughly the visible window, with slack so panning between buckets
    // never clips a label that should be on screen.
    const margin = 256;
    const minX = view.x - margin, maxX = view.x + MAP_WIDTH * view.k + margin;
    const minY = view.y - margin, maxY = view.y + MAP_HEIGHT * view.k + margin;

    const minArea = warming ? 0 : MIN_REGION_LABEL_AREA / (view.k * view.k);
    const minGap = MIN_REGION_LABEL_GAP / view.k;

    const candidates: { region: Region; x: number; y: number }[] = [];
    for (const [baseOwner, regions] of REGIONS) {
      // A sunken province has no name to show.
      if (destroyedIds.has(baseOwner)) continue;
      for (const region of regions) {
        if (region.area < minArea) continue;
        const [x, y] = region.anchor;
        if (x < minX || x > maxX || y < minY || y > maxY) continue;
        candidates.push({ region, x, y });
      }
    }
    candidates.sort((a, b) => b.region.area - a.region.area);

    const placed: [number, number][] = [];
    const out: { region: Region; x: number; y: number }[] = [];
    for (const c of candidates) {
      if (placed.some(([px, py]) => Math.hypot(px - c.x, py - c.y) < minGap)) continue;
      placed.push([c.x, c.y]);
      out.push(c);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelKey, ui.showDebugCodes, warming, destroyedKey]);

  const cityLabels = useMemo(() => {
    const margin = 256;
    const minX = view.x - margin, maxX = view.x + MAP_WIDTH * view.k + margin;
    const minY = view.y - margin, maxY = view.y + MAP_HEIGHT * view.k + margin;

    const candidates: { city: City; x: number; y: number }[] = [];
    for (const [countryId, cities] of CITIES) {
      if (destroyedIds.has(countryId)) continue;
      for (const city of cities) {
        // Each tier appears at its own zoom, so a world view shows capitals
        // only and the detail fills in as you close in.
        if (!warming && view.k < CITY_MIN_ZOOM[city.tier]) continue;
        // Province capitals (省会) and other cities are toggled separately.
        // National capitals always show — they are the map's fixed points.
        if (city.tier !== 3) {
          if (city.isProvinceCapital ? !settings.showProvinceCapitals : !settings.showMajorCities) {
            continue;
          }
        }
        const [x, y] = city.anchor;
        if (x < minX || x > maxX || y < minY || y > maxY) continue;
        candidates.push({ city, x, y });
      }
    }
    // Capitals first, then by population, so culling keeps the important ones.
    // Descending tier: 3 is a national capital, 1 is a minor city. Sorting
    // ascending here would let a county-level town claim space before the
    // prefecture city beside it.
    candidates.sort((a, b) => b.city.tier - a.city.tier || b.city.population - a.city.population);

    // Collide the actual label boxes rather than a circular radius. A radius
    // must be wide enough for the longest name, which suppresses a whole dense
    // province at once: at 7x zoom a 40-unit radius culled Zunyi and
    // Liupanshui while letting the more distant Xingyi through.
    const boxes: { x: number; y: number; w: number; h: number }[] = [];
    const out: { city: City; x: number; y: number }[] = [];
    const pad = 1.2 / view.k;

    for (const c of candidates) {
      const isCapital = c.city.tier === 3;
      const fontSize = (isCapital ? 10 : 9) / view.k;
      const dotR = (isCapital ? 2.1 : 1.5) / view.k;
      const name = lang === "zh-cn" ? c.city.zh : c.city.en;
      // Chinese glyphs are roughly square; Latin averages much narrower.
      const charW = lang === "zh-cn" ? 1.0 : 0.55;
      const w = name.length * fontSize * charW;
      const h = fontSize * 1.25;
      const lx = c.x + 3.4 / view.k;
      const ly = c.y - h / 2;

      const clashes = boxes.some(
        (b) =>
          Math.abs(b.x + b.w / 2 - (lx + w / 2)) < (b.w + w) / 2 + pad &&
          Math.abs(b.y + b.h / 2 - (ly + h / 2)) < (b.h + h) / 2 + pad
      );
      if (clashes) continue;

      boxes.push({ x: c.x - dotR, y: c.y - dotR, w: dotR * 2, h: dotR * 2 });
      boxes.push({ x: lx, y: ly, w, h });
      out.push(c);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    `city|${lang}|${warming}|${settings.showProvinceCapitals}|${settings.showMajorCities}` +
      `|${Math.round(view.k * 4)}|${Math.round(view.x / 128)}|${Math.round(view.y / 128)}` +
      `|${destroyedKey}`,
  ]);

  // Choose which labels to draw. Candidates must clear the area gate, then are
  // placed largest-first, skipping any that would collide with one already
  // placed. The gap is divided by zoom so labels separate as you zoom in —
  // without this, France/Germany/Britain overlap into an unreadable pile.
  const labelNodes = (() => {
    const isHighlighted = (id: string) =>
      id === playerId || selectedId === id || hoveredId === id;

    const candidates = [...PLAYABLE_FEATURES.keys()]
      .filter((id) => !destroyedIds.has(id))
      .map((id) => ({
        id,
        country: countryById(id),
        centroid: FEATURE_CENTROIDS.get(id),
        area: FEATURE_AREAS.get(id) ?? 0,
      }))
      .filter((x) => x.country && x.centroid)
      .filter((x) => x.area * view.k * view.k >= MIN_LABEL_AREA || isHighlighted(x.id))
      .sort((a, b) => b.area - a.area);

    // Names are full-length now ("United States", "中国") rather than a fixed
    // three-letter code, so a circular radius is the wrong shape — it would
    // have to be sized for the longest name and would wipe out most of Europe.
    const boxes: { x: number; y: number; w: number; h: number }[] = [];
    const out: LabelNode[] = [];
    const fontSize = 9 / Math.sqrt(view.k);
    const charW = lang === "zh-cn" ? 0.95 : 0.5;
    // A flag emoji is about 1.3 em wide; the gap after it is a thin space.
    const flagW = fontSize * 1.35;
    const gapW = fontSize * 0.32;

    for (const c of candidates) {
      const [cx, cy] = c.centroid!;
      const name = countryName(c.country) + (ui.showDebugCodes ? ` (${c.id})` : "");
      const nameW = name.length * fontSize * charW;
      const total = flagW + gapW + nameW;

      if (!isHighlighted(c.id)) {
        const w = total;
        const h = fontSize * 1.3;
        const pad = 2 / view.k;
        const clashes = boxes.some(
          (b) =>
            Math.abs(b.x + b.w / 2 - cx) < (b.w + w) / 2 + pad &&
            Math.abs(b.y + b.h / 2 - cy) < (b.h + h) / 2 + pad
        );
        if (clashes) continue;
        boxes.push({ x: cx - w / 2, y: cy - h / 2, w, h });
      }

      // Two anchors: the flag sits at the left edge of the run, the name after
      // it. Both are middle-anchored so the pair stays centred on the centroid.
      const left = cx - total / 2;
      out.push({
        ...c,
        flagX: left + flagW / 2,
        nameX: left + flagW + gapW + nameW / 2,
        name,
      });
    }
    return out;
  })();

  return (
    <div className="worldmap">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={() => {
          endDrag();
          setTooltip(null);
          setHoveredId(null);
        }}
        className="worldmap-svg"
      >
        <defs>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill={PALETTE.war} />
            <line x1="0" y1="0" x2="0" y2="6" stroke="#ffffff" strokeWidth="2" opacity="0.35" />
          </pattern>
          {/* Province borders come from a 10m dataset while the nation outline
              is 110m. Clipping each nation's provinces to its own outline hides
              that mismatch: lines stop exactly at the border instead of
              spilling into the sea or over a neighbour. */}
          {[...PLAYABLE_FEATURES.entries()].map(([id, f]) => (
            <clipPath id={`clip-${id}`} key={`clip-${id}`}>
              <path d={FEATURE_PATHS.get(f) ?? ""} />
            </clipPath>
          ))}
        </defs>

        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          <path d={SPHERE_PATH} fill={PALETTE.ocean} stroke="#1d2f3d" strokeWidth={1} />
          <path d={GRATICULE_PATH} fill="none" stroke={PALETTE.graticule} strokeWidth={0.5} />

          {/* Non-playable nations — inert backdrop */}
          <InertLayer />

          {/* Playable nations */}
          {[...PLAYABLE_FEATURES.entries()].map(([countryId, f]) => {
            if (destroyedIds.has(countryId)) return null;
            const isSelected = selectedId === countryId;
            const isHovered = hoveredId === countryId;
            const atWar = atWarSet.has(countryId);
            return (
              <path
                key={countryId}
                data-country={countryId}
                d={FEATURE_PATHS.get(f) ?? ""}
                fill={atWar ? "url(#hatch)" : colors[countryId] ?? PALETTE.neutral}
                stroke={isSelected ? PALETTE.selected : PALETTE.border}
                strokeWidth={isSelected ? 2.5 : 1}
                vectorEffect="non-scaling-stroke"
                className={`worldmap-country${isHovered ? " is-hovered" : ""}${isSelected ? " is-selected" : ""}`}
                onPointerEnter={() => setHoveredId(countryId)}
                onPointerLeave={() => setHoveredId(null)}
                onClick={() => handleSelect(countryId)}
              />
            );
          })}

          {/* Territory that changed hands, painted over the original owner */}
          {!preview && (
            <ConqueredLayer
              regionOwner={state?.regionOwner ?? {}}
              colors={colors}
              destroyed={destroyedIds}
            />
          )}

          {/* Interior administrative boundaries */}
          {showInterior && <ProvinceLayer destroyed={destroyedIds} />}

          {/* Cities — dot plus name, revealed tier by tier as you zoom */}
          {showCities && cityLabels.map(({ city, x, y }) => {
            const isCapital = city.tier === 3;
            const r = (isCapital ? 2.1 : 1.5) / view.k;
            const fontSize = (isCapital ? 10 : 9) / view.k;
            return (
              <g key={`city-${city.id}`} className={`worldmap-city worldmap-city--t${city.tier}`} pointerEvents="none">
                <circle cx={x} cy={y} r={r} />
                <text
                  x={x + 3.4 / view.k}
                  y={y}
                  dominantBaseline="middle"
                  style={{ fontSize: `${fontSize}px`, strokeWidth: `${fontSize * HALO_RATIO}px` }}
                >
                  {lang === "zh-cn" ? city.zh : city.en}
                </text>
              </g>
            );
          })}

          {/* Region labels — gated on zoom, thinned by collision */}
          {showInterior && regionLabels.map(({ region, x, y }) => (
            <text
              key={`rlabel-${region.id}`}
              x={x}
              y={y}
              textAnchor="middle"
              className="worldmap-region-label"
              style={{ fontSize: `${9.5 / view.k}px`, strokeWidth: `${(9.5 / view.k) * HALO_RATIO}px` }}
              pointerEvents="none"
            >
              {lang === "zh-cn" ? region.zh : region.en}
            </text>
          ))}

          {/* Nation labels */}
          {/* Map flags are SVG images, not the emoji font.
              Chromium renders the colour-glyph flags in SVG text fine; WebKit
              does not — it drops the colour layers and draws the bare regional
              indicators, so the map read "CN" / "US". It is also size-sensitive:
              at map scale the glyph is only ~4 device pixels. An <image> has
              neither problem and is identical in every engine. The emoji font
              is still used everywhere flags appear as text (HTML), where it
              works. */}
          {showCountryLabels && labelNodes.map((node) => {
            const { id, nameX, name } = node;
            const y = node.centroid![1];
            const size = 9 / Math.sqrt(view.k);
            const cls = id === playerId ? " is-player" : "";
            // Flag geometry: emoji flags are about 1.35 em wide and 1 em tall.
            const fw = size * 1.35;
            const fh = size * 0.98;
            return (
              <g key={`label-${id}`} pointerEvents="none">
                <image
                  href={`/flags/${id.toLowerCase()}.svg`}
                  x={node.flagX - fw / 2}
                  y={y - fh / 2}
                  width={fw}
                  height={fh}
                  preserveAspectRatio="xMidYMid meet"
                />
                <text
                  x={nameX}
                  y={y}
                  textAnchor="middle"
                  className={`worldmap-label${cls}`}
                  style={{ fontSize: `${size}px`, strokeWidth: `${size * HALO_RATIO}px` }}
                >
                  {name}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {tooltip && hovered && (
        <div
          className="worldmap-tooltip"
          style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}
        >
          <div className="worldmap-tooltip__title">
            {hovered.flag} {countryName(hovered)}
            {hovered.id === playerId && <span className="tag tag--you">{t("ui.side.you")}</span>}
          </div>
          {playerId && hovered.id !== playerId && (
            <div className="worldmap-tooltip__row">
              {t("ui.diplo.relation")}: <b>{relFor(hovered.id)}</b> ·{" "}
              {t(`att.${getAttitude(state?.countries.find((c) => c.id === hovered.id)?.relations[playerId] ?? 0)}_short`)}
            </div>
          )}
          <div className="worldmap-tooltip__row">
            {t("ui.nation.economy")} {hovered.economy} · {t("ui.nation.military")} {hovered.military} ·{" "}
            {t("ui.nation.stability")} {hovered.stability}
          </div>
          {atWarSet.has(hovered.id) && <div className="worldmap-tooltip__war">⚔ {t("ui.legend.war")}</div>}
          {/* Subject status is otherwise invisible: it lives on the lesser
              nation, or is implied by occupied land, and no panel shows it. */}
          {state && playerId && hovered.id !== playerId && (
            <>
              {isSubjectOf(state, hovered.id, playerId) && (
                <div className="worldmap-tooltip__row">{t("ui.subject.of_you")}</div>
              )}
              {isSubjectOf(state, playerId, hovered.id) && (
                <div className="worldmap-tooltip__row">{t("ui.subject.overlord")}</div>
              )}
            </>
          )}
        </div>
      )}

      {!preview && <div className="worldmap-hint">{t("ui.map.hint")}</div>}

      <button
        className="worldmap-reset"
        onClick={() => setView(IDENTITY)}
        title={t("ui.btn.reset_view")}
      >
        ⟲
      </button>
    </div>
  );
};

export default WorldMap;
