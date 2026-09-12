import { ArmyGroup, Country, Division, GameState, General } from "./types";

/**
 * Army command.
 *
 * Divisions are not an undifferentiated pool: they belong to army groups, each
 * with a commander and a standing order. Only groups told to assault or hold
 * take the field — anything marked reserve stays out of the line entirely, which
 * is how you rest a broken formation without disbanding it.
 *
 * A commander's skill feeds straight into the combat pools: attack for weight of
 * fire, defence for the ability to absorb it, planning for how fast a line digs
 * in. An army with no commander still fights, just without the bonus.
 */

/** Names are drawn from a per-country pool so they read plausibly. */
const SURNAMES_CN = ["李", "王", "张", "刘", "陈", "杨", "赵", "黄", "周", "吴", "徐", "孙"];
const GIVEN_CN = ["振国", "铁生", "克强", "志远", "文斌", "海涛", "立新", "建国", "峰", "涛", "毅", "锐"];
const FIRST_EN = ["Alex", "Marcus", "Victor", "Elias", "Raymond", "Owen", "Felix", "Adrian", "Conrad", "Julian"];
const LAST_EN = ["Hale", "Vance", "Doyle", "Marsh", "Baird", "Keller", "Rowe", "Sinclair", "Whitaker", "Pike"];

/** Deterministic-ish selection so a country's roster is stable per campaign. */
function pick<T>(arr: T[], n: number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    out.push(pool[Math.floor(Math.random() * pool.length)]);
    pool.splice(pool.indexOf(out[out.length - 1]), 1);
  }
  return out;
}

export function makeGenerals(countryId: string, count = 4): General[] {
  const cn = /^(CHN|PRK)$/.test(countryId);
  const surnames = pick(SURNAMES_CN, count);
  const given = pick(GIVEN_CN, count);
  const firsts = pick(FIRST_EN, count);
  const lasts = pick(LAST_EN, count);

  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    // Two name styles so the roster does not read as one culture's army.
    name: cn
      ? `${surnames[i % surnames.length]}${given[i % given.length]}`
      : `${firsts[i % firsts.length]} ${lasts[i % lasts.length]}`,
    // 1-5. A spread rather than uniform, so choosing a commander matters.
    attack: 1 + Math.floor(Math.random() * 5),
    defense: 1 + Math.floor(Math.random() * 5),
    planning: 1 + Math.floor(Math.random() * 5),
  }));
}

let groupSeq = 0;

/** Every nation starts with one group holding its whole army, so nothing is unassigned. */
export function makeInitialGroups(country: Country, generals: General[]): ArmyGroup[] {
  groupSeq += 1;
  return [
    {
      id: groupSeq,
      nameKey: "ui.command.group_n",
      nameParams: { n: 1 },
      generalId: generals[0]?.id ?? null,
      divisionIds: country.divisions.map((d) => d.id),
      order: "hold",
    },
  ];
}

export function nextGroupId(): number {
  groupSeq += 1;
  return groupSeq;
}

/** Divisions of a country that no group claims. */
export function unassigned(country: Country): Division[] {
  const claimed = new Set(country.armyGroups.flatMap((g) => g.divisionIds));
  return country.divisions.filter((d) => !claimed.has(d.id));
}

export function divisionsOf(country: Country, group: ArmyGroup): Division[] {
  const byId = new Map(country.divisions.map((d) => [d.id, d]));
  return group.divisionIds.map((id) => byId.get(id)).filter((d): d is Division => Boolean(d));
}

export function findGroup(country: Country, groupId: number): ArmyGroup | undefined {
  return country.armyGroups.find((g) => g.id === groupId);
}

export function findGeneral(country: Country, generalId: number | null): General | undefined {
  if (generalId === null) return undefined;
  return country.generals.find((g) => g.id === generalId);
}

/**
 * Combat multiplier from the commanders of the groups actually committed.
 *
 * Uncommanded groups dilute the average rather than being ignored, so leaving a
 * formation leaderless is a real cost.
 */
export function commandBonus(country: Country): { attack: number; defense: number } {
  const committed = country.armyGroups.filter((g) => g.order !== "reserve");
  if (committed.length === 0) return { attack: 1, defense: 1 };

  let attack = 0;
  let defense = 0;
  for (const group of committed) {
    const general = findGeneral(country, group.generalId);
    // Each pip of skill is worth 6%.
    attack += 1 + (general?.attack ?? 0) * 0.06;
    defense += 1 + (general?.defense ?? 0) * 0.06;
  }
  return { attack: attack / committed.length, defense: defense / committed.length };
}

/** Entrenchment accrues faster under a general who plans. */
export function entrenchmentRate(country: Country): number {
  const committed = country.armyGroups.filter((g) => g.order !== "reserve");
  if (committed.length === 0) return 1;
  const planning =
    committed.reduce((sum, g) => sum + (findGeneral(country, g.generalId)?.planning ?? 0), 0) /
    committed.length;
  return 1 + planning * 0.12;
}

/** Move a division into a group, taking it from wherever it was. */
export function assignDivision(country: Country, groupId: number, divisionId: number): void {
  for (const g of country.armyGroups) {
    g.divisionIds = g.divisionIds.filter((id) => id !== divisionId);
  }
  const group = findGroup(country, groupId);
  if (group) group.divisionIds.push(divisionId);
}

export function removeDivision(country: Country, divisionId: number): void {
  for (const g of country.armyGroups) {
    g.divisionIds = g.divisionIds.filter((id) => id !== divisionId);
  }
}

export function createGroup(country: Country, n: number): ArmyGroup {
  const group: ArmyGroup = {
    id: nextGroupId(),
    nameKey: "ui.command.group_n",
    nameParams: { n },
    generalId: country.generals.find((g) => !country.armyGroups.some((x) => x.generalId === g.id))?.id ?? null,
    divisionIds: [],
    order: "hold",
  };
  country.armyGroups.push(group);
  return group;
}

export function disbandGroup(country: Country, groupId: number): void {
  country.armyGroups = country.armyGroups.filter((g) => g.id !== groupId);
}

/** The orders a group can be given. */
export const ORDERS: { id: ArmyGroup["order"]; labelKey: string; hintKey: string }[] = [
  { id: "assault", labelKey: "ui.command.assault", hintKey: "ui.command.assault_hint" },
  { id: "hold", labelKey: "ui.command.hold", hintKey: "ui.command.hold_hint" },
  { id: "reserve", labelKey: "ui.command.reserve", hintKey: "ui.command.reserve_hint" },
];

/** Groups of a nation, in a stable order. */
export function groupsOf(state: GameState, countryId: string): ArmyGroup[] {
  return state.countries.find((c) => c.id === countryId)?.armyGroups ?? [];
}
