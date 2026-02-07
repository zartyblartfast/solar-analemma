// Test script to verify analemma calculations
import { computeAnalemmaPoints } from './src/solar.ts';

console.log('=== Testing Analemma Calculations ===\n');

// Test 1: Solar noon at equator (0°, 0°)
console.log('Test 1: Solar noon at Equator (0°, 0°)');
const equatorNoon = computeAnalemmaPoints({
  latitudeDeg: 0,
  longitudeDeg: 0,
  timeMode: { kind: 'solarNoon' },
  year: 2024
});

// At solar noon on the equator, the Sun should be at azimuth ~180° (south) when in northern winter
// and azimuth ~0° (north) when in northern summer
const jan1 = equatorNoon.find(p => p.dateISO === '2024-01-01');
const jul1 = equatorNoon.find(p => p.dateISO === '2024-07-01');
console.log('Jan 1:', jan1);
console.log('Jul 1:', jul1);
console.log('Expected: Jan 1 should have Sun to the south (Az ~180°), Jul 1 to the north (Az ~0° or 360°)\n');

// Test 2: Fixed time at mid-latitude (London: 51.5°N, 0.13°W)
console.log('Test 2: Fixed time 10:00 at London (51.5°N, 0.13°W)');
const london10am = computeAnalemmaPoints({
  latitudeDeg: 51.5,
  longitudeDeg: -0.13,
  timeMode: { kind: 'fixedSolarTime', hh: 10, mm: 0 },
  year: 2024
});

const visible = london10am.filter(p => p.visible);
console.log(`Visible points: ${visible.length} out of ${london10am.length}`);

// Check the range of values
const azMin = Math.min(...visible.map(p => p.azimuthDeg));
const azMax = Math.max(...visible.map(p => p.azimuthDeg));
const altMin = Math.min(...visible.map(p => p.altitudeDeg));
const altMax = Math.max(...visible.map(p => p.altitudeDeg));

console.log(`Azimuth range: ${azMin.toFixed(1)}° to ${azMax.toFixed(1)}°`);
console.log(`Altitude range: ${altMin.toFixed(1)}° to ${altMax.toFixed(1)}°`);
console.log('Expected: Azimuth should span ~100-150° (SE to S), Altitude ~15-40°\n');

// Test 3: Check the figure-8 shape characteristics
console.log('Test 3: Analyzing figure-8 shape');
// Sample key dates
const dates = ['2024-01-01', '2024-04-01', '2024-07-01', '2024-10-01'];
dates.forEach(date => {
  const point = london10am.find(p => p.dateISO === date);
  if (point && point.visible) {
    console.log(`${date}: Az=${point.azimuthDeg.toFixed(1)}°, Alt=${point.altitudeDeg.toFixed(1)}°`);
  }
});

// Test 4: Solar noon should produce a vertical line (constant azimuth, varying altitude)
console.log('\nTest 4: Solar noon at London (should be vertical line)');
const londonNoon = computeAnalemmaPoints({
  latitudeDeg: 51.5,
  longitudeDeg: -0.13,
  timeMode: { kind: 'solarNoon' },
  year: 2024
});

const visibleNoon = londonNoon.filter(p => p.visible);
const azMinNoon = Math.min(...visibleNoon.map(p => p.azimuthDeg));
const azMaxNoon = Math.max(...visibleNoon.map(p => p.azimuthDeg));
const altMinNoon = Math.min(...visibleNoon.map(p => p.altitudeDeg));
const altMaxNoon = Math.max(...visibleNoon.map(p => p.altitudeDeg));

console.log(`Azimuth range: ${azMinNoon.toFixed(1)}° to ${azMaxNoon.toFixed(1)}° (should be narrow, ~180°)`);
console.log(`Altitude range: ${altMinNoon.toFixed(1)}° to ${altMaxNoon.toFixed(1)}° (should span ~15-62°)`);
console.log('Expected: At solar noon, azimuth should be nearly constant at ~180° (due south)');
console.log('The small azimuth variation is the analemma width due to equation of time\n');

console.log('=== Tests Complete ===');
