import React, { useEffect, useState } from "react";
import { COUNTRIES, getCountry } from "../game/countries";
import { newGame, loadGame, useStore, openSettings } from "../game/store";
import { hasSave } from "../game/save";
import { previewColorMap } from "../map/colors";
import { DIFFICULTIES, DEFAULT_DIFFICULTY, type Difficulty } from "../game/difficulty";
import { countryName } from "../game/names";
import { t, useLanguage, setLanguage, type Language } from "../i18n";
import WorldMap from "../map/WorldMap";

/**
 * Campaign setup.
 *
 * The world map is the nation picker — clicking a country selects it, and the
 * map recolours to show the world from that nation's point of view. Difficulty
 * is chosen alongside it, because both have to be settled before the campaign
 * begins; making them two screens would be two decisions where there is one.
 */
const TitleScreen: React.FC = () => {
  const { ui } = useStore();
  const lang = useLanguage();
  const [selected, setSelected] = useState("USA");
  const [difficulty, setDifficulty] = useState<Difficulty>(DEFAULT_DIFFICULTY);
  const [saveAvailable, setSaveAvailable] = useState(false);

  useEffect(() => {
    void hasSave().then(setSaveAvailable);
  }, []);

  const nextLang: Language = lang === "zh-cn" ? "en-us" : "zh-cn";
  const country = getCountry(selected) ?? COUNTRIES[0];
  const profile = DIFFICULTIES.find((d) => d.id === difficulty)!;
  // Sorted by starting relation, so a nation's friends and rivals are legible
  // before committing to it.
  const neighbours = COUNTRIES.filter((c) => c.id !== country.id).sort(
    (a, b) => (country.relations[b.id] ?? 0) - (country.relations[a.id] ?? 0)
  );

  return (
    <div className="title-screen">
      <div className="title-screen__map">
        <WorldMap
          preview={{
            colors: previewColorMap(selected),
            selectedId: selected,
            onSelect: setSelected,
            // While preparing, draw every layer so it is rasterised before play.
            warm: Boolean(ui.startup),
          }}
        />
      </div>

      <header className="title-screen__bar">
        <img className="title-screen__logo" src="/logo.png" alt="WARFIRE RISES" />
        {!ui.startup && (
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn--sm" onClick={openSettings} title={t("ui.settings.title")}>
              ⚙ {t("ui.settings.title")}
            </button>
            <button className="btn btn--sm" onClick={() => setLanguage(nextLang)}>
              {nextLang === "zh-cn" ? "中文" : "English"}
            </button>
          </div>
        )}
      </header>

      {!ui.startup && (
        <aside className="title-panel title-panel--left">
        <div className="section__title">{t("ui.title.difficulty")}</div>
        <div className="diffpicker">
          {DIFFICULTIES.map((d) => (
            <button
              key={d.id}
              className={`diffcard${difficulty === d.id ? " is-active" : ""}`}
              onClick={() => setDifficulty(d.id)}
            >
              <span className="diffcard__name">{t(d.nameKey)}</span>
              <span className="diffcard__desc">{t(d.descKey)}</span>
            </button>
          ))}
        </div>

        <div className="diffstats">
          {(
            [
              ["ui.settings.stat_events", profile.eventChance],
              ["ui.settings.stat_wars", profile.warChance],
              ["ui.settings.stat_collapse", profile.collapseRate],
              ["ui.settings.stat_regen", profile.playerRegen],
            ] as const
          ).map(([key, value]) => (
            <div className="diffstat" key={key}>
              <span className="diffstat__label">{t(key)}</span>
              <span
                className="diffstat__value"
                style={{
                  color:
                    value >= 1.05 ? "var(--red-bright)"
                    : value <= 0.95 ? "var(--green)"
                    : "var(--text-dim)",
                }}
              >
                ×{value.toFixed(2)}
              </span>
            </div>
          ))}
        </div>

        <button
          className="btn btn--primary"
          style={{ width: "100%", marginTop: 12, padding: "10px 0" }}
          onClick={() => void newGame(selected, difficulty)}
        >
          {t("ui.title.play")} — {country.flag} {countryName(country)}
        </button>

        {saveAvailable && (
          <button
            className="btn"
            style={{ width: "100%", marginTop: 6 }}
            onClick={async () => {
              // Loading needs an in-memory state to deserialize into, so begin
              // a campaign for the selected nation and immediately overwrite it.
              await newGame(selected, difficulty);
              await loadGame();
            }}
          >
            {t("ui.title.continue")}
          </button>
        )}
        </aside>
      )}

      {!ui.startup && (
        <aside className="title-panel title-panel--right">
        <div className="title-nation">
          <span className="title-nation__flag">{country.flag}</span>
          <div>
            <div className="title-nation__name">{countryName(country)}</div>
            <div className="title-nation__meta">
              {t(`power.${country.power}`)} · {t(`gov.${country.government}`)}
              {country.nuclear && " · ☢"}
            </div>
          </div>
        </div>

        <div className="dim" style={{ fontSize: 11.5, lineHeight: 1.65, marginBottom: 10 }}>
          {t(country.description)}
        </div>

        <div className="title-stats">
          <div><span className="dim">ECO</span><b>{country.economy}</b></div>
          <div><span className="dim">MIL</span><b>{country.military}</b></div>
          <div><span className="dim">STB</span><b>{country.stability}</b></div>
          <div><span className="dim">${country.treasury}B</span><b>{country.population}M</b></div>
        </div>

        <div className="section__title" style={{ marginTop: 14 }}>
          {t("ui.title.relations")}
        </div>
        <div className="title-relations">
          {neighbours.slice(0, 7).map((c) => {
            const rel = country.relations[c.id] ?? 0;
            const colour =
              rel >= 50 ? "var(--green)"
              : rel >= 0 ? "var(--text-dim)"
              : rel >= -50 ? "var(--orange)"
              : "var(--red-bright)";
            return (
              <button className="title-relation" key={c.id} onClick={() => setSelected(c.id)}>
                <span>{c.flag}</span>
                <span className="title-relation__name">{countryName(c)}</span>
                <span className="title-relation__rel" style={{ color: colour }}>
                  {rel > 0 ? `+${rel}` : rel}
                </span>
              </button>
            );
          })}
        </div>

        <div className="dim" style={{ fontSize: 10.5, marginTop: 10, lineHeight: 1.6 }}>
          {t("ui.title.inspect")}
        </div>
        </aside>
      )}

      {!ui.startup && <div className="title-screen__hint">{t("ui.title.map_hint")}</div>}
    </div>
  );
};

export default TitleScreen;
