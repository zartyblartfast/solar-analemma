// Detailed test matching exact solar.ts logic
const deg2rad = (d) => (d * Math.PI) / 180;
const rad2deg = (r) => (r * 180) / Math.PI;
const normalizeDeg = (d) => ((d % 360) + 360) % 360;

const phi = deg2rad(13.7524938); // Bangkok exact latitude from screenshot
const baseHours = 12; // Solar noon

console.log('Testing Bangkok (13.7524938°N, 100.4935089°E) at Solar Noon\n');

// Test every 30 days
for (let n = 1; n <= 365; n += 30) {
  const gamma = (2 * Math.PI / 365) * (n - 1 + 0.5);
  
  const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) -
               0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) -
               0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  
  const eotMin = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) -
                           0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  
  const H_deg = 15 * (baseHours - 12) - (eotMin / 4);
  const H = deg2rad(H_deg);
  
  const sin_h = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H);
  const h = Math.asin(Math.max(-1, Math.min(1, sin_h)));
  const altitudeDeg = rad2deg(h);
  
  // Current formula in code
  const sinH = Math.sin(H);
  const cosH = Math.cos(H);
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const tanDecl = Math.tan(decl);
  
  const y = sinH;
  const x = cosH * sinPhi - tanDecl * cosPhi;
  const A = normalizeDeg(rad2deg(Math.atan2(y, x)));
  
  console.log(`Day ${n}: decl=${rad2deg(decl).toFixed(2)}°, H=${H_deg.toFixed(3)}°, alt=${altitudeDeg.toFixed(2)}°, az=${A.toFixed(2)}°`);
}
