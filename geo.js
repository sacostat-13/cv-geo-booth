/* Projections, country geometry helpers and deterministic pin placement. */
(function () {
  const DEG = Math.PI / 180;
  const byCode = {};
  for (const w of window.WORLD) byCode[w.c] = w;

  // ---- Equal Earth (flat map) --------------------------------------------
  const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, S3 = Math.sqrt(3);
  function equalEarth(lon, lat) {
    const t = Math.asin(Math.min(1, Math.max(-1, (S3 / 2) * Math.sin(lat * DEG))));
    const t2 = t * t, t6 = t2 * t2 * t2;
    const den = A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2);
    return [(2 * S3 * lon * DEG * Math.cos(t)) / (3 * den), t * (A1 + A2 * t2 + t6 * (A3 + A4 * t2))];
  }
  const EE_HALF_W = equalEarth(180, 0)[0];
  const EE_HALF_H = equalEarth(0, 90)[1];

  // ---- Orthographic (globe) ----------------------------------------------
  function orthoVisible(lon, lat, rotLon, rotLat) {
    const p = lat * DEG, l = (lon - rotLon) * DEG, p0 = rotLat * DEG;
    return Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l);
  }
  function ortho(lon, lat, rotLon, rotLat) {
    const p = lat * DEG, l = (lon - rotLon) * DEG, p0 = rotLat * DEG;
    return [Math.cos(p) * Math.sin(l), Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l)];
  }
  // Walk a segment that crosses the horizon and return the point on the limb.
  function limbPoint(a, b, rotLon, rotLat) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 18; i++) {
      const m = (lo + hi) / 2;
      const lon = a[0] + (b[0] - a[0]) * m, lat = a[1] + (b[1] - a[1]) * m;
      if (orthoVisible(lon, lat, rotLon, rotLat) >= 0) lo = m; else hi = m;
    }
    const m = (lo + hi) / 2;
    return [a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m];
  }

  /* A camera turns lon/lat into canvas pixels for whichever projection is live. */
  function makeCamera(mode, w, h, rotLon, rotLat, zoom) {
    if (mode === 'map') {
      // Slightly left of centre so the detail card on the right does not sit over Asia.
      const pad = 0.9;
      const scale = Math.min((w * pad) / (EE_HALF_W * 2), (h * pad) / (EE_HALF_H * 2)) * zoom;
      const cx = w * 0.46, cy = h * 0.49;
      return {
        mode: 'map', scale, radius: scale * EE_HALF_H,
        project(lon, lat) { const p = equalEarth(lon, lat); return [cx + p[0] * scale, cy - p[1] * scale]; },
        visible() { return true; },
      };
    }
    const r = Math.min(w, h) * 0.46 * zoom;
    const cx = w / 2, cy = h / 2;
    return {
      mode: 'globe', scale: r, radius: r, rotLon, rotLat,
      project(lon, lat) { const p = ortho(lon, lat, rotLon, rotLat); return [cx + p[0] * r, cy - p[1] * r]; },
      visible(lon, lat) { return orthoVisible(lon, lat, rotLon, rotLat) >= 0; },
      center: [cx, cy],
    };
  }

  /* Trace one ring, splitting it where it disappears behind the globe. */
  function tracePath(ctx, ring, cam) {
    if (cam.mode === 'map') {
      let started = false, prevX = null;
      for (const pt of ring) {
        const p = cam.project(pt[0], pt[1]);
        // Equal Earth is continuous; guard against antimeridian spikes anyway.
        if (started && prevX !== null && Math.abs(p[0] - prevX) > cam.scale * 3) { ctx.moveTo(p[0], p[1]); }
        else if (!started) { ctx.moveTo(p[0], p[1]); started = true; }
        else ctx.lineTo(p[0], p[1]);
        prevX = p[0];
      }
      ctx.closePath();
      return;
    }
    const { rotLon, rotLat } = cam;
    let run = [];
    const runs = [];
    for (let i = 0; i < ring.length; i++) {
      const cur = ring[i], prev = ring[(i - 1 + ring.length) % ring.length];
      const vis = orthoVisible(cur[0], cur[1], rotLon, rotLat) >= 0;
      const prevVis = orthoVisible(prev[0], prev[1], rotLon, rotLat) >= 0;
      if (vis && !prevVis && i > 0) run.push(limbPoint(cur, prev, rotLon, rotLat));
      if (vis) run.push(cur);
      if (!vis && prevVis) { run.push(limbPoint(prev, cur, rotLon, rotLat)); runs.push(run); run = []; }
    }
    if (run.length) runs.push(run);
    for (const r of runs) {
      if (r.length < 2) continue;
      r.forEach((pt, i) => {
        const p = cam.project(pt[0], pt[1]);
        if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
      });
      ctx.closePath();
    }
  }

  // ---- point in country ---------------------------------------------------
  function pointInRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function bbox(rings) {
    let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
    for (const r of rings) for (const p of r) {
      if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
      if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
    }
    return [x0, y0, x1, y1];
  }

  // Deterministic PRNG so a pin keeps its spot across reloads.
  function seeded(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return function () { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
  }

  /* Find a spot inside the country that is as far as possible from the pins
     already there, so pins spread over the landmass instead of stacking. */
  function placePin(code, seedKey, existing) {
    const c = byCode[code];
    if (!c) return null;
    const rings = c.g;
    const [x0, y0, x1, y1] = bbox(rings);
    const rnd = seeded(seedKey);
    let best = null, bestScore = -1;
    const tries = c.tiny ? 40 : 220;
    for (let i = 0; i < tries; i++) {
      const x = x0 + rnd() * (x1 - x0);
      const y = y0 + rnd() * (y1 - y0);
      let inside = false;
      for (const r of rings) if (pointInRing(x, y, r)) { inside = true; break; }
      if (!inside) continue;
      let near = Infinity;
      for (const p of existing) {
        const d = (p[0] - x) * (p[0] - x) + (p[1] - y) * (p[1] - y);
        if (d < near) near = d;
      }
      if (near > bestScore) { bestScore = near; best = [+x.toFixed(3), +y.toFixed(3)]; }
      if (existing.length === 0 && inside) break;
    }
    return best || c.k.slice();
  }

  window.Geo = { byCode, makeCamera, tracePath, placePin, equalEarth, EE_HALF_W, EE_HALF_H };
})();
