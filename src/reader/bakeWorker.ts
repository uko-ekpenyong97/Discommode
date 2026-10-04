/**
 * The chapter-break bakes, ENCODED off the main thread (quotePlayer.ts,
 * `encode`). `toBlob` on a 2000×2600 canvas snapshots it synchronously on the
 * thread that asks — 8–16 ms a bake on the main thread, which a quote page's
 * first settle spent inside the turn's last frames and dropped one. The page
 * is drawn there (under a millisecond) and handed over as an ImageBitmap
 * (transferred, not copied); here it is drawn once more and encoded.
 */
export interface BakeJob {
  id: number;
  bitmap: ImageBitmap;
  type: string;
  quality: number;
}

export type BakeReply = { id: number; blob: Blob } | { id: number; error: string };

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<BakeJob>) => void) | null;
  postMessage(m: BakeReply): void;
};

scope.onmessage = (e) => {
  const { id, bitmap, type, quality } = e.data;
  try {
    const c = new OffscreenCanvas(bitmap.width, bitmap.height);
    c.getContext('2d')!.drawImage(bitmap, 0, 0);
    bitmap.close();
    c.convertToBlob({ type, quality }).then(
      (blob) => scope.postMessage({ id, blob }),
      (err) => scope.postMessage({ id, error: String(err) }),
    );
  } catch (err) {
    scope.postMessage({ id, error: String(err) });
  }
};
