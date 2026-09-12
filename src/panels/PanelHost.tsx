import React from "react";
import { useStore } from "../game/store";
import { t, useLanguage } from "../i18n";
import NationPanel from "./NationPanel";
import DecisionPanel from "./DecisionPanel";
import ResearchPanel from "./ResearchPanel";
import ArmyPanel from "./ArmyPanel";
import CommandPanel from "./CommandPanel";
import DiplomacyPanel from "./DiplomacyPanel";
import MilitaryPanel from "./MilitaryPanel";
import EconomyPanel from "./EconomyPanel";
import IntelligencePanel from "./IntelligencePanel";
import WarPanel from "./WarPanel";
import LogPanel from "./LogPanel";

const TITLES: Record<string, string> = {
  nation: "ui.tab.nation",
  decisions: "ui.tab.decisions",
  research: "ui.tab.research",
  army: "ui.tab.army",
  command: "ui.tab.command",
  diplomacy: "ui.diplo.title",
  military: "ui.mil.title",
  economy: "ui.eco.title",
  intelligence: "ui.intel.title",
  war: "ui.war.title",
  log: "ui.log.title",
};

const PanelHost: React.FC = () => {
  const { ui } = useStore();
  useLanguage();

  const body = (() => {
    switch (ui.tab) {
      case "decisions":
        return <DecisionPanel />;
      case "research":
        return <ResearchPanel />;
      case "army":
        return <ArmyPanel />;
      case "command":
        return <CommandPanel />;
      case "diplomacy":
        return <DiplomacyPanel />;
      case "military":
        return <MilitaryPanel />;
      case "economy":
        return <EconomyPanel />;
      case "intelligence":
        return <IntelligencePanel />;
      case "war":
        return <WarPanel />;
      case "log":
        return <LogPanel />;
      case "nation":
      default:
        return <NationPanel />;
    }
  })();

  return (
    <aside className="panel">
      <div className="panel__header">
        <span className="panel__title">{t(TITLES[ui.tab] ?? "ui.tab.nation")}</span>
      </div>
      <div className="panel__body">{body}</div>
    </aside>
  );
};

export default PanelHost;
