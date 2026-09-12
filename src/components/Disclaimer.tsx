import React from "react";
import { useStore } from "../game/store";
import { useSettings } from "../game/settings";
import { t, useLanguage } from "../i18n";

/**
 * Streaming mode.
 *
 * Two pieces, both driven by one setting: a black card shown before the
 * campaign begins, and a permanent notice pinned to the map afterwards. The
 * text is deliberately blunt — the game puts real heads of state, real borders
 * and nuclear weapons on screen, and a broadcast of it should say plainly that
 * none of what follows is a claim about the world.
 */
export const DisclaimerCard: React.FC = () => {
  const { ui } = useStore();
  useLanguage();

  if (!ui.disclaimer) return null;

  return (
    <div className="disclaimer">
      <div className="disclaimer__inner">
        <div className="disclaimer__rule" />
        <p className="disclaimer__text">{t("ui.disclaimer.text")}</p>
        <div className="disclaimer__rule" />
      </div>
    </div>
  );
};

/** The same notice, kept on the map for the whole campaign. */
export const DisclaimerNotice: React.FC = () => {
  const settings = useSettings();
  useLanguage();

  if (!settings.streamingMode) return null;

  return <div className="disclaimer-corner">{t("ui.disclaimer.text")}</div>;
};

export default DisclaimerCard;
