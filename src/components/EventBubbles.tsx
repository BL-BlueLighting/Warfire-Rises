import React from "react";
import { useStore, dismissBubble } from "../game/store";
import { getCountryById } from "../game/state";
import { countryName } from "../game/names";
import { t, useLanguage } from "../i18n";

/**
 * Notifications pinned to the map's bottom-right corner.
 *
 * Both world events and AI actions land here. They are deliberately transient:
 * each lives 30 seconds, and a right-click dismisses it permanently — nothing
 * is archived or re-shown. The full history lives in the Log panel.
 */
const EventBubbles: React.FC = () => {
  const { state, ui } = useStore();
  useLanguage();

  if (ui.bubbles.length === 0) return null;

  return (
    <div className={`bubbles${ui.consoleOpen ? " is-console" : ""}`}>
      {ui.bubbles.map((b) => {
        const affected =
          b.countryIds && state
            ? b.countryIds
                .map((id) => countryName(getCountryById(state, id)) || id)
                .join(", ")
            : "";

        return (
          <div
            className={`bubble bubble--${b.kind}`}
            key={b.id}
            style={{ borderLeftColor: b.color }}
            onContextMenu={(e) => {
              e.preventDefault();
              dismissBubble(b.id);
            }}
            title={t("ui.bubble.dismiss_hint")}
          >
            <div className="bubble__head">
              <span className="bubble__type">
                {b.icon} {t(b.labelKey)}
              </span>
              {state && <span className="bubble__day">{t("ui.log.event_day", { day: state.day })}</span>}
            </div>
            <div className="bubble__title">{b.title}</div>
            {b.body && <div className="bubble__desc">{b.body}</div>}
            {(affected || b.wc !== undefined) && (
              <div className="bubble__foot">
                <span>{affected}</span>
                {b.wc !== undefined && (
                  <span className="bubble__wc">
                    WC {b.wc > 0 ? "+" : ""}
                    {b.wc}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default EventBubbles;
