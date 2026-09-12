import { Command, CommandCategory, CommandResult, GameState, getAttitude } from "./types";
import { getPlayerCountry, getCountryById, setSpeed, MAX_SPEED } from "./state";
import { startWar, getWarStatusText, warRetreat, setStance } from "./war";
import { startAction, actionsOfKind } from "./actions";
import { COUNTRIES } from "./countries";
import { getSaveOutput } from "./save";
import { countryShortName } from "./names";
import { t } from "../i18n";

/**
 * The console command layer.
 *
 * Commands no longer apply their effects directly — anything that represents
 * real work now *starts a timed task* through `startAction`, exactly like the
 * panel buttons do. Only instantaneous decisions (declaring war, surrendering,
 * changing the clock) still resolve inline.
 */

function findAllies(state: GameState, countryId: string): string {
  return (
    state.countries
      .filter((c) => c.allies.includes(countryId))
      .map((c) => countryShortName(c))
      .join(", ") || t("common.none")
  );
}

function findEnemies(state: GameState, countryId: string): string {
  return (
    state.countries
      .filter((c) => c.enemies.includes(countryId))
      .map((c) => countryShortName(c))
      .join(", ") || t("common.none")
  );
}

const HELP_META: Record<string, { subKeys?: string[] }> = {
  diplomacy: { subKeys: ["improve", "treaty", "sanction", "condemn"] },
  military: { subKeys: ["drill", "deploy", "strike", "aid"] },
  economy: { subKeys: ["invest", "stimulus", "manipulate", "sanction"] },
  war: { subKeys: ["start", "status", "attack", "defend", "retreat"] },
  espionage: { subKeys: ["infiltrate", "sabotage", "intel"] },
  propaganda: { subKeys: ["domestic", "foreign"] },
  nuclear: { subKeys: ["launch"] },
  save: { subKeys: ["default"] },
  load: { subKeys: ["default"] },
};

function buildDetailedHelp(cmd: Command): string {
  const meta = HELP_META[cmd.name];
  const divider = "─".repeat(48);
  let out = `\n${divider}\n  ${cmd.name.toUpperCase()} — ${t(cmd.description)}\n${divider}\n\n`;
  out += `USAGE\n  ${t(cmd.usage)}\n\n`;

  const argsKey = `help.detail.${cmd.name}.args`;
  const argsText = t(argsKey);
  if (argsText !== argsKey) out += `ARGUMENTS\n${argsText}\n\n`;

  if (meta?.subKeys) {
    out += `SUBCOMMANDS\n`;
    for (const sub of meta.subKeys) out += `  ${t(`help.subcmd.${cmd.name}.${sub}`)}\n`;
    out += "\n";
  }

  out += `EXAMPLES\n${t(`help.detail.${cmd.name}.examples`)}\n\n`;
  const notesKey = `help.detail.${cmd.name}.notes`;
  const notesText = t(notesKey);
  if (notesText !== notesKey) out += `NOTES\n${notesText}\n\n`;
  if (cmd.aliases.length > 0) out += `ALIASES\n  ${cmd.aliases.join(", ")}\n\n`;
  return out + divider;
}

/**
 * Shared shape for the "start a timed action" commands: look up the target,
 * reject self-targeting, then hand off to the action registry.
 */
function actionCommand(
  state: GameState,
  actionId: string,
  targetArg: string | undefined,
  opts: { needsTarget?: boolean; errKey: string } = { errKey: "cmd.diplomacy.unknown_country" }
): CommandResult {
  const playerId = state.playerCountryId;
  let targetId: string | undefined;

  if (opts.needsTarget) {
    if (!targetArg) return { success: false, message: t("war.start.no_args") };
    const target = getCountryById(state, targetArg.toUpperCase());
    if (!target) return { success: false, message: t(opts.errKey, { id: targetArg }) };
    if (target.id === playerId) return { success: false, message: t("cmd.diplomacy.self") };
    targetId = target.id;
  }

  const res = startAction(state, actionId, playerId, targetId);
  return { success: res.ok, message: res.message ?? "" };
}

