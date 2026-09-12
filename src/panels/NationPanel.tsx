import React from "react";
import { useStore, runAction } from "../game/store";
import { getPlayerCountry } from "../game/state";
import { Section, Stat, Bar, ActionButton } from "../components/shared";
import { t, useLanguage } from "../i18n";
import { countryName } from "../game/names";

const NationPanel: React.FC = () => {
  const { state } = useStore();
  useLanguage();

  if (!state) return null;
  const p = getPlayerCountry(state);

  const forceText =
    p.forceValue >= 70 ? t("force.extreme")
    : p.forceValue >= 55 ? t("force.high")
    : p.forceValue >= 30 ? t("force.medium")
    : t("force.low");

  const supportColor = p.publicSupport >= 65 ? "var(--green)" : p.publicSupport >= 40 ? "var(--orange)" : "var(--red)";

  return (
    <>
      <Section title={t("ui.nation.header")}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 30 }}>{p.flag}</span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--gold-bright)" }}>{countryName(p)}</div>
            <div className="dim" style={{ fontSize: 11 }}>
              {t(`gov.${p.government}`)} · {t(`power.${p.power}`)}
              {p.nuclear && " · ☢"}
            </div>
          </div>
        </div>
        <div className="dim" style={{ fontSize: 11.5, lineHeight: 1.6, fontStyle: "italic" }}>
          {t(p.description)}
        </div>
      </Section>

      <Section title={t("ui.nation.stats")}>
        <Stat label={t("ui.nation.economy")} value={`${p.economy}/100`} />
        <Bar pct={p.economy} color="var(--gold)" />
        <Stat label={t("ui.nation.military")} value={`${p.military}/100`} />
        <Bar pct={p.military} color="var(--red)" />
        <Stat label={t("ui.nation.stability")} value={`${p.stability}/100`} />
        <Bar pct={p.stability} color="var(--blue)" />
      </Section>

      <Section title={t("ui.nation.public_support")}>
        <Stat label={t("ui.nation.public_support")} value={`${p.publicSupport}%`} color={supportColor} />
        <Bar pct={p.publicSupport} color={supportColor} />
        <Stat label={t("ui.nation.force")} value={`${p.forceValue}%`} />
        <Bar pct={p.forceValue} color={p.forceValue >= 55 ? "var(--green)" : "var(--orange)"} />
        <div className="dim" style={{ fontSize: 10.5, marginTop: 2, lineHeight: 1.5 }}>
          {forceText}
        </div>
      </Section>

      <Section title={t("ui.nation.overview")}>
        <Stat label={t("ui.nation.population")} value={`${p.population}M`} />
        <Stat label={t("ui.nation.treasury")} value={`$${p.treasury}B`} color="var(--green)" />
        <Stat label={t("ui.nation.nuclear")} value={p.nuclear ? t("sidebar.yes") : t("sidebar.no")} />
        <Stat label={t("ui.nation.allies")} value={p.allies.length} color="var(--green)" />
        <Stat label={t("ui.nation.enemies")} value={p.enemies.length} color="var(--red)" />
      </Section>

      <Section title={t("ui.nation.propaganda")}>
        <div className="actions">
          <ActionButton
            icon="📢"
            label={t("ui.act.prop_domestic")}
            cost={t("ui.cost.dp", { n: 8 })}
            onClick={() => runAction("propaganda domestic")}
            disabled={state.diplomaticPoints < 8}
          />
          <ActionButton
            icon="🌍"
            label={t("ui.act.prop_foreign")}
            cost={t("ui.cost.dp", { n: 8 })}
            onClick={() => runAction("propaganda foreign")}
            disabled={state.diplomaticPoints < 8}
          />
        </div>
      </Section>

      <Section title={t("ui.nation.rates")}>
        <Stat label="USD / CNY" value={state.exchangeRates.USD_CNY.toFixed(3)} />
        <Stat label="USD / HKD" value={state.exchangeRates.USD_HKD.toFixed(3)} />
        <Stat label="USD / EUR" value={state.exchangeRates.USD_EUR.toFixed(3)} />
        <Stat label="USD / GBP" value={state.exchangeRates.USD_GBP.toFixed(3)} />
        <Stat label="USD / JPY" value={state.exchangeRates.USD_JPY.toFixed(2)} />
        <Stat label="USD / RUB" value={state.exchangeRates.USD_RUB.toFixed(2)} />
      </Section>
    </>
  );
};

export default NationPanel;
