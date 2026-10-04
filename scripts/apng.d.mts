/** Types for the parts of apng.mjs the unit tests use. */
export interface ApngFrame {
  rgba: Uint8Array;
  delayMs: number;
}
export interface Apng {
  w: number;
  h: number;
  /** 0: forever. */
  plays: number;
  frames: ApngFrame[];
}
export function readApng(path: string): Promise<Apng>;
export function runsOf(frames: ApngFrame[]): { rgba: Uint8Array; first: number; count: number; delayMs: number }[];
export function fpsOfDelays(delaysMs: number[]): number | null;
export function holdsOf(delaysMs: number[], fps: number): number[];
export function sourceApngPath(issue: string, id: string, file: string): string | null;