export const COMMANDS: Command[] = [
  // ── GAME ──
  {
    name: "help", aliases: ["h", "?"], category: "game",
    description: "cmd.help.desc", usage: "cmd.help.usage",
    execute: (_state, args) => {
      if (args.length > 0) {
        const cmd = COMMANDS.find((c) => c.name === args[0] || c.aliases.includes(args[0]));
        if (!cmd) return { success: false, message: t("cmd.help.unknown", { cmd: args[0] }) };
        return { success: true, message: buildDetailedHelp(cmd) };
      }
      const cats: { cat: CommandCategory; labelKey: string; cmds: Command[] }[] = [
        { cat: "game", labelKey: "help.category.game", cmds: [] },
        { cat: "diplomacy", labelKey: "help.category.diplomacy", cmds: [] },
        { cat: "military", labelKey: "help.category.military", cmds: [] },
        { cat: "economy", labelKey: "help.category.economy", cmds: [] },
        { cat: "war", labelKey: "help.category.war", cmds: [] },
        { cat: "intelligence", labelKey: "help.category.intelligence", cmds: [] },
        { cat: "system", labelKey: "help.category.system", cmds: [] },
      ];
      for (const cmd of COMMANDS) {
        cats.find((c) => c.cat === cmd.category)?.cmds.push(cmd);
      }
      const maxLen = Math.max(...COMMANDS.map((c) => c.name.length));
      let out = `${t("cmd.help.title")}\n\n`;
      for (const cat of cats) {
        if (cat.cmds.length === 0) continue;
        out += `${t(cat.labelKey)}\n`;
        for (const cmd of cat.cmds) out += `  ${cmd.name.padEnd(maxLen + 2)} ${t(cmd.description)}\n`;
        out += "\n";
      }
      return { success: true, message: out + t("cmd.help.detail_hint") };
    },
  },
  {
    name: "speed", aliases: ["sp"], category: "game",
    description: "cmd.speed.desc", usage: "cmd.speed.usage",
    execute: (state, args) => {
      if (args.length < 1) {
        return { success: true, message: t("cmd.speed.current", { n: state.clock.speed }) };
      }
      const n = Number(args[0]);
      if (!Number.isFinite(n) || n < 0 || n > MAX_SPEED) {
        return { success: false, message: t("cmd.speed.bad", { max: MAX_SPEED }) };
      }
      setSpeed(state, n);
      return {
        success: true,
        message: n === 0 ? t("cmd.speed.paused") : t("cmd.speed.set", { n }),
      };
    },
  },
  {
    name: "status", aliases: ["s", "st"], category: "game",
    description: "cmd.status.desc", usage: "cmd.status.usage",
    execute: (state) => {
      const p = getPlayerCountry(state);
      const nukeText = p.nuclear ? t("sidebar.yes") : t("sidebar.no");
      const forceText =
        p.forceValue >= 70 ? t("force.extreme")
        : p.forceValue >= 55 ? t("force.high")
        : p.forceValue >= 30 ? t("force.medium")
        : t("force.low");
      return {
        success: true,
        message:
          `=== ${p.flag} ${countryShortName(p)} — ${t("sidebar.day", { day: state.day })} ===\n` +
          t("cmd.status.government", { gov: t(`gov.${p.government}`), power: t(`power.${p.power}`) }) + "\n" +
          t("cmd.status.economy", { eco: p.economy, mil: p.military, stb: p.stability }) + "\n" +
          t("cmd.status.treasury", { treasury: p.treasury, pop: p.population, nuke: nukeText }) + "\n" +
          t("cmd.status.allies", { allies: findAllies(state, state.playerCountryId) }) + "\n" +
          t("cmd.status.enemies", { enemies: findEnemies(state, state.playerCountryId) }) + "\n" +
          `---\n` +
          t("cmd.status.points", { dp: state.diplomaticPoints }) + "\n" +
          t("cmd.status.endurance", { ae: state.armyEndurance }) + "\n" +
          t("cmd.status.national", { ne: state.nationalEndurance }) + "\n" +
          t("cmd.status.collapse", { wc: state.worldCollapse }) + "\n" +
          `${t("force.label")}: ${p.forceValue}% — ${forceText}\n` +
          `${t("ui.nation.public_support")}: ${p.publicSupport}%\n` +
          `${t("ui.army.manpower")}: ${p.manpower}K | ${t("ui.army.divisions")}: ${p.divisions.length}\n` +
          `${t("ui.nuke.label")}: ${p.nukes}\n` +
          (p.atWarWith.length > 0
            ? `${t("ui.nation.at_war")}: ${p.atWarWith.map((id) => countryShortName(getCountryById(state, id))).join(", ")}\n`
            : "") +
          `---\n${t("cmd.status.rates_header")}\n` +
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
      const [action, targetArg] = args;
      const map: Record<string, string> = {
        improve: "dip.improve", treaty: "dip.treaty", sanction: "dip.sanction",
        condemn: "dip.condemn", justify: "dip.justify",
      };
      const id = map[action];
      if (!id) return { success: false, message: t("cmd.diplomacy.unknown_action", { action }) };
      return actionCommand(state, id, targetArg, {
        needsTarget: true, errKey: "cmd.diplomacy.unknown_country",
      });
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
          t("cmd.relations.header", { flag: target.flag, name: countryShortName(target) }) + "\n" +
          t("cmd.relations.status", { status: t(statusKey).toUpperCase(), rel }) + "\n" +
          `Attitude: ${t(`att.${att}`).toUpperCase()}\n` +
          t("cmd.relations.shared_allies", {
            allies:
              target.allies
                .filter((a) => getPlayerCountry(state).allies.includes(a))
                .map((a) => countryShortName(getCountryById(state, a)))
                .join(", ") || t("common.none"),
          }) + "\n" +
          t("cmd.relations.their_relations") + "\n" +
          Object.entries(target.relations)
            .filter(([id]) => id !== state.playerCountryId)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([id, r]) => `  ${countryShortName(getCountryById(state, id))}: ${r}`)
            .join("\n"),
      };
    },
  },

  // ── MILITARY ──
  {
    name: "military", aliases: ["mil", "m"], category: "military",
    description: "cmd.military.desc", usage: "cmd.military.usage",
    execute: (state, args) => {
      if (args.length < 2) return { success: false, message: t("cmd.military.no_args") };
      const [action, targetArg] = args;
      const map: Record<string, string> = {
        drill: "mil.drill", deploy: "mil.deploy", strike: "mil.strike", aid: "mil.aid",
      };
      const id = map[action];
      if (!id) return { success: false, message: t("cmd.military.unknown_action", { action }) };
      return actionCommand(state, id, targetArg, {
        needsTarget: true, errKey: "cmd.military.unknown_country",
      });
    },
  },
  {
    name: "propaganda", aliases: ["prop", "media"], category: "military",
    description: "cmd.propaganda.desc", usage: "cmd.propaganda.usage",
    execute: (state, args) => {
      if (args.length < 1) return { success: false, message: t("cmd.propaganda.no_args") };
      const id = args[0] === "domestic" ? "prop.domestic" : args[0] === "foreign" ? "prop.foreign" : null;
      if (!id) return { success: false, message: t("cmd.propaganda.unknown_target") };
      const res = startAction(state, id, state.playerCountryId);
      return { success: res.ok, message: res.message ?? "" };
    },
  },

  // ── ECONOMY ──
  {
    name: "economy", aliases: ["eco", "e"], category: "economy",
    description: "cmd.economy.desc", usage: "cmd.economy.usage",
    execute: (state, args) => {
      if (args.length < 1) return { success: false, message: t("cmd.economy.no_args") };
      const map: Record<string, string> = {
        invest: "eco.invest", stimulus: "eco.stimulus",
        manipulate: "eco.manipulate", sanction: "eco.sanction",
      };
      const id = map[args[0]];
      if (!id) return { success: false, message: t("cmd.economy.unknown_action", { action: args[0] }) };
      const res = startAction(state, id, state.playerCountryId);
      return { success: res.ok, message: res.message ?? "" };
    },
  },

  // ── NUCLEAR ──
  {
    name: "nuclear", aliases: ["nuke"], category: "military",
    description: "cmd.nuclear.desc", usage: "cmd.nuclear.usage",
    execute: (state, args) =>
      actionCommand(state, "mil.nuclear", args[0], {
        needsTarget: true, errKey: "cmd.nuclear.unknown_country",
      }),
  },

  // ── WAR ──
  {
    name: "war", aliases: ["w"], category: "war",
    description: "war.start.desc", usage: "war <start|status|attack|defend|retreat> [country_id]",
    execute: (state, args) => {
      if (args.length < 1) return { success: false, message: getWarStatusText(state) };
      switch (args[0]) {
        case "start": {
          if (args.length < 2) return { success: false, message: t("war.start.no_args") };
          const msg = startWar(state, args[1].toUpperCase());
          const failed = msg === t("war.start.self") || msg.startsWith("Usage");
          return { success: !failed, message: msg };
        }
        case "status":
          return { success: true, message: getWarStatusText(state) };
        case "attack":
          return { success: true, message: setStance(state, "assault") };
        case "defend":
          return { success: true, message: setStance(state, "hold") };
        case "retreat":
          return { success: !!state.activeWar?.active, message: warRetreat(state) };
        default:
          return { success: false, message: `Unknown war command: ${args[0]}` };
      }
    },
  },

  // ── INTELLIGENCE ──
  {
    name: "espionage", aliases: ["spy", "intel"], category: "intelligence",
    description: "cmd.espionage.desc", usage: "cmd.espionage.usage",
    execute: (state, args) => {
      if (args.length < 2) return { success: false, message: t("cmd.espionage.no_args") };
      const [action, targetArg] = args;
      const map: Record<string, string> = {
        infiltrate: "spy.infiltrate", sabotage: "spy.sabotage", intel: "spy.intel",
      };
      const id = map[action];
      if (!id) return { success: false, message: t("cmd.espionage.unknown_action", { action }) };
      return actionCommand(state, id, targetArg, {
        needsTarget: true, errKey: "cmd.espionage.unknown_country",
      });
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
          state.countries
            .filter((c) => c.allies.length > 0 || c.enemies.length > 0)
            .map((c) => {
              const parts: string[] = [];
              const nameList = (ids: string[]) =>
                ids.map((id) => countryShortName(getCountryById(state, id)) || id).join(", ");
              if (c.allies.length > 0) parts.push(`${t("sidebar.allies")} ${nameList(c.allies)}`);
              if (c.enemies.length > 0) parts.push(`${t("sidebar.enemies")} ${nameList(c.enemies)}`);
              if (c.atWarWith.length > 0) parts.push(`⚔ ${nameList(c.atWarWith)}`);
              return `  ${c.flag} ${c.name}: ${parts.join(" | ")}`;
            })
            .join("\n"),
      };
    },
  },

  // ── SAVE / LOAD / SYSTEM ──
  {
    name: "save", aliases: [], category: "system",
    description: "cmd.save.desc", usage: "cmd.save.usage",
    execute: (state) => ({ success: true, message: getSaveOutput(state) }),
  },
  {
    name: "load", aliases: [], category: "system",
    description: "cmd.load.desc", usage: "cmd.load.usage",
    execute: () => ({ success: true, message: "__LOAD__" }),
  },
  {
    name: "language", aliases: ["lang"], category: "system",
    description: "cmd.language.desc", usage: "cmd.language.usage",
    execute: () => ({ success: true, message: "__LANGUAGE__" }),
  },
  {
    name: "debug", aliases: [], category: "system",
    description: "cmd.debug.desc", usage: "cmd.debug.usage",
    execute: (_state, args) => {
      const sub = (args[0] ?? "").toLowerCase();
      switch (sub) {
        case "":
          return { success: true, message: "__DEBUG__" };
        case "disable_prepare_wait":
          return { success: true, message: "__DEBUG_NOWAIT__" };
        case "enable_prepare_wait":
          return { success: true, message: "__DEBUG_WAIT__" };
        default:
          return { success: false, message: t("cmd.debug.unknown", { sub }) };
      }
    },
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

/** Every action id as a console-friendly listing (used by `help actions`). */
export function actionIds(): string[] {
  return (["diplomacy", "military", "economy", "espionage", "propaganda", "war"] as const)
    .flatMap((kind) => actionsOfKind(kind).map((a) => a.id));
}

export function executeCommand(state: GameState, input: string): CommandResult | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/);
  const cmdName = parts[0].toLowerCase();
  const args = parts.slice(1);

  const cmd = COMMANDS.find((c) => c.name === cmdName || c.aliases.includes(cmdName));
  if (!cmd) {
    return { success: false, message: t("cmd.help.unknown", { cmd: cmdName }) + "\n" + t("app.type_help") };
  }
  try {
    return cmd.execute(state, args);
  } catch (err) {
    return { success: false, message: `Error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export function processCommand(state: GameState, input: string): string {
  const result = executeCommand(state, input);
  return result ? result.message : "";
}

export { COUNTRIES };
