// Haversine distance in meters between two GPS coordinates
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

// Bearing in degrees (0-359) from point 1 to point 2
export function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;

  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);

  return Math.round((toDeg(θ) + 360) % 360);
}

// Check if two headings (0-359) are roughly in the same direction (within +/- 65 degrees)
export function isSameDrivingDirection(heading1: number, heading2: number, tolerance = 65): boolean {
  const diff = Math.abs(((heading1 - heading2 + 540) % 360) - 180);
  return diff <= tolerance;
}

// Convert degrees (0-359) to Hungarian cardinal direction code & full spoken name
export function getHungarianCardinal(deg: number): { short: string; full: string } {
  const normalized = ((deg % 360) + 360) % 360;
  const directions = [
    { short: 'É', full: 'Észak' },
    { short: 'ÉK', full: 'Északkelet' },
    { short: 'K', full: 'Kelet' },
    { short: 'DK', full: 'Délkelet' },
    { short: 'D', full: 'Dél' },
    { short: 'DNY', full: 'Délnyugat' },
    { short: 'NY', full: 'Nyugat' },
    { short: 'ÉNY', full: 'Északnyugat' },
  ];
  const index = Math.round(normalized / 45) % 8;
  return directions[index];
}

// Hungarian Speech Synthesis helper
export function speakHungarian(text: string, enabled: boolean, rate = 1.0): void {
  if (!enabled || typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return;
  }
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'hu-HU';
    utterance.rate = rate;
    utterance.pitch = 1.0;

    // Try to select a Hungarian voice if available
    const voices = window.speechSynthesis.getVoices();
    const huVoice = voices.find((v) => v.lang.toLowerCase().includes('hu'));
    if (huVoice) {
      utterance.voice = huVoice;
    }

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('TTS hiba:', err);
  }
}

export const HAZARD_TYPE_LABELS: Record<
  string,
  { label: string; shortLabel: string; description: string; color: string }
> = {
  pothole: {
    label: 'Kátyú',
    shortLabel: 'Kátyú',
    description: 'Mélyedés vagy kitört burkolat az úttesten',
    color: '#ef4444',
  },
  road_defect: {
    label: 'Úthiba / Борdásodás',
    shortLabel: 'Úthiba',
    description: 'Repedezett, megsüllyedt vagy hullámos aszfalt',
    color: '#f59e0b',
  },
  drain: {
    label: 'Csatornafedél / Vízelvezető',
    shortLabel: 'Csatorna',
    description: 'Beesett vagy kiálló aknafedél, víznyelő rács',
    color: '#06b6d4',
  },
  bump: {
    label: 'Bukkanó / Küszöb',
    shortLabel: 'Bukkanó',
    description: 'Éles szintkülönbség, dilatáció vagy keresztbordázat',
    color: '#eab308',
  },
  construction: {
    label: 'Útépítés / Felbontás',
    shortLabel: 'Útépítés',
    description: 'Ideiglenes sávszűkület, marás vagy munkagödör',
    color: '#f97316',
  },
  other: {
    label: 'Egyéb akadály',
    shortLabel: 'Egyéb',
    description: 'Törmelék, ág vagy egyéb veszélyforrás a sávban',
    color: '#a855f7',
  },
};

export const LATERAL_POSITION_LABELS: Record<string, { label: string; short: string }> = {
  left_edge: { label: 'Sáv bal széle (felező / belső ív)', short: 'Bal szél' },
  center_lane: { label: 'Sáv közepe (keréknyom / közép)', short: 'Közép' },
  right_edge: { label: 'Sáv jobb széle (padka / külső ív)', short: 'Jobb szél' },
};

export const OBSTACLE_LABELS: Record<string, { label: string; speechLabel: string }> = {
  crosswalk: { label: 'Gyalogátkelőhely', speechLabel: 'Gyalogátkelőhely következik' },
  railway: { label: 'Vasúti átjáró', speechLabel: 'Figyelem, vasúti átjáró következik' },
  speed_bump: { label: 'Fekvőrendőr / Lassító', speechLabel: 'Fekvőrendőr az úton' },
  traffic_signals: { label: 'Jelzőlámpás csomópont', speechLabel: 'Jelzőlámpa következik' },
  speed_limit: { label: 'Sebességkorlátozás / Trafipax', speechLabel: 'Sebességmérő pont' },
};
