/**
 * Moon phase — a mean-synodic model, and the whole of it.
 *
 * The sky draws the moon with a terminator, so it needs to know what shape the
 * moon is tonight. That is one number (how much of the disc is lit) and one
 * bit (which limb it is lit on), and both fall out of one quantity: how far
 * through the synodic month we are.
 *
 * WHAT THIS IS. The synodic month — new moon to new moon — averages
 * {@link SYNODIC_MONTH} days. Count days from a known new moon, take the
 * remainder, and that is the age. The illuminated fraction is then the
 * projected area of the lit hemisphere, which for a sphere lit from a
 * direction at phase angle θ is a cosine:
 *
 *     θ = 2π · age / SYNODIC_MONTH        (0 at new, π at full)
 *     fraction = (1 − cos θ) / 2
 *
 * WHAT THIS IS NOT. The Moon's orbit is an ellipse, so the *true* interval
 * between new moons swings either side of the mean by up to about half a day.
 * This model uses the mean, so every instant it reports can be **±0.6 days**
 * off the almanac, and the tests are written to that tolerance. It is the
 * right accuracy for the job: the sky is drawing a crescent, not timing an
 * occultation, and 0.6 days is about 2% of a lunation — a couple of percent of
 * illuminated fraction, which is a pixel or two of terminator.
 *
 * It is also deliberately NOT from Open-Meteo. The moon does not need a
 * network round trip: it is a function of the clock, it is the same moon over
 * the whole planet, and `useEnvState` already recomputes the sun from the
 * clock once a minute. The moon rides along with it.
 *
 * NO POSITION, NO LIBRATION, NO PARALLACTIC ANGLE. This returns the *shape* of
 * the moon and nothing else. Where the moon sits on screen is a constant in
 * the shader (see `docs/sky.md`), and the terminator is drawn in the
 * Northern-hemisphere orientation — waxing lit on the right.
 */

/** New moon to new moon, in days. The mean; see the note above. */
export const SYNODIC_MONTH = 29.530588853;

/** A known new moon: 2000-01-06 18:14 UTC. */
export const NEW_MOON_EPOCH = Date.UTC(2000, 0, 6, 18, 14, 0);

const DAY_MS = 86_400_000;

/** The eight phases, in the order the month walks them. */
export type PhaseName =
  | 'new'
  | 'waxing crescent'
  | 'first quarter'
  | 'waxing gibbous'
  | 'full'
  | 'waning gibbous'
  | 'last quarter'
  | 'waning crescent';

export interface MoonPhase {
  /** Days since the last new moon, 0 .. SYNODIC_MONTH. */
  age: number;
  /** Illuminated fraction of the disc: 0 at new, 1 at full. */
  fraction: number;
  /** True on the way from new to full — the lit limb is the right one. */
  waxing: boolean;
  /** Which of the eight named phases the age falls in. */
  phaseName: PhaseName;
}

/**
 * The eight names, each claiming the eighth of the month CENTRED on its own
 * instant — so "full" is the day and a half either side of full and not
 * everything past the gibbous. Index is `floor(age / month × 8 + 0.5) mod 8`.
 */
const PHASE_NAMES: PhaseName[] = [
  'new',
  'waxing crescent',
  'first quarter',
  'waxing gibbous',
  'full',
  'waning gibbous',
  'last quarter',
  'waning crescent',
];

/** Days since the last new moon, always in [0, SYNODIC_MONTH). */
export function moonAge(at: Date | number): number {
  const ms = typeof at === 'number' ? at : at.getTime();
  const age = ((ms - NEW_MOON_EPOCH) / DAY_MS) % SYNODIC_MONTH;
  // `%` keeps the sign of the dividend, and dates before the epoch are a
  // legitimate input (a test, a clock set wrong).
  return age < 0 ? age + SYNODIC_MONTH : age;
}

/** The moon's shape at a moment: how much of it is lit, and on which side. */
export function moonPhase(at: Date | number): MoonPhase {
  const age = moonAge(at);
  const theta = (2 * Math.PI * age) / SYNODIC_MONTH;
  return {
    age,
    fraction: (1 - Math.cos(theta)) / 2,
    waxing: age < SYNODIC_MONTH / 2,
    phaseName: PHASE_NAMES[Math.floor((age / SYNODIC_MONTH) * 8 + 0.5) % 8],
  };
}
