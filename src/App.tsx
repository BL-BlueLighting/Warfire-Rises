import React, { useState, useRef } from "react";
import { Box, Text, useInput, useApp, useStdout } from "ink";
import { GameState } from "./types";
import { createInitialState, regeneratePoints, getPlayerCountry } from "./game/state";
import { processDayEvents } from "./game/events";
import { processCommand } from "./game/commands";
import { runAI } from "./game/ai";
import { getWarStatusText } from "./game/war";
import { fetchExchangeRates, fetchWorldKeywords, getTodayDate } from "./game/worldData";
import { I18nContext, Language, t, setLanguage, getLanguage } from "./i18n";
import Title from "./components/Title";
import Sidebar from "./components/Sidebar";
import CommandInput from "./components/CommandInput";
import StatusBar from "./components/StatusBar";
import GameOver from "./components/GameOver";

const App: React.FC = () => {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const stateRef = useRef<GameState | null>(null);
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);

  const [lang, setLangState] = useState<Language>(() => getLanguage());
  const setLang = (newLang: Language) => {
    setLanguage(newLang);
    setLangState(newLang);
    rerender();
  };
  const i18nValue = { lang, setLang, t };

  const [output, setOutput] = useState<string[]>([t("app.welcome")]);
  const [phase, setPhase] = useState<"title" | "loading" | "playing" | "gameover">("title");
  const [warView, setWarView] = useState(false);

  const addOutput = (msg: string) => {
    setOutput((prev) => [...prev.slice(-200), ...msg.split("\n")]);
  };

  useInput((input, key) => {
    if (key.ctrl && input === "c") exit();
  });

  const handleStart = async (countryId: string) => {
    setPhase("loading");
    const [rates, keywords] = await Promise.all([fetchExchangeRates(), fetchWorldKeywords()]);
    const state = createInitialState(keywords, rates);
    state.playerCountryId = countryId;
    processDayEvents(state);
    stateRef.current = state;
    setPhase("playing");
    const c = state.countries.find((c) => c.id === countryId)!;
    setOutput([
      t("app.game_header"),
      `${t("app.date_label")} ${getTodayDate()}`,
      `${t("app.you_control")} ${c.flag} ${c.name}`,
      "",
      ...state.briefing.map((b) => `📰 ${b}`),
      "",
      t("app.type_help"),
    ]);
  };

  const handleCommand = (input: string) => {
    if (!stateRef.current) return;
    const state = stateRef.current;

    if (state.phase === "gameover") {
      if (input === "quit" || input === "exit" || input === "q") exit();
      addOutput(t("app.gameover_already"));
      return;
    }

    // Toggle war view
    if (input === "war" || input === "war status") {
      addOutput(`▶ ${input}`);
      const text = getWarStatusText(state);
      addOutput(text);
      if (state.activeWar?.active) setWarView(true);
      rerender();
      return;
    }

    // Language switching
    const langParts = input.split(/\s+/);
    if (langParts[0] === "language" || langParts[0] === "lang") {
      if (langParts.length >= 2) {
        const newLang = langParts[1].toLowerCase();
        if (newLang === "en-us" || newLang === "zh-cn") {
          setLang(newLang as Language);
          addOutput(t("cmd.language.switched", { lang: newLang }));
          rerender();
          return;
        }
      }
      addOutput(t("cmd.language.invalid"));
      return;
    }

    addOutput(`▶ ${input}`);
    const result = processCommand(state, input);

    if (result === "__ADVANCE_DAY__") {
      state.day++;
      regeneratePoints(state);

      // Run AI for all other countries
      const aiActions = runAI(state);
      for (const action of aiActions.slice(0, 8)) {
        addOutput(`BOT ${action}`);
      }

      // Process player's active war battles
      if (state.activeWar?.active) {
        const pCountry = getPlayerCountry(state);
        // Passive war attrition
        state.activeWar.attackerMorale = Math.max(0, state.activeWar.attackerMorale + (Math.random() > 0.5 ? 3 : -5));
        state.activeWar.defenderMorale = Math.max(0, state.activeWar.defenderMorale + (Math.random() > 0.5 ? 3 : -5));
        pCountry.forceValue = Math.min(100, pCountry.forceValue + 5);
      }

      processDayEvents(state);

      addOutput(t("app.day_header", { day: state.day }));
      for (const b of state.briefing) {
        addOutput(`📰 ${b}`);
      }
      addOutput(t("app.wc_status", {
        wc: state.worldCollapse, dp: state.diplomaticPoints,
        ae: state.armyEndurance, ne: state.nationalEndurance,
      }));

      // War status summary if active
      if (state.activeWar?.active) {
        addOutput(`⚔ War Ongoing | Phase: ${state.activeWar.phase} | Morale: ATK ${state.activeWar.attackerMorale}% DEF ${state.activeWar.defenderMorale}%`);
        setWarView(true);
      }

      if ((state as GameState).phase === "gameover") {
        setPhase("gameover");
        addOutput(state.gameOverMessage);
      }
      rerender();
      return;
    }

    if (result === "__CLEAR__") { setOutput([]); return; }
    if (result === "__QUIT__") { exit(); return; }
    if (result === "__LOADED__") {
      setOutput([
        t("app.game_header"),
        `${t("app.date_label")} ${getTodayDate()}`,
        `${t("app.you_control")} ${p.flag} ${p.name}`,
        "",
        ...(state.briefing || []),
        "",
        t("app.type_help"),
      ]);
      setWarView(false);
      rerender();
      return;
    }
    if (result) addOutput(result);

    if ((state as GameState).phase === "gameover") {
      setPhase("gameover");
      addOutput(state.gameOverMessage);
    }

    // Show war view if war-related command
    if (input.startsWith("war ")) setWarView(true);

    rerender();
  };

  if (phase === "title") {
    return (
      <I18nContext.Provider value={i18nValue}>
        <Title onStart={handleStart} loading={false} />
      </I18nContext.Provider>
    );
  }

  if (phase === "loading") {
    return (
      <I18nContext.Provider value={i18nValue}>
        <Box flexDirection="column" padding={1}>
          <Text bold color="yellow">{t("app.loading_title")}</Text>
          <Box marginY={1}><Text color="cyan">{t("app.fetching_intel")}</Text></Box>
          <Text dimColor>{t("app.fetching_rates")}</Text>
          <Text dimColor>{t("app.fetching_news")}</Text>
          <Text dimColor>{t("app.fetching_sim")}</Text>
          <Box marginY={1}><Text color="yellow">{t("app.fetching_wait")}</Text></Box>
        </Box>
      </I18nContext.Provider>
    );
  }

  if (phase === "gameover" && stateRef.current) {
    return (
      <I18nContext.Provider value={i18nValue}>
        <GameOver state={stateRef.current} />
      </I18nContext.Provider>
    );
  }

  const state = stateRef.current!;
  const p = getPlayerCountry(state);
  const sidebarWidth = 34;
  const termRows = stdout?.rows ?? 24;
  const outputHeight = Math.max(8, termRows - 6);

  return (
    <I18nContext.Provider value={i18nValue}>
      <Box flexDirection="column" padding={0}>
        <Box flexDirection="row">
          {/* Main content */}
          <Box flexDirection="column" flexGrow={1} paddingLeft={1}>
            {/* Output area — fills available height above command input */}
            {warView && state.activeWar?.active ? (
              <Box flexDirection="column" height={outputHeight} overflow="hidden">
                <Text bold color="red">{"═══ ACTIVE WAR ═══"}</Text>
                <Text>
                  ⚔ {p.flag} {p.name} vs{" "}
                  {(() => {
                    const def = state.activeWar!.defender;
                    const c = state.countries.find((c) => c.id === def);
                    return c ? `${c.flag} ${c.name}` : def;
                  })()}
                </Text>
                <Text>Phase: {state.activeWar.phase} | Day started: {state.activeWar.dayStarted}</Text>
                <Text>Morale — ATK: {state.activeWar.attackerMorale}% | DEF: {state.activeWar.defenderMorale}%</Text>
                <Text>Losses — ATK: {state.activeWar.attackerLosses} | DEF: {state.activeWar.defenderLosses}</Text>
                <Text dimColor>─────────────────────────────</Text>
                {state.activeWar.battles.slice(-Math.max(1, outputHeight - 8)).map((b, i) => {
                  const icon = b.result === "attacker_win" ? "⚔" : b.result === "defender_win" ? "🛡" : "⚖";
                  return (
                    <Text key={i} dimColor>
                      Day {b.day} {icon} {b.name}: {b.description}
                    </Text>
                  );
                })}
                <Text color="cyan">Commands: war attack | war defend | war retreat | war status</Text>
              </Box>
            ) : (
              <Box flexDirection="column" height={outputHeight} overflow="hidden">
                {output.slice(-outputHeight).map((line, i) => (
                  <Text key={i} wrap="truncate">{line}</Text>
                ))}
              </Box>
            )}

            {/* Command input — above status bar */}
            <Box marginTop={1}>
              <CommandInput onSubmit={handleCommand} disabled={false} />
            </Box>
          </Box>

          {/* Sidebar */}
          <Box marginLeft={1}>
            <Sidebar state={state} width={sidebarWidth} />
          </Box>
        </Box>

        {/* Status bar at bottom */}
        <Box marginTop={1}>
          <StatusBar message={state.activeWar?.active ? "⚔ WAR ACTIVE — 'war status' for details" : ""} />
        </Box>
      </Box>
    </I18nContext.Provider>
  );
};

export default App;
