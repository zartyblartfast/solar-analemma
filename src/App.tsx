import React, { useEffect, useMemo, useState } from 'react';
import {
  AnalemmaPoint,
  EotPoint,
  TimeMode,
  computeAnalemmaPoints,
  computeEquationOfTime,
  computeSunPathPoints,
} from './solar';
import { getTimeZones } from '@vvo/tzdb';
import { EquationOfTimeChart } from './EquationOfTimeChart';
import { computeEnuDomainsAspectLocked } from './enuScaling';

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

type DomeSeries = {
  key: string;
  label: string;
  points: AnalemmaPoint[];
  stroke: string;
  strokeWidth: number;
  opacity: number;
  showPoints: boolean;
  isHighlighted: boolean;
};

type SunPathSeries = {
  key: string;
  label: string;
  points: AnalemmaPoint[];
  stroke: string;
  strokeWidth: number;
  opacity: number;
  strokeDasharray?: string;
};

function useAnalemma(lat: number, lon: number, timeMode: TimeMode, tzOffsetHours: number) {
  return useMemo<AnalemmaPoint[]>(() => {
    return computeAnalemmaPoints({ latitudeDeg: lat, longitudeDeg: lon, timeMode, tzOffsetHours });
  }, [lat, lon, timeMode, tzOffsetHours]);
}

function useEquationOfTime(year: number) {
  return useMemo<EotPoint[]>(() => {
    return computeEquationOfTime(year);
  }, [year]);
}

function CardinalLabels({ width, height }: { width: number; height: number }) {
  const padding = 40;
  const xScale = (az: number) => padding + (az / 360) * (width - 2 * padding);
  const yScale = (alt: number) => padding + (1 - (alt + 10) / 100) * (height - 2 * padding);
  return (
    <g fontSize={12} fill="#555">
      <text x={xScale(0)} y={padding - 8} textAnchor="middle">N</text>
      <text x={xScale(90)} y={padding - 8} textAnchor="middle">E</text>
      <text x={xScale(180)} y={padding - 8} textAnchor="middle">S</text>
      <text x={xScale(270)} y={padding - 8} textAnchor="middle">W</text>
      <text x={padding} y={height - padding + 14} fill="#777">Azimuth (°)</text>
      <text x={width - padding + 6} y={padding} transform={`rotate(90 ${width - padding + 6} ${padding})`} fill="#777">Altitude (°)</text>
    </g>
  );
}

