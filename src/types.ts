export type HazardType = 'pothole' | 'road_defect' | 'drain' | 'bump' | 'construction' | 'other';

export type LateralPosition = 'left_edge' | 'center_lane' | 'right_edge';

export type ObstacleCategory = 'crosswalk' | 'railway' | 'speed_bump' | 'traffic_signals' | 'speed_limit';

export interface HazardReport {
  id: string;
  timestamp: number; // Exact moment the button was pressed
  lat: number;
  lng: number;
  heading: number; // 0-359 degrees
  headingCardinal: string; // É, ÉK, K, DK, D, DNY, NY, ÉNY
  settlement: string;
  postcode: string;
  street: string;
  houseNumber: string;
  roadRef: string;
  type: HazardType;
  lanesAffected: number[]; // e.g. [1] or [1, 2] (1-indexed from left to right in travel direction, or right-hand traffic lanes)
  totalLanesAtLocation: number;
  opposingLanesAtLocation: number;
  lateralPosition: LateralPosition;
  severity: 'low' | 'medium' | 'high';
  notes: string;
  appliesToDirectionOnly: boolean; // True: only applies to current heading/right lanes
}

export interface RoadObstacle {
  id: string;
  type: ObstacleCategory;
  name: string;
  lat: number;
  lng: number;
  distanceMeters?: number;
  maxspeed?: string;
  source: 'osm_live' | 'osm_offline' | 'demo';
}

export interface RoadContextInfo {
  settlement: string;
  postcode: string;
  street: string;
  houseNumber: string;
  roadRef: string; // e.g., "M7", "7-es főút", "811-es út"
  totalLanes: number;
  forwardLanes: number;
  backwardLanes: number;
  maxSpeed: number;
  surface: string;
  oneway: boolean;
  source: 'osm_live' | 'osm_offline' | 'simulation';
}

export interface OfflineOsmRoadSegment {
  id: string;
  name: string;
  ref: string;
  settlement?: string;
  postcode?: string;
  lanes: number;
  lanesForward: number;
  lanesBackward: number;
  maxSpeed: number;
  coords: [number, number][]; // [lat, lng]
}

export interface OfflineOsmDataset {
  fileName: string;
  loadedAt: number;
  nodeCount: number;
  wayCount: number;
  obstacles: RoadObstacle[];
  roads: OfflineOsmRoadSegment[];
}

export interface AppSettings {
  theme: 'dark' | 'light';
  fontScale: 'normal' | 'large' | 'xl';
  ttsEnabled: boolean;
  ttsSpeakStreetChanges: boolean;
  ttsSpeakObstacles: boolean;
  ttsSpeakHazards: boolean;
  ttsRate: number;
  alertDistanceMeters: number; // e.g., 250m
  enabledObstacles: Record<ObstacleCategory, boolean>;
  useLiveOsmApi: boolean;
}
