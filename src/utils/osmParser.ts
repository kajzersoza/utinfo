import { OfflineOsmDataset, OfflineOsmRoadSegment, ObstacleCategory, RoadContextInfo, RoadObstacle } from '../types';
import { calculateDistanceMeters } from './geoAndSpeech';

// Parse an uploaded .osm XML or .geojson/.json file into road segments and obstacles
export async function parseOfflineOsmFile(file: File): Promise<OfflineOsmDataset> {
  const text = await file.text();
  const fileName = file.name;

  if (fileName.endsWith('.json') || fileName.endsWith('.geojson') || text.trim().startsWith('{')) {
    return parseGeoJsonText(text, fileName);
  }
  return parseOsmXmlText(text, fileName);
}

function parseOsmXmlText(xmlText: string, fileName: string): OfflineOsmDataset {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

  const nodeElements = Array.from(xmlDoc.getElementsByTagName('node'));
  const wayElements = Array.from(xmlDoc.getElementsByTagName('way'));

  const nodeMap = new Map<string, { lat: number; lng: number; tags: Record<string, string> }>();
  const obstacles: RoadObstacle[] = [];
  const roads: OfflineOsmRoadSegment[] = [];

  for (const nodeEl of nodeElements) {
    const id = nodeEl.getAttribute('id') || '';
    const lat = parseFloat(nodeEl.getAttribute('lat') || '0');
    const lng = parseFloat(nodeEl.getAttribute('lon') || '0');
    if (!id || isNaN(lat) || isNaN(lng)) continue;

    const tags: Record<string, string> = {};
    const tagEls = nodeEl.getElementsByTagName('tag');
    for (let i = 0; i < tagEls.length; i++) {
      const k = tagEls[i].getAttribute('k');
      const v = tagEls[i].getAttribute('v');
      if (k && v) tags[k] = v;
    }

    nodeMap.set(id, { lat, lng, tags });

    const obsType = classifyOsmNodeObstacle(tags);
    if (obsType) {
      obstacles.push({
        id: `osm-node-${id}`,
        type: obsType.type,
        name: obsType.name,
        lat,
        lng,
        maxspeed: tags['maxspeed'],
        source: 'osm_offline',
      });
    }
  }

  for (const wayEl of wayElements) {
    const id = wayEl.getAttribute('id') || '';
    const tags: Record<string, string> = {};
    const tagEls = wayEl.getElementsByTagName('tag');
    for (let i = 0; i < tagEls.length; i++) {
      const k = tagEls[i].getAttribute('k');
      const v = tagEls[i].getAttribute('v');
      if (k && v) tags[k] = v;
    }

    if (!tags['highway']) continue;

    const ndEls = wayEl.getElementsByTagName('nd');
    const coords: [number, number][] = [];
    for (let i = 0; i < ndEls.length; i++) {
      const ref = ndEls[i].getAttribute('ref') || '';
      const pt = nodeMap.get(ref);
      if (pt) coords.push([pt.lat, pt.lng]);
    }

    if (coords.length < 2) continue;

    const totalLanes = parseInt(tags['lanes'] || '2', 10) || 2;
    const oneway = tags['oneway'] === 'yes' || tags['highway'] === 'motorway';
    const forwardLanes =
      parseInt(tags['lanes:forward'] || '', 10) ||
      (oneway ? totalLanes : Math.max(1, Math.ceil(totalLanes / 2)));
    const backwardLanes =
      parseInt(tags['lanes:backward'] || '', 10) ||
      (oneway ? 0 : Math.max(0, totalLanes - forwardLanes));

    roads.push({
      id: `osm-way-${id}`,
      name: tags['name'] || tags['official_name'] || (tags['ref'] ? `${tags['ref']} főút` : 'Ismeretlen út'),
      ref: tags['ref'] || '',
      settlement: tags['addr:city'] || tags['is_in:city'] || undefined,
      postcode: tags['addr:postcode'] || tags['postal_code'] || undefined,
      lanes: totalLanes,
      lanesForward: forwardLanes,
      lanesBackward: backwardLanes,
      maxSpeed: parseInt(tags['maxspeed'] || '50', 10) || 50,
      coords,
    });
  }

  return {
    fileName,
    loadedAt: Date.now(),
    nodeCount: nodeElements.length,
    wayCount: roads.length,
    obstacles,
    roads,
  };
}

