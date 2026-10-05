import type { PublicLiveState } from "@qcelect/schema";

/**
 * Production model boundary.
 *
 * This function will consume versioned pre-fit artifacts produced under research/.
 * Until an artifact has passed replay/calibration, official results publish with
 * projection=null. Do not add ad-hoc coefficients here.
 */
export function applyProjections(state: PublicLiveState): PublicLiveState {
  return state;
}
