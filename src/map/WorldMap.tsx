import React, { useEffect, useMemo, useRef, useState } from "react";
import Map from "ol/Map";
import View from "ol/View";
import Feature, { type FeatureLike } from "ol/Feature";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import Graticule from "ol/layer/Graticule";
import MultiPolygon from "ol/geom/MultiPolygon";
import Point from "ol/geom/Point";
import Polygon from "ol/geom/Polygon";
import type Geometry from "ol/geom/Geometry";
import { Style, Fill, Stroke, Circle as CircleStyle, Icon, Text as TextStyle } from "ol/style";
import { useStore, selectCountry, setHovered } from "../game/store";
import { isOutOfPlay } from "../game/state";
import { getAttitude, type Country } from "../game/types";
import { t, useLanguage } from "../i18n";
import { countryName } from "../game/names";
import { isSubjectOf } from "../game/subjects";
import {
  MAP_HEIGHT,
  MAP_PROJECTION_CODE,
  MAP_WIDTH,
  PLAYABLE_FEATURES,
  REST_FEATURES,
  WORLD_FEATURES,
  cutRingAtAntimeridian,
  registerMapProjection,
} from "./geo";
import { PALETTE, buildColorMap } from "./colors";
import { CITIES, CITY_MIN_ZOOM, type City } from "./cities";
import { REGIONS, REGION_LABEL_MIN_ZOOM, type Region } from "./provinces";
import { COUNTRIES } from "../game/countries";
import { DEFAULT_ERA, eraAutonomousRegions, eraRoster, getEra } from "../game/eras";
import { flagSrc } from "../game/flags";
import Flag from "../components/Flag";
import { useSettings } from "../game/settings";
import "./worldmap.css";

/**
 * The world map, drawn by OpenLayers.
 *
 * This used to be hand-rolled SVG: every store notification re-rendered a
 * thousand province paths through React and the browser re-rasterised them.
 * OpenLayers keeps the geometry in a canvas and moves a camera over it, so a
 * pan or a zoom is a transform rather than a reconciliation — and projection,
 * hit-testing, layer order and label styling come from the engine instead of
 * being maintained here.
 *
 * The look is unchanged: the same Natural Earth projection (registered as a
 * coordinate reference system in geo.ts), the same palette, the same layers in
 * the same order.
 */

/** Title-screen mode: the map doubles as the nation picker. */
export interface MapPreview {
  /** Fill per country id. */
  colors: Record<string, string>;
  selectedId: string | null;
  onSelect: (countryId: string) => void;
  /** Nation labels; the preview shows names but never interior detail. */
  showLabels?: boolean;
  /** Kept for callers that pre-warm the map; OpenLayers draws on demand. */
  warm?: boolean;
  /** Historical borders to draw: see game/eras.ts. */
  eraId?: string;
}

interface WorldMapProps {
  preview?: MapPreview;
}

/** How far past the fitted world view the camera may zoom in, in zoom levels. */
const ZOOM_SPAN = 4.6;

/** How far past the world box the camera may still be panned. */
const PAD = 120;

/** Below this on-screen area a nation's label is suppressed. */
const MIN_LABEL_AREA = 250;

/** Below this on-screen area a province name is suppressed. */
const MIN_REGION_LABEL_AREA = 26;

/**
 * Nation labels: the one piece of text the map is read for.
 *
 * Sized in pixels of the *canvas*, so they do not grow when the map is zoomed
 * — a name is a label, not a feature. 15px is the smallest that stays legible
 * over the palette without the two dozen names crowding each other out.
 */
const COUNTRY_LABEL_FONT = '600 15px "WF Display", "WF Body", sans-serif';
const COUNTRY_FLAG_PX = 24;

