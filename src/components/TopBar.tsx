import React from "react";
import { useStore, openSaveDialog, quitToTitle, switchLanguage, openSettings } from "../game/store";
import SpeedControls from "./SpeedControls";
import { getPlayerCountry } from "../game/state";
import { t, useLanguage, type Language } from "../i18n";
import { countryName } from "../game/names";
import Flag from "./Flag";

/** Colour a 0-100 resource bar by how healthy the value is. */
function healthColor(value: number, invert = false): string {
  if (invert) {
    return value >= 80 ? "var(--red)" : value >= 50 ? "var(--orange)" : "var(--green)";
  }
  return value >= 60 ? "var(--green)" : value >= 30 ? "var(--orange)" : "var(--red)";
}

const Resource: React.FC<{
  label: string;
  value: string;
  color?: string;
  bar?: { pct: number; color: string };
}> = ({ label, value, color, bar }) => (
  <div className="res">
    <div className="res__label">{label}</div>
    <div className="res__value" style={color ? { color } : undefined}>
      {value}
    </div>
    {bar && (
      <div className="res__bar">
        <i style={{ width: `${Math.max(0, Math.min(100, bar.pct))}%`, background: bar.color }} />
      </div>
    )}
  </div>
);

const TopBar: React.FC = () => {
  const { state } = useStore();
  const lang = useLanguage(); // re-render on language change
  const nextLang: Language = lang === "zh-cn" ? "en-us" : "zh-cn";

  if (!state) return null;
  const p = getPlayerCountry(state);

  return (
    <header className="topbar">
      <div className="topbar__nation">
        <Flag id={p.id} className="topbar__flag" />
        <div>
          <div className="topbar__name">{countryName(p)}</div>
          <div className="topbar__sub">{t(`gov.${p.government}`)}</div>
        </div>
      </div>

      <div className="topbar__resources">
        <Resource label={t("ui.top.day")} value={String(state.day)} color="var(--gold-bright)" />

        <Resource
          label={t("ui.top.dp")}
          value={String(state.diplomaticPoints)}
          color="var(--blue)"
          bar={{ pct: state.diplomaticPoints, color: "var(--blue)" }}
        />
        <Resource
          label={t("ui.top.ae")}
          value={`${state.armyEndurance}%`}
          color={healthColor(state.armyEndurance)}
          bar={{ pct: state.armyEndurance, color: healthColor(state.armyEndurance) }}
        />
        <Resource
          label={t("ui.top.ne")}
          value={`${state.nationalEndurance}%`}
          color={healthColor(state.nationalEndurance)}
          bar={{ pct: state.nationalEndurance, color: healthColor(state.nationalEndurance) }}
        />
        <Resource label={t("ui.top.treasury")} value={`$${p.treasury}B`} color="var(--green)" />
        <Resource
          label={t("ui.top.wc")}
          value={`${state.worldCollapse}%`}
          color={healthColor(state.worldCollapse, true)}
          bar={{ pct: state.worldCollapse, color: healthColor(state.worldCollapse, true) }}
        />
      </div>

      <div className="topbar__actions">
        <SpeedControls />
        <button className="btn btn--sm" onClick={openSaveDialog} title={t("ui.save.title")}>
          {t("ui.btn.save")}
        </button>
        <button
          className="btn btn--sm"
          onClick={() => switchLanguage(nextLang)}
          title={t("cmd.language.desc")}
        >
          {nextLang === "zh-cn" ? "中" : "EN"}
        </button>
        <button className="btn btn--sm" onClick={openSettings} title={t("ui.settings.title")}>
          ⚙
        </button>
        <button className="btn btn--sm" onClick={quitToTitle} title={t("ui.btn.new")}>
          ⌂
        </button>
      </div>
    </header>
  );
};

export default TopBar;
