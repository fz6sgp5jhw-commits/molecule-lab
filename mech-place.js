// Collision avoidance for the mechanism drawings: puts a label (or picks a side for an arrow) where it
// doesn't sit on a bond, an atom symbol or another label. Pure geometry, no DOM (tested in Node).
//
// const pl = placer({ segs: [[p, q], …], boxes: [{ x, y, w, h }, …] })   bonds and things already drawn
// pl.place(anchor, dir, dist, w, h) → { x, y } (centre of a w × h box) and reserves it.
//   Tries `dir` first, then turns away from it in growing steps (and a little further out),
//   taking the first spot with clear room; else the spot with the most room.
// pl.clearance(box) → distance from a box to the nearest bond or reserved box (negative = overlap)
// pl.reserve(box), pl.reservePath(points, r)   mark space as used (e.g. a curved arrow's samples)
// pl.pickCurve([c1, c2], sample) → the index of the candidate whose sampled points have the most room

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const len = (a) => Math.hypot(a.x, a.y);

// distance from point p to segment ab
export function segDist(p, a, b){
  const d = sub(b, a), L2 = d.x * d.x + d.y * d.y;
  let t = L2 ? ((p.x - a.x) * d.x + (p.y - a.y) * d.y) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  return len(sub(p, { x: a.x + t * d.x, y: a.y + t * d.y }));
}
// distance from a box (centre x,y, size w,h) to a point (0 inside)
export function boxPointDist(b, p){
  const dx = Math.max(Math.abs(p.x - b.x) - b.w / 2, 0), dy = Math.max(Math.abs(p.y - b.y) - b.h / 2, 0);
  return Math.hypot(dx, dy);
}
// distance between two boxes (negative when they overlap: minus the smaller overlap depth)
export function boxBoxDist(a, b){
  const dx = Math.abs(a.x - b.x) - (a.w + b.w) / 2, dy = Math.abs(a.y - b.y) - (a.h + b.h) / 2;
  if (dx < 0 && dy < 0) return Math.max(dx, dy);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
}
// distance from a box to a segment (sampled; exact enough at drawing scale)
export function boxSegDist(b, p, q){
  let d = Infinity;
  const n = Math.max(2, Math.ceil(len(sub(q, p)) / 3));
  for (let i = 0; i <= n; i++){
    const t = i / n, pt = { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
    const inside = Math.abs(pt.x - b.x) <= b.w / 2 && Math.abs(pt.y - b.y) <= b.h / 2;
    d = Math.min(d, inside ? -1 : boxPointDist(b, pt));
  }
  return d;
}

export function placer({ segs = [], boxes = [] } = {}){
  const used = boxes.map((b) => ({ ...b }));
  const clearance = (b) => {
    let d = Infinity;
    for (const [p, q] of segs) d = Math.min(d, boxSegDist(b, p, q));
    for (const u of used) d = Math.min(d, boxBoxDist(b, u));
    return d;
  };
  const reserve = (b) => { used.push(b); return b; }; // the same object: a caller may still widen it
  const TURNS = [0, 25, -25, 50, -50, 75, -75, 105, -105, 135, -135, 180];
  function place(anchor, dir, dist, w, h, need = 2){
    const a0 = Math.atan2(dir.y, dir.x);
    let best = null, bc = -Infinity;
    for (const k of [1, 1.35, 1.75, 2.5, 3.5]){
      for (const t of TURNS){
        const r = a0 + t * Math.PI / 180;
        // the box's edge (not its centre) sits `dist` from the anchor, so wide labels move out further
        const ext = Math.abs(Math.cos(r)) * w / 2 + Math.abs(Math.sin(r)) * h / 2;
        const c = { x: anchor.x + Math.cos(r) * (dist * k + ext), y: anchor.y + Math.sin(r) * (dist * k + ext), w, h };
        const cl = clearance(c) - Math.abs(t) / 400 - (k - 1) * 2; // small preference for the asked spot
        if (clearance(c) >= need) return reserve(c);
        if (cl > bc){ bc = cl; best = c; }
      }
    }
    return reserve(best);
  }
  function pickCurve(cands, r = 4){
    let bi = 0, bc = -Infinity;
    cands.forEach((pts, i) => {
      let d = Infinity;
      for (const p of pts) for (const u of used) d = Math.min(d, boxPointDist(u, p) - r);
      if (d > bc){ bc = d; bi = i; }
    });
    return bi;
  }
  const reservePath = (pts, r = 4) => { for (const p of pts) used.push({ x: p.x, y: p.y, w: 2 * r, h: 2 * r }); };
  return { place, clearance, reserve, reservePath, pickCurve, used };
}

// estimated size of a text label in the drawing's units (VT323 is about 0.5 em wide per glyph, sub/superscripts count less)
export function textBox(t, size){
  let n = 0;
  for (const ch of String(t)) n += /[₀-₉⁰-⁹⁺⁻]/.test(ch) ? 0.6 : 1;
  return { w: Math.max(1, n) * size * 0.5 + 2, h: size * 0.75 };
}