function parseGeoJsonText(jsonText: string, fileName: string): OfflineOsmDataset {
  const data = JSON.parse(jsonText);
  const features = Array.isArray(data.features) ? data.features : [];
  const obstacles: RoadObstacle[] = [];
  const roads: OfflineOsmRoadSegment[] = [];
  let nodeCount = 0;

  features.forEach((feat: any, idx: number) => {
    const props = feat.properties || {};
    const geom = feat.geometry || {};

    if (geom.type === 'Point' && Array.isArray(geom.coordinates)) {
      nodeCount++;
      const [lng, lat] = geom.coordinates;
      const obsType = classifyOsmNodeObstacle(props);
      if (obsType) {
        obstacles.push({
          id: `geojson-pt-${idx}`,
          type: obsType.type,
          name: obsType.name,
          lat,
          lng,
          maxspeed: props.maxspeed,
          source: 'osm_offline',
        });
      }
    } else if (geom.type === 'LineString' && Array.isArray(geom.coordinates)) {
      const coords: [number, number][] = geom.coordinates.map((c: number[]) => [c[1], c[0]]);
      const totalLanes = parseInt(props.lanes || '2', 10) || 2;
      const oneway = props.oneway === 'yes' || props.highway === 'motorway';
      const forwardLanes =
        parseInt(props['lanes:forward'] || '', 10) ||
        (oneway ? totalLanes : Math.max(1, Math.ceil(totalLanes / 2)));
      const backwardLanes =
        parseInt(props['lanes:backward'] || '', 10) ||
        (oneway ? 0 : Math.max(0, totalLanes - forwardLanes));

      roads.push({
        id: `geojson-way-${idx}`,
        name: props.name || props.street || (props.ref ? `${props.ref} út` : 'Térképi útszakasz'),
        ref: props.ref || '',
        settlement: props['addr:city'] || props.city || undefined,
        postcode: props['addr:postcode'] || props.postcode || undefined,
        lanes: totalLanes,
        lanesForward: forwardLanes,
        lanesBackward: backwardLanes,
        maxSpeed: parseInt(props.maxspeed || '50', 10) || 50,
        coords,
      });
    }
  });

  return {
    fileName,
    loadedAt: Date.now(),
    nodeCount,
    wayCount: roads.length,
    obstacles,
    roads,
  };
}

function classifyOsmNodeObstacle(
  tags: Record<string, string>
): { type: ObstacleCategory; name: string } | null {
  if (tags['highway'] === 'crossing' || tags['crossing']) {
    return { type: 'crosswalk', name: tags['name'] || 'Gyalogátkelőhely' };
  }
  if (tags['railway'] === 'level_crossing' || tags['railway'] === 'crossing') {
    return { type: 'railway', name: tags['name'] || 'Vasúti átjáró' };
  }
  if (tags['traffic_calming']) {
    return { type: 'speed_bump', name: 'Sebességcsökkentő küszöb (Fekvőrendőr)' };
  }
  if (tags['highway'] === 'traffic_signals') {
    return { type: 'traffic_signals', name: 'Jelzőlámpás csomópont' };
  }
  if (tags['highway'] === 'speed_camera' || tags['enforcement'] === 'maxspeed') {
    return { type: 'speed_limit', name: `Traffipax (${tags['maxspeed'] || '50'} km/h)` };
  }
  return null;
}

