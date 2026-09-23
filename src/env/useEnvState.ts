/**
 * useEnvState — the live environment data hook (the Phase 11 deliverable).
 *
 * On mount it fetches the weather once, then:
 *   • recomputes `sunElevation` locally every minute from the clock (the sun
 *     moves continuously — no refetch needed for this), and
 *   • refetches the weather every ~15 min (weather changes slowly).
 *
 * It never throws and never blocks render: before the first fetch resolves (and
 * if it fails) it serves a clock-derived fallback, and `status` reports which.
 *
 * A module-level *override* lets dev tooling force any EnvState (e.g. fog at
 * sunElevation 0.2) — this is how DialKit will later preview any weather/time
 * without waiting for real conditions. The override transparently replaces the
 * returned `env`.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { EnvState, EnvStatus, GeoLocation } from './types';
import { DEFAULT_LOCATION } from './types';
import { computeEnvState, fallbackBase, fetchEnvBase } from './openMeteo';
import type { EnvBase } from './openMeteo';
import { brightLimbAngle } from './moon';
import { sunPosition } from './astro';

/** Recompute the sun curve once a minute; refetch weather every 15 minutes. */
const CLOCK_MS = 60_000;
const REFETCH_MS = 15 * 60_000;

// --- Manual override store ---------------------------------------------------

let override: EnvState | null = null;
const overrideListeners = new Set<() => void>();

/**
 * Force a specific {@link EnvState} (or pass `null` to clear). Exported so dev
 * tooling / DialKit can preview any weather + time of day. Drives every live
 * `useEnvState` consumer immediately.
 */
export function setEnvOverride(state: EnvState | null): void {
  override = state;
  overrideListeners.forEach((fn) => fn());
}

export function getEnvOverride(): EnvState | null {
  return override;
}

function subscribeOverride(fn: () => void): () => void {
  overrideListeners.add(fn);
  return () => {
    overrideListeners.delete(fn);
  };
}

// --- Moon override -------------------------------------------------------------

/**
 * Where a forced moon is put. FORCE UP is its own override, and it goes ON
 * TOP of whatever the env is — live, or a forced preview — so it pins the
 * moon's PLACE and leaves its phase to whoever owns that: tonight's moon when
 * the sky is live, the preset when the phase row has been pressed.
 */
export interface MoonForce {
  /** Apparent altitude, degrees. */
  altitude: number;
  /** Azimuth, degrees from north through east. */
  azimuth: number;
}

/**
 * FORCE UP: 45° up, at azimuth 249° — WSW, which the sky's arc puts at 0.70
 * of the width, where the fixed moon used to be nailed. High enough to be
 * unmistakably up, clear of the paper in the project view, and it is the
 * moon the contrast sweep measures as its second case.
 */
export const FORCE_UP: MoonForce = { altitude: 45, azimuth: 249.23 };

let moonForce: MoonForce | null = null;
const moonForceListeners = new Set<() => void>();

/** Pin the moon at a place in the sky (or `null` to let it go back to where it
 *  is). Dev tooling; drives every live `useEnvState` consumer. */
export function setMoonForce(force: MoonForce | null): void {
  moonForce = force;
  moonForceListeners.forEach((fn) => fn());
}

export function getMoonForce(): MoonForce | null {
  return moonForce;
}

function subscribeMoonForce(fn: () => void): () => void {
  moonForceListeners.add(fn);
  return () => {
    moonForceListeners.delete(fn);
  };
}

/**
 * An env with its moon moved to `force`. The phase is untouched. The bright
 * limb is re-aimed from the forced place at the REAL sun of `nowMs` — and
 * if that disagrees with the env's waxing flag (a forced preview phase can
 * say waning on a waxing night), it is mirrored left-for-right, so the lit
 * side is still the side the phase says.
 */
export function withForcedMoon(
  env: EnvState,
  force: MoonForce,
  nowMs: number,
  loc: GeoLocation = DEFAULT_LOCATION,
): EnvState {
  const sun = sunPosition(nowMs, loc.latitude, loc.longitude);
  let limb = brightLimbAngle({ alt: force.altitude, az: force.azimuth }, sun);
  if (Math.cos(limb) > 0 !== env.moonWaxing) limb = Math.PI - limb;
  return { ...env, moonAltitude: force.altitude, moonAzimuth: force.azimuth, moonLimbAngle: limb };
}

// --- Hook --------------------------------------------------------------------

export interface EnvSnapshot {
  /** Always defined — the normalized sky state (override, live, or fallback). */
  env: EnvState;
  status: EnvStatus;
  /** True while a manual override is replacing the live/fallback data. */
  overridden: boolean;
}

/**
 * Subscribe to San Francisco's (or `location`'s) live sky state. Pass a *stable*
 * location reference — an inline object would re-trigger the fetch every render.
 */
export function useEnvState(location: GeoLocation = DEFAULT_LOCATION): EnvSnapshot {
  const [base, setBase] = useState<EnvBase>(() => fallbackBase(Date.now()));
  const [status, setStatus] = useState<EnvStatus>('loading');
  // Advanced every minute (in the interval below) to recompute the sun curve
  // without refetching. Kept in state — not read via Date.now() in render — so
  // the memo stays pure and only recomputes when the clock actually ticks.
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const override = useSyncExternalStore(subscribeOverride, getEnvOverride, getEnvOverride);
  const force = useSyncExternalStore(subscribeMoonForce, getMoonForce, getMoonForce);

  // Fetch on mount + refetch every REFETCH_MS. Never throws; on failure it
  // keeps the last good data (or the initial fallback for the first attempt).
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const load = async (firstAttempt: boolean) => {
      try {
        const next = await fetchEnvBase(location, Date.now(), controller.signal);
        if (cancelled) return;
        setBase(next);
        setStatus('live');
      } catch {
        if (cancelled || controller.signal.aborted) return;
        // First attempt failing → switch to the clock-only fallback. A later
        // refetch failing leaves the last good data in place.
        if (firstAttempt) {
          setBase(fallbackBase(Date.now()));
          setStatus('fallback');
        }
      }
    };

    load(true);
    const id = setInterval(() => load(false), REFETCH_MS);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(id);
    };
  }, [location]);

  // Minute clock: recompute sunElevation from the live time, no refetch.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), CLOCK_MS);
    return () => clearInterval(id);
  }, []);

  // Recompute only when the base or the minute clock changes — not on every
  // parent re-render.
  const live = useMemo(() => computeEnvState(base, nowMs, location), [base, nowMs, location]);

  // Stable snapshot identity: only changes when the data actually changes, so a
  // parent that re-renders every frame (the grid) doesn't churn consumers.
  return useMemo<EnvSnapshot>(() => {
    const env = override ?? live;
    return {
      env: force ? withForcedMoon(env, force, nowMs, location) : env,
      status,
      overridden: override != null || force != null,
    };
  }, [override, force, live, status, nowMs, location]);
}
