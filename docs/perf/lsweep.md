# `lsweep`: its budget, re-baselined

`verify:cover`'s `lsweep` sweeps the pointer through every card-02 tile on
screen at 1728×996 @2× in about a second, counts how many tiles are drawn for
themselves in each frame, and prices the worst frame from benches: the shared
draw + that many warm draws + 4 copies ([docs/covers.md, "At most two easing
tiles"](../covers.md#the-pointers-warmth)). It was held to `BUDGET.total`,
1.2 ms — the design budget for the grid's cover work per frame — and failed
when its benches ran on the dev server or a busy machine (1.78 ms "in the full
run, its draws benched at twice their cost alone").

## Measured (2026-10-04)

M1 Max, Chrome 154, the verify build (a production bundle with the test hooks,
[flaky-checks.md](flaky-checks.md#the-verify-build)). `main` is `main`'s code
built the same way; "branch" is this branch.

| | runs | min | median | p95 | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| alone, load average 14–16 (Spotlight indexing), `main` | 15 | 0.695 | 0.820 | 1.095 | 1.095 |
| alone, load average 3–4, `main` | 15 | 0.670 | 0.690 | 0.700 | 0.700 |
| alone, load average 3–4, branch | 15 | 0.675 | 0.685 | 0.770 | 0.770 |
| inside a full `verify:cover` run, `main` | 1 | 0.695 | | | |
| **all** | **46** | **0.670** | **0.695** | **1.020** | **1.095** |

ms, the worst grid frame. Every run: 3 tiles swept, at most 2 drawn for
themselves in one frame (the cap). The shared draw benched 0.150–0.285, a warm
draw 0.170–0.275, a copy 0.045–0.082: on a loaded machine each bench reads
1.2–1.6× its quiet value, which is all the spread is.

## The budget

**1.25 ms** (`LSWEEP_BUDGET`, scripts/cover-verify.mjs): the p95 of all 46,
1.020, plus ~20% — about what a busy machine adds to the quiet median, so the
check measures the covers and not the machine.

A timing budget alone does not guard what the sweep is for. With the cap
raised to 3 (a throwaway build), the sweep drew 3 tiles for themselves and
priced the frame at 0.865 ms — inside 1.25, and inside the old 1.2. So the cap
is now asserted directly: **at most 2 tiles drawn for themselves in any
frame** (`LSWEEP_OWN_MAX`, coverStage.ts's `MAX_OWN_TILES`). That control
fails it ("at most 3 … ≤ 2").

## Passes

After the change, the check passed 3 of 3 on `main` and 3 of 3 on this
branch, alone, interleaved (0.670–0.750 ms; 2 tiles each). Inside the full
runs: see the morning report.
