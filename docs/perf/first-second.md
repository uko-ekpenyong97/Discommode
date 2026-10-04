# The first second

What the page does in the frames right after a load, and in the first
arrival in the detail view, and why the long ones were long. Measured
2026-10-02 on an Apple M1 Max (ANGLE / Metal), headless Chrome 154, against
production builds (`vite preview`), `main` (c7ce9c5) against this branch.
The machine was shared with other jobs all night: each run prints its
1-minute load average, and the main thread's CPU time is printed beside its
wall time so a frame the OS took away can be told from one the page spent.

```
npm run build && npx vite preview --port 5302 --strictPort
node scripts/first-second.mjs --url http://localhost:5302 --size 1728x1117 --runs 5
node scripts/first-second.mjs --url http://localhost:5302 --size 2560x1440 --runs 5
node scripts/first-second.mjs --url http://localhost:5302 --runs 3 --trace .context/trace   # attributed
```

Each run is a fresh browser (cold HTTP cache, cold GPU program cache), the
pointer moving from the first frame: every rAF interval from the navigation
to 3 s, then at 3.5 s a click on the centre card and every frame to the
settled hero (the first, cold, detail arrival). `--trace` records a CDP trace
of every process and attributes each frame that dropped one or more:

- **main thread** from the trace — React (its scheduler's MessagePort tasks),
  style and layout, image decodes ON the main thread, fonts, other script;
- **WebGL** from wrappers around the context's calls — the main thread's time
  inside context set-up (`getContext`, three's extension and parameter
  queries), shader compile and link and their status reads, uploads, sync
  reads (`readPixels`, `getBufferSubData`, `checkFramebufferStatus`);
- **off the main thread** — image decodes on the raster workers, and how busy
  the GPU process's main thread was.

The bars count vsyncs, as `verify:detail` does: "over 50 ms" is four vsyncs
or more (a 50.0 ms frame is three), "over 33 ms" three or more.

## On `main`: what the long frames were

Three traced runs at each size. ms of overlap with the frame; `·` is under
half a ms. The GL columns are inside the main-thread time, not beside it.

| run | frame | ms | main thread | React | style+layout | decode (main) | decode (workers) | context | shader | upload | sync reads | fonts | GPU process | what |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1728 #1 | load @68 | 67 | 66 | 59 | 28 | · | · | 7 | · | · | · | 1 | 7 | before FCP; the stage's context made during React's render |
| 1728 #1 | load @135 | 67 | 66 | 43 | · | · | · | 26 | 16 | · | · | · | 48 | spans FCP; the sky's `getContext` 25, its shader status 8 |
| 1728 #1 | load @202 | 50 | 44 | 7 | 1 | · | 28 | 3 | 10 | · | 1 | · | 34 | the stage's first draws: three's first-use link reads 9 |
| 1728 #1 | load @552 | 100 | 100 | · | 1 | 91 | · | · | 2 | 2 | · | · | 10 | **5 paper faces' ImageBitmaps resolved (1298×1687)** |
| 1728 #2 | load @73 | 50 | 50 | 50 | 28 | · | · | 5 | · | · | · | 1 | 5 | before FCP; React's first commit |
| 1728 #2 | load @123 | 100 | 93 | 67 | 2 | · | 28 | 28 | 32 | · | 1 | · | 72 | spans FCP; `getExtension` 22, link status 16, compile status 7 |
| 1728 #2 | load @523 | 100 | 100 | · | 1 | 91 | · | · | 2 | 3 | · | · | 12 | **5 ImageBitmaps resolved (1298×1687)** |
| 1728 #2 | load @673 | 33 | 33 | · | · | · | · | · | · | · | · | · | 2 | an idle callback (the warm-up) |
| 1728 #3 | load @63 | 83 | 83 | 57 | 28 | · | · | 7 | · | · | · | 1 | 9 | before FCP; React's first commit |
| 1728 #3 | load @147 | 67 | 66 | 57 | · | · | 3 | 34 | 18 | · | 1 | · | 58 | spans FCP; the sky's `getContext` 33 |
| 1728 #3 | load @213 | 50 | 43 | 4 | 1 | · | 26 | 4 | 9 | · | · | · | 30 | the stage's first draws; grid images decoding |
| 1728 #3 | load @547 | 117 | 116 | · | · | 97 | 6 | · | 3 | 11 | · | · | 19 | **5 ImageBitmaps resolved (1298×1687)** |
| 2560 #1 | load @78 | 50 | 50 | 48 | 17 | · | · | 6 | · | · | · | · | 6 | before FCP; React's first commit |
| 2560 #1 | load @128 | 83 | 82 | 59 | 5 | · | 1 | 32 | 16 | · | 1 | · | 65 | spans FCP; the sky's `getContext` 32 |
| 2560 #1 | load @211 | 33 | 28 | · | 1 | · | 27 | 4 | 8 | · | · | · | 17 | the stage's first draws |
| 2560 #1 | load @711 | 67 | 67 | · | · | 64 | 62 | · | · | · | · | · | 3 | **1 ImageBitmap resolved (1794×2333)** |
| 2560 #1 | load @778 | 167 | 166 | · | 1 | 151 | · | · | · | 11 | · | · | 16 | **3 ImageBitmaps resolved (1794×2333)** |
| 2560 #2 | load @81 | 50 | 50 | 48 | 19 | · | · | 6 | · | · | · | · | 6 | before FCP; React's first commit |
| 2560 #2 | load @131 | 67 | 65 | 52 | 2 | · | · | 25 | 18 | · | 2 | · | 53 | spans FCP; the sky's `getContext` 24 |
| 2560 #2 | load @198 | 50 | 43 | 4 | 5 | · | 31 | 3 | 10 | · | · | · | 36 | the stage's first draws |
| 2560 #2 | load @681 | 67 | 66 | · | · | 64 | 68 | · | · | · | · | · | 3 | **1 ImageBitmap resolved** |
| 2560 #2 | load @748 | 167 | 166 | · | 1 | 150 | · | · | · | 11 | · | · | 16 | **3 ImageBitmaps resolved** |
| 2560 #3 | load @79 | 83 | 83 | 70 | 43 | · | · | 6 | · | · | · | · | 9 | before FCP; React's first commit |
| 2560 #3 | load @163 | 100 | 99 | 64 | · | · | 28 | 40 | 24 | · | 1 | · | 77 | spans FCP; `getExtension` 25, the sky's `getContext` 15 |
| 2560 #3 | load @463 | 33 | 33 | · | · | · | · | · | · | · | · | · | 3 | an idle callback (the warm-up) |
| 2560 #3 | load @696 | 67 | 66 | · | · | 65 | 60 | · | · | · | · | · | 3 | **1 ImageBitmap resolved** |
| 2560 #3 | load @763 | 167 | 166 | · | 1 | 151 | · | · | · | 11 | · | · | 19 | **3 ImageBitmaps resolved** |

The first detail arrival had no frame over 16.8 ms in any of these six runs.

**What they are:**

1. **The 100–167 ms frames at ~0.55–0.8 s are the detail paper's faces.** The
   warm-up resizes each face with `createImageBitmap(blob, crop, { resize…,
   resizeQuality: 'high' })`. From a blob the DECODE is off the main thread,
   but the crop, the resize and the premultiply run in the task that resolves
   the bitmap — on the thread that asked (`ImageBitmapFactories`,
   `ResolvePromiseOnOriginalThread`; in the trace a main-thread task posted
   from `DecodeImageOnDecoderThread`, no script in it). 18 ms a face at
   1298×1687, ~50 ms at 1794×2333, and the decodes finish together, so four
   or five resolve in one frame. This is the "~0.6 s and ~0.75 s" pair. It was
   there before the idle warm-up too: the faces were made on the first hover
   then.
2. **The boot (before and across the first paint):** React's first commit,
   with the page's first style and layout forced inside it (a tile reading
   its layout box), and the cover stage's WebGL context made DURING render (a
   tile asking whether it could be live); then the passive effects, where the
   sky made its context (25–40 ms, nearly all of it a sync `GetString` waiting
   in the GPU process behind the raster of the first frame) and compiled its
   program and the wake's seven, reading every status (16–32 ms of waits).
