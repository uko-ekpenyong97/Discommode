import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import {
  ColorManagement,
  DataTexture,
  LinearFilter,
  LinearSRGBColorSpace,
  Mesh,
  NoColorSpace,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  Texture,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from 'three';
import { applyCurlOptions, bentPoint, createCurlMaterials } from './curlMaterial';
import type { CurlMaterials, CurlMaterialOptions } from './curlMaterial';
import { fitPlaneToRect } from './fitPlaneToRect';
import type { PlaneFit, ScreenRect } from './fitPlaneToRect';
import { look, subscribeLook } from './portfolioMotion';
import type { SheetKind, SheetPose } from './pageTrack';
import type { SheetTexture } from './blocks/types';

/**
 * THE SHEET — one fixed WebGL canvas, and the only thing in the view that is
 * not HTML.
 *
 * It exists for the ENTRANCE and nothing else. The exit is CSS 3D on the live
 * page element, so no texture is needed for it; the vertical run is the page
 * alone. Outside an entrance this component does not paint, does not schedule a
 * frame, and takes its element out of the paint order — there is no idle loop
 * here to be cheap about, because there is no loop. Every frame it draws is a
 * frame the scroll asked for.
 *
 * THE CAMERA IS THE REFERENCE'S: fov 20 at z = 50. `fitPlaneToRect` derives the
 * plane's size from it and the page's rect, so at scale 1 the plane's screen
 * rect is the page's rect. {@link SheetCanvasHandle.screenRect} reports what
 * three.js actually projects, rather than what the fit intended, because the
 * invariant is worth checking against the renderer rather than against the
 * arithmetic that fed it.
 */

/** The reference's camera. Both of these are load-bearing — see `curlMaterial`
 *  on why its two lights transfer only because these do. */
const FOV = 20;
const CAMERA_Z = 50;

/** Below this the roll facets along its tight end, where the curvature is
 *  highest. The roll runs along y, which is why y gets more. */
const SEGMENTS_X = 64;
const SEGMENTS_Y = 96;

/** Retina is worth it on a page of type; past 2 it is not. */
const MAX_DPR = 2;

/**
 * HOW FAR EITHER SIDE OF THE READER A CAPTURE IS KEPT.
 *
 * One section. The resident set is the section being read and its two
 * neighbours — six captures, two per section — and everything else is disposed
 * the moment the reader commits to another section. A 2x capture of a
 * 1632 x 844 page is 21.0 MB of uncompressed RGBA with no mipmap chain, so the
 * number that matters is not the size of one, it is that the set STOPS GROWING
 * with the length of the project: a five-section card used to end a read-through
 * holding ten of them.
 *
 * One is the smallest radius that is still safe, and the reason is the rewind.
 * `activeIndex` commits at the forward hand-off, so during section k's entrance
 * it is still k − 1 — which means the window has to reach a section FORWARD to
 * hold the sheet that is on screen, and a section BACK to hold the tail of the
 * tear a reader rewinding out of this page runs into next.
 */
export const RESIDENT_RADIUS = 1;

/** The free corner, projected, with the flat sheet's own corner beside it. */
export interface CornerLift {
  x: number;
  y: number;
  flatX: number;
  flatY: number;
  /** The distance between the two, in CSS pixels. */
  px: number;
}

export interface SheetCanvasHandle {
  /** Fit the plane to the page's rect, in VIEWPORT coordinates, and say which
   *  bucket the page is laid out at (null below the smallest). Called from
   *  every measure, never from a frame. */
  fit: (rect: ScreenRect, bucket: number | null) => void;
  /**
   * Where each section's LAST viewport starts inside its `tail` capture, in
   * CSS pixels. The capture was taken with the page `CAPTURE_HEIGHT` tall and
   * the live page is shorter, so the two were scrolled to different bottoms;
   * this is the difference, and the sheet's uv crop starts there.
   */
  tailRows: (rows: number[]) => void;
  /** Paint one frame of section `index`'s entrance. */
  show: (index: number, pose: SheetPose) => void;
  /** Start fetching a capture without binding or painting it — the textures a
   *  reader is about to need, while they are reading. */
  warm: (index: number, kind: SheetKind) => void;
  /** Dispose every capture more than {@link RESIDENT_RADIUS} sections from
   *  `center`. Called when the reader commits to another section, so the set
   *  the GPU holds stops growing with the length of the project. */
  evict: (center: number) => void;
  /** DEV: what the GPU is holding — one entry per capture that has decoded.
   *  The residency claim is asked of this rather than asserted. */
  residentTextures: () => { src: string; mb: number }[];
  /** The capture currently bound, and whether it has actually decoded. A sheet
   *  wearing nothing is blank paper, which is what a hand-off must not be. */
  texture: () => { src: string; ready: boolean } | null;
  /** Stop painting and leave the paint order. */
  hide: () => void;
  /** The flat plane's screen rect as three.js projects it, in viewport
   *  coordinates — the number the hand-off invariant is about. */
  screenRect: () => ScreenRect | null;
  /** The free corner's screen position against where a flat sheet would put it
   *  — how far the tear's first movement has actually come off the page. */
  cornerLift: () => CornerLift | null;
  /** Where the shader put the vertex at `(u, v)`, in screen pixels. */
  sheetPoint: (u: number, v: number, flat?: boolean) => { x: number; y: number } | null;
  /** Frames painted since mount. Must not move during a vertical run. */
  frames: () => number;
}

function curlOptions(): CurlMaterialOptions {
  return {
    taper: look.curlTaper,
    depth: look.curlDepth,
    paper: look.paperColor,
    lightA: { x: look.lightAX, y: look.lightAY, z: look.lightAZ, intensity: look.lightA },
    lightB: { x: look.lightBX, y: look.lightBY, z: look.lightBZ, intensity: look.lightB },
    roughness: look.paperRoughness,
    reflect: look.paperReflect,
    ambient: look.paperAmbient,
    backShade: look.backShade,
    grain: look.grainOpacity,
    mouseTiltDeg: look.mouseTiltDeg,
    edgeInk: look.inkColor,
    edgeAlpha: look.edgeAlpha,
  };
}

/** A bound sampler for the sections whose capture has not decoded yet. The
 *  first entrance must not wait on a texture: see the first-open lock. */
function blankTexture(): DataTexture {
  const tex = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat);
  tex.needsUpdate = true;
  return tex;
}

