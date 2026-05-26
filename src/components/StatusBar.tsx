import React from "react";
import { Box, Text } from "ink";
import { useI18n } from "../i18n";

interface Props {
  message: string;
}

const StatusBar: React.FC<Props> = ({ message }) => {
  const { t } = useI18n();

  return (
    <Box flexDirection="column">
      {message.length > 0 && (
        <Box borderStyle="single" borderColor="yellow" paddingX={1}>
          <Text color="yellow">{message}</Text>
        </Box>
      )}
      <Box paddingX={1}>
        <Text backgroundColor="blue" color="white" bold> help </Text>
        <Text dimColor> {t("statusbar.commands")} </Text>
        <Text backgroundColor="blue" color="white" bold> next </Text>
        <Text dimColor> {t("statusbar.advance_day")} </Text>
        <Text backgroundColor="blue" color="white" bold> world </Text>
        <Text dimColor> {t("statusbar.overview")} </Text>
        <Text backgroundColor="blue" color="white" bold> Ctrl+C </Text>
        <Text dimColor> {t("statusbar.quit")}</Text>
      </Box>
    </Box>
  );
};

export default StatusBar;
