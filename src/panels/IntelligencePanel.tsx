import React from "react";
import { useStore, selectCountry } from "../game/store";
import { getCountryById } from "../game/state";
import { getAttitude } from "../game/types";
import { Section, Stat, Bar, NationRow } from "../components/shared";
import TimedAction from "../components/TimedAction";
import { getAction } from "../game/actions";
import { t, useLanguage } from "../i18n";
import { countryName } from "../game/names";

const SPY_COST = 12;

const IntelligencePanel: React.FC = () => {
  const { state, ui } = useStore();
  useLanguage();

  if (!state) return null;

  const selectedId = ui.selectedCountryId ?? state.playerCountryId;
  const target = getCountryById(state, selectedId);
  const isSelf = !target || target.id === state.playerCountryId;

  const others = state.countries.filter((c) => c.id !== state.playerCountryId);

  return (
    <>
      {!isSelf && target ? (
        <>
          <Section title={`${t("ui.intel.report")} — ${target.flag} ${countryName(target)}`}>
            <Stat label={t("ui.nation.government")} value={t(`gov.${target.government}`)} />
            <Stat label={t("ui.nation.power")} value={t(`power.${target.power}`)} />
            <Stat label={t("ui.nation.economy")} value={`${target.economy}/100`} />
            <Bar pct={target.economy} color="var(--gold)" />
            <Stat label={t("ui.nation.military")} value={`${target.military}/100`} />
            <Bar pct={target.military} color="var(--red)" />
            <Stat label={t("ui.nation.stability")} value={`${target.stability}/100`} />
            <Bar pct={target.stability} color="var(--blue)" />
            <Stat label={t("ui.eco.treasury")} value={`$${target.treasury}B`} />
            <Stat
              label={t("ui.nation.nuclear")}
              value={target.nuclear ? t("sidebar.yes") : t("sidebar.no")}
              color={target.nuclear ? "var(--red)" : undefined}
            />
            <Stat label={t("ui.nation.public_support")} value={`${target.publicSupport}%`} />
            <Stat label={t("ui.nation.force")} value={`${target.forceValue}%`} />
            <Stat
              label={t("ui.diplo.attitude")}
              value={t(`att.${getAttitude(target.relations[state.playerCountryId] ?? 0)}`)}
              color="var(--gold)"
            />
          </Section>

          <Section title={t("ui.intel.title")}>
            <div className="actions">
              {["spy.infiltrate", "spy.sabotage", "spy.intel"].map((id) => (
                <TimedAction key={id} def={getAction(id)!} actorId={state.playerCountryId} targetId={target.id} />
              ))}
            </div>
            <div className="dim" style={{ fontSize: 10.5, marginTop: 8, lineHeight: 1.55 }}>
              {t("ui.intel.cost_note", { cost: SPY_COST })}
              <br />
              {t("ui.intel.infiltrate_note")}
            </div>
          </Section>
        </>
      ) : (
        <div className="panel__empty">{t("ui.diplo.select")}</div>
      )}

      <Section title={t("ui.diplo.nations")}>
        {others.map((c) => (
          <NationRow
            key={c.id}
            country={c}
            relation={c.relations[state.playerCountryId] ?? 0}
            isSelected={ui.selectedCountryId === c.id}
            onClick={() => selectCountry(c.id)}
          />
        ))}
      </Section>
    </>
  );
};

export default IntelligencePanel;
