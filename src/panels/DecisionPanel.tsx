import React, { useState } from "react";
import { useStore, availableDecisions, reloadDecisions, selectCountry } from "../game/store";
import { getCountryById } from "../game/state";
import {
  decisionDuration,
  decisionInProgress,
  describeReward,
  meetsRequirements,
  phaseRewards,
  resultRewards,
  startDecision,
  type DecisionDef,
} from "../game/decisions";
import { Section, ActionButton } from "../components/shared";
import { t, useLanguage } from "../i18n";

const DecisionPanel: React.FC = () => {
  const { state, ui } = useStore();
  const [expanded, setExpanded] = useState<string | null>(null);
  useLanguage();

  if (!state) return null;

  const playerId = state.playerCountryId;
  const decisions = availableDecisions(playerId);

  // Decisions whose requirements reference `To: "target"` need a counterpart.
  const needsTarget = (d: DecisionDef) =>
    (d.Require ?? []).some(
      (r) => String(r.Type).toLowerCase() === "relation" && String(r.To ?? "").toLowerCase() === "target"
    );
  const targetId = ui.selectedCountryId ?? undefined;
  const target = targetId ? getCountryById(state, targetId) : undefined;

  return (
    <>
      <Section title={t("ui.decision.title")}>
        <div className="dim" style={{ fontSize: 11, lineHeight: 1.6, marginBottom: 8 }}>
          {t("ui.decision.intro", { n: decisions.length })}
          {" · "}
          <span
            className="mono"
            style={{ cursor: "pointer", color: "var(--blue)" }}
            onClick={() => void reloadDecisions()}
          >
            {t("ui.decision.reload")}
          </span>
        </div>
        {ui.decisionErrors.length > 0 && (
          <div className="dec-error">
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              ⚠ {t("ui.decision.errors", { n: ui.decisionErrors.length })}
            </div>
            {ui.decisionErrors.map((e, i) => (
              <div key={i} className="mono" style={{ fontSize: 10.5, lineHeight: 1.5 }}>
                {e.source}: {e.message}
              </div>
            ))}
          </div>
        )}
      </Section>

      {decisions.length === 0 && (
        <div className="panel__empty">{t("ui.decision.none")}</div>
      )}

      {decisions.map((d) => {
        const id = d.__id ?? d.Name;
        const isInf = d.Time === "inf";
        const running = decisionInProgress(state, id);
        const { ok, checks } = meetsRequirements(state, playerId, d, targetId);
        const days = decisionDuration(d, state);
        const runtime = state.decisionStates[id];
        const phases = d.InfinityPhases ?? [];
        const phaseIndex = (runtime?.phaseIndex ?? 0) % Math.max(1, phases.length);
        const open = expanded === id;
        const requiresTarget = needsTarget(d);

        return (
          <div className={`decision${running ? " is-running" : ""}`} key={id}>
            <button className="decision__head" onClick={() => setExpanded(open ? null : id)}>
              <span className="decision__icon">{isInf ? "♾" : "📜"}</span>
              <span className="decision__name">{d.Name}</span>
              <span className="decision__meta">
                {isInf ? t("ui.decision.infinite") : t("ui.task.days", { n: days })}
              </span>
              <span className="decision__chevron">{open ? "▾" : "▸"}</span>
            </button>

            {open && (
              <div className="decision__body">
                <div className="decision__desc">{d.Description}</div>

                {requiresTarget && (
                  <div className="decision__target">
                    <span className="dim">{t("ui.decision.target")}: </span>
                    {target ? (
                      <span>
                        {target.flag} {target.name}{" "}
                        <span
                          className="mono"
                          style={{ color: "var(--blue)", cursor: "pointer" }}
                          onClick={() => selectCountry(null)}
                        >
                          ({t("ui.decision.clear_target")})
                        </span>
                      </span>
                    ) : (
                      <span style={{ color: "var(--orange)" }}>{t("ui.decision.pick_target")}</span>
                    )}
                  </div>
                )}

                {checks.length > 0 && (
                  <div className="decision__reqs">
                    <div className="decision__sub">{t("ui.req.title")}</div>
                    {checks.map((c, i) => (
                      <div className={`req${c.ok ? " is-ok" : ""}`} key={i}>
                        <span className="req__mark">{c.ok ? "✔" : "✘"}</span>
                        <span className="req__label">{c.label}</span>
                        {c.current !== undefined && (
                          <span className="req__cur">{t("ui.req.current", { n: c.current })}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {isInf && phases.length > 0 && (
                  <div className="decision__phase">
                    <div className="decision__sub">
                      {t("ui.decision.phase")} {phaseIndex + 1}/{phases.length}
                      {runtime?.completed ? ` · ${t("ui.decision.completed_n", { n: runtime.completed })}` : ""}
                    </div>
                    <div className="dim" style={{ fontSize: 11, whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
                      {phases[phaseIndex]?.Content}
                    </div>
                    <div className="decision__rewards" style={{ marginTop: 6 }}>
                      {phaseRewards(phases[phaseIndex]).map((r, i) => (
                        <span className="reward" key={i}>{describeReward(r)}</span>
                      ))}
                    </div>
                  </div>
                )}

                {!isInf && resultRewards(d).length > 0 && (
                  <div className="decision__rewards">
                    {resultRewards(d).map((r, i) => (
                      <span className="reward" key={i}>{describeReward(r)}</span>
                    ))}
                  </div>
                )}

                <div style={{ marginTop: 9 }}>
                  <ActionButton
                    icon={isInf ? "♾" : "▶"}
                    label={
                      running
                        ? t("ui.decision.running")
                        : isInf
                        ? t("ui.decision.start_phase")
                        : t("ui.decision.start")
                    }
                    cost={t("ui.task.days", { n: days })}
                    disabled={!ok || Boolean(running) || (requiresTarget && !target)}
                    detail={
                      running
                        ? undefined
                        : !ok
                        ? t("ui.req.unmet")
                        : requiresTarget && !target
                        ? t("ui.decision.pick_target")
                        : undefined
                    }
                    onClick={() => startDecision(state, d, playerId)}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}

      <Section title={t("ui.decision.about")}>
        <div className="dim" style={{ fontSize: 10.5, lineHeight: 1.6 }}>
          {t("ui.decision.about_body", { dir: "decisions/" })}
        </div>
        <div className="dim mono" style={{ fontSize: 10, marginTop: 6 }}>
          {t("ui.decision.source")}: {ui.decisionSource}
        </div>
      </Section>
    </>
  );
};

export default DecisionPanel;
