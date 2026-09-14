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
import { applyCurlOptions, createCurlMaterial } from './curlMaterial';
import type { CurlMaterial, CurlMaterialOptions } from './curlMaterial';
import { fitPlaneToRect } from './fitPlaneToRect';
import type { PlaneFit, ScreenRect } from './fitPlaneToRect';
import { look, subscribeLook } from './portfolioMotion';
import type { SheetPose } from './pageTrack';
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

export interface SheetCanvasHandle {
  /** Fit the plane to the page's rect, in VIEWPORT coordinates. Called from
   *  every measure, never from a frame. */
  fit: (rect: ScreenRect) => void;
  /** Paint one frame of section `index`'s entrance. */
  show: (index: number, pose: SheetPose) => void;
  /** Stop painting and leave the paint order. */
  hide: () => void;
  /** The flat plane's screen rect as three.js projects it, in viewport
   *  coordinates — the number the hand-off invariant is about. */
  screenRect: () => ScreenRect | null;
  /** Frames painted since mount. Must not move during a vertical run. */
  frames: () => number;
}

function curlOptions(): CurlMaterialOptions {
  return {
    tightness: look.curlTightness,
    origin: look.curlOrigin,
    originEdge: look.curlOriginEdge,
    paper: look.paperColor,
    lightA: { x: look.lightAX, y: look.lightAY, z: look.lightAZ, intensity: look.lightA },
    lightB: { x: look.lightBX, y: look.lightBY, z: look.lightBZ, intensity: look.lightB },
    roughness: look.paperRoughness,
    reflect: look.paperReflect,
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

export const SheetCanvas = forwardRef<SheetCanvasHandle, { captures: SheetTexture[][] }>(
  function SheetCanvas({ captures }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const gl = useRef<{
      renderer: WebGLRenderer;
      scene: Scene;
      camera: PerspectiveCamera;
      mesh: Mesh;
      material: CurlMaterial;
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
    /** The live page's width in CSS pixels, which is what picks the capture. */
    const pageWidthRef = useRef(0);
    /** The capture currently bound, by src — the index alone is not enough now
     *  that a resize can change which of a section's captures is the right one. */
    const boundSrcRef = useRef('');

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

      const material = createCurlMaterial(curlOptions());
      const blank = blankTexture();
      material.uniforms.uMap.value = blank;
      const mesh = new Mesh(new PlaneGeometry(1, 1, SEGMENTS_X, SEGMENTS_Y), material);
      scene.add(mesh);

      // A stand-in for the FLAT plane, kept out of the scene: `screenRect` has
      // to answer "where would this land at scale 1, uncurled" while the real
      // mesh is mid-entrance and neither.
      const probe = new Object3D();

      gl.current = { renderer, scene, camera, mesh, material, blank, probe };

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

      // The pointer is read from the WINDOW, not from the canvas: the canvas is
      // never a pointer target (see `portfolio.css`), so it would never hear.
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const onMove = (e: PointerEvent): void => {
        mouse.current.tx = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.current.ty = (e.clientY / window.innerHeight) * 2 - 1;
      };
      if (!reduced) window.addEventListener('pointermove', onMove, { passive: true });

      const off = subscribeLook(() => applyCurlOptions(material, curlOptions()));

      return () => {
        off();
        window.removeEventListener('resize', resize);
        window.removeEventListener('pointermove', onMove);
        mesh.geometry.dispose();
        material.dispose();
        blank.dispose();
        for (const t of textures.values()) t.dispose();
        textures.clear();
        renderer.dispose();
        gl.current = null;
      };
    }, []);

    /**
     * The capture for section `k` at the width the page is actually at — the
     * nearest of the ones the section ships, because a page's type is a fixed
     * size and its measure is not, so a capture taken at another width is a
     * different document rather than the same one at another scale.
     */
    const captureFor = (k: number): SheetTexture | null => {
      const list = capturesRef.current[k];
      if (!list || list.length === 0) return null;
      const want = pageWidthRef.current;
      return list.reduce((best, next) =>
        Math.abs(next.width - want) < Math.abs(best.width - want) ? next : best,
      );
    };

    /** The texture for a capture, kicked off the first time it is asked for.
     *  Never awaited: the entrance renders with whatever has decoded, and for
     *  the first 60% of it the sheet is a tube with very little texture to
     *  show. */
    const textureFor = (k: number): Texture | null => {
      const entry = captureFor(k);
      if (!entry) return null;
      const have = loaded.current.get(entry.src);
      if (have) return have;
      const tex = new TextureLoader().load(entry.src, () => {
        // A late arrival has to reach the screen, and it cannot wait for the
        // next scroll tick: a reader who has stopped mid-entrance would be
        // looking at blank paper until they moved again.
        if (!gl.current || boundSrcRef.current !== entry.src) return;
        gl.current.material.uniforms.uHasMap.value = 1;
        const last = lastRef.current;
        if (last && last.index === k) showRef.current(last.index, last.pose);
      });
      tex.colorSpace = NoColorSpace;
      // NO MIPMAPS. There is one capture per signed-off viewport, so the
      // texture is never minified — it is sampled one texel to one pixel — and
      // a mipmap chain under that is a levels-of-detail calculation that can
      // come back a hair above zero and blur every glyph on the page for it.
      tex.generateMipmaps = false;
      tex.minFilter = LinearFilter;
      tex.magFilter = LinearFilter;
      if (gl.current) tex.anisotropy = gl.current.renderer.capabilities.getMaxAnisotropy();
      loaded.current.set(entry.src, tex);
      return tex;
    };

    const fit = (rect: ScreenRect): void => {
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
      pageWidthRef.current = local.width;
      g.material.uniforms.uAspect.value = plane.aspect;
      // One CSS pixel of the PAGE, in the plane's uv. The hairline has to be
      // the same width as the page's inset ring, not the same fraction of a
      // plane that changes size with the viewport.
      g.material.uniforms.uHairline.value.set(1 / local.width, 1 / local.height);
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

      const capture = captureFor(index);
      if (boundSrcRef.current !== (capture?.src ?? '')) {
        boundSrcRef.current = capture?.src ?? '';
        const tex = textureFor(index);
        g.material.uniforms.uMap.value = tex ?? g.blank;
        g.material.uniforms.uHasMap.value = tex?.image ? 1 : 0;
      }

      const m = mouse.current;
      m.x += (m.tx - m.x) * look.mouseLerp;
      m.y += (m.ty - m.y) * look.mouseLerp;
      g.material.uniforms.uMouse.value.set(m.x, m.y);
      g.material.uniforms.uCurlAmount.value = pose.curl;

      g.mesh.scale.set(
        plane.width * pose.scale,
        plane.height * pose.scale,
        plane.height * pose.scale,
      );
      g.mesh.position.set(plane.x, plane.y + pose.y * plane.height, 0);
      g.mesh.rotation.z = (pose.rotationZ * Math.PI) / 180;

      canvas.style.visibility = '';
      g.renderer.render(g.scene, g.camera);
      framesRef.current++;
    };
    showRef.current = show;

    const hide = (): void => {
      lastRef.current = null;
      const canvas = canvasRef.current;
      if (canvas) canvas.style.visibility = 'hidden';
    };

    /** Where the FLAT plane lands on screen, as three.js projects it — the
     *  number the hand-off invariant is about, asked of the renderer rather
     *  than of the arithmetic that fed it. */
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

    useImperativeHandle(
      ref,
      (): SheetCanvasHandle => ({ fit, show, hide, screenRect, frames: () => framesRef.current }),
      // Every member closes over refs only, so the handle never has to change.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [],
    );

    return <canvas ref={canvasRef} className="pv-canvas" aria-hidden="true" />;
  },
);
