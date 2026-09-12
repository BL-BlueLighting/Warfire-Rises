import React from "react";
import { useStore, runAction, selectCountry, requestConfirm } from "../game/store";
import { getCountryById } from "../game/state";
import { canDeclareWar, playerWarSide } from "../game/war";
import { BASE_FRONTAGE, DEFENDER_FRONTAGE, DIVISION_WIDTH } from "../game/combat";
import { Section, Stat, Bar, ActionButton, NationRow } from "../components/shared";
import TimedAction from "../components/TimedAction";
import { getAction } from "../game/actions";
import { t, useLanguage } from "../i18n";
import { countryName } from "../game/names";

const WarPanel: React.FC = () => {
  const { state, ui } = useStore();
  useLanguage();

  if (!state) return null;

  const war = state.activeWar;

  const selectedId = ui.selectedCountryId ?? state.playerCountryId;
  const target = getCountryById(state, selectedId);
  const isSelf = !target || target.id === state.playerCountryId;

  const side = playerWarSide(state);
  const attacker = war ? getCountryById(state, war.attacker) : undefined;
  const defender = war ? getCountryById(state, war.defender) : undefined;
  const us = side === "defender" ? defender : attacker;
  const them = side === "defender" ? attacker : defender;
  const ourMorale = war ? (side === "defender" ? war.defenderMorale : war.attackerMorale) : 0;
  const theirMorale = war ? (side === "defender" ? war.attackerMorale : war.defenderMorale) : 0;
  const ourLosses = war ? (side === "defender" ? war.defenderLosses : war.attackerLosses) : 0;
  const theirLosses = war ? (side === "defender" ? war.attackerLosses : war.defenderLosses) : 0;

  const declareCheck = target && !isSelf ? canDeclareWar(state, target) : null;

  const others = state.countries.filter((c) => c.id !== state.playerCountryId && !c.destroyed);

  return (
    <>
      {war?.active && attacker && defender ? (
        <>
          <Section title={t("ui.war.title")}>
            {side === "defender" && (
              <div className="war-warning">
                <div style={{ fontWeight: 700 }}>{t("ui.war.defensive")}</div>
                <div style={{ fontSize: 10.5, marginTop: 3, opacity: 0.85 }}>
                  {t("ui.war.conquest_warning")}
                </div>
              </div>
            )}

            {/* Read player-first: "our forces" is whichever side you are on. */}
            <div style={{ display: "flex", justifyContent: "space-between", margin: "10px 0" }}>
              <div style={{ textAlign: "center", flex: 1 }}>
                <div style={{ fontSize: 22 }}>{us?.flag}</div>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--gold-bright)" }}>
                  {countryName(us)}
                </div>
                <div className="dim" style={{ fontSize: 10 }}>{t("ui.war.us")}</div>
              </div>
              <div style={{ alignSelf: "center", color: "var(--red-bright)", fontWeight: 700 }}>
                {t("ui.war.vs")}
              </div>
              <div style={{ textAlign: "center", flex: 1 }}>
                <div style={{ fontSize: 22 }}>{them?.flag}</div>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--gold-bright)" }}>
                  {countryName(them)}
                </div>
                <div className="dim" style={{ fontSize: 10 }}>{t("ui.war.them")}</div>
              </div>
            </div>

            <Stat label={t("ui.war.phase")} value={t(`war.${war.phase}`)} color="var(--gold)" />
            <Stat label={t("ui.war.day_started", { day: war.dayStarted })} value={`#${war.battles.length}`} />

            <div className="section__title" style={{ marginTop: 12 }}>{t("ui.war.morale")}</div>
            <Stat label={countryName(us)} value={`${ourMorale}%`} color="var(--green)" />
            <Bar pct={ourMorale} color="var(--green)" />
            <Stat label={countryName(them)} value={`${theirMorale}%`} color="var(--red)" />
            <Bar pct={theirMorale} color="var(--red)" />

            <div className="section__title" style={{ marginTop: 12 }}>{t("ui.war.losses")}</div>
            <Stat label={countryName(us)} value={ourLosses} />
            <Stat label={countryName(them)} value={theirLosses} />

            <div className="section__title" style={{ marginTop: 12 }}>{t("ui.war.field")}</div>
            <Stat
              label={t("ui.war.front")}
              value={t("ui.war.front_value", {
                front: BASE_FRONTAGE + (side === "defender" ? DEFENDER_FRONTAGE : 0),
                width: DIVISION_WIDTH,
              })}
            />
            <Stat
              label={t("ui.war.entrench")}
              value={`+${side === "defender" ? war.defenderEntrenchment : war.attackerEntrenchment}`}
            />
            <Stat
              label={t("ui.war.stance")}
              value={t(
                (side === "defender" ? war.defenderStance : war.attackerStance) === "assault"
                  ? "war.stance.assault"
                  : "war.stance.hold"
              )}
              color="var(--gold)"
            />
            <Stat
              label={t("ui.army.committed")}
              value={`${us?.divisions.filter((d) => d.organisation > 0).length ?? 0} / ${us?.divisions.length ?? 0}`}
            />
          </Section>

          <Section title={t("ui.tab.war")}>
            <div className="actions">
              {/* Orders, not attacks: battles resolve daily on their own, and
                  these set how hard your side presses while they do. */}
              <ActionButton
                icon="⚔"
                label={t("ui.act.attack")}
                detail={t("war.stance.assault_hint")}
                onClick={() => runAction("war attack")}
              />
              <ActionButton
                icon="🛡"
                label={t("ui.act.defend")}
                detail={t("war.stance.hold_hint")}
                onClick={() => runAction("war defend")}
              />
              {/* While fighting, a warhead needs no domestic persuasion — so
                  the strike is offered right here, aimed at the enemy. */}
              <TimedAction
                def={getAction("mil.nuclear")!}
                actorId={state.playerCountryId}
                targetId={them?.id}
              />
              <ActionButton
                icon="🏳"
                label={t("ui.act.retreat")}
                danger
                onClick={() => requestConfirm("retreat")}
              />
            </div>
            <div className="dim" style={{ fontSize: 10.5, marginTop: 8, lineHeight: 1.55 }}>
              {t("ui.nuke.wartime_note")}
            </div>
          </Section>

          <Section title={t("ui.war.battles")}>
            {war.battles.length === 0 && <div className="panel__empty">{t("ui.war.no_battles")}</div>}
            {war.battles
              .slice(-12)
              .reverse()
              .map((b) => {
                const cls =
                  b.result === "attacker_win" ? "battle--win" : b.result === "defender_win" ? "battle--loss" : "battle--draw";
                const icon = b.result === "attacker_win" ? "⚔" : b.result === "defender_win" ? "🛡" : "⚖";
                return (
                  <div className={`battle ${cls}`} key={b.id}>
                    <div className="battle__head">
                      <span>
                        {icon} {b.name}
                      </span>
                      <span>
                        {b.attackerRoll} / {b.defenderRoll}
                      </span>
                    </div>
                    <div>{b.description}</div>
                  </div>
                );
              })}
          </Section>
        </>
      ) : (
        <Section title={t("ui.war.title")}>
          <div className="panel__empty">{t("ui.war.none")}</div>
          <div className="dim" style={{ fontSize: 11, textAlign: "center", lineHeight: 1.6 }}>
            {t("ui.war.declare_hint")}
          </div>
        </Section>
      )}

      {!war?.active && !isSelf && target && declareCheck && (
        <Section title={`${target.flag} ${countryName(target)}`}>
          <div className="actions">
            <ActionButton
              icon="🔥"
              label={t("ui.act.declare_war")}
              danger
              disabled={!declareCheck.ok}
              detail={declareCheck.ok ? undefined : declareCheck.reason}
              onClick={() => runAction(`war start ${target.id}`)}
            />
          </div>
        </Section>
      )}

      {state.warHistory.length > 0 && (
        <Section title={t("ui.war.history")}>
          {state.warHistory
            .slice(-6)
            .reverse()
            .map((w, i) => {
              const a = getCountryById(state, w.attacker);
              const d = getCountryById(state, w.defender);
              const win = w.winner ? getCountryById(state, w.winner) : undefined;
              return (
                <div className="battle battle--draw" key={i}>
                  <div className="battle__head">
                    <span>
                      {a?.flag} {countryName(a)} {t("ui.war.vs")} {d?.flag} {countryName(d)}
                    </span>
                  </div>
                  <div>
                    {t("war.winner")}: {win ? `${win.flag} ${countryName(win)}` : "—"} · {t("war.losses")}{" "}
                    {w.attackerLosses}/{w.defenderLosses}
                  </div>
                </div>
              );
            })}
        </Section>
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

export default WarPanel;
