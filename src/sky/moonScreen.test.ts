import { describe, expect, it } from 'vitest';
import { moonScreen, moonVisibility } from './skyEngine';
import { elevationFromHeight } from '../env/sun';
import { FORCE_UP, withForcedMoon } from '../env/useEnvState';
import { PREVIEW_MOON, previewEnv } from '../dev/skyPreview';

/**
 * Where the moon goes on screen. It is the SUN's arc — x0 → x1 from rising to
 * setting, y by the 0..1 elevation scale — fed the moon's azimuth and
 * altitude, so the tests are that the two share it.
 */
const sunY = (elevation: number) => -0.06 + 0.92 * elevation;

describe('moonScreen', () => {
  it('puts a moon on the horizon on the row the sun has on the horizon', () => {
    expect(moonScreen(0, 180).y).toBeCloseTo(sunY(elevationFromHeight(0)), 10);
  });

  it('puts a moon in the east where the rising sun is, and in the west where the setting one is', () => {
    expect(moonScreen(10, 90).x).toBeCloseTo(0.24, 10);
    expect(moonScreen(10, 270).x).toBeCloseTo(0.76, 10);
    expect(moonScreen(10, 180).x).toBeCloseTo(0.5, 10);
  });

  it('climbs with altitude, to the top of the sun’s arc at the zenith', () => {
    expect(moonScreen(90, 180).y).toBeCloseTo(0.86, 10);
    expect(moonScreen(45, 180).y).toBeGreaterThan(moonScreen(20, 180).y);
  });

  it('the preview moon is where the fixed moon used to be nailed, (0.70, 0.80)', () => {
    const p = moonScreen(PREVIEW_MOON.altitude!, PREVIEW_MOON.azimuth!);
    expect(p.x).toBeCloseTo(0.7, 3);
    expect(p.y).toBeCloseTo(0.8, 3);
  });
});

describe('moonVisibility', () => {
  it('is nothing under the horizon, all of it from 3° up, and smooth between', () => {
    expect(moonVisibility(-5)).toBe(0);
    expect(moonVisibility(0)).toBe(0);
    expect(moonVisibility(1.5)).toBeCloseTo(0.5, 10);
    expect(moonVisibility(3)).toBe(1);
    expect(moonVisibility(60)).toBe(1);
  });
});

describe('FORCE UP', () => {
  const noon = Date.parse('2026-09-23T19:00:00Z');

  it('moves the moon and leaves the phase alone', () => {
    const env = previewEnv(0, 'clear', 'rising', 0.35, { fraction: 0.25, waxing: true });
    const forced = withForcedMoon(env, FORCE_UP, noon);
    expect(forced.moonAltitude).toBe(45);
    expect(forced.moonAzimuth).toBe(FORCE_UP.azimuth);
    expect(forced.moonFraction).toBe(0.25);
    expect(forced.moonWaxing).toBe(true);
  });

  it('keeps the lit side on the side the phase says, whatever the real sun says', () => {
    for (const waxing of [true, false]) {
      const env = previewEnv(0, 'clear', 'rising', 0.35, { fraction: 0.3, waxing });
      const forced = withForcedMoon(env, FORCE_UP, noon);
      expect(Math.cos(forced.moonLimbAngle) > 0).toBe(waxing);
    }
  });
});
