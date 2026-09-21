import { memo, useCallback, useEffect, useState } from 'react';
import { ATTRIBUTION, setEnvOverride } from '../env';
import type { Condition, EnvSnapshot } from '../env';
import { envToTarget } from '../sky/envToTarget';
import { CONDITIONS, SUN_PRESETS, SUN_PRESET_NAMES, previewEnv } from './skyPreview';
import type { SunPreset } from './skyPreview';
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
  const [on, setOn] = useState(false);

  const apply = useCallback(
    (next: { on?: boolean; condition?: Condition; preset?: SunPreset }) => {
      const active = next.on ?? on;
      const c = next.condition ?? condition;
      const p = next.preset ?? preset;
      if (next.on !== undefined) setOn(next.on);
      if (next.condition) setCondition(next.condition);
      if (next.preset) setPreset(next.preset);
      const { sun, phase } = SUN_PRESETS[p];
      setEnvOverride(active ? previewEnv(sun, c, phase) : null);
    },
    [on, condition, preset],
  );

  // Test hooks: `__setEnvOverride` is the raw one (any EnvState at all), and
  // `__skyPreview` is the same two arguments the buttons pass — which is what
  // the contact-sheet script drives, so the 24 images are the states the
  // buttons show and not a second definition of them.
  useEffect(() => {
    const w = window as unknown as {
      __setEnvOverride?: typeof setEnvOverride;
      __skyPreview?: (c: Condition, p: SunPreset) => void;
      __skyStates?: () => { condition: Condition; time: SunPreset; target: unknown }[];
    };
    w.__setEnvOverride = setEnvOverride;
    w.__skyPreview = (c, p) => {
      const { sun, phase } = SUN_PRESETS[p];
      setEnvOverride(previewEnv(sun, c, phase));
    };
    // Every state the sky has, as the targets the engine would be given —
    // what `scripts/sky-contrast.mjs` hands the probe, one at a time, so the
    // contrast sweep walks the same twenty-four states the contact sheet does.
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
  useEffect(() => () => setEnvOverride(null), []);

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
    </div>
  );
}

export default memo(EnvReadout);
