import React from "react";
import { useStore, requestConfirm } from "../game/store";
import { getCountryById, getPlayerCountry, isOutOfPlay } from "../game/state";
import { Section, Stat, Bar, ActionButton, NationRow } from "../components/shared";
import TimedAction from "../components/TimedAction";
import { checkAction, getAction } from "../game/actions";
import { t, useLanguage } from "../i18n";
import { countryName } from "../game/names";
import { selectCountry } from "../game/store";

const AE_COST = 15;

const MilitaryPanel: React.FC = () => {
  const { state, ui } = useStore();
  useLanguage();

  if (!state) return null;

  const player = getPlayerCountry(state);
  const selectedId = ui.selectedCountryId ?? state.playerCountryId;
  const target = getCountryById(state, selectedId);
  const isSelf = !target || target.id === state.playerCountryId;

  const others = state.countries.filter((c) => c.id !== state.playerCountryId && !isOutOfPlay(state, c.id));

  // Nuclear strike preconditions, mirroring the `nuclear` command exactly.
  const nukeCheck = checkAction(state, getAction("mil.nuclear")!, state.playerCountryId, target?.id);
  const nukeBlockers = nukeCheck.ok ? [] : [nukeCheck.reason ?? ""];
  const nukeReady = nukeCheck.ok;

  return (
    <>
      <Section title={t("ui.mil.title")}>
        <Stat label={t("ui.mil.readiness")} value={`${state.armyEndurance}%`} />
        <Bar
          pct={state.armyEndurance}
          color={state.armyEndurance >= 60 ? "var(--green)" : state.armyEndurance >= 30 ? "var(--orange)" : "var(--red)"}
        />
        <Stat label={t("ui.nation.military")} value={`${player.military}/100`} />
        <Bar pct={player.military} color="var(--red)" />
        <Stat label={t("ui.nation.force")} value={`${player.forceValue}%`} />
        <Bar pct={player.forceValue} color="var(--gold)" />
      </Section>

      {!isSelf && target ? (
        <Section title={`${target.flag} ${countryName(target)}`}>
          <div className="actions">
            {["mil.drill", "mil.deploy", "mil.strike", "mil.aid"].map((id) => (
              <TimedAction key={id} def={getAction(id)!} actorId={state.playerCountryId} targetId={target.id} />
            ))}
            <ActionButton
              icon="☢"
              label={t("ui.act.nuclear")}
              cost={t("ui.cost.free")}
              detail={nukeReady ? t("ui.war.ready") : nukeBlockers[0]}
              danger
              disabled={!nukeReady}
              onClick={() => requestConfirm("nuclear", target.id)}
            />
          </div>
          <div className="dim" style={{ fontSize: 10.5, marginTop: 8, lineHeight: 1.5 }}>
            {t("ui.mil.cost_note", { cost: AE_COST })}
          </div>
        </Section>
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

export default MilitaryPanel;
