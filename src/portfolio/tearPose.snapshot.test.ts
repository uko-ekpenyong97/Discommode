import { describe, expect, it } from 'vitest';
import { tearPose } from './pageTrack';
import { poseDials } from './portfolioMotion';

/**
 * THE TEAR DID NOT MOVE.
 *
 * The entrance went back to the cone wrap it was first shipped with, which
 * meant a second deformation in the shader and a mode on the pose. The tear is
 * on the other side of that switch and must be untouched by all of it — so this
 * is the whole exit pose table as it was BEFORE that change, sampled every
 * fortieth of the peel and pasted in as literals.
 *
 * It is a snapshot rather than a set of properties on purpose. The properties
 * are already tested next door — the joints are continuous, the origin travels,
 * the corner lifts — and a property test would have passed happily through the
 * exact substitution this file exists to catch: the same numbers read by a
 * different formula. What cannot pass is a table of forty-one poses that has to
 * come out the same to the last digit.
 *
 * `curlMode` and `curlOriginEdge` are new fields and are checked separately,
 * below: the tear is mode 1, and mode 1 does not read an edge.
 *
 * If this file ever needs regenerating, it is not a formatting change. Every
 * number in it is a frame of the peel that someone signed off.
 */
const EXIT_BEFORE: [number, ...(number | string | boolean)[]][] = [
  [0, 0, "tail", 0, -0.5, 0.5, 1, 0, 0.08, 125, 0.35, 2.4, 0, 1, false],
  [0.025, 0.025, "tail", 0, -0.5, 0.5, 1, 0.03333333333333334, 0.08, 125, 0.35, 2.4, 0, 1, false],
  [0.05, 0.05, "tail", 0, -0.5, 0.5, 1, 0.11666666666666668, 0.08, 125, 0.35, 2.4, 0, 1, false],
  [0.075, 0.075, "tail", 0, -0.5, 0.5, 1, 0.225, 0.08, 125, 0.35, 2.4, 0, 1, false],
  [0.1, 0.1, "tail", 0, -0.5, 0.5, 1, 0.33333333333333337, 0.08, 125, 0.35, 2.4, 0, 1, false],
  [0.125, 0.125, "tail", 0, -0.5, 0.5, 1, 0.41666666666666674, 0.08, 125, 0.35, 2.4, 0, 1, false],
  [0.15, 0.15, "tail", 0, -0.5, 0.5, 1, 0.45, 0.08, 125, 0.35, 2.4, 0, 1, false],
  [0.175, 0.175, "tail", -0.10699588477366251, -0.5, 0.5, 1, 0.4542, 0.08401234567901235, 125, 0.35, 2.4, 0.001069958847736625, 1, false],
  [0.2, 0.2, "tail", -0.4115226337448563, -0.5, 0.5, 1, 0.4656, 0.09543209876543211, 125, 0.35, 2.4, 0.004115226337448563, 1, false],
  [0.225, 0.225, "tail", -0.8888888888888893, -0.5, 0.5, 1, 0.4824, 0.11333333333333336, 125, 0.35, 2.4, 0.008888888888888892, 1, false],
  [0.25, 0.25, "tail", -1.5144032921810706, -0.5, 0.5, 1, 0.5028, 0.13679012345679015, 125, 0.35, 2.4, 0.015144032921810704, 1, false],
  [0.275, 0.275, "tail", -2.263374485596709, -0.5, 0.5, 1, 0.525, 0.16487654320987657, 125, 0.35, 2.4, 0.022633744855967086, 1, false],
  [0.3, 0.3, "tail", -3.1111111111111116, -0.5, 0.5, 1, 0.5472, 0.19666666666666668, 125, 0.35, 2.4, 0.031111111111111114, 1, false],
  [0.325, 0.325, "tail", -4.032921810699591, -0.5, 0.5, 1, 0.5676, 0.23123456790123464, 125, 0.35, 2.4, 0.040329218106995905, 1, false],
  [0.35, 0.35, "tail", -5.004115226337449, -0.5, 0.5, 1, 0.5844, 0.26765432098765435, 125, 0.35, 2.4, 0.050041152263374494, 1, false],
  [0.375, 0.375, "tail", -6.000000000000002, -0.5, 0.5, 1, 0.5958, 0.30500000000000005, 125, 0.35, 2.4, 0.06000000000000001, 1, false],
  [0.4, 0.4, "tail", -6.995884773662552, -0.5, 0.5, 1, 0.6, 0.34234567901234575, 125, 0.35, 2.4, 0.06995884773662552, 1, false],
  [0.425, 0.425, "tail", -7.967078189300414, -0.5, 0.5, 1, 0.6, 0.37876543209876556, 125, 0.35, 2.4, 0.07967078189300414, 1, false],
  [0.45, 0.45, "tail", -8.888888888888893, -0.5, 0.5, 1, 0.6, 0.4133333333333335, 125, 0.35, 2.4, 0.08888888888888892, 1, false],
  [0.475, 0.475, "tail", -9.736625514403292, -0.5, 0.5, 1, 0.6, 0.44512345679012344, 125, 0.35, 2.4, 0.09736625514403291, 1, false],
  [0.5, 0.5, "tail", -10.48559670781893, -0.5, 0.5, 1, 0.6, 0.4732098765432099, 125, 0.35, 2.4, 0.1048559670781893, 1, false],
  [0.525, 0.525, "tail", -11.111111111111112, -0.5, 0.5, 1, 0.6, 0.49666666666666676, 125, 0.35, 2.4, 0.11111111111111112, 1, false],
  [0.55, 0.55, "tail", -11.588477366255145, -0.5, 0.5, 1, 0.6, 0.514567901234568, 125, 0.35, 2.4, 0.11588477366255144, 1, false],
  [0.575, 0.575, "tail", -11.893004115226338, -0.5, 0.5, 1, 0.6, 0.5259876543209877, 125, 0.35, 2.4, 0.11893004115226338, 1, false],
  [0.6, 0.6, "tail", -12, -0.5, 0.5, 1, 0.6, 0.53, 125, 0.35, 2.4, 0.12, 1, false],
  [0.625, 0.625, "tail", -12.2578125, -0.5, 0.5, 0.9935546875, 0.5828125, 0.53, 125, 0.35, 2.4, 0.15351562500000004, 1, false],
  [0.65, 0.65, "tail", -12.9375, -0.5, 0.5, 0.9765625, 0.5374999999999999, 0.53, 125, 0.35, 2.4, 0.24187500000000012, 1, false],
  [0.675, 0.675, "tail", -13.898437500000002, -0.5, 0.5, 0.9525390625, 0.47343749999999984, 0.53, 125, 0.35, 2.4, 0.36679687500000024, 1, false],
  [0.7, 0.7, "tail", -14.999999999999996, -0.5, 0.5, 0.925, 0.40000000000000013, 0.53, 125, 0.35, 2.4, 0.5099999999999997, 1, false],
  [0.725, 0.725, "tail", -16.1015625, -0.5, 0.5, 0.8974609375, 0.32656250000000014, 0.53, 125, 0.35, 2.4, 0.6532031249999998, 1, false],
  [0.75, 0.75, "tail", -17.0625, -0.5, 0.5, 0.8734375, 0.2625, 0.53, 125, 0.35, 2.4, 0.7781250000000001, 1, false],
  [0.775, 0.775, "tail", -17.7421875, -0.5, 0.5, 0.8564453125, 0.21718750000000003, 0.53, 125, 0.35, 2.4, 0.866484375, 1, false],
  [0.8, 0.8, "tail", -18, -0.5, 0.5, 0.85, 0.2, 0.53, 125, 0.35, 2.4, 0.9, 1, false],
  [0.825, 0.825, "tail", -18, -0.5, 0.5, 0.85, 0.2, 0.53, 125, 0.35, 2.4, 0.9, 1, false],
  [0.85, 0.85, "tail", -18, -0.5, 0.5, 0.85, 0.2, 0.53, 125, 0.35, 2.4, 0.9, 1, false],
  [0.875, 0.875, "tail", -18, -0.5, 0.5, 0.85, 0.2, 0.53, 125, 0.35, 2.4, 0.9, 1, false],
  [0.9, 0.9, "tail", -18, -0.5, 0.5, 0.85, 0.2, 0.53, 125, 0.35, 2.4, 0.9, 1, false],
  [0.925, 0.925, "tail", -18, -0.5, 0.5, 0.85, 0.2, 0.53, 125, 0.35, 2.4, 0.9, 0.8437499999999997, false],
  [0.95, 0.95, "tail", -18, -0.5, 0.5, 0.85, 0.2, 0.53, 125, 0.35, 2.4, 0.9, 0.5000000000000009, false],
  [0.975, 0.975, "tail", -18, -0.5, 0.5, 0.85, 0.2, 0.53, 125, 0.35, 2.4, 0.9, 0.15625000000000033, false],
  [1, 1, "tail", -18, -0.5, 0.5, 0.85, 0.2, 0.53, 125, 0.35, 2.4, 0.9, 0, false],
];

