import React from "react";
import { Country } from "../game/types";
import { countryName } from "../game/names";
import { t } from "../i18n";
import { PALETTE, relationBucket, RELATION_COLORS } from "../map/colors";

export const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="section">
    <div className="section__title">{title}</div>
    {children}
  </div>
);

export const Stat: React.FC<{ label: string; value: React.ReactNode; color?: string }> = ({
  label,
  value,
  color,
}) => (
  <div className="stat">
    <span className="stat__label">{label}</span>
    <span className="stat__value" style={color ? { color } : undefined}>
      {value}
    </span>
  </div>
);

export const Bar: React.FC<{ pct: number; color: string }> = ({ pct, color }) => (
  <div className="bar">
    <i style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
  </div>
);

export interface ActionProps {
  icon: string;
  label: string;
  cost?: string;
  detail?: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}

export const ActionButton: React.FC<ActionProps> = ({
  icon,
  label,
  cost,
  detail,
  disabled,
  danger,
  onClick,
}) => (
  <button
    className={`action${danger ? " action--danger" : ""}`}
    onClick={onClick}
    disabled={disabled}
    title={detail}
  >
    <span className="action__icon">{icon}</span>
    <span className="action__body">
      <span className="action__label">{label}</span>
      {(cost || detail) && (
        <span className="action__cost" style={{ display: "block" }}>
          {cost}
          {cost && detail ? " · " : ""}
          {detail}
        </span>
      )}
    </span>
  </button>
);

/** Relation-coloured pip used in nation lists. */
export const RelationPip: React.FC<{ relation: number }> = ({ relation }) => (
  <span
    className="swatch"
    style={{ background: RELATION_COLORS[relationBucket(relation)] }}
    title={String(relation)}
  />
);

export const NationRow: React.FC<{
  country: Country;
  relation: number;
  isSelected: boolean;
  isPlayer?: boolean;
  onClick: () => void;
}> = ({ country, relation, isSelected, isPlayer, onClick }) => (
  <button
    className={`nationrow${isSelected ? " is-selected" : ""}`}
    onClick={onClick}
    title={t(country.description)}
  >
    <span className="nationrow__flag">{country.flag}</span>
    <span className="nationrow__name">{countryName(country)}</span>
    {isPlayer ? (
      <span className="tag tag--you">YOU</span>
    ) : (
      <>
        <RelationPip relation={relation} />
        <span
          className="nationrow__rel"
          style={{ color: relation >= 0 ? PALETTE.friendly : PALETTE.hostile }}
        >
          {relation > 0 ? `+${relation}` : relation}
        </span>
      </>
    )}
  </button>
);
