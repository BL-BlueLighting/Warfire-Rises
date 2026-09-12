import React, { useEffect } from "react";
import { useStore, pauseToggle, dismissNarrative } from "./game/store";
import { useLanguage, t } from "./i18n";
import TopBar from "./components/TopBar";
import LeftRail from "./components/LeftRail";
import MapOverlays from "./components/MapOverlays";
import TaskQueue from "./components/TaskQueue";
import EventBubbles from "./components/EventBubbles";
import Toasts from "./components/Toasts";
import ConfirmDialog from "./components/ConfirmDialog";
import SettingsDialog from "./components/SettingsDialog";
import SaveDialog from "./components/SaveDialog";
import StartupBar from "./components/StartupBar";
import { DisclaimerCard, DisclaimerNotice } from "./components/Disclaimer";
import PeaceConference from "./components/PeaceConference";
import ArmyObjection from "./components/ArmyObjection";
import Console from "./components/Console";
import TitleScreen from "./components/TitleScreen";
import LoadingScreen from "./components/LoadingScreen";
import GameOverScreen from "./components/GameOverScreen";
import PanelHost from "./panels/PanelHost";
import WorldMap from "./map/WorldMap";

const App: React.FC = () => {
  const { state, ui } = useStore();
  useLanguage();

  // Space toggles pause, as in the games this one apes. Ignored while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        pauseToggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The console is available before a campaign too — the `debug` options
  // that control preparation have to be reachable from here.
  if (!state) {
    return <><TitleScreen /><StartupBar /><SettingsDialog /><SaveDialog /><Console /><DisclaimerCard /><Toasts /></>;
  }
  if (state.phase === "loading") return <LoadingScreen />;
  if (state.phase === "gameover") return <><GameOverScreen /><Toasts /></>;

  return (
    <div className="app">
      <TopBar />
      <div className="app__body">
        <LeftRail />
        <main className="maparea">
          <WorldMap />
          <MapOverlays />
          <EventBubbles />
          <DisclaimerNotice />
          <TaskQueue />
        </main>
        <PanelHost />
      </div>
      <SaveDialog />
      <Console />
      <ConfirmDialog />
      <SettingsDialog />
      <DisclaimerCard />
      <PeaceConference />
      <ArmyObjection />
      {ui.narrative && (
        <div className="modal-backdrop" onClick={dismissNarrative}>
          <div className="modal modal--narrative" onClick={(e) => e.stopPropagation()}>
            <div className="modal__title">{ui.narrative.title}</div>
            <div className="modal__body narrative">{ui.narrative.body}</div>
            <div className="modal__actions">
              <button className="btn btn--primary" onClick={dismissNarrative}>
                {t("ui.btn.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
      <Toasts />
    </div>
  );
};

export default App;
