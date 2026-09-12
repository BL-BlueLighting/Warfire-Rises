import React from "react";
import { useStore, cancelConfirm, runAction } from "../game/store";
import { getCountryById } from "../game/state";
import { t, useLanguage } from "../i18n";

/** Guards the two irreversible actions: nuclear launch and retreat/surrender. */
const ConfirmDialog: React.FC = () => {
  const { state, ui } = useStore();
  useLanguage();

  const pending = ui.pendingConfirm;
  if (!pending || !state) return null;

  const isNuclear = pending.kind === "nuclear";
  const target = pending.countryId ? getCountryById(state, pending.countryId) : undefined;

  const onConfirm = () => {
    if (isNuclear && target) {
      cancelConfirm();
      runAction(`nuclear ${target.id}`);
    } else {
      cancelConfirm();
      runAction("war retreat");
    }
  };

  return (
    <div className="modal-backdrop" onClick={cancelConfirm}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__title" style={isNuclear ? { color: "var(--red-bright)" } : undefined}>
          {isNuclear ? `☢ ${t("ui.confirm.nuclear.title")}` : `🏳 ${t("ui.confirm.retreat.title")}`}
        </div>
        <div className="modal__body">
          {isNuclear
            ? t("ui.confirm.nuclear.body", { name: target?.name ?? "" })
            : t("ui.confirm.retreat.body")}
        </div>
        <div className="modal__actions">
          <button className="btn" onClick={cancelConfirm}>
            {t("ui.btn.cancel")}
          </button>
          <button className="btn btn--danger" onClick={onConfirm}>
            {isNuclear ? t("ui.btn.launch") : t("ui.btn.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
