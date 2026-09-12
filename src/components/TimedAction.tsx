import React from "react";
import { useStore, pushToast } from "../game/store";
import { actionDuration, checkAction, startAction, type ActionDef } from "../game/actions";
import { t, useLanguage } from "../i18n";
import { ActionButton } from "./shared";

interface Props {
  def: ActionDef;
  actorId: string;
  targetId?: string;
  /** Override the button label (used when a panel wants denser wording). */
  labelOverride?: string;
}

/**
 * An action button wired to the task queue: it shows what the action costs and
 * how long it will take, refuses to start when the requirements aren't met,
 * and pushes the reason as a toast when clicked while unavailable.
 */
export const TimedAction: React.FC<Props> = ({ def, actorId, targetId, labelOverride }) => {
  const { state } = useStore();
  useLanguage();

  if (!state) return null;

  const check = checkAction(state, def, actorId, targetId);
  const days = actionDuration(state, def, actorId, targetId);
  const cost = def.cost ?? {};

  const parts: string[] = [];
  if (cost.dp) parts.push(t("ui.cost.dp", { n: cost.dp }));
  if (cost.ae) parts.push(t("ui.cost.ae", { n: cost.ae }));
  if (cost.treasury) parts.push(t("ui.cost.treasury", { n: cost.treasury }));
  parts.push(t("ui.task.days", { n: days }));

  return (
    <ActionButton
      icon={def.icon}
      label={labelOverride ?? t(def.labelKey)}
      cost={parts.join(" · ")}
      detail={check.ok ? undefined : check.reason}
      disabled={!check.ok}
      danger={def.kind === "justify" || def.id === "mil.strike" || def.id === "mil.nuclear"}
      onClick={() => {
        const res = startAction(state, def.id, actorId, targetId);
        if (res.message) pushToast(res.ok ? "success" : "error", res.message);
      }}
    />
  );
};

export default TimedAction;
