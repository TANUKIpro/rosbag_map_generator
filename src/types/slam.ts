export interface LaserScan {
  ranges: Float32Array;
  angle_min: number;
  angle_max: number;
  angle_increment: number;
  range_min: number;
  range_max: number;
  stamp: number;
}

export interface Odom {
  pose: { x: number; y: number; yaw: number };
  twist?: { vx: number; vy: number; wz: number };
  stamp: number;
}

export interface Tf {
  parent: string;
  child: string;
  x: number;
  y: number;
  yaw: number;
  stamp: number;
}

export interface SlamConfig {
  resolution: number;
  width: number;
  height: number;
  origin: [number, number, number];
  pHit: number;
  pMiss: number;
  lMin: number;
  lMax: number;
  l0: number;
  downsample: number;
  occupiedThresh: number;
  freeThresh: number;
}

export interface Pose2D {
  x: number;
  y: number;
  yaw: number;
}

export interface OccupancyGrid {
  width: number;
  height: number;
  resolution: number;
  origin: [number, number, number];
  logOdds: Float32Array;
}
