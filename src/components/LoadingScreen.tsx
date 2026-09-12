import React from "react";
import { useStore } from "../game/store";
import { t, useLanguage } from "../i18n";

const STEPS = ["ui.loading.rates", "ui.loading.news", "ui.loading.sim"];

const LoadingScreen: React.FC = () => {
  const { ui } = useStore();
  useLanguage();

  return (
    <div className="screen">
      <div className="screen__logo" style={{ fontSize: 30, letterSpacing: 5 }}>
        WARFIRE RISES
      </div>
      <div className="screen__logo-cn" style={{ fontSize: 15 }}>
        战 火 升 腾
      </div>

      <div className="screen__rule" />

      <div className="screen__hint" style={{ letterSpacing: "1.5px", color: "var(--gold)" }}>
        {t("ui.loading.title")}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 340 }}>
        {STEPS.map((key, i) => {
          const done = ui.loadingStep > i;
          const active = ui.loadingStep === i;
          return (
            <div key={key} className={`loadstep${done ? " is-done" : ""}${active ? " is-active" : ""}`}>
              <span className="loadstep__mark">{done ? "✔" : active ? "▸" : "·"}</span>
              <span>{t(key)}</span>
            </div>
          );
        })}
      </div>

      <div className="screen__hint">{t("ui.loading.wait")}</div>
    </div>
  );
};

export default LoadingScreen;
