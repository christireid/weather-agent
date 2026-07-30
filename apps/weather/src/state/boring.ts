/**
 * Boring Mode transition state (spec §3.3). The toggle is choreographed: the
 * atmosphere settles into the grid (particles align to cell centers), then
 * fades under the DOM heatmap. `mix` is animated by the scene each frame;
 * the DOM layer mirrors it with CSS transitions keyed off the mode.
 */
import { readUrl } from './url';

const initial = readUrl(typeof window === 'undefined' ? '' : window.location.search);

export const boring = {
  // Deep links straight into Boring Mode skip the choreography (it belongs to
  // the toggle); everyone else starts in the field.
  mix: initial.mode === 'boring' ? 1 : 0, // 0 = field, 1 = settled into the grid
};
