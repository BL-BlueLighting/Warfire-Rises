import React from "react";
import { Box, Text } from "ink";
import { GameState } from "../types";
import { getPlayerCountry } from "../game/state";
import { useI18n } from "../i18n";

interface Props {
  state: GameState;
  width: number;
}

const Divider: React.FC = () => (
  <Text dimColor>{" │"}</Text>
);

const SectionHeader: React.FC<{ children: string }> = ({ children }) => (
  <Box>
    <Text bold color="yellow">{"▸ "}</Text>
    <Text bold color="white">{children}</Text>
  </Box>
);

const Sidebar: React.FC<Props> = ({ state, width }) => {
  const { t, lang } = useI18n();
  const p = getPlayerCountry(state);
  const relCount = Object.values(p.relations).filter((r) => r >= 75).length;
  const enemyCount = Object.values(p.relations).filter((r) => r <= -75).length;

  const wcColor =
    state.worldCollapse >= 80 ? "red" : state.worldCollapse >= 50 ? "yellow" : state.worldCollapse >= 25 ? "yellow" : "green";
  const neColor = state.nationalEndurance >= 60 ? "green" : state.nationalEndurance >= 30 ? "yellow" : "red";
  const aeColor = state.armyEndurance >= 60 ? "green" : state.armyEndurance >= 30 ? "yellow" : "red";

  return (
    <Box flexDirection="column" width={width} paddingX={1} paddingY={0}>
      {/* Country header */}
      <Box flexDirection="column">
        <Text bold color="cyan">{p.flag} {p.name}</Text>
        <Text bold color="gray">{t("sidebar.day", { day: state.day })}</Text>
        <Text dimColor>🌐 {lang.toUpperCase()}</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>{"─".repeat(width - 2)}</Text>
      </Box>

      {/* Stats */}
      <Box marginTop={1} flexDirection="column">
        <SectionHeader>{t("sidebar.stats")}</SectionHeader>
        <Text>{t("sidebar.diplomatic_pts")} <Text color="blue" bold>{String(state.diplomaticPoints)}</Text></Text>
        <Text>{t("sidebar.army_endurance")} <Text color={aeColor} bold>{String(state.armyEndurance)}%</Text></Text>
        <Text>{t("sidebar.national_endure")} <Text color={neColor} bold>{String(state.nationalEndurance)}%</Text></Text>
        <Text>{t("sidebar.treasury")} <Text color="green" bold>${p.treasury}B</Text></Text>
        <Text>{t("force.label")}: <Text color={p.forceValue >= 55 ? "green" : p.forceValue >= 30 ? "yellow" : "red"} bold>{String(p.forceValue)}%</Text></Text>
        <Text>Support: <Text color={p.publicSupport >= 65 ? "green" : "yellow"} bold>{String(p.publicSupport)}%</Text></Text>
      </Box>

      {/* Global */}
      <Box marginTop={1} flexDirection="column">
        <SectionHeader>{t("sidebar.global")}</SectionHeader>
        <Text>{t("sidebar.world_collapse")} <Text color={wcColor} bold>{String(state.worldCollapse)}%</Text></Text>
        <Text>{t("sidebar.allies")} <Text color="green">{String(relCount)}</Text></Text>
        <Text>{t("sidebar.enemies")} <Text color="red">{String(enemyCount)}</Text></Text>
      </Box>

      {/* Nation */}
      <Box marginTop={1} flexDirection="column">
        <SectionHeader>{t("sidebar.nation")}</SectionHeader>
        <Text>{t("sidebar.economy")} <Text color="yellow">{String(p.economy)}/100</Text></Text>
        <Text>{t("sidebar.military")} <Text color="yellow">{String(p.military)}/100</Text></Text>
        <Text>{t("sidebar.stability")} <Text color="yellow">{String(p.stability)}/100</Text></Text>
        <Text>{t("sidebar.nuclear")} <Text color={p.nuclear ? "red" : "gray"}>{p.nuclear ? t("sidebar.yes") : t("sidebar.no")}</Text></Text>
      </Box>

      {/* Rates */}
      <Box marginTop={1} flexDirection="column">
        <SectionHeader>{t("sidebar.rates")}</SectionHeader>
        <Text dimColor>USD/CNY {state.exchangeRates.USD_CNY.toFixed(2)}</Text>
        <Text dimColor>USD/HKD {state.exchangeRates.USD_HKD.toFixed(2)}</Text>
        <Text dimColor>USD/EUR {state.exchangeRates.USD_EUR.toFixed(2)}</Text>
        <Text dimColor>USD/JPY {state.exchangeRates.USD_JPY.toFixed(0)}</Text>
        <Text dimColor>USD/RUB {state.exchangeRates.USD_RUB.toFixed(1)}</Text>
      </Box>

      {/* Keywords */}
      <Box marginTop={1} flexDirection="column">
        <SectionHeader>{t("sidebar.keywords")}</SectionHeader>
        {state.worldKeywords.slice(0, 5).map((kw, i) => (
          <Text key={i} dimColor>• {kw}</Text>
        ))}
      </Box>

      {/* Recent log */}
      <Box marginTop={1} flexDirection="column">
        <SectionHeader>{t("sidebar.recent")}</SectionHeader>
        {state.log.slice(-4).map((entry, i) => (
          <Text key={i} dimColor>
            {entry.length > 28 ? entry.slice(0, 27) + "…" : entry}
          </Text>
        ))}
      </Box>
    </Box>
  );
};

export default Sidebar;
