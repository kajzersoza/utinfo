import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Navigation,
  Volume2,
  VolumeX,
  Sun,
  Moon,
  Upload,
  Download,
  AlertTriangle,
  Play,
  Pause,
  LocateFixed,
  Edit3,
  Trash2,
  CheckCircle2,
  Sliders,
  Map as MapIcon,
  ListFilter,
  FileCode2,
  Compass,
  PlusCircle,
  Menu,
  X,
  Radar,
} from 'lucide-react';
import {
  AppSettings,
  HazardReport,
  HazardType,
  LateralPosition,
  OfflineOsmDataset,
  ObstacleCategory,
  RoadContextInfo,
} from './types';
import {
  calculateBearing,
  calculateDistanceMeters,
  getHungarianCardinal,
  HAZARD_TYPE_LABELS,
  isSameDrivingDirection,
  LATERAL_POSITION_LABELS,
  OBSTACLE_LABELS,
  speakHungarian,
} from './utils/geoAndSpeech';
import {
  fetchLiveOsmRoadContext,
  findClosestOfflineRoad,
  generateSampleOsmXml,
  parseOfflineOsmFile,
} from './utils/osmParser';
import { INITIAL_SAMPLE_HAZARDS, PRESET_ROUTES } from './data/hungarianRoutes';
import { LaneVisualizer } from './components/LaneVisualizer';
import { OsmMapView } from './components/OsmMapView';
import { HazardCaptureModal } from './components/HazardCaptureModal';

const STORAGE_KEY_HAZARDS = 'utinfo_saved_hazards_v1';
const STORAGE_KEY_SETTINGS = 'utinfo_app_settings_v1';

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  fontScale: 'large',
  ttsEnabled: true,
  ttsSpeakStreetChanges: true,
  ttsSpeakObstacles: true,
  ttsSpeakHazards: true,
  ttsRate: 1.0,
  alertDistanceMeters: 250,
  enabledObstacles: {
    crosswalk: true,
    railway: true,
    speed_bump: true,
    traffic_signals: true,
    speed_limit: true,
  },
  useLiveOsmApi: true,
};

