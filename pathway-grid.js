// "Which pathway wins?": the decision table (data/rules.json) laid out as a grid of substrate class ×
// reagent type, for one set of conditions. Every cell is a lookup in the same table predict() uses
// (lookupRule, plus the substrate flags read before the table), so the grid can't disagree with the
// predictions; tests/reactions.test.mjs runs predict() on each cell's example to prove it.
// Nothing chemical is written here except the examples (a typical substrate and reagent per cell).

import { lookupRule, flagStop, PATHWAYS } from './predict.js';

// rows: a substrate class (facts for the table, or flags that decide before it) + example substrates
// as a halide and as an alcohol (for the activator columns)
export const GRID_ROWS = [
  { id: 'methyl', label: 'Methyl', facts: { cls: 'methyl', ab: false }, ex: { halide: 'CBr', OH: 'CO' } },
  { id: '1', label: '1°', facts: { cls: '1', ab: false }, ex: { halide: 'CCCCBr', OH: 'CCCCO' } },
  { id: '1ab', label: '1° allylic / benzylic', facts: { cls: '1', ab: true }, ex: { halide: 'BrCc1ccccc1', OH: 'OCc1ccccc1' } },
  { id: '2', label: '2°', facts: { cls: '2', ab: false }, ex: { halide: 'CCC(C)Br', OH: 'CCC(C)O' } },
  { id: '2ab', label: '2° allylic / benzylic', facts: { cls: '2', ab: true }, ex: { halide: 'CC(Br)c1ccccc1', OH: 'CC(O)c1ccccc1' } },
  { id: '3', label: '3°', facts: { cls: '3', ab: false }, ex: { halide: 'CC(C)(C)Br', OH: 'CC(C)(C)O' } },
  { id: '3ab', label: '3° allylic / benzylic', facts: { cls: '3', ab: true }, ex: { halide: 'CC(C)(Br)c1ccccc1', OH: 'CC(C)(O)c1ccccc1' } },
  { id: 'neo', label: 'Neopentyl (1°)', flags: ['neopentyl'], ex: { halide: 'CC(C)(C)CBr', OH: 'CC(C)(C)CO' } },
  // an OH on an sp² carbon (phenol, enol) isn't a leaving group the app knows: no site at all
  { id: 'vinyl', label: 'Vinyl / aryl', flags: ['vinyl'], ohStop: 'no_site', ex: { halide: 'Brc1ccccc1', OH: 'Oc1ccccc1' } },
];

// columns: a reagent type. The first four take the chosen conditions; the activator columns (alcohol
// substrates) have fixed, typical conditions.
export const GRID_COLS = [
  { id: 'nuc', label: 'Strong Nu, weak base', short: 'Nu⁻, weak base', eg: 'I⁻ CN⁻ N₃⁻ RS⁻', box: 'nuc', reagent: 'NaCN', solvent: { usual: 'DMSO', protic: 'EtOH', aprotic: 'DMSO' } },
  { id: 'nucbase', label: 'Strong Nu, strong base', short: 'Nu⁻, strong base', eg: 'HO⁻ MeO⁻ EtO⁻', box: 'nucbase', reagent: 'NaOEt', solvent: { usual: 'EtOH', protic: 'EtOH', aprotic: 'THF' } },
  { id: 'bulky', label: 'Bulky strong base', short: 'Bulky base', eg: 'KOtBu, DBU', box: 'bulky', reagent: 'KOtBu', solvent: { usual: 'tBuOH', protic: 'tBuOH', aprotic: 'THF' } },
  { id: 'weak', label: 'Weak Nu, weak base', short: 'Weak Nu/base', eg: 'H₂O, ROH', box: 'weak', reagent: 'EtOH', solvent: { usual: 'EtOH', protic: 'EtOH', aprotic: 'DMSO' } },
  { id: 'hx', label: 'HX (alcohol)', short: 'HX', eg: 'alcohol + HBr, HCl, HI', box: 'activator', act: 'HX', reagent: 'HBr', lg: 'OH', fixed: { solvent: 'H2O', heat: false } },
  { id: 'pbr3', label: 'PBr₃ / SOCl₂ (alcohol)', short: 'PBr₃, SOCl₂', eg: 'alcohol + PBr₃ or SOCl₂/py', box: 'activator', act: 'PBr3', reagent: 'PBr3', lg: 'OH', fixed: { solvent: 'Et2O', heat: false } },
  { id: 'acid', label: 'H₂SO₄ / H₃PO₄ + heat (alcohol)', short: 'Acid + heat', eg: 'alcohol + H₂SO₄, H₃PO₄', box: 'activator', act: 'acid', reagent: 'H2SO4', lg: 'OH', fixed: { solvent: 'H2O', heat: true } },
];
export const SOLVENT_MODES = ['usual', 'protic', 'aprotic'];

