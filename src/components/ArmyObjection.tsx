import React from "react";
import { useStore, confirmArmyChange, cancelArmyChange } from "../game/store";
import { t, useLanguage } from "../i18n";

/**
 * The chief of staff disagrees.
 *
 * With the army under automatic command, a manual order is not silently
 * applied — the staff objects first and the player decides. Overruling is
 * allowed and costs endurance, which is what makes the warning worth reading
 * rather than clicking through.
 */
const ArmyObjection: React.FC = () => {
  const { ui } = useStore();
  useLanguage();

  if (!ui.armyObjection) return null;

  return (
    <div className="modal-backdrop" onClick={cancelArmyChange}>
      <div className="modal modal--objection" onClick={(e) => e.stopPropagation()}>
        <div className="modal__title">{t("ui.objection.title")}</div>

        <div className="objection">
          <div className="objection__speaker">{t("ui.objection.speaker")}</div>
          <div className="objection__line">{t(ui.armyObjection.objectionKey)}</div>
        </div>

        <div className="objection__cost">{t("ui.objection.cost_note")}</div>

        <div className="modal__actions">
          <button className="btn" onClick={cancelArmyChange}>
            {t("ui.objection.comply")}
          </button>
          <button className="btn btn--danger" onClick={confirmArmyChange}>
            {t("ui.objection.insist")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ArmyObjection;
