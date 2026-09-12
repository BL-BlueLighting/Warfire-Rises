import React, { useState } from "react";
import { useStore, pushToast } from "../game/store";
import { getCountryById } from "../game/state";
import {
  BUILDINGS,
  TECHS,
  canBuild,
  canResearch,
  hasTech,
  isResearching,
  buildingCount,
  startBuild,
  startResearch,
  NUKE_PRODUCTION_DAYS,
  type TechCategory,
} from "../game/research";
import { describeReward } from "../game/decisions";
import { Section, Stat, ActionButton } from "../components/shared";
import { t, useLanguage } from "../i18n";

const CATEGORIES: { id: TechCategory; labelKey: string; icon: string }[] = [
  { id: "weapons", labelKey: "ui.research.cat.weapons", icon: "🔫" },
  { id: "industry", labelKey: "ui.research.cat.industry", icon: "🏭" },
  { id: "intelligence", labelKey: "ui.research.cat.intelligence", icon: "📡" },
];

const ResearchPanel: React.FC = () => {
  const { state } = useStore();
  const [cat, setCat] = useState<TechCategory>("weapons");
  useLanguage();

  if (!state) return null;
  const p = getCountryById(state, state.playerCountryId)!;

  const run = (fn: () => { ok: boolean; message: string }) => {
    const res = fn();
    pushToast(res.ok ? "success" : "error", res.message);
  };

  return (
    <>
      <Section title={t("ui.research.title")}>
        <Stat label={t("ui.eco.treasury")} value={`$${p.treasury}B`} color="var(--green)" />
        <Stat label={t("ui.research.done_count")} value={`${p.researched.length + (p.nuclear ? 1 : 0)}/${TECHS.length}`} />
      </Section>

      {/* Nuclear production chain */}
      <Section title={t("ui.nuke.chain")}>
        <Stat label={t("ui.nuke.label")} value={p.nukes} color={p.nukes > 0 ? "var(--red)" : undefined} />
        <Stat
          label={t("ui.research.nuclear_tech")}
          value={hasTech(state, p.id, "nuclear_weapons") ? t("ui.research.unlocked") : t("ui.research.locked")}
          color={hasTech(state, p.id, "nuclear_weapons") ? "var(--green)" : "var(--text-faint)"}
        />
        <Stat
          label={t("ui.nuke.facilities")}
          value={buildingCount(state, p.id, "nuclear_facility")}
        />
        {buildingCount(state, p.id, "nuclear_facility") > 0 && (
          <>
            <Stat
              label={t("ui.nuke.progress")}
              value={`${p.nukeProgress}/${NUKE_PRODUCTION_DAYS}`}
            />
            <div className="bar">
              <i
                style={{
                  width: `${(p.nukeProgress / NUKE_PRODUCTION_DAYS) * 100}%`,
                  background: "var(--red)",
                }}
              />
            </div>
          </>
        )}
        <div className="dim" style={{ fontSize: 10.5, lineHeight: 1.6, marginTop: 4 }}>
          {t("ui.nuke.chain_note")}
          <br />
          <span style={{ color: "var(--red-bright)" }}>{t("ui.nuke.wartime")}</span>
        </div>
      </Section>

      {/* Construction */}
      <Section title={t("ui.build.title")}>
        <div className="actions">
          {BUILDINGS.map((b) => {
            const check = canBuild(state, p.id, b.id);
            const count = buildingCount(state, p.id, b.id);
            return (
              <ActionButton
                key={b.id}
                icon="🏗"
                label={`${t(b.nameKey)}${count > 0 ? ` (${count})` : ""}`}
                cost={`$${b.cost}B`}
                detail={check.ok ? t("ui.task.days", { n: b.days }) : check.reason}
                disabled={!check.ok}
                onClick={() => run(() => startBuild(state, p.id, b.id))}
              />
            );
          })}
        </div>
      </Section>

      {/* Tech tree */}
      <Section title={t("ui.research.tree")}>
        <div className="tabs-row">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              className={`chip${cat === c.id ? " is-active" : ""}`}
              onClick={() => setCat(c.id)}
            >
              {c.icon} {t(c.labelKey)}
            </button>
          ))}
        </div>

        <div className="actions" style={{ marginTop: 10 }}>
          {TECHS.filter((x) => x.category === cat).map((tech) => {
            const done = hasTech(state, p.id, tech.id);
            const busy = isResearching(state, p.id, tech.id);
            const check = canResearch(state, p.id, tech.id);
            const auto = tech.autoForNuclearPowers && p.nuclear;

            return (
              <div className={`tech${done ? " is-done" : ""}`} key={tech.id}>
                <div className="tech__head">
                  <span className="tech__name">{t(tech.nameKey)}</span>
                  {done && <span className="tech__badge">{t("ui.research.done")}</span>}
                  {busy && <span className="tech__badge tech__badge--busy">{t("ui.research.busy")}</span>}
                </div>
                <div className="tech__desc dim">{t(tech.descKey)}</div>
                <div className="decision__rewards">
                  {tech.effects.map((e, i) => (
                    <span className="reward" key={i}>{describeReward(e)}</span>
                  ))}
                </div>
                {!done && (
                  <div style={{ marginTop: 7 }}>
                    <ActionButton
                      icon="🔬"
                      label={t("ui.research.begin")}
                      cost={`$${tech.cost}B`}
                      detail={
                        busy
                          ? t("ui.task.busy")
                          : auto
                          ? t("ui.research.grandfathered")
                          : check.ok
                          ? t("ui.task.days", { n: tech.days })
                          : check.reason
                      }
                      disabled={!check.ok || busy}
                      onClick={() => run(() => startResearch(state, p.id, tech.id))}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>
    </>
  );
};

export default ResearchPanel;