/** One section's two captures, at every bucket: the first viewport of its page,
 *  and the last. */
export interface SectionCaptures {
  sheet: SheetTexture[];
  tail: SheetTexture[];
}

export const SheetCanvas = forwardRef<SheetCanvasHandle, { captures: SectionCaptures[] }>(
  function SheetCanvas({ captures }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const gl = useRef<{
      renderer: WebGLRenderer;
      scene: Scene;
      camera: PerspectiveCamera;
      mesh: Mesh;
      materials: CurlMaterials;
      blank: DataTexture;
      probe: Object3D;
    } | null>(null);

    const fitRef = useRef<PlaneFit | null>(null);
    const loaded = useRef(new Map<string, Texture>());
    const mouse = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
    const framesRef = useRef(0);
    /** The last pose drawn, so a texture arriving mid-entrance can be put on
     *  screen without waiting for the next scroll tick — which, if the reader
     *  has stopped, is never. */
    const lastRef = useRef<{ index: number; pose: SheetPose } | null>(null);
    const showRef = useRef<(index: number, pose: SheetPose) => void>(() => {});
    const capturesRef = useRef(captures);
    capturesRef.current = captures;
    /** The bucket the live page is laid out at, which is what picks the
     *  capture; null below the smallest bucket. */
    const bucketRef = useRef<number | null>(null);
    /** The live page's rect height in CSS pixels, which is how much of the
     *  capture the sheet shows. */
    const pageHeightRef = useRef(0);
    /** Per section, the row of its tail capture the live last viewport starts
     *  at. See {@link SheetCanvasHandle.tailRows}. */
    const tailRowsRef = useRef<number[]>([]);
    /** The capture currently bound, by src, and which section and kind it is a
     *  capture of. A bucket change binds a new capture for the same section,
     *  and until that one has decoded the old one stays on. */
    const boundSrcRef = useRef('');
    const boundForRef = useRef<{ index: number; kind: SheetKind; entry: SheetTexture } | null>(null);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const textures = loaded.current;

      const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setClearAlpha(0);
      // NO COLOUR MANAGEMENT, deliberately. `LinearSRGBColorSpace` on the output
      // is three's "write what you computed", and the switch below stops a
      // `Color` built from a hex string being decoded on the way in. The
      // texture's bytes have to reach the screen unchanged: the hand-off is a
      // crossfade between two surfaces showing the same pixels, and a colour
      // pipeline that is more correct about light would make them different
      // pixels. See `curlMaterial.ts`.
      renderer.outputColorSpace = LinearSRGBColorSpace;
      ColorManagement.enabled = false;

      const scene = new Scene();
      const camera = new PerspectiveCamera(FOV, 1, 0.1, 1000);
      camera.position.z = CAMERA_Z;

      // TWO PROGRAMS, one uniforms object: the entrance's cone wrap and the
      // tear's arc. `show` puts the right one on the mesh — see `curlMaterial`
      // on why this is a program and not a branch inside one.
      const materials = createCurlMaterials(curlOptions());
      const blank = blankTexture();
      materials.uniforms.uMap.value = blank;
      const mesh = new Mesh(new PlaneGeometry(1, 1, SEGMENTS_X, SEGMENTS_Y), materials.roll);
      scene.add(mesh);

      // A stand-in for the FLAT plane, kept out of the scene: `screenRect` has
      // to answer "where would this land at scale 1, uncurled" while the real
      // mesh is mid-entrance and neither.
      const probe = new Object3D();

      gl.current = { renderer, scene, camera, mesh, materials, blank, probe };

      // BOTH PROGRAMS COMPILED BEFORE EITHER IS WANTED. three compiles on first
      // use, so the fold would otherwise pay for itself on the first frame of
      // the first tear — a spike in the one segment that is all WebGL. Two
      // compiles at mount is the same work moved to where nothing is moving.
      mesh.material = materials.fold;
      renderer.compile(scene, camera);
      mesh.material = materials.roll;
      renderer.compile(scene, camera);

      /**
       * THE BACKING STORE, at the display's own scale.
       *
       * `setPixelRatio` is what sizes it: `setSize(w, h, false)` then writes a
       * canvas `width` of `w × ratio` while CSS holds the element at `w`. On a
       * 2x display that is a 3456 x 1992 framebuffer behind a 1728 x 996
       * element, which is the resolution the HTML page's own type is drawn at —
       * and the capture the sheet wears has to match it or the swap is a change
       * of sharpness. See `captureFor`.
       */
      const resize = (): void => {
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (w === 0 || h === 0) return;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      resize();
      window.addEventListener('resize', resize);

      /**
       * …and again when the DEVICE PIXEL RATIO moves under it, which a resize
       * event does not reliably report: dragging the window to a display of
       * another density changes the ratio at the same viewport size. A media
       * query on the current `dppx` fires once, on the way out of the value it
       * was written for, so each listener arms the next.
       *
       * It re-renders the last pose as well as re-sizing. The canvas only paints
       * when the scroll asks it to, so a reader stopped mid-entrance would
       * otherwise be left looking at the old framebuffer — and at the capture
       * picked for the old scale.
       */
      let dprQuery: MediaQueryList | null = null;
      const onDprChange = (): void => {
        watchDpr();
        resize();
        const last = lastRef.current;
        if (last) showRef.current(last.index, last.pose);
      };
      const watchDpr = (): void => {
        dprQuery?.removeEventListener('change', onDprChange);
        dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
        dprQuery.addEventListener('change', onDprChange);
      };
      watchDpr();

      // The pointer is read from the WINDOW, not from the canvas: the canvas is
      // never a pointer target (see `portfolio.css`), so it would never hear.
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const onMove = (e: PointerEvent): void => {
        mouse.current.tx = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.current.ty = (e.clientY / window.innerHeight) * 2 - 1;
      };
      if (!reduced) window.addEventListener('pointermove', onMove, { passive: true });

      const off = subscribeLook(() => applyCurlOptions(materials, curlOptions()));

      return () => {
        off();
        dprQuery?.removeEventListener('change', onDprChange);
        window.removeEventListener('resize', resize);
        window.removeEventListener('pointermove', onMove);
        mesh.geometry.dispose();
        materials.dispose();
        blank.dispose();
        for (const t of textures.values()) t.dispose();
        textures.clear();
        renderer.dispose();
        /**
         * …AND THE CONTEXT ITSELF, which `dispose` does not take. It frees
         * three's own resources and leaves the WebGL context live, to be
         * collected whenever the canvas element is — and the view is opened and
         * closed from the grid, so "whenever" is a context per open. Chrome
         * keeps sixteen and then drops the oldest, which is a leak that looks
         * like a plateau rather than a ramp.
         *
         * ONLY IF THE CANVAS HAS ACTUALLY GONE, and that is not a nicety. A
         * forced loss is permanent for the element it is asked of: `getContext`
         * afterwards hands back the lost context, `getContextAttributes` comes
         * back null, and the next `WebGLRenderer` on it throws reading
         * `precision`. React's StrictMode mounts this effect, tears it down and
         * mounts it again on THE SAME element, so a loss taken in the cleanup
         * kills the canvas the remount is about to use. A macrotask later the
         * element is either back in the tree (a remount — leave it alone) or
         * detached (a real close — take the context with it).
         */
        window.setTimeout(() => {
          if (!canvas.isConnected) renderer.forceContextLoss();
        }, 0);
        gl.current = null;
      };
    }, []);

    /**
     * The capture for section `k` at the bucket the page is laid out at.
     *
     * The bucket is not negotiable: a page's type is a fixed size and its
     * measure is not, so a capture taken at another width is a different
     * document rather than the same one at another scale, and no resampling
     * turns one into the other. Below the smallest bucket the page is
     * fluid, and the nearest capture is the least-wrong picture of it.
     */
    const captureFor = (k: number, kind: SheetKind): SheetTexture | null => {
      const list = capturesRef.current[k]?.[kind];
      if (!list || list.length === 0) return null;
      const want = bucketRef.current;
      if (want !== null) {
        const exact = list.find((c) => c.bucket === want);
        if (exact) return exact;
      }
      const target = want ?? 0;
      return list.reduce((best, next) =>
        Math.abs(next.bucket - target) < Math.abs(best.bucket - target) ? next : best,
      );
    };

    /** The texture for a capture, kicked off the first time it is asked for.
     *  Never awaited: the entrance renders with whatever has decoded, and for
     *  the first 60% of it the sheet is a tube with very little texture to
     *  show. */
    const textureFor = (k: number, kind: SheetKind): Texture | null => {
      const entry = captureFor(k, kind);
      if (!entry) return null;
      const have = loaded.current.get(entry.src);
      if (have) return have;
      const tex = new TextureLoader().load(entry.src, () => {
        // EVICTED WHILE IN FLIGHT, and the map is what says so: a fetch started
        // for a section the reader has since moved away from lands on a texture
        // that has been disposed and dropped, and putting that on the screen
        // would bind an object with no GPU resource behind it.
        if (loaded.current.get(entry.src) !== tex) return;
        // A late arrival has to reach the screen, and it cannot wait for the
        // next scroll tick: a reader who has stopped mid-entrance would be
        // looking at blank paper until they moved again. That includes a
        // capture that is WANTED but not yet bound, because the previous
        // bucket's is being held on screen until this one arrives.
        if (!gl.current || captureFor(k, kind)?.src !== entry.src) return;
        const last = lastRef.current;
        if (last && last.index === k && last.pose.kind === kind) {
          showRef.current(last.index, last.pose);
        }
      });
      tex.colorSpace = NoColorSpace;
      // NO MIPMAPS. There is one capture per bucket, taken at the page's own
      // width, so a flat sheet samples it at exactly one texel per device
      // pixel on a 2x display and exactly two on a 1x one, which bilinear
      // filtering at a pixel-aligned rect averages. A mipmap chain under that
      // is a levels-of-detail calculation that can come back a hair above zero
      // and blur every glyph on the page for it. Anisotropy below is at the
      // renderer's own maximum, for the frames where the sheet is bent and the
      // mapping is not 1:1.
      tex.generateMipmaps = false;
      tex.minFilter = LinearFilter;
      tex.magFilter = LinearFilter;
      if (gl.current) tex.anisotropy = gl.current.renderer.capabilities.getMaxAnisotropy();
      loaded.current.set(entry.src, tex);
      return tex;
    };

    const fit = (rect: ScreenRect, bucket: number | null): void => {
      bucketRef.current = bucket;
      pageHeightRef.current = rect.height;
      const g = gl.current;
      const canvas = canvasRef.current;
      if (!g || !canvas) return;
      // The rect arrives in viewport coordinates; the fit wants it in the
      // canvas's. They are the same today — the canvas is inset 0 in a fixed
      // full-viewport layer — and asking anyway costs one read per measure and
      // survives the day they are not.
      const box = canvas.getBoundingClientRect();
      const local = { ...rect, left: rect.left - box.left, top: rect.top - box.top };
      const plane = fitPlaneToRect(
        FOV,
        CAMERA_Z,
        { width: canvas.clientWidth, height: canvas.clientHeight },
        local,
      );
      fitRef.current = plane;
      g.materials.uniforms.uAspect.value = plane.aspect;
      // One CSS pixel of the PAGE, in the plane's uv. The hairline has to be
      // the same width as the page's inset ring, not the same fraction of a
      // plane that changes size with the viewport.
      g.materials.uniforms.uHairline.value.set(1 / local.width, 1 / local.height);
      g.probe.position.set(plane.x, plane.y, 0);
      g.probe.scale.set(plane.width, plane.height, plane.height);
      g.probe.rotation.set(0, 0, 0);
      g.probe.updateMatrixWorld(true);
    };

    const show = (index: number, pose: SheetPose): void => {
      lastRef.current = { index, pose };
      const g = gl.current;
      const plane = fitRef.current;
      const canvas = canvasRef.current;
      if (!g || !plane || !canvas) return;

      const capture = captureFor(index, pose.kind);
      if (boundSrcRef.current !== (capture?.src ?? '')) {
        const tex = textureFor(index, pose.kind);
        // A BUCKET CHANGE HOLDS THE OLD CAPTURE until the new one decodes. The
        // resize that caused it has already re-laid the page, so the old
        // capture is the wrong width, but it is the same section's picture.
        // The alternative is blank paper for as long as a fetch takes, which is
        // the one thing a sheet must never show.
        const held = boundForRef.current;
        const keep =
          !tex?.image &&
          held !== null &&
          held.index === index &&
          held.kind === pose.kind &&
          Boolean(loaded.current.get(held.entry.src)?.image);
        if (!keep) {
          boundSrcRef.current = capture?.src ?? '';
          boundForRef.current = capture ? { index, kind: pose.kind, entry: capture } : null;
          g.materials.uniforms.uMap.value = tex ?? g.blank;
          g.materials.uniforms.uHasMap.value = tex?.image ? 1 : 0;
        }
      } else if (!g.materials.uniforms.uHasMap.value && loaded.current.get(boundSrcRef.current)?.image) {
        g.materials.uniforms.uHasMap.value = 1;
      }
      // THE CROP: the rows of the capture the live page is showing. The top of
      // a `sheet`; for a `tail`, the band that starts where the live page's
      // last viewport does. See `uUvCrop`.
      const bound = boundForRef.current;
      if (bound) {
        const h = pageHeightRef.current;
        const top = bound.kind === 'tail' ? (tailRowsRef.current[bound.index] ?? 0) : 0;
        g.materials.uniforms.uUvCrop.value.set(
          1 - (top + h) / bound.entry.height,
          h / bound.entry.height,
        );
      }

      // WHICH SHAPE, first: an entrance ROLLS and a tear FOLDS. It is a whole
      // program rather than a uniform, because a branch inside one program
      // moved the tear by a level on a handful of pixels — see `curlMaterial`.
      g.mesh.material = pose.curlMode === 0 ? g.materials.roll : g.materials.fold;

      const u = g.materials.uniforms;
      const m = mouse.current;
      m.x += (m.tx - m.x) * look.mouseLerp;
      m.y += (m.ty - m.y) * look.mouseLerp;
      u.uMouse.value.set(m.x, m.y);
      u.uPointer.value = pose.pointer ? 1 : 0;
      // The rest of these mean different things in the two shapes, and every
      // one of them is written on every frame — so nothing a tear left behind
      // can reach a roll through the uniforms the two programs share.
      u.uCurlAmount.value = pose.curl;
      u.uCurlOrigin.value = pose.curlOrigin;
      u.uCurlOriginEdge.value = pose.curlOriginEdge;
      u.uCurlAxis.value = (pose.curlAxis * Math.PI) / 180;
      u.uCurlTightness.value = pose.tightness;
      u.uCurlWrap.value = pose.curlWrap;
      u.uOpacity.value = pose.opacity;

      const w = plane.width * pose.scale;
      const h = plane.height * pose.scale;
      g.mesh.scale.set(w, h, h);
      // EVERY ANGLE IN THIS VIEW IS MEASURED THE WAY A CSS ROTATION IS —
      // clockwise from horizontal — and three's is the other way round, so the
      // sign flips exactly here and nowhere else. It is worth the one negation:
      // `peelAngle`, the tear's turn and the entrance's tilt are all read off
      // the same protractor, and a tear that lifts its free corner is a
      // negative number in the dock the way it would be in a stylesheet.
      const a = -(pose.rotationZ * Math.PI) / 180;
      g.mesh.rotation.z = a;

      // THE PIVOT. three turns a mesh about its own centre, and the tear turns
      // about the corner the sheet is stuck at — which is the whole difference
      // between a sheet being peeled and a sheet being spun. So the centre is
      // placed wherever it has to be for the pivot to land back on the point it
      // occupies at rest: take the pivot's offset from the centre at the pose's
      // scale, turn it, and subtract.
      const restX = pose.pivotX * plane.width;
      const restY = pose.pivotY * plane.height;
      const turnedX = pose.pivotX * w * Math.cos(a) - pose.pivotY * h * Math.sin(a);
      const turnedY = pose.pivotX * w * Math.sin(a) + pose.pivotY * h * Math.cos(a);
      g.mesh.position.set(
        plane.x + restX - turnedX,
        plane.y + pose.y * plane.height + restY - turnedY,
        0,
      );

      canvas.style.visibility = '';
      g.renderer.render(g.scene, g.camera);
      framesRef.current++;
    };
    showRef.current = show;

    /**
     * THE NEXT TWO CAPTURES, fetched while the reader is reading.
     *
     * A texture is otherwise requested at the moment it is first BOUND, which
     * for a tail is `p` = 0 of the tear — the frame the reverse hand-off
     * crossfades onto. A capture that has not arrived is blank paper, and blank
     * paper at a swap is the one thing the crossfade exists to prevent; at 2x
     * the files are four times the pixels, which turned an unlikely race into a
     * measurable one (`pv-verify`, 1440×900 @2x: 74% of the page differing).
     *
     * So when the reader lands on a page, the captures they are next going to
     * need — this section's tail, at its tear, and the next section's sheet, at
     * its entrance — are asked for. It is a fetch and a decode, nothing is bound
     * and no frame is painted, and it happens long after the first-open lock has
     * armed, so the argument for keeping captures off the critical path is
     * untouched.
     *
     * The driver now asks for the whole resident window rather than those two,
     * and {@link evict} is why it has to: a capture that was fetched three
     * sections ago has been disposed since, so "it is already in the map" is no
     * longer something the warm can assume. The extra four are the same fetch
     * and the same decode, and on a rewind they are served from the HTTP cache.
     */
    const warm = (index: number, kind: SheetKind): void => {
      if (!gl.current || index < 0 || index >= capturesRef.current.length) return;
      textureFor(index, kind);
    };

    /**
     * …AND LETTING GO AGAIN, which is the half that keeps the number flat.
     *
     * Every capture the reader had been past used to stay resident for the life
     * of the view: uncompressed RGBA at the file's own pixels with no mipmap
     * chain, 21.0 MB apiece at 2x, ten of them by the end of a five-section
     * card. So when the reader commits to a section, everything more than
     * {@link RESIDENT_RADIUS} away from it is disposed and dropped from the
     * map — the GPU resource goes now, and the bytes come back off the HTTP
     * cache if the reader ever rewinds that far.
     *
     * The keep set is built from {@link captureFor} rather than from the
     * section's whole list, so the entries a resize or a DPR change left behind
     * — the same page at the width or the scale the reader is no longer at — go
     * with it.
     *
     * THE BOUND CAPTURE IS NEVER DISPOSED, whatever the window says, and that
     * guard is load-bearing rather than defensive. A hand-off paints the flat
     * sheet of the section it was started for on every one of its 120ms of
     * frames, and the driver prunes again when one lands — so an eviction can
     * and does run while the sheet is wearing a capture the window has just
     * moved off. Disposing that one would put a texture with no GPU resource
     * behind it into a crossfade, which is the blank paper the crossfade exists
     * to prevent. It goes at the next section change instead.
     */
    const evict = (center: number): void => {
      const keep = new Set<string>();
      if (boundSrcRef.current) keep.add(boundSrcRef.current);
      for (let k = center - RESIDENT_RADIUS; k <= center + RESIDENT_RADIUS; k++) {
        if (k < 0 || k >= capturesRef.current.length) continue;
        for (const kind of ['sheet', 'tail'] as const) {
          const entry = captureFor(k, kind);
          if (entry) keep.add(entry.src);
        }
      }
      for (const [src, tex] of loaded.current) {
        if (keep.has(src)) continue;
        tex.dispose();
        loaded.current.delete(src);
      }
    };

    /** DEV: what the GPU is holding. A texture that has not decoded has no
     *  image and no resource behind it yet, so it is not counted — the claim is
     *  about bytes on the card, not about fetches in flight. */
    const residentTextures = (): { src: string; mb: number }[] => {
      const out: { src: string; mb: number }[] = [];
      for (const [src, tex] of loaded.current) {
        const img = tex.image as { width?: number; height?: number } | undefined;
        if (!img?.width || !img.height) continue;
        out.push({ src, mb: (img.width * img.height * 4) / (1024 * 1024) });
      }
      return out;
    };

    const tailRows = (rows: number[]): void => {
      tailRowsRef.current = rows;
    };

    const hide = (): void => {
      lastRef.current = null;
      // NOTHING IS BOUND once the canvas is out of the paint order, and saying
      // so is what keeps {@link evict}'s guard honest: a src left here is a
      // capture the eviction will not touch, and the whole vertical run and the
      // whole dwell are spent hidden. Measured before this line existed: a
      // reader two sections on from where the canvas was last painted held
      // SEVEN captures, the six of the window and one the hide had pinned.
      boundSrcRef.current = '';
      boundForRef.current = null;
      const canvas = canvasRef.current;
      if (canvas) canvas.style.visibility = 'hidden';
    };

    /** Where the FLAT plane lands on screen, as three.js projects it — the
     *  number the hand-off invariant is about, asked of the renderer rather
     *  than of the arithmetic that fed it. */
    /**
     * WHERE THE FREE CORNER IS, and where it would be if the sheet were flat.
     *
     * The tear's first movement is a corner coming off the surface, and the
     * only honest way to ask how far it has come is to put that vertex through
     * the same bend and the same camera the GPU does. `bentPoint` is the CPU
     * port of the shader's own geometry (see `curlMaterial.ts`); the flat
     * reference goes through the identical transform with the bend switched
     * off, so the answer is a displacement rather than a position and the
     * sheet's own turn and lift cannot flatter it.
     */
    /**
     * WHERE THE SHADER PUT A VERTEX, in screen pixels.
     *
     * The bend is computed in a vertex shader, so the CPU has no way to ask the
     * GPU where it put one without reading a buffer back. `bentPoint` is the
     * hand port of that geometry (see `curlMaterial.ts`) and this puts its
     * answer through the mesh's own matrix and the same camera. `flat` runs the
     * identical transform with the bend switched off, which is what makes a
     * DISPLACEMENT possible: the sheet's own turn, lift and scale are in both,
     * so they cancel and what is left is the bend.
     */
    const sheetPoint = (u: number, v: number, flat = false): { x: number; y: number } | null => {
      const g = gl.current;
      const canvas = canvasRef.current;
      const plane = fitRef.current;
      const last = lastRef.current;
      if (!g || !canvas || !plane || !last) return null;
      g.camera.updateMatrixWorld(true);
      g.camera.updateProjectionMatrix();
      g.mesh.updateMatrixWorld(true);
      const box = canvas.getBoundingClientRect();
      const [px, py, pz] = bentPoint(u, v, {
        mode: last.pose.curlMode,
        amount: flat ? 0 : last.pose.curl,
        origin: last.pose.curlOrigin,
        originEdge: last.pose.curlOriginEdge,
        axis: (last.pose.curlAxis * Math.PI) / 180,
        tightness: last.pose.tightness,
        taper: look.curlTaper,
        depth: look.curlDepth,
        wrap: last.pose.curlWrap,
        aspect: plane.aspect,
      });
      const p = new Vector3(px, py, pz).applyMatrix4(g.mesh.matrixWorld).project(g.camera);
      return {
        x: ((p.x + 1) / 2) * canvas.clientWidth + box.left,
        y: ((1 - p.y) / 2) * canvas.clientHeight + box.top,
      };
    };

    /** The free corner — uv (1, 0) — against where a flat sheet would put it.
     *  How far the tear's first movement has actually come off the page. */
    const cornerLift = (): CornerLift | null => {
      const bent = sheetPoint(1, 0);
      const flat = sheetPoint(1, 0, true);
      if (!bent || !flat) return null;
      return {
        ...bent,
        flatX: flat.x,
        flatY: flat.y,
        px: Math.hypot(bent.x - flat.x, bent.y - flat.y),
      };
    };

    const screenRect = (): ScreenRect | null => {
      const g = gl.current;
      const canvas = canvasRef.current;
      if (!g || !fitRef.current || !canvas) return null;
      // The renderer is what normally brings the camera's matrices up to date,
      // and on a deep link it has never run: the entrance is skipped, so the
      // canvas has painted nothing. Without this the projection divides by a
      // zero depth and every corner comes back NaN.
      g.camera.updateMatrixWorld(true);
      g.camera.updateProjectionMatrix();
      const box = canvas.getBoundingClientRect();
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      let left = Infinity;
      let top = Infinity;
      let right = -Infinity;
      let bottom = -Infinity;
      for (const [cx, cy] of [
        [-0.5, -0.5],
        [0.5, -0.5],
        [-0.5, 0.5],
        [0.5, 0.5],
      ]) {
        const v = g.probe.localToWorld(new Vector3(cx, cy, 0)).project(g.camera);
        const x = ((v.x + 1) / 2) * w + box.left;
        const y = ((1 - v.y) / 2) * h + box.top;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
      return { left, top, width: right - left, height: bottom - top };
    };

    /** The bound capture, and whether it has decoded — `image` is only set once
     *  the loader has one. */
    const texture = (): { src: string; ready: boolean } | null => {
      const src = boundSrcRef.current;
      if (!src) return null;
      return { src, ready: Boolean(loaded.current.get(src)?.image) };
    };

    useImperativeHandle(
      ref,
      (): SheetCanvasHandle => ({
        fit,
        tailRows,
        show,
        warm,
        evict,
        residentTextures,
        texture,
        hide,
        screenRect,
        cornerLift,
        sheetPoint,
        frames: () => framesRef.current,
      }),
      // Every member closes over refs only, so the handle never has to change.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [],
    );

    return <canvas ref={canvasRef} className="pv-canvas" aria-hidden="true" />;
  },
);
