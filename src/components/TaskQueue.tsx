import React from "react";
import { useStore, cancelQueuedTask } from "../game/store";
import { getCountryById } from "../game/state";
import { taskProgress, tasksFor } from "../game/scheduler";
import { describeReward, type DecisionDef } from "../game/decisions";
import { t, useLanguage } from "../i18n";

/** Progress bars for everything the player has queued up. */
const TaskQueue: React.FC = () => {
  const { state } = useStore();
  useLanguage();

  if (!state) return null;
  const tasks = tasksFor(state, state.playerCountryId);

  if (tasks.length === 0) {
    return (
      <div className="tasks tasks--empty">
        <div className="tasks__title">{t("ui.task.queue")}</div>
        <div className="dim" style={{ fontSize: 11, padding: "2px 4px" }}>
          {t("ui.task.idle")}
        </div>
      </div>
    );
  }

  return (
    <div className="tasks">
      <div className="tasks__title">
        {t("ui.task.queue")} <span className="dim">({tasks.length})</span>
      </div>
      {tasks.map((task) => {
        const pct = taskProgress(state, task) * 100;
        const daysLeft = Math.max(0, Math.ceil(task.endTime - state.clock.time));
        const primary = t(task.labelKey, task.labelParams);
        const target = task.targetId ? getCountryById(state, task.targetId) : undefined;
        return (
          <div className="task" key={task.id}>
            <div className="task__head">
              <span className="task__icon">{task.icon}</span>
              <span className="task__name">
                {primary}
                {target ? ` · ${target.flag}` : ""}
              </span>
              <span className="task__days">{t("ui.task.days_left", { n: daysLeft })}</span>
              {task.cancellable && (
                <button
                  className="task__cancel"
                  onClick={() => cancelQueuedTask(task.id)}
                  title={t("ui.task.cancel")}
                >
                  ✕
                </button>
              )}
            </div>
            <div className="task__bar">
              <i style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default TaskQueue;

/** Shared by the decision panel to preview a decision's payout. */
export function decisionPreview(decision: DecisionDef): string[] {
  const out: string[] = [];
  const isInf = decision.Time === "inf";
  if (isInf) {
    for (const phase of decision.InfinityPhases ?? []) {
      for (const get of phase.Get ?? []) {
        for (const tuple of get.Rewards ?? []) out.push(describeReward(tuple));
      }
    }
  }
  for (const result of decision.Result ?? []) {
    for (const reward of result.Rewards ?? []) {
      for (const tuple of reward.Rewards ?? []) out.push(describeReward(tuple));
    }
  }
  return out;
}