/** The order the columns are in, which is the order they were dumped in. */
const KEYS = ["p", "kind", "rotationZ", "pivotX", "pivotY", "scale", "curl", "curlOrigin", "curlAxis", "tightness", "curlWrap", "y", "opacity", "pointer"] as const;

describe('tearPose — unchanged by the entrance going back to a roll', () => {
  it('matches the exit pose table exactly, at every fortieth of the peel', () => {
    const d = poseDials();
    for (const [p, ...expected] of EXIT_BEFORE) {
      const pose = tearPose(p, d) as unknown as Record<string, unknown>;
      const got = KEYS.map((k) => pose[k]);
      // One assertion per row, so a failure names the point of the peel.
      expect({ p, pose: got }).toEqual({ p, pose: expected });
    }
  });

  it('covers the three points the screenshots are compared at', () => {
    for (const p of [0.15, 0.5, 0.7]) {
      expect(EXIT_BEFORE.some((row) => row[0] === p)).toBe(true);
    }
  });

  it('is the FOLD, and the fold does not read a roll edge', () => {
    const d = poseDials();
    for (const p of [0, 0.15, 0.5, 0.7, 1]) {
      expect(tearPose(p, d).curlMode).toBe(1);
      expect(tearPose(p, d).curlOriginEdge).toBe(0);
    }
  });
});
