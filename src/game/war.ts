import { GameState, WarState, Country, getAttitude } from "./types";
import {
  getPlayerCountry,
  getCountryById,
  applyCollapse,
  adjustRelation,
  createWarState,
  declareConquest,
} from "./state";
import { t } from "../i18n";
import { countryShortName } from "./names";
import { armyManpower, meetsWarManpower, WAR_MIN_MANPOWER } from "./army";
import { isBroken, resolveRound, type Stance } from "./combat";
import { openConference } from "./peace";

/** Which side of the active war the player is on, or null when at peace. */
export function playerWarSide(state: GameState): "attacker" | "defender" | null {
  const war = state.activeWar;
  if (!war?.active) return null;
  if (war.attacker === state.playerCountryId) return "attacker";
  if (war.defender === state.playerCountryId) return "defender";
  return null;
}

/**
 * A war the player did not start.
 *
 * Until now every war was the player's own offensive, so `activeWar` always
 * had the player as attacker. Being invaded is the one thing that can end a
 * campaign, so it needs to be modelled explicitly.
 */
export function startDefensiveWar(state: GameState, aggressorId: string): boolean {
  if (state.activeWar?.active) return false;
  if (aggressorId === state.playerCountryId) return false;

  const player = getPlayerCountry(state);
  const aggressor = getCountryById(state, aggressorId);
  if (!aggressor) return false;
  if (player.atWarWith.includes(aggressorId)) return false;

  player.atWarWith.push(aggressorId);
  aggressor.atWarWith.push(player.id);
  state.activeWar = createWarState(aggressorId, player.id, state.day);
  applyCollapse(state, 8, `Invasion: ${countryShortName(aggressor)} attacks ${countryShortName(player)}`);
  return true;
}

