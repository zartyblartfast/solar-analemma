export type TimeMode = { kind: "fixedLocalTime"; hh: number; mm: number };

export interface AnalemmaPoint {
  dateISO: string;
  azimuthDeg: number;
  altitudeDeg: number;
  visible: boolean;
  E: number;  // East component (ENU coordinate)
  N: number;  // North component (ENU coordinate)
  U: number;  // Up component (ENU coordinate)
}

export interface EotPoint {
  dateISO: string;
  dayOfYear: number;
  eotMinutes: number;
  obliquityComponent: number;  // Axial tilt contribution (minutes)
  eccentricityComponent: number;  // Orbital eccentricity contribution (minutes)
}

export interface AnalemmaInputs {
  latitudeDeg: number;
  longitudeDeg: number;
  timeMode: TimeMode;
  tzOffsetHours: number; // Time zone offset from UTC (e.g., +7 for Bangkok)
  year?: number;
}

const deg2rad = (d: number) => (d * Math.PI) / 180;
const rad2deg = (r: number) => (r * 180) / Math.PI;
const normalizeDeg = (d: number) => ((d % 360) + 360) % 360;

 const _debugPrintedKeys = new Set<string>();
 function _debugEnabled() {
   try {
     const g: any = globalThis as any;
     if (g && g.__ANAL_EMMA_DEBUG__ === true) return true;
     if (typeof localStorage !== 'undefined' && localStorage.getItem('analemmaDebug') === '1') return true;
   } catch {
     return false;
   }
   return false;
 }

 function _debugOnce(key: string, payload: unknown) {
   if (!_debugEnabled()) return;
   if (_debugPrintedKeys.has(key)) return;
   _debugPrintedKeys.add(key);
   // eslint-disable-next-line no-console
   console.log(payload);
 }

function isLeapYear(y: number) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInYear(y: number) {
  return isLeapYear(y) ? 366 : 365;
}

