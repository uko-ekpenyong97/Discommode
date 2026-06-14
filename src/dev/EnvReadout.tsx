import { memo, useEffect } from 'react';
import { ATTRIBUTION, setEnvOverride, useEnvState } from '../env';
import './EnvReadout.css';

/**
 * Dev-only text readout of the live {@link EnvState}. There is no renderer yet
 * (Phase 11 is data-only), so this is how we verify the data layer: it shows the
 * current condition, sunElevation, isDay and status as plain text.
 *
 * Loaded behind an `import.meta.env.DEV` dynamic import (see App), so it and the
 * whole `env` data layer ride into the dev-only chunk — zero production bundle
 * impact until the renderer promotes `useEnvState` to App level in a later phase.
 *
 * Calling `useEnvState()` here makes this the current consumer of the hook (the
 * fetch + minute/15-min timers run from here for now).
 */
function EnvReadout() {
  const { env, status, overridden } = useEnvState();

  // Expose the override setter for manual testing (e.g. force fog at low sun),
  // mirroring the `__setConfig` dev test-hook in Dials.
  useEffect(() => {
    (window as unknown as { __setEnvOverride?: typeof setEnvOverride }).__setEnvOverride =
      setEnvOverride;
  }, []);

  return (
    <div className="env-readout" title={ATTRIBUTION}>
      <div className="env-readout__row">
        <span className="env-readout__key">status</span>
        <span className={`env-readout__val env-readout__val--${status}`}>
          {status}
          {overridden ? ' (override)' : ''}
        </span>
      </div>
      <div className="env-readout__row">
        <span className="env-readout__key">condition</span>
        <span className="env-readout__val">{env.condition}</span>
      </div>
      <div className="env-readout__row">
        <span className="env-readout__key">sunElev</span>
        <span className="env-readout__val">{env.sunElevation.toFixed(3)}</span>
      </div>
      <div className="env-readout__row">
        <span className="env-readout__key">isDay</span>
        <span className="env-readout__val">{String(env.isDay)}</span>
      </div>
      <div className="env-readout__row">
        <span className="env-readout__key">cloud / precip</span>
        <span className="env-readout__val">
          {env.cloudiness.toFixed(2)} / {env.precipitation.toFixed(2)}
        </span>
      </div>
      <div className="env-readout__row">
        <span className="env-readout__key">wind</span>
        <span className="env-readout__val">{env.windSpeed.toFixed(2)}</span>
      </div>
      <div className="env-readout__row">
        <span className="env-readout__key">wmo</span>
        <span className="env-readout__val">{env.rawWeatherCode}</span>
      </div>
    </div>
  );
}

export default memo(EnvReadout);
