import type { SlamConfig } from "../types/slam";

export function defaultSlamConfig(): SlamConfig {
  return {
    resolution: 0.05,
    width: 1024,
    height: 1024,
    origin: [-25.6, -25.6, 0],
    pHit: 0.65,
    pMiss: 0.35,
    lMin: -2.0,
    lMax: 3.5,
    l0: 0,
    downsample: 2,
    occupiedThresh: 0.65,
    freeThresh: 0.196
  };
}
