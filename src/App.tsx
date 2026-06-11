import { BackgroundLayer } from './components/BackgroundLayer';
import { GridPlane } from './components/GridPlane';
import { FrameHUD } from './components/FrameHUD';
import './App.css';

/**
 * App composes the three stacked layers of the scene:
 *   1. BackgroundLayer — viewport backdrop + dot matrix
 *   2. GridPlane       — the 5x5 window of poster cards
 *   3. FrameHUD        — the fixed instrumentation overlay
 */
export default function App() {
  return (
    <div className="app">
      <BackgroundLayer />
      <GridPlane />
      <FrameHUD />
    </div>
  );
}
