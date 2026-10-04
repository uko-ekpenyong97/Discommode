# One WebGL context for the sky and the covers? Not done (2026-10-04)

The question: can the sky draw in the context the cover stage already has,
and save one? Measured on the verify build (a production bundle with the
hooks), M1 Max, Chrome 154, @2×, before deciding.

## Contexts today

Counted by wrapping `getContext` from the first script, the grid loaded, then
`#item-02`, then `#read-01/3`:

| | grid | detail | reader |
| --- | --- | --- | --- |
| 1728×1117 and 2560×1440 | 3: the sky's (`.sky-layer__canvas`), the cover stage's (offscreen), the paper's (`.detail__paper`, made by the idle warm-up) | the same 3 | the same 3 |

(As `docs/perf/first-second.md` "WebGL contexts" has it; the reader makes
none, `verify:reader` `sky`.)

## What sharing would cost

The sky is raw WebGL2 with its own loop and ONE visible canvas that moves
between three hosts (the grid, the project view's ground, the reader's), under
DOM the other canvases sit above. The cover stage is three.js drawing into an
offscreen canvas whose frames are copied into 2D canvases, its size changing
with the largest instance it serves. In one context, the sky would draw into a
render target there and be presented on its own canvas every frame — a
`drawImage` copy (or `transferToImageBitmap` from an `OffscreenCanvas` sized
for the sky, which the stage resizes per draw, so a render target and a blit
first either way).

| @2× | the sky's drawing buffer | the sky's own frame (GPU, `__skyBenchmark`, p50) | one full-sky copy (`__covers.benchPresent`) |
| --- | --- | --- | --- |
| 1728×1117 | 3456×2234, 30.9 MB | 2.3 ms | 0.36 ms |
| 2560×1440 | 5120×2880, 59.0 MB | 4.3 ms | 0.62 ms |

- **GPU per frame: +15%** of the sky's own frame, every frame the sky draws,
  for the copy alone.
- **Memory: no saving.** The visible canvas still needs a backing store the
  sky's size (the copy's target), and the render target is another — one
  context fewer, one full-size buffer more.
- **What would break or need redoing**: the sky's read-backs (the chrome's
  contrast probe, `readMeans`) and `verify:sky`'s pixel captures assume a
  canvas of the sky's own; every raw-GL step would need three's
  `resetState()` around it; context loss would take both down together (today
  the stage keeps its last frames and the sky falls back to its CSS
  gradient, independently).
- **What it would save**: one context's creation (4 ms, already before the
  first render, `main.tsx`) and its driver overhead. No frame measured in
  `first-second.md`, `verify:jank` or `verify:gpu` is attributable to there
  being three contexts.

So it is not worth it, and not safe enough to try overnight; nothing was
changed. If the count matters later, the cheaper context to fold is the
paper's into the cover stage's (both three.js, both offscreen-able; see
first-second.md "One context for the cover stage and the paper").
