import React, { useEffect, useRef, useState } from "react";
import { useStore, runAction, toggleConsole } from "../game/store";
import { t, useLanguage } from "../i18n";

/**
 * The CLI edition's command layer, retained as a power-user tool.
 * Panel buttons and this console share the same `runAction` code path.
 */
const Console: React.FC = () => {
  const { ui } = useStore();
  const [value, setValue] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useLanguage();

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [ui.consoleLines, ui.consoleOpen]);

  useEffect(() => {
    if (ui.consoleOpen) inputRef.current?.focus();
  }, [ui.consoleOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Backtick toggles the console. `code` is checked as well as `key` so a
      // layout that produces a different glyph still opens it.
      if (e.key === "`" || e.key === "~" || e.code === "Backquote") {
        const el = document.activeElement;
        if (el instanceof HTMLInputElement) return;
        e.preventDefault();
        toggleConsole();
      }
      if (e.key === "Escape" && ui.consoleOpen) toggleConsole(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ui.consoleOpen]);

  if (!ui.consoleOpen) return null;

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setValue("");
    runAction(trimmed);
  };

  return (
    <div className="console">
      <div className="console__head">
        <span>▸ {t("ui.console.title")}</span>
        <button className="btn btn--sm" onClick={() => toggleConsole(false)}>
          {t("ui.btn.close")}
        </button>
      </div>
      <div className="console__body" ref={bodyRef}>
        {ui.consoleLines.join("\n")}
      </div>
      <div className="console__input">
        <span>▶</span>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder={t("ui.console.hint")}
          spellCheck={false}
        />
      </div>
    </div>
  );
};

export default Console;