3. **The stage's first draws** (one frame after): three reads each program's
   link status and logs at its first use (6–10 ms), while the grid's images
   decode on the workers.
4. Font events in the trace: under 1 ms in every frame — but the font
   system's start-up is inside the first "style+layout" (see [what is
   left](#after)). Texture uploads: 2–11 ms, one a frame — already staggered.

## What changed

| step | what | commit |
| --- | --- | --- |
| a | **Boot order.** The sky's context and program, then the cover stage's context, made before React's first render, each in a task of its own (`main.tsx`): the GPU process has nothing else to do then, and `getContext` is 4 ms, not 25–40. The stage's programs and first draws, and the sky's wake, after the first contentful paint (`firstPaint.ts`) — nothing of either is on screen before then (each tile shows its still until its first draw lands; an asleep wake is an exact zero in the sky's shader). | `a.` |
| b | **The faces resized in a worker** (`faceWorker.ts`): the same `createImageBitmap` call, made in a worker, resolves there, and the bitmap is transferred. Byte-identical to the main thread's at five sizes, premultiplied and not (read back through WebGL: 0 bytes differ). | `b.` |
| c | **KHR_parallel_shader_compile, no status reads at compile time.** The sky's program and the wake's seven are compiled and linked without reading their status; the sky reads it at its first draw, the wake at its first step. The cover stage compiles each cover with `compileAsync` and draws it once its programs link. | `c.` |
| d | Not done: a–c met every bar they can meet (below); one context for the stage and the paper does not touch what is left. | — |

Context loss, for the two contexts changed: the stage keeps its last frames
while lost and rebuilds its covers on restore; the sky stops and comes back as
a new engine on the same canvas, its target and motion preference replayed.

## After

Five runs of each, interleaved (main, branch, main, …), production builds, headless Chrome, M1 Max. Worst frame per run, ms; in brackets, frames over the bar across the five runs. 1-minute load average 2.8–4.0 except the last pair at 2560 (6.1–6.6).

