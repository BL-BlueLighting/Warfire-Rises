import { GameState, getAttitude } from "../types";
import { getCountryById, adjustRelation, applyCollapse, addForce, addPublicSupport } from "./state";
import { t } from "../i18n";

export function runAI(state: GameState): string[] {
  const actions: string[] = [];
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
          actions.push(t("ai.action.diplomacy", { flag: ai.flag, name: ai.name }));
        } else if (attitude === "irreconcilable" && ai.publicSupport > 65 && ai.military > 50) {
          // AI declares war
          ai.atWarWith.push(target);
          const tgt = getCountryById(state, target);
          if (tgt) tgt.atWarWith.push(ai.id);
          adjustRelation(state, ai.id, target, -25);
          applyCollapse(state, 3, t("ai.war_declared", { flag: ai.flag, name: ai.name, target: tgt?.name ?? target }));
          actions.push(t("ai.war_declared", { flag: ai.flag, name: ai.name, target: tgt?.name ?? target }));
        } else {
          adjustRelation(state, ai.id, target, -5);
          actions.push(t("ai.sanction_imposed", { flag: ai.flag, name: ai.name, target: getCountryById(state, target)?.name ?? target }));
        }
      } else if (roll < 0.45) {
        // Military drill
        ai.military = Math.min(100, ai.military + 1);
        ai.forceValue = Math.min(100, ai.forceValue + 3);
        actions.push(t("ai.action.military_drill", { flag: ai.flag, name: ai.name }));
      } else if (roll < 0.65) {
        // Economic adjustment
        ai.economy = Math.max(0, Math.min(100, ai.economy + (Math.random() > 0.5 ? 2 : -1)));
        ai.treasury += Math.floor(Math.random() * 100) - 30;
        actions.push(t("ai.action.economic", { flag: ai.flag, name: ai.name }));
      } else if (roll < 0.80) {
        // Propaganda
        ai.publicSupport = Math.min(100, ai.publicSupport + 3 + Math.floor(Math.random() * 5));
        ai.stability = Math.min(100, ai.stability + 2);
        actions.push(t("ai.action.propaganda", { flag: ai.flag, name: ai.name }));
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
        actions.push(t("ai.action.espionage", { flag: ai.flag, name: ai.name }));
      }
    }

    // Passive force and public support drift
    addForce(state, ai.id, Math.floor(Math.random() * 4) - 1);
    addPublicSupport(state, ai.id, Math.floor(Math.random() * 3) - 1);
  }

  // Random peace deals between AI countries at war
  for (const country of aiCountries) {
    for (const enemyId of [...country.atWarWith]) {
      if (Math.random() < 0.15) {
        country.atWarWith = country.atWarWith.filter((id) => id !== enemyId);
        const enemy = getCountryById(state, enemyId);
        if (enemy) {
          enemy.atWarWith = enemy.atWarWith.filter((id) => id !== country.id);
          adjustRelation(state, country.id, enemyId, 10);
          applyCollapse(state, -1, t("ai.peace_signed", { flag: country.flag, name: country.name, target: enemy.name }));
          actions.push(t("ai.peace_signed", { flag: country.flag, name: country.name, target: enemy.name }));
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
