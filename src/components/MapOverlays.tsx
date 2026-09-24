import React from "react";
import { useStore, setMapMode } from "../game/store";
import { MapMode } from "../game/types";
import { legendFor } from "../map/colors";
import { t, useLanguage } from "../i18n";
import { countryName } from "../game/names";
import Flag from "./Flag";

const MODES: { id: MapMode; labelKey: string }[] = [
  { id: "political", labelKey: "ui.map.political" },
  { id: "faction", labelKey: "ui.map.faction" },
  { id: "military", labelKey: "ui.map.military" },
  { id: "economy", labelKey: "ui.map.economy" },
  { id: "stability", labelKey: "ui.map.stability" },
  { id: "war", labelKey: "ui.map.war" },
];

const MapOverlays: React.FC = () => {
  const { state, ui } = useStore();
  useLanguage();

  if (!state) return null;

  const war = state.activeWar;
  const attacker = war ? state.countries.find((c) => c.id === war.attacker) : undefined;
  const defender = war ? state.countries.find((c) => c.id === war.defender) : undefined;

  return (
    <>
      {/* Map mode switcher */}
      <div className="mapmodes">
        <div className="mapmodes__title">{t("ui.map.mode")}</div>
        <div className="mapmodes__row">
          {MODES.slice(0, 3).map((m) => (
            <button
              key={m.id}
              className={`mapmode${ui.mapMode === m.id ? " is-active" : ""}`}
              onClick={() => setMapMode(m.id)}
            >
              {t(m.labelKey)}
            </button>
          ))}
        </div>
        <div className="mapmodes__row">
          {MODES.slice(3).map((m) => (
            <button
              key={m.id}
              className={`mapmode${ui.mapMode === m.id ? " is-active" : ""}`}
              onClick={() => setMapMode(m.id)}
            >
              {t(m.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="legend">
        <div className="legend__title">{t("ui.legend.title")}</div>
        {legendFor(ui.mapMode).map((row) => (
          <div className="legend__row" key={row.labelKey}>
            <span className="legend__swatch" style={{ background: row.color }} />
            <span>{t(row.labelKey)}</span>
          </div>
        ))}
        <div className="legend__row" style={{ marginTop: 5, borderTop: "1px solid var(--border)", paddingTop: 5 }}>
          <span className="legend__swatch" style={{ background: "#2b3946" }} />
          <span>{t("ui.map.unclaimed")}</span>
        </div>
      </div>

      {/* Active-war banner pinned to the bottom of the map */}
      {war?.active && attacker && defender && (
        <div className="mapwar">
          <div className="mapwar__side">
            <div className="mapwar__side-name">
              <Flag id={attacker.id} /> {countryName(attacker)}
            </div>
            <div className="mapwar__bar">
              <i style={{ width: `${war.attackerMorale}%`, background: "var(--green)" }} />
            </div>
          </div>
          <div className="mapwar__vs">{t("ui.war.vs")}</div>
          <div className="mapwar__side">
            <div className="mapwar__side-name">
              <Flag id={defender.id} /> {countryName(defender)}
            </div>
            <div className="mapwar__bar">
              <i style={{ width: `${war.defenderMorale}%`, background: "var(--red)" }} />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MapOverlays;
