import { GameState, getAttitude } from "./types";
import { getCountryById, adjustRelation, applyCollapse, addForce, addPublicSupport } from "./state";
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
}

export function runAI(state: GameState): AiAction[] {
  const actions: AiAction[] = [];
  const note = (text: string, notable = false): void => {
    actions.push({ text, notable });
  };
  const aiCountries = state.countries.filter((c) => c.id !== state.playerCountryId);

  for (const ai of aiCountries) {
    // Each AI country has a chance to take 1-2 actions
    const actionCount = Math.random() < 0.4 ? 2 : 1;

    for (let i = 0; i < actionCount; i++) {
      const roll = Math.random();
      const target = pickAITarget(state, ai.id);

      if (roll < 0.25 && target) {
        // Diplomatic action
        const attitude = getAttitude(ai.relations[target] ?? 0);
        if (attitude === "peaceful" || attitude === "neutral") {
          adjustRelation(state, ai.id, target, 5 + Math.floor(Math.random() * 10));
          note(t("ai.action.diplomacy", { flag: ai.flag, name: countryShortName(ai) }));
        } else if (attitude === "irreconcilable" && ai.publicSupport > 65 && ai.military > 50) {
          const tgt = getCountryById(state, target);
          // Guard against re-declaring: without this the same pair re-declares
          // every single day, each time adding collapse and driving relations
          // further down — a runaway that was invisible in the CLI edition's
          // short campaign but ends a continuous-time game in seconds.
          const alreadyAtWar =
            ai.atWarWith.includes(target) || (tgt?.atWarWith.includes(ai.id) ?? false);
          // Even when everything lines up, an AI only rarely takes the plunge.
          // With 12 nations there are 66 possible pairs, so an ungated roll had
          // wars accumulating into a collapse cascade.
          if (!alreadyAtWar && Math.random() < AI_WAR_CHANCE * profileFor(state).warChance) {
            // Attacking the player is an invasion, not background chatter.
            if (target === state.playerCountryId) {
              if (!startDefensiveWar(state, ai.id)) continue;
              actions.push({
                text: t("ai.war_declared", { flag: ai.flag, name: countryShortName(ai), target: countryShortName(tgt) || target }),
                notable: true,
              });
              continue;
            }
            ai.atWarWith.push(target);
            if (tgt) tgt.atWarWith.push(ai.id);
            adjustRelation(state, ai.id, target, -25);
            applyCollapse(state, 1.5, t("ai.war_declared", { flag: ai.flag, name: countryShortName(ai), target: countryShortName(tgt) || target }));
            note(t("ai.war_declared", { flag: ai.flag, name: countryShortName(ai), target: countryShortName(tgt) || target }), true);
          }
        } else {
          adjustRelation(state, ai.id, target, -5);
          note(t("ai.sanction_imposed", { flag: ai.flag, name: countryShortName(ai), target: countryShortName(getCountryById(state, target)) || target }), true);
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

function pickAITarget(state: GameState, countryId: string): string | null {
  const country = getCountryById(state, countryId);
  if (!country) return null;

  const others = state.countries.filter((c) => c.id !== countryId);
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
