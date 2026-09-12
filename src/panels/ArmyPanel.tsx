import React, { useState } from "react";
import { useStore, pushToast } from "../game/store";
import { getCountryById } from "../game/state";
import {
  ARMY_MIN_NOTE,
  DIVISION_COST,
  DIVISION_DAYS,
  DIVISION_MANPOWER,
  WAR_MIN_MANPOWER,
  armyManpower,
  armyOrganisation,
  armyStrength,
  availableManpower,
  canRecruit,
  disbandDivision,
  manpowerCap,
  meetsWarManpower,
  startRecruit,
} from "../game/army";
import { Section, Stat, Bar, ActionButton } from "../components/shared";
import { t, useLanguage } from "../i18n";

const ArmyPanel: React.FC = () => {
  const { state } = useStore();
  const [count, setCount] = useState(1);
  useLanguage();

  if (!state) return null;
  const p = getCountryById(state, state.playerCountryId)!;

  const pool = availableManpower(p);
  const cap = manpowerCap(p);
  const committed = armyManpower(p);
  const ready = meetsWarManpower(p);
  const check = canRecruit(state, p.id, count);

  return (
    <>
      <Section title={t("ui.army.title")}>
        <Stat label={t("ui.army.divisions")} value={p.divisions.length} />
        <Stat
          label={t("ui.army.committed")}
          value={`${committed}K`}
          color={ready ? "var(--green)" : "var(--red)"}
        />
        <Bar
          pct={(committed / Math.max(1, WAR_MIN_MANPOWER)) * 100}
          color={ready ? "var(--green)" : "var(--orange)"}
        />
        <div className="dim" style={{ fontSize: 10.5, lineHeight: 1.5, marginBottom: 6 }}>
          {ready
            ? t("ui.army.war_ready")
            : t("ui.army.war_not_ready", { have: committed, need: WAR_MIN_MANPOWER })}
        </div>

        <Stat label={t("ui.army.pool")} value={`${pool}K`} />
        <Stat label={t("ui.army.cap")} value={`${cap}K`} />
        <Bar pct={(pool / Math.max(1, cap)) * 100} color="var(--blue)" />

        <Stat label={t("ui.army.strength")} value={`${armyStrength(p)}%`} />
        <Stat label={t("ui.army.organisation")} value={`${armyOrganisation(p)}%`} />
      </Section>

      <Section title={t("ui.army.recruit")}>
        <div className="tabs-row">
          {[1, 5, 10].map((n) => (
            <button
              key={n}
              className={`chip${count === n ? " is-active" : ""}`}
              onClick={() => setCount(n)}
            >
              ×{n}
            </button>
          ))}
        </div>
        <div className="dim" style={{ fontSize: 10.5, lineHeight: 1.6, margin: "8px 0" }}>
          {t("ui.army.each", { mp: DIVISION_MANPOWER, cost: DIVISION_COST, days: DIVISION_DAYS })}
          <br />
          {t("ui.army.batch", { mp: DIVISION_MANPOWER * count, cost: DIVISION_COST * count, days: DIVISION_DAYS * count })}
        </div>
        <ActionButton
          icon="🎖"
          label={t("ui.army.recruit_n", { n: count })}
          cost={`${DIVISION_MANPOWER * count}K · $${DIVISION_COST * count}B`}
          detail={check.ok ? t("ui.task.days", { n: DIVISION_DAYS * count }) : check.reason}
          disabled={!check.ok}
          onClick={() => {
            const res = startRecruit(state, p.id, count);
            pushToast(res.ok ? "success" : "error", res.message);
          }}
        />
        <div className="dim" style={{ fontSize: 10, lineHeight: 1.55, marginTop: 8 }}>
          {t(ARMY_MIN_NOTE)}
        </div>
      </Section>

      <Section title={`${t("ui.army.order_of_battle")} (${p.divisions.length})`}>
        {p.divisions.length === 0 && <div className="panel__empty">{t("ui.army.no_divisions")}</div>}
        {p.divisions.map((d) => (
          <div className="division" key={d.id}>
            <div className="division__head">
              <span className="division__name">{d.name}</span>
              <span className="division__mp">{d.manpower}K</span>
              <button
                className="task__cancel"
                title={t("ui.army.disband")}
                onClick={() => {
                  const res = disbandDivision(state, p.id, d.id);
                  pushToast(res.ok ? "info" : "error", res.message);
                }}
              >
                ✕
              </button>
            </div>
            <div className="division__bars">
              <div className="division__bar" title={t("ui.army.strength")}>
                <i style={{ width: `${d.strength}%`, background: "var(--green)" }} />
              </div>
              <div className="division__bar" title={t("ui.army.organisation")}>
                <i style={{ width: `${d.organisation}%`, background: "var(--blue)" }} />
              </div>
            </div>
          </div>
        ))}
      </Section>
    </>
  );
};

export default ArmyPanel;