export function canDeclareWar(state: GameState, target: Country): { ok: boolean; reason: string } {
  const player = getPlayerCountry(state);
  const pRel = player.relations[target.id] ?? 0;
  const tRel = target.relations[state.playerCountryId] ?? 0;
  const mutualAtt = getAttitude(Math.min(pRel, tRel));

  if (player.atWarWith.includes(target.id)) {
    return { ok: false, reason: t("war.start.already_at_war", { name: countryShortName(target) }) };
  }
  // A casus belli must be justified first — see the dip.justify action.
  if (!player.warGoals.includes(target.id)) {
    return { ok: false, reason: t("war.start.no_casus_belli", { name: countryShortName(target) }) };
  }
  // The army has to actually exist before it can march.
  if (!meetsWarManpower(player)) {
    return {
      ok: false,
      reason: t("war.start.no_manpower", {
        have: armyManpower(player),
        need: WAR_MIN_MANPOWER,
      }),
    };
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

/**
 * Declare war between two nations, whoever they may be.
 *
 * This is the scripted path — the `War` decision reward runs through it — so it
 * deliberately skips the diplomatic gates `canDeclareWar` enforces (casus
 * belli, public support, army endurance, coercion readiness). A decision file
 * is the authority on what its own scenario permits. What it will not do is
 * contradict the world: nobody declares on themselves, and two nations already
 * at war cannot start over.
 */
export function declareWarBetween(
  state: GameState,
  attackerId: string,
  defenderId: string
): boolean {
  const attacker = getCountryById(state, attackerId);
  const defender = getCountryById(state, defenderId);
  if (!attacker || !defender || attacker.id === defender.id) return false;
  if (attacker.atWarWith.includes(defender.id)) return false;

  // There is exactly one `activeWar` and it belongs to the player, so a war
  // between two other nations is recorded in the `atWarWith` lists alone —
  // the same way AI wars are when the AI starts one. Anything else would let a
  // decision file hijack the war the player is actually fighting.
  const involvesPlayer =
    attacker.id === state.playerCountryId || defender.id === state.playerCountryId;

  // Only one war runs at a time; an unfinished one is archived, exactly as it
  // is when the player declares a fresh war through the action.
  if (involvesPlayer && state.activeWar?.active) {
    state.warHistory.push({ ...state.activeWar, active: false, phase: "ended" });
  }

  attacker.atWarWith.push(defender.id);
  defender.atWarWith.push(attacker.id);
  // The casus belli is spent when war is declared.
  attacker.warGoals = attacker.warGoals.filter((id) => id !== defender.id);

  if (involvesPlayer) state.activeWar = createWarState(attacker.id, defender.id, state.day);
  adjustRelation(state, attacker.id, defender.id, -30);
  applyCollapse(
    state,
    8,
    `War declared: ${countryShortName(attacker)} vs ${countryShortName(defender)}`
  );
  return true;
}

export function startWar(state: GameState, targetId: string): string {
  const target = getCountryById(state, targetId);
  if (!target) return t("war.start.unknown_country", { id: targetId });
  if (target.id === state.playerCountryId) return t("war.start.self");

  const check = canDeclareWar(state, target);
  if (!check.ok) return check.reason;

  if (!declareWarBetween(state, state.playerCountryId, target.id)) {
    return t("war.start.already_at_war", { name: countryShortName(target) });
  }

  return t("war.start.success", { flag: target.flag, name: countryShortName(target) });
}

/**
 * Set the player's stance for the current war.
 *
 * Battles now resolve themselves daily — this is an order, not an attack. The
 * old model resolved a whole battle from one dice roll on demand; the game this
 * borrows from fights continuously while you decide how hard to press.
 */
export function setStance(state: GameState, stance: Stance): string {
  const war = state.activeWar;
  if (!war?.active) return t("war.attack.no_war");
  const side = playerWarSide(state);
  if (!side) return t("war.attack.no_war");

  if (side === "attacker") war.attackerStance = stance;
  else war.defenderStance = stance;

  war.phase = "active";
  return stance === "assault" ? t("war.stance.assault") : t("war.stance.hold");
}

/** Kept for the console: `war attack` now orders an assault. */
export function warAttack(state: GameState): string {
  return setStance(state, "assault");
}

export function warDefend(state: GameState): string {
  return setStance(state, "hold");
}

/** One day of fighting, run from the daily tick while a war is live. */
export function tickWar(state: GameState): string | null {
  const war = state.activeWar;
  if (!war?.active) return null;

  if (war.phase === "preparing") war.phase = "active";

  const report = resolveRound(state, war);
  const attacker = getCountryById(state, war.attacker);
  const defender = getCountryById(state, war.defender);

  const lines: string[] = [];
  const icon =
    report.defenderOrgLost > report.attackerOrgLost ? "⚔" : report.attackerOrgLost > report.defenderOrgLost ? "🛡" : "⚖";
  lines.push(
    t("war.round", {
      day: report.day,
      icon,
      aOrg: report.attackerOrgLost,
      dOrg: report.defenderOrgLost,
    })
  );
  if (report.defenderBroken > 0) lines.push(t("war.round.broken", { n: report.defenderBroken, name: countryShortName(defender) }));
  if (report.attackerBroken > 0) lines.push(t("war.round.broken", { n: report.attackerBroken, name: countryShortName(attacker) }));

  war.battles.push({
    id: war.battles.length + 1,
    name: t("war.battle.name", { day: state.day }),
    day: state.day,
    attackerRoll: Math.round(war.attackerMorale),
    defenderRoll: Math.round(war.defenderMorale),
    result:
      report.defenderOrgLost > report.attackerOrgLost
        ? "attacker_win"
        : report.attackerOrgLost > report.defenderOrgLost
        ? "defender_win"
        : "stalemate",
    description: lines.join(" · "),
  });

  applyCollapse(state, 1, `Battle: ${countryShortName(attacker)} vs ${countryShortName(defender)}`);

  if (war.defenderMorale <= 20 || war.attackerMorale <= 20) war.phase = "decisive";

  // A side that cannot field a division with any organisation left has lost.
  const attackerBroken = isBroken(state, war.attacker);
  const defenderBroken = isBroken(state, war.defender);
  if (defenderBroken || attackerBroken) {
    const winnerId = defenderBroken ? war.attacker : war.defender;
    war.phase = "ended";
    war.active = false;
    war.winner = winnerId;
    const loserId = defenderBroken ? war.defender : war.attacker;
    endWar(state, war);
    if (loserId === state.playerCountryId) {
      declareConquest(state, winnerId);
      return t("war.conquered");
    }
    const winner = getCountryById(state, winnerId);

    // Carve up the loser. The conference is the player's to run whenever their
    // own side won — either they led the war or fought in it.
    const playerWon =
      winnerId === state.playerCountryId ||
      Boolean(winner?.allies.includes(state.playerCountryId));
    if (playerWon) {
      state.conference = openConference(state, loserId, winnerId);
    }

    return t("war.victory", { flag: winner?.flag ?? "", name: countryShortName(winner) });
  }

  return lines.join("\n");
}

export function warRetreat(state: GameState): string {
  if (!state.activeWar?.active) return t("war.retreat.no_war");
  const war = state.activeWar;
  const side = playerWarSide(state);

  // Surrendering while being invaded means losing the country outright.
  if (side === "defender") {
    const invader = war.attacker;
    war.winner = invader;
    war.active = false;
    war.phase = "ended";
    endWar(state, war);
    declareConquest(state, invader);
    return t("war.retreat.conquered", {
      flag: getCountryById(state, invader)?.flag ?? "",
      name: countryShortName(getCountryById(state, invader)),
    });
  }

  const loser = getCountryById(state, war.attacker)!;
  war.winner = war.defender;
  war.active = false;
  war.phase = "ended";
  war.defenderMorale = Math.min(100, war.defenderMorale + 20);

  loser.stability = Math.max(0, loser.stability - 20);
  loser.publicSupport = Math.max(0, loser.publicSupport - 15);
  state.nationalEndurance = Math.max(0, state.nationalEndurance - 15);

  endWar(state, war);
  return t("war.retreat.success", { name: countryShortName(loser) });
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
    `${t("war.attacker")}: ${attacker.flag} ${countryShortName(attacker)}`,
    `${t("war.defender")}: ${defender.flag} ${countryShortName(defender)}`,
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
