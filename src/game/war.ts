import { GameState, WarState, BattleRecord, Country, getAttitude } from "../types";
import { getPlayerCountry, getCountryById, applyCollapse, adjustRelation } from "./state";
import { t } from "../i18n";

export function canDeclareWar(state: GameState, target: Country): { ok: boolean; reason: string } {
  const player = getPlayerCountry(state);
  const pRel = player.relations[target.id] ?? 0;
  const tRel = target.relations[state.playerCountryId] ?? 0;
  const mutualAtt = getAttitude(Math.min(pRel, tRel));

  if (player.atWarWith.includes(target.id)) {
    return { ok: false, reason: t("war.start.already_at_war", { name: target.name }) };
  }
  if (mutualAtt === "peaceful" || mutualAtt === "neutral") {
    return { ok: false, reason: t("war.start.no_attitude", { att: t(`att.${mutualAtt}`) }) };
  }
  if (player.publicSupport <= 65) {
    return { ok: false, reason: t("war.start.no_support", { sup: player.publicSupport }) };
  }
  if (state.armyEndurance <= 79) {
    return { ok: false, reason: t("war.start.no_endurance", { ae: state.armyEndurance }) };
  }
  return { ok: true, reason: "" };
}

export function startWar(state: GameState, targetId: string): string {
  const target = getCountryById(state, targetId);
  if (!target) return t("war.start.unknown_country", { id: targetId });
  if (target.id === state.playerCountryId) return t("war.start.self");

  const check = canDeclareWar(state, target);
  if (!check.ok) return check.reason;

  if (state.activeWar?.active) {
    // End previous war if attacker is the same player
    state.warHistory.push({ ...state.activeWar, active: false, phase: "ended" });
  }

  const player = getPlayerCountry(state);
  player.atWarWith.push(target.id);
  target.atWarWith.push(state.playerCountryId);

  state.activeWar = {
    active: true,
    attacker: state.playerCountryId,
    defender: targetId,
    dayStarted: state.day,
    attackerMorale: 100,
    defenderMorale: 100,
    attackerLosses: 0,
    defenderLosses: 0,
    battles: [],
    phase: "preparing",
    winner: null,
  };

  adjustRelation(state, state.playerCountryId, target.id, -30);
  applyCollapse(state, 5, `War declared: ${getPlayerCountry(state).name} vs ${target.name}`);

  return t("war.start.success", { flag: target.flag, name: target.name });
}

export function warAttack(state: GameState): string {
  if (!state.activeWar?.active) return t("war.attack.no_war");
  const war = state.activeWar;
  war.phase = "active";

  const attacker = getCountryById(state, war.attacker)!;
  const defender = getCountryById(state, war.defender)!;

  const aRoll = Math.floor(Math.random() * 50) + (attacker.military / 2) + (war.attackerMorale / 5);
  const dRoll = Math.floor(Math.random() * 50) + (defender.military / 2) + (war.defenderMorale / 5);

  let result: BattleRecord["result"];
  let desc: string;

  if (aRoll > dRoll + 15) {
    result = "attacker_win";
    desc = `${attacker.name} breaks through ${defender.name}'s lines.`;
    war.defenderMorale -= 15;
    war.defenderLosses += Math.floor(Math.random() * 8) + 3;
    war.attackerLosses += Math.floor(Math.random() * 4) + 1;
    defender.military = Math.max(0, defender.military - 5);
    defender.stability = Math.max(0, defender.stability - 5);
    applyCollapse(state, 2, `Battle: ${attacker.name} advances`);
  } else if (dRoll > aRoll + 15) {
    result = "defender_win";
    desc = `${defender.name} repels ${attacker.name}'s assault.`;
    war.attackerMorale -= 15;
    war.attackerLosses += Math.floor(Math.random() * 8) + 3;
    war.defenderLosses += Math.floor(Math.random() * 4) + 1;
    state.armyEndurance = Math.max(0, state.armyEndurance - 8);
    applyCollapse(state, 1, `Battle: ${defender.name} holds`);
  } else {
    result = "stalemate";
    desc = `Fierce fighting yields no clear advantage.`;
    war.attackerMorale -= 8;
    war.defenderMorale -= 8;
    war.attackerLosses += Math.floor(Math.random() * 5) + 2;
    war.defenderLosses += Math.floor(Math.random() * 5) + 2;
  }

  const battle: BattleRecord = {
    id: war.battles.length + 1,
    name: `Battle of Day ${state.day}`,
    day: state.day,
    attackerRoll: aRoll,
    defenderRoll: dRoll,
    result,
    description: desc,
  };
  war.battles.push(battle);

  // Check if war is decisive
  if (war.defenderMorale <= 20 || war.attackerMorale <= 20) {
    war.phase = "decisive";
  }
  if (war.defenderMorale <= 0) {
    war.phase = "ended";
    war.active = false;
    war.winner = war.attacker;
    endWar(state, war);
  }
  if (war.attackerMorale <= 0) {
    war.phase = "ended";
    war.active = false;
    war.winner = war.defender;
    endWar(state, war);
  }

  return t("war.attack.success");
}

