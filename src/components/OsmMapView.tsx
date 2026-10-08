import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { HazardReport, OfflineOsmDataset, RoadObstacle } from '../types';
import { HAZARD_TYPE_LABELS, LATERAL_POSITION_LABELS, OBSTACLE_LABELS } from '../utils/geoAndSpeech';

// Custom SVG DivIcons so Leaflet never has broken default marker images
function createVehicleIcon(heading: number) {
  return L.divIcon({
    className: 'custom-vehicle-icon',
    html: `<div style="transform: rotate(${heading}deg); width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;">
      <svg width="34" height="34" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="18" cy="18" r="16" fill="#0f172a" stroke="#f59e0b" stroke-width="3"/>
        <path d="M18 6L26 26L18 21L10 26L18 6Z" fill="#f59e0b"/>
      </svg>
    </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

function createHazardIcon(color: string, label: string) {
  return L.divIcon({
    className: 'custom-hazard-icon',
    html: `<div style="background: ${color}; color: #fff; border: 2px solid #0f172a; border-radius: 8px; padding: 2px 6px; font-weight: 800; font-size: 11px; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.45); display: inline-flex; align-items: center; gap: 3px;">
      <span>⚠</span><span>${label}</span>
    </div>`,
    iconSize: [70, 26],
    iconAnchor: [35, 13],
  });
}

function createObstacleIcon(type: string) {
  const bg =
    type === 'railway'
      ? '#dc2626'
      : type === 'crosswalk'
      ? '#2563eb'
      : type === 'speed_bump'
      ? '#d97706'
      : '#059669';
  const symbol =
    type === 'railway'
      ? '🚆'
      : type === 'crosswalk'
      ? '🚶'
      : type === 'speed_bump'
      ? '⏫'
      : type === 'traffic_signals'
      ? '🚦'
      : '📷';
  return L.divIcon({
    className: 'custom-obstacle-icon',
    html: `<div style="background: ${bg}; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
      ${symbol}
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function MapCenterUpdater({ lat, lng, follow }: { lat: number; lng: number; follow: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (follow) {
      map.setView([lat, lng], map.getZoom(), { animate: true });
    }
  }, [lat, lng, follow, map]);
  return null;
}

interface OsmMapViewProps {
  lat: number;
  lng: number;
  heading: number;
  hazards: HazardReport[];
  obstacles: RoadObstacle[];
  offlineDataset: OfflineOsmDataset | null;
  routeCoords: [number, number][];
  isDark: boolean;
  followVehicle: boolean;
  onSelectHazardForEdit: (hazard: HazardReport) => void;
  onManualMapClick?: (lat: number, lng: number) => void;
}

export const OsmMapView: React.FC<OsmMapViewProps> = ({
  lat,
  lng,
  heading,
  hazards,
  obstacles,
  offlineDataset,
  routeCoords,
  isDark,
  followVehicle,
  onSelectHazardForEdit,
}) => {
  return (
    <div
      className={`relative w-full h-[230px] sm:h-[380px] lg:h-[440px] rounded-2xl overflow-hidden border ${
        isDark ? 'border-slate-800 dark-map-tiles' : 'border-slate-200 shadow-sm'
      }`}
    >
      <MapContainer
        center={[lat, lng]}
        zoom={16}
        scrollWheelZoom={true}
        className="w-full h-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> közreműködők'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapCenterUpdater lat={lat} lng={lng} follow={followVehicle} />

        {/* Active Demo or GPS Route Line */}
        {routeCoords.length > 1 && (
          <Polyline
            positions={routeCoords}
            pathOptions={{ color: '#3b82f6', weight: 5, opacity: 0.65, dashArray: '8 6' }}
          />
        )}

        {/* Offline Uploaded OSM Roads Overlay */}
        {offlineDataset &&
          offlineDataset.roads.map((road) => (
            <Polyline
              key={road.id}
              positions={road.coords}
              pathOptions={{ color: '#10b981', weight: 6, opacity: 0.85 }}
            >
              <Popup>
                <div className="text-slate-900 text-xs space-y-1">
                  <div className="font-bold text-sm">{road.name}</div>
                  <div>
                    Sávok: {road.lanes} ({road.lanesForward} előre / {road.lanesBackward} szembe)
                  </div>
                  <div>Max sebesség: {road.maxSpeed} km/h</div>
                  <div className="text-emerald-700 font-semibold">Forrás: Offline OSM fájl</div>
                </div>
              </Popup>
            </Polyline>
          ))}

        {/* Current Vehicle Position & Alert Radius */}
        <Circle
          center={[lat, lng]}
          radius={180}
          pathOptions={{
            color: '#f59e0b',
            fillColor: '#f59e0b',
            fillOpacity: 0.08,
            weight: 1,
          }}
        />
        <Marker position={[lat, lng]} icon={createVehicleIcon(heading)}>
          <Popup>
            <div className="text-xs text-slate-900 font-semibold">
              Jármű aktuális pozíciója ({lat.toFixed(5)}, {lng.toFixed(5)}) — Irány: {heading}°
            </div>
          </Popup>
        </Marker>

        {/* Filtered Road Obstacles (Crosswalk, Railway, Speed Bump, etc.) */}
        {obstacles.map((obs) => (
          <Marker
            key={obs.id}
            position={[obs.lat, obs.lng]}
            icon={createObstacleIcon(obs.type)}
          >
            <Popup>
              <div className="text-xs text-slate-900 space-y-1">
                <div className="font-bold">{OBSTACLE_LABELS[obs.type]?.label || obs.type}</div>
                <div>{obs.name}</div>
                <div className="font-mono-tabular text-slate-500">
                  GPS: {obs.lat.toFixed(5)}, {obs.lng.toFixed(5)}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Recorded Road Hazards (Potholes, Drains, Defects) */}
        {hazards.map((haz) => {
          const meta = HAZARD_TYPE_LABELS[haz.type] || HAZARD_TYPE_LABELS.other;
          return (
            <Marker
              key={haz.id}
              position={[haz.lat, haz.lng]}
              icon={createHazardIcon(meta.color, meta.shortLabel)}
            >
              <Popup>
                <div className="text-xs text-slate-900 space-y-1.5 min-w-[190px]">
                  <div className="font-bold text-sm">{meta.label}</div>
                  <div>
                    {haz.postcode} {haz.settlement}, {haz.street} {haz.houseNumber}
                  </div>
                  <div className="font-semibold text-slate-700">
                    Sáv: {haz.lanesAffected.map((l) => `${l}. sáv`).join(', ')} ·{' '}
                    {LATERAL_POSITION_LABELS[haz.lateralPosition]?.short}
                  </div>
                  <div className="text-slate-600">
                    Menetirány: {haz.heading}° ({haz.headingCardinal})
                  </div>
                  {haz.notes && <div className="italic text-slate-600">„{haz.notes}”</div>}
                  <button
                    type="button"
                    onClick={() => onSelectHazardForEdit(haz)}
                    className="w-full mt-1 py-1.5 px-3 bg-slate-900 text-white rounded font-semibold text-xs hover:bg-slate-800"
                  >
                    Adatok szerkesztése
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
};