function dateFromDayOfYear(year: number, day: number) {
  const date = new Date(Date.UTC(year, 0, 1));
  date.setUTCDate(day);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function computeAnalemmaPoints(inputs: AnalemmaInputs): AnalemmaPoint[] {
  const year = inputs.year ?? new Date().getFullYear();
  const nDays = daysInYear(year);
  const phi = deg2rad(inputs.latitudeDeg);

  // Fixed local clock time (civil time) each day
  const hh = Math.min(23, Math.max(0, inputs.timeMode.hh));
  const mm = Math.min(59, Math.max(0, inputs.timeMode.mm));
  const localClockMinutes = hh * 60 + mm;

  const points: AnalemmaPoint[] = [];
  let lastValidAzimuth = 180; // Default to South for Northern Hemisphere
  
  // Key days to log: Jan 1, Mar 20, Jun 21, Sep 22, Dec 21, plus days near zenith
  const keyDays = [1, 79, 172, 265, 355]; // Jan 1, Mar 20, Jun 21, Sep 22, Dec 21
  
  // Track summary statistics
  let minAlt = Infinity;
  let maxAlt = -Infinity;
  let minAz = Infinity;
  let maxAz = -Infinity;
  let visibleCount = 0;

  for (let n = 1; n <= nDays; n++) {
    const gamma = (2 * Math.PI / nDays) * (n - 1 + 0.5);

    const decl =
      0.006918 -
      0.399912 * Math.cos(gamma) +
      0.070257 * Math.sin(gamma) -
      0.006758 * Math.cos(2 * gamma) +
      0.000907 * Math.sin(2 * gamma) -
      0.002697 * Math.cos(3 * gamma) +
      0.00148 * Math.sin(3 * gamma);

    // Equation of Time (minutes): NOAA approximation
    const eotMin = 229.18 * (
      0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma)
    );

    // Hour angle computation using NOAA formula
    // Accounts for: local clock time, Equation of Time, longitude offset from time zone meridian
    const tz = inputs.tzOffsetHours; // e.g., +7 for Bangkok
    const LSTM = 15 * tz; // Local Standard Time Meridian (degrees)
    
    // NOAA time correction: Equation of Time + longitude offset from time zone meridian
    const timeOffsetMin = eotMin + 4 * (inputs.longitudeDeg - LSTM);
    
    // True Solar Time in minutes
    // NOAA convention: TST = LCT + timeOffset
    let trueSolarTimeMin = localClockMinutes + timeOffsetMin;
    
    // Normalize to [0, 1440)
    trueSolarTimeMin = ((trueSolarTimeMin % 1440) + 1440) % 1440;
    
    // Hour angle in degrees
    const H_deg = trueSolarTimeMin / 4 - 180;
    const H = deg2rad(H_deg);

    // Compute ENU (East-North-Up) coordinates directly from H, decl, phi
    // This is numerically stable even at zenith (where azimuth is undefined)
    const E = Math.cos(decl) * Math.sin(H);
    const N = Math.cos(phi) * Math.sin(decl) - Math.sin(phi) * Math.cos(decl) * Math.cos(H);
    const U = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H);
    
    // Derive altitude from U component
    const altitudeDeg = rad2deg(Math.asin(Math.max(-1, Math.min(1, U))));
    
    // Derive azimuth from E/N for display/tooltips only
    // This is stable because we're using the already-computed E/N, not going through atan2(sin/cos)
    const azimuthDeg = normalizeDeg(rad2deg(Math.atan2(E, N))); // 0°=North, clockwise

    const dateISO = dateFromDayOfYear(year, n);
    const visible = altitudeDeg > 0;

    points.push({ dateISO, azimuthDeg, altitudeDeg, visible, E, N, U });
    
    // Update summary statistics
    if (visible) {
      visibleCount++;
      minAlt = Math.min(minAlt, altitudeDeg);
      maxAlt = Math.max(maxAlt, altitudeDeg);
      minAz = Math.min(minAz, azimuthDeg);
      maxAz = Math.max(maxAz, azimuthDeg);
    }
    
  }

  {
    const vis = points.filter(p => p.visible);
    const altitudes = vis.map(p => p.altitudeDeg);
    const azimuths = vis.map(p => p.azimuthDeg);
    const eVals = vis.map(p => p.E);
    const uVals = vis.map(p => p.U);
    let maxEnuStep = 0;
    for (let i = 1; i < vis.length; i++) {
      const dE = vis[i].E - vis[i - 1].E;
      const dU = vis[i].U - vis[i - 1].U;
      const step = Math.hypot(dE, dU);
      if (step > maxEnuStep) maxEnuStep = step;
    }
    const nearZenithCount = altitudes.filter(a => a >= 89).length;
    _debugOnce(
      `main:${inputs.latitudeDeg.toFixed(6)}:${inputs.longitudeDeg.toFixed(6)}:${inputs.timeMode.hh}:${inputs.timeMode.mm}:${inputs.tzOffsetHours}:${year}`,
      {
        tag: 'AnalemmaDebug',
        mode: 'sky',
        series: 'main',
        inputs: {
          latitudeDeg: inputs.latitudeDeg,
          longitudeDeg: inputs.longitudeDeg,
          timeMode: inputs.timeMode,
          tzOffsetHours: inputs.tzOffsetHours,
          year
        },
        counts: {
          totalDays: nDays,
          visibleDays: vis.length,
          nearZenithDays: nearZenithCount
        },
        ranges: {
          altitudeDeg: vis.length ? { min: Math.min(...altitudes), max: Math.max(...altitudes) } : null,
          azimuthDeg: vis.length ? { min: Math.min(...azimuths), max: Math.max(...azimuths) } : null,
          E: vis.length ? { min: Math.min(...eVals), max: Math.max(...eVals) } : null,
          U: vis.length ? { min: Math.min(...uVals), max: Math.max(...uVals) } : null
        },
        maxEnuStep
      }
    );
  }

  return points;
}

export function computeEquationOfTime(year: number): EotPoint[] {
  const nDays = daysInYear(year);
  const points: EotPoint[] = [];

  for (let n = 1; n <= nDays; n++) {
    // Fractional year angle (same as in computeAnalemmaPoints)
    const gamma = (2 * Math.PI / nDays) * (n - 1 + 0.5);

    // Separate the two components of the Equation of Time:
    // 1. Obliquity (axial tilt) - primarily the sin(gamma) and sin(2*gamma) terms
    // 2. Eccentricity (orbital shape) - primarily the cos(gamma) and cos(2*gamma) terms
    
    // Obliquity component (axial tilt effect)
    const obliquityComponent = 229.18 * (
      -0.032077 * Math.sin(gamma) -
      0.040849 * Math.sin(2 * gamma)
    );
    
    // Eccentricity component (orbital eccentricity effect)
    const eccentricityComponent = 229.18 * (
      0.000075 +
      0.001868 * Math.cos(gamma) -
      0.014615 * Math.cos(2 * gamma)
    );
    
    // Total Equation of Time (sum of both components)
    const eotMinutes = obliquityComponent + eccentricityComponent;

    const dateISO = dateFromDayOfYear(year, n);

    points.push({
      dateISO,
      dayOfYear: n,
      eotMinutes,
      obliquityComponent,
      eccentricityComponent
    });
  }

  return points;
}

export interface AnalemmaInsetPoint {
  azimuthDeg: number;
  altitudeDeg: number;
  visible: boolean;
  E: number;  // East component (ENU coordinates)
  N: number;  // North component (ENU coordinates)
  U: number;  // Up component (ENU coordinates)
}

