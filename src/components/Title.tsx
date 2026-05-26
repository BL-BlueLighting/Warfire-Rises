import React, { useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { COUNTRIES } from "../game/countries";
import { useI18n } from "../i18n";

interface Props {
  onStart: (countryId: string) => void;
  loading: boolean;
}

const Title: React.FC<Props> = ({ onStart, loading }) => {
  const { t } = useI18n();
  const [selected, setSelected] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const { stdout } = useStdout();
  const termWidth = stdout.columns ?? 80;

  useInput((input, key) => {
    if (confirmed || loading) return;
    if (key.upArrow || input === "k") {
      setSelected((s) => (s - 1 + COUNTRIES.length) % COUNTRIES.length);
    } else if (key.downArrow || input === "j") {
      setSelected((s) => (s + 1) % COUNTRIES.length);
    } else if (key.return) {
      setConfirmed(true);
      onStart(COUNTRIES[selected].id);
    }
  });

  if (loading) {
    return (
      <Box flexDirection="column" padding={1} alignItems="center">
        <Text bold color="yellow">{t("title.fetching")}</Text>
        <Text dimColor>{t("title.gathering")}</Text>
      </Box>
    );
  }

  const hr = "─".repeat(Math.min(60, termWidth - 4));

  return (
    <Box flexDirection="column" padding={1} alignItems="center">
      {/* Spacer */}
      <Box height={2} />

      {/* Main Title — centered, prominent */}
      <Box flexDirection="column" alignItems="center" marginBottom={1}>
        <Text bold color="red" backgroundColor="black">
          {"  WARFIRE  RISES  "}
        </Text>
        <Box height={1} />
        <Text bold color="yellow">
          战 火 升 腾
        </Text>
      </Box>

      <Box height={1} />
      <Text color="gray">{hr}</Text>
      <Box height={1} />

      <Text dimColor>{t("title.subtitle")}</Text>

      <Box height={2} />

      <Text dimColor>{t("title.intro")}</Text>

      <Box height={2} />

      <Box flexDirection="column" marginY={1}>
        <Text bold color="cyan">{t("title.select_prompt")}</Text>
        <Box height={1} />

        {COUNTRIES.map((c, i) => {
          const isSelected = i === selected;
          const marker = isSelected ? "▶" : " ";
          const govKey = `gov.${c.government}`;
          const powerKey = `power.${c.power}`;
          const lineColor = isSelected ? "green" : undefined;
          const bgColor = isSelected ? "gray" : undefined;

          return (
            <Box key={c.id}>
              <Text color={lineColor} backgroundColor={bgColor}>
                {marker} {c.flag} {c.name.padEnd(18)}
                {" "}[{t(powerKey)}] {t(govKey)} {c.nuclear ? "☢" : ""}
              </Text>
            </Box>
          );
        })}
      </Box>

      <Box height={1} />

      <Box flexDirection="column" alignItems="center">
        <Text color="yellow" bold>
          {t("title.selected_label")} {COUNTRIES[selected].flag} {COUNTRIES[selected].name}
        </Text>
        <Text dimColor>{t(COUNTRIES[selected].description)}</Text>
      </Box>

      <Box height={2} />

      <Text color="green" bold>
        {confirmed ? t("title.confirming") : t("title.press_enter")}
      </Text>
    </Box>
  );
};

export default Title;
