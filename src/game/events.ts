import { GameEvent, GameState } from "./types";
import { getPlayerCountry, getCountryById, applyCollapse, adjustRelation } from "./state";
import { t } from "../i18n";
import { profileFor } from "./difficulty";
import { countryShortName } from "./names";

interface EventTemplate {
  key: string;
  type: GameEvent["type"];
  severity: GameEvent["severity"];
  wcChange: number;
  weight: number;
}

const EVENT_POOL: EventTemplate[] = [
  { key: "event.military_drills", type: "military", severity: "medium", wcChange: 3, weight: 10 },
  { key: "event.missile_test", type: "military", severity: "high", wcChange: 6, weight: 5 },
  { key: "event.naval_standoff", type: "military", severity: "high", wcChange: 5, weight: 6 },
  { key: "event.cyber_attack", type: "military", severity: "high", wcChange: 4, weight: 5 },
  { key: "event.arms_deal", type: "military", severity: "medium", wcChange: 2, weight: 7 },
  { key: "event.border_skirmish", type: "military", severity: "critical", wcChange: 8, weight: 3 },
  { key: "event.government_crisis", type: "political", severity: "medium", wcChange: 2, weight: 8 },
  { key: "event.contested_election", type: "political", severity: "medium", wcChange: 3, weight: 6 },
  { key: "event.leader_speech", type: "political", severity: "low", wcChange: 1, weight: 10 },
  { key: "event.coup_attempt", type: "political", severity: "critical", wcChange: 7, weight: 2 },
  { key: "event.market_crash", type: "economic", severity: "high", wcChange: 4, weight: 5 },
  { key: "event.trade_war", type: "economic", severity: "medium", wcChange: 3, weight: 7 },
  { key: "event.sanctions_crushing", type: "economic", severity: "high", wcChange: 3, weight: 4 },
  { key: "event.energy_crisis", type: "economic", severity: "high", wcChange: 5, weight: 5 },
  { key: "event.tech_breakthrough", type: "economic", severity: "low", wcChange: 1, weight: 8 },
  { key: "event.peace_deal", type: "diplomatic", severity: "medium", wcChange: -4, weight: 4 },
  { key: "event.alliance_treaty", type: "diplomatic", severity: "medium", wcChange: 2, weight: 6 },
  { key: "event.summit_breakthrough", type: "diplomatic", severity: "low", wcChange: -3, weight: 5 },
  { key: "event.diplomatic_expulsion", type: "diplomatic", severity: "medium", wcChange: 3, weight: 7 },
  { key: "event.un_resolution", type: "diplomatic", severity: "low", wcChange: 1, weight: 9 },
  { key: "event.earthquake", type: "disaster", severity: "critical", wcChange: 2, weight: 3 },
  { key: "event.pandemic", type: "disaster", severity: "critical", wcChange: 6, weight: 2 },
  { key: "event.climate_catastrophe", type: "disaster", severity: "high", wcChange: 4, weight: 3 },
  { key: "event.nuclear_emergency", type: "disaster", severity: "critical", wcChange: 7, weight: 1 },
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedPick(events: EventTemplate[]): EventTemplate {
  const totalWeight = events.reduce((sum, e) => sum + e.weight, 0);
  let r = Math.random() * totalWeight;
  for (const ev of events) {
    r -= ev.weight;
    if (r <= 0) return ev;
  }
  return events[events.length - 1];
}

function pickTwoCountries(state: GameState, preferEnemies: boolean): [string, string] {
  const countryIds = state.countries.map((c) => c.id);
  const a = pickRandom(countryIds);

  if (preferEnemies) {
    const aCountry = getCountryById(state, a)!;
    const enemies = countryIds.filter(
      (id) => id !== a && (aCountry.enemies.includes(id) || (aCountry.relations[id] ?? 0) < -30)
    );
    if (enemies.length > 0) return [a, pickRandom(enemies)];
  }

  const b = pickRandom(countryIds.filter((id) => id !== a));
  return [a, b];
}

/**
 * Probability that any given day produces a world event.
 *
 * The CLI edition generated 1-3 events every single day, which was fine when
 * the player clicked through one day at a time. Time now runs continuously at
 * up to 5 days/second, so a daily event would flood the screen. Most days are
 * quiet; a few produce one event, and rarely two.
 */
export const DAILY_EVENT_CHANCE = 0.08;

export function generateDailyEvents(state: GameState, _count: number): GameEvent[] {
  const events: GameEvent[] = [];
  const playerCountry = getPlayerCountry(state);

  if (state.day === 1 && state.events.length === 0) {
    events.push({
      id: ++state.eventIdCounter,
      day: state.day,
      title: t("event.intro.title"),
      description: t("event.intro.desc", {
        flag: playerCountry.flag,
        name: countryShortName(playerCountry),
        headlines: state.worldKeywords.join(", "),
      }),
      type: "political",
      severity: "medium",
      affectedCountries: [state.playerCountryId],
      worldCollapseChange: 0,
    });
  }

  // The intro event above is unconditional; everything else waits for a roll.
  // Difficulty scales that roll — the daily briefing is the main dial the
  // player feels.
  const chance = Math.min(1, DAILY_EVENT_CHANCE * profileFor(state).eventChance);
  if (events.length === 0 && Math.random() > chance) return events;

  const eventCount = Math.random() < 0.15 ? 2 : 1;

  for (let i = 0; i < eventCount; i++) {
    const scaledPool =
      state.worldCollapse > 60
        ? EVENT_POOL
        : state.worldCollapse > 30
        ? EVENT_POOL.filter((e) => e.severity !== "critical")
        : EVENT_POOL.filter((e) => e.severity === "low" || e.severity === "medium");

    const template = weightedPick(scaledPool);
    const preferEnemies = template.type === "military" || template.type === "crisis";
    const [a, b] = pickTwoCountries(state, preferEnemies);
    const aCountry = getCountryById(state, a)!;
    const bCountry = getCountryById(state, b)!;

    const event: GameEvent = {
      id: ++state.eventIdCounter,
      day: state.day,
      title: t(`${template.key}.title`, { A: countryShortName(aCountry), B: countryShortName(bCountry) }),
      description: t(`${template.key}.desc`, { A: countryShortName(aCountry), B: countryShortName(bCountry) }),
      type: template.type,
      severity: template.severity,
      affectedCountries: [a, b],
      worldCollapseChange: template.wcChange,
    };

    events.push(event);

    adjustRelation(state, a, b, template.type === "diplomatic" && template.wcChange < 0 ? 15 : -10);

    if (aCountry.stability !== undefined) {
      aCountry.stability = Math.max(0, aCountry.stability - (template.severity === "critical" ? 10 : 3));
    }
  }

  if (Math.random() < 0.3) {
    const template = weightedPick(EVENT_POOL);
    const other = pickRandom(state.countries.filter((c) => c.id !== state.playerCountryId));

    const event: GameEvent = {
      id: ++state.eventIdCounter,
      day: state.day,
      title: t(`${template.key}.title`, { A: countryShortName(other), B: countryShortName(playerCountry) }),
      description: t(`${template.key}.desc`, { A: countryShortName(other), B: countryShortName(playerCountry) }),
      type: template.type,
      severity: template.severity,
      affectedCountries: [state.playerCountryId, other.id],
      worldCollapseChange: template.wcChange,
    };

    events.push(event);
  }

  return events;
}

export function processDayEvents(state: GameState): void {
  const events = generateDailyEvents(state, 2);
  state.events.push(...events);

  for (const ev of events) {
    if (ev.worldCollapseChange !== 0) {
      applyCollapse(state, ev.worldCollapseChange, ev.title);
    }
  }

  state.briefing = events.map(
    (ev) => `[${t(`severity.${ev.severity}`).toUpperCase()}] ${ev.title} — ${ev.description}`
  );

  const criticalEvents = events.filter((e) => e.severity === "critical").length;
  if (criticalEvents > 0) {
    state.nationalEndurance = Math.max(0, state.nationalEndurance - criticalEvents * 5);
  }

  if (state.worldCollapse > 50) {
    applyCollapse(state, 0.3, t("collapse.global_tensions"));
  }
}