// Generate a rich sample .osm XML string for instant testing / downloading
export function generateSampleOsmXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6" generator="UtInfo-SavAsszisztens">
  <bounds minlat="47.1850" minlon="18.4050" maxlat="47.5150" maxlon="19.0800"/>
  <!-- Budapest Andrássy út & Székesfehérvár / M7 teszt csomópontok -->
  <node id="1001" lat="47.4984" lon="19.0556">
    <tag k="highway" v="crossing"/>
    <tag k="name" v="Bajcsy-Zsilinszky út gyalogátkelő"/>
  </node>
  <node id="1002" lat="47.5025" lon="19.0628">
    <tag k="highway" v="traffic_signals"/>
    <tag k="name" v="Oktogon jelzőlámpás csomópont"/>
  </node>
  <node id="1003" lat="47.5061" lon="19.0689">
    <tag k="traffic_calming" v="table"/>
    <tag k="name" v="Kodály körönd kiemelt gyalogos küszöb"/>
  </node>
  <node id="1004" lat="47.5112" lon="19.0748">
    <tag k="railway" v="level_crossing"/>
    <tag k="name" v="Városligeti vasúti/villamos kereszteződés"/>
  </node>
  <node id="1005" lat="47.5002" lon="19.0590">
    <tag k="highway" v="speed_camera"/>
    <tag k="maxspeed" v="50"/>
    <tag k="name" v="Andrássy út VÉDA kapu"/>
  </node>
  <way id="2001">
    <nd ref="1001"/>
    <nd ref="1005"/>
    <nd ref="1002"/>
    <nd ref="1003"/>
    <nd ref="1004"/>
    <tag k="highway" v="primary"/>
    <tag k="name" v="Andrássy út"/>
    <tag k="ref" v="M1/B"/>
    <tag k="addr:city" v="Budapest VI. kerület"/>
    <tag k="addr:postcode" v="1061"/>
    <tag k="lanes" v="4"/>
    <tag k="lanes:forward" v="2"/>
    <tag k="lanes:backward" v="2"/>
    <tag k="maxspeed" v="50"/>
  </way>
</osm>`;
}

// Query closest offline road segment if an offline dataset is loaded
export function findClosestOfflineRoad(
  lat: number,
  lng: number,
  dataset: OfflineOsmDataset | null
): OfflineOsmRoadSegment | null {
  if (!dataset || dataset.roads.length === 0) return null;
  let bestRoad: OfflineOsmRoadSegment | null = null;
  let minDistance = Infinity;

  for (const road of dataset.roads) {
    for (const [rLat, rLng] of road.coords) {
      const d = calculateDistanceMeters(lat, lng, rLat, rLng);
      if (d < minDistance) {
        minDistance = d;
        bestRoad = road;
      }
    }
  }

  // Return if within 600 meters
  return minDistance <= 600 ? bestRoad : null;
}

// Live OpenStreetMap Nominatim + Overpass lookup (with fallback protection)
export async function fetchLiveOsmRoadContext(
  lat: number,
  lng: number
): Promise<{ context: Partial<RoadContextInfo>; obstacles: RoadObstacle[] } | null> {
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const res = await fetch(nomUrl, {
      headers: {
        'Accept-Language': 'hu',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address || {};

    const settlement =
      addr.city ||
      addr.town ||
      addr.village ||
      addr.municipality ||
      addr.suburb ||
      'Ismeretlen település';
    const postcode = addr.postcode || '----';
    const street = addr.road || addr.pedestrian || addr.highway || data.name || 'Közút';
    const houseNumber = addr.house_number || '';
    const roadRef = data.extratags?.ref || addr.road_reference || '';

    const totalLanes = parseInt(data.extratags?.lanes || '2', 10) || 2;
    const oneway = data.extratags?.oneway === 'yes';
    const forwardLanes =
      parseInt(data.extratags?.['lanes:forward'] || '', 10) ||
      (oneway ? totalLanes : Math.max(1, Math.ceil(totalLanes / 2)));
    const backwardLanes =
      parseInt(data.extratags?.['lanes:backward'] || '', 10) ||
      (oneway ? 0 : Math.max(0, totalLanes - forwardLanes));
    const maxSpeed = parseInt(data.extratags?.maxspeed || '50', 10) || 50;

    return {
      context: {
        settlement,
        postcode,
        street,
        houseNumber,
        roadRef,
        totalLanes,
        forwardLanes,
        backwardLanes,
        maxSpeed,
        oneway,
        source: 'osm_live',
      },
      obstacles: [],
    };
  } catch {
    return null;
  }
}
