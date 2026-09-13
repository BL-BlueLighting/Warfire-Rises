import React from "react";
import { useStore, closeSettings, toggleDecisionFile, refreshDecisionCatalog } from "../game/store";
import {
  BASE_DECISION_FILE_NAME,
  SETTING_ROWS,
  DISCLAIMER_ROWS,
  useSettings,
  setSetting,
  resetSettings,
} from "../game/settings";
import { DIFFICULTIES, difficultyProfile } from "../game/difficulty";
import { t, useLanguage } from "../i18n";

/**
 * Everything the game is built out of, with the people and licences behind it.
 *
 * Mirrors `package.json`, `src-tauri/Cargo.toml` and `NOTICE.md`; those files
 * stay the source of truth, this is the copy the player can actually read.
 */
const LIBRARIES: { name: string; author: string; url: string; licence: string }[] = [
  { name: "React", author: "Meta · React contributors", url: "github.com/facebook/react", licence: "MIT" },
  { name: "OpenLayers", author: "OpenLayers contributors · OSGeo", url: "github.com/openlayers/openlayers", licence: "BSD-2-Clause" },
  { name: "d3-geo", author: "Mike Bostock", url: "github.com/d3/d3-geo", licence: "ISC" },
  { name: "topojson-client", author: "Mike Bostock", url: "github.com/topojson/topojson-client", licence: "ISC" },
  { name: "world-atlas", author: "Mike Bostock", url: "github.com/topojson/world-atlas", licence: "ISC" },
  { name: "Tauri", author: "Tauri Programme · Commons Conservancy", url: "github.com/tauri-apps/tauri", licence: "MIT / Apache-2.0" },
  { name: "reqwest", author: "Sean McArthur", url: "github.com/seanmonstar/reqwest", licence: "MIT / Apache-2.0" },
  { name: "serde · serde_json", author: "David Tolnay · Erick Tryzelaar", url: "github.com/serde-rs/serde", licence: "MIT / Apache-2.0" },
  { name: "Vite", author: "Evan You · Vite contributors", url: "github.com/vitejs/vite", licence: "MIT" },
  { name: "TypeScript", author: "Microsoft", url: "github.com/microsoft/TypeScript", licence: "Apache-2.0" },
];

/** Display preferences. Difficulty is chosen per campaign, so it is shown read-only here. */
const SettingsDialog: React.FC = () => {
  const { state, ui } = useStore();
  const settings = useSettings();
  useLanguage();
  const catalog = ui.decisionCatalog;

  // Opening the dialog is the first chance the title screen has to know what
  // files exist; a refresh from `openSettings` may still be in flight.
  React.useEffect(() => {
    if (ui.settingsOpen && !state && catalog.length === 0) void refreshDecisionCatalog();
  }, [ui.settingsOpen, state, catalog.length]);

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

        {/* Decision files can only be switched while no campaign is running:
            they are read once at startup, and a campaign's history refers to
            the decisions it was played with. */}
        {!state && (
          <>
            <div className="section__title" style={{ marginTop: 16 }}>
              {t("ui.settings.decision_files")}
            </div>
            <div className="settings-list">
              {catalog.length === 0 && (
                <div className="dim" style={{ fontSize: 11 }}>
                  {t("ui.settings.decisions_loading")}
                </div>
              )}
              {catalog.map((file) => {
                const locked = file.name === BASE_DECISION_FILE_NAME;
                const enabled = locked || !settings.disabledDecisionFiles.includes(file.name);
                return (
                  <label className="setting" key={file.name} title={file.name}>
                    <input
                      type="checkbox"
                      checked={enabled}
                      disabled={locked}
                      onChange={(e) => toggleDecisionFile(file.name, e.target.checked)}
                    />
                    <span className="setting__box" aria-hidden="true" />
                    <span className="setting__label">
                      {file.name}
                      <span className="setting__note">
                        {t("ui.settings.decisions_count", { n: file.decisions, news: file.news })}
                        {locked ? t("ui.settings.decisions_locked") : ""}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="dim" style={{ fontSize: 10.5, marginTop: 6, lineHeight: 1.6 }}>
              {t("ui.settings.decisions_note")}
            </div>
          </>
        )}

        <div className="dim" style={{ fontSize: 10.5, marginTop: 12, lineHeight: 1.6 }}>
          {t("ui.settings.persist_note")}
        </div>

        {/* ── About ── */}
        <div className="section__title" style={{ marginTop: 16 }}>
          {t("ui.about.title")}
        </div>
        <div className="about">
          <img className="about__logo" src="/logo.png" alt="WARFIRE RISES" />
          <div className="about__name">WARFIRE RISES</div>
          <div className="about__name-cn">战火升腾</div>
          <div className="about__line">{t("ui.about.by")}</div>
          <div className="about__line">{t("ui.about.engine")}</div>

          <div className="about__sub">{t("ui.about.libraries")}</div>
          <ul className="about__libs">
            {LIBRARIES.map((lib) => (
              <li key={lib.name}>
                <span className="about__lib-name">{lib.name}</span>
                <span className="about__lib-author">{lib.author}</span>
                {/* Plain text, not a link: the webview has no opener wired up,
                    so an anchor would look clickable and do nothing. */}
                <span className="about__lib-url">{lib.url}</span>
                <span className="about__lib-licence">{lib.licence}</span>
              </li>
            ))}
          </ul>
          <div className="about__note">{t("ui.about.assets")}</div>

          <div className="about__thanks">{t("ui.about.thanks")}</div>
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
