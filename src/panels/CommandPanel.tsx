import React from "react";
import { useStore, pushToast, attemptArmyChange } from "../game/store";
import { getCountryById } from "../game/state";
import {
  ORDERS,
  assignDivision,
  commandBonus,
  createGroup,
  disbandGroup,
  divisionsOf,
  entrenchmentRate,
  findGeneral,
  removeDivision,
  unassigned,
} from "../game/command";
import { Section, Stat, Bar, ActionButton } from "../components/shared";
import { t, useLanguage } from "../i18n";
import type { ArmyGroup } from "../game/types";

/** Five pips, filled to the general's rating. */
const Pips: React.FC<{ n: number }> = ({ n }) => (
  <span className="pips">
    {Array.from({ length: 5 }, (_, i) => (
      <i key={i} className={i < n ? "is-on" : ""} />
    ))}
  </span>
);

const CommandPanel: React.FC = () => {
  const { state } = useStore();
  useLanguage();

  if (!state) return null;
  const p = getCountryById(state, state.playerCountryId)!;
  const bonus = commandBonus(p);
  const spare = unassigned(p);

  const commit = (n: number) => {
    createGroup(p, p.armyGroups.length + 1);
    pushToast("info", t("ui.command.created", { n }));
  };

  return (
    <>
      {p.autoArmy && (
        <div className="staff-banner">
          <span className="staff-banner__mark">★</span>
          <span>{t("ui.command.staff_on")}</span>
        </div>
      )}

      <Section title={t("ui.command.title")}>
        <Stat label={t("ui.army.divisions")} value={p.divisions.length} />
        <Stat label={t("ui.command.generals")} value={p.generals.length} />
        <Stat
          label={t("ui.command.attack_bonus")}
          value={`×${bonus.attack.toFixed(2)}`}
          color={bonus.attack >= 1.1 ? "var(--green)" : undefined}
        />
        <Stat
          label={t("ui.command.defense_bonus")}
          value={`×${bonus.defense.toFixed(2)}`}
          color={bonus.defense >= 1.1 ? "var(--green)" : undefined}
        />
        <Stat label={t("ui.command.planning")} value={`×${entrenchmentRate(p).toFixed(2)}`} />
        <div className="dim" style={{ fontSize: 10.5, marginTop: 6, lineHeight: 1.55 }}>
          {t("ui.command.note")}
        </div>
      </Section>

      {p.armyGroups.map((group: ArmyGroup) => {
        const general = findGeneral(p, group.generalId);
        const divs = divisionsOf(p, group);
        const ready = divs.filter((d) => d.organisation > 0 && d.strength > 0).length;
        return (
          <div className="group" key={group.id}>
            <div className="group__head">
              <span className="group__name">{t(group.nameKey, group.nameParams)}</span>
              <span className="group__count">
                {ready}/{divs.length} {t("ui.army.divisions")}
              </span>
              {p.armyGroups.length > 1 && (
                <button
                  className="task__cancel"
                  onClick={() => attemptArmyChange(() => disbandGroup(p, group.id))}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Commander */}
            <div className="group__row">
              <span className="dim">{t("ui.command.commander")}</span>
              <select
                className="group__select"
                value={group.generalId ?? ""}
                onChange={(e) => {
                  const id = e.target.value === "" ? null : Number(e.target.value);
                  attemptArmyChange(() => {
                    group.generalId = id;
                    pushToast("info", t("ui.command.assigned"));
                  });
                }}
              >
                <option value="">{t("ui.command.no_commander")}</option>
                {p.generals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} · {t("ui.command.atk")}{g.attack} {t("ui.command.def")}{g.defense}{" "}
                    {t("ui.command.plan")}{g.planning}
                  </option>
                ))}
              </select>
            </div>
            {general && (
              <div className="group__skills">
                <span>
                  {t("ui.command.atk")} <Pips n={general.attack} />
                </span>
                <span>
                  {t("ui.command.def")} <Pips n={general.defense} />
                </span>
                <span>
                  {t("ui.command.plan")} <Pips n={general.planning} />
                </span>
              </div>
            )}

            {/* Order */}
            <div className="group__orders">
              {ORDERS.map((o) => (
                <button
                  key={o.id}
                  className={`chip${group.order === o.id ? " is-active" : ""}`}
                  title={t(o.hintKey)}
                  onClick={() =>
                    attemptArmyChange(() => {
                      group.order = o.id;
                      pushToast("info", t("ui.command.ordered", { name: t(o.labelKey) }));
                    })
                  }
                >
                  {t(o.labelKey)}
                </button>
              ))}
            </div>

            {/* Divisions in this group */}
            <div className="group__divisions">
              {divs.length === 0 && <div className="dim" style={{ fontSize: 10.5 }}>{t("ui.command.empty_group")}</div>}
              {divs.map((d) => (
                <div className="group__div" key={d.id}>
                  <span className="group__div-name">{d.name}</span>
                  <span className="group__div-org">
                    <span className="bar bar--inline">
                      <i style={{ width: `${d.organisation}%`, background: "var(--blue)" }} />
                    </span>
                  </span>
                  <button
                    className="task__cancel"
                    onClick={() => attemptArmyChange(() => removeDivision(p, d.id))}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div style={{ marginTop: 8 }}>
        <ActionButton
          icon="➕"
          label={t("ui.command.new_group")}
          onClick={() => attemptArmyChange(() => commit(p.armyGroups.length + 1))}
        />
      </div>

      {spare.length > 0 && (
        <Section title={`${t("ui.command.unassigned")} (${spare.length})`}>
          {spare.map((d) => (
            <div className="group__div" key={d.id}>
              <span className="group__div-name">{d.name}</span>
              <select
                className="group__select group__select--sm"
                value=""
                onChange={(e) => {
                  const gid = Number(e.target.value);
                  if (gid) attemptArmyChange(() => assignDivision(p, gid, d.id));
                }}
              >
                <option value="">{t("ui.command.send_to")}</option>
                {p.armyGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {t(g.nameKey, g.nameParams)}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </Section>
      )}

      <Section title={t("ui.command.ready")}>
        <Stat label={t("ui.command.in_the_line")} value={p.divisions.filter((d) => d.organisation > 0).length} />
        <Bar
          pct={(p.divisions.filter((d) => d.organisation > 0).length / Math.max(1, p.divisions.length)) * 100}
          color="var(--green)"
        />
      </Section>
    </>
  );
};

export default CommandPanel;
