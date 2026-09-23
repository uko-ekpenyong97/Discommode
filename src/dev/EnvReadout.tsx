import { memo, useCallback, useEffect, useState } from 'react';
import { ATTRIBUTION, FORCE_UP, setEnvOverride, setMoonForce } from '../env';
import type { Condition, EnvSnapshot } from '../env';
import { envToTarget } from '../sky/envToTarget';
import {
  CONDITIONS,
  MOON_PRESETS,
  MOON_PRESET_NAMES,
  PREVIEW_MOON,
  SUN_PRESETS,
  SUN_PRESET_NAMES,
  daySweepStates,
  envAt,
  previewEnv,
} from './skyPreview';
import type { MoonPreset, SunPreset } from './skyPreview';
import './EnvReadout.css';

/**
 * Dev-only text readout of the live {@link EnvState} — and the OVERRIDE that
 * puts the sky into any of its states on demand.
 *
 * The readout was always here; the override used to be three dials on the SKY
 * panel, which is the wrong place for it. The sky dials are a tuning session —
 * how fast the deck blows, how high the bank sits — and the override is not
 * tuning, it is *stepping through the states*: six conditions × four times of
 * day is the eye test, and it wants two rows of buttons next to the numbers
 * they change, not a slider you have to count clicks on.
 *
 * Everything here is behind `App`'s `import.meta.env.DEV` dynamic import, so
 * this module and the preview table never reach production — the same
 * arrangement as DialKit.
 */
