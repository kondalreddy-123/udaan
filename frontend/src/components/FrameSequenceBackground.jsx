import React, { useEffect, useRef, useState } from 'react';

const pad3 = (n) => String(n).padStart(3, '0');

/**
 * Plays a numbered JPEG frame sequence as a full-bleed background.
 *
 * Frames are loaded lazily in a small ring around the playhead so the browser
 * never has to decode the whole sequence at once. When `animate` is false (or
 * the user prefers reduced motion) it shows the first frame as a still image.
 */
export default function FrameSequenceBackground({
  basePath = '/assets/clip1/ezgif-frame-',
  frameCount = 200,
  fps = 24,
  poster = '/assets/clip1/ezgif-frame-001.jpg',
  opacity = 0.8,
  animate = true,
  style
}) {
  const canvasRef = useRef(null);
  const framesRef = useRef(new Map());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let cancelled = false;
    let announced = false;
    const ctx = canvas.getContext('2d', { alpha: false });
    const frames = framesRef.current;
    const state = { frame: 1, running: false, timer: null, dpr: 1 };
    const reduceMotion =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const shouldAnimate = animate && !reduceMotion;

    const src = (n) =>
      `${basePath}${pad3(((n - 1 + frameCount) % frameCount) + 1)}.jpg`;

    const announceReady = () => {
      if (!cancelled && !announced) {
        announced = true;
        setReady(true);
      }
    };

    const load = (n) => {
      const key = ((n - 1 + frameCount) % frameCount) + 1;
      let rec = frames.get(key);
      if (rec) return rec;
      rec = { img: new Image(), ok: false };
      rec.img.onload = () => {
        rec.ok = true;
      };
      rec.img.onerror = () => {
        rec.ok = false;
      };
      rec.img.src = src(key);
      frames.set(key, rec);
      return rec;
    };

    const prime = (start, ahead = 14) => {
      for (let i = 0; i < ahead; i += 1) load(start + i);
      const keep = new Set();
      for (let i = -2; i < ahead + 2; i += 1) {
        keep.add(((start + i - 1 + frameCount) % frameCount) + 1);
      }
      frames.forEach((_, key) => {
        if (!keep.has(key)) frames.delete(key);
      });
    };

    const size = () => {
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      state.dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * state.dpr);
      canvas.height = Math.round(h * state.dpr);
      ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    };

    const draw = (img) => {
      if (!img || !img.naturalWidth) return false;
      const cw = canvas.width / state.dpr;
      const ch = canvas.height / state.dpr;
      const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      ctx.fillStyle = '#07080a';
      ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
      return true;
    };

    const tick = () => {
      if (!state.running || cancelled) return;
      const rec = frames.get(state.frame) || load(state.frame);
      if (rec.ok && draw(rec.img)) {
        announceReady();
        state.frame = (state.frame % frameCount) + 1;
      }
      prime(state.frame);
    };

    size();
    prime(1);

    if (!shouldAnimate) {
      const rec = load(1);
      const showStill = () => {
        if (rec.ok && !cancelled) {
          draw(rec.img);
          announceReady();
        }
      };
      if (rec.ok) showStill();
      else rec.img.addEventListener('load', showStill, { once: true });
    } else {
      state.running = true;
      state.timer = window.setInterval(tick, Math.round(1000 / fps));
    }

    const onResize = () => {
      size();
      const rec = frames.get(state.frame);
      if (rec && rec.ok) draw(rec.img);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelled = true;
      state.running = false;
      if (state.timer) window.clearInterval(state.timer);
      window.removeEventListener('resize', onResize);
      frames.clear();
    };
  }, [basePath, frameCount, fps, animate]);

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        background: '#07080a',
        ...style
      }}
    >
      {poster && (
        <img
          src={poster}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: ready ? 0 : opacity,
            transition: 'opacity 0.8s ease'
          }}
        />
      )}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          display: 'block',
          opacity: ready ? opacity : 0,
          transition: 'opacity 0.8s ease'
        }}
      />
    </div>
  );
}
