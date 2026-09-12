import React from "react";
import { useStore, selectCountry } from "../game/store";
import { getCountryById, getPlayerCountry, relationStatus } from "../game/state";
import { getAttitude } from "../game/types";
import { Section, Stat, Bar, NationRow } from "../components/shared";
import TimedAction from "../components/TimedAction";
import { getAction, justifyDays } from "../game/actions";
import { PALETTE, relationBucket, RELATION_COLORS } from "../map/colors";
import { t, useLanguage } from "../i18n";
import { countryName } from "../game/names";

const DIPLO_COST = 10;

const DiplomacyPanel: React.FC = () => {
  const { state, ui } = useStore();
  useLanguage();

  if (!state) return null;

  const player = getPlayerCountry(state);
  const selectedId = ui.selectedCountryId ?? state.playerCountryId;
  const target = getCountryById(state, selectedId);
  const isSelf = !target || target.id === state.playerCountryId;

  const others = state.countries
    .filter((c) => c.id !== state.playerCountryId && !c.destroyed)
    .sort((a, b) => (b.relations[state.playerCountryId] ?? 0) - (a.relations[state.playerCountryId] ?? 0));

  const relation = target ? target.relations[state.playerCountryId] ?? 0 : 0;
  const attitude = getAttitude(relation);

  return (
    <>
      {!isSelf && target && (
        <>
          <Section title={t("ui.diplo.title")}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 28 }}>{target.flag}</span>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--gold-bright)" }}>{countryName(target)}</div>
                <div className="dim" style={{ fontSize: 11 }}>
                  {t(`gov.${target.government}`)} · {t(`power.${target.power}`)}
                </div>
              </div>
            </div>
            <Stat
              label={t("ui.diplo.relation")}
              value={`${relation > 0 ? "+" : ""}${relation}`}
              color={RELATION_COLORS[relationBucket(relation)]}
            />
            <Bar pct={(relation + 100) / 2} color={RELATION_COLORS[relationBucket(relation)]} />
            <Stat label={t("ui.diplo.attitude")} value={t(`att.${attitude}`)} color="var(--gold)" />
            <Stat label={t("ui.diplo.status")} value={t(`rel.${relationStatus(relation)}`)} />
            {target.atWarWith.includes(state.playerCountryId) && (
              <div style={{ color: "var(--red-bright)", fontWeight: 700, fontSize: 11, marginTop: 6 }}>
                ⚔ {t("ui.legend.war")}
              </div>
            )}
          </Section>

          <Section title={t("ui.diplo.shared_allies")}>
            <div className="dim" style={{ fontSize: 11.5, lineHeight: 1.6 }}>
              {target.allies.filter((a) => player.allies.includes(a)).length > 0
                ? target.allies
                    .filter((a) => player.allies.includes(a))
                    .map((a) => countryName(getCountryById(state, a)) || a)
                    .join(", ")
                : t("common.none")}
            </div>
          </Section>

          <Section title={t("ui.diplo.their_relations")}>
            {Object.entries(target.relations)
              .filter(([id]) => id !== state.playerCountryId)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 5)
              .map(([id, rel]) => (
                <Stat
                  key={id}
                  label={countryName(getCountryById(state, id)) || id}
                  value={String(rel)}
                  color={rel >= 0 ? PALETTE.friendly : PALETTE.hostile}
                />
              ))}
          </Section>

          <Section title={t("ui.tab.diplomacy")}>
            <div className="actions">
              {["dip.improve", "dip.treaty", "dip.sanction", "dip.condemn"].map((id) => {
                const def = getAction(id)!;
                return <TimedAction key={id} def={def} actorId={state.playerCountryId} targetId={target.id} />;
              })}
            </div>
            <div className="dim" style={{ fontSize: 10.5, marginTop: 8, lineHeight: 1.5 }}>
              {t("ui.diplo.cost_note", { cost: DIPLO_COST })}
            </div>
          </Section>

          <Section title={t("ui.justify.title")}>
            <TimedAction def={getAction("dip.justify")!} actorId={state.playerCountryId} targetId={target.id} />
            <div className="dim" style={{ fontSize: 10.5, marginTop: 8, lineHeight: 1.6 }}>
              {t("ui.justify.note", { days: justifyDays(relation) })}
            </div>
          </Section>
        </>
      )}

      {isSelf && (
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

export default DiplomacyPanel;