export function warDefend(state: GameState): string {
  if (!state.activeWar?.active) return t("war.defend.no_war");
  const war = state.activeWar;
  const defender = getCountryById(state, war.defender)!;

  war.defenderMorale = Math.min(100, war.defenderMorale + 10);
  defender.stability = Math.min(100, defender.stability + 3);
  war.phase = "active";

  return t("war.defend.success");
}

export function warRetreat(state: GameState): string {
  if (!state.activeWar?.active) return t("war.retreat.no_war");
  const war = state.activeWar;

  const loser = getCountryById(state, war.attacker)!;
  war.winner = war.defender;
  war.active = false;
  war.phase = "ended";
  war.defenderMorale = Math.min(100, war.defenderMorale + 20);

  loser.stability = Math.max(0, loser.stability - 20);
  loser.publicSupport = Math.max(0, loser.publicSupport - 15);
  state.nationalEndurance = Math.max(0, state.nationalEndurance - 15);

  endWar(state, war);
  return t("war.retreat.success", { name: loser.name });
}

function endWar(state: GameState, war: WarState): void {
  const attacker = getCountryById(state, war.attacker);
  const defender = getCountryById(state, war.defender);
  if (attacker) attacker.atWarWith = attacker.atWarWith.filter((id) => id !== war.defender);
  if (defender) defender.atWarWith = defender.atWarWith.filter((id) => id !== war.attacker);

  adjustRelation(state, war.attacker, war.defender, -20);
  state.warHistory.push({ ...war });
  if (state.activeWar === war) state.activeWar = null;
}

export function getWarStatusText(state: GameState): string {
  if (!state.activeWar) return t("war.status.no_war");

  const war = state.activeWar;
  const attacker = getCountryById(state, war.attacker)!;
  const defender = getCountryById(state, war.defender)!;

  const lines = [
    t("war.battle_header"),
    `${t("war.attacker")}: ${attacker.flag} ${attacker.name}`,
    `${t("war.defender")}: ${defender.flag} ${defender.name}`,
    `${t("war.phase")}: ${t(`war.${war.phase}`)}`,
    `${t("war.morale")}: ⚔ ${war.attackerMorale}% | 🛡 ${war.defenderMorale}%`,
    `${t("war.losses")}: ⚔ ${war.attackerLosses} | 🛡 ${war.defenderLosses}`,
    `──────────────────────────────`,
  ];

  if (war.battles.length > 0) {
    lines.push(`Battles (${war.battles.length}):`);
    for (const b of war.battles.slice(-5)) {
      const resultIcon =
        b.result === "attacker_win" ? "⚔" : b.result === "defender_win" ? "🛡" : "⚖";
      lines.push(
        `  Day ${b.day} ${resultIcon} ${b.name}: ${b.description} (ATK:${b.attackerRoll} vs DEF:${b.defenderRoll})`
      );
    }
  }

  if (war.winner) {
    const winner = getCountryById(state, war.winner)!;
    lines.push(`\n🏆 ${t("war.winner")}: ${winner.flag} ${winner.name}`);
  }

  return lines.join("\n");
}
