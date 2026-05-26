import React from "react";
import { Box, Text } from "ink";
import { GameEvent } from "../types";
import { COUNTRIES } from "../game/countries";
import { useI18n } from "../i18n";

interface Props {
  events: GameEvent[];
  briefing: string[];
  day: number;
}

const severityColor = {
  low: "green",
  medium: "yellow",
  high: "red",
  critical: "magenta",
} as const;

const EventLog: React.FC<Props> = ({ events, briefing, day }) => {
  const { t } = useI18n();
  const recentEvents = events.slice(-12);

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Text bold color="cyan">{t("eventlog.title")}</Text>
      <Text dimColor>{t("eventlog.day_briefing", { day })}</Text>
      <Text dimColor>{t("eventlog.separator")}</Text>

      {briefing.length > 0 && (
        <Box flexDirection="column" marginY={1}>
          <Text bold color="white">{t("eventlog.daily_briefing")}</Text>
          {briefing.map((b, i) => (
            <Text key={i} color="yellow">
              {b.length > 90 ? b.slice(0, 90) + "…" : b}
            </Text>
          ))}
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">
        <Text bold color="white">{t("eventlog.event_log")}</Text>
        {recentEvents.length === 0 && (
          <Text dimColor>{t("eventlog.no_events")}</Text>
        )}
        {recentEvents.map((ev) => (
          <Box key={ev.id} flexDirection="column" marginTop={1}>
            <Text>
              <Text color={severityColor[ev.severity]}>
                [{t(`eventlog.type_${ev.type.slice(0, 3)}`)}]
              </Text>{" "}
              <Text bold color="white">{ev.title}</Text>
            </Text>
            <Text dimColor>
              {ev.description.length > 80
                ? ev.description.slice(0, 80) + "…"
                : ev.description}
            </Text>
            <Text dimColor>
              {t("eventlog.affected")}{" "}
              {ev.affectedCountries
                .map((id) => COUNTRIES.find((c) => c.id === id)?.name ?? id)
                .join(", ")}{" "}
              | WC {ev.worldCollapseChange >= 0 ? "+" : ""}{ev.worldCollapseChange}%
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default EventLog;
