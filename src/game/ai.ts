import { GameState, getAttitude, type Country } from "./types";
import {
  getCountryById,
  adjustRelation,
  applyCollapse,
  addForce,
  addPublicSupport,
  isOutOfPlay,
} from "./state";
import { t } from "../i18n";
import { countryShortName } from "./names";
import { startDefensiveWar } from "./war";
import { profileFor } from "./difficulty";

/** Chance an AI pulls the trigger when every precondition is met. */
export const AI_WAR_CHANCE = 0.15;

/**
 * An AI nation's daily action.
 *
 * `notable` marks the ones a player would want interrupting them — wars,
 * peace deals, sanctions. Routine housekeeping (a drill, a propaganda
 * broadcast) still reaches the log, but not the notification bubbles: eleven
 * nations acting every day is a firehose, not news.
 */
export interface AiAction {
  text: string;
  notable: boolean;
  /**
   * Set on declarations of war. The prose alone cannot say who moved: both
   * sides' `atWarWith` lists grow on the same day, so anything watching the
   * world (a test, a future notification) needs the pair spelled out.
   */
  war?: { attacker: string; defender: string };
}

export function runAI(state: GameState): AiAction[] {
  const actions: AiAction[] = [];
  const note = (text: string, notable = false, war?: AiAction["war"]): void => {
    actions.push({ text, notable, war });
  };
  // Erased or defeated nations have no government left to act.
  const aiCountries = state.countries.filter(
    (c) => c.id !== state.playerCountryId && !isOutOfPlay(state, c.id)
  );

  for (const ai of aiCountries) {
    // Each AI country has a chance to take 1-2 actions
    const actionCount = Math.random() < 0.4 ? 2 : 1;

    for (let i = 0; i < actionCount; i++) {
      const roll = Math.random();
      const target = pickAITarget(state, ai.id);

      if (roll < 0.25 && target) {
        // Diplomatic action — which, against the right country and given the
        // appetite for it, may be a declaration of war.
        const tgt = getCountryById(state, target);
        const attitude = getAttitude(ai.relations[target] ?? 0);
        // Only a nation this country is genuinely finished with is a war
        // target. `warCandidates` already sifted the world down to hostile,
        // unallied, beatable nations; the target picked for diplomacy has to be
        // one of them before the army is even an option.
        const warTarget = warCandidates(state, ai).find((c) => c.id === target);
        const warRoll =
          AI_WAR_CHANCE * profileFor(state).warChance * (warTarget ? ai.aggression : 0);

        if (warTarget && ai.publicSupport > 65 && ai.military > 50 && Math.random() < warRoll) {
          // Attacking the player is an invasion, not background chatter.
          if (target === state.playerCountryId) {
            if (!startDefensiveWar(state, ai.id)) continue;
            note(
              t("ai.war_declared", { flag: ai.flag, name: countryShortName(ai), target: countryShortName(tgt) || target }),
              true,
              { attacker: ai.id, defender: target }
            );
            continue;
          }
          ai.atWarWith.push(target);
          if (tgt) tgt.atWarWith.push(ai.id);
          adjustRelation(state, ai.id, target, -25);
          applyCollapse(state, 1.5, t("ai.war_declared", { flag: ai.flag, name: countryShortName(ai), target: countryShortName(tgt) || target }));
          note(
            t("ai.war_declared", { flag: ai.flag, name: countryShortName(ai), target: countryShortName(tgt) || target }),
            true,
            { attacker: ai.id, defender: target }
          );
        } else if (attitude === "peaceful" || attitude === "neutral") {
          adjustRelation(state, ai.id, target, 5 + Math.floor(Math.random() * 10));
          note(t("ai.action.diplomacy", { flag: ai.flag, name: countryShortName(ai) }));
        } else {
          adjustRelation(state, ai.id, target, -5);
          note(t("ai.sanction_imposed", { flag: ai.flag, name: countryShortName(ai), target: countryShortName(tgt) || target }), true);
        }
      } else if (roll < 0.45) {
        // Military drill
        ai.military = Math.min(100, ai.military + 1 * profileFor(state).aiGrowth);
        ai.forceValue = Math.min(100, ai.forceValue + 3);
        note(t("ai.action.military_drill", { flag: ai.flag, name: countryShortName(ai) }));
      } else if (roll < 0.65) {
        // Economic adjustment
        ai.economy = Math.max(0, Math.min(100, ai.economy + (Math.random() > 0.5 ? 2 : -1)));
        ai.treasury += Math.floor(Math.random() * 100) - 30;
        note(t("ai.action.economic", { flag: ai.flag, name: countryShortName(ai) }));
      } else if (roll < 0.8) {
        // Propaganda
        ai.publicSupport = Math.min(100, ai.publicSupport + 3 + Math.floor(Math.random() * 5));
        ai.stability = Math.min(100, ai.stability + 2);
        note(t("ai.action.propaganda", { flag: ai.flag, name: countryShortName(ai) }));
      } else {
        // Espionage / covert ops
        const spyTarget = pickAITarget(state, ai.id);
        if (spyTarget) {
          adjustRelation(state, ai.id, spyTarget, -3);
          const tgt = getCountryById(state, spyTarget);
          if (tgt) {
            tgt.stability = Math.max(0, tgt.stability - 2);
            addPublicSupport(state, ai.id, 1);
          }
        }
        note(t("ai.action.espionage", { flag: ai.flag, name: countryShortName(ai) }));
      }
    }

    // Passive force and public support drift
    addForce(state, ai.id, Math.floor(Math.random() * 4) - 1);
    addPublicSupport(state, ai.id, Math.floor(Math.random() * 3) - 1);
  }

  // Random peace deals between AI countries at war.
  //
  // Deliberately excludes the player: an AI rolling a die must not silently
  // dissolve a war the player is in. Without this guard a war with the player
  // simply evaporated after a few days, with no notification and no way to
  // react — and it made the wartime rules (nuclear release) unreliable.
  // Ending a war with the player is the player's call: win it, or retreat.
  for (const country of aiCountries) {
    for (const enemyId of [...country.atWarWith]) {
      if (enemyId === state.playerCountryId) continue;
      if (Math.random() < 0.15) {
        country.atWarWith = country.atWarWith.filter((id) => id !== enemyId);
        const enemy = getCountryById(state, enemyId);
        if (enemy) {
          enemy.atWarWith = enemy.atWarWith.filter((id) => id !== country.id);
          adjustRelation(state, country.id, enemyId, 10);
          applyCollapse(state, -1, t("ai.peace_signed", { flag: country.flag, name: countryShortName(country), target: countryShortName(enemy) }));
          note(t("ai.peace_signed", { flag: country.flag, name: countryShortName(country), target: countryShortName(enemy) }), true);
        }
      }
    }
  }

  return actions;
}

