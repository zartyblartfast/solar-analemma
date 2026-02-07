// Quick test of Bangkok solar noon calculations
const deg2rad = (d) => (d * Math.PI) / 180;
const rad2deg = (r) => (r * 180) / Math.PI;

const phi = deg2rad(13.75); // Bangkok latitude
const baseHours = 12; // Solar noon

// Test a few key dates
const testDays = [80, 172, 266, 355]; // Around equinoxes and solstices

testDays.forEach(n => {
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
  
  const sinH = Math.sin(H);
  const cosH = Math.cos(H);
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const tanDecl = Math.tan(decl);
  
  const y = sinH;
  const x = cosH * sinPhi - tanDecl * cosPhi;
  const A = ((rad2deg(Math.atan2(y, x)) % 360) + 360) % 360;
  
  console.log(`Day ${n}: decl=${rad2deg(decl).toFixed(2)}°, H=${H_deg.toFixed(2)}°, alt=${altitudeDeg.toFixed(2)}°, az=${A.toFixed(2)}°`);
});
