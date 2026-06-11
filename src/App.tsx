import { BackgroundLayer } from './components/BackgroundLayer';
import { GridPlane } from './components/GridPlane';
import { FrameHUD } from './components/FrameHUD';
import { usePanController } from './hooks/usePanController';
import './App.css';

/**
 * App owns the motion controller (the single source of truth for grid position)
 * and composes the three stacked layers:
 *   1. BackgroundLayer — static viewport backdrop + dot matrix
 *   2. GridPlane       — the 5x5 poster grid, translated from `position`
 *   3. FrameHUD        — the fixed instrumentation overlay
 */
export default function App() {
  const pan = usePanController();

  return (
    <div className="app">
      <BackgroundLayer />
      <GridPlane
        position={pan.position}
        isDragging={pan.isDragging}
        onPointerDown={pan.onPointerDown}
        onPointerMove={pan.onPointerMove}
        onPointerUp={pan.onPointerUp}
      />
      <FrameHUD focusedIndex={pan.focused} />
    </div>
  );
}
