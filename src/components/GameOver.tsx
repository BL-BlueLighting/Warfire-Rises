import React from "react";
import { Box, Text, useStdout } from "ink";
import { GameState } from "../types";
import { getPlayerCountry } from "../game/state";
import { useI18n } from "../i18n";

interface Props {
  state: GameState;
}

const GameOver: React.FC<Props> = ({ state }) => {
  const { t } = useI18n();
  const p = getPlayerCountry(state);
  const isTFR = state.ending === "tfr";
  const { stdout } = useStdout();
  const termWidth = stdout.columns ?? 80;
  const hr = "═".repeat(Math.min(50, termWidth - 4));

  const titleColor = isTFR ? "red" : "cyan";
  const accentColor = isTFR ? "red" : "blue";

  return (
    <Box flexDirection="column" padding={1} alignItems="center">
      <Box height={2} />

      {/* Centered ending title */}
      <Box flexDirection="column" alignItems="center" marginBottom={1}>
        <Text bold color={titleColor} backgroundColor="black">
          {isTFR ? "  THE FIRE RISES  " : "  THE NEW ORDER  "}
        </Text>
        <Box height={1} />
        <Text bold color="yellow">
          {isTFR ? "战 火 升 腾" : "新   秩   序"}
        </Text>
      </Box>

      <Box height={1} />
      <Text color="gray">{hr}</Text>
      <Box height={2} />

      {/* Narrative ending */}
      <Box flexDirection="column" alignItems="center">
        <Text color="white">{state.gameOverMessage}</Text>
      </Box>

      <Box height={2} />

      {/* Stats */}
      <Box flexDirection="column" alignItems="center">
        <Text bold color="yellow">{t("gameover.final_stats")}</Text>
        <Box height={1} />
        <Text>{t("gameover.nation")} {p.flag} {p.name}</Text>
        <Text>{t("gameover.days_survived")} {state.day}</Text>
        <Text>{t("gameover.final_wc")} <Text color={titleColor} bold>{String(state.worldCollapse)}%</Text></Text>
        <Text>{t("gameover.final_ne")} {String(state.nationalEndurance)}%</Text>
        <Text>{t("gameover.final_ae")} {String(state.armyEndurance)}%</Text>
        <Text>{t("gameover.final_treasury")} ${p.treasury}B</Text>
        <Text>
          {t("gameover.final_allies")}{" "}
          {p.allies.length > 0 ? p.allies.join(", ") : t("common.none")}
        </Text>
        <Text>
          {t("gameover.final_enemies")}{" "}
          {p.enemies.length > 0 ? p.enemies.join(", ") : t("common.none")}
        </Text>
      </Box>

      <Box height={2} />

      {/* Ending label and epilogue */}
      <Box flexDirection="column" alignItems="center">
        <Text bold color="yellow">
          {t("gameover.ending_label")}{" "}
          {t(isTFR ? "gameover.tfr_ending_label" : "gameover.tno_ending_label")}
        </Text>
        <Box height={1} />
        <Text dimColor>
          {t(isTFR ? "gameover.tfr_epilogue" : "gameover.tno_epilogue")}
        </Text>
      </Box>

      <Box height={3} />

      <Text color="green" bold>{t("gameover.exit_hint")}</Text>
    </Box>
  );
};

export default GameOver;
