import React from "react";
import { useStore } from "../game/store";
import { t, useLanguage } from "../i18n";

/** Width of the character track, in cells. */
const CELLS = 46;

/**
 * The preparation banner shown between picking a nation and playing.
 *
 * The map stays visible underneath — this is a warm-up, not a splash screen.
 * During the countdown the map is forced to draw every layer it will ever need
 * (province borders, region names, the full city roster) so the campaign's
 * first frames are already painted rather than assembling in front of the
 * player.
 */
const StartupBar: React.FC = () => {
  const { ui } = useStore();
  useLanguage();

  if (!ui.startup) return null;
  const { progress, stageKey, secondsLeft } = ui.startup;
  const pct = Math.round(progress * 100);
  const filled = Math.round(progress * CELLS);

  return (
    <div className="startup">
      <div className="startup__panel">
        <div className="startup__title">{t("ui.startup.title")}</div>
        <div className="startup__track" aria-hidden="true">
          <span className="startup__done">{"█".repeat(filled)}</span>
          <span className="startup__todo">{"░".repeat(CELLS - filled)}</span>
        </div>
        <div className="startup__foot">
          <span className="startup__stage">{t(stageKey)}</span>
          <span className="startup__count">
            {secondsLeft}s · {pct}%
          </span>
        </div>
      </div>
    </div>
  );
};

export default StartupBar;
