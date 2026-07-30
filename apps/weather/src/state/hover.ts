/**
 * Transient pointer-hover state, kept out of React so 60Hz mousemoves never
 * re-render the tree. The scene reads it per frame; the DOM label is
 * positioned imperatively by Interactions.
 */
export const hover = {
  sector: -1,
};
