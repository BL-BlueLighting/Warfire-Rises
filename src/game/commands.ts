import { Command, CommandCategory, GameState, getAttitude } from "../types";
import { getPlayerCountry, getCountryById, applyCollapse, adjustRelation, addPublicSupport } from "./state";
import { startWar, warAttack, warDefend, warRetreat, getWarStatusText } from "./war";
import { COUNTRIES } from "./countries";
import { saveToFile, loadFromFile, deserialize, getSaveOutput } from "./save";
import { t } from "../i18n";

function findAllies(state: GameState, countryId: string): string {
  return state.countries
    .filter((c) => c.allies.includes(countryId))
    .map((c) => `${c.flag} ${c.name}`)
    .join(", ") || t("common.none");
}

function findEnemies(state: GameState, countryId: string): string {
  return state.countries
    .filter((c) => c.enemies.includes(countryId))
    .map((c) => `${c.flag} ${c.name}`)
    .join(", ") || t("common.none");
}

export const COMMANDS: Command[] = [
  // ── GAME ──
  {
    name: "help", aliases: ["h", "?"], category: "game",
    description: "cmd.help.desc", usage: "cmd.help.usage",
    execute: (state, args) => {
      if (args.length > 0) {
        const cmd = COMMANDS.find((c) => c.name === args[0] || c.aliases.includes(args[0]));
        if (!cmd) return { success: false, message: t("cmd.help.unknown", { cmd: args[0] }) };
        return {
          success: true,
          message: `${cmd.name} — ${t(cmd.description)}\n${t("cmd.help.usage")}: ${t(cmd.usage)}\n${t("cmd.help.aliases", { aliases: cmd.aliases.join(", ") })}`,
        };
      }
      // Sub-commands defined per parent command
      const subCmds: Record<string, string[]> = {
        diplomacy: ["improve", "treaty", "sanction", "condemn"],
        military: ["drill", "deploy", "strike", "aid"],
        economy: ["invest", "stimulus", "manipulate", "sanction"],
        war: ["start", "status", "attack", "defend", "retreat"],
        espionage: ["infiltrate", "sabotage", "intel"],
        propaganda: ["domestic", "foreign"],
        nuclear: ["launch"],
        save: ["default"],
        load: ["default"],
      };

      const categories: { cat: CommandCategory; labelKey: string; cmds: Command[] }[] = [
        { cat: "game", labelKey: "help.category.game", cmds: [] },
        { cat: "diplomacy", labelKey: "help.category.diplomacy", cmds: [] },
        { cat: "military", labelKey: "help.category.military", cmds: [] },
        { cat: "economy", labelKey: "help.category.economy", cmds: [] },
        { cat: "war", labelKey: "help.category.war", cmds: [] },
        { cat: "intelligence", labelKey: "help.category.intelligence", cmds: [] },
        { cat: "system", labelKey: "help.category.system", cmds: [] },
      ];
      for (const cmd of COMMANDS) {
        const cat = categories.find((c) => c.cat === cmd.category);
        if (cat) cat.cmds.push(cmd);
      }
      let out = `${t("cmd.help.title")}\n`;
      out += `Type '<command> <subcommand> <target>' to act. Sub-commands listed below each command.\n\n`;
      for (const cat of categories) {
        if (cat.cmds.length === 0) continue;
        out += `${t(cat.labelKey)}\n`;
        for (const cmd of cat.cmds) {
          const subs = subCmds[cmd.name];
          if (subs) {
            out += `  ${cmd.name} — ${t(cmd.description)}\n`;
            for (const sub of subs) {
              const subKey = `help.subcmd.${cmd.name}.${sub}`;
              const desc = t(subKey);
              out += `      ${desc}\n`;
            }
          } else {
            out += `  ${cmd.name.padEnd(14)} — ${t(cmd.description)}\n`;
          }
        }
        out += "\n";
      }
      out += t("cmd.help.detail_hint");
      return { success: true, message: out };
    },
  },
  {
    name: "next", aliases: ["n", "advance", "day"], category: "game",
    description: "cmd.next.desc", usage: "cmd.next.usage",
    execute: () => ({ success: true, message: "__ADVANCE_DAY__" }),
  },
  {
    name: "status", aliases: ["s", "st"], category: "game",
    description: "cmd.status.desc", usage: "cmd.status.usage",
    execute: (state) => {
      const p = getPlayerCountry(state);
      const allies = findAllies(state, state.playerCountryId);
      const enemies = findEnemies(state, state.playerCountryId);
      const nukeText = p.nuclear ? t("sidebar.yes") : t("sidebar.no");
      const forceText = p.forceValue >= 70 ? t("force.extreme") : p.forceValue >= 55 ? t("force.high") : p.forceValue >= 30 ? t("force.medium") : t("force.low");
      return {
        success: true,
        message:
          `=== ${p.flag} ${p.name} — ${t("sidebar.day", { day: state.day })} ===\n` +
          t("cmd.status.government", { gov: t(`gov.${p.government}`), power: t(`power.${p.power}`) }) + "\n" +
          t("cmd.status.economy", { eco: p.economy, mil: p.military, stb: p.stability }) + "\n" +
          t("cmd.status.treasury", { treasury: p.treasury, pop: p.population, nuke: nukeText }) + "\n" +
          t("cmd.status.allies", { allies }) + "\n" +
          t("cmd.status.enemies", { enemies }) + "\n" +
          `---\n` +
          t("cmd.status.points", { dp: state.diplomaticPoints }) + "\n" +
          t("cmd.status.endurance", { ae: state.armyEndurance }) + "\n" +
          t("cmd.status.national", { ne: state.nationalEndurance }) + "\n" +
          t("cmd.status.collapse", { wc: state.worldCollapse }) + "\n" +
          `${t("force.label")}: ${p.forceValue}% — ${forceText}\n` +
          `Public Support: ${p.publicSupport}%\n` +
          (p.atWarWith.length > 0 ? `At War With: ${p.atWarWith.map((id) => COUNTRIES.find((c) => c.id === id)?.name ?? id).join(", ")}\n` : "") +
          `---\n` +
          t("cmd.status.rates_header") + "\n" +
          `  USD/CNY: ${state.exchangeRates.USD_CNY.toFixed(4)}\n` +
          `  USD/HKD: ${state.exchangeRates.USD_HKD.toFixed(4)}\n` +
          `  USD/EUR: ${state.exchangeRates.USD_EUR.toFixed(4)}\n` +
          `  USD/GBP: ${state.exchangeRates.USD_GBP.toFixed(4)}\n` +
          `  USD/JPY: ${state.exchangeRates.USD_JPY.toFixed(2)}\n` +
          `  USD/RUB: ${state.exchangeRates.USD_RUB.toFixed(2)}`,
      };
    },
  },
  // ── DIPLOMACY ──
  {
    name: "diplomacy", aliases: ["dip", "d"], category: "diplomacy",
    description: "cmd.diplomacy.desc", usage: "cmd.diplomacy.usage",
    execute: (state, args) => {
      if (args.length < 2) return { success: false, message: t("cmd.diplomacy.no_args") };
      const [action, targetId] = args;
      const target = getCountryById(state, targetId.toUpperCase());
      if (!target) return { success: false, message: t("cmd.diplomacy.unknown_country", { id: targetId }) };
      if (target.id === state.playerCountryId) return { success: false, message: t("cmd.diplomacy.self") };
      const cost = 10;
      if (state.diplomaticPoints < cost) return { success: false, message: t("cmd.diplomacy.no_points", { cost, have: state.diplomaticPoints }) };
      state.diplomaticPoints -= cost;
      switch (action) {
        case "improve":
          adjustRelation(state, state.playerCountryId, target.id, 15);
          return { success: true, message: t("cmd.diplomacy.improve", { flag: target.flag, name: target.name, cost }) };
        case "treaty":
          adjustRelation(state, state.playerCountryId, target.id, 25);
          return { success: true, message: t("cmd.diplomacy.treaty", { flag: target.flag, name: target.name, cost }) };
        case "sanction":
          adjustRelation(state, state.playerCountryId, target.id, -15);
          target.economy = Math.max(0, target.economy - 3);
          applyCollapse(state, 1, t("collapse.sanctions", { name: target.name }));
          return { success: true, message: t("cmd.diplomacy.sanction", { flag: target.flag, name: target.name, cost }) };
        case "condemn":
          adjustRelation(state, state.playerCountryId, target.id, -10);
          applyCollapse(state, 1, t("collapse.condemnation", { name: target.name }));
          return { success: true, message: t("cmd.diplomacy.condemn", { flag: target.flag, name: target.name, cost }) };
        default:
          state.diplomaticPoints += cost;
          return { success: false, message: t("cmd.diplomacy.unknown_action", { action }) };
      }
    },
  },
  {
    name: "relations", aliases: ["rel", "r"], category: "diplomacy",
    description: "cmd.relations.desc", usage: "cmd.relations.usage",
    execute: (state, args) => {
      if (args.length < 1) return { success: false, message: t("cmd.relations.no_args") };
      const target = getCountryById(state, args[0].toUpperCase());
      if (!target) return { success: false, message: t("cmd.relations.unknown_country", { id: args[0] }) };
      const rel = target.relations[state.playerCountryId] ?? 0;
      const att = getAttitude(rel);
      let statusKey = "cmd.relations.neutral";
      if (rel >= 75) statusKey = "cmd.relations.allied";
      else if (rel >= 40) statusKey = "cmd.relations.friendly";
      else if (rel >= -10) statusKey = "cmd.relations.neutral";
      else if (rel >= -50) statusKey = "cmd.relations.tense";
      else if (rel >= -75) statusKey = "cmd.relations.hostile";
      else statusKey = "cmd.relations.at_war";
      return {
        success: true,
        message:
          t("cmd.relations.header", { flag: target.flag, name: target.name }) + "\n" +
          t("cmd.relations.status", { status: t(statusKey).toUpperCase(), rel }) + "\n" +
          `Attitude: ${t(`att.${att}`).toUpperCase()}\n` +
          t("cmd.relations.shared_allies", {
            allies: target.allies.filter((a) => getPlayerCountry(state).allies.includes(a)).map((a) => COUNTRIES.find((c) => c.id === a)?.name ?? a).join(", ") || t("common.none"),
          }) + "\n" +
          t("cmd.relations.their_relations") + "\n" +
          Object.entries(target.relations).filter(([id]) => id !== state.playerCountryId).sort(([, a], [, b]) => b - a).slice(0, 5).map(([id, r]) => `  ${COUNTRIES.find((c) => c.id === id)?.name ?? id}: ${r}`).join("\n"),
      };
    },
  },
  // ── MILITARY ──
  {
    name: "military", aliases: ["mil", "m"], category: "military",
    description: "cmd.military.desc", usage: "cmd.military.usage",
    execute: (state, args) => {
      if (args.length < 2) return { success: false, message: t("cmd.military.no_args") };
      const [action, targetId] = args;
      const target = getCountryById(state, targetId.toUpperCase());
      if (!target) return { success: false, message: t("cmd.military.unknown_country", { id: targetId }) };
      if (target.id === state.playerCountryId) return { success: false, message: t("cmd.military.self") };
      const cost = 15;
      if (state.armyEndurance < cost) return { success: false, message: t("cmd.military.no_endurance", { cost, have: state.armyEndurance }) };
      state.armyEndurance -= cost;
      switch (action) {
        case "drill": {
          const p = getPlayerCountry(state);
          p.military = Math.min(100, p.military + 2);
          p.forceValue = Math.min(100, p.forceValue + 3);
          return { success: true, message: t("cmd.military.drill", { flag: target.flag, name: target.name, cost }) };
        }
        case "deploy":
          adjustRelation(state, state.playerCountryId, target.id, -8);
          applyCollapse(state, 2, t("collapse.forces_deployed", { name: target.name }));
          addPublicSupport(state, state.playerCountryId, 3);
          return { success: true, message: t("cmd.military.deploy", { flag: target.flag, name: target.name, cost }) };
        case "strike": {
          adjustRelation(state, state.playerCountryId, target.id, -25);
          target.military = Math.max(0, target.military - 10);
          target.stability = Math.max(0, target.stability - 10);
          applyCollapse(state, 5, t("collapse.military_strike", { name: target.name }));
          return { success: true, message: t("cmd.military.strike", { flag: target.flag, name: target.name, cost }) };
        }
        case "aid":
          adjustRelation(state, state.playerCountryId, target.id, 10);
          target.military = Math.min(100, target.military + 5);
          return { success: true, message: t("cmd.military.aid", { flag: target.flag, name: target.name, cost }) };
        default:
          state.armyEndurance += cost;
          return { success: false, message: t("cmd.military.unknown_action", { action }) };
      }
    },
  },
  {
    name: "propaganda", aliases: ["prop", "media"], category: "military",
    description: "cmd.propaganda.desc", usage: "cmd.propaganda.usage",
    execute: (state, args) => {
      if (args.length < 1) return { success: false, message: t("cmd.propaganda.no_args") };
      const p = getPlayerCountry(state);
      if (state.diplomaticPoints < 8) return { success: false, message: t("cmd.propaganda.no_points", { need: 8, have: state.diplomaticPoints }) };
      state.diplomaticPoints -= 8;
      if (args[0] === "domestic") {
        p.stability = Math.min(100, p.stability + 5);
        state.nationalEndurance = Math.min(100, state.nationalEndurance + 3);
        addPublicSupport(state, state.playerCountryId, 8);
        return { success: true, message: t("cmd.propaganda.domestic") };
      } else if (args[0] === "foreign") {
        state.countries.forEach((c) => {
          if (c.id !== state.playerCountryId) {
            if (!(state.playerCountryId in c.relations)) c.relations[state.playerCountryId] = 0;
            c.relations[state.playerCountryId] = Math.min(100, c.relations[state.playerCountryId] + 5);
          }
        });
        return { success: true, message: t("cmd.propaganda.foreign") };
      }
      state.diplomaticPoints += 8;
      return { success: false, message: t("cmd.propaganda.unknown_target") };
    },
  },
  // ── ECONOMY ──
  {
    name: "economy", aliases: ["eco", "e"], category: "economy",
    description: "cmd.economy.desc", usage: "cmd.economy.usage",
    execute: (state, args) => {
      if (args.length < 1) return { success: false, message: t("cmd.economy.no_args") };
      const action = args[0];
      const p = getPlayerCountry(state);
      switch (action) {
        case "invest":
          if (p.treasury < 500) return { success: false, message: t("cmd.economy.no_funds", { need: 500, have: p.treasury }) };
          p.treasury -= 500;
          p.economy = Math.min(100, p.economy + 3);
          state.nationalEndurance = Math.min(100, state.nationalEndurance + 2);
          return { success: true, message: t("cmd.economy.invest", { amount: 500, boost: 3, ne: 2 }) };
        case "stimulus":
          if (p.treasury < 1000) return { success: false, message: t("cmd.economy.no_funds", { need: 1000, have: p.treasury }) };
          p.treasury -= 1000;
          p.economy = Math.min(100, p.economy + 5);
          p.stability = Math.min(100, p.stability + 5);
          applyCollapse(state, -1, t("collapse.markets_calm"));
          return { success: true, message: t("cmd.economy.stimulus", { amount: 1, boost: 5, stb: 5 }) };
        case "manipulate":
          applyCollapse(state, 3, t("collapse.currency_manipulation"));
          state.exchangeRates.USD_CNY *= 1.05;
          state.exchangeRates.USD_EUR *= 0.95;
          return { success: true, message: t("cmd.economy.manipulate") };
        case "sanction": {
          const targets = state.countries.filter((c) => c.id !== state.playerCountryId && (c.relations[state.playerCountryId] ?? 0) < -20);
          if (targets.length === 0) return { success: false, message: t("cmd.economy.no_targets") };
          const target = targets[Math.floor(Math.random() * targets.length)];
          target.economy = Math.max(0, target.economy - 5);
          adjustRelation(state, state.playerCountryId, target.id, -10);
          applyCollapse(state, 1, t("collapse.economic_sanctions", { name: target.name }));
          return { success: true, message: t("cmd.economy.sanction", { flag: target.flag, name: target.name }) };
        }
        default:
          return { success: false, message: t("cmd.economy.unknown_action", { action }) };
      }
    },
  },
  // ── NUCLEAR ──
  {
    name: "nuclear", aliases: ["nuke"], category: "military",
    description: "cmd.nuclear.desc", usage: "cmd.nuclear.usage",
    execute: (state, args) => {
      if (args.length < 1) return { success: false, message: t("cmd.nuclear.no_args") };
      const targetId = args[0].toUpperCase();
      const target = getCountryById(state, targetId);
      if (!target) return { success: false, message: t("cmd.nuclear.unknown_country", { id: targetId }) };
      if (target.id === state.playerCountryId) return { success: false, message: t("cmd.nuclear.self") };
      const p = getPlayerCountry(state);
      if (!p.nuclear) return { success: false, message: t("cmd.nuclear.no_nukes") };
      // Force requirement: public support > 70% and enemy attitude must be irreconcilable
      if (p.publicSupport < 70) return { success: false, message: `Public support too low (${p.publicSupport}%, need >70%). The people are not ready for nuclear war.` };
      const att = getAttitude(target.relations[state.playerCountryId] ?? 0);
      if (att !== "irreconcilable") return { success: false, message: `Attitude toward ${target.name} must be "Irreconcilable" (current: ${att}). Nuclear weapons require absolute enmity.` };
      if (p.forceValue < 55) return { success: false, message: `Coercion readiness too low (${p.forceValue}%, need >55%). Build domestic pressure first.` };

      target.military = 0;
      target.economy = 0;
      target.stability = 0;
      target.population = Math.floor(target.population * 0.3);
      adjustRelation(state, state.playerCountryId, target.id, -100);
      state.armyEndurance = Math.max(0, state.armyEndurance - 40);
      state.nationalEndurance = Math.max(0, state.nationalEndurance - 30);
      p.publicSupport = Math.max(0, p.publicSupport - 25);
      applyCollapse(state, 30, t("collapse.nuclear_strike", { name: target.name }));
      return {
        success: true,
        message:
          `${t("cmd.nuclear.detected")}\n` +
          t("cmd.nuclear.result", { flag: target.flag, name: target.name }) + "\n" +
          t("cmd.nuclear.survivors", { pop: target.population }) + "\n" +
          t("cmd.nuclear.wc_warning"),
      };
    },
  },
  // ── WAR ──
  {
    name: "war", aliases: ["w"], category: "war",
    description: "war.start.desc", usage: "war <start|status|attack|defend|retreat> [country_id]",
    execute: (state, args) => {
      if (args.length < 1) {
        return { success: false, message: "Usage: war <start|status|attack|defend|retreat> [country_id]" };
      }
      const sub = args[0];
      switch (sub) {
        case "start": {
          if (args.length < 2) return { success: false, message: t("war.start.no_args") };
          return { success: true, message: startWar(state, args[1].toUpperCase()) };
        }
        case "status":
          return { success: true, message: getWarStatusText(state) };
        case "attack":
          return { success: true, message: warAttack(state) };
        case "defend":
          return { success: true, message: warDefend(state) };
        case "retreat":
          return { success: true, message: warRetreat(state) };
        default:
          return { success: false, message: `Unknown war command: ${sub}. Try: start, status, attack, defend, retreat` };
      }
    },
  },
  // ── INTELLIGENCE ──
  {
    name: "espionage", aliases: ["spy", "intel"], category: "intelligence",
    description: "cmd.espionage.desc", usage: "cmd.espionage.usage",
    execute: (state, args) => {
      if (args.length < 2) return { success: false, message: t("cmd.espionage.no_args") };
      const [action, targetId] = args;
      const target = getCountryById(state, targetId.toUpperCase());
      if (!target) return { success: false, message: t("cmd.espionage.unknown_country", { id: targetId }) };
      if (target.id === state.playerCountryId) return { success: false, message: t("cmd.espionage.self") };
      const cost = 12;
      if (state.diplomaticPoints < cost) return { success: false, message: t("cmd.espionage.no_points", { cost, have: state.diplomaticPoints }) };
      state.diplomaticPoints -= cost;
      switch (action) {
        case "infiltrate": {
          const success = Math.random() > 0.3;
          if (success) {
            adjustRelation(state, state.playerCountryId, target.id, -5);
            return { success: true, message: t("cmd.espionage.infiltrate_success", { flag: target.flag, name: target.name }) };
          }
          adjustRelation(state, state.playerCountryId, target.id, -15);
          applyCollapse(state, 2, t("collapse.espionage_scandal", { name: target.name }));
          return { success: true, message: t("cmd.espionage.infiltrate_fail", { flag: target.flag, name: target.name }) };
        }
        case "sabotage":
          target.military = Math.max(0, target.military - 8);
          target.economy = Math.max(0, target.economy - 3);
          adjustRelation(state, state.playerCountryId, target.id, -8);
          applyCollapse(state, 2, t("collapse.covert_sabotage", { name: target.name }));
          return { success: true, message: t("cmd.espionage.sabotage", { flag: target.flag, name: target.name }) };
        case "intel": {
          const nukeText = target.nuclear ? t("sidebar.yes") : t("sidebar.no");
          const att = getAttitude(target.relations[state.playerCountryId] ?? 0);
          return {
            success: true,
            message:
              t("cmd.espionage.intel_header", { flag: target.flag, name: target.name }) + "\n" +
              t("cmd.espionage.intel_gov", { gov: t(`gov.${target.government}`), power: t(`power.${target.power}`) }) + "\n" +
              t("cmd.espionage.intel_stats", { eco: target.economy, mil: target.military, stb: target.stability }) + "\n" +
              t("cmd.espionage.intel_treasury", { treasury: target.treasury, nuke: nukeText }) + "\n" +
              `Attitude: ${t(`att.${att}`)} | Public Support: ${target.publicSupport}% | Force: ${target.forceValue}%\n` +
              t("cmd.espionage.intel_allies", { allies: target.allies.map((a) => COUNTRIES.find((c) => c.id === a)?.name ?? a).join(", ") || t("common.none") }) + "\n" +
              t("cmd.espionage.intel_enemies", { enemies: target.enemies.map((e) => COUNTRIES.find((c) => c.id === e)?.name ?? e).join(", ") || t("common.none") }),
          };
        }
        default:
          state.diplomaticPoints += cost;
          return { success: false, message: t("cmd.espionage.unknown_action", { action }) };
      }
    },
  },
  {
    name: "world", aliases: ["map"], category: "intelligence",
    description: "cmd.world.desc", usage: "cmd.world.usage",
    execute: (state) => {
      const lines = state.countries.map((c) => {
        const rel = c.id === state.playerCountryId ? t("common.you") : `${c.relations[state.playerCountryId] ?? 0}`;
        const att = c.id === state.playerCountryId ? "" : ` [${t(`att.${getAttitude(c.relations[state.playerCountryId] ?? 0)}_short`)}]`;
        const warMark = c.atWarWith.length > 0 ? " ⚔" : "";
        const marker = c.id === state.playerCountryId ? "▶" : " ";
        return `${marker} ${c.flag} ${c.name.padEnd(18)} | Eco:${String(c.economy).padStart(3)} Mil:${String(c.military).padStart(3)} Stb:${String(c.stability).padStart(3)} | Rel: ${rel}${att}${warMark}`;
      });
      return {
        success: true,
        message:
          t("cmd.world.header", { day: state.day }) + "\n" +
          t("cmd.world.collapse_line", { wc: state.worldCollapse }) + "\n\n" +
          lines.join("\n") +
          `\n\n${t("cmd.world.alliances_header")}\n` +
          state.countries.filter((c) => c.allies.length > 0 || c.enemies.length > 0).map((c) => {
            const parts: string[] = [];
            if (c.allies.length > 0) parts.push(`${t("sidebar.allies")} ${c.allies.join(", ")}`);
            if (c.enemies.length > 0) parts.push(`${t("sidebar.enemies")} ${c.enemies.join(", ")}`);
            if (c.atWarWith.length > 0) parts.push(`⚔ At War: ${c.atWarWith.join(", ")}`);
            return `  ${c.flag} ${c.name}: ${parts.join(" | ")}`;
          }).join("\n"),
      };
    },
  },
  // ── SAVE/LOAD ──
  {
    name: "save", aliases: [], category: "system",
    description: "cmd.save.desc", usage: "cmd.save.usage",
    execute: (state) => {
      const output = getSaveOutput(state);
      return { success: true, message: output };
    },
  },
  {
    name: "load", aliases: [], category: "system",
    description: "cmd.load.desc", usage: "cmd.load.usage",
    execute: (state) => {
      const encoded = loadFromFile(state);
      if (!encoded) return { success: false, message: "No save file found. Use 'save' first." };
      const ok = deserialize(state, encoded);
      if (!ok) return { success: false, message: "Failed to parse save file. Data may be corrupted." };
      state.briefing = [`Game loaded — Day ${state.day}. World Collapse: ${state.worldCollapse}%`];
      return { success: true, message: "__LOADED__" };
    },
  },
  // ── SYSTEM ──
  {
    name: "language", aliases: ["lang"], category: "system",
    description: "cmd.language.desc", usage: "cmd.language.usage",
    execute: () => ({ success: true, message: "Use: language <en-us|zh-cn>" }),
  },
  {
    name: "clear", aliases: ["cls"], category: "system",
    description: "cmd.clear.desc", usage: "cmd.clear.usage",
    execute: () => ({ success: true, message: "__CLEAR__" }),
  },
  {
    name: "quit", aliases: ["q", "exit"], category: "system",
    description: "cmd.quit.desc", usage: "cmd.quit.usage",
    execute: () => ({ success: true, message: "__QUIT__" }),
  },
];

export function processCommand(state: GameState, input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/\s+/);
  const cmdName = parts[0].toLowerCase();
  const args = parts.slice(1);

  const cmd = COMMANDS.find((c) => c.name === cmdName || c.aliases.includes(cmdName));
  if (!cmd) {
    return t("cmd.help.unknown", { cmd: cmdName }) + "\n" + t("app.type_help");
  }
  try {
    const result = cmd.execute(state, args);
    return result.message;
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
