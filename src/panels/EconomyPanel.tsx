import React from "react";
import { useStore } from "../game/store";
import { getPlayerCountry } from "../game/state";
import { Section, Stat, Bar } from "../components/shared";
import TimedAction from "../components/TimedAction";
import { getAction } from "../game/actions";
import { t, useLanguage } from "../i18n";

const EconomyPanel: React.FC = () => {
  const { state } = useStore();
  useLanguage();

  if (!state) return null;
  const p = getPlayerCountry(state);

  return (
    <>
      <Section title={t("ui.eco.title")}>
        <Stat label={t("ui.eco.treasury")} value={`$${p.treasury}B`} color="var(--green)" />
        <Stat label={t("ui.nation.economy")} value={`${p.economy}/100`} />
        <Bar pct={p.economy} color="var(--gold)" />
        <Stat label={t("ui.nation.stability")} value={`${p.stability}/100`} />
        <Bar pct={p.stability} color="var(--blue)" />
        <Stat label={t("ui.top.ne")} value={`${state.nationalEndurance}%`} />
        <Bar pct={state.nationalEndurance} color="var(--green)" />
      </Section>

      <Section title={t("ui.tab.economy")}>
        <div className="actions">
          {["eco.invest", "eco.stimulus", "eco.manipulate", "eco.sanction"].map((id) => (
            <TimedAction key={id} def={getAction(id)!} actorId={state.playerCountryId} />
          ))}
        </div>
        <div className="dim" style={{ fontSize: 10.5, marginTop: 8, lineHeight: 1.55 }}>
          {t("ui.eco.cost_note")}
          <br />
          {t("ui.eco.sanction_note")}
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

export default EconomyPanel;
