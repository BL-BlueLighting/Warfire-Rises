import { getEra } from "./eras";

/**
 * Which flag a nation flies, in this scenario.
 *
 * A 1938 campaign shows the Republic of China's flag, not the People's
 * Republic's. Nations whose flag did not change — Britain, and the whole
 * roster after the war — fall through to the modern set. The historical files
 * are the originals from Wikimedia Commons, normalised onto the same canvas
 * as the modern ones by `scripts/fetch-flags.py`; nothing is drawn by hand.
 *
 * `flag` on `Country` is still the emoji, for the places that can only print
 * text: the console, the log.
 */
export function flagSrc(countryId: string, eraId?: string, streaming = false): string {
  const file = getEra(eraId).flags?.[countryId];
  // Streaming mode replaces the swastika in the Reich's flag with 乐. Only
  // that one file has a second version; see scripts/fetch-flags.py.
  if (streaming && file === "reich") return "/flags/hist/reich-stream.svg";
  return file ? `/flags/hist/${file}.svg` : `/flags/${countryId.toLowerCase()}.svg`;
}

/**
 * When the state a flag belonged to ceased to exist.
 *
 * Streaming mode prints this under the flag. It is the one place the game
 * shows a defeated regime's colours, and the date is the point: 1935-1945 is
 * a warning label, not a crest.
 */
export const FLAG_FALLEN: Record<string, string> = {
  reich: "1945.5.8",
};

/** The caption for a flag in streaming mode, or null when there is none. */
export function flagNote(countryId: string, eraId?: string, streaming = false): string | null {
  if (!streaming) return null;
  const file = getEra(eraId).flags?.[countryId];
  return (file && FLAG_FALLEN[file]) || null;
}
