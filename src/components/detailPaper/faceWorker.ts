/**
 * The paper's faces, decoded AND RESIZED off the main thread (paperGL.ts,
 * `resized`). `createImageBitmap` from a blob decodes on a worker of the
 * browser's, but the crop, the resize (`high`) and the premultiply run in the
 * task that resolves it, on the thread that asked: on the main thread that
 * was 18–50 ms a face, five of them resolving in one frame — a 100–167 ms
 * frame ~0.6 s after every load (docs/perf/first-second.md). Asked here, the
 * same call resolves here, and the bitmap is transferred back, not copied.
 */
export interface FaceJob {
  id: number;
  url: string;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  w: number;
  h: number;
  premultiply: boolean;
}

export type FaceReply = { id: number; bitmap: ImageBitmap } | { id: number; error: string };

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<FaceJob>) => void) | null;
  postMessage(m: FaceReply, transfer?: Transferable[]): void;
};

scope.onmessage = (e) => {
  const j = e.data;
  fetch(j.url)
    .then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${j.url}`);
      return r.blob();
    })
    .then((blob) =>
      createImageBitmap(blob, j.sx, j.sy, j.sw, j.sh, {
        resizeWidth: j.w,
        resizeHeight: j.h,
        resizeQuality: 'high',
        premultiplyAlpha: j.premultiply ? 'premultiply' : 'default',
      }),
    )
    .then(
      (bitmap) => scope.postMessage({ id: j.id, bitmap }, [bitmap]),
      (err) => scope.postMessage({ id: j.id, error: String(err) }),
    );
};
