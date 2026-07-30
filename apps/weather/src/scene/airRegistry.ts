/** Shared handle so Sky (a sibling component) samples the same baked air field. */
import type { AirField } from './airField';

export const airRegistry: { current: AirField | null } = { current: null };
