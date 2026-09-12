import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// The Tauri webview disables the browser context menu; keep the game chrome
// feeling native by suppressing it everywhere except text inputs and the
// console transcript.
window.addEventListener("contextmenu", (e) => {
  const el = e.target as HTMLElement;
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return;
  if (el.closest(".console__body")) return;
  e.preventDefault();
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