// cond: { solvent: 'usual' | 'protic' | 'aprotic', heat: bool }. data: { rules, cat }
export function gridCell(row, col, cond, data){
  const { rules, cat } = data;
  const lg = col.lg || 'halide';
  const solventId = col.fixed ? col.fixed.solvent : col.solvent[cond.solvent];
  const heat = col.fixed ? col.fixed.heat : !!cond.heat;
  const solvent = cat.solvents.find((s) => s.id === solventId);
  const example = { smiles: row.ex[lg === 'OH' ? 'OH' : 'halide'], reagent: col.reagent, solvent: solventId, heat };
  const cell = { row: row.id, col: col.id, example, lamps: {}, reasons: [], tags: [], notCovered: null, noReaction: false };
  let stop = lg === 'OH' && row.ohStop ? { notCovered: row.ohStop } : row.flags ? flagStop(row.flags) : null;
  if (stop && stop.reason){ cell.reasons = [stop.reason]; cell.noReaction = true; }
  else if (stop) cell.notCovered = stop.notCovered;
  else {
    const facts = { lg, ...row.facts, box: col.box, act: col.act, solvent: solvent.type, heat };
    const rule = lookupRule(rules, facts);
    if (!rule) cell.notCovered = 'no_rule';
    else if (rule.notCovered){ cell.notCovered = rule.notCovered; cell.tags = rule.tags || []; }
    else { cell.lamps = { ...(rule.lamps || {}) }; cell.reasons = rule.reasons || []; cell.tags = rule.tags || []; cell.noReaction = !Object.keys(cell.lamps).length; }
  }
  for (const pw of PATHWAYS) if (!cell.lamps[pw]) cell.lamps[pw] = 'none';
  cell.major = PATHWAYS.filter((p) => cell.lamps[p] === 'major');
  cell.minor = PATHWAYS.filter((p) => cell.lamps[p] === 'minor');
  cell.competing = PATHWAYS.filter((p) => cell.lamps[p] === 'competing');
  cell.key = cell.notCovered ? 'nc:' + cell.notCovered : PATHWAYS.map((p) => cell.lamps[p]).join();
  return cell;
}

// the whole grid for one set of conditions; varies = the cell changes with the solvent or heat
export function buildGrid(cond, data){
  return GRID_ROWS.map((row) => ({ row, cells: GRID_COLS.map((col) => {
    const c = gridCell(row, col, cond, data);
    c.variants = col.fixed ? null : ['protic', 'aprotic'].flatMap((solvent) => [false, true].map((h) => ({ solvent, heat: h, cell: gridCell(row, col, { solvent, heat: h }, data) })));
    c.varies = !!c.variants && new Set(c.variants.map((v) => v.cell.key)).size > 1;
    return c;
  }) }));
}

// short text for a cell: "SN2", "E2 > SN2", "SN1 ≈ E1", "none", "not covered"
export function cellText(c){
  if (c.notCovered) return 'not covered';
  if (c.noReaction) return 'no reaction';
  const head = c.major.join(' + ');
  if (c.competing.length) return `${head} ≈ ${c.competing.join(', ')}`;
  if (c.minor.length) return `${head} > ${c.minor.join(', ')}`;
  return head;
}
