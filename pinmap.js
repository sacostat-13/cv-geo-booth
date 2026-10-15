/* The map on the phone: pan, zoom, tap to drop a pin.

   Equirectangular rather than the globe the big screen uses — a flat map is
   the one a thumb can reason about, and the inverse projection is two lines,
   which matters because every tap has to become a longitude and a latitude.

   Nothing here asks where anyone is. The pin is a mark someone chooses to
   make on a map; the copy around it has to keep saying so. It redraws on
   change rather than every frame, so it costs nothing while a visitor is
   reading. */
(function () {
  const SEA = '#0C0A14', LAND = '#352C50', EDGE = '#4A3F6B', GRID = '#221C34';
  const MINZ = 1, MAXZ = 12;

  function create(canvas, opts) {
    const o = Object.assign({ onChange: function () {} }, opts || {});
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, DPR = 1;
    let baseW = 0, baseH = 0;      // the whole world at zoom 1
    let z = 1, tx = 0, ty = 0;     // zoom and pan, in CSS pixels
    let pin = null;                // { lon, lat }

    function resize() {
      DPR = Math.min(2, window.devicePixelRatio || 1);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      baseW = W; baseH = W / 2;
      clamp();
      draw();
    }

    const project = (lon, lat) => [
      (lon + 180) / 360 * baseW * z + tx,
      (90 - lat) / 180 * baseH * z + ty,
    ];
    const unproject = (x, y) => [
      ((x - tx) / (baseW * z)) * 360 - 180,
      90 - ((y - ty) / (baseH * z)) * 180,
    ];

    /* Keep the world covering the viewport: panning off the edge of the earth
       into empty space reads as a broken app, not as a map. */
    function clamp() {
      const w = baseW * z, h = baseH * z;
      tx = w <= W ? (W - w) / 2 : Math.min(0, Math.max(W - w, tx));
      ty = h <= H ? (H - h) / 2 : Math.min(0, Math.max(H - h, ty));
    }

    function draw() {
      if (!W || !H) return;
      ctx.fillStyle = SEA;
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = GRID; ctx.lineWidth = 1; ctx.globalAlpha = .5;
      ctx.beginPath();
      for (let lat = -60; lat <= 60; lat += 30) {
        const a = project(-180, lat), b = project(180, lat);
        ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
      }
      for (let lon = -150; lon <= 150; lon += 30) {
        const a = project(lon, 85), b = project(lon, -85);
        ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
      }
      ctx.stroke(); ctx.globalAlpha = 1;

      // Drop points that land on the same pixel: at low zoom most of a ring is
      // sub-pixel detail nobody can see and every phone pays for.
      const step = z < 2 ? 3 : z < 4 ? 2 : 1;
      ctx.beginPath();
      for (const c of window.WORLD) {
        for (const ring of c.g) {
          for (let i = 0; i < ring.length; i += step) {
            const p = project(ring[i][0], ring[i][1]);
            if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
          }
          ctx.closePath();
        }
      }
      ctx.fillStyle = LAND; ctx.fill('evenodd');
      ctx.strokeStyle = EDGE; ctx.lineWidth = 0.8; ctx.stroke();

      if (pin) {
        const p = project(pin.lon, pin.lat);
        const r = 9;
        ctx.beginPath();
        ctx.arc(p[0], p[1] - r * 1.6, r * 2.1, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,138,91,.18)'; ctx.fill();
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]);
        ctx.quadraticCurveTo(p[0] - r, p[1] - r * 1.6, p[0], p[1] - r * 3.1);
        ctx.quadraticCurveTo(p[0] + r, p[1] - r * 1.6, p[0], p[1]);
        ctx.fillStyle = '#FF8A5B'; ctx.fill();
        ctx.beginPath();
        ctx.arc(p[0], p[1] - r * 1.9, r * 0.52, 0, Math.PI * 2);
        ctx.fillStyle = '#120F1C'; ctx.fill();
      }
    }

    function zoomAt(factor, px, py) {
      const before = unproject(px, py);
      z = Math.max(MINZ, Math.min(MAXZ, z * factor));
      const after = project(before[0], before[1]);
      tx += px - after[0];
      ty += py - after[1];
      clamp(); draw();
    }

    // ---- gestures ---------------------------------------------------------
    const points = new Map();
    let moved = false, lastMid = null, lastDist = 0;

    const rel = e => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };

    canvas.addEventListener('pointerdown', e => {
      canvas.setPointerCapture(e.pointerId);
      points.set(e.pointerId, rel(e));
      moved = false; lastMid = null; lastDist = 0;
    });

    canvas.addEventListener('pointermove', e => {
      if (!points.has(e.pointerId)) return;
      const prev = points.get(e.pointerId);
      const now = rel(e);
      points.set(e.pointerId, now);

      if (points.size === 1) {
        const dx = now[0] - prev[0], dy = now[1] - prev[1];
        if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
        tx += dx; ty += dy;
        clamp(); draw();
        return;
      }
      // Two fingers: zoom about the midpoint, and let the midpoint pan too.
      moved = true;
      const pts = [...points.values()];
      const mid = [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2];
      const dist = Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]);
      if (lastDist > 0 && dist > 0) {
        tx += mid[0] - lastMid[0]; ty += mid[1] - lastMid[1];
        zoomAt(dist / lastDist, mid[0], mid[1]);
      }
      lastMid = mid; lastDist = dist;
    });

    function release(e) {
      if (!points.has(e.pointerId)) return;
      const at = points.get(e.pointerId);
      points.delete(e.pointerId);
      if (points.size) { lastMid = null; lastDist = 0; return; }
      if (moved) return;
      const ll = unproject(at[0], at[1]);
      if (ll[1] > 85 || ll[1] < -85) return;      // off the top or bottom of the world
      pin = { lon: +ll[0].toFixed(3), lat: +ll[1].toFixed(3) };
      draw();
      o.onChange(pin);
    }
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const at = rel(e);
      zoomAt(e.deltaY < 0 ? 1.18 : 1 / 1.18, at[0], at[1]);
    }, { passive: false });

    window.addEventListener('resize', resize);
    resize();

    return {
      get pin() { return pin; },
      clear() { pin = null; draw(); o.onChange(null); },
      zoomBy(f) { zoomAt(f, W / 2, H / 2); },
      resize,
      draw,
    };
  }

  window.PinMap = { create };
})();
