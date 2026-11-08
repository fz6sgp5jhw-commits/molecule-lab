import * as OCL from '../openchemlib.js';
import { findChairRings, buildChairs } from '../chair.js';
OCL.Resources.registerFromNodejs(new URL('../resources.json', import.meta.url).pathname);
const cases = {
  cyclohexane: 'C1CCCCC1',
  methylcyclohexane: 'CC1CCCCC1',
  'trans-1,2-dimethyl': 'C[C@@H]1CCCC[C@H]1C',
  'cis-1,2-dimethyl': 'C[C@@H]1CCCC[C@@H]1C',
  'trans-1,4-dimethyl': 'C[C@H]1CC[C@@H](C)CC1',
  'cis-1,4-dimethyl': 'C[C@H]1CC[C@H](C)CC1',
  'tert-butylcyclohexane': 'CC(C)(C)C1CCCCC1',
  'cyclohexanol': 'OC1CCCCC1',
  'menthol (1R,2S,5R)': 'CC(C)[C@@H]1CC[C@@H](C)C[C@H]1O',
  'beta-D-glucopyranose': 'OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O',
  'trans-decalin': 'C1CC[C@H]2CCCC[C@@H]2C1',
  'cyclohexanone': 'O=C1CCCCC1',
  'piperidine': 'C1CCNCC1',
};
for (const [name, smi] of Object.entries(cases)){
  const mol = OCL.Molecule.fromSmiles(smi);
  const rings = findChairRings(OCL, mol);
  if (!rings.length){ console.log(name, 'NO RING'); continue; }
  const t0 = Date.now();
  const r = buildChairs(OCL, mol, rings[0]);
  if (r.error){ console.log(name, r.error); continue; }
  const desc = r.chairs.map(c => {
    const heavy = c.subs.filter(s => !s.isH).map(s => `${s.group}@${s.ringPos}:${s.axial ? 'ax' : 'eq'}/${s.up ? 'up' : 'dn'}`).join(' ');
    const hs = c.subs.filter(s => s.isH); const hax = hs.filter(s => s.axial).length;
    return `${c.label}${c.isChair ? '' : '(NOT CHAIR)'} E=${c.energy.toFixed(2)} [${heavy}] H ax/eq ${hax}/${hs.length - hax}`;
  });
  const dE = r.chairs.length === 2 ? (r.chairs[1].energy - r.chairs[0].energy).toFixed(2) : '-';
  console.log(`${name.padEnd(24)} flip=${r.canFlip} dE(B-A)=${dE}  ${Date.now() - t0}ms\n   ${desc.join('\n   ')}`);
}
