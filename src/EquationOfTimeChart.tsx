import React, { useEffect, useState, useMemo } from 'react';
import { EotPoint, computeAnalemmaInset, AnalemmaInsetPoint, TimeMode } from './solar';
import { computeEnuDomainsAspectLocked } from './enuScaling';

interface EquationOfTimeChartProps {
  points: EotPoint[];
  latitude: number;
  longitude: number;
  timeMode: TimeMode;
  tzOffsetHours: number;
}

export function EquationOfTimeChart({ points, latitude, longitude, timeMode, tzOffsetHours }: EquationOfTimeChartProps) {
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 800, h: 400 });
  const [hoveredPoint, setHoveredPoint] = useState<EotPoint | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [showObliquity, setShowObliquity] = useState(false);
  const [showEccentricity, setShowEccentricity] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  
  // Compute analemma inset points based on component toggles
  // Extract timeMode values to avoid object reference changes causing re-renders
  const timeHH = timeMode.hh;
  const timeMM = timeMode.mm;

  const insetYear = useMemo(() => {
    if (points.length === 0) return new Date().getFullYear();
    const y = Number.parseInt(points[0].dateISO.slice(0, 4), 10);
    return Number.isFinite(y) ? y : new Date().getFullYear();
  }, [points]);
  
  const analemmaInsetPoints = useMemo<AnalemmaInsetPoint[]>(() => {
    return computeAnalemmaInset(
      { latitudeDeg: latitude, longitudeDeg: longitude, timeMode: { kind: 'fixedLocalTime', hh: timeHH, mm: timeMM }, tzOffsetHours, year: insetYear },
      showObliquity,
      showEccentricity
    );
  }, [latitude, longitude, timeHH, timeMM, tzOffsetHours, insetYear, showObliquity, showEccentricity]);

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

  const paddingTop = 60;
  const paddingBottom = 50;
  const paddingLeft = 50;
  const paddingRight = 50;
  const chartWidth = size.w - paddingLeft - paddingRight;
  const chartHeight = size.h - paddingTop - paddingBottom;

  if (points.length === 0) {
    return (
      <div ref={containerRef} style={{ width: '100%', height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#999' }}>No data</p>
      </div>
    );
  }

  // Find min/max EoT values for scaling
  const eotValues = points.map(p => p.eotMinutes);
  const minEot = Math.min(...eotValues);
  const maxEot = Math.max(...eotValues);
  
  // Add some padding to the y-axis range
  const eotRange = maxEot - minEot;
  const yMin = minEot - eotRange * 0.1;
  const yMax = maxEot + eotRange * 0.1;

  // Scale functions
  const xScale = (dayOfYear: number) => {
    return paddingLeft + ((dayOfYear - 1) / (points.length - 1)) * chartWidth;
  };

  const yScale = (eotMinutes: number) => {
    return paddingTop + (1 - (eotMinutes - yMin) / (yMax - yMin)) * chartHeight;
  };

  // Build the path for total EoT
  const pathData = points.map((p, i) => {
    const x = xScale(p.dayOfYear);
    const y = yScale(p.eotMinutes);
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
  
  // Build paths for component curves
  const obliquityPathData = points.map((p, i) => {
    const x = xScale(p.dayOfYear);
    const y = yScale(p.obliquityComponent);
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
  
  const eccentricityPathData = points.map((p, i) => {
    const x = xScale(p.dayOfYear);
    const y = yScale(p.eccentricityComponent);
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');

  // Y-axis ticks (every 5 minutes)
  const yTicks: number[] = [];
  const tickInterval = 5;
  const startTick = Math.ceil(yMin / tickInterval) * tickInterval;
  for (let tick = startTick; tick <= yMax; tick += tickInterval) {
    yTicks.push(tick);
  }

  // Find extrema (local maxima and minima)
  const extrema: Array<{ point: EotPoint; type: 'max' | 'min'; label: string }> = [];
  
  // Find global max and min
  let maxPoint = points[0];
  let minPoint = points[0];
  for (const p of points) {
    if (p.eotMinutes > maxPoint.eotMinutes) maxPoint = p;
    if (p.eotMinutes < minPoint.eotMinutes) minPoint = p;
  }
  
  // Find local extrema by checking sign changes in derivative
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1].eotMinutes;
    const curr = points[i].eotMinutes;
    const next = points[i + 1].eotMinutes;
    
    // Local maximum
    if (curr > prev && curr > next && Math.abs(curr) > 5) {
      const isGlobalMax = points[i].dateISO === maxPoint.dateISO;
      extrema.push({
        point: points[i],
        type: 'max',
        label: isGlobalMax ? `Clock ahead by ${curr.toFixed(1)} min` : `Local max: ${curr.toFixed(1)} min`
      });
    }
    // Local minimum
    else if (curr < prev && curr < next && Math.abs(curr) > 5) {
      const isGlobalMin = points[i].dateISO === minPoint.dateISO;
      extrema.push({
        point: points[i],
        type: 'min',
        label: isGlobalMin ? `Clock behind by ${Math.abs(curr).toFixed(1)} min` : `Local min: ${curr.toFixed(1)} min`
      });
    }
  }
  
  // Solstice and equinox approximate days (non-leap year)
  const keyDates = [
    { day: 79, label: 'Mar Equinox', shortLabel: 'Mar Eq' },
    { day: 172, label: 'Jun Solstice', shortLabel: 'Jun Sol' },
    { day: 265, label: 'Sep Equinox', shortLabel: 'Sep Eq' },
    { day: 355, label: 'Dec Solstice', shortLabel: 'Dec Sol' }
  ];
  
  // X-axis ticks (monthly)
  const monthStarts = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  // Build shaded area paths for positive and negative regions
  const zeroY = yScale(0);
  const positiveAreaSegments: string[] = [];
  const negativeAreaSegments: string[] = [];
  
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const x = xScale(p.dayOfYear);
    const y = yScale(p.eotMinutes);
    
    if (p.eotMinutes >= 0) {
      if (positiveAreaSegments.length === 0) {
        positiveAreaSegments.push(`M ${x} ${zeroY}`);
      }
      positiveAreaSegments.push(`L ${x} ${y}`);
    } else if (positiveAreaSegments.length > 0) {
      positiveAreaSegments.push(`L ${x} ${zeroY} Z`);
      positiveAreaSegments.push(`M ${x} ${zeroY}`);
    }
    
    if (p.eotMinutes <= 0) {
      if (negativeAreaSegments.length === 0) {
        negativeAreaSegments.push(`M ${x} ${zeroY}`);
      }
      negativeAreaSegments.push(`L ${x} ${y}`);
    } else if (negativeAreaSegments.length > 0) {
      negativeAreaSegments.push(`L ${x} ${zeroY} Z`);
      negativeAreaSegments.push(`M ${x} ${zeroY}`);
    }
  }
  
  // Close final segments
  if (positiveAreaSegments.length > 0) {
    const lastP = points[points.length - 1];
    positiveAreaSegments.push(`L ${xScale(lastP.dayOfYear)} ${zeroY} Z`);
  }
  if (negativeAreaSegments.length > 0) {
    const lastP = points[points.length - 1];
    negativeAreaSegments.push(`L ${xScale(lastP.dayOfYear)} ${zeroY} Z`);
  }
  
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Find closest point
    const dayOfYear = ((x - paddingLeft) / chartWidth) * (points.length - 1) + 1;
    const closestIdx = Math.round(dayOfYear - 1);
    
    if (closestIdx >= 0 && closestIdx < points.length) {
      setHoveredPoint(points[closestIdx]);
      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  };
  
  const handleMouseLeave = () => {
    setHoveredPoint(null);
    setMousePos(null);
  };

  return (
    <div ref={containerRef} style={{ width: '100%', height: '400px' }}>
      <svg 
        width={size.w} 
        height={size.h} 
        style={{ border: '1px solid #ddd', background: '#fff', cursor: 'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Shaded regions for positive/negative EoT */}
        <path
          d={positiveAreaSegments.join(' ')}
          fill="#dbeafe"
          opacity={0.4}
        />
        <path
          d={negativeAreaSegments.join(' ')}
          fill="#fed7aa"
          opacity={0.4}
        />
        
        {/* Y-axis grid and labels */}
        {yTicks.map(tick => {
          const y = yScale(tick);
          return (
            <g key={tick}>
              <line
                x1={paddingLeft}
                y1={y}
                x2={size.w - paddingRight}
                y2={y}
                stroke={tick === 0 ? '#666' : '#e0e0e0'}
                strokeWidth={tick === 0 ? 1.5 : 1}
                strokeDasharray={tick === 0 ? 'none' : '2,2'}
              />
              <text
                x={paddingLeft - 8}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={10}
                fill="#666"
              >
                {tick}
              </text>
              {/* Annotation for zero line */}
              {tick === 0 && (
                <text
                  x={size.w - paddingRight - 10}
                  y={y - 8}
                  textAnchor="end"
                  fontSize={9}
                  fill="#666"
                  fontStyle="italic"
                >
                  Positive = solar noon after 12:00 · Negative = before 12:00
                </text>
              )}
            </g>
          );
        })}

        {/* Solstice/Equinox reference lines */}
        {keyDates.map((kd, i) => {
          if (kd.day > points.length) return null;
          const x = xScale(kd.day);
          return (
            <g key={`keydate-${i}`}>
              <line
                x1={x}
                y1={paddingTop}
                x2={x}
                y2={size.h - paddingBottom}
                stroke="#9333ea"
                strokeWidth={1}
                strokeDasharray="4,4"
                opacity={0.5}
              />
              <text
                x={x}
                y={paddingTop - 5}
                textAnchor="middle"
                fontSize={9}
                fill="#9333ea"
                fontWeight="500"
              >
                {kd.shortLabel}
              </text>
            </g>
          );
        })}
        
        {/* X-axis grid and labels */}
        {monthStarts.map((day, i) => {
          if (day > points.length) return null;
          const x = xScale(day);
          return (
            <g key={i}>
              <line
                x1={x}
                y1={paddingTop}
                x2={x}
                y2={size.h - paddingBottom}
                stroke="#e0e0e0"
                strokeWidth={1}
                strokeDasharray="2,2"
              />
              <text
                x={x}
                y={size.h - paddingBottom + 16}
                textAnchor="middle"
                fontSize={10}
                fill="#666"
              >
                {monthNames[i]}
              </text>
            </g>
          );
        })}

        {/* Component curves (if enabled) */}
        {showObliquity && (
          <path
            d={obliquityPathData}
            fill="none"
            stroke="#dc2626"
            strokeWidth={1.5}
            strokeDasharray="5,3"
            opacity={0.8}
          />
        )}
        {showEccentricity && (
          <path
            d={eccentricityPathData}
            fill="none"
            stroke="#16a34a"
            strokeWidth={1.5}
            strokeDasharray="5,3"
            opacity={0.8}
          />
        )}
        
        {/* EoT curve (total) */}
        <path
          d={pathData}
          fill="none"
          stroke="#2563eb"
          strokeWidth={2}
        />
        
        {/* Extrema markers and labels */}
        {extrema.map((ext, i) => {
          const x = xScale(ext.point.dayOfYear);
          const y = yScale(ext.point.eotMinutes);
          const isMax = ext.type === 'max';
          
          return (
            <g key={`extrema-${i}`}>
              <circle
                cx={x}
                cy={y}
                r={4}
                fill={isMax ? '#ef4444' : '#3b82f6'}
                stroke="#fff"
                strokeWidth={2}
              />
              <text
                x={x}
                y={isMax ? y - 12 : y + 18}
                textAnchor="middle"
                fontSize={10}
                fill={isMax ? '#dc2626' : '#2563eb'}
                fontWeight="600"
              >
                {ext.label}
              </text>
            </g>
          );
        })}
        
        {/* Hover tooltip */}
        {hoveredPoint && mousePos && (() => {
          // Format date as "11 Feb"
          const date = new Date(hoveredPoint.dateISO);
          const day = date.getDate();
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          const formattedDate = `${day} ${monthNames[date.getMonth()]}`;
          
          // Calculate solar noon time
          const eot = hoveredPoint.eotMinutes;
          const solarNoonHour = 12 + Math.floor(eot / 60);
          const solarNoonMin = Math.abs(Math.round(eot % 60));
          const solarNoonTime = `${solarNoonHour}:${solarNoonMin.toString().padStart(2, '0')}`;
          
          // Plain English interpretation
          let interpretation;
          if (Math.abs(eot) < 0.5) {
            interpretation = 'Sundial matches clock';
          } else if (eot > 0) {
            interpretation = 'Sundial ahead of clock';
          } else {
            interpretation = 'Sundial lags clock';
          }
          
          return (
            <g>
              <rect
                x={mousePos.x + 10}
                y={mousePos.y - 75}
                width={210}
                height={70}
                fill="#1f2937"
                stroke="#374151"
                strokeWidth={1}
                rx={4}
                opacity={0.95}
              />
              <text
                x={mousePos.x + 15}
                y={mousePos.y - 57}
                fontSize={12}
                fill="#f3f4f6"
                fontWeight="600"
              >
                {formattedDate}
              </text>
              <text
                x={mousePos.x + 15}
                y={mousePos.y - 42}
                fontSize={10}
                fill="#d1d5db"
              >
                EoT: {eot >= 0 ? '+' : ''}{eot.toFixed(1)} min
              </text>
              <text
                x={mousePos.x + 15}
                y={mousePos.y - 28}
                fontSize={10}
                fill="#fbbf24"
                fontWeight="500"
              >
                {interpretation}
              </text>
              <text
                x={mousePos.x + 15}
                y={mousePos.y - 12}
                fontSize={9}
                fill="#9ca3af"
                fontStyle="italic"
              >
                Solar noon at {solarNoonTime}
              </text>
            </g>
          );
        })()}

        {/* Axis labels */}
        <text
          x={size.w / 2}
          y={size.h - 8}
          textAnchor="middle"
          fontSize={12}
          fill="#666"
        >
          Date
        </text>
        <text
          x={12}
          y={size.h / 2}
          textAnchor="middle"
          fontSize={12}
          fill="#666"
          transform={`rotate(-90 12 ${size.h / 2})`}
        >
          Equation of Time (minutes)
        </text>

        {/* Title and subtitle */}
        <text
          x={size.w / 2}
          y={18}
          textAnchor="middle"
          fontSize={14}
          fontWeight="bold"
          fill="#333"
        >
          Equation of Time
        </text>
        <text
          x={size.w / 2}
          y={32}
          textAnchor="middle"
          fontSize={11}
          fill="#666"
        >
          Difference between Apparent Solar Time and Mean Solar Time
        </text>
        <text
          x={size.w / 2}
          y={44}
          textAnchor="middle"
          fontSize={9}
          fill="#999"
        >
          Positive = sundial ahead of clock · Negative = sundial behind clock
        </text>
        
        {/* Legend (always visible) */}
        <g transform={`translate(${size.w - 200}, 15)`}>
          <text x={0} y={0} fontSize={10} fontWeight="600" fill="#333">
            Components:
          </text>
          
          {/* Total EoT line */}
          <line x1={0} y1={15} x2={25} y2={15} stroke="#2563eb" strokeWidth={2} />
          <text x={30} y={18} fontSize={9} fill="#666">
            Total EoT
          </text>
          
          {/* Obliquity line */}
          <line x1={0} y1={28} x2={25} y2={28} stroke="#dc2626" strokeWidth={1.5} strokeDasharray="5,3" opacity={showObliquity ? 0.8 : 0.3} />
          <text x={30} y={31} fontSize={9} fill={showObliquity ? "#666" : "#999"}>
            Axial tilt
          </text>
          
          {/* Eccentricity line */}
          <line x1={0} y1={41} x2={25} y2={41} stroke="#16a34a" strokeWidth={1.5} strokeDasharray="5,3" opacity={showEccentricity ? 0.8 : 0.3} />
          <text x={30} y={44} fontSize={9} fill={showEccentricity ? "#666" : "#999"}>
            Orbital shape
          </text>
        </g>
        
        {/* Analemma inset (bottom-right corner) */}
        {(() => {
          // Hide inset if both components are disabled (no analemma without EoT variation)
          if (!showObliquity && !showEccentricity) return null;
          
          // Inset dimensions and position
          const insetWidth = Math.min(size.w * 0.14, 115);
          const insetHeight = Math.min(size.h * 0.28, 115);
          const insetX = size.w - paddingRight - insetWidth - 20;
          const insetY = size.h - paddingBottom - insetHeight - 5;
          
          if (analemmaInsetPoints.length === 0) return null;
          
          // Filter to visible points only
          const visiblePoints = analemmaInsetPoints.filter(p => p.visible);
          if (visiblePoints.length === 0) return null;
          
          // Use ENU coordinates like main analemma to avoid azimuth singularity
          const eValues = visiblePoints.map(p => p.E);
          const uValues = visiblePoints.map(p => p.U);
          const eMin = Math.min(...eValues);
          const eMax = Math.max(...eValues);
          const uMin = Math.min(...uValues);
          const uMax = Math.max(...uValues);

          const { eDomain, uDomain } = computeEnuDomainsAspectLocked({
            eMin,
            eMax,
            uMin,
            uMax,
            plotWidthPx: insetWidth,
            plotHeightPx: insetHeight,
            padFraction: 0.1,
            minPadE: 0.1,
            minPadU: 0.05,
            minSpan: 1e-6,
          });

          const eScaleMin = eDomain[0];
          const eScaleMax = eDomain[1];
          const uScaleMin = uDomain[0];
          const uScaleMax = uDomain[1];
          
          // Scale functions for inset (E = x, U = y)
          const insetXScale = (e: number) => {
            return insetX + ((e - eScaleMin) / (eScaleMax - eScaleMin)) * insetWidth;
          };
          
          const insetYScale = (u: number) => {
            return insetY + (1 - (u - uScaleMin) / (uScaleMax - uScaleMin)) * insetHeight;
          };
          
          // Build analemma as individual points using ENU coordinates
          const analemmaPoints = visiblePoints.map(p => {
            return {
              x: insetXScale(p.E),
              y: insetYScale(p.U)
            };
          });
          
          return (
            <g>
              {/* Inset background */}
              <rect
                x={insetX}
                y={insetY}
                width={insetWidth}
                height={insetHeight}
                fill="#f9fafb"
                stroke="#d1d5db"
                strokeWidth={1}
                rx={3}
              />
              
              {/* Analemma points */}
              {analemmaPoints.map((pt, i) => (
                <circle
                  key={i}
                  cx={pt.x}
                  cy={pt.y}
                  r={1.2}
                  fill="#2563eb"
                />
              ))}
              
              {/* Inset label */}
              <text
                x={insetX + insetWidth / 2}
                y={insetY - 5}
                textAnchor="middle"
                fontSize={9}
                fontWeight="600"
                fill="#374151"
              >
                Analemma
              </text>
            </g>
          );
        })()}
      </svg>
      
      {/* Toggle controls */}
      <div style={{ marginTop: 12, padding: '0 8px', display: 'flex', gap: '20px', alignItems: 'center', fontSize: 12 }}>
        <strong style={{ color: '#333' }}>Show components:</strong>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#555' }}>
          <input
            type="checkbox"
            checked={showObliquity}
            onChange={(e) => {
              console.log('Obliquity checkbox clicked:', e.target.checked);
              setShowObliquity(e.target.checked);
            }}
            style={{ cursor: 'pointer' }}
          />
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ 
              display: 'inline-block', 
              width: '20px', 
              height: '2px', 
              background: '#dc2626',
              borderTop: '2px dashed #dc2626',
              opacity: 0.8
            }}></span>
            Axial tilt (obliquity)
          </span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#555' }}>
          <input
            type="checkbox"
            checked={showEccentricity}
            onChange={(e) => {
              console.log('Eccentricity checkbox clicked:', e.target.checked);
              setShowEccentricity(e.target.checked);
            }}
            style={{ cursor: 'pointer' }}
          />
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ 
              display: 'inline-block', 
              width: '20px', 
              height: '2px', 
              background: '#16a34a',
              borderTop: '2px dashed #16a34a',
              opacity: 0.8
            }}></span>
            Orbital eccentricity
          </span>
        </label>
      </div>
      
      {/* Explanatory caption */}
      <div style={{ marginTop: 12, padding: '0 8px', fontSize: 12, color: '#555', lineHeight: 1.6 }}>
        <p style={{ margin: '4px 0' }}>
          <strong>What this shows:</strong> The Equation of Time arises from Earth's axial tilt and its slightly elliptical orbit. 
          It explains why the Sun does not cross the meridian at exactly 12:00 every day.
        </p>
        <p style={{ margin: '4px 0', fontSize: 11, color: '#777', fontStyle: 'italic' }}>
          💡 Equation of Time is the same worldwide; only clock offsets and longitude change local solar noon.
        </p>
        <p style={{ margin: '4px 0', fontSize: 11, color: '#6366f1', fontStyle: 'italic' }}>
          📊 <strong>Analemma inset:</strong> The analemma shows the Sun's yearly position at the same clock time; 
          its shape reflects the same Equation of Time components shown above.
        </p>
        {(showObliquity || showEccentricity) && (
          <p style={{ margin: '8px 0 4px', fontSize: 11, color: '#059669', fontWeight: '500' }}>
            ℹ️ The two component curves add together to produce the total Equation of Time. 
            This decomposition shows how Earth's tilted axis and elliptical orbit each contribute to the effect.
          </p>
        )}
      </div>
    </div>
  );
}