export function computeAnalemmaInset(
  inputs: {
    latitudeDeg: number;
    longitudeDeg: number;
    timeMode: TimeMode;
    tzOffsetHours: number;
    year?: number;
  },
  includeObliquity: boolean,
  includeEccentricity: boolean
): AnalemmaInsetPoint[] {
  const year = inputs.year ?? new Date().getFullYear();
  const nDays = daysInYear(year);
  const points: AnalemmaInsetPoint[] = [];
  
  const phi = deg2rad(inputs.latitudeDeg);
  const localClockMinutes = inputs.timeMode.hh * 60 + inputs.timeMode.mm;

  for (let n = 1; n <= nDays; n++) {
    const gamma = (2 * Math.PI / nDays) * (n - 1 + 0.5);

    // Compute solar declination (only if obliquity is enabled)
    // Declination is caused by Earth's axial tilt, not orbital eccentricity
    let decl = 0;
    if (includeObliquity) {
      decl =
        0.006918 -
        0.399912 * Math.cos(gamma) +
        0.070257 * Math.sin(gamma) -
        0.006758 * Math.cos(2 * gamma) +
        0.000907 * Math.sin(2 * gamma) -
        0.002697 * Math.cos(3 * gamma) +
        0.00148 * Math.sin(3 * gamma);
    }

    // Compute EoT based on selected components
    let eotMin = 0;
    
    if (includeObliquity) {
      eotMin += 229.18 * (
        -0.032077 * Math.sin(gamma) -
        0.040849 * Math.sin(2 * gamma)
      );
    }
    
    if (includeEccentricity) {
      eotMin += 229.18 * (
        0.000075 +
        0.001868 * Math.cos(gamma) -
        0.014615 * Math.cos(2 * gamma)
      );
    }

    // Hour angle computation using component-based EoT
    const tz = inputs.tzOffsetHours;
    const LSTM = 15 * tz;
    const timeOffsetMin = eotMin + 4 * (inputs.longitudeDeg - LSTM);
    let trueSolarTimeMin = localClockMinutes + timeOffsetMin;
    trueSolarTimeMin = ((trueSolarTimeMin % 1440) + 1440) % 1440;
    const H_deg = trueSolarTimeMin / 4 - 180;
    const H = deg2rad(H_deg);

    // Compute ENU coordinates
    // With decl=0 (obliquity disabled), Sun stays on celestial equator
    // EoT variation changes hour angle H, creating primarily horizontal spread
    const E = Math.cos(decl) * Math.sin(H);
    const N = Math.cos(phi) * Math.sin(decl) - Math.sin(phi) * Math.cos(decl) * Math.cos(H);
    const U = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H);
    
    const altitudeDeg = rad2deg(Math.asin(Math.max(-1, Math.min(1, U))));
    const azimuthDeg = normalizeDeg(rad2deg(Math.atan2(E, N)));
    const visible = altitudeDeg > 0;

    points.push({ azimuthDeg, altitudeDeg, visible, E, N, U });
  }

  {
    const vis = points.filter(p => p.visible);
    const altitudes = vis.map(p => p.altitudeDeg);
    const azimuths = vis.map(p => p.azimuthDeg);
    const eVals = vis.map(p => p.E);
    const uVals = vis.map(p => p.U);
    let maxEnuStep = 0;
    for (let i = 1; i < vis.length; i++) {
      const dE = vis[i].E - vis[i - 1].E;
      const dU = vis[i].U - vis[i - 1].U;
      const step = Math.hypot(dE, dU);
      if (step > maxEnuStep) maxEnuStep = step;
    }
    const nearZenithCount = altitudes.filter(a => a >= 89).length;
    _debugOnce(
      `inset:${inputs.latitudeDeg.toFixed(6)}:${inputs.longitudeDeg.toFixed(6)}:${inputs.timeMode.hh}:${inputs.timeMode.mm}:${inputs.tzOffsetHours}:${year}:${includeObliquity ? 1 : 0}:${includeEccentricity ? 1 : 0}`,
      {
        tag: 'AnalemmaDebug',
        mode: 'sky',
        series: 'eot_inset',
        inputs: {
          latitudeDeg: inputs.latitudeDeg,
          longitudeDeg: inputs.longitudeDeg,
          timeMode: inputs.timeMode,
          tzOffsetHours: inputs.tzOffsetHours,
          year,
          includeObliquity,
          includeEccentricity
        },
        counts: {
          totalDays: nDays,
          visibleDays: vis.length,
          nearZenithDays: nearZenithCount
        },
        ranges: {
          altitudeDeg: vis.length ? { min: Math.min(...altitudes), max: Math.max(...altitudes) } : null,
          azimuthDeg: vis.length ? { min: Math.min(...azimuths), max: Math.max(...azimuths) } : null,
          E: vis.length ? { min: Math.min(...eVals), max: Math.max(...eVals) } : null,
          U: vis.length ? { min: Math.min(...uVals), max: Math.max(...uVals) } : null
        },
        maxEnuStep
      }
    );
  }

  return points;
}
