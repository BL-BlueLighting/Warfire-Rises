import { Country, GameState } from "./types";
import { getCountryById } from "./state";
import { ownerOf, regionsOf } from "./peace";

/**
 * Subject nations (附属国).
 *
 * A nation counts as another's subject in two ways:
 *
 *   1. Someone said so — the `SideCountry` decision reward writes `overlordId`.
 *   2. The other nation is standing on its land. Occupying *any* region of a
 *      nation is enough, which is what makes conquest read as vassalage
 *      without anyone having to declare it.
 *
 * The second rule is computed on every read, never stored, so giving the land
 * back gives the independence back with it — and a subject whose capital was
 * annexed cannot be "released" by clearing a flag that was never set.
 */

/** True when `overlordId` holds at least one region authored under `subjectId`. */
export function occupiesLandOf(
  state: GameState,
  overlordId: string,
  subjectId: string
): boolean {
  if (!overlordId || !subjectId || overlordId === subjectId) return false;
  return regionsOf(subjectId).some(
    (regionId) => ownerOf(state, regionId, subjectId) === overlordId
  );
}

/** True when `countryId` answers to `overlordId`, however that came to be. */
export function isSubjectOf(state: GameState, countryId: string, overlordId: string): boolean {
  if (!countryId || !overlordId || countryId === overlordId) return false;
  const country = getCountryById(state, countryId);
  if (!country) return false;
  if (country.overlordId === overlordId) return true;
  return occupiesLandOf(state, overlordId, countryId);
}

/**
 * Bind a nation to another, or cut it loose with `null`.
 *
 * Only the stored half of the relationship moves; land occupied by the
 * overlord keeps the subject flag true regardless — see `isSubjectOf`.
 */
export function setSubject(
  state: GameState,
  countryId: string,
  overlordId: string | null
): boolean {
  const country = getCountryById(state, countryId);
  if (!country) return false;
  if (overlordId !== null && !getCountryById(state, overlordId)) return false;
  if (overlordId === countryId) return false;
  country.overlordId = overlordId;
  return true;
}

/** Every nation that answers to `overlordId`, in roster order. */
export function subjectsOf(state: GameState, overlordId: string): Country[] {
  return state.countries.filter((c) => isSubjectOf(state, c.id, overlordId));
}
