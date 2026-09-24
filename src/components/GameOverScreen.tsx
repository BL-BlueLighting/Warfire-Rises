import React from "react";
import { useStore, succeedTo, quitToTitle } from "../game/store";
import { getCountryById, successorCandidates } from "../game/state";
import { countryName } from "../game/names";
import { t, useLanguage } from "../i18n";
import Flag from "./Flag";

/**
 * Shown when the player's nation has been conquered.
 *
 * Not an ending — the campaign continues. The player picks a successor and
 * takes over the same world on the same day, with the fallen nation left
 * ruined and out of play.
 */
const GameOverScreen: React.FC = () => {
  const { state } = useStore();
  useLanguage();

  if (!state || !state.conquered) return null;

  const record = state.conquered;
  const fallen = getCountryById(state, record.countryId);
  const victor = getCountryById(state, record.by);
  const candidates = successorCandidates(state);

  return (
    <div className="screen screen--conquest">
      <div className="conquest__title">{t("ui.conquest.title")}</div>
      <div className="screen__rule" />

      <div className="gameover__body">
        {t("ui.conquest.body", {
          flag: fallen?.flag ?? "",
          name: countryName(fallen) || record.countryId,
          victorFlag: victor?.flag ?? "",
          victor: countryName(victor) || record.by,
        })}
      </div>

      <div className="gameover__stats">
        <div className="gameover__stat">
          <span className="dim">{t("gameover.days_survived")}</span>
          <b>{record.day}</b>
        </div>
        <div className="gameover__stat">
          <span className="dim">{t("ui.army.divisions")}</span>
          <b style={{ color: "var(--red-bright)" }}>{record.divisionsLost}</b>
        </div>
        <div className="gameover__stat">
          <span className="dim">{t("ui.top.wc")}</span>
          <b style={{ color: "var(--orange)" }}>{state.worldCollapse}%</b>
        </div>
      </div>

      <div className="screen__rule" />

      <div className="conquest__prompt">{t("ui.conquest.pick")}</div>

      {candidates.length === 0 ? (
        <div className="gameover__body">{t("ui.conquest.none_left")}</div>
      ) : (
        <div className="nationgrid conquest__grid">
          {candidates.map((c) => (
            <button key={c.id} className="nationcard" onClick={() => succeedTo(c.id)}>
              <div className="nationcard__top">
                <Flag id={c.id} className="nationcard__flag" />
                <div>
                  <div className="nationcard__name">{countryName(c)}</div>
                  <div className="nationcard__meta">
                    {t(`power.${c.power}`)} · {t(`gov.${c.government}`)}
                    {c.nuclear && " ☢"}
                  </div>
                </div>
              </div>
              <div className="nationcard__stats">
                <span>ECO {c.economy}</span>
                <span>MIL {c.military}</span>
                <span>STB {c.stability}</span>
                <span>{t("ui.army.divisions")} {c.divisions.length}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <button className="btn" style={{ marginTop: 8 }} onClick={quitToTitle}>
        {t("ui.conquest.quit")}
      </button>
    </div>
  );
};

export default GameOverScreen;
