import React from "react";
import { useStore } from "../game/store";
import { Section } from "../components/shared";
import { t, useLanguage } from "../i18n";

const SEVERITY_COLOR: Record<string, string> = {
  low: "var(--green)",
  medium: "var(--gold)",
  high: "var(--orange)",
  critical: "var(--red-bright)",
};

const TYPE_ICON: Record<string, string> = {
  political: "🏛",
  military: "⚔",
  economic: "💰",
  diplomatic: "🤝",
  disaster: "🌪",
  crisis: "⚠",
};

const LogPanel: React.FC = () => {
  const { state, ui } = useStore();
  useLanguage();

  if (!state) return null;

  const events = state.events.slice(-40).reverse();

  return (
    <>
      <Section title={t("ui.brief.title")}>
        {state.briefing.length === 0 && <div className="panel__empty">{t("ui.brief.empty")}</div>}
        {state.briefing.map((b, i) => (
          <div key={i} className="battle" style={{ borderLeftColor: "var(--gold)" }}>
            {b}
          </div>
        ))}
      </Section>

      {ui.worldFeed.length > 0 && (
        <Section title={t("ui.log.world")}>
          {ui.worldFeed.slice(0, 12).map((line, i) => (
            <div key={i} className="dim" style={{ fontSize: 11, lineHeight: 1.6, padding: "1px 0" }}>
              • {line}
            </div>
          ))}
        </Section>
      )}

      <Section title={t("ui.log.title")}>
        {events.length === 0 && <div className="panel__empty">{t("ui.log.empty")}</div>}
        {events.map((ev) => (
          <div className="battle" key={ev.id} style={{ borderLeftColor: SEVERITY_COLOR[ev.severity] }}>
            <div className="battle__head">
              <span>
                {TYPE_ICON[ev.type] ?? "•"} {t(`event_type.${ev.type}`)}
              </span>
              <span>
                {t("ui.log.event_day", { day: ev.day })} · WC {ev.worldCollapseChange >= 0 ? "+" : ""}
                {ev.worldCollapseChange}
              </span>
            </div>
            <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: 2 }}>{ev.title}</div>
            <div className="dim">{ev.description}</div>
          </div>
        ))}
      </Section>

      <Section title={t("ui.log.system")}>
        {state.log
          .slice(-25)
          .reverse()
          .map((entry, i) => (
            <div key={i} className="dim mono" style={{ fontSize: 10.5, lineHeight: 1.55 }}>
              {entry}
            </div>
          ))}
      </Section>
    </>
  );
};

export default LogPanel;
