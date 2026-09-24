import React, { useMemo } from "react";
import { useStore, closeConferenceNow } from "../game/store";
import { getCountryById } from "../game/state";
import { claim, claimAll, remaining } from "../game/peace";
import { REGIONS } from "../map/provinces";
import { PALETTE, relationBucket, RELATION_COLORS } from "../map/colors";
import { countryName } from "../game/names";
import { t, useLanguage } from "../i18n";
import Flag from "./Flag";

/**
 * The peace conference.
 *
 * Shown when the player's side has conquered a nation: its regions are laid out
 * and divided. Every region costs one point, and the player's budget is their
 * share of the fighting — allies at the table spend theirs automatically.
 */
const PeaceConference: React.FC = () => {
  const { state } = useStore();
  const lang = useLanguage();

  const conference = state?.conference;
  const regions = useMemo(
    () => (conference ? REGIONS.get(conference.conquered) ?? [] : []),
    [conference?.conquered]
  );

  if (!state || !conference?.active) return null;

  const conquered = getCountryById(state, conference.conquered);
  const mine = remaining(conference, state.playerCountryId);
  const mySeat = conference.participants.find((p) => p.countryId === state.playerCountryId);
  const claimedByMe = Object.values(conference.claims).filter(
    (c) => c === state.playerCountryId
  ).length;

  const colourFor = (countryId: string) =>
    countryId === state.playerCountryId
      ? PALETTE.player
      : RELATION_COLORS[relationBucket(getCountryById(state, countryId)?.relations[state.playerCountryId] ?? 0)];

  return (
    <div className="modal-backdrop">
      <div className="modal modal--peace" onClick={(e) => e.stopPropagation()}>
        <div className="modal__title">{t("ui.peace.title")}</div>

        <div className="peace__sub">
          {t("ui.peace.subject", {
            flag: conquered?.flag ?? "",
            name: countryName(conquered) || conference.conquered,
          })}
        </div>

        {/* Who is at the table, and what they have left to spend */}
        <div className="peace__seats">
          {conference.participants.map((seat) => {
            const c = getCountryById(state, seat.countryId);
            const left = remaining(conference, seat.countryId);
            return (
              <div
                className={`peace__seat${seat.countryId === state.playerCountryId ? " is-mine" : ""}`}
                key={seat.countryId}
              >
                <span className="peace__swatch" style={{ background: colourFor(seat.countryId) }} />
                <span className="peace__seat-name">{countryName(c) || seat.countryId}</span>
                <span className="peace__seat-score">
                  {left}/{seat.score}
                </span>
              </div>
            );
          })}
        </div>

        {!mySeat && (
          <div className="peace__note">{t("ui.peace.no_seat")}</div>
        )}

        <div className="peace__prompt">
          {t("ui.peace.prompt", { mine, claimed: claimedByMe, total: conference.pool.length })}
        </div>

        {/* The regions on the table */}
        <div className="peace__pool">
          {regions.map((region) => {
            const takenBy = conference.claims[region.id];
            const affordable = !takenBy && mine > 0;
            return (
              <button
                key={region.id}
                className={`peace__region${takenBy ? " is-taken" : ""}${
                  takenBy === state.playerCountryId ? " is-mine" : ""
                }`}
                style={takenBy ? { borderLeftColor: colourFor(takenBy) } : undefined}
                disabled={!affordable}
                title={
                  takenBy
                    ? t("ui.peace.taken_by", {
                        name: countryName(getCountryById(state, takenBy)) || takenBy,
                      })
                    : t("ui.peace.click_claim")
                }
                onClick={() => claim(conference, region.id, state.playerCountryId)}
              >
                <span className="peace__region-name">{lang === "zh-cn" ? region.zh : region.en}</span>
                {takenBy && (
                  <span className="peace__region-owner" style={{ color: colourFor(takenBy) }}>
                    <Flag id={takenBy} />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="modal__actions" style={{ marginTop: 14 }}>
          <button className="btn" onClick={() => claimAll(conference, state.playerCountryId)}>
            {t("ui.peace.claim_all")}
          </button>
          <button className="btn btn--primary" onClick={() => closeConferenceNow()}>
            {t("ui.peace.finish")}
          </button>
        </div>

        <div className="dim" style={{ fontSize: 10.5, marginTop: 10, lineHeight: 1.55 }}>
          {t("ui.peace.note")}
        </div>
      </div>
    </div>
  );
};

export default PeaceConference;
