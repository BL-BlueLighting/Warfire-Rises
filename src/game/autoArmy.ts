import { Country, GameState } from "./types";
import { getCountryById } from "./state";
import {
  assignDivision,
  createGroup,
  findGeneral,
  unassigned,
  divisionsOf,
} from "./command";
import { canRecruit, startRecruit } from "./army";
import { t } from "../i18n";

/**
 * The general staff.
 *
 * Unlocked by the 邀请军事指挥家 decision. Once the army is theirs they run
 * training, assignment and dispatch every day: they rest broken formations,
 * put the right commander in front of the right order, spread replacements
 * evenly, and raise new divisions when the treasury allows.
 *
 * The player can still give orders. The staff will say so — see the objection
 * handling in the store — but it will not stop them.
 */

/** A formation is pulled out of the line below this average organisation. */
const REST_BELOW = 45;

/** Keep any one group from hoarding the army. */
const MAX_SHARE = 0.5;

/** How often the staff will raise a new division, in days. */
const RECRUIT_INTERVAL = 45;

export interface StaffReport {
  /** i18n key plus params for each thing the staff did. */
  actions: { key: string; params?: Record<string, string | number> }[];
}

/**
 * One day of staff work. Returns what it did, for the log.
 */
export function runArmyStaff(state: GameState, country: Country): StaffReport {
  const actions: StaffReport["actions"] = [];
  if (!country.autoArmy || country.divisions.length === 0) return { actions };

  const atWar = country.atWarWith.length > 0;
  const groups = country.armyGroups;
  // Having been overruled, the staff stands down on dispositions for a while.
  const silenced = state.day < country.staffSilencedUntil;

  // ── Rest anything that has been fought to a standstill ──
  for (const group of groups) {
    if (silenced) break;
    const divs = divisionsOf(country, group);
    if (divs.length === 0) continue;
    const avgOrg = divs.reduce((s, d) => s + d.organisation, 0) / divs.length;

    if (avgOrg < REST_BELOW && group.order !== "reserve") {
      group.order = "reserve";
      actions.push({ key: "ui.staff.rested", params: { name: group.nameParams?.n ?? group.id } });
    } else if (avgOrg > 85 && group.order === "reserve" && atWar) {
      // Rested and there is a war on — put them back in.
      group.order = "hold";
      actions.push({ key: "ui.staff.committed", params: { name: group.nameParams?.n ?? group.id } });
    }
  }

  // ── Give every group a commander suited to what it is being asked to do ──
  const taken = new Set<number>();
  for (const group of groups) {
    if (group.generalId !== null) taken.add(group.generalId);
  }
  for (const group of groups) {
    const wantsAttack = group.order === "assault";
    const best = country.generals
      .filter((g) => !taken.has(g.id))
      .sort((a, b) => (wantsAttack ? b.attack - a.attack : b.defense - a.defense))[0];
    if (!best) break;

    const current = findGeneral(country, group.generalId);
    const score = (g: typeof best) => (wantsAttack ? g.attack : g.defense);
    if (!current || score(best) > score(current)) {
      if (current) taken.delete(current.id);
      group.generalId = best.id;
      taken.add(best.id);
      actions.push({
        key: "ui.staff.appointed",
        params: { name: best.name, group: group.nameParams?.n ?? group.id },
      });
    }
  }

  // ── Spread replacements into the thinnest formation ──
  const spare = unassigned(country);
  if (spare.length > 0) {
    if (groups.length === 0) {
      const g = createGroup(country, 1);
      actions.push({ key: "ui.staff.formed", params: { n: 1 } });
      for (const d of spare) assignDivision(country, g.id, d.id);
    } else {
      const cap = Math.ceil(country.divisions.length * MAX_SHARE);
      for (const d of spare) {
        const target = [...groups].sort((a, b) => a.divisionIds.length - b.divisionIds.length)[0];
        if (target.divisionIds.length >= cap) break;
        assignDivision(country, target.id, d.id);
        actions.push({
          key: "ui.staff.assigned",
          params: { div: d.name, group: target.nameParams?.n ?? target.id },
        });
      }
    }
  }

  // ── Raise new formations when there is money and quiet ──
  if (!atWar && state.day % RECRUIT_INTERVAL === 0 && canRecruit(state, country.id, 1).ok) {
    const res = startRecruit(state, country.id, 1);
    if (res.ok) actions.push({ key: "ui.staff.recruited" });
  }

  return { actions };
}

/** Run the staff for every nation that has handed its army over. */
export function runAllStaff(state: GameState): { countryId: string; report: StaffReport }[] {
  const out: { countryId: string; report: StaffReport }[] = [];
  for (const country of state.countries) {
    if (!country.autoArmy) continue;
    const report = runArmyStaff(state, country);
    if (report.actions.length > 0) out.push({ countryId: country.id, report });
  }
  return out;
}

/** Render a staff report into lines, for the log and the day's messages. */
export function describeStaff(report: StaffReport): string[] {
  return report.actions.map((a) => t(a.key, a.params));
}

/**
 * Things the staff says when the player overrules it.
 *
 * Deliberately varied — a single repeated line would read as a bug rather than
 * a chief of staff with an opinion.
 */
export const OBJECTIONS = [
  "ui.objection.1",
  "ui.objection.2",
  "ui.objection.3",
  "ui.objection.4",
  "ui.objection.5",
];

export function pickObjection(): string {
  return OBJECTIONS[Math.floor(Math.random() * OBJECTIONS.length)];
}

/** Endurance lost for overruling the staff, per the brief: 1-23%. */
export function overruleCost(): number {
  return 1 + Math.floor(Math.random() * 23);
}

export { getCountryById };
