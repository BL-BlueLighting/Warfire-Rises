import React from "react";
import { useStore, setTab } from "../game/store";
import { PanelTab } from "../game/types";
import { t, useLanguage } from "../i18n";

const TABS: { id: PanelTab; icon: string; labelKey: string }[] = [
  { id: "nation", icon: "🏛", labelKey: "ui.tab.nation" },
  { id: "decisions", icon: "📜", labelKey: "ui.tab.decisions" },
  { id: "research", icon: "🔬", labelKey: "ui.tab.research" },
  { id: "army", icon: "🎖", labelKey: "ui.tab.army" },
  { id: "command", icon: "⭐", labelKey: "ui.tab.command" },
  { id: "diplomacy", icon: "🤝", labelKey: "ui.tab.diplomacy" },
  { id: "military", icon: "⚔", labelKey: "ui.tab.military" },
  { id: "economy", icon: "💰", labelKey: "ui.tab.economy" },
  { id: "intelligence", icon: "🕵", labelKey: "ui.tab.intelligence" },
  { id: "war", icon: "🔥", labelKey: "ui.tab.war" },
  { id: "log", icon: "📜", labelKey: "ui.tab.log" },
];

const LeftRail: React.FC = () => {
  const { state, ui } = useStore();
  useLanguage();

  if (!state) return null;
  const atWar = state.activeWar?.active ?? false;

  return (
    <nav className="rail">
      <div className="rail__section">
        <div className="rail__title">{t("ui.rail.overview")}</div>
        <button
          className={`rail__tab${ui.tab === "nation" ? " is-active" : ""}`}
          onClick={() => setTab("nation")}
        >
          <span className="rail__tab-icon">🏛</span>
          <span>{t("ui.tab.nation")}</span>
        </button>
      </div>

      <div className="rail__section">
        <div className="rail__title">{t("ui.rail.actions")}</div>
        {TABS.slice(1).map((tab) => (
          <button
            key={tab.id}
            className={`rail__tab${ui.tab === tab.id ? " is-active" : ""}`}
            onClick={() => setTab(tab.id)}
          >
            <span className="rail__tab-icon">{tab.icon}</span>
            <span>{t(tab.labelKey)}</span>
            {tab.id === "war" && atWar && <span className="rail__badge">!</span>}
          </button>
        ))}
      </div>

      <div className="rail__section">
        <div className="rail__title">{t("ui.top.campaign_start")}</div>
        <div className="dim" style={{ fontSize: 11, padding: "0 4px" }}>
          {ui.campaignStart}
        </div>
      </div>

      <div className="rail__section">
        <div className="rail__title">{t("ui.nation.keywords")}</div>
        {state.worldKeywords.slice(0, 6).map((kw, i) => (
          <div key={i} className="dim" style={{ fontSize: 11, padding: "1px 4px", lineHeight: 1.5 }}>
            • {kw}
          </div>
        ))}
      </div>
    </nav>
  );
};

export default LeftRail;
