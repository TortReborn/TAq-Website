'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SkinViewer } from 'skinview3d';
import type { ArmModel } from '@/lib/uniform';

interface Props {
  /** Skin PNG URL. Same-origin or CORS-enabled; null shows nothing. */
  skinUrl: string | null;
  model: ArmModel;
  width: number;
  height: number;
  onStateChange?: (state: 'loading' | 'ready' | 'failed') => void;
}

/**
 * walking: walk cycle + slow auto-spin (the default; shows sleeves and back
 *          without touching anything)
 * paused:  frozen mid-stride, wherever it was
 * still:   idle pose facing the camera, arms down — the "skin site" view,
 *          for orbiting by hand
 */
type Mode = 'walking' | 'paused' | 'still';

/**
 * Spinnable 3D player model (TAQ-89 uniform preview), on skinview3d.
 * Drag to orbit, wheel to zoom. skinview3d carries three.js, so it is
 * imported on first mount rather than on every profile visit.
 */
export default function SkinViewer3D({ skinUrl, model, width, height, onStateChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<SkinViewer | null>(null);
  const [libError, setLibError] = useState(false);
  const [mode, setMode] = useState<Mode>('walking');

  const applyMode = useCallback(async (next: Mode) => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const sv = await import('skinview3d');
    if (viewer.disposed) return;
    switch (next) {
      case 'walking': {
        if (viewer.animation) {
          viewer.animation.paused = false;
        } else {
          const walk = new sv.WalkingAnimation();
          walk.speed = 0.6;
          viewer.animation = walk;
        }
        viewer.autoRotate = true;
        break;
      }
      case 'paused': {
        if (viewer.animation) viewer.animation.paused = true;
        viewer.autoRotate = false;
        break;
      }
      case 'still': {
        viewer.animation = null;              // also resets the joints
        viewer.autoRotate = false;
        viewer.playerWrapper.rotation.y = 0;  // face the camera
        viewer.resetCameraPose();
        break;
      }
    }
  }, []);

  // Build the viewer once, tear it down on unmount.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    import('skinview3d').then(sv => {
      if (disposed) return;
      const walk = new sv.WalkingAnimation();
      walk.speed = 0.6;
      const viewer = new sv.SkinViewer({
        canvas,
        width,
        height,
        zoom: 0.85,
        animation: walk,
      });
      viewer.autoRotate = true;
      viewer.autoRotateSpeed = 0.6;
      viewer.controls.enablePan = false;
      viewerRef.current = viewer;
    }).catch(() => setLibError(true));
    return () => {
      disposed = true;
      viewerRef.current?.dispose();
      viewerRef.current = null;
    };
    // width/height are fixed for the modal's lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (Re)load the skin whenever the URL or arm model changes. The viewer may
  // still be importing on the first pass; the poll below catches that.
  useEffect(() => {
    if (!skinUrl) return;
    let cancelled = false;
    onStateChange?.('loading');
    const load = async () => {
      let tries = 0;
      while (!viewerRef.current && !libError && tries++ < 100) {
        await new Promise(r => setTimeout(r, 50));
        if (cancelled) return;
      }
      const viewer = viewerRef.current;
      if (!viewer) { onStateChange?.('failed'); return; }
      try {
        await viewer.loadSkin(skinUrl, { model: model === 'slim' ? 'slim' : 'default' });
        if (!cancelled) onStateChange?.('ready');
      } catch {
        if (!cancelled) onStateChange?.('failed');
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [skinUrl, model, libError, onStateChange]);

  const select = (next: Mode) => { setMode(next); void applyMode(next); };

  if (libError) {
    return <div className="uniform-status" style={{ color: '#fca5a5' }}>3D preview failed to load.</div>;
  }
  return (
    <>
      <canvas ref={canvasRef} className="uniform-viewer" style={{ width, height }} />
      <div className="uniform-viewer-controls" role="group" aria-label="Preview controls">
        <button
          type="button"
          onClick={() => select(mode === 'walking' ? 'paused' : 'walking')}
          aria-label={mode === 'walking' ? 'Pause' : 'Play'}
          title={mode === 'walking' ? 'Pause' : 'Play'}
        >
          {mode === 'walking' ? '❚❚' : '▶'}
        </button>
        <button
          type="button"
          onClick={() => select('still')}
          className={mode === 'still' ? 'active' : ''}
          title="Reset pose: facing forward, arms down"
        >
          Reset
        </button>
      </div>
    </>
  );
}