export default function App() {
  // Settings state
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SETTINGS);
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    } catch {
      // ignore storage errors
    }
  }, [settings]);

  // Saved Hazards state
  const [hazards, setHazards] = useState<HazardReport[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_HAZARDS);
      return saved ? JSON.parse(saved) : INITIAL_SAMPLE_HAZARDS;
    } catch {
      return INITIAL_SAMPLE_HAZARDS;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_HAZARDS, JSON.stringify(hazards));
    } catch {
      // ignore storage errors
    }
  }, [hazards]);

  // Active Navigation Tab ('cockpit' | 'hazards' | 'osm_offline' | 'settings')
  const [activeTab, setActiveTab] = useState<'cockpit' | 'hazards' | 'osm_offline' | 'settings'>('cockpit');

  // Mobile-specific single-window cockpit view selector & hamburger menu state
  const [mobileCockpitPanel, setMobileCockpitPanel] = useState<'lanes' | 'obstacles' | 'map'>('lanes');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  // Driving Route & GPS State
  const [selectedRouteId, setSelectedRouteId] = useState<string>(PRESET_ROUTES[0].id);
  const currentPresetRoute = useMemo(
    () => PRESET_ROUTES.find((r) => r.id === selectedRouteId) || PRESET_ROUTES[0],
    [selectedRouteId]
  );

  const [waypointIndex, setWaypointIndex] = useState<number>(0);
  const [isSimulatingDrive, setIsSimulatingDrive] = useState<boolean>(false);
  const [usingRealGps, setUsingRealGps] = useState<boolean>(false);
  const [gpsStatusMsg, setGpsStatusMsg] = useState<string>('Szimulációs tesztút aktív');

  const [lat, setLat] = useState<number>(currentPresetRoute.waypoints[0].lat);
  const [lng, setLng] = useState<number>(currentPresetRoute.waypoints[0].lng);
  const [heading, setHeading] = useState<number>(52);
  const [speedKmh, setSpeedKmh] = useState<number>(currentPresetRoute.waypoints[0].speedKmh);

  const [roadContext, setRoadContext] = useState<RoadContextInfo>({
    settlement: currentPresetRoute.waypoints[0].settlement,
    postcode: currentPresetRoute.waypoints[0].postcode,
    street: currentPresetRoute.waypoints[0].street,
    houseNumber: currentPresetRoute.waypoints[0].houseNumber,
    roadRef: currentPresetRoute.waypoints[0].roadRef,
    totalLanes: currentPresetRoute.waypoints[0].totalLanes,
    forwardLanes: currentPresetRoute.waypoints[0].forwardLanes,
    backwardLanes: currentPresetRoute.waypoints[0].backwardLanes,
    maxSpeed: currentPresetRoute.waypoints[0].maxSpeed,
    surface: 'aszfalt',
    oneway: false,
    source: 'simulation',
  });

  // Active lane & lateral selection for instant capture
  const [selectedForwardLanes, setSelectedForwardLanes] = useState<number[]>([2]);
  const [selectedLateral, setSelectedLateral] = useState<LateralPosition>('right_edge');

  // Offline OSM file state
  const [offlineDataset, setOfflineDataset] = useState<OfflineOsmDataset | null>(null);
  const [uploadStatusMsg, setUploadStatusMsg] = useState<string>('');

  // Modal state for two-step instant GPS capture or editing existing hazard
  const [activeDraftHazard, setActiveDraftHazard] = useState<HazardReport | null>(null);
  const [isEditingExistingHazard, setIsEditingExistingHazard] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Direction Filter in Hazard Log
  const [filterSameDirectionOnly, setFilterSameDirectionOnly] = useState<boolean>(false);

  // Spoken alerts tracking so we don't repeat the same obstacle/street endlessly
  const lastSpokenStreetRef = useRef<string>('');
  const spokenIdsRef = useRef<Set<string>>(new Set());
  const watchIdRef = useRef<number | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  // Switch preset route handler
  const handleSelectPresetRoute = (routeId: string) => {
    const found = PRESET_ROUTES.find((r) => r.id === routeId);
    if (!found) return;
    setSelectedRouteId(routeId);
    setWaypointIndex(0);
    const wp = found.waypoints[0];
    const nextWp = found.waypoints[1] || wp;
    const initialBearing = calculateBearing(wp.lat, wp.lng, nextWp.lat, nextWp.lng);

    setLat(wp.lat);
    setLng(wp.lng);
    setHeading(initialBearing);
    setSpeedKmh(wp.speedKmh);
    setRoadContext({
      settlement: wp.settlement,
      postcode: wp.postcode,
      street: wp.street,
      houseNumber: wp.houseNumber,
      roadRef: wp.roadRef,
      totalLanes: wp.totalLanes,
      forwardLanes: wp.forwardLanes,
      backwardLanes: wp.backwardLanes,
      maxSpeed: wp.maxSpeed,
      surface: 'aszfalt',
      oneway: wp.backwardLanes === 0,
      source: 'simulation',
    });
    setSelectedForwardLanes([Math.min(2, wp.forwardLanes)]);
    spokenIdsRef.current.clear();
  };

  // Advance along preset route during drive simulation
  useEffect(() => {
    if (!isSimulatingDrive || usingRealGps) return;

    const timer = setInterval(() => {
      setWaypointIndex((prevIdx) => {
        const wps = currentPresetRoute.waypoints;
        const nextIdx = (prevIdx + 1) % wps.length;
        const currentWp = wps[prevIdx];
        const nextWp = wps[nextIdx];
        const bearing =
          nextIdx > prevIdx
            ? calculateBearing(currentWp.lat, currentWp.lng, nextWp.lat, nextWp.lng)
            : heading;

        setLat(nextWp.lat);
        setLng(nextWp.lng);
        setHeading(bearing);
        setSpeedKmh(nextWp.speedKmh);

        // Check if offline OSM dataset overrides road context
        const offlineRoad = findClosestOfflineRoad(nextWp.lat, nextWp.lng, offlineDataset);
        if (offlineRoad) {
          setRoadContext({
            settlement: offlineRoad.settlement || nextWp.settlement,
            postcode: offlineRoad.postcode || nextWp.postcode,
            street: offlineRoad.name,
            houseNumber: nextWp.houseNumber,
            roadRef: offlineRoad.ref || nextWp.roadRef,
            totalLanes: offlineRoad.lanes,
            forwardLanes: offlineRoad.lanesForward,
            backwardLanes: offlineRoad.lanesBackward,
            maxSpeed: offlineRoad.maxSpeed,
            surface: 'aszfalt (Offline OSM)',
            oneway: offlineRoad.lanesBackward === 0,
            source: 'osm_offline',
          });
        } else {
          setRoadContext({
            settlement: nextWp.settlement,
            postcode: nextWp.postcode,
            street: nextWp.street,
            houseNumber: nextWp.houseNumber,
            roadRef: nextWp.roadRef,
            totalLanes: nextWp.totalLanes,
            forwardLanes: nextWp.forwardLanes,
            backwardLanes: nextWp.backwardLanes,
            maxSpeed: nextWp.maxSpeed,
            surface: 'aszfalt',
            oneway: nextWp.backwardLanes === 0,
            source: 'simulation',
          });
        }

        return nextIdx;
      });
    }, 3800);

    return () => clearInterval(timer);
  }, [isSimulatingDrive, usingRealGps, currentPresetRoute, offlineDataset, heading]);

  // Real browser Geolocation toggle
  const toggleRealGps = () => {
    if (usingRealGps) {
      if (watchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      watchIdRef.current = null;
      setUsingRealGps(false);
      setGpsStatusMsg('Szimulációs tesztút aktív');
      return;
    }

    if (!('geolocation' in navigator)) {
      showToast('A böngésző nem támogatja a GPS helymeghatározást.');
      return;
    }

    setIsSimulatingDrive(false);
    setUsingRealGps(true);
    setGpsStatusMsg('Valós GPS jel keresése...');

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const newLat = pos.coords.latitude;
        const newLng = pos.coords.longitude;
        const newHeading =
          pos.coords.heading !== null && !isNaN(pos.coords.heading)
            ? Math.round(pos.coords.heading)
            : calculateBearing(lat, lng, newLat, newLng) || heading;
        const newSpeed =
          pos.coords.speed !== null && !isNaN(pos.coords.speed)
            ? Math.round(pos.coords.speed * 3.6)
            : 0;

        setLat(newLat);
        setLng(newLng);
        setHeading(newHeading);
        setSpeedKmh(newSpeed);
        setGpsStatusMsg(`Valós GPS aktív (±${Math.round(pos.coords.accuracy)}m)`);

        // 1. Check Offline OSM file first
        const offlineRoad = findClosestOfflineRoad(newLat, newLng, offlineDataset);
        if (offlineRoad) {
          setRoadContext((prev) => ({
            ...prev,
            settlement: offlineRoad.settlement || prev.settlement,
            postcode: offlineRoad.postcode || prev.postcode,
            street: offlineRoad.name,
            roadRef: offlineRoad.ref,
            totalLanes: offlineRoad.lanes,
            forwardLanes: offlineRoad.lanesForward,
            backwardLanes: offlineRoad.lanesBackward,
            maxSpeed: offlineRoad.maxSpeed,
            source: 'osm_offline',
          }));
          return;
        }

        // 2. Otherwise query live OpenStreetMap Nominatim API if enabled
        if (settings.useLiveOsmApi) {
          const liveRes = await fetchLiveOsmRoadContext(newLat, newLng);
          if (liveRes && liveRes.context) {
            setRoadContext((prev) => ({
              ...prev,
              ...liveRes.context,
              source: 'osm_live',
            }));
          }
        }
      },
      (err) => {
        setGpsStatusMsg(`GPS hiba (${err.message}) — Visszaállítva tesztútra`);
        setUsingRealGps(false);
      },
      { enableHighAccuracy: true, maximumAge: 3000 }
    );
  };

  // Combine obstacles from preset route + uploaded offline OSM file, filtered by user settings
  const activeObstacles = useMemo(() => {
    const baseList = [
      ...currentPresetRoute.obstacles,
      ...(offlineDataset ? offlineDataset.obstacles : []),
    ];

    return baseList
      .filter((obs) => settings.enabledObstacles[obs.type])
      .map((obs) => ({
        ...obs,
        distanceMeters: calculateDistanceMeters(lat, lng, obs.lat, obs.lng),
      }))
      .sort((a, b) => (a.distanceMeters || 0) - (b.distanceMeters || 0));
  }, [currentPresetRoute, offlineDataset, settings.enabledObstacles, lat, lng]);

  // Compute distances to all saved hazards
  const hazardsWithDistance = useMemo(() => {
    return hazards
      .map((h) => ({
        ...h,
        distanceMeters: calculateDistanceMeters(lat, lng, h.lat, h.lng),
        matchesCurrentDirection: !h.appliesToDirectionOnly || isSameDrivingDirection(heading, h.heading),
      }))
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
  }, [hazards, lat, lng, heading]);

  // Hungarian TTS Auto-Readout for Street Changes, Approaching Obstacles & Same-Direction Hazards
  useEffect(() => {
    if (!settings.ttsEnabled) return;

    // 1. Announce street change
    const streetKey = `${roadContext.settlement}-${roadContext.street}-${roadContext.houseNumber}`;
    if (
      settings.ttsSpeakStreetChanges &&
      lastSpokenStreetRef.current !== streetKey &&
      isSimulatingDrive
    ) {
      lastSpokenStreetRef.current = streetKey;
      const speech = `${roadContext.settlement}, ${roadContext.street} ${roadContext.houseNumber}. ${roadContext.forwardLanes} menetirány szerinti sáv.`;
      speakHungarian(speech, true, settings.ttsRate);
      return;
    }

    // 2. Announce approaching obstacle within alertDistanceMeters
    if (settings.ttsSpeakObstacles) {
      const closeObs = activeObstacles.find(
        (o) =>
          (o.distanceMeters ?? 9999) <= settings.alertDistanceMeters &&
          !spokenIdsRef.current.has(o.id)
      );
      if (closeObs) {
        spokenIdsRef.current.add(closeObs.id);
        const label = OBSTACLE_LABELS[closeObs.type]?.speechLabel || closeObs.name;
        speakHungarian(
          `${label}, ${closeObs.distanceMeters} méterre.`,
          true,
          settings.ttsRate
        );
        return;
      }
    }

    // 3. Announce approaching road hazard if it matches our travel direction (right-hand lanes)
    if (settings.ttsSpeakHazards) {
      const closeHaz = hazardsWithDistance.find(
        (h) =>
          h.matchesCurrentDirection &&
          h.distanceMeters <= settings.alertDistanceMeters &&
          !spokenIdsRef.current.has(h.id)
      );
      if (closeHaz) {
        spokenIdsRef.current.add(closeHaz.id);
        const typeName = HAZARD_TYPE_LABELS[closeHaz.type]?.shortLabel || 'Úthiba';
        const laneStr = closeHaz.lanesAffected.map((l) => `${l}. sáv`).join(' és ');
        const posStr = LATERAL_POSITION_LABELS[closeHaz.lateralPosition]?.short || '';
        speakHungarian(
          `Figyelem! ${typeName} ${closeHaz.distanceMeters} méterre, ${laneStr}, ${posStr}.`,
          true,
          settings.ttsRate
        );
      }
    }
  }, [
    lat,
    lng,
    roadContext,
    activeObstacles,
    hazardsWithDistance,
    settings,
    isSimulatingDrive,
  ]);

  // INSTANT GPS & HEADING LOCK WHEN USER PRESSES ANY HAZARD BUTTON
  const handleInstantHazardTrigger = (
    presetType: HazardType = 'pothole',
    overrideLane?: number,
    overrideLateral?: LateralPosition
  ) => {
    const exactNow = Date.now();
    const cardinalInfo = getHungarianCardinal(heading);
    const lanesToUse = overrideLane
      ? [overrideLane]
      : selectedForwardLanes.filter((l) => l <= roadContext.forwardLanes).length > 0
      ? selectedForwardLanes.filter((l) => l <= roadContext.forwardLanes)
      : [1];
    const lateralToUse = overrideLateral || selectedLateral;

    const lockedDraft: HazardReport = {
      id: `haz-${exactNow}`,
      timestamp: exactNow,
      lat, // Locked immediately at the moment of button press!
      lng, // Locked immediately at the moment of button press!
      heading, // Locked travel direction!
      headingCardinal: cardinalInfo.short,
      settlement: roadContext.settlement,
      postcode: roadContext.postcode,
      street: roadContext.street,
      houseNumber: roadContext.houseNumber,
      roadRef: roadContext.roadRef,
      type: presetType,
      lanesAffected: lanesToUse,
      totalLanesAtLocation: roadContext.forwardLanes,
      opposingLanesAtLocation: roadContext.backwardLanes,
      lateralPosition: lateralToUse,
      severity: 'medium',
      notes: '',
      appliesToDirectionOnly: true,
    };

    setIsEditingExistingHazard(false);
    setActiveDraftHazard(lockedDraft);

    if (settings.ttsEnabled) {
      const typeLabel = HAZARD_TYPE_LABELS[presetType]?.shortLabel || 'Úthiba';
      speakHungarian(
        `${typeLabel} GPS pozíció és ${cardinalInfo.full}i menetirány rögzítve. Kérem erősítse meg a sávot és a részleteket.`,
        true,
        settings.ttsRate
      );
    }
  };

  // Save new or edited hazard from Modal
  const handleSaveHazardModal = (savedReport: HazardReport) => {
    setHazards((prev) => {
      const exists = prev.some((h) => h.id === savedReport.id);
      if (exists) {
        return prev.map((h) => (h.id === savedReport.id ? savedReport : h));
      }
      return [savedReport, ...prev];
    });
    setActiveDraftHazard(null);
    const typeName = HAZARD_TYPE_LABELS[savedReport.type]?.shortLabel || 'Úthiba';
    showToast(
      `${typeName} elmentve (${savedReport.postcode} ${savedReport.settlement}, ${savedReport.street} — ${savedReport.lanesAffected.join(', ')}. sáv)`
    );
  };

  const handleDeleteHazard = (id: string) => {
    setHazards((prev) => prev.filter((h) => h.id !== id));
    setActiveDraftHazard(null);
    showToast('Úthiba bejegyzés törölve.');
  };

  // Handle Offline OSM / GeoJSON File Upload
  const handleOfflineFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadStatusMsg('Fájl feldolgozása folyamatban...');
      const parsed = await parseOfflineOsmFile(file);
      setOfflineDataset(parsed);
      setUploadStatusMsg(
        `Sikeresen betöltve: ${parsed.fileName} (${parsed.wayCount} útszakasz, ${parsed.obstacles.length} akadálypont)`
      );
      showToast(`Offline OSM betöltve: ${parsed.wayCount} útszakasz aktív!`);

      // If dataset has road coordinates, jump to the first road so user can see it immediately
      if (parsed.roads.length > 0 && parsed.roads[0].coords.length > 0) {
        const [firstLat, firstLng] = parsed.roads[0].coords[0];
        setLat(firstLat);
        setLng(firstLng);
        const r = parsed.roads[0];
        setRoadContext({
          settlement: r.settlement || 'Offline OSM Terület',
          postcode: r.postcode || '1061',
          street: r.name,
          houseNumber: '1.',
          roadRef: r.ref || 'OSM',
          totalLanes: r.lanes,
          forwardLanes: r.lanesForward,
          backwardLanes: r.lanesBackward,
          maxSpeed: r.maxSpeed,
          surface: 'aszfalt (Offline OSM)',
          oneway: r.lanesBackward === 0,
          source: 'osm_offline',
        });
      }
    } catch {
      setUploadStatusMsg('Hiba az OSM/GeoJSON fájl olvasásakor. Ellenőrizze a formátumot.');
    }
  };

  // Download sample .osm file so user can test offline upload anytime
  const handleDownloadSampleOsm = () => {
    const xml = generateSampleOsmXml();
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'budapest_andrassy_minta.osm';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Minta .osm fájl letöltve! Most feltöltheti az Offline OSM fülön.');
  };

  // Export recorded hazards as GeoJSON
  const handleExportHazardsGeoJson = () => {
    const geojson = {
      type: 'FeatureCollection',
      generator: 'UtInfo-SavAsszisztens',
      exportedAt: new Date().toISOString(),
      features: hazards.map((h) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [h.lng, h.lat],
        },
        properties: {
          id: h.id,
          timestamp: new Date(h.timestamp).toISOString(),
          type: h.type,
          typeLabel: HAZARD_TYPE_LABELS[h.type]?.label,
          heading: h.heading,
          headingCardinal: h.headingCardinal,
          appliesToDirectionOnly: h.appliesToDirectionOnly,
          lanesAffected: h.lanesAffected,
          totalForwardLanes: h.totalLanesAtLocation,
          lateralPosition: h.lateralPosition,
          lateralLabel: LATERAL_POSITION_LABELS[h.lateralPosition]?.label,
          postcode: h.postcode,
          settlement: h.settlement,
          street: h.street,
          houseNumber: h.houseNumber,
          roadRef: h.roadRef,
          notes: h.notes,
        },
      })),
    };
    const blob = new Blob([JSON.stringify(geojson, null, 2)], {
      type: 'application/geo+json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `uthibak_export_${new Date().toISOString().slice(0, 10)}.geojson`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Úthibák sikeresen exportálva GeoJSON formátumban!');
  };

  // Speak current road location & upcoming alerts on demand
  const handleSpeakCurrentSummary = () => {
    const cardinal = getHungarianCardinal(heading).full;
    const nextObs = activeObstacles[0];
    const nextHaz = hazardsWithDistance.find((h) => h.matchesCurrentDirection);

    let text = `Jelenlegi helyzet: ${roadContext.postcode} ${roadContext.settlement}, ${roadContext.street} ${roadContext.houseNumber}. `;
    if (roadContext.roadRef) {
      text += `Útszám: ${roadContext.roadRef}. `;
    }
    text += `Menetirány: ${cardinal}, ${roadContext.forwardLanes} sáv a menetirányban, megengedett sebesség ${roadContext.maxSpeed} kilométer per óra. `;

    if (nextObs && (nextObs.distanceMeters ?? 9999) < 800) {
      text += `Következő akadály: ${OBSTACLE_LABELS[nextObs.type]?.label || nextObs.name}, ${nextObs.distanceMeters} méterre. `;
    }
    if (nextHaz && nextHaz.distanceMeters < 800) {
      const hType = HAZARD_TYPE_LABELS[nextHaz.type]?.shortLabel || 'Úthiba';
      text += `Rögzített ${hType} a menetirányban ${nextHaz.distanceMeters} méterre, a ${nextHaz.lanesAffected.join(' és ')}. sávban.`;
    }

    speakHungarian(text, true, settings.ttsRate);
  };

  const isDark = settings.theme === 'dark';
  const cardinalObj = getHungarianCardinal(heading);

  const fontScaleClass =
    settings.fontScale === 'xl'
      ? 'text-lg sm:text-xl'
      : settings.fontScale === 'large'
      ? 'text-base sm:text-lg'
      : 'text-sm sm:text-base';

  const routePolylineCoords: [number, number][] = useMemo(
    () => currentPresetRoute.waypoints.map((w) => [w.lat, w.lng]),
    [currentPresetRoute]
  );

  // Count close obstacles + hazards for mobile badge
  const nearbyAlertCount = useMemo(() => {
    const obsCount = activeObstacles.filter((o) => (o.distanceMeters ?? 9999) <= 600).length;
    const hazCount = hazardsWithDistance.filter(
      (h) => h.matchesCurrentDirection && h.distanceMeters <= 600
    ).length;
    return obsCount + hazCount;
  }, [activeObstacles, hazardsWithDistance]);

  return (
    <div
      className={`min-h-screen transition-colors duration-200 ${
        isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'
      } ${fontScaleClass}`}
    >
      {/* Top Bar Contract: Zone 1 Brand | Zone 2 Nav Links (Desktop) | Zone 3 Actions (Desktop + Hamburger on Mobile) */}
      <header
        className={`sticky top-0 z-30 border-b backdrop-blur-md transition-colors ${
          isDark
            ? 'bg-slate-950/90 border-slate-800 text-white'
            : 'bg-white/95 border-slate-200 text-slate-900'
        }`}
      >
        <div className="max-w-[1440px] mx-auto px-3 sm:px-6 h-12 sm:h-16 flex items-center justify-between gap-3">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="#cockpit"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('cockpit');
              setMobileMenuOpen(false);
            }}
            className="text-lg sm:text-2xl font-extrabold tracking-tight font-display whitespace-nowrap text-amber-500"
          >
            ÚtInfó SávAsszisztens
          </a>

          {/* Zone 2: Desktop Navigation links */}
          <nav className="hidden md:flex items-center gap-6 text-base font-bold">
            <button
              type="button"
              onClick={() => setActiveTab('cockpit')}
              className={`py-1 transition-colors whitespace-nowrap ${
                activeTab === 'cockpit'
                  ? 'text-amber-500 underline underline-offset-8 decoration-2'
                  : 'opacity-75 hover:opacity-100'
              }`}
            >
              Műszerfal & Sávok
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('hazards')}
              className={`py-1 transition-colors whitespace-nowrap ${
                activeTab === 'hazards'
                  ? 'text-amber-500 underline underline-offset-8 decoration-2'
                  : 'opacity-75 hover:opacity-100'
              }`}
            >
              Úthibák ({hazards.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('osm_offline')}
              className={`py-1 transition-colors whitespace-nowrap ${
                activeTab === 'osm_offline'
                  ? 'text-amber-500 underline underline-offset-8 decoration-2'
                  : 'opacity-75 hover:opacity-100'
              }`}
            >
              Offline OSM Fájl
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`py-1 transition-colors whitespace-nowrap ${
                activeTab === 'settings'
                  ? 'text-amber-500 underline underline-offset-8 decoration-2'
                  : 'opacity-75 hover:opacity-100'
              }`}
            >
              Akadályok & Beállítások
            </button>
          </nav>

          {/* Zone 3: Primary quick actions (Desktop buttons + Mobile Hamburger Button) */}
          <div className="flex items-center gap-2">
            {/* Desktop TTS & Theme buttons */}
            <button
              type="button"
              onClick={handleSpeakCurrentSummary}
              className={`hidden md:flex min-h-[44px] px-3.5 py-2 rounded-xl font-bold text-sm items-center gap-2 border transition-colors whitespace-nowrap ${
                isDark
                  ? 'bg-slate-900 border-slate-700 text-amber-400 hover:bg-slate-800'
                  : 'bg-slate-100 border-slate-300 text-slate-900 hover:bg-slate-200'
              }`}
              title="Aktuális helyzet és akadályok hangos felolvasása"
            >
              {settings.ttsEnabled ? (
                <Volume2 className="w-5 h-5 text-amber-500 shrink-0" />
              ) : (
                <VolumeX className="w-5 h-5 text-slate-400 shrink-0" />
              )}
              <span>Felolvasás</span>
            </button>

            <button
              type="button"
              onClick={() =>
                setSettings((s) => ({
                  ...s,
                  theme: s.theme === 'dark' ? 'light' : 'dark',
                }))
              }
              className={`hidden md:flex min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl font-bold text-sm items-center justify-center gap-2 border transition-colors whitespace-nowrap ${
                isDark
                  ? 'bg-slate-900 border-slate-700 text-slate-100 hover:bg-slate-800'
                  : 'bg-slate-900 border-slate-900 text-white hover:bg-slate-800'
              }`}
              aria-label="Téma váltása (Világos / Sötét)"
            >
              {isDark ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5" />}
              <span className="hidden lg:inline">{isDark ? 'Világos mód' : 'Sötét mód'}</span>
            </button>

            {/* Mobile Hamburger Trigger Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className={`md:hidden min-h-[40px] min-w-[40px] px-2.5 rounded-xl border flex items-center justify-center gap-1.5 font-bold text-xs ${
                isDark
                  ? 'bg-slate-900 border-slate-700 text-amber-400'
                  : 'bg-slate-100 border-slate-300 text-slate-900'
              }`}
              aria-label="Menü megnyitása"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              <span>Menü</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Hamburger Drawer Overlay (Contains Top Bar controls, Navigation, Route Selector, GPS & TTS on Mobile) */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex justify-end">
          <div
            className={`w-full max-w-sm h-full overflow-y-auto p-5 flex flex-col justify-between border-l ${
              isDark
                ? 'bg-slate-900 border-slate-800 text-slate-100'
                : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="space-y-5">
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b pb-3 border-slate-200 dark:border-slate-800">
                <span className="text-lg font-extrabold text-amber-500 font-display">
                  ÚtInfó Vezérlőmenü
                </span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="min-h-[42px] min-w-[42px] rounded-xl border border-slate-700 flex items-center justify-center"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Main Page Views Selector */}
              <div className="space-y-1.5">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Képernyők és Funkciók
                </div>
                {(
                  [
                    { id: 'cockpit', label: 'Műszerfal & Sávasszisztens', icon: Compass },
                    { id: 'hazards', label: `Rögzített Úthibák (${hazards.length})`, icon: ListFilter },
                    { id: 'osm_offline', label: 'Offline OSM Fájl Betöltése', icon: MapIcon },
                    { id: 'settings', label: 'Akadályok & Beállítások', icon: Sliders },
                  ] as const
                ).map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full min-h-[46px] px-3.5 py-2.5 rounded-xl font-bold text-left flex items-center gap-3 transition-colors ${
                        active
                          ? 'bg-amber-500 text-slate-950'
                          : isDark
                          ? 'bg-slate-950 text-slate-200 hover:bg-slate-800'
                          : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                      }`}
                    >
                      <Icon className="w-5 h-5 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Driving Simulation & Real GPS Controls inside Mobile Menu */}
              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Jármű Haladás & GPS Forrás
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsSimulatingDrive((prev) => !prev);
                      setMobileMenuOpen(false);
                    }}
                    disabled={usingRealGps}
                    className={`min-h-[46px] px-3 py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 ${
                      isSimulatingDrive
                        ? 'bg-emerald-500 text-slate-950'
                        : isDark
                        ? 'bg-slate-950 border border-slate-800 text-slate-200'
                        : 'bg-slate-100 text-slate-900'
                    }`}
                  >
                    {isSimulatingDrive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    <span>{isSimulatingDrive ? 'Szünet' : 'Teszt vezetés'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      toggleRealGps();
                      setMobileMenuOpen(false);
                    }}
                    className={`min-h-[46px] px-3 py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border ${
                      usingRealGps
                        ? 'bg-sky-500 text-slate-950 border-sky-400'
                        : isDark
                        ? 'bg-slate-950 border-slate-800 text-slate-200'
                        : 'bg-slate-100 border-slate-300 text-slate-900'
                    }`}
                  >
                    <LocateFixed className="w-4 h-4" />
                    <span>{usingRealGps ? 'GPS Aktív' : 'Valós GPS'}</span>
                  </button>
                </div>

                {/* Preset Route Switcher */}
                <div className="space-y-1.5 pt-2">
                  <div className="text-xs text-slate-400 font-semibold">Teszt útvonal választása:</div>
                  {PRESET_ROUTES.map((rt) => (
                    <button
                      key={rt.id}
                      type="button"
                      onClick={() => {
                        handleSelectPresetRoute(rt.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full p-2.5 rounded-xl text-left text-xs font-bold border ${
                        selectedRouteId === rt.id
                          ? 'bg-amber-500/20 border-amber-400 text-amber-400'
                          : isDark
                          ? 'bg-slate-950 border-slate-800 text-slate-300'
                          : 'bg-slate-50 border-slate-200 text-slate-700'
                      }`}
                    >
                      {rt.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Voice Readout & Theme Actions */}
              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Hangbemondás és Téma
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      handleSpeakCurrentSummary();
                      setMobileMenuOpen(false);
                    }}
                    className={`min-h-[46px] px-3 py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border ${
                      isDark
                        ? 'bg-slate-950 border-slate-700 text-amber-400'
                        : 'bg-slate-100 border-slate-300 text-slate-900'
                    }`}
                  >
                    <Volume2 className="w-4 h-4" />
                    <span>Felolvasás most</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setSettings((s) => ({
                        ...s,
                        theme: s.theme === 'dark' ? 'light' : 'dark',
                      }))
                    }
                    className={`min-h-[46px] px-3 py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border ${
                      isDark
                        ? 'bg-slate-950 border-slate-700 text-slate-100'
                        : 'bg-slate-900 border-slate-900 text-white'
                    }`}
                  >
                    {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
                    <span>{isDark ? 'Világos téma' : 'Sötét téma'}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 text-xs font-mono-tabular text-slate-400">
              GPS: {lat.toFixed(5)}, {lng.toFixed(5)} · {heading}° ({cardinalObj.short})
            </div>
          </div>
        </div>
      )}

      {/* Notification Toast */}
      {toastMessage && (
        <div className="fixed top-14 sm:top-20 right-3 sm:right-4 z-50 max-w-md bg-emerald-600 text-white px-4 py-2.5 rounded-2xl shadow-xl border border-emerald-400 flex items-center gap-2.5 font-bold text-xs sm:text-base">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Content Container */}
      <main className="max-w-[1440px] mx-auto px-2.5 sm:px-6 pt-2 sm:pt-4 pb-3 md:pb-10">
        {/* TOP TELEMETRY BANNER: Ultra-compact single-strip on mobile, full size on desktop */}
        <section
          className={`rounded-2xl border p-2.5 sm:p-6 mb-2.5 sm:mb-5 transition-colors ${
            isDark
              ? 'bg-slate-900 border-slate-800'
              : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          {/* Mobile Compact Telemetry Header (Only visible below md) */}
          <div className="flex md:hidden items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-500 truncate">
                <span className="font-mono-tabular">{roadContext.postcode}</span>
                <span>{roadContext.settlement}</span>
                {roadContext.roadRef && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{roadContext.roadRef}</span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span className="font-mono-tabular text-slate-300">
                  {heading}° {cardinalObj.short}
                </span>
              </div>

              <div className="text-lg font-extrabold tracking-tight leading-snug truncate">
                {roadContext.street}{' '}
                <span className="text-amber-500 font-mono-tabular">{roadContext.houseNumber}</span>
              </div>
            </div>

            {/* Mobile Compact Speed Sign + Play/Pause quick button */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-10 h-10 rounded-full border-4 border-red-600 bg-white text-slate-950 flex items-center justify-center font-mono-tabular font-extrabold text-sm">
                {roadContext.maxSpeed}
              </div>
              <div className="text-right font-mono-tabular">
                <div className="text-base font-extrabold leading-none">{speedKmh}</div>
                <div className="text-[10px] text-slate-400">km/h</div>
              </div>
              <button
                type="button"
                onClick={() => setIsSimulatingDrive((prev) => !prev)}
                className={`min-h-[38px] min-w-[38px] rounded-xl flex items-center justify-center ${
                  isSimulatingDrive
                    ? 'bg-emerald-500 text-slate-950'
                    : isDark
                    ? 'bg-slate-800 text-slate-200'
                    : 'bg-slate-200 text-slate-800'
                }`}
                title="Haladás indítása / szüneteltetése"
              >
                {isSimulatingDrive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Desktop / Tablet Full Telemetry Header (Visible on md and up) */}
          <div className="hidden md:flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2 text-sm sm:text-base font-bold text-amber-500">
                <span className="font-mono-tabular text-base sm:text-lg">
                  {roadContext.postcode}
                </span>
                <span aria-hidden="true">·</span>
                <span className="text-base sm:text-xl">{roadContext.settlement}</span>
                {roadContext.roadRef && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="underline decoration-amber-500/60 underline-offset-4">
                      Útszám: {roadContext.roadRef}
                    </span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span className="text-xs font-mono-tabular opacity-75">
                  {roadContext.source === 'osm_offline'
                    ? 'OFFLINE OSM ADAT'
                    : roadContext.source === 'osm_live'
                    ? 'ÉLŐ OSM ADAT'
                    : 'OSM ÚTVONAL'}
                </span>
              </div>

              <h1 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight">
                {roadContext.street}{' '}
                <span className="text-amber-500 font-mono-tabular">{roadContext.houseNumber}</span>
              </h1>

              <div
                className={`flex flex-wrap items-center gap-3 text-xs sm:text-sm font-mono-tabular ${
                  isDark ? 'text-slate-400' : 'text-slate-600'
                }`}
              >
                <span>
                  GPS: {lat.toFixed(5)}, {lng.toFixed(5)}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Menetirány: {heading}° ({cardinalObj.full})
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Sávok: {roadContext.forwardLanes} saját / {roadContext.backwardLanes} szembe
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-14 h-14 sm:w-16 sm:h-16 rounded-full border-[5px] border-red-600 bg-white text-slate-950 flex items-center justify-center font-mono-tabular font-extrabold text-xl sm:text-2xl shadow-sm shrink-0"
                  title="Megengedett legnagyobb sebesség"
                >
                  {roadContext.maxSpeed}
                </div>
                <div className="text-left">
                  <div className="text-xs uppercase tracking-wider text-slate-400 font-bold">
                    Sebesség
                  </div>
                  <div className="text-2xl sm:text-3xl font-mono-tabular font-extrabold">
                    {speedKmh} <span className="text-sm font-normal">km/h</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsSimulatingDrive((prev) => !prev)}
                  disabled={usingRealGps}
                  className={`min-h-[48px] px-4 py-2.5 rounded-xl font-bold text-sm sm:text-base flex items-center gap-2 transition-all whitespace-nowrap ${
                    isSimulatingDrive
                      ? 'bg-emerald-500 text-slate-950 shadow-md'
                      : isDark
                      ? 'bg-slate-800 text-slate-100 hover:bg-slate-700'
                      : 'bg-slate-200 text-slate-900 hover:bg-slate-300'
                  } ${usingRealGps ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  {isSimulatingDrive ? (
                    <>
                      <Pause className="w-5 h-5 shrink-0" />
                      <span>Haladás szüneteltetése</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5 shrink-0" />
                      <span>Autós haladás indítása</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={toggleRealGps}
                  className={`min-h-[48px] px-4 py-2.5 rounded-xl font-bold text-sm sm:text-base flex items-center gap-2 border transition-all whitespace-nowrap ${
                    usingRealGps
                      ? 'bg-sky-500 text-slate-950 border-sky-400'
                      : isDark
                      ? 'bg-slate-950 border-slate-700 text-slate-200 hover:bg-slate-800'
                      : 'bg-slate-50 border-slate-300 text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  <LocateFixed className="w-5 h-5 shrink-0" />
                  <span>{usingRealGps ? 'Valós GPS Aktív' : 'Valós GPS'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Desktop Route Selector Strip (Hidden on mobile, moved to Hamburger menu) */}
          <div className="hidden md:flex mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-slate-400">Teszt útvonal:</span>
              {PRESET_ROUTES.map((rt) => (
                <button
                  key={rt.id}
                  type="button"
                  onClick={() => handleSelectPresetRoute(rt.id)}
                  className={`min-h-[38px] px-3 py-1.5 rounded-lg font-bold transition-colors ${
                    selectedRouteId === rt.id
                      ? 'bg-amber-500 text-slate-950'
                      : isDark
                      ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {rt.name}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 text-slate-400 font-mono-tabular">
              <Navigation className="w-4 h-4 text-amber-500" />
              <span>{gpsStatusMsg}</span>
            </div>
          </div>
        </section>

        {/* VIEW 1: COCKPIT (Single-window selectable view on Mobile, Full 12-col layout on Desktop) */}
        {activeTab === 'cockpit' && (
          <>
            {/* MOBILE-ONLY VIEW SELECTOR BAR: Lets user pick what they want to see in the single mobile window */}
            <div
              className={`lg:hidden grid grid-cols-3 gap-1.5 p-1 rounded-xl border mb-2.5 ${
                isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
              }`}
            >
              <button
                type="button"
                onClick={() => setMobileCockpitPanel('lanes')}
                className={`min-h-[40px] rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-colors ${
                  mobileCockpitPanel === 'lanes'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Compass className="w-4 h-4 shrink-0" />
                <span>Sávok & Jelölés</span>
              </button>

              <button
                type="button"
                onClick={() => setMobileCockpitPanel('obstacles')}
                className={`min-h-[40px] rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-colors ${
                  mobileCockpitPanel === 'obstacles'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Radar className="w-4 h-4 shrink-0" />
                <span>Akadályok ({nearbyAlertCount})</span>
              </button>

              <button
                type="button"
                onClick={() => setMobileCockpitPanel('map')}
                className={`min-h-[40px] rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-colors ${
                  mobileCockpitPanel === 'map'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <MapIcon className="w-4 h-4 shrink-0" />
                <span>Térkép</span>
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-6 items-start">
              {/* Left 7 Columns: Instant Hazard Trigger (Always visible in mobile cockpit) + Lane Visualizer */}
              <div className="lg:col-span-7 flex flex-col gap-2.5 sm:gap-5">
                {/* Instant GPS Capture Action Deck */}
                <div
                  className={`rounded-2xl border p-2.5 sm:p-5 ${
                    isDark
                      ? 'bg-slate-900 border-slate-800'
                      : 'bg-white border-slate-200 shadow-sm'
                  }`}
                >
                  <div className="hidden sm:flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div>
                      <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-amber-500">
                        Azonnali Úthiba Rögzítés (GPS + Menetirány zárolása)
                      </h2>
                      <p className={`text-xs sm:text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                        A gomb megnyomásának pillanatában rögzíti a pontos GPS koordinátát és a menetirányt ({heading}° {cardinalObj.short}), majd pontosíthatja az adatokat.
                      </p>
                    </div>
                  </div>

                  {/* Primary Buttons for Pothole, Road Defect, Drain, Bump (4 compact cols on mobile so it fits 1 screen) */}
                  <div className="grid grid-cols-4 gap-2 sm:gap-3">
                    {(
                      [
                        {
                          type: 'pothole',
                          title: 'KÁTYÚ',
                          sub: 'Azonnali GPS',
                          bg: 'bg-red-600 hover:bg-red-500 text-white border-red-400',
                        },
                        {
                          type: 'road_defect',
                          title: 'ÚTHIBA',
                          sub: 'Süllyedés',
                          bg: 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-300',
                        },
                        {
                          type: 'drain',
                          title: 'CSATORNA',
                          sub: 'Akna / Rács',
                          bg: 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 border-cyan-300',
                        },
                        {
                          type: 'bump',
                          title: 'BUKKANÓ',
                          sub: 'Küszöb',
                          bg: 'bg-orange-500 hover:bg-orange-400 text-slate-950 border-orange-300',
                        },
                      ] as { type: HazardType; title: string; sub: string; bg: string }[]
                    ).map((btn) => (
                      <button
                        key={btn.type}
                        type="button"
                        onClick={() => handleInstantHazardTrigger(btn.type)}
                        className={`min-h-[54px] sm:min-h-[82px] p-2 sm:p-3.5 rounded-xl sm:rounded-2xl border-2 font-extrabold text-left flex flex-col justify-between shadow-md active:scale-[0.98] transition-transform cursor-pointer ${btn.bg}`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="text-xs sm:text-xl tracking-tight truncate">{btn.title}</span>
                          <PlusCircle className="w-4 h-4 sm:w-6 sm:h-6 shrink-0 hidden sm:inline" />
                        </div>
                        <div className="text-[10px] sm:text-xs font-bold opacity-90 truncate">
                          {selectedForwardLanes.join(',')}. sáv ·{' '}
                          {LATERAL_POSITION_LABELS[selectedLateral]?.short}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Interactive Multi-Lane & Lateral Position Visualizer (Shown on mobile only when 'lanes' is selected; always shown on lg desktop) */}
                <div className={mobileCockpitPanel === 'lanes' ? 'block' : 'hidden lg:block'}>
                  <LaneVisualizer
                    forwardLanes={roadContext.forwardLanes}
                    backwardLanes={roadContext.backwardLanes}
                    selectedForwardLanes={selectedForwardLanes}
                    selectedLateral={selectedLateral}
                    onToggleForwardLane={(laneNum) => {
                      setSelectedForwardLanes((prev) => {
                        const exists = prev.includes(laneNum);
                        const next = exists
                          ? prev.filter((l) => l !== laneNum)
                          : [...prev, laneNum].sort((a, b) => a - b);
                        return next.length > 0 ? next : [laneNum];
                      });
                    }}
                    onSelectLateral={(pos) => setSelectedLateral(pos)}
                    onAdjustForwardLanes={(delta) =>
                      setRoadContext((prev) => {
                        const nextFwd = Math.min(4, Math.max(1, prev.forwardLanes + delta));
                        return {
                          ...prev,
                          forwardLanes: nextFwd,
                          totalLanes: nextFwd + prev.backwardLanes,
                        };
                      })
                    }
                    onAdjustBackwardLanes={(delta) =>
                      setRoadContext((prev) => {
                        const nextBack = Math.min(4, Math.max(0, prev.backwardLanes + delta));
                        return {
                          ...prev,
                          backwardLanes: nextBack,
                          totalLanes: prev.forwardLanes + nextBack,
                        };
                      })
                    }
                    isMoving={isSimulatingDrive || usingRealGps}
                    currentHeading={heading}
                    currentCardinal={cardinalObj.short}
                    nearbyHazards={hazardsWithDistance}
                    isDark={isDark}
                    fontScaleClass={fontScaleClass}
                  />
                </div>
              </div>

              {/* Right 5 Columns: Approaching Obstacles Radar + Live OpenStreetMap View */}
              <div className="lg:col-span-5 flex flex-col gap-3 sm:gap-5">
                {/* Approaching Obstacles Radar (Shown on mobile when 'obstacles' is selected; always shown on lg desktop) */}
                <div
                  className={`${
                    mobileCockpitPanel === 'obstacles' ? 'block' : 'hidden lg:block'
                  } rounded-2xl border p-3.5 sm:p-5 ${
                    isDark
                      ? 'bg-slate-900 border-slate-800'
                      : 'bg-white border-slate-200 shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2.5 sm:mb-3">
                    <div>
                      <h2 className="text-base sm:text-xl font-bold tracking-tight">
                        Közeledő Akadályok és Veszélyek
                      </h2>
                      <p className="text-xs text-slate-400">
                        Gyalogátkelőhely, vasúti átjáró, fekvőrendőr és menetirány szerinti úthibák
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('settings')}
                      className="min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-bold border border-slate-700 hover:bg-slate-800/40 whitespace-nowrap"
                    >
                      Szűrők
                    </button>
                  </div>

                  <div className="space-y-2">
                    {/* Approaching OSM Obstacles */}
                    {activeObstacles.slice(0, 3).map((obs) => {
                      const isClose = (obs.distanceMeters ?? 9999) <= settings.alertDistanceMeters;
                      return (
                        <div
                          key={obs.id}
                          className={`p-2.5 sm:p-3 rounded-xl border flex items-center justify-between gap-3 ${
                            isClose
                              ? 'bg-amber-500/15 border-amber-400 text-amber-300'
                              : isDark
                              ? 'bg-slate-950 border-slate-800'
                              : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div>
                            <div className="text-sm sm:text-base font-bold">
                              {OBSTACLE_LABELS[obs.type]?.label || obs.type}
                            </div>
                            <div className="text-xs text-slate-400">{obs.name}</div>
                          </div>
                          <div className="text-right font-mono-tabular">
                            <div className="text-base sm:text-xl font-extrabold text-amber-500">
                              {obs.distanceMeters} m
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {obs.source === 'osm_offline' ? 'Offline OSM' : 'OSM Térkép'}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Approaching Recorded Hazards in Same Driving Direction */}
                    {hazardsWithDistance
                      .filter((h) => h.matchesCurrentDirection && h.distanceMeters <= 800)
                      .slice(0, 2)
                      .map((haz) => {
                        const meta = HAZARD_TYPE_LABELS[haz.type] || HAZARD_TYPE_LABELS.other;
                        return (
                          <div
                            key={haz.id}
                            onClick={() => {
                              setIsEditingExistingHazard(true);
                              setActiveDraftHazard(haz);
                            }}
                            className="p-2.5 sm:p-3 rounded-xl border border-red-500/60 bg-red-500/10 flex items-center justify-between gap-3 cursor-pointer hover:bg-red-500/20 transition-colors"
                          >
                            <div className="flex items-center gap-2.5">
                              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                              <div>
                                <div className="text-sm sm:text-base font-bold">
                                  {meta.label} · {haz.lanesAffected.join(', ')}. sáv (
                                  {LATERAL_POSITION_LABELS[haz.lateralPosition]?.short})
                                </div>
                                <div className="text-xs text-slate-400">
                                  {haz.street} {haz.houseNumber} · Irány: {haz.heading}° (
                                  {haz.headingCardinal})
                                </div>
                              </div>
                            </div>
                            <div className="text-right font-mono-tabular shrink-0">
                              <div className="text-base sm:text-lg font-extrabold text-red-400">
                                {haz.distanceMeters} m
                              </div>
                              <div className="text-[10px] underline">Szerkesztés</div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Live OpenStreetMap Component (Shown on mobile when 'map' is selected; always shown on lg desktop) */}
                <div
                  className={`${
                    mobileCockpitPanel === 'map' ? 'block' : 'hidden lg:block'
                  } rounded-2xl border p-3 sm:p-5 ${
                    isDark
                      ? 'bg-slate-900 border-slate-800'
                      : 'bg-white border-slate-200 shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2 sm:mb-3">
                    <div>
                      <h2 className="text-base sm:text-lg font-bold">OpenStreetMap Élő Térkép</h2>
                      <p className="text-xs text-slate-400">
                        Kattintson bármelyik jelölőre a részletekért vagy úthiba szerkesztéséhez
                      </p>
                    </div>
                    {offlineDataset && (
                      <span className="text-xs font-mono-tabular text-emerald-400 font-bold">
                        Offline réteg ({offlineDataset.wayCount} út)
                      </span>
                    )}
                  </div>

                  <OsmMapView
                    lat={lat}
                    lng={lng}
                    heading={heading}
                    hazards={hazards}
                    obstacles={activeObstacles}
                    offlineDataset={offlineDataset}
                    routeCoords={routePolylineCoords}
                    isDark={isDark}
                    followVehicle={true}
                    onSelectHazardForEdit={(haz) => {
                      setIsEditingExistingHazard(true);
                      setActiveDraftHazard(haz);
                    }}
                  />
                </div>
              </div>
            </div>
          </>
        )}

        {/* VIEW 2: SAVED HAZARDS LOG & LATER EDITING */}
        {activeTab === 'hazards' && (
          <div
            className={`rounded-2xl border p-4 sm:p-6 ${
              isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h2 className="text-xl sm:text-2xl font-extrabold">
                  Rögzített Úthibák és Kátyúk Naplója ({hazards.length})
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 mt-1">
                  Minden bejegyzés tartalmazza a gombnyomás pillanatában rögzített GPS koordinátát, a menetirányt, az érintett sávokat és az oldali pozíciót.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFilterSameDirectionOnly((prev) => !prev)}
                  className={`min-h-[40px] px-3.5 py-2 rounded-xl font-bold text-xs sm:text-sm border transition-colors ${
                    filterSameDirectionOnly
                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                      : isDark
                      ? 'bg-slate-950 border-slate-700 text-slate-200'
                      : 'bg-slate-100 border-slate-300 text-slate-800'
                  }`}
                >
                  {filterSameDirectionOnly
                    ? `Csak jelenlegi menetirány (${heading}° ${cardinalObj.short})`
                    : 'Minden menetirány'}
                </button>

                <button
                  type="button"
                  onClick={handleExportHazardsGeoJson}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  <span>GeoJSON Export</span>
                </button>
              </div>
            </div>

            <div className="mt-4 space-y-2.5 max-h-[65vh] overflow-y-auto pr-1">
              {hazardsWithDistance
                .filter((h) => !filterSameDirectionOnly || h.matchesCurrentDirection)
                .map((haz) => {
                  const meta = HAZARD_TYPE_LABELS[haz.type] || HAZARD_TYPE_LABELS.other;
                  const timeStr = new Date(haz.timestamp).toLocaleString('hu-HU', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  });

                  return (
                    <div
                      key={haz.id}
                      className={`p-3.5 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-3 transition-colors ${
                        isDark
                          ? 'bg-slate-950/90 border-slate-800 hover:border-slate-700'
                          : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm font-bold">
                          <span style={{ color: meta.color }} className="text-base font-extrabold">
                            {meta.label}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="text-amber-500">
                            {haz.lanesAffected.map((l) => `${l}. sáv`).join(', ')} (
                            {LATERAL_POSITION_LABELS[haz.lateralPosition]?.short})
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-tabular text-xs text-slate-400">
                            {timeStr}
                          </span>
                        </div>

                        <div className="text-sm sm:text-base font-bold">
                          {haz.postcode} {haz.settlement}, {haz.street} {haz.houseNumber}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs font-mono-tabular text-slate-400">
                          <span>
                            GPS: {haz.lat.toFixed(5)}, {haz.lng.toFixed(5)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={
                              haz.matchesCurrentDirection
                                ? 'text-emerald-400 font-bold'
                                : 'text-slate-400'
                            }
                          >
                            Irány: {haz.heading}° ({haz.headingCardinal})
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{haz.distanceMeters} m</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditingExistingHazard(true);
                            setActiveDraftHazard(haz);
                          }}
                          className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm flex items-center gap-1.5"
                        >
                          <Edit3 className="w-4 h-4" />
                          <span>Szerkesztés</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteHazard(haz.id)}
                          className="min-h-[40px] px-3 py-1.5 rounded-xl border border-red-500/40 text-red-400 hover:bg-red-500/10 font-bold text-xs flex items-center gap-1"
                          aria-label="Törlés"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* VIEW 3: OFFLINE OSM FILE LOADER & MANAGER */}
        {activeTab === 'osm_offline' && (
          <div
            className={`rounded-2xl border p-4 sm:p-6 ${
              isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
            }`}
          >
            <div className="max-w-3xl space-y-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-extrabold">
                  Offline OpenStreetMap (.osm / .geojson) Fájl Betöltése
                </h2>
                <p className="text-xs sm:text-base text-slate-400 mt-1">
                  Töltsön fel saját exportált OpenStreetMap XML (<code>.osm</code>) vagy{' '}
                  <code>.geojson</code> fájlt, így internetkapcsolat nélkül is megjelennek az
                  útszakaszok, a sávszámok és az akadályok.
                </p>
              </div>

              <div
                className={`p-4 sm:p-6 rounded-2xl border-2 border-dashed flex flex-col sm:flex-row items-center justify-between gap-4 ${
                  isDark ? 'border-slate-700 bg-slate-950/60' : 'border-slate-300 bg-slate-50'
                }`}
              >
                <div className="space-y-1 text-center sm:text-left">
                  <div className="text-sm sm:text-base font-bold flex items-center justify-center sm:justify-start gap-2">
                    <FileCode2 className="w-5 h-5 text-amber-500" />
                    <span>Válasszon ki egy .osm vagy .geojson fájlt</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Támogatott címkék: highway, name, ref, lanes, lanes:forward, maxspeed, crossing
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <label className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-base flex items-center gap-2 cursor-pointer shadow-sm">
                    <Upload className="w-4 h-4" />
                    <span>OSM Feltöltése</span>
                    <input
                      type="file"
                      accept=".osm,.xml,.json,.geojson"
                      onChange={handleOfflineFileUpload}
                      className="hidden"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={handleDownloadSampleOsm}
                    className={`min-h-[44px] px-3.5 py-2 rounded-xl border font-bold text-xs sm:text-sm flex items-center gap-2 ${
                      isDark
                        ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                        : 'border-slate-300 text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    <Download className="w-4 h-4" />
                    <span>Minta .osm letöltése</span>
                  </button>
                </div>
              </div>

              {uploadStatusMsg && (
                <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 font-bold text-xs sm:text-sm">
                  {uploadStatusMsg}
                </div>
              )}

              {offlineDataset && (
                <div
                  className={`p-4 rounded-2xl border space-y-3 ${
                    isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-emerald-400">
                      Betöltve: {offlineDataset.fileName}
                    </h3>
                    <button
                      type="button"
                      onClick={() => {
                        setOfflineDataset(null);
                        setUploadStatusMsg('');
                      }}
                      className="text-xs text-red-400 underline font-bold"
                    >
                      Eltávolítás
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 font-mono-tabular">
                    <div className="p-2.5 rounded-xl border border-slate-800">
                      <div className="text-[11px] text-slate-400">Csomópontok</div>
                      <div className="text-xl font-extrabold">{offlineDataset.nodeCount}</div>
                    </div>
                    <div className="p-2.5 rounded-xl border border-slate-800">
                      <div className="text-[11px] text-slate-400">Útszakaszok</div>
                      <div className="text-xl font-extrabold">{offlineDataset.wayCount}</div>
                    </div>
                    <div className="p-2.5 rounded-xl border border-slate-800">
                      <div className="text-[11px] text-slate-400">Akadályok</div>
                      <div className="text-xl font-extrabold">{offlineDataset.obstacles.length}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW 4: OBSTACLE FILTERS, VOICE TTS & FONT SIZE SETTINGS */}
        {activeTab === 'settings' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            <div
              className={`rounded-2xl border p-4 sm:p-6 ${
                isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
              }`}
            >
              <h2 className="text-lg sm:text-xl font-extrabold mb-1">
                Jelzett Akadályok Beállítása
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mb-3">
                Válassza ki, mely OpenStreetMap akadályokat jelezze a térkép és a hangos asszisztens.
              </p>

              <div className="space-y-2">
                {(Object.keys(OBSTACLE_LABELS) as ObstacleCategory[]).map((cat) => {
                  const enabled = settings.enabledObstacles[cat];
                  return (
                    <label
                      key={cat}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer ${
                        isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-sm sm:text-base">{OBSTACLE_LABELS[cat].label}</div>
                        <div className="text-xs text-slate-400">
                          „{OBSTACLE_LABELS[cat].speechLabel}”
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            enabledObstacles: {
                              ...s.enabledObstacles,
                              [cat]: e.target.checked,
                            },
                          }))
                        }
                        className="w-5 h-5 accent-amber-500 rounded"
                      />
                    </label>
                  );
                })}
              </div>
            </div>

            <div
              className={`rounded-2xl border p-4 sm:p-6 space-y-4 ${
                isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
              }`}
            >
              <div>
                <h2 className="text-lg sm:text-xl font-extrabold mb-1">
                  Hangos Felolvasás (TTS) és Betűméret
                </h2>
                <p className="text-xs sm:text-sm text-slate-400">
                  Állítsa be a betűméretet és az automatikus hangbemondásokat.
                </p>
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-bold mb-2">
                  Betűméret
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'normal', label: 'Normál' },
                      { id: 'large', label: 'Nagy' },
                      { id: 'xl', label: 'Extra Nagy' },
                    ] as { id: AppSettings['fontScale']; label: string }[]
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSettings((s) => ({ ...s, fontScale: opt.id }))}
                      className={`min-h-[42px] px-2.5 py-1.5 rounded-xl border font-bold text-xs sm:text-sm ${
                        settings.fontScale === opt.id
                          ? 'bg-amber-500 text-slate-950 border-amber-400'
                          : isDark
                          ? 'bg-slate-950 border-slate-800 text-slate-300'
                          : 'bg-slate-50 border-slate-200 text-slate-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer text-sm">
                  <span className="font-bold">Hangos felolvasás engedélyezése</span>
                  <input
                    type="checkbox"
                    checked={settings.ttsEnabled}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, ttsEnabled: e.target.checked }))
                    }
                    className="w-5 h-5 accent-amber-500"
                  />
                </label>

                <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer text-sm">
                  <span className="font-bold">Utca változás bemondása</span>
                  <input
                    type="checkbox"
                    checked={settings.ttsSpeakStreetChanges}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, ttsSpeakStreetChanges: e.target.checked }))
                    }
                    className="w-5 h-5 accent-amber-500"
                  />
                </label>

                <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer text-sm">
                  <span className="font-bold">Menetirány szerinti úthibák bemondása</span>
                  <input
                    type="checkbox"
                    checked={settings.ttsSpeakHazards}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, ttsSpeakHazards: e.target.checked }))
                    }
                    className="w-5 h-5 accent-amber-500"
                  />
                </label>
              </div>

              <div>
                <div className="flex justify-between text-xs sm:text-sm font-bold mb-1">
                  <span>Előrejelzési riasztási távolság</span>
                  <span className="font-mono-tabular text-amber-500">
                    {settings.alertDistanceMeters} méter
                  </span>
                </div>
                <input
                  type="range"
                  min={100}
                  max={600}
                  step={50}
                  value={settings.alertDistanceMeters}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      alertDistanceMeters: parseInt(e.target.value, 10),
                    }))
                  }
                  className="w-full accent-amber-500"
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Two-Step Instant GPS Locked Hazard Capture & Editor Modal */}
      <HazardCaptureModal
        draft={activeDraftHazard}
        isEditingExisting={isEditingExistingHazard}
        isDark={isDark}
        onSave={handleSaveHazardModal}
        onDelete={handleDeleteHazard}
        onCancel={() => setActiveDraftHazard(null)}
      />
    </div>
  );
}