function AnalemmaChartSVG({
  points,
  label,
  view,
}: {
  points: AnalemmaPoint[];
  label: string;
  view: 'enu-eu' | 'az-alt' | 'polar';
}) {
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 800, h: 560 });
  const containerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const padding = 40;
  const visible = points.filter(p => p.visible);
  const hasVisible = visible.length > 0;
  const plotWidthPx = Math.max(1, size.w - 2 * padding);
  const plotHeightPx = Math.max(1, size.h - 2 * padding);

  if (view === 'polar') {
    const w = Math.max(1, size.w);
    const h = Math.max(1, size.h);
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.max(1, Math.min(w, h) / 2 - padding);

    const project = (azDeg: number, altDeg: number) => {
      const theta = (azDeg * Math.PI) / 180;
      const r = R * (1 - altDeg / 90);
      const x = cx + r * Math.sin(theta);
      const y = cy - r * Math.cos(theta);
      return { x, y };
    };

    const buildPolarPaths = (pts: AnalemmaPoint[]) => {
      const vis = pts.filter(p => p.visible);
      const paths: string[] = [];
      if (vis.length === 0) return paths;
      let current: string[] = [];
      let prev: { x: number; y: number } | undefined;
      const JUMP_THRESHOLD = R * 0.35;
      for (let i = 0; i < vis.length; i++) {
        const p = vis[i];
        const { x, y } = project(p.azimuthDeg, p.altitudeDeg);
        const shouldBreak = prev ? Math.hypot(x - prev.x, y - prev.y) > JUMP_THRESHOLD : false;
        if (shouldBreak && current.length > 0) {
          paths.push(current.join(' '));
          current = [];
        }
        const cmd = current.length === 0 ? 'M' : 'L';
        current.push(`${cmd} ${x.toFixed(2)} ${y.toFixed(2)}`);
        prev = { x, y };
      }
      if (current.length > 0) paths.push(current.join(' '));
      return paths;
    };

    const polarPaths = buildPolarPaths(points);
    const altitudeRings = [10, 20, 30, 40, 50, 60, 70, 80];
    const spokeDegs = Array.from({ length: 12 }, (_, i) => i * 30);
    const tickDegs = Array.from({ length: 36 }, (_, i) => i * 10);

    return (
      <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
        <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" role="img" aria-label="Sun analemma chart">
          <rect x={0} y={0} width={w} height={h} fill="#fff" />
          <circle cx={cx} cy={cy} r={R} fill="#fff" stroke="#ddd" />

          {altitudeRings.map((alt) => {
            const r = R * (1 - alt / 90);
            const y = cy - r;
            return (
              <g key={`ring-${alt}`}>
                <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f0f0f0" />
                <text x={cx} y={y - 4} fontSize={10} fill="#999" textAnchor="middle">
                  {alt}°
                </text>
              </g>
            );
          })}

          {spokeDegs.map((deg) => {
            const theta = (deg * Math.PI) / 180;
            const x2 = cx + R * Math.sin(theta);
            const y2 = cy - R * Math.cos(theta);
            const isCardinal = deg % 90 === 0;
            return <line key={`spoke-${deg}`} x1={cx} y1={cy} x2={x2} y2={y2} stroke={isCardinal ? '#e6e6e6' : '#f2f2f2'} />;
          })}

          {tickDegs.map((deg) => {
            const theta = (deg * Math.PI) / 180;
            const major = deg % 30 === 0;
            const r0 = R;
            const r1 = R + (major ? 10 : 6);
            const x0 = cx + r0 * Math.sin(theta);
            const y0 = cy - r0 * Math.cos(theta);
            const x1 = cx + r1 * Math.sin(theta);
            const y1 = cy - r1 * Math.cos(theta);
            return <line key={`tick-${deg}`} x1={x0} y1={y0} x2={x1} y2={y1} stroke="#bbb" />;
          })}

          {spokeDegs.map((deg) => {
            const theta = (deg * Math.PI) / 180;
            const rLabel = R + 22;
            const x = cx + rLabel * Math.sin(theta);
            const y = cy - rLabel * Math.cos(theta);
            let textAnchor: 'start' | 'middle' | 'end' = 'middle';
            if (deg > 0 && deg < 180) textAnchor = 'start';
            if (deg > 180 && deg < 360) textAnchor = 'end';
            return (
              <text key={`az-${deg}`} x={x} y={y + 3} fontSize={10} fill="#777" textAnchor={textAnchor}>
                {deg}°
              </text>
            );
          })}

          <text x={cx} y={cy - R - 14} fontSize={12} fill="#b00020" fontWeight={700} textAnchor="middle">N</text>
          <text x={cx + R + 14} y={cy + 4} fontSize={12} fill="#b00020" fontWeight={700} textAnchor="middle">E</text>
          <text x={cx} y={cy + R + 26} fontSize={12} fill="#b00020" fontWeight={700} textAnchor="middle">S</text>
          <text x={cx - R - 14} y={cy + 4} fontSize={12} fill="#b00020" fontWeight={700} textAnchor="middle">W</text>

          {hasVisible ? (
            <>
              {polarPaths.map((d, idx) => (
                <path key={`polar-path-${idx}`} d={d} fill="none" stroke="#0b6cfb" strokeWidth={2} />
              ))}
              {visible.map((p, idx) => {
                const { x, y } = project(p.azimuthDeg, p.altitudeDeg);
                return (
                  <g key={`polar-pt-${idx}`}>
                    <circle cx={x} cy={y} r={2.25} fill="#0b6cfb" stroke="#084fc8" strokeWidth={0.5} />
                    <title>{`${label}\n${p.dateISO}\nAlt ${p.altitudeDeg.toFixed(1)}°, Az ${p.azimuthDeg.toFixed(1)}°`}</title>
                  </g>
                );
              })}
            </>
          ) : (
            <text x={cx} y={cy} textAnchor="middle" fill="#777">No daylight at this solar time for this location.</text>
          )}
        </svg>
      </div>
    );
  }

  const paths: string[] = [];

  let xScale: (v: number) => number;
  let yScale: (v: number) => number;
  let xTicks: number[] = [];
  let yTicks: number[] = [];
  const azLabelFor = (azUnwrappedDeg: number) => {
    const norm = ((azUnwrappedDeg % 360) + 360) % 360;
    return norm;
  };

  if (view === 'az-alt') {
    const azVals = hasVisible ? visible.map(p => p.azimuthDeg) : [];
    const refAz = azVals.length ? azVals.sort((a, b) => a - b)[Math.floor(azVals.length / 2)] : 180;
    const unwrapAz = (azDeg: number) => {
      const d = ((azDeg - refAz + 540) % 360) - 180;
      return refAz + d;
    };

    const azUnwrapped = hasVisible ? visible.map(p => unwrapAz(p.azimuthDeg)) : [];
    const azMin = azUnwrapped.length ? Math.min(...azUnwrapped) : 0;
    const azMax = azUnwrapped.length ? Math.max(...azUnwrapped) : 360;
    const azSpan = Math.max(1e-6, azMax - azMin);
    const azPad = Math.max(10, azSpan * 0.15);
    let azDomainMin = azMin - azPad;
    let azDomainMax = azMax + azPad;
    let azDomainSpan = Math.max(1e-6, azDomainMax - azDomainMin);

    // If the analemma is near the meridian (midday-ish), the true azimuth span can be small.
    // Auto-zooming too tightly exaggerates tiny azimuth changes and makes the curve look “rotated”.
    // Enforce a minimum azimuth span to keep a stable, interpretable orientation.
    const MIN_AZ_SPAN_DEG = 120;
    if (azDomainSpan < MIN_AZ_SPAN_DEG) {
      const mid = (azDomainMin + azDomainMax) / 2;
      azDomainMin = mid - MIN_AZ_SPAN_DEG / 2;
      azDomainMax = mid + MIN_AZ_SPAN_DEG / 2;
      azDomainSpan = Math.max(1e-6, azDomainMax - azDomainMin);
    }

    xScale = (azUnwrappedDeg: number) => padding + ((azUnwrappedDeg - azDomainMin) / azDomainSpan) * plotWidthPx;
    yScale = (altDeg: number) => padding + (1 - altDeg / 90) * plotHeightPx;

    const tickStep = azDomainSpan <= 80 ? 10 : azDomainSpan <= 160 ? 20 : 30;
    const tickStart = Math.ceil(azDomainMin / tickStep) * tickStep;
    const tickEnd = Math.floor(azDomainMax / tickStep) * tickStep;
    xTicks = [];
    for (let t = tickStart; t <= tickEnd; t += tickStep) xTicks.push(t);
    yTicks = Array.from({ length: 7 }, (_, i) => i * 15);

    if (hasVisible) {
      let currentSegment: string[] = [];
      let prevAzU: number | undefined;
      for (let i = 0; i < visible.length; i++) {
        const p = visible[i];
        const azU = unwrapAz(p.azimuthDeg);
        const shouldBreak = prevAzU !== undefined ? Math.abs(azU - prevAzU) > 180 : false;
        if (shouldBreak && currentSegment.length > 0) {
          paths.push(currentSegment.join(' '));
          currentSegment = [];
        }
        const cmd = currentSegment.length === 0 ? 'M' : 'L';
        currentSegment.push(`${cmd} ${xScale(azU).toFixed(2)} ${yScale(p.altitudeDeg).toFixed(2)}`);
        prevAzU = azU;
      }
      if (currentSegment.length > 0) {
        paths.push(currentSegment.join(' '));
      }
    }
  } else {
    const eMin = hasVisible ? Math.min(...visible.map(p => p.E)) : -1;
    const eMax = hasVisible ? Math.max(...visible.map(p => p.E)) : 1;
    const uMin = hasVisible ? Math.min(...visible.map(p => p.U)) : 0;
    const uMax = hasVisible ? Math.max(...visible.map(p => p.U)) : 1;

    const { eDomain, uDomain } = computeEnuDomainsAspectLocked({
      eMin,
      eMax,
      uMin,
      uMax,
      plotWidthPx,
      plotHeightPx,
      padFraction: 0.1,
      minPadE: 0.1,
      minPadU: 0.05,
      minSpan: 1e-6,
    });

    xScale = (e: number) => {
      const span = Math.max(1e-6, eDomain[1] - eDomain[0]);
      return padding + ((e - eDomain[0]) / span) * plotWidthPx;
    };
    yScale = (u: number) => {
      const span = Math.max(1e-6, uDomain[1] - uDomain[0]);
      return padding + (1 - (u - uDomain[0]) / span) * plotHeightPx;
    };

    xTicks = Array.from({ length: 6 }).map((_, i) => eDomain[0] + (i * (eDomain[1] - eDomain[0])) / 5);
    yTicks = Array.from({ length: 6 }).map((_, i) => uDomain[0] + (i * (uDomain[1] - uDomain[0])) / 5);

    if (hasVisible && visible.length > 0) {
      const ZENITH_ALT_THRESHOLD = 89.0;
      const ENU_JUMP_THRESHOLD = 0.3;
      let currentSegment: string[] = [];

      for (let i = 0; i < visible.length; i++) {
        const p = visible[i];
        let shouldBreak = false;
        if (p.altitudeDeg > ZENITH_ALT_THRESHOLD) {
          shouldBreak = true;
        }
        if (i > 0 && !shouldBreak) {
          const prev = visible[i - 1];
          const deltaE = Math.abs(p.E - prev.E);
          const deltaN = Math.abs(p.N - prev.N);
          if (deltaE > ENU_JUMP_THRESHOLD || deltaN > ENU_JUMP_THRESHOLD) {
            shouldBreak = true;
          }
        }

        if (shouldBreak) {
          if (currentSegment.length > 0) {
            paths.push(currentSegment.join(' '));
            currentSegment = [];
          }
        } else {
          const cmd = currentSegment.length === 0 ? 'M' : 'L';
          currentSegment.push(`${cmd} ${xScale(p.E).toFixed(2)} ${yScale(p.U).toFixed(2)}`);
        }
      }

      if (currentSegment.length > 0) {
        paths.push(currentSegment.join(' '));
      }
    }
  }

  const labeledPoints: Array<{ point: typeof visible[0]; label: string; isSpecial: boolean }> = [];
  
  if (view !== 'az-alt' && hasVisible && visible.length > 0) {
    // Approximate dates for equinoxes and solstices (2024 values, close enough for most years)
    const specialDates = [
      { date: '03-20', label: 'Spring Equinox (Mar 20)', isSpecial: true },
      { date: '06-21', label: 'Summer Solstice (Jun 21)', isSpecial: true },
      { date: '09-22', label: 'Autumn Equinox (Sep 22)', isSpecial: true },
      { date: '12-21', label: 'Winter Solstice (Dec 21)', isSpecial: true },
    ];

    // Find closest match for each special date
    const specialMatches: Array<{ point: any; label: string; distance: number }> = [];
    for (const sd of specialDates) {
      const [sdMonth, sdDay] = sd.date.split('-').map(Number);
      let closestPoint: any = null;
      let closestDistance = Infinity;
      
      for (const p of visible) {
        const month = parseInt(p.dateISO.substring(5, 7));
        const day = parseInt(p.dateISO.substring(8, 10));
        
        if (month === sdMonth) {
          const distance = Math.abs(day - sdDay);
          if (distance <= 1 && distance < closestDistance) {
            closestPoint = p;
            closestDistance = distance;
          }
        }
      }
      
      if (closestPoint !== null) {
        specialMatches.push({ point: closestPoint, label: sd.label, distance: closestDistance });
      }
    }

    // Add special date labels
    specialMatches.forEach(sm => {
      labeledPoints.push({ point: sm.point, label: sm.label, isSpecial: true });
    });

    // First day of each month (excluding those already labeled as special)
    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const specialDateISOs = new Set(specialMatches.map(sm => sm.point.dateISO));
    
    visible.forEach((p: any) => {
      const day = parseInt(p.dateISO.substring(8, 10));
      const month = parseInt(p.dateISO.substring(5, 7)) - 1; // 0-indexed
      
      if (day === 1 && !specialDateISOs.has(p.dateISO)) {
        labeledPoints.push({ point: p, label: `1 ${monthLabels[month]}`, isSpecial: false });
      }
    });
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <svg viewBox={`0 0 ${size.w} ${size.h}`} width="100%" height="100%" role="img" aria-label="Sun analemma chart">
        <rect x={0} y={0} width={size.w} height={size.h} fill="#fff" />
        {/* Axes */}
        <line x1={padding} y1={size.h - padding} x2={size.w - padding} y2={size.h - padding} stroke="#ddd" />
        <line x1={padding} y1={padding} x2={padding} y2={size.h - padding} stroke="#ddd" />
        <rect x={padding} y={padding} width={size.w - 2 * padding} height={size.h - 2 * padding} fill="none" stroke="#eee" />
        {/* Light grid - horizontal lines */}
        {yTicks.map((u, i) => {
          const y = yScale(u);
          return <line key={`hg${i}`} x1={padding} y1={y} x2={size.w - padding} y2={y} stroke="#f2f2f2" />
        })}
        {xTicks.map((e, i) => {
          const x = xScale(e);
          return <line key={`vg${i}`} x1={x} y1={padding} x2={x} y2={size.h - padding} stroke="#f2f2f2" />
        })}
        {xTicks.map((e, i) => {
          const x = xScale(e);
          return (
            <g key={`xt${i}`}>
              <line x1={x} y1={size.h - padding} x2={x} y2={size.h - padding + 6} stroke="#bbb" />
              <text x={x} y={size.h - padding + 18} fontSize={10} fill="#777" textAnchor="middle">
                {view === 'az-alt' ? azLabelFor(e).toFixed(0) : e.toFixed(2)}
              </text>
            </g>
          );
        })}
        {yTicks.map((u, i) => {
          const y = yScale(u);
          return (
            <g key={`yt${i}`}>
              <line x1={padding - 6} y1={y} x2={padding} y2={y} stroke="#bbb" />
              <text x={padding - 10} y={y + 3} fontSize={10} fill="#777" textAnchor="end">
                {u.toFixed(2)}
              </text>
            </g>
          );
        })}
        {/* Axis labels */}
        {view === 'az-alt' ? (
          <>
            <text x={padding} y={size.h - padding + 14} fontSize={12} fill="#777">Azimuth (°)</text>
            <text x={size.w - padding + 6} y={padding} fontSize={12} fill="#777" transform={`rotate(90 ${size.w - padding + 6} ${padding})`}>Altitude (°)</text>
          </>
        ) : (
          <>
            <text x={padding} y={size.h - padding + 14} fontSize={12} fill="#777">East ←→ West</text>
            <text x={size.w - padding + 6} y={padding} fontSize={12} fill="#777" transform={`rotate(90 ${size.w - padding + 6} ${padding})`}>Elevation</text>
          </>
        )}
        {/* No daylight message */}
        {hasVisible ? null : (
          <text x={size.w / 2} y={size.h / 2} textAnchor="middle" fill="#777">No daylight at this solar time for this location.</text>
        )}
        {/* Analemma path */}
        {paths.map((path, idx) => (
          <path key={idx} d={path} fill="none" stroke="#0b6cfb" strokeWidth={2} />
        ))}
        {/* Date labels with leader lines */}
        {view === 'az-alt' ? null : labeledPoints.map((lp, idx) => {
          const x = xScale(lp.point.E);
          const y = yScale(lp.point.U);
          
          // Find the index of this point in the visible array
          const pointIdx = visible.findIndex(p => p.dateISO === lp.point.dateISO);
          
          // Calculate analemma centroid for outward normal detection
          const allX = visible.map(p => xScale(p.E));
          const allY = visible.map(p => yScale(p.U));
          const centroidX = allX.reduce((a, b) => a + b, 0) / allX.length;
          const centroidY = allY.reduce((a, b) => a + b, 0) / allY.length;
          
          // Step 1: Calculate local tangent using neighboring points
          const prevIdx = Math.max(0, pointIdx - 1);
          const nextIdx = Math.min(visible.length - 1, pointIdx + 1);
          const prevX = xScale(visible[prevIdx].E);
          const prevY = yScale(visible[prevIdx].U);
          const nextX = xScale(visible[nextIdx].E);
          const nextY = yScale(visible[nextIdx].U);
          
          // Tangent vector (normalized)
          const tangentDx = nextX - prevX;
          const tangentDy = nextY - prevY;
          const tangentMag = Math.hypot(tangentDx, tangentDy);
          const Tx = tangentMag > 0 ? tangentDx / tangentMag : 1;
          const Ty = tangentMag > 0 ? tangentDy / tangentMag : 0;
          
          // Step 2: Calculate both normal vectors (perpendicular to tangent)
          const N1x = -Ty;
          const N1y = Tx;
          const N2x = Ty;
          const N2y = -Tx;
          
          // Step 3: Determine which normal points outward using centroid distance test
          const epsilon = 5;
          const test1X = x + epsilon * N1x;
          const test1Y = y + epsilon * N1y;
          const test2X = x + epsilon * N2x;
          const test2Y = y + epsilon * N2y;
          
          const dist1 = Math.hypot(test1X - centroidX, test1Y - centroidY);
          const dist2 = Math.hypot(test2X - centroidX, test2Y - centroidY);
          
          // Choose the normal that moves farther from centroid (compare both)
          const Nx = dist1 > dist2 ? N1x : N2x;
          const Ny = dist1 > dist2 ? N1y : N2y;
          
          // Step 4: Calculate local curvature for distance adjustment
          const v1x = x - prevX;
          const v1y = y - prevY;
          const v2x = nextX - x;
          const v2y = nextY - y;
          const mag1 = Math.hypot(v1x, v1y);
          const mag2 = Math.hypot(v2x, v2y);
          
          let curvature = 0;
          if (mag1 > 0 && mag2 > 0) {
            const dot = (v1x * v2x + v1y * v2y) / (mag1 * mag2);
            const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
            curvature = angle;
          }
          
          // Step 5: Calculate label distance with curvature adjustment
          const baseDistance = lp.isSpecial ? 45 : 35;
          const curvatureBoost = curvature * 15; // More distance for tight curves
          const labelDistance = baseDistance + curvatureBoost;
          
          // Step 6: Place label along outward normal
          let labelX = x + Nx * labelDistance;
          let labelY = y + Ny * labelDistance;
          
          // Step 7: Clamp to viewport bounds
          const chartMargin = 10;
          const chartMinX = padding + chartMargin;
          const chartMaxX = size.w - padding - chartMargin;
          const chartMinY = padding + chartMargin;
          const chartMaxY = size.h - padding - chartMargin;
          
          labelX = Math.max(chartMinX, Math.min(chartMaxX, labelX));
          labelY = Math.max(chartMinY, Math.min(chartMaxY, labelY));
          
          const isRight = Nx > 0;
          
          const color = lp.isSpecial ? '#8b0000' : '#8b4513';
          const markerSize = lp.isSpecial ? 5 : 3.5;
          const fontSize = lp.isSpecial ? 11 : 10;
          const textAnchor = isRight ? 'start' : 'end';
          
          return (
            <g key={`label-${idx}`}>
              {/* Highlighted marker */}
              <circle cx={x} cy={y} r={markerSize} fill={color} stroke="#fff" strokeWidth={1} />
              {/* Leader line */}
              <line x1={x} y1={y} x2={labelX} y2={labelY} stroke={color} strokeWidth={1} strokeDasharray={lp.isSpecial ? '0' : '2,2'} />
              {/* Label text */}
              <text 
                x={labelX} 
                y={labelY} 
                fontSize={fontSize} 
                fill={color} 
                fontWeight={lp.isSpecial ? 'bold' : 'normal'}
                textAnchor={textAnchor}
                dominantBaseline="middle"
              >
                {lp.label}
              </text>
            </g>
          );
        })}
        {/* Regular markers for all other points */}
        {visible.map((p, idx) => {
          const isLabeled = labeledPoints.some(lp => lp.point.dateISO === p.dateISO);
          if (view !== 'az-alt' && isLabeled) return null;
          if (view === 'az-alt') {
            const azVals = visible.map(pp => pp.azimuthDeg);
            const refAz = azVals.length ? [...azVals].sort((a, b) => a - b)[Math.floor(azVals.length / 2)] : 180;
            const unwrapAz = (azDeg: number) => {
              const d = ((azDeg - refAz + 540) % 360) - 180;
              return refAz + d;
            };
            return (
              <g key={idx}>
                <circle cx={xScale(unwrapAz(p.azimuthDeg))} cy={yScale(p.altitudeDeg)} r={2.25} fill="#0b6cfb" stroke="#084fc8" strokeWidth={0.5} />
                <title>{`${label}\n${p.dateISO}\nAlt ${p.altitudeDeg.toFixed(1)}°, Az ${p.azimuthDeg.toFixed(1)}°`}</title>
              </g>
            );
          }
          return (
            <g key={idx}>
              <circle cx={xScale(p.E)} cy={yScale(p.U)} r={2.5} fill="#0b6cfb" stroke="#084fc8" strokeWidth={0.5} />
              <title>{`${label}\n${p.dateISO}\nAlt ${p.altitudeDeg.toFixed(1)}°, Az ${p.azimuthDeg.toFixed(1)}°`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function SkyDomeChartSVG({
  series,
  sunPaths,
  label,
}: {
  series: DomeSeries[];
  sunPaths: SunPathSeries[];
  label: string;
}) {
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 800, h: 560 });
  const containerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const visibleAny = series.some(s => s.points.some(p => p.visible));

  const w = Math.max(1, size.w);
  const h = Math.max(1, size.h);
  const padding = 40;
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.max(1, Math.min(w, h) / 2 - padding);

  const project = (azDeg: number, altDeg: number) => {
    const theta = (azDeg * Math.PI) / 180;
    const r = R * (1 - altDeg / 90);
    const x = cx + r * Math.sin(theta);
    const y = cy - r * Math.cos(theta);
    return { x, y };
  };

  const JUMP_THRESHOLD = R * 0.35;
  const buildPaths = (pts: AnalemmaPoint[]) => {
    const visible = pts.filter(p => p.visible);
    const paths: string[] = [];
    if (visible.length === 0) return paths;
    let currentSegment: string[] = [];
    let prev: { x: number; y: number } | undefined;

    for (let i = 0; i < visible.length; i++) {
      const p = visible[i];
      const { x, y } = project(p.azimuthDeg, p.altitudeDeg);
      const shouldBreak = prev ? Math.hypot(x - prev.x, y - prev.y) > JUMP_THRESHOLD : false;
      if (shouldBreak && currentSegment.length > 0) {
        paths.push(currentSegment.join(' '));
        currentSegment = [];
      }
      const cmd = currentSegment.length === 0 ? 'M' : 'L';
      currentSegment.push(`${cmd} ${x.toFixed(2)} ${y.toFixed(2)}`);
      prev = { x, y };
    }

    if (currentSegment.length > 0) {
      paths.push(currentSegment.join(' '));
    }
    return paths;
  };

  const altitudeRings = [10, 20, 30, 40, 50, 60, 70, 80];
  const spokeDegs = Array.from({ length: 12 }, (_, i) => i * 30);
  const tickDegs = Array.from({ length: 36 }, (_, i) => i * 10);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" role="img" aria-label="Sky dome chart">
        <rect x={0} y={0} width={w} height={h} fill="#fff" />

        <circle cx={cx} cy={cy} r={R} fill="#fff" stroke="#ddd" />

        {altitudeRings.map((alt) => {
          const r = R * (1 - alt / 90);
          const y = cy - r;
          return (
            <g key={`ring-${alt}`}>
              <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f0f0f0" />
              <text x={cx} y={y - 4} fontSize={10} fill="#999" textAnchor="middle">
                {alt}°
              </text>
            </g>
          );
        })}

        {spokeDegs.map((deg) => {
          const theta = (deg * Math.PI) / 180;
          const x2 = cx + R * Math.sin(theta);
          const y2 = cy - R * Math.cos(theta);
          const isCardinal = deg % 90 === 0;
          return <line key={`spoke-${deg}`} x1={cx} y1={cy} x2={x2} y2={y2} stroke={isCardinal ? '#e6e6e6' : '#f2f2f2'} />;
        })}

        {tickDegs.map((deg) => {
          const theta = (deg * Math.PI) / 180;
          const major = deg % 30 === 0;
          const r0 = R;
          const r1 = R + (major ? 10 : 6);
          const x0 = cx + r0 * Math.sin(theta);
          const y0 = cy - r0 * Math.cos(theta);
          const x1 = cx + r1 * Math.sin(theta);
          const y1 = cy - r1 * Math.cos(theta);
          return <line key={`tick-${deg}`} x1={x0} y1={y0} x2={x1} y2={y1} stroke="#bbb" />;
        })}

        {spokeDegs.map((deg) => {
          const theta = (deg * Math.PI) / 180;
          const rLabel = R + 22;
          const x = cx + rLabel * Math.sin(theta);
          const y = cy - rLabel * Math.cos(theta);

          let textAnchor: 'start' | 'middle' | 'end' = 'middle';
          if (deg > 0 && deg < 180) textAnchor = 'start';
          if (deg > 180 && deg < 360) textAnchor = 'end';

          return (
            <text key={`az-${deg}`} x={x} y={y + 3} fontSize={10} fill="#777" textAnchor={textAnchor}>
              {deg}°
            </text>
          );
        })}

        <text x={cx} y={cy - R - 14} fontSize={12} fill="#b00020" fontWeight={700} textAnchor="middle">N</text>
        <text x={cx + R + 14} y={cy + 4} fontSize={12} fill="#b00020" fontWeight={700} textAnchor="middle">E</text>
        <text x={cx} y={cy + R + 26} fontSize={12} fill="#b00020" fontWeight={700} textAnchor="middle">S</text>
        <text x={cx - R - 14} y={cy + 4} fontSize={12} fill="#b00020" fontWeight={700} textAnchor="middle">W</text>

        {visibleAny ? (
          <>
            {sunPaths.map((sp) => {
              const paths = buildPaths(sp.points);
              return (
                <g key={`${sp.key}-group`} data-series={sp.key}>
                  {paths.map((d, idx) => (
                    <path
                      key={`${sp.key}-path-${idx}`}
                      d={d}
                      fill="none"
                      stroke={sp.stroke}
                      strokeWidth={sp.strokeWidth}
                      opacity={sp.opacity}
                      strokeDasharray={sp.strokeDasharray}
                    />
                  ))}
                </g>
              );
            })}

            {series.map((s) => {
              const paths = buildPaths(s.points);
              return paths.map((d, idx) => (
                <path
                  key={`${s.key}-path-${idx}`}
                  d={d}
                  fill="none"
                  stroke={s.stroke}
                  strokeWidth={s.strokeWidth}
                  opacity={s.opacity}
                />
              ));
            })}

            {series.map((s) => {
              if (!s.showPoints) return null;
              const visiblePts = s.points.filter(p => p.visible);
              return visiblePts.map((p, idx) => {
                const { x, y } = project(p.azimuthDeg, p.altitudeDeg);
                return (
                  <g key={`${s.key}-pt-${idx}`} opacity={s.opacity}>
                    <circle cx={x} cy={y} r={2.25} fill={s.stroke} stroke="#084fc8" strokeWidth={0.5} />
                    <title>{`${label}\n${s.label}\n${p.dateISO}\nAlt ${p.altitudeDeg.toFixed(1)}°, Az ${p.azimuthDeg.toFixed(1)}°`}</title>
                  </g>
                );
              });
            })}

            <g transform="translate(8 8)" fontSize={9} fill="#666">
              {series.map((s, i) => (
                <g key={`${s.key}-legend`} transform={`translate(0 ${i * 12})`} opacity={s.opacity}>
                  <line x1={0} y1={6} x2={16} y2={6} stroke={s.stroke} strokeWidth={s.strokeWidth} />
                  <text x={20} y={9} fontWeight={s.isHighlighted ? 700 : 400}>
                    {s.label}
                  </text>
                </g>
              ))}
            </g>

            <g transform={`translate(${Math.max(8, w - 170)} 8)`} fontSize={10} fill="#555">
              {sunPaths.map((sp, i) => (
                <g key={`${sp.key}-legend`} transform={`translate(0 ${i * 14})`} opacity={sp.opacity}>
                  <line
                    x1={0}
                    y1={7}
                    x2={18}
                    y2={7}
                    stroke={sp.stroke}
                    strokeWidth={sp.strokeWidth}
                    strokeDasharray={sp.strokeDasharray}
                  />
                  <text x={24} y={10}>{sp.label}</text>
                </g>
              ))}
            </g>
          </>
        ) : (
          <text x={cx} y={cy} textAnchor="middle" fill="#777">
            No daylight at this solar time for this location.
          </text>
        )}
      </svg>
    </div>
  );
}

export default function App() {
  const [mainAnalemmaView, setMainAnalemmaView] = useState<'enu-eu' | 'az-alt' | 'polar'>('enu-eu');
  const [locationQuery, setLocationQuery] = useState('');
  const [latitude, setLatitude] = useState(51.5);
  const [longitude, setLongitude] = useState(-0.13);
  const [hh, setHh] = useState(12);
  const [mm, setMm] = useState(0);
  const [tzOffsetHours, setTzOffsetHours] = useState(() => {
    // Default to browser's time zone offset
    return -new Date().getTimezoneOffset() / 60;
  });
  const [locationLabel, setLocationLabel] = useState('London, GB');
  const [locationError, setLocationError] = useState<string | undefined>();
  const [latError, setLatError] = useState<string | undefined>();
  const [lonError, setLonError] = useState<string | undefined>();
  const [infoOpen, setInfoOpen] = useState(false);
  
  // Get current year for EoT calculation
  const currentYear = new Date().getFullYear();
  const [isLoadingLocation, setIsLoadingLocation] = useState(true);

  // On initial load, try to get user's location via browser geolocation
  useEffect(() => {
    const startTime = Date.now();
    const minDisplayTime = 500; // Minimum time to show spinner (ms)
    
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          setLatitude(lat);
          setLongitude(lon);
          
          // Initialize a time zone offset estimate from longitude (user can override)
          const tzOffset = getTimeZoneOffset(lat, lon);
          setTzOffsetHours(tzOffset);
          
          // Get location name
          const label = await reverseGeocode(lat, lon);
          if (label) {
            setLocationLabel(label);
            setLocationQuery(label); // Also update the search input field
          } else {
            const fallbackLabel = `Location: ${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;
            setLocationLabel(fallbackLabel);
            setLocationQuery(fallbackLabel);
          }
          
          // Ensure spinner shows for minimum time
          const elapsed = Date.now() - startTime;
          const remainingTime = Math.max(0, minDisplayTime - elapsed);
          setTimeout(() => setIsLoadingLocation(false), remainingTime);
        },
        (error) => {
          // Geolocation failed or denied - keep London as default
          console.log('Geolocation not available, using London as default:', error.message);
          
          // Ensure spinner shows for minimum time
          const elapsed = Date.now() - startTime;
          const remainingTime = Math.max(0, minDisplayTime - elapsed);
          setTimeout(() => setIsLoadingLocation(false), remainingTime);
        },
        { timeout: 5000 }
      );
    } else {
      // Geolocation not supported
      setIsLoadingLocation(false);
    }
  }, []); // Empty dependency array = run once on mount

  const timeMode: TimeMode = { kind: 'fixedLocalTime', hh, mm };
  const points = useAnalemma(latitude, longitude, timeMode, tzOffsetHours);
  const eotPoints = useEquationOfTime(currentYear);
  const vis = points.filter(p => p.visible);
  const azMin = vis.length ? Math.min(...vis.map(p => p.azimuthDeg)) : undefined;
  const azMax = vis.length ? Math.max(...vis.map(p => p.azimuthDeg)) : undefined;
  const altMinVis = vis.length ? Math.min(...vis.map(p => p.altitudeDeg)) : undefined;
  const altMaxVis = vis.length ? Math.max(...vis.map(p => p.altitudeDeg)) : undefined;

  const domeSeries = useMemo<DomeSeries[]>(() => {
    const base: DomeSeries[] = [];
    for (let hour = 6; hour <= 18; hour++) {
      const t = (hour - 6) / 12;
      const hue = 220 - 180 * t;
      const stroke = `hsl(${hue.toFixed(0)} 80% 45%)`;
      base.push({
        key: `h${hour}`,
        label: `${String(hour).padStart(2, '0')}:00`,
        points: computeAnalemmaPoints({
          latitudeDeg: latitude,
          longitudeDeg: longitude,
          timeMode: { kind: 'fixedLocalTime', hh: hour, mm: 0 },
          tzOffsetHours,
        }),
        stroke,
        strokeWidth: 1.5,
        opacity: 0.5,
        showPoints: false,
        isHighlighted: false,
      });
    }

    const selectedLabel = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    const existing = mm === 0 && hh >= 6 && hh <= 18 ? base.find(s => s.key === `h${hh}`) : undefined;

    if (existing) {
      existing.isHighlighted = true;
      existing.opacity = 0.95;
      existing.strokeWidth = 2.75;
      existing.showPoints = true;
      return base;
    }

    const highlightStroke = 'hsl(220 90% 40%)';
    const highlight: DomeSeries = {
      key: `sel-${hh}-${mm}`,
      label: selectedLabel,
      points: points,
      stroke: highlightStroke,
      strokeWidth: 2.75,
      opacity: 0.95,
      showPoints: true,
      isHighlighted: true,
    };

    return [...base, highlight];
  }, [latitude, longitude, tzOffsetHours, hh, mm, points]);

  const sunPathSeries = useMemo<SunPathSeries[]>(() => {
    const now = new Date();
    const localMs = now.getTime() + tzOffsetHours * 60 * 60 * 1000;
    const localNow = new Date(localMs);
    const y = localNow.getUTCFullYear();
    const m = localNow.getUTCMonth();
    const d = localNow.getUTCDate();
    const todayDateUTC = new Date(Date.UTC(y, m, d));

    const equinoxDateUTC = new Date(Date.UTC(y, 2, 20));
    const juneSolsticeUTC = new Date(Date.UTC(y, 5, 21));
    const decSolsticeUTC = new Date(Date.UTC(y, 11, 21));

    return [
      {
        key: 'sunpath-today',
        label: 'Today',
        points: computeSunPathPoints({ latitudeDeg: latitude, longitudeDeg: longitude, tzOffsetHours, date: todayDateUTC, stepMinutes: 5 }),
        stroke: '#f97316',
        strokeWidth: 2.5,
        opacity: 0.9,
      },
      {
        key: 'sunpath-equinox',
        label: 'Equinox',
        points: computeSunPathPoints({ latitudeDeg: latitude, longitudeDeg: longitude, tzOffsetHours, date: equinoxDateUTC, stepMinutes: 5 }),
        stroke: '#4b5563',
        strokeWidth: 2,
        opacity: 0.8,
        strokeDasharray: '6 4',
      },
      {
        key: 'sunpath-june',
        label: 'June solstice',
        points: computeSunPathPoints({ latitudeDeg: latitude, longitudeDeg: longitude, tzOffsetHours, date: juneSolsticeUTC, stepMinutes: 5 }),
        stroke: '#16a34a',
        strokeWidth: 2,
        opacity: 0.8,
      },
      {
        key: 'sunpath-dec',
        label: 'December solstice',
        points: computeSunPathPoints({ latitudeDeg: latitude, longitudeDeg: longitude, tzOffsetHours, date: decSolsticeUTC, stepMinutes: 5 }),
        stroke: '#2563eb',
        strokeWidth: 2,
        opacity: 0.8,
      },
    ];
  }, [latitude, longitude, tzOffsetHours]);

  // Calculate camera angle (center of analemma) using vector averaging
  // This converts each point to a 3D unit vector in ENU (East, North, Up) space,
  // averages them, then converts back to azimuth/elevation.
  // This is physically correct and handles all edge cases including tropical locations.
  let cameraAzimuth: number | undefined;
  let cameraAltitude: number | undefined;
  
  if (vis.length > 0) {
    let sumE = 0;
    let sumN = 0;
    let sumU = 0;
    
    for (const p of vis) {
      // Convert degrees to radians
      const azRad = (p.azimuthDeg * Math.PI) / 180;
      const altRad = (p.altitudeDeg * Math.PI) / 180;
      
      // Convert to 3D unit vector in ENU (East, North, Up) coordinates
      const U = Math.sin(altRad);
      const H = Math.cos(altRad);
      const E = H * Math.sin(azRad);
      const N = H * Math.cos(azRad);
      
      sumE += E;
      sumN += N;
      sumU += U;
    }
    
    // Average the vectors
    const avgE = sumE / vis.length;
    const avgN = sumN / vis.length;
    const avgU = sumU / vis.length;
    
    // Convert back to azimuth and altitude
    // atan2(E, N) gives azimuth (0° = North, clockwise)
    const azRad = Math.atan2(avgE, avgN);
    const azDeg = (azRad * 180) / Math.PI;
    cameraAzimuth = ((azDeg % 360) + 360) % 360;
    
    // atan2(U, sqrt(E²+N²)) gives altitude
    const horizontalDist = Math.sqrt(avgE * avgE + avgN * avgN);
    const altRad = Math.atan2(avgU, horizontalDist);
    cameraAltitude = (altRad * 180) / Math.PI;
  }

  // Convert azimuth to cardinal direction
  function azimuthToDirection(az: number): string {
    const normalized = ((az % 360) + 360) % 360;
    if (normalized >= 337.5 || normalized < 22.5) return 'North';
    if (normalized >= 22.5 && normalized < 67.5) return 'Northeast';
    if (normalized >= 67.5 && normalized < 112.5) return 'East';
    if (normalized >= 112.5 && normalized < 157.5) return 'Southeast';
    if (normalized >= 157.5 && normalized < 202.5) return 'South';
    if (normalized >= 202.5 && normalized < 247.5) return 'Southwest';
    if (normalized >= 247.5 && normalized < 292.5) return 'West';
    return 'Northwest';
  }

  // Geocode using Nominatim (OpenStreetMap) API
  async function geocode(query: string): Promise<{ lat: number; lon: number; label: string } | null> {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'SunAnalemmaApp/1.0'
        }
      });
      if (!response.ok) return null;
      const data = await response.json();
      if (!data || data.length === 0) return null;
      const result = data[0];
      return {
        lat: parseFloat(result.lat),
        lon: parseFloat(result.lon),
        label: result.display_name || query
      };
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  }

  // Reverse geocode: convert lat/lon to location name (city, country format)
  async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'SunAnalemmaApp/1.0'
        }
      });
      if (!response.ok) return null;
      const data = await response.json();
      
      // Extract city/town and country from address components
      const address = data.address;
      if (!address) return data.display_name || null;
      
      const city = address.city || address.town || address.village || address.hamlet || address.county;
      const country = address.country;
      
      if (city && country) {
        // Use ISO country code if available, otherwise full country name
        const countryCode = address.country_code?.toUpperCase();
        return `${city}, ${countryCode || country}`;
      }
      
      return data.display_name || null;
    } catch (error) {
      console.error('Reverse geocoding error:', error);
      return null;
    }
  }

  // Estimate time zone offset from longitude with improved rounding.
  // This is not a true political time zone lookup; users should override if needed.
  // Most offsets are whole hours, some are half-hours (India, Iran, etc.)
  function getTimeZoneOffset(lat: number, lon: number): number {
    try {
      // Calculate ideal offset from longitude (15° per hour)
      const idealOffset = lon / 15;
      
      console.log(`Time zone calculation for lon=${lon}:`);
      console.log(`  idealOffset = ${lon} / 15 = ${idealOffset}`);
      
      // Calculate distances to nearest whole hour and nearest half-hour
      const wholeHour = Math.round(idealOffset);
      const halfHour = Math.floor(idealOffset) + 0.5;
      
      const wholeHourDiff = Math.abs(idealOffset - wholeHour);
      const halfHourDiff = Math.abs(idealOffset - halfHour);
      
      console.log(`  wholeHour = ${wholeHour}, distance = ${wholeHourDiff}`);
      console.log(`  halfHour = ${halfHour}, distance = ${halfHourDiff}`);
      
      // Use whichever is closer, but require half-hour to be VERY close (within 6 minutes)
      let result;
      if (halfHourDiff < 0.1 && halfHourDiff < wholeHourDiff) {
        // Very close to half-hour (within 6 minutes) AND closer than whole hour
        // This catches India +5.5, Iran +3.5, Myanmar +6.5, etc.
        result = halfHour;
        console.log(`  Using half-hour offset: ${result}`);
      } else {
        // Use whole hour (most common case)
        result = wholeHour;
        console.log(`  Using whole-hour offset: ${result}`);
      }
      
      // Clamp to valid range [-12, +14]
      return Math.max(-12, Math.min(14, result));
      
    } catch (error) {
      console.error('Time zone lookup error:', error);
      // Final fallback to browser's time zone
      return -new Date().getTimezoneOffset() / 60;
    }
  }

  async function onApplyLocation() {
    if (!locationQuery.trim()) {
      setLocationError('Please enter a location name.');
      return;
    }
    setLocationError(undefined);
    const res = await geocode(locationQuery);
    if (res) {
      setLatitude(clamp(res.lat, -90, 90));
      setLongitude(clamp(res.lon, -180, 180));
      setLocationLabel(res.label);
      
      // Automatically get and set the accurate time zone offset
      const tzOffset = getTimeZoneOffset(res.lat, res.lon);
      setTzOffsetHours(tzOffset);
    } else {
      setLocationError('No match found, try a clearer query.');
    }
  }

  function onManualLatChange(v: string) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= -90 && n <= 90) {
      setLatError(undefined);
      setLatitude(n);
      setLocationLabel('Custom coordinates');
    } else {
      setLatError('Latitude must be between -90 and 90');
    }
  }

  function onManualLonChange(v: string) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= -180 && n <= 180) {
      setLonError(undefined);
      setLongitude(n);
      setLocationLabel('Custom coordinates');
    } else {
      setLonError('Longitude must be between -180 and 180');
    }
  }

  // Export data as CSV
  function exportAsCSV() {
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `analemma_${locationLabel.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.csv`;
    
    // Build CSV content
    let csv = '# Sun Analemma Data\n';
    csv += `# Location: ${locationLabel}\n`;
    csv += `# Latitude: ${latitude.toFixed(6)}°\n`;
    csv += `# Longitude: ${longitude.toFixed(6)}°\n`;
    csv += `# Time: ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} (Standard Time, no DST)\n`;
    csv += `# Time Zone Offset: UTC${tzOffsetHours >= 0 ? '+' : ''}${tzOffsetHours}\n`;
    if (cameraAzimuth !== undefined && cameraAltitude !== undefined) {
      csv += `# Camera Angle: ${azimuthToDirection(cameraAzimuth)} (${cameraAzimuth.toFixed(1)}°), ${cameraAltitude.toFixed(1)}° elevation\n`;
    }
    csv += `# Total Points: ${points.length}\n`;
    csv += `# Visible Points: ${vis.length}\n`;
    csv += `# Generated: ${new Date().toISOString()}\n`;
    csv += '\n';
    csv += 'Date,Azimuth (°),Altitude (°),Visible\n';
    
    points.forEach(p => {
      csv += `${p.dateISO},${p.azimuthDeg.toFixed(4)},${p.altitudeDeg.toFixed(4)},${p.visible}\n`;
    });
    
    // Trigger download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  // Export data as JSON
  function exportAsJSON() {
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `analemma_${locationLabel.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.json`;
    
    const data = {
      metadata: {
        location: locationLabel,
        latitude: latitude,
        longitude: longitude,
        time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
        timeNote: 'Standard Time (no DST)',
        timeZoneOffset: tzOffsetHours,
        timeZoneOffsetString: `UTC${tzOffsetHours >= 0 ? '+' : ''}${tzOffsetHours}`,
        cameraAngle: cameraAzimuth !== undefined && cameraAltitude !== undefined ? {
          azimuth: cameraAzimuth,
          azimuthDirection: azimuthToDirection(cameraAzimuth),
          altitude: cameraAltitude
        } : null,
        statistics: {
          totalPoints: points.length,
          visiblePoints: vis.length,
          azimuthRange: azMin !== undefined && azMax !== undefined ? { min: azMin, max: azMax } : null,
          altitudeRange: altMinVis !== undefined && altMaxVis !== undefined ? { min: altMinVis, max: altMaxVis } : null
        },
        generated: new Date().toISOString()
      },
      points: points.map(p => ({
        date: p.dateISO,
        azimuth: p.azimuthDeg,
        altitude: p.altitudeDeg,
        visible: p.visible
      }))
    };
    
    // Trigger download
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Sun Analemma</h1>
      </header>
      <main className="main">
        <section className="controls" aria-label="Inputs" style={{ position: 'relative', opacity: isLoadingLocation ? 0.6 : 1, pointerEvents: isLoadingLocation ? 'none' : 'auto' }}>
          {isLoadingLocation && (
            <div style={{ 
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 10,
              padding: '16px 24px', 
              backgroundColor: '#f0f9ff', 
              border: '2px solid #3b82f6', 
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              fontSize: '14px',
              fontWeight: 500,
              color: '#1e40af',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
            }}>
              <span style={{ 
                display: 'inline-block', 
                width: '20px', 
                height: '20px', 
                border: '3px solid #3b82f6', 
                borderTopColor: 'transparent', 
                borderRadius: '50%', 
                animation: 'spin 1s linear infinite' 
              }}></span>
              Detecting your location...
            </div>
          )}
          <div className="field">
            <label>Location</label>
            <div className="row">
              <input
                type="text"
                value={locationQuery}
                onChange={(e) => setLocationQuery(e.target.value)}
                placeholder="e.g., London"
              />
              <button onClick={onApplyLocation}>Search</button>
            </div>
            {locationError && <div className="hint error">{locationError}</div>}
          </div>

          <div className="row two-cols">
            <div className="field">
              <label>Latitude (°)</label>
              <input
                type="number"
                step="0.0001"
                value={latitude}
                onChange={(e) => onManualLatChange(e.target.value)}
              />
              {latError && <div className="hint error">{latError}</div>}
            </div>
            <div className="field">
              <label>Longitude (°)</label>
              <input
                type="number"
                step="0.0001"
                value={longitude}
                onChange={(e) => onManualLonChange(e.target.value)}
              />
              {lonError && <div className="hint error">{lonError}</div>}
            </div>
          </div>

          <div className="field">
            <label>Standard Time (no DST)</label>
            <div className="row">
              <label style={{ fontWeight: 500 }}>Fixed local time (HH:MM)</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  aria-label="Hours"
                  type="number"
                  min={0}
                  max={23}
                  value={hh}
                  onChange={(e) => setHh(clamp(Number(e.target.value), 0, 23))}
                  style={{ width: 64 }}
                />
                <span>:</span>
                <input
                  aria-label="Minutes"
                  type="number"
                  min={0}
                  max={59}
                  value={mm}
                  onChange={(e) => setMm(clamp(Number(e.target.value), 0, 59))}
                  style={{ width: 64 }}
                />
              </div>
            </div>
          </div>

          <div className="field">
            <label htmlFor="tzOffset">Time zone offset (UTC±H)</label>
            <div className="row">
              <input
                id="tzOffset"
                type="number"
                step="0.5"
                min="-12"
                max="14"
                value={tzOffsetHours}
                onChange={(e) => setTzOffsetHours(parseFloat(e.target.value) || 0)}
                style={{ width: '80px' }}
              />
              <span style={{ fontSize: '0.85em', color: '#666', marginLeft: '8px' }}>
                (initial estimate; adjust if needed)
              </span>
            </div>
          </div>

          <div className="field">
            <label>Location:</label>
            <div className="row">
              <span>{locationLabel}</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                <button onClick={exportAsCSV}>
                  Export CSV
                </button>
                <button onClick={exportAsJSON}>
                  Export JSON
                </button>
                <button onClick={() => setInfoOpen(!infoOpen)}>
                  Show info
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="chart" aria-label="Analemma output">
          <div className="chart-frame">
            <div className="chart-top">
              <div className="chart-panel" aria-label="Main analemma chart">
                <div className="chart-panel-body">
                  <div style={{ flex: 1, minHeight: 0 }}>
                    <AnalemmaChartSVG points={points} label={locationLabel} view={mainAnalemmaView} />
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, color: '#666', flex: '0 0 auto' }}>
                    <label htmlFor="mainAnalemmaView" style={{ marginRight: 8 }}>
                      <strong>View</strong>
                    </label>
                    <select
                      id="mainAnalemmaView"
                      value={mainAnalemmaView}
                      onChange={(e) => setMainAnalemmaView(e.target.value as any)}
                      style={{ marginRight: 16 }}
                    >
                      <option value="enu-eu">E–U (projection)</option>
                      <option value="az-alt">Az–Alt</option>
                      <option value="polar">Polar (sky projection)</option>
                    </select>
                    <span style={{ marginRight: 16 }}>
                      {mainAnalemmaView === 'enu-eu'
                        ? 'E vs U projection (drops N).'
                        : mainAnalemmaView === 'az-alt'
                          ? 'Azimuth/altitude in degrees (linear).'
                          : 'Same projection as the sky-dome.'}
                    </span>
                    <strong>Debug</strong>: visible={vis.length} {azMin !== undefined ? `| Az ${azMin.toFixed(1)}°…${azMax!.toFixed(1)}°` : ''} {altMinVis !== undefined ? `| Alt ${altMinVis.toFixed(1)}°…${altMaxVis!.toFixed(1)}°` : ''}
                    {cameraAzimuth !== undefined && cameraAltitude !== undefined && (
                      <span style={{ marginLeft: 16 }}>
                        <strong>Camera Angle</strong>: {azimuthToDirection(cameraAzimuth)} ({cameraAzimuth.toFixed(1)}°), {cameraAltitude.toFixed(1)}° elevation
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="chart-panel" aria-label="Sky dome (2D) chart">
                <div className="chart-panel-body">
                  <div style={{ flex: 1, minHeight: 0 }}>
                    <SkyDomeChartSVG series={domeSeries} sunPaths={sunPathSeries} label={locationLabel} />
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 24 }}>
              <EquationOfTimeChart
                points={eotPoints}
                latitude={latitude}
                longitude={longitude}
                timeMode={timeMode}
                tzOffsetHours={tzOffsetHours}
              />
            </div>
          </div>
        </section>
      </main>

      {infoOpen && (
        <aside className="info-panel">
          <h2>What is a Sun analemma?</h2>
          <p>
            It is the figure traced by the Sun observed at the same solar time every day over a year.
            Its shape arises from Earth’s axial tilt and orbital eccentricity.
          </p>
          <h3>Conventions used</h3>
          <ul>
            <li>Azimuth: 0° = North, increasing clockwise (E=90°, S=180°, W=270°).</li>
            <li>Altitude: degrees above the local horizon. Points with altitude ≤ 0° are not shown.</li>
            <li>Time: Solar time only (v1). Solar noon is when the Sun crosses the local meridian.</li>
          </ul>
          <h3>How it’s calculated (high-level)</h3>
          <ul>
            <li>Compute solar declination and use a fixed hour angle from solar time.</li>
            <li>Convert to altitude/azimuth for your latitude.</li>
            <li>Repeat for each day of the current year; plot visible points.</li>
          </ul>
        </aside>
      )}
    </div>
  );
}
