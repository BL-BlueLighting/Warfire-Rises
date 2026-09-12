import React from "react";
import { useStore, closeSettings } from "../game/store";
import { SETTING_ROWS, DISCLAIMER_ROWS, useSettings, setSetting, resetSettings } from "../game/settings";
import { DIFFICULTIES, difficultyProfile } from "../game/difficulty";
import { t, useLanguage } from "../i18n";

/** Display preferences. Difficulty is chosen per campaign, so it is shown read-only here. */
const SettingsDialog: React.FC = () => {
  const { state, ui } = useStore();
  const settings = useSettings();
  useLanguage();

  if (!ui.settingsOpen) return null;
  const profile = state ? difficultyProfile(state.difficulty) : null;

  return (
    <div className="modal-backdrop" onClick={closeSettings}>
      <div className="modal modal--settings" onClick={(e) => e.stopPropagation()}>
        <div className="modal__title">{t("ui.settings.title")}</div>

        <div className="section__title">{t("ui.settings.map_labels")}</div>
        <div className="settings-list">
          {SETTING_ROWS.map((row) => (
            <label className="setting" key={row.key}>
              <input
                type="checkbox"
                checked={settings[row.key]}
                onChange={(e) => setSetting(row.key, e.target.checked)}
              />
              <span className="setting__box" aria-hidden="true" />
              <span className="setting__label">{t(row.labelKey)}</span>
            </label>
          ))}
        </div>

        <div className="section__title" style={{ marginTop: 16 }}>
          {t("ui.settings.streaming")}
        </div>
        <div className="settings-list">
          {DISCLAIMER_ROWS.map((row) => (
            <label className="setting" key={row.key}>
              <input
                type="checkbox"
                checked={settings[row.key]}
                onChange={(e) => setSetting(row.key, e.target.checked)}
              />
              <span className="setting__box" aria-hidden="true" />
              <span className="setting__label">
                {t(row.labelKey)}
                <span className="setting__note">{t("ui.settings.streaming_note")}</span>
              </span>
            </label>
          ))}
        </div>

        {profile && (
          <>
            <div className="section__title" style={{ marginTop: 16 }}>
              {t("ui.settings.difficulty")}
            </div>
            <div className="setting setting--static">
              <span className="setting__label">{t(profile.nameKey)}</span>
              <span className="dim" style={{ fontSize: 11 }}>
                {t("ui.settings.difficulty_note")}
              </span>
            </div>
          </>
        )}

        <div className="dim" style={{ fontSize: 10.5, marginTop: 12, lineHeight: 1.6 }}>
          {t("ui.settings.persist_note")}
        </div>

        <div className="modal__actions" style={{ marginTop: 18 }}>
          <button className="btn" onClick={resetSettings}>
            {t("ui.settings.reset")}
          </button>
          <button className="btn btn--primary" onClick={closeSettings}>
            {t("ui.btn.close")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsDialog;

/** Shared by the title screen, which offers the same five tiers. */
export const DifficultyPicker: React.FC<{
  value: string;
  onChange: (id: string) => void;
}> = ({ value, onChange }) => (
  <div className="diffpicker">
    {DIFFICULTIES.map((d) => (
      <button
        key={d.id}
        className={`diffcard${value === d.id ? " is-active" : ""}`}
        onClick={() => onChange(d.id)}
      >
        <span className="diffcard__name">{t(d.nameKey)}</span>
        <span className="diffcard__desc">{t(d.descKey)}</span>
      </button>
    ))}
  </div>
);
