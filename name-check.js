// Multiple-choice name checker and course-style names. No network here: the caller passes `opsin`
// (name → { mol, message } or throws when offline), so this runs in Node with a fake.

// "A. 3-heptene", "(b) 2-methyl…", "c) …", "D: …", "1. …" → [{ label, name }]; blank lines skipped.
export function parseOptions(text){
  return String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l, i) => {
    const m = l.match(/^\(?([A-Ha-h]|[1-9])[).:]\s+(.+)$/);
    return m ? { label: m[1].toUpperCase(), name: m[2].trim() } : { label: String.fromCharCode(65 + i), name: l };
  });
}

const idOf = (OCL, m, flat) => { const c = m.getCompactCopy(); if (flat) c.stripStereoInformation(); return c.getIDCode(); };
const stereoCount = (OCL, m) => {
  const c = m.getCompactCopy(); c.ensureHelperArrays(OCL.Molecule.cHelperCIP);
  let n = 0;
  for (let a = 0; a < c.getAtoms(); a++) if ([1, 2].includes(c.getAtomCIPParity(a))) n++;
  for (let b = 0; b < c.getBonds(); b++) if ([1, 2].includes(c.getBondCIPParity(b))) n++;
  return n;
};

// Compare one parsed name with the drawing: 'same' | 'stereo' (same atoms and bonds, stereo differs) | 'different'
export function compare(OCL, drawn, parsed){
  if (idOf(OCL, drawn) === idOf(OCL, parsed)) return 'same';
  if (idOf(OCL, drawn, true) === idOf(OCL, parsed, true)) return 'stereo';
  return 'different';
}

// → [{ label, name, verdict: 'same'|'stereo'|'different'|'unread'|'offline', text }]
export async function checkOptions(OCL, drawn, text, opsin){
  const out = [];
  for (const o of parseOptions(text)){
    let r;
    try { r = await opsin(o.name); } catch { out.push({ ...o, verdict: 'offline', text: 'Couldn’t reach OPSIN (offline?), so this one wasn’t checked.' }); continue; }
    if (!r || !r.mol){ out.push({ ...o, verdict: 'unread', text: `OPSIN can’t read this name${r && r.message ? ': ' + r.message : ''}. A misspelt or impossible name is usually a wrong answer.` }); continue; }
    const v = compare(OCL, drawn, r.mol);
    let t;
    if (v === 'same') t = 'Matches your drawing, stereo included.';
    else if (v === 'stereo'){
      const sd = stereoCount(OCL, drawn), sn = stereoCount(OCL, r.mol);
      t = sd === 0 && sn > 0 ? 'Same atoms and bonds, but this name gives stereo (E/Z or R/S) that your drawing doesn’t show. Add wedges or set the C=C geometry to decide.'
        : sn === 0 && sd > 0 ? 'Same atoms and bonds, but the name leaves out the stereo your drawing has.'
        : 'Same atoms and bonds, but the stereo (E/Z or R/S) is different.';
    } else t = 'A different structure.';
    out.push({ ...o, verdict: v, text: t });
  }
  return out;
}

// ---------- course-style names ----------
// From the app's 2013 name, the older style many courses use: isopropyl / isobutyl / sec-butyl /
// isopentyl / neopentyl, alkene/alkyne/alcohol locant in front ("3-heptene", "2-butanol"), prefixes
// re-sorted alphabetically (iso counts, sec/tert and di/tri/tetra don't). Returns null when the name
// isn't a simple "prefixes + parent" name this can rewrite safely. The UI shows it only after OPSIN
// reads it back to the same structure.
const OLD = { 'propan-2-yl': 'isopropyl', '2-methylpropyl': 'isobutyl', 'butan-2-yl': 'sec-butyl', '3-methylbutyl': 'isopentyl', '2,2-dimethylpropyl': 'neopentyl' };
const SIMPLE = 'tert-butyl|sec-butyl|cyclopropyl|cyclobutyl|cyclopentyl|cyclohexyl|methylidene|ethylidene|propylidene|methyl|ethyl|propyl|butyl|pentyl|hexyl|heptyl|octyl|nonyl|decyl|ethenyl|phenyl|chloro|bromo|iodo|fluoro|nitro|hydroxy';
const MULT = { 2: 'di', 3: 'tri', 4: 'tetra' };
export function courseStyle(name){
  if (!name) return null;
  let s = name, stereo = '';
  const st = s.match(/^(\([^()]*\)-)/);
  if (st){ stereo = st[1]; s = s.slice(stereo.length); }
  const subs = [];
  const re = new RegExp(`^(\\d+(?:,\\d+)*)-(di|tri|tetra)?(\\((?:[^()]|\\([^()]*\\))*\\)|${SIMPLE})-?`);
  for (;;){
    const m = s.match(re);
    if (!m) break;
    let word = m[3];
    if (word.startsWith('(')){ const inner = word.slice(1, -1); if (!OLD[inner]) return null; word = OLD[inner]; }
    subs.push({ locs: m[1], mult: m[2] || '', word });
    s = s.slice(m[0].length);
  }
  // parent: one plain word with an optional ene/yne/ol locant
  let parent;
  let m;
  if ((m = s.match(/^([a-z]+?)a?-(\d+(?:,\d+)*)-(di|tri)?(ene|yne)$/))) parent = `${m[2]}-${m[1]}${m[3] && m[1].length ? 'a' : ''}${m[3] || ''}${m[4]}`;
  else if ((m = s.match(/^([a-z]+)an-(\d+)-ol$/))) parent = `${m[2]}-${m[1]}anol`;
  else if (/^[a-z]+$/.test(s) && s.length) parent = s;
  else return null;
  const key = (x) => x.word.replace(/^(sec|tert)-/, '');
  subs.sort((a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
  const pre = subs.map((x) => `${x.locs}-${x.mult}${x.word}`).join('-');
  const out = stereo + pre + (pre && /^\d/.test(parent) ? '-' : '') + parent;
  return out === name ? null : out;
}
