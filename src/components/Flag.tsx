import React from "react";
import { useStore } from "../game/store";
import { useSettings } from "../game/settings";
import { flagNote, flagSrc } from "../game/flags";

/**
 * A nation's flag, as the picture it is.
 *
 * Every flag in the game used to be an emoji set in the "WF Flags" colour
 * font, which works for the twelve modern nations and for nothing else — there
 * is no emoji for the Soviet Union. Historical scenarios therefore draw the
 * real file, and the modern ones come along for the ride so that a flag is
 * always the same kind of thing.
 *
 * Sizing is in `em`, so a flag scales with whatever text it sits beside.
 */
const Flag: React.FC<{
  id: string;
  /** Scenario to draw the flag for. Defaults to the campaign's own. */
  era?: string;
  className?: string;
}> = ({ id, era, className }) => {
  const { state, ui } = useStore();
  const settings = useSettings();
  const eraId = era ?? state?.era ?? ui.eraId;
  const note = flagNote(id, eraId, settings.streamingMode);

  return (
    <span className={`flag${className ? ` ${className}` : ""}`}>
      {/* Empty alt on purpose: the nation's name is always set beside the
          flag, and a screen reader reading it twice is worse than not. */}
      <img
        className="flag__img"
        src={flagSrc(id, eraId, settings.streamingMode)}
        alt=""
        draggable={false}
      />
      {note && <span className="flag__note">{note}</span>}
    </span>
  );
};

export default Flag;
