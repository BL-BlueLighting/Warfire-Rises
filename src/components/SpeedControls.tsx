import React from "react";
import { useStore, changeSpeed, pauseToggle, MAX_SPEED } from "../game/store";
import { SPEED_RATES } from "../game/state";
import { t, useLanguage } from "../i18n";

/** HOI4-style time controls: space to pause, 1-5 to set the speed tier. */
const SpeedControls: React.FC = () => {
  const { state } = useStore();
  useLanguage();

  if (!state) return null;
  const { speed } = state.clock;
  const paused = speed === 0;

  return (
    <div className="speed">
      <button
        className={`speed__pause${paused ? " is-paused" : ""}`}
        onClick={pauseToggle}
        title={t("ui.speed.pause_hint")}
      >
        {paused ? "▶" : "❚❚"}
      </button>
      <div className="speed__ticks">
        {Array.from({ length: MAX_SPEED }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            className={`speed__tick${speed === n ? " is-active" : ""}`}
            onClick={() => changeSpeed(n)}
            title={`${n}× — ${(SPEED_RATES[n]).toFixed(2)} ${t("ui.speed.days_per_sec")}`}
          >
            {"▸".repeat(n)}
          </button>
        ))}
      </div>
      <div className="speed__readout">
        {paused ? t("ui.speed.paused") : `${speed}×`}
      </div>
    </div>
  );
};

export default SpeedControls;
