// Rule-based electron density for the mechanism viewer: qualitative, no quantum mechanics.
// Every number here is a ranking device, never shown to the student. The rules are the textbook ones:
//   - formal charge: X⁻ is electron-rich, C⁺ is electron-poor (an onium O⁺/N⁺ pulls electrons from its neighbours);
//   - lone pairs: a neutral N, O, S or halogen is somewhat electron-rich;
//   - electronegativity (Pauling): a polar bond's electrons sit nearer the more electronegative atom;
//   - partial charges the frame states (δ+/δ−, e.g. at a transition state);
//   - inductive effect / hyperconjugation: an electron-poor atom drains its neighbours a little (one bond out),
//     and less two bonds out. So a carbocation's + spreads onto the carbons next to it.
// Bond "strength" follows the textbook bond-energy trend (C–H ≈ C–C ≈ C–O > C–Cl > C–Br > C–I; a bond to an
// onium O⁺ is weak because neutral water/alcohol leaves easily). It only sets how full a bond's cloud looks.
//
// density(graph) → { atoms: [{ score, level }], bonds: [{ weight, shift, polar, toB, size }] }
//   graph.atoms: [{ el: 'C' | 'Br' | …, charge: -1 | 0 | 1, delta: -1 | 0 | 1 }]
//   graph.bonds: [{ a, b, order: 1 | 2 | 3, state: 'full' | 'breaking' | 'forming' | 'partial' | 'pdouble' }]
//   level: 'rich' | 'rich1' | 'neutral' | 'poor1' | 'poor' (rich1/poor1 = somewhat)
//   weight: how full the bond's cloud is (0..~1.6); shift: 0..0.3 of the bond length toward the
//   electronegative end (toB: that end is b); polar: draw a dipole arrow; size: 0..1, how polar.

export const EN = { H: 2.20, B: 2.04, C: 2.55, N: 3.04, O: 3.44, F: 3.98, Si: 1.90, P: 2.19, S: 2.58, Cl: 3.16, Br: 2.96, I: 2.66 };
const HETERO = new Set(['N', 'O', 'S', 'F', 'Cl', 'Br', 'I', 'P']);
// relative bond strength to carbon (textbook bond-energy order, qualitative)
const TO_C = { H: 1, C: 1, O: 0.95, N: 0.92, F: 1, S: 0.8, P: 0.8, Cl: 0.8, Br: 0.66, I: 0.52 };
const STATE_W = { full: 1, breaking: 0.7, forming: 0.22, partial: 0.4, pdouble: 1.3 };

export function elementOf(label){ const m = /^[A-Z][a-z]?/.exec(String(label || '')); return m && (m[0] in EN) ? m[0] : (m && m[0][0] in EN ? m[0][0] : 'C'); }

export function levelOf(s){ return s >= 0.55 ? 'rich' : s >= 0.2 ? 'rich1' : s <= -0.55 ? 'poor' : s <= -0.2 ? 'poor1' : 'neutral'; }

export function density(graph){
  const { atoms, bonds } = graph;
  const n = atoms.length;
  const s = new Array(n).fill(0);
  const nb = Array.from({ length: n }, () => []);
  bonds.forEach((b) => { if (b.state !== 'forming'){ nb[b.a].push(b.b); nb[b.b].push(b.a); } });
  // 1. charge, stated δ, lone pairs
  atoms.forEach((x, i) => {
    const het = HETERO.has(x.el);
    if (x.charge < 0) s[i] += 1;
    else if (x.charge > 0) s[i] += het ? -0.35 : -1;
    else if (x.delta) s[i] += 0.45 * x.delta * -1; // delta +1 = δ+ (poor), −1 = δ− (rich)
    else if (het && x.el !== 'P') s[i] += 0.3;
  });
  // 2. bond polarity (electronegativity), and polar bonds the frame states with opposite δ/charges
  const out = bonds.map((b) => {
    const A = atoms[b.a], B = atoms[b.b];
    const d = (EN[B.el] ?? 2.55) - (EN[A.el] ?? 2.55);
    const pa = A.charge > 0 || A.delta > 0, pb = B.charge > 0 || B.delta > 0;
    const ra = A.charge < 0 || A.delta < 0, rb = B.charge < 0 || B.delta < 0;
    const stated = (pa && rb) ? 1 : (pb && ra) ? -1 : 0; // +1: electrons toward b
    const isCH = (A.el === 'H' && B.el === 'C') || (A.el === 'C' && B.el === 'H');
    let size = isCH ? 0 : Math.min(1, Math.abs(d) / 1.0);
    let toB = d > 0;
    // the frame's own δ+/δ− (or charges) on the two ends decide the direction (e.g. C–I, drawn δ+ C–I δ−)
    if (stated){ toB = stated > 0; size = Math.max(toB === d > 0 ? size : 0, 0.35); }
    const w = STATE_W[b.state] ?? 1;
    const polar = (stated !== 0 || size >= 0.38) && b.state !== 'forming';
    if (!stated && size > 0){ const p = 0.3 * size * Math.min(1, w); s[toB ? b.b : b.a] += p; s[toB ? b.a : b.b] -= p; }
    // fullness of the cloud: order, state, and how strong this kind of bond is
    let strength = 1;
    const other = A.el === 'C' ? B : B.el === 'C' ? A : null;
    if (other) strength = TO_C[other.el] ?? 0.85;
    if ((A.charge > 0 && HETERO.has(A.el)) || (B.charge > 0 && HETERO.has(B.el))) strength = Math.min(strength, 0.55);
    const order = b.state === 'pdouble' ? 1 : Math.max(1, Math.min(3, b.order || 1));
    const weight = strength * w * (1 + 0.45 * (order - 1));
    return { weight, shift: size ? Math.min(0.3, 0.08 + 0.22 * size) : 0, polar, toB, size };
  });
  // a formal + wins over bond polarity: an onium O⁺ (OH₂⁺, O⁺–PBr₂) is still short of electrons overall
  atoms.forEach((x, i) => { if (x.charge > 0) s[i] = Math.min(s[i], x.el === 'C' ? -1 : -0.4); });
  // 3. inductive effect / hyperconjugation: electron-poor atoms drain their neighbours (1 and 2 bonds out)
  const base = s.slice();
  base.forEach((v, i) => {
    if (v > -0.3) return;
    const seen = new Set([i]);
    // only carbons (and H's) are drained: an electronegative neighbour keeps its electrons
    const soft = (j) => atoms[j].el === 'C' || atoms[j].el === 'H';
    for (const j of nb[i]){ if (!seen.has(j)){ seen.add(j); if (soft(j)) s[j] += 0.35 * v; } }
    for (const j of nb[i]) if (soft(j)) for (const k of nb[j]) if (!seen.has(k)){ seen.add(k); if (soft(k)) s[k] += 0.12 * v; }
  });
  return { atoms: s.map((v) => ({ score: Math.max(-1, Math.min(1, v)), level: levelOf(v) })), bonds: out };
}
