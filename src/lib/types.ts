export interface LatLon {
  lat: number;
  lon: number;
}

export interface Waypoint {
  lat: number;
  lon: number;
  altSmoothed?: number;
  name: string;
  description?: string;
}

export interface Turnpoint {
  radius: number;
  waypoint: Waypoint;
  type?: 'SSS' | 'ESS';
}

export interface XcTask {
  version: number;
  taskType: string;
  turnpoints: Turnpoint[];
  name?: string;
  taskName?: string;
  title?: string;
  location?: string;
  flyingSite?: string;
  country?: string;
  region?: string;
  city?: string;
  sss?: {
    type?: string;
    direction?: string;
    timeGates?: string[];
  };
  goal?: {
    type?: string;
    deadline?: string;
  };
  earthModel?: string;
}

export interface TrackPoint {
  time: Date;
  lat: number;
  lon: number;
  alt: number;
}

export interface FlightTrack {
  id: string;
  pilotName: string;
  fileName: string;
  points: TrackPoint[];
  date?: Date;
  finishTime?: Date;
  landingTime?: Date;
  gliderType?: string;
  igcHeader?: string;
}

export interface RoutePoint {
  lat: number;
  lon: number;
  name?: string;
  radius: number;
  type?: 'SSS' | 'ESS';
  number?: number;
}

export interface ProgressTurnpoint {
  number: number;
  name: string;
  taskPercent: number;
  taskKm: number;
}

export interface OptimizedRoute {
  points: LatLon[];
  legDistances: number[];
  totalDistance: number;
  cumulativeDistances: number[];
  progressPoints: LatLon[];
  progressLegDistances: number[];
  progressCumulativeDistances: number[];
  progressTotalDistance: number;
  progressTurnpoints: ProgressTurnpoint[];
  sssIndex: number;
  goalIndex: number;
  sssCenter: LatLon;
  sssRadius: number;
  goalCenter: LatLon;
  goalRadius: number;
}

export interface CompetitorSnapshot {
  id: string;
  pilotName: string;
  firstName: string;
  gliderType?: string;
  lat: number;
  lon: number;
  alt: number;
  taskPercent: number;
  taskKm: number;
  color: string;
  landed: boolean;
  groundSpeedMps: number;
  verticalSpeedMps: number;
  nextTurnpointName: string;
  leadPercent: number;
}

export interface TaskTiming {
  trackStart: Date;
  trackEnd: Date;
  taskStart?: Date;
  fastestFinish?: Date;
  fastestPilot?: string;
}
