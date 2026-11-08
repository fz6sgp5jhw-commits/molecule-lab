// Node-only checks for the mechanism viewer's rule-based parts: electron density (density.js), label
// placement (mech-place.js) and the template/orbital data. Prints failures only, one line each.
import { readFileSync } from 'node:fs';
import { density, elementOf } from '../density.js';
import { placer, textBox, boxSegDist, boxBoxDist } from '../mech-place.js';
import { TEMPLATES, PRELUDES } from '../mech-templates.js';
import { LAYERS } from '../mech-view.js';

let fails = 0, n = 0;
const ok = (c, label) => { n++; if (!c){ fails++; console.log('FAIL ' + label); } };
const A = (el, charge = 0, delta = 0) => ({ el, charge, delta });
const B = (a, b, state = 'full', order = 1) => ({ a, b, state, order });
const rank = { poor: 0, poor1: 1, neutral: 2, rich1: 3, rich: 4 };

// ---- SN2 start: CH3–CH2–CH(δ+)(CH3)–Br(δ−) with I⁻ nearby ----
{
  const g = { atoms: [A('C'), A('C'), A('C', 0, 1), A('C'), A('Br', 0, -1), A('I', -1)], bonds: [B(0, 1), B(1, 2), B(2, 3), B(2, 4)] };
  const d = density(g);
  ok(d.atoms[5].level === 'rich', `I⁻ is electron-rich (got ${d.atoms[5].level})`);
  ok(rank[d.atoms[2].level] <= 1, `Cα (δ+) is electron-poor (got ${d.atoms[2].level})`);
  ok(rank[d.atoms[4].level] >= 3, `Br (δ−) is electron-rich (got ${d.atoms[4].level})`);
  ok(d.atoms[0].level === 'neutral', `a far carbon stays neutral (got ${d.atoms[0].level})`);
  const cc = d.bonds[0], cbr = d.bonds[3];
  ok(cbr.weight < cc.weight, `C–Br cloud thinner than C–C (${cbr.weight} vs ${cc.weight})`);
  ok(cbr.polar && cbr.toB && cbr.shift > 0, 'C–Br is polar, shifted toward Br, with a dipole');
  ok(!cc.polar && cc.shift === 0, 'C–C is even: no shift, no dipole');
}
// ---- bond strength order (textbook bond energies): C–H ≈ C–C > C–Cl > C–Br > C–I ----
{
  const w = (x) => density({ atoms: [A('C'), A(x)], bonds: [B(0, 1)] }).bonds[0].weight;
  ok(w('H') === w('C') && w('C') > w('Cl') && w('Cl') > w('Br') && w('Br') > w('I'), `bond fullness C–H = C–C > C–Cl > C–Br > C–I (${['H', 'C', 'Cl', 'Br', 'I'].map(w).join(', ')})`);
  ok(!density({ atoms: [A('C'), A('H')], bonds: [B(0, 1)] }).bonds[0].polar, 'C–H is not drawn as polar');
  // C–I barely differs in electronegativity, but drawn δ+ C–I δ− (textbook convention) it gets a small dipole
  const ci = density({ atoms: [A('C', 0, 1), A('I', 0, -1)], bonds: [B(0, 1)] }).bonds[0];
  ok(ci.polar && ci.toB, 'C–I drawn with δ labels: dipole toward I');
}
// ---- a breaking bond thins, a forming one grows ----
{
  const w = (state, order = 1) => density({ atoms: [A('C'), A('C')], bonds: [B(0, 1, state, order)] }).bonds[0].weight;
  ok(w('forming') < w('partial') && w('partial') < w('breaking') && w('breaking') < w('full'), 'forming < partial < breaking < full');
  ok(w('full', 2) > w('full') && w('pdouble') > w('full'), 'double bonds and half-formed π look fuller than a single bond');
}
// ---- carbocation: + spreads to the neighbours (hyperconjugation), Br⁻ that left is fully rich ----
{
  const g = { atoms: [A('C'), A('C', 1), A('C'), A('C'), A('Br', -1)], bonds: [B(0, 1), B(1, 2), B(2, 3)] };
  const d = density(g);
  ok(d.atoms[1].level === 'poor', 'C⁺ is electron-poor');
  ok(d.atoms[0].level === 'poor1' && d.atoms[2].level === 'poor1', `the carbons on C⁺ share some of the + (got ${d.atoms[0].level}, ${d.atoms[2].level})`);
  ok(d.atoms[3].score < 0 && d.atoms[3].score > d.atoms[2].score, 'two bonds out: a little less');
  ok(d.atoms[4].level === 'rich', 'Br⁻ after leaving is electron-rich');
}
// ---- alcohol and oxonium ----
{
  const alc = density({ atoms: [A('C'), A('O')], bonds: [B(0, 1)] });
  ok(rank[alc.atoms[1].level] >= 3 && alc.bonds[0].polar && alc.bonds[0].toB, 'neutral O (lone pairs) is rich; C–O polar toward O');
  const ox = density({ atoms: [A('C'), A('C'), A('O', 1)], bonds: [B(0, 1), B(1, 2)] });
  ok(rank[ox.atoms[2].level] <= 1, `O⁺ (OH₂⁺) is not drawn electron-rich (got ${ox.atoms[2].level})`);
  ok(rank[ox.atoms[1].level] <= 1, 'the carbon on O⁺ is electron-poor');
  ok(ox.bonds[1].weight < alc.bonds[0].weight, 'C–OH₂⁺ is weaker than C–OH (water leaves easily)');
}
ok(elementOf('OSO₃H') === 'O' && elementOf('Br') === 'Br' && elementOf('Cl') === 'Cl' && elementOf('I') === 'I', 'element from a label');