function EnvReadout({ snapshot }: { snapshot: EnvSnapshot }) {
  const { env, status, overridden } = snapshot;
  const [condition, setCondition] = useState<Condition>('clear');
  const [preset, setPreset] = useState<SunPreset>('noon');
  // The moon is its own row because it is its own axis: any of five shapes can
  // be over any of the twenty-four states, and San Francisco will cooperate
  // with exactly one of them on any given night.
  const [moon, setMoon] = useState<MoonPreset>('full');
  const [waxing, setWaxing] = useState(PREVIEW_MOON.waxing);
  const [on, setOn] = useState(false);
  // FORCE UP is its own override, on top of whichever env is showing — live
  // or forced — so it pins the moon's place and not its phase. The slider is
  // the altitude it is pinned at; moving it turns the force on.
  const [forced, setForced] = useState(false);
  const [forceAlt, setForceAlt] = useState(FORCE_UP.altitude);
  const force = useCallback((next: boolean, altitude = forceAlt) => {
    setForced(next);
    setForceAlt(altitude);
    setMoonForce(next ? { ...FORCE_UP, altitude } : null);
  }, [forceAlt]);

  const apply = useCallback(
    (next: {
      on?: boolean;
      condition?: Condition;
      preset?: SunPreset;
      moon?: MoonPreset;
      waxing?: boolean;
    }) => {
      const active = next.on ?? on;
      const c = next.condition ?? condition;
      const p = next.preset ?? preset;
      const m = next.moon ?? moon;
      const w = next.waxing ?? waxing;
      if (next.on !== undefined) setOn(next.on);
      if (next.condition) setCondition(next.condition);
      if (next.preset) setPreset(next.preset);
      if (next.moon) setMoon(next.moon);
      if (next.waxing !== undefined) setWaxing(next.waxing);
      const { sun, phase } = SUN_PRESETS[p];
      const mo = { fraction: MOON_PRESETS[m], waxing: w };
      setEnvOverride(active ? previewEnv(sun, c, phase, undefined, mo) : null);
    },
    [on, condition, preset, moon, waxing],
  );

  // Test hooks: `__setEnvOverride` is the raw one (any EnvState at all), and
  // `__skyPreview` is the same two arguments the buttons pass — which is what
  // the contact-sheet script drives, so the 24 images are the states the
  // buttons show and not a second definition of them.
  useEffect(() => {
    const w = window as unknown as {
      __setEnvOverride?: typeof setEnvOverride;
      __skyPreview?: (c: Condition, p: SunPreset, m?: MoonPreset, waxing?: boolean) => void;
      __skyStates?: () => { condition: Condition; time: SunPreset; target: unknown }[];
      __skyDayStates?: (date: string) => ReturnType<typeof daySweepStates>;
      __setMoonForce?: typeof setMoonForce;
      __skyAt?: (ms: number, c: Condition) => void;
    };
    w.__setMoonForce = setMoonForce;
    w.__setEnvOverride = setEnvOverride;
    // The moon defaults to PREVIEW_MOON (full), so every caller that does not
    // ask for one — the contact sheet, the contrast sweep — gets the same moon
    // every time it runs. Pass a preset to step the shapes.
    w.__skyPreview = (c, p, m, waxing) => {
      const { sun, phase } = SUN_PRESETS[p];
      const mo = m ? { fraction: MOON_PRESETS[m], waxing: waxing ?? true } : PREVIEW_MOON;
      setEnvOverride(previewEnv(sun, c, phase, undefined, mo));
    };
    // Every state the sky has, as the targets the engine would be given —
    // what `scripts/sky-contrast.mjs` hands the probe, one at a time, so the
    // contrast sweep walks the same twenty-four states the contact sheet does.
    // The contrast sweep's states: every five minutes of one day, for every
    // condition, with the moon where it really was and at FORCE UP. See
    // `daySweepStates` and `scripts/sky-contrast.mjs`.
    w.__skyDayStates = (date) => daySweepStates(date);
    // …and one real instant under one preview weather, forced: tonight's moon
    // on a clear night whatever San Francisco is actually doing.
    w.__skyAt = (ms, c) => setEnvOverride(envAt(ms, c));
    w.__skyStates = () =>
      CONDITIONS.flatMap((c) =>
        SUN_PRESET_NAMES.map((p) => {
          const { sun, phase } = SUN_PRESETS[p];
          return { condition: c, time: p, target: envToTarget(previewEnv(sun, c, phase)) };
        }),
      );
  }, []);

  // Drop the override when the readout unmounts, so a hot reload cannot leave
  // the app stuck in a forced sky with nothing on screen saying so.
  useEffect(
    () => () => {
      setEnvOverride(null);
      setMoonForce(null);
    },
    [],
  );

  const row = (key: string, value: string, cls = '') => (
    <div className="env-readout__row">
      <span className="env-readout__key">{key}</span>
      <span className={`env-readout__val ${cls}`}>{value}</span>
    </div>
  );

  return (
    <div className="env-readout" title={ATTRIBUTION}>
      <div className="env-readout__row">
        <span className="env-readout__key">status</span>
        <span className={`env-readout__val env-readout__val--${status}`}>
          {status}
          {overridden ? ' (override)' : ''}
        </span>
      </div>
      {row('condition', env.condition)}
      {row('sunElev', env.sunElevation.toFixed(3))}
      {row('isDay', String(env.isDay))}
      {row('dayPhase', env.dayPhase)}
      {row('cloud / precip', `${env.cloudiness.toFixed(2)} / ${env.precipitation.toFixed(2)}`)}
      {row('wind', env.windSpeed.toFixed(2))}
      {row(
        'moon',
        `${env.moonFraction.toFixed(2)} ${env.moonWaxing ? 'waxing' : 'waning'}`,
      )}
      {row(
        'moon alt / az',
        `${env.moonAltitude.toFixed(1)}° / ${env.moonAzimuth.toFixed(0)}°${env.moonAltitude < 0 ? ' (down)' : ''}`,
      )}
      {row('wmo', String(env.rawWeatherCode))}

      <div className="env-readout__sep">override</div>
      <div className="env-readout__grid">
        {CONDITIONS.map((c) => (
          <button
            key={c}
            type="button"
            className="env-readout__btn"
            data-on={(on && condition === c) || undefined}
            onClick={() => apply({ on: true, condition: c })}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="env-readout__grid">
        {SUN_PRESET_NAMES.map((p) => (
          <button
            key={p}
            type="button"
            className="env-readout__btn"
            data-on={(on && preset === p) || undefined}
            onClick={() => apply({ on: true, preset: p })}
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          className="env-readout__btn env-readout__btn--wide"
          data-on={!on || undefined}
          onClick={() => apply({ on: false })}
        >
          live
        </button>
      </div>
      <div className="env-readout__grid">
        {MOON_PRESET_NAMES.map((m) => (
          <button
            key={m}
            type="button"
            className="env-readout__btn"
            data-on={(on && moon === m) || undefined}
            onClick={() => apply({ on: true, moon: m })}
          >
            {m}
          </button>
        ))}
        <button
          type="button"
          className="env-readout__btn"
          data-on={(on && !waxing) || undefined}
          onClick={() => apply({ on: true, waxing: !waxing })}
          title="which limb the light is on"
        >
          {waxing ? 'wax' : 'wane'}
        </button>
      </div>
      <div className="env-readout__grid">
        <button
          type="button"
          className="env-readout__btn env-readout__btn--wide"
          data-on={forced || undefined}
          onClick={() => force(!forced)}
          title="pin the moon up, in whatever phase it is showing"
        >
          force up
        </button>
        <input
          type="range"
          className="env-readout__range"
          min={-10}
          max={90}
          step={1}
          value={forceAlt}
          onChange={(e) => force(true, Number(e.target.value))}
          aria-label="forced moon altitude"
          title={`moon altitude ${forceAlt}°`}
        />
      </div>
    </div>
  );
}

export default memo(EnvReadout);
