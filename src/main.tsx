import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import PortfolioGate from './portfolio/PortfolioGate.tsx';
import { prepareSky } from './sky/skyStage';
import { prepareCoverStage } from './covers/coverStage';
import { skyEngine } from './sky/skyStage';
import { startQuality } from './quality';

// The page's WebGL contexts before anything else asks the GPU process for
// work — the sky's, then the cover stage's — each in a task of its own, posted
// ahead of React's first render (React schedules it the same way, on a
// MessageChannel, and posted messages run in order). So the frames before the
// first paint are never one long task, and the render is scheduled where it
// always was (docs/perf/first-second.md).
const post = (fn: () => void) => {
  const ch = new MessageChannel();
  ch.port1.onmessage = () => {
    ch.port1.close();
    fn();
  };
  ch.port2.postMessage(null);
};
post(prepareSky);
post(prepareCoverStage);
// Adaptive quality (src/quality.ts): the governor, and the renderer it checks.
startQuality(() => skyEngine()?.renderer() ?? null);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PortfolioGate />
  </StrictMode>,
);