// ---- placement: labels go to free space ----
{
  const segs = [[{ x: 0, y: 0 }, { x: 42, y: 0 }], [{ x: 0, y: 0 }, { x: -21, y: 36 }], [{ x: 0, y: 0 }, { x: -21, y: -36 }]];
  const pl = placer({ segs });
  const tb = textBox('δ+', 18);
  const a = pl.place({ x: 0, y: 0 }, { x: 1, y: 0 }, 10, tb.w, tb.h); // asked to sit on the bond: must move off it
  ok(segs.every(([p, q]) => boxSegDist(a, p, q) >= 2), 'a label asked to sit on a bond is moved off it');
  const b = pl.place({ x: 0, y: 0 }, { x: 1, y: 0 }, 10, tb.w, tb.h);
  ok(boxBoxDist(a, b) >= 0, 'a second label at the same atom does not overlap the first');
  ok(textBox('OSO₃H', 20).w > textBox('O', 20).w, 'longer labels are wider');
}

// ---- template data ----
{
  const texts = JSON.parse(readFileSync(new URL('../data/mech-text.json', import.meta.url)));
  const KINDS = new Set(['sigmaStar', 'sigma', 'p', 'hyper', 'piForm', 'pi']);
  const frames = [...Object.values(TEMPLATES).flatMap((t) => t.frames), ...Object.values(PRELUDES).flat()];
  for (const f of frames){
    ok(!('clouds' in f), 'no frame keeps the old hand-set clouds');
    for (const o of f.orbitals || []){
      ok(KINDS.has(o.k), `orbital kind ${o.k}`);
      const cap = o.cap || (['sigmaStar', 'hyper', 'piForm', 'pi'].includes(o.k) ? o.k : o.faces ? 'faces' : null);
      if (cap) ok(texts.orbitals[cap], `caption text for ${cap}`);
    }
  }
  const has = (pw, test) => TEMPLATES[pw].frames.some((f) => (f.orbitals || []).some(test));
  ok(has('SN2', (o) => o.k === 'sigmaStar'), 'SN2: σ* behind C–LG');
  ok(has('SN1', (o) => o.k === 'p' && o.faces), 'SN1: Nu at either face of the empty p');
  ok(has('SN1', (o) => o.k === 'hyper'), 'SN1: hyperconjugation on the cation');
  ok(has('SN1', (o) => o.k === 'sigma' && o.cap === 'sigmaShift'), 'SN1: the shifting σ bond');
  ok(has('E2', (o) => o.k === 'sigma') && has('E2', (o) => o.k === 'piForm') && has('E2', (o) => o.k === 'pi'), 'E2: σ C–H/σ*, π forming, π');
  ok(has('E1', (o) => o.k === 'piForm') && has('E1', (o) => o.k === 'pi'), 'E1: p orbitals forming π');
  ok(LAYERS.every((k) => texts.ui.layers[k]), 'every layer has a checkbox label');
}

console.log(fails ? `${fails} of ${n} checks failed` : `mech-logic: ${n} checks passed`);
process.exit(fails ? 1 : 0);