/**
 * The nations this one is willing to fight *today*.
 *
 * The point is that a war should read as a position, not a dice roll. Most of
 * that comes from the world's own data — the allies/enemies lists and the
 * relations table are drawn from real alignments — and the rest from the
 * nation's own appetite (`aggression`) and from whether the war is winnable.
 *
 * Excluded, in order: itself, nations already out of play, anyone either side
 * counts as an ally, anyone the two are not *mutually* done with (one-sided
 * hostility is a grudge), nations already at war, and nations too strong to
 * take on.
 */
function warCandidates(state: GameState, ai: Country): Country[] {
  // One war at a time. A nation already fighting does not open a second front
  // on a whim — this single line removes most of the cascade the old AI caused.
  if (ai.atWarWith.length > 0) return [];
  // Some nations do not invade anybody. They still defend themselves, sanction
  // and manoeuvre; they just never pull the trigger first.
  if (ai.aggression < PACIFIST) return [];

  return state.countries.filter((other) => {
    if (other.id === ai.id) return false;
    if (isOutOfPlay(state, other.id)) return false;
    if (ai.allies.includes(other.id) || other.allies.includes(ai.id)) return false;
    if (ai.atWarWith.includes(other.id) || other.atWarWith.includes(ai.id)) return false;
    // Both sides have to be done with each other — one-sided hostility is a
    // grudge, not a war.
    const own = ai.relations[other.id] ?? 0;
    const theirs = other.relations[ai.id] ?? 0;
    if (own > IRRECONCILABLE || theirs > IRRECONCILABLE) return false;
    // Either the roster already names them an adversary (that table is the
    // world's own stance), or the relationship has gone past the point of no
    // return since. Random pairs that merely drifted apart do not qualify.
    if (!ai.enemies.includes(other.id) && !(own <= HOSTILE_RELATION && theirs <= HOSTILE_RELATION)) {
      return false;
    }
    // A war you cannot win is not a plan: the aggressive nations will accept
    // near parity, everyone else wants an edge.
    const acceptable = ai.aggression >= 1.2 ? 0.85 : 1.1;
    return ai.military >= other.military * acceptable;
  });
}

/** Below this the UI already reads "irreconcilable" — see types.ts. */
const IRRECONCILABLE = -50;

/** Deep enough that even a nation without a grudge on record will move. */
const HOSTILE_RELATION = -70;

/** Nations below this appetite never start a war, whatever the provocation. */
const PACIFIST = 0.5;

function pickAITarget(state: GameState, countryId: string): string | null {
  const country = getCountryById(state, countryId);
  if (!country) return null;

  const others = state.countries.filter((c) => c.id !== countryId && !isOutOfPlay(state, c.id));
  if (others.length === 0) return null;

  // Prefer enemies, then tense relations, then random
  const enemies = others.filter((c) => country.enemies.includes(c.id));
  if (enemies.length > 0 && Math.random() < 0.6) {
    return enemies[Math.floor(Math.random() * enemies.length)].id;
  }

  const tense = others.filter((c) => (country.relations[c.id] ?? 0) < -20);
  if (tense.length > 0 && Math.random() < 0.4) {
    return tense[Math.floor(Math.random() * tense.length)].id;
  }

  return others[Math.floor(Math.random() * others.length)].id;
}
