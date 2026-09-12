import React from "react";
import {
  useStore,
  closeSaveDialog,
  saveGame,
  loadGame,
  deleteSaveSlot,
  loadGameFromTitle,
} from "../game/store";
import { getCountryById } from "../game/state";
import { COUNTRIES } from "../game/countries";
import { countryName } from "../game/names";
import { t, useLanguage } from "../i18n";

/**
 * Three save slots, reachable before a campaign and during one.
 *
 * The same dialog does both jobs: on the title screen only the occupied slots
 * have a 载入 button (and 保存 is disabled, there being nothing to write yet);
 * in a campaign every slot can be written.
 */
const SaveDialog: React.FC = () => {
  const { state, ui } = useStore();
  useLanguage();

  if (!ui.saveDialogOpen) return null;

  const slots = ui.saveSlots;
  const canWrite = state !== null;

  return (
    <div className="modal-backdrop" onClick={closeSaveDialog}>
      <div className="modal modal--save" onClick={(e) => e.stopPropagation()}>
        <div className="modal__title">{t("ui.save.title")}</div>

        <div className="slots">
          {slots.map(({ slot, meta }) => {
            // Before a campaign there is no live state to read, so the title
            // screen falls back to the static roster for the flag and name.
            const country = meta
              ? (state ? getCountryById(state, meta.countryId) : undefined) ??
                COUNTRIES.find((c) => c.id === meta.countryId)
              : undefined;
            const when = meta?.savedAt
              ? new Date(meta.savedAt).toLocaleString()
              : t("ui.save.unknown_time");
            return (
              <div className={`slot${meta ? "" : " is-empty"}`} key={slot}>
                <div className="slot__head">
                  <span className="slot__name">{t("ui.save.slot", { n: slot })}</span>
                  {meta ? (
                    <span className="slot__meta">
                      {country ? `${country.flag} ` : ""}
                      {country ? countryName(country) : meta.countryId} ·{" "}
                      {t("ui.save.day", { day: meta.day })} · {t(`diff.${meta.difficulty}.name`)}
                      {" · "}
                      {when}
                    </span>
                  ) : (
                    <span className="slot__meta dim">{t("ui.save.empty")}</span>
                  )}
                </div>
                <div className="slot__actions">
                  <button
                    className="btn btn--sm"
                    disabled={!canWrite}
                    title={canWrite ? undefined : t("ui.save.need_campaign")}
                    onClick={() => void saveGame(slot)}
                  >
                    {meta ? t("ui.save.overwrite") : t("ui.save.save")}
                  </button>
                  <button
                    className="btn btn--sm"
                    disabled={!meta}
                    onClick={() => void (state ? loadGame(slot) : loadGameFromTitle(slot))}
                  >
                    {t("ui.save.load")}
                  </button>
                  <button
                    className="btn btn--sm btn--danger"
                    disabled={!meta}
                    onClick={() => void deleteSaveSlot(slot)}
                  >
                    {t("ui.save.delete")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="dim" style={{ fontSize: 10.5, marginTop: 12, lineHeight: 1.6 }}>
          {t("ui.save.note")}
        </div>

        <div className="modal__actions" style={{ marginTop: 18 }}>
          <button className="btn btn--primary" onClick={closeSaveDialog}>
            {t("ui.btn.close")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SaveDialog;
