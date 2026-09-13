import { GameState, PeaceConference } from "./types";
import { REGIONS } from "../map/provinces";

/**
 * The peace conference.
 *
 * When a nation is conquered, its land does not simply change hands — the
 * victors sit down and divide it. Every participant brings a claim budget drawn
 * from how much of the fighting they did, and every region taken costs a point.
 * What nobody claims stays with the rump state.
 *
 * This is the payoff for the province data: regions are real administrative
 * areas, so a conquered country is partitioned along its actual provinces
 * rather than vanishing as one lump.
 */

/** Region ids belonging to a nation, in the map's own ordering. */
export function regionsOf(countryId: string): string[] {
  return (REGIONS.get(countryId) ?? []).map((r) => r.id);
}

/**
 * Open a conference over a defeated nation.
 *
 * The victor takes the chair and the lion's share; allies who were also at war
 * with the loser get a seat and a smaller budget, which is what makes alliances
 * worth having.
 */
export function openConference(
  state: GameState,
  conqueredId: string,
  victorId: string
): PeaceConference {
  // Only what the loser still holds. Offering its whole authored territory let
  // a rump state be carved up twice, with regions already handed to somebody
  // else coming back to the table.
  const pool = regionsOf(conqueredId).filter(
    (regionId) => ownerOf(state, regionId, conqueredId) === conqueredId
  );
  const victor = state.countries.find((c) => c.id === victorId);

  // Everyone who was fighting the loser alongside the victor gets a seat.
  const allyIds = (victor?.allies ?? []).filter((id) => {
    const ally = state.countries.find((c) => c.id === id);
    return ally && ally.id !== conqueredId;
  });

  const seats = [victorId, ...allyIds].slice(0, 4);
  const budget = Math.max(1, Math.floor(pool.length / seats.length));
  const participants = seats.map((countryId, i) => ({
    countryId,
    // The chair takes the remainder, so the victor always comes out ahead.
    score: i === 0 ? budget + (pool.length - budget * seats.length) : budget,
  }));

  return {
    conquered: conqueredId,
    participants,
    pool,
    claims: {},
    active: true,
  };
}

/** Points a participant has left. */
export function remaining(conference: PeaceConference, countryId: string): number {
  const seat = conference.participants.find((p) => p.countryId === countryId);
  if (!seat) return 0;
  const spent = Object.values(conference.claims).filter((c) => c === countryId).length;
  return seat.score - spent;
}

/** Claim a region for a country, if it can afford it. */
export function claim(
  conference: PeaceConference,
  regionId: string,
  countryId: string
): boolean {
  if (!conference.pool.includes(regionId)) return false;
  if (conference.claims[regionId]) return false;
  if (remaining(conference, countryId) <= 0) return false;
  conference.claims[regionId] = countryId;
  return true;
}

/**
 * Let the AI delegations take their share.
 *
 * They work through the pool in order, so the regions are divided rather than
 * one ally hoovering up everything before the others move.
 */
export function runAIClaims(conference: PeaceConference, playerId: string): void {
  for (const seat of conference.participants) {
    if (seat.countryId === playerId) continue;
    for (const regionId of conference.pool) {
      if (remaining(conference, seat.countryId) <= 0) break;
      claim(conference, regionId, seat.countryId);
    }
  }
}

/** Spend whatever budget is left on whatever regions are left. */
export function claimAll(conference: PeaceConference, countryId: string): void {
  for (const regionId of conference.pool) {
    if (remaining(conference, countryId) <= 0) break;
    claim(conference, regionId, countryId);
  }
}

export interface ConferenceOutcome {
  /** Regions that changed hands, by their new owner. */
  transferred: { regionId: string; to: string }[];
  /** Regions nobody claimed — the chair takes these, see `chairOf`. */
  unclaimed: string[];
}

/**
 * Whoever sits at the head of the table: the victor whose war it was.
 *
 * The rump state has no future, so the regions nobody bothered to claim go to
 * the chair rather than leaving a country on the map that cannot act.
 */
export function chairOf(conference: PeaceConference): string | undefined {
  return conference.participants[0]?.countryId;
}

/**
 * Close the conference and write the new borders.
 *
 * Ownership lives in `state.regionOwner`, which the map reads when deciding what
 * colour to paint a province.
 */
export function closeConference(state: GameState, conference: PeaceConference): ConferenceOutcome {
  const transferred: { regionId: string; to: string }[] = [];

  for (const [regionId, to] of Object.entries(conference.claims)) {
    state.regionOwner[regionId] = to;
    transferred.push({ regionId, to });
  }

  const unclaimed = conference.pool.filter((id) => !conference.claims[id]);
  conference.active = false;

  state.log.push(
    `[PEACE] ${conference.conquered} partitioned — ${transferred.length} regions transferred`
  );
  return { transferred, unclaimed };
}

/** The owner of a region, falling back to the nation it was authored under. */
export function ownerOf(state: GameState, regionId: string, baseOwner: string): string {
  return state.regionOwner[regionId] ?? baseOwner;
}