| | 1728×1117 @2× main | branch | 2560×1440 @2× main | branch |
| --- | --- | --- | --- | --- |
| **load, 3 s from the navigation**: no frame > 50 ms | 117, 117, 100, 117, 100 (13) | 117, 117, 83, 83, 100 (5) | 150, 150, 150, 150, 150 (20) | 100, 100, 100, 83, 83 (5) |
| …from the first contentful paint | 83, 100, 83, 83, 100 (8) | 33, 33, 17, 33, 33 (0) | 150, 150, 150, 150, 150 (15) | 33, 33, 33, 33, 33 (0) |
| **first detail arrival**: no frame > 50 ms | 17, 17, 17, 17, 17 (0) | 17, 33, 17, 17, 17 (0) | 17, 17, 17, 17, 17 (0) | 33, 17, 17, 17, 17 (0) |
| **after `warmup:done`**: no frame > 33 ms | 17, 17, 17, 17, 17 (0) | 17, 33, 17, 17, 17 (0) | 17, 17, 17, 17, 17 (0) | 33, 17, 17, 17, 17 (0) |
| first contentful paint, ms | 220, 224, 232, 212, 224 | 216, 224, 216, 212, 220 | 228, 252, 232, 228, 220 | 224, 208, 212, 212, 212 |
| `warmup:done`, ms | 826, 853, 832, 835, 847 | 667, 683, 752, 746, 670 | 1129, 1139, 1137, 1126, 1130 | 965, 967, 969, 948, 983 |
| loadavg (1 min) | 3.7, 3.4, 3.8, 3.3, 3.0 | 3.6, 4.0, 3.5, 3.1, 2.8 | 2.8, 3.0, 3.5, 3.0, 6.6 | 3.1, 3.1, 3.2, 3.1, 6.1 |

**Pass**, from the first paint: no frame over 50 ms in the first 3 s, none
over 50 ms in the first arrival, none over 33 ms after `warmup:done` — at both
sizes, every run. `main` fails the first at both sizes (the faces: 83–150 ms,
8 and 15 frames). **Fail**, counted from the navigation: one frame before the
first paint, 83–117 ms, in every run of both builds (below). The idle warm-up
also finishes 80–180 ms sooner.

`verify:jank` (1728×1117 @2×, its own load and pointer paths): every case
16.8 ms on both builds; its informational warm-up window (first paint to
`warmup:done`) is 83.3 ms worst on `main` (two frames over 50) and 33.3 ms
on the branch.

**What is left: one frame before the first paint.** In every run of both
builds the first style and layout of the page — forced inside React's first
commit (a tile reading its layout box) — takes 46–87 ms of wall time, and it is not the page's CSS: a lone
`<div>` with one line of text, laid out in a task of its own before React
renders, takes the same 14–87 ms (an empty `<div>` takes 0). It is the
renderer's first text layout: the font system's start-up in a new renderer
process (macOS's font service; it varied with how busy `fontd` was). It moves
with the first text and cannot be split; laying text out in a worker first
(`OffscreenCanvas.fillText`) did not take it off the main thread. Nothing is
on screen yet when it happens (the frame ends at the first paint). On `main`
it is inside a 50–100 ms React task beside the stage's context, followed by a
second 47–61 ms task (the sky); on the branch it is the only long task before
the first paint, and that frame also holds the two contexts' own tasks (4–7
ms; posted ahead of React's render, which is scheduled where it always was —
the first paint is unchanged, 208–224 ms against 212–252).

## WebGL contexts

Unchanged in number: the grid 2 (the sky, the cover stage) + 1 (the paper's,
from the idle warm-up), the detail view 3 (`verify:cover` `contexts`,
`verify:detail` `arrival`).

**One context for the cover stage and the paper (d), not done.** Feasible:
the stage is an offscreen canvas whose draws are copied into 2D canvases, and
the paper a visible canvas with its own 4× multisampled buffer. One context
for both means one `OffscreenCanvas` drawing each surface in turn and handing
each a frame (`transferToImageBitmap` into `bitmaprenderer` canvases) — the
paper would lose its default-framebuffer MSAA (an MSAA render target and a
resolve instead), and the hero's live cover would no longer need a second
renderer (and second programs) in the paper's context. It saves a context and
card 02's/03's duplicate programs; it does not touch any frame measured here.

**The sky in the same context, not attempted (as asked).** Feasible only the
same way: the sky is raw WebGL2 with its own loop, moved between three hosts
(the grid, the portfolio view's ground, the reader's), each under DOM layers
the other canvases are above — one canvas cannot be both under the grid and
over it, so it would have to be one context presenting several canvases
(`transferToImageBitmap`), with `resetState()` between the sky's raw calls and
three's. The sky's 5K frame is 5–6 ms of GPU; the copy is free in Chrome
(transfer, not copy), but the claim stack, the CSS fallback and the
read-backs (`readMeans`, the contrast probe) all assume a canvas of the sky's
own.
