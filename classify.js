// Classify (worksheet Q6–Q8, "pick all that apply"): paste lines like `C=CC(C)(C)C >> H2SO4` and get one row
// per line with the addition engine's own answers (Markovnikov / anti-Markovnikov / stereospecific / intermediate).
// Every cell is read from predict()'s res.addition, the same object the Addition card shows: no second copy of rules.

import { predict, LAMPS } from './predict.js';
import { parseStep } from './reagents.js';

// one line → { substrate, reagentText } or { error }. Separators: ">>", "→", "->", or a tab.
export function parseLine(line){
  const t = String(line).trim();
  if (!t) return null;
  const m = t.match(/^(.+?)\s*(?:>>|→|->|\t)\s*(.+)$/);
  if (!m) return { error: 'write it as  SMILES >> reagent', text: t };
  return { substrate: m[1].trim(), reagentText: m[2].trim(), text: t };
}

// classify(OCL, text, data) → [{ line, smiles, mol, reagent, error | { addition, markovnikov, anti, stereospecific,
//   course, intermediate, regio, stereo, notCovered, major } }]. markovnikov/anti: 'Y' | 'N' | null (null = the
//   question doesn't apply: same group on both carbons, the C=C is cut, or not an addition).
export function classify(OCL, text, data){
  const rows = [];
  for (const raw of String(text).split(/\r?\n/)){
    const p = parseLine(raw);
    if (!p) continue;
    const row = { line: p.text };
    rows.push(row);
    if (p.error){ row.error = p.error; continue; }
    let mol;
    try { mol = OCL.Molecule.fromSmiles(p.substrate); } catch { mol = null; }
    if (!mol || !mol.getAllAtoms()){ row.error = `“${p.substrate}” isn’t a SMILES the app can read`; continue; }
    row.mol = mol; row.smiles = p.substrate;
    const st = parseStep(data.cat, p.reagentText);
    if (st.error){ row.error = st.error; continue; }
    row.reagent = st.reagent.label;
    let res;
    try { res = predict(OCL, mol, st.reagent, st, data); } catch (e) { row.error = 'the prediction failed: ' + e.message; continue; }
    const a = res.addition;
    row.notCovered = res.notCovered || null;
    if (!a){
      const pw = LAMPS.find((x) => res.lamps && res.lamps[x] === 'major');
      row.notAddition = pw || null;
      continue;
    }
    row.intermediate = a.intermediate; row.regio = a.regio; row.stereo = a.stereo;
    const applies = a.regio === 'markovnikov' || a.regio === 'anti-markovnikov';
    row.markovnikov = applies ? (a.regio === 'markovnikov' ? 'Y' : 'N') : null;
    row.anti = applies ? (a.regio === 'anti-markovnikov' ? 'Y' : 'N') : null;
    row.stereospecific = a.stereospecific === 'Y' ? 'Y' : 'N';
    row.course = (a.tags || []).includes('course');
    row.disagree = (a.tags || []).includes('disagree');
    const pr = res.pathways && res.pathways.Addition && res.pathways.Addition.products;
    row.major = pr && pr.length ? pr[0] : null;
  }
  return rows;
}