/**
 * Where a nation's name goes.
 *
 * Not the centre of its bounding box. A nation's outline comes in pieces, and
 * the pieces can be half a world apart: Russia's Chukotka is past the date
 * line, so the box that spans it runs from Europe to the Bering Strait and its
 * centre lands in the North Sea; France's Guyana is in South America, which
 * puts the French label off Morocco. The name belongs on the largest piece,
 * at a point the engine guarantees is inside it.
 */
function labelAnchor(geometry: Geometry): Point {
  const pieces =
    geometry.getType() === "MultiPolygon"
      ? (geometry as MultiPolygon).getPolygons()
      : [geometry as Polygon];
  const mainland = pieces.reduce((a, b) => (b.getArea() > a.getArea() ? b : a));
  return mainland.getInteriorPoint();
}

/**
 * Everything a style function needs, in a ref.
 *
 * OpenLayers calls style functions from its own render loop, not from React's,
 * so they must not close over one render's variables — they read the current
 * snapshot instead.
 */
interface MapContext {
  preview?: MapPreview;
  state: ReturnType<typeof useStore>["state"];
  ui: ReturnType<typeof useStore>["ui"];
  settings: ReturnType<typeof useSettings>;
  /** The scenario on screen, for the flag each nation flies. */
  eraId: string;
  /** Province id → who ran it, for provinces the capital did not govern. */
  autonomous: Record<string, string>;
  lang: string;
  colors: Record<string, string>;
  atWar: Set<string>;
  destroyed: Set<string>;
  outOfPlay: Set<string>;
  playerId: string | null;
  hoveredId: string | null;
  selectedId: string | null;
}

interface MapLayers {
  countries: VectorLayer<VectorSource>;
  era: VectorLayer<VectorSource>;
  autonomy: VectorLayer<VectorSource>;
  conquest: VectorLayer<VectorSource>;
  provinces: VectorLayer<VectorSource>;
  cities: VectorLayer<VectorSource>;
  labels: VectorLayer<VectorSource>;
  regionLabels: VectorLayer<VectorSource>;
}

const WorldMap: React.FC<WorldMapProps> = ({ preview }) => {
  const { state, ui } = useStore();
  const lang = useLanguage();
  const settings = useSettings();

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const layersRef = useRef<MapLayers | null>(null);
  const [baseZoom, setBaseZoom] = useState(0);
  /** The scenario whose borders are on screen, and the features fetched for it. */
  const eraId = preview?.eraId ?? state?.era ?? DEFAULT_ERA;
  const eraFeaturesRef = useRef<Feature[] | null>(null);
  const [eraReady, setEraReady] = useState(0);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; id: string } | null>(null);
  const [localHover, setLocalHover] = useState<string | null>(null);

  const hoveredId = preview ? localHover : ui.hoveredCountryId;
  const selectedId = preview ? preview.selectedId : ui.selectedCountryId;
  const playerId = preview ? null : state?.playerCountryId ?? null;
  const setHoveredId = preview ? setLocalHover : setHovered;

  // Recomputed every render: the store mutates in place, so a memo would be
  // stale the moment a relation moved. It is twelve entries.
  const colors = preview?.colors ?? (state ? buildColorMap(state, ui.mapMode) : {});
  const atWar = new Set(
    preview ? [] : state?.countries.find((c) => c.id === state.playerCountryId)?.atWarWith ?? []
  );
  // The provinces the capital did not govern, as a lookup for the style
  // function — which runs outside React and cannot afford a list scan. The
  // title screen reads the scenario's table directly, so the map shows the
  // country you are about to pick, cliques and all.
  const autonomous: Record<string, string> = Object.fromEntries(
    (preview
      ? eraAutonomousRegions(getEra(preview.eraId ?? DEFAULT_ERA))
      : state?.autonomous ?? []
    ).map((a) => [a.regionId, a.nameKey])
  );
  const destroyed = new Set(
    (preview ? [] : state?.countries ?? []).filter((c) => c.destroyed).map((c) => c.id)
  );
  const outOfPlay = new Set(
    (preview ? [] : state?.countries ?? [])
      .filter((c) => isOutOfPlay(state!, c.id))
      .map((c) => c.id)
  );

  const ctxRef = useRef<MapContext>({
    preview,
    state,
    ui,
    settings,
    eraId,
    autonomous,
    lang,
    colors,
    atWar,
    destroyed,
    outOfPlay,
    playerId,
    hoveredId,
    selectedId,
  });
  // OpenLayers reads this from its own callbacks, which run outside React.
  ctxRef.current = {
    preview,
    state,
    ui,
    settings,
    eraId,
    autonomous,
    lang,
    colors,
    atWar,
    destroyed,
    outOfPlay,
    playerId,
    hoveredId,
    selectedId,
  };

  /**
   * On-screen magnification relative to the fitted world view.
   *
   * The layer gates (city tiers, province names) are all written against this
   * factor — the same number the SVG map used to compute from its transform —
   * so they carry over unchanged.
   */
  const baseResRef = useRef(1);
  const factor = () => {
    const resolution = mapRef.current?.getView().getResolution() ?? baseResRef.current;
    return baseResRef.current / resolution;
  };
  const factorRef = useRef(factor);
  factorRef.current = factor;

  // ── The era's borders, fetched when the scenario changes ─────────
  useEffect(() => {
    let cancelled = false;
    eraFeaturesRef.current = null;
    setEraReady(0);
    fetch(`/eras/${eraId}.json`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((collection: { features: { properties: { nation: string }; geometry: unknown }[] }) => {
        if (cancelled) return;
        const features = collection.features.map((f) => {
          const geometry = f.geometry as { type: string; coordinates: number[][][] | number[][][][] };
          const ol =
            geometry.type === "Polygon"
              ? new Polygon(geometry.coordinates as number[][][])
              : new MultiPolygon(geometry.coordinates as number[][][][]);
          ol.transform("EPSG:4326", MAP_PROJECTION_CODE);
          const feature = new Feature(ol);
          feature.set("nation", f.properties.nation, true);
          return feature;
        });
        eraFeaturesRef.current = features;
        setEraReady((n) => n + 1);
      })
      .catch(() => {
        if (!cancelled) setEraReady((n) => n + 1);
      });
    return () => {
      cancelled = true;
    };
  }, [eraId]);

  // ── Sources, built once ──────────────────────────────────────────
  const sources = useMemo(() => {
    registerMapProjection();

    /**
     * Build a feature from a GeoJSON geometry.
     *
     * Not `readFeatures`: that copies the GeoJSON `properties` and nothing else,
     * and the country id lives on the feature object itself — every country
     * came back anonymous and drew as nothing.
     */
    const featureFrom = (
      geometry: { type: string; coordinates: unknown },
      props: Record<string, unknown>
    ): Feature => {
      const polygons: [number, number][][][] =
        geometry.type === "Polygon"
          ? [geometry.coordinates as [number, number][][]]
          : (geometry.coordinates as [number, number][][][]);

      // Every ring is cut at the antimeridian before it is projected: Russia's
      // outline, Antarctica and Fiji all wrap the date line, and a wrapped ring
      // drawn point by point becomes a band right across the map.
      const cut: number[][][][] = [];
      for (const polygon of polygons) {
        for (const ring of polygon) {
          // Each cut piece is a ring of its own, so it becomes its own polygon.
          for (const piece of cutRingAtAntimeridian(ring)) cut.push([piece]);
        }
      }
      const olGeometry =
        cut.length === 1 ? new Polygon(cut[0]) : new MultiPolygon(cut);
      olGeometry.transform("EPSG:4326", MAP_PROJECTION_CODE);
      const feature = new Feature(olGeometry);
      for (const [key, value] of Object.entries(props)) feature.set(key, value, true);
      return feature;
    };

    const countries = new VectorSource({
      features: WORLD_FEATURES.filter((f) => f.countryId).map((f) =>
        featureFrom(f.geometry as never, { countryId: f.countryId })
      ),
    });
    const era = new VectorSource({ features: [] });
    const inert = new VectorSource({
      features: REST_FEATURES.map((f) => featureFrom(f.geometry as never, {})),
    });

    // Provinces arrive as raw lon/lat rings; the engine projects them.
    const ringFeatures: Feature[] = [];
    for (const [baseOwner, regions] of REGIONS) {
      for (const region of regions) {
        for (const ring of region.rings) {
          const geometry = new Polygon([ring as number[][]]);
          geometry.transform("EPSG:4326", MAP_PROJECTION_CODE);
          const feature = new Feature(geometry);
          feature.set("baseOwner", baseOwner, true);
          feature.set("regionId", region.id, true);
          ringFeatures.push(feature);
        }
      }
    }
    const conquest = new VectorSource({ features: ringFeatures });
    // Same geometry, stroked instead of filled: the interior borders.
    const provinces = new VectorSource({ features: ringFeatures.map((f) => f.clone()) });

    const cityFeatures: Feature[] = [];
    for (const [countryId, cities] of CITIES) {
      for (const city of cities) {
        const geometry = new Point(city.lonLat);
        geometry.transform("EPSG:4326", MAP_PROJECTION_CODE);
        const feature = new Feature(geometry);
        feature.set("city", city, true);
        feature.set("countryId", countryId, true);
        cityFeatures.push(feature);
      }
    }
    const cities = new VectorSource({ features: cityFeatures });

    // One anchor per nation, on the mainland.
    const labelFeatures: Feature[] = [];
    for (const [countryId, world] of PLAYABLE_FEATURES) {
      const geometry = featureFrom(world.geometry as never, {}).getGeometry();
      if (!geometry) continue;
      // `area` stays the bounding box of the whole nation: it is the gate that
      // decides whether a nation is big enough to carry a name, and the box is
      // the honest measure of that. The *anchor* is a different question.
      const extent = geometry.getExtent();
      const point = new Feature(labelAnchor(geometry));
      point.set("countryId", countryId, true);
      point.set("area", (extent[2] - extent[0]) * (extent[3] - extent[1]), true);
      labelFeatures.push(point);
    }
    const labels = new VectorSource({ features: labelFeatures });

    return { countries, era, inert, conquest, provinces, cities, labels };
  }, []);

  // ── Styles ───────────────────────────────────────────────────────
  const styles = useMemo(() => {
    const country = (feature: FeatureLike): Style[] => {
      const c = ctxRef.current;
      const id = feature.get("countryId") as string | undefined;
      if (!id || c.outOfPlay.has(id)) return [];
      const selected = c.selectedId === id;
      return [
        new Style({
          fill: new Fill({ color: c.atWar.has(id) ? PALETTE.war : c.colors[id] ?? PALETTE.neutral }),
          stroke: new Stroke({
            color: selected ? PALETTE.selected : PALETTE.border,
            width: selected ? 2.4 : 1,
          }),
        }),
      ];
    };

    const eraNation = (feature: FeatureLike): Style => {
      const c = ctxRef.current;
      const nation = feature.get("nation") as string;
      const isNation = nation !== "other" && Boolean(COUNTRIES.find((x) => x.id === nation));
      const selected = isNation && c.selectedId === nation;
      return new Style({
        fill: new Fill({
          color: isNation
            ? c.atWar.has(nation)
              ? PALETTE.war
              : c.colors[nation] ?? PALETTE.neutral
            : PALETTE.unclaimed,
        }),
        stroke: new Stroke({
          color: selected ? PALETTE.selected : PALETTE.border,
          width: selected ? 2.2 : isNation ? 1 : 0.5,
        }),
      });
    };

    const inert = new Style({
      fill: new Fill({ color: PALETTE.unclaimed }),
      stroke: new Stroke({ color: PALETTE.border, width: 0.6 }),
    });

    const conquest = (feature: FeatureLike): Style | void => {
      const c = ctxRef.current;
      const base = feature.get("baseOwner") as string;
      // Land that sank is not repainted for whoever had occupied it.
      if (c.destroyed.has(base)) return;
      const owner = c.state?.regionOwner?.[feature.get("regionId") as string];
      if (!owner || owner === base) return;
      const fill = c.colors[owner];
      if (fill) return new Style({ fill: new Fill({ color: fill }) });
    };

    /**
     * Provinces the capital did not govern — 1938 China's cliques.
     *
     * A mark on the land, not an owner: the province still belongs to the
     * country, so this is a wash over that country's colour and a broken
     * border, never another nation's fill.
     */
    const autonomy = (feature: FeatureLike): Style | void => {
      const c = ctxRef.current;
      const regionId = feature.get("regionId") as string;
      const destroyed = feature.get("baseOwner") as string;
      if (c.destroyed.has(destroyed)) return;
      if (!c.autonomous[regionId]) return;
      return new Style({
        fill: new Fill({ color: "rgba(10, 9, 5, 0.45)" }),
        stroke: new Stroke({
          color: "rgba(228, 216, 188, 0.5)",
          width: 1,
          lineDash: [4, 3],
        }),
      });
    };

    /**
     * Province boundaries: the dividing lines inside a nation.
     *
     * Stroked only, never filled — the fill belongs to whichever layer owns
     * the land, so these lines read the same whether the modern borders are
     * being drawn under them or a scenario's.
     */
    const province = (feature: FeatureLike): Style | void => {
      const c = ctxRef.current;
      if (c.destroyed.has(feature.get("baseOwner") as string)) return;
      return new Style({
        stroke: new Stroke({ color: "rgba(8, 7, 5, 0.75)", width: 1 }),
      });
    };

    const city = (feature: FeatureLike): Style[] => {
      const c = ctxRef.current;
      const city = feature.get("city") as City;
      const countryId = feature.get("countryId") as string;
      if (c.outOfPlay.has(countryId)) return [];
      const k = factorRef.current();
      if (k < CITY_MIN_ZOOM[city.tier]) return [];
      if (city.tier !== 3) {
        const allowed = city.isProvinceCapital
          ? c.settings.showProvinceCapitals
          : c.settings.showMajorCities;
        if (!allowed) return [];
      }
      const capital = city.tier === 3;
      return [
        new Style({
          image: new CircleStyle({
            radius: capital ? 2.6 : 1.9,
            fill: new Fill({ color: "#e9dfc6" }),
            stroke: new Stroke({ color: PALETTE.border, width: 0.8 }),
          }),
          text: new TextStyle({
            text: c.lang === "zh-cn" ? city.zh : city.en,
            font: `${capital ? 11 : 10}px "WF Body", sans-serif`,
            offsetX: 6,
            textAlign: "left",
            fill: new Fill({ color: "#e6dcc4" }),
            stroke: new Stroke({ color: "rgba(6, 6, 5, 0.85)", width: 3 }),
          }),
        }),
      ];
    };

    const label = (feature: FeatureLike): Style[] => {
      const c = ctxRef.current;
      const id = feature.get("countryId") as string;
      if (c.outOfPlay.has(id)) return [];
      if (!(c.preview ? c.preview.showLabels !== false : c.settings.showCountryNames)) return [];
      const highlighted = id === c.playerId || id === c.selectedId || id === c.hoveredId;
      const k = factorRef.current();
      if (((feature.get("area") as number) ?? 0) * k >= MIN_LABEL_AREA || highlighted) {
        // In a campaign the live roster; on the title screen the era's.
        const country =
          c.state?.countries.find((x) => x.id === id) ??
          eraRoster(c.preview?.eraId ?? DEFAULT_ERA).find((x) => x.id === id) ??
          COUNTRIES.find((x) => x.id === id);
        if (country) {
          return [
            new Style({
              image: new Icon({
                src: flagSrc(id, c.eraId, c.settings.streamingMode),
                anchor: [1, 0.5],
                // Width rather than scale: the flag files are not all the same
                // aspect ratio, and a nation's name is read before its flag.
                width: COUNTRY_FLAG_PX,
              }),
              text: new TextStyle({
                text: countryName(country) + (c.ui.showDebugCodes ? ` (${id})` : ""),
                font: COUNTRY_LABEL_FONT,
                offsetX: COUNTRY_FLAG_PX + 6,
                textAlign: "left",
                fill: new Fill({ color: "#f3ead4" }),
                stroke: new Stroke({ color: "rgba(6, 6, 5, 0.92)", width: 4 }),
              }),
            }),
          ];
        }
      }
      return [];
    };

    const regionLabel = (feature: FeatureLike): Style | void => {
      const c = ctxRef.current;
      if (!c.settings.showRegionNames) return;
      const base = feature.get("baseOwner") as string;
      if (c.destroyed.has(base)) return;
      const k = factorRef.current();
      if (k < REGION_LABEL_MIN_ZOOM) return;
      const region: Region | undefined = REGIONS.get(base)?.find(
        (r) => r.id === feature.get("regionId")
      );
      if (!region || region.area * k * k < MIN_REGION_LABEL_AREA) return;
      return new Style({
        text: new TextStyle({
          text: c.lang === "zh-cn" ? region.zh : region.en,
          font: '10px "WF Body", sans-serif',
          fill: new Fill({ color: "rgba(216, 207, 186, 0.72)" }),
          stroke: new Stroke({ color: "rgba(6, 6, 5, 0.8)", width: 3 }),
        }),
      });
    };

    return { country, eraNation, autonomy, inert, conquest, province, city, label, regionLabel };
  }, [baseZoom]);

  // ── The map itself, created once ─────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const inertLayer = new VectorLayer({ source: sources.inert, style: styles.inert });
    const layers: MapLayers = {
      countries: new VectorLayer({ source: sources.countries, style: styles.country }),
      era: new VectorLayer({ source: sources.era, style: styles.eraNation, zIndex: 1 }),
      // Between the country's own colour and everything painted over it: an
      // occupied province is a stronger fact than a semi-autonomous one.
      autonomy: new VectorLayer({ source: sources.provinces, style: styles.autonomy, zIndex: 1.5 }),
      conquest: new VectorLayer({ source: sources.conquest, style: styles.conquest, zIndex: 2 }),
      provinces: new VectorLayer({ source: sources.provinces, style: styles.province, zIndex: 3 }),
      regionLabels: new VectorLayer({
        source: sources.provinces,
        style: styles.regionLabel,
        zIndex: 4,
        declutter: true,
      }),
      // `declutter` is the engine dropping overlapping labels for us — the
      // hand-rolled SVG map spent a few hundred lines on that.
      cities: new VectorLayer({
        source: sources.cities,
        style: styles.city,
        zIndex: 6,
        declutter: true,
      }),
      labels: new VectorLayer({
        source: sources.labels,
        style: styles.label,
        zIndex: 8,
        declutter: true,
      }),
    };

    const map = new Map({
      target: containerRef.current,
      layers: [
        new Graticule({
          strokeStyle: new Stroke({ color: PALETTE.graticule, width: 0.6 }),
          showLabels: false,
          wrapX: false,
          zIndex: 0,
        }),
        inertLayer,
        layers.countries,
        layers.era,
        layers.autonomy,
        layers.conquest,
        layers.provinces,
        layers.regionLabels,
        layers.cities,
        layers.labels,
      ],
      view: new View({
        projection: MAP_PROJECTION_CODE,
        center: [MAP_WIDTH / 2, MAP_HEIGHT / 2],
        zoom: 0,
        constrainResolution: false,
        // Panning stops at the edges of the map plus a margin, instead of
        // letting the camera wander into empty space. The margin matters at the
        // fitted zoom: the world is 2:1 and the viewport rarely is, so some
        // slack around the box keeps the letterboxed axis scrollable.
        extent: [-PAD, -PAD, MAP_WIDTH + PAD, MAP_HEIGHT + PAD],
      }),
      controls: [],
    });
    mapRef.current = map;
    layersRef.current = layers;

    // Dev-only handle, the same courtesy the store extends to the console.
    if (import.meta.env.DEV) {
      (window as unknown as { __worldmap?: Map }).__worldmap = map;
    }

    const view = map.getView();
    /**
     * Frame the whole world.
     *
     * The container is laid out by the app shell a frame or two after mount, so
     * fitting once at creation framed a map that was still 534 pixels wide and
     * left the camera zoomed into the middle of Asia. It runs again on every
     * container resize until it has a real size — and only until then, so
     * opening a panel later does not yank the camera back.
     */
    let framed = false;
    const frameWorld = () => {
      const size = map.getSize();
      if (!size || size[0] === 0) return;
      map.updateSize();
      // Contain the world box in the viewport, centred. Computed rather than
      // fitted: `View.fit` also has to satisfy the view's own extent, and the
      // pair together left the camera zoomed into Asia.
      const resolution = Math.max(MAP_WIDTH / size[0], MAP_HEIGHT / size[1]);
      view.setCenter([MAP_WIDTH / 2, MAP_HEIGHT / 2]);
      view.setResolution(resolution);
      if (framed) return;
      framed = true;
      baseResRef.current = resolution;
      // Bounds for the wheel: from the framed world out to ZOOM_SPAN levels in,
      // which is what the old SVG map allowed.
      const zoom = view.getZoom() ?? 0;
      view.setMinZoom(zoom);
      view.setMaxZoom(zoom + ZOOM_SPAN);
      setBaseZoom(resolution);
    };
    frameWorld();
    const observer = new ResizeObserver(() => frameWorld());
    observer.observe(containerRef.current);

    const countryAt = (pixel: number[]) => {
      const era = map.forEachFeatureAtPixel(
        pixel,
        (f) => (f.get("nation") as string | undefined) ?? null,
        { hitTolerance: 1, layerFilter: (l) => l === layers.era }
      );
      if (era && era !== "other") return era;
      return (
        map.forEachFeatureAtPixel(
          pixel,
          (f) => (f.get("countryId") as string | undefined) ?? null,
          { hitTolerance: 1, layerFilter: (l) => l === layers.countries }
        ) ?? null
      );
    };

    map.on("pointermove", (event) => {
      const id = countryAt(event.pixel);
      setHoveredId(id);
      const original = event.originalEvent as PointerEvent;
      setTooltip(id ? { x: original.offsetX, y: original.offsetY, id } : null);
    });
    map.on("singleclick", (event) => {
      const id = countryAt(event.pixel);
      if (!id) return;
      if (ctxRef.current.preview) ctxRef.current.preview.onSelect(id);
      else selectCountry(id);
    });

    return () => {
      observer.disconnect();
      map.setTarget(undefined);
      mapRef.current = null;
      layersRef.current = null;
    };
  }, [sources, styles, setHoveredId]);

  // ── Restyle when the world changes ───────────────────────────────
  // The signature covers everything the style functions read. Anything else —
  // the clock ticking, a log line — must not force a repaint, which is the
  // whole point of moving off per-frame SVG.
  const signature = [
    Object.values(colors).join(""),
    [...atWar].sort().join(","),
    [...outOfPlay].sort().join(","),
    Object.entries(state?.regionOwner ?? {})
      .sort()
      .flat()
      .join(","),
    hoveredId ?? "",
    selectedId ?? "",
    String(settings.showCountryNames),
    String(settings.showRegionNames),
    String(settings.showProvinceCapitals),
    String(settings.showMajorCities),
    String(ui.showDebugCodes),
    lang,
    String(baseZoom),
  ].join("|");

  useEffect(() => {
    const layers = layersRef.current;
    if (!layers) return;
    for (const layer of Object.values(layers)) layer.changed();
  }, [signature]);

  // Push the fetched scenario into its layer, and take the modern *national*
  // borders off screen: two sets of coastlines at once read as a mistake.
  //
  // The province layer stays. Its lines are the only subdivision the map has
  // — the scenario borders are country outlines, with nothing inside them —
  // and without it a nation is one flat shape with no interior at all.
  useEffect(() => {
    const layers = layersRef.current;
    const features = eraFeaturesRef.current;
    if (!layers) return;
    if (!features) return;
    const source = layers.era.getSource();
    if (!source) return;
    source.clear();
    source.addFeatures(features);
    layers.countries.setVisible(false);
    layers.era.changed();
  }, [eraReady]);

  const resetView = () => {
    const map = mapRef.current;
    if (!map) return;
    const size = map.getSize();
    if (!size) return;
    const resolution = Math.max(MAP_WIDTH / size[0], MAP_HEIGHT / size[1]);
    map.getView().setCenter([MAP_WIDTH / 2, MAP_HEIGHT / 2]);
    map.getView().setResolution(resolution);
  };

  /** The provinces of a nation its capital did not govern, named for display. */
  const autonomousBy = (countryId: string) =>
    (state?.autonomous ?? [])
      .filter((a) => a.regionId.startsWith(`${countryId}-`))
      .map((a) => {
        const region = REGIONS.get(countryId)?.find((r) => r.id === a.regionId);
        return {
          region: region ? (lang === "zh-cn" ? region.zh : region.en) : a.regionId,
          nameKey: a.nameKey,
        };
      });

  const hovered: Country | undefined = tooltip
    ? preview
      ? eraRoster(preview.eraId ?? DEFAULT_ERA).find((c) => c.id === tooltip.id) ??
        COUNTRIES.find((c) => c.id === tooltip.id)
      : state?.countries.find((c) => c.id === tooltip.id)
    : undefined;

  return (
    <div className="worldmap">
      <div ref={containerRef} className="worldmap-svg" />

      {tooltip && hovered && (
        <div className="worldmap-tooltip" style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}>
          <div className="worldmap-tooltip__title">
            <Flag id={hovered.id} era={eraId} /> {countryName(hovered)}
            {hovered.id === playerId && <span className="tag tag--you">{t("ui.side.you")}</span>}
          </div>
          {playerId && hovered.id !== playerId && (
            <div className="worldmap-tooltip__row">
              {t("ui.diplo.relation")}: <b>{hovered.relations[playerId] ?? 0}</b> ·{" "}
              {t(`att.${getAttitude(hovered.relations[playerId] ?? 0)}_short`)}
            </div>
          )}
          <div className="worldmap-tooltip__row">
            {t("ui.nation.economy")} {hovered.economy} · {t("ui.nation.military")} {hovered.military}{" "}
            · {t("ui.nation.stability")} {hovered.stability}
          </div>
          {atWar.has(hovered.id) && <div className="worldmap-tooltip__war">⚔ {t("ui.legend.war")}</div>}
          {/* Shaded provinces are otherwise unexplained: the wash says "someone
              else runs this" and this says who. */}
          {state && autonomousBy(hovered.id).length > 0 && (
            <div className="worldmap-tooltip__row">
              {t("ui.nation.autonomous")}:{" "}
              {autonomousBy(hovered.id)
                .slice(0, 4)
                .map((a) => `${a.region}·${t(a.nameKey)}`)
                .join(lang === "zh-cn" ? "、" : ", ")}
              {autonomousBy(hovered.id).length > 4 && " …"}
            </div>
          )}
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

      <button className="worldmap-reset" onClick={resetView} title={t("ui.map.reset")}>
        ⌖
      </button>
    </div>
  );
};

export default WorldMap;
