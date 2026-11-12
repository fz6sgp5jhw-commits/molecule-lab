# Ch 7 worksheet: app gaps and plan

Audit date 2026-11-11. Every Ch 7 worksheet problem was run through the engine as it is today (`predict.js` / `reactivity.js` / `namer.js` / `chair.js`, at commit `c539c5b`) and compared with Peter's answer key.

For stereo E2 cases, an independent 3D check was also run. It used OpenChemLib conformers plus `buildChairs`, found the β‑H at 180° from the leaving group, and built the alkene from that shape. That check agreed with the key on **every** case: Q4b, 5, 9i, 9j, 9k, 10d and 13c.

Problem-by-problem results are in `ch7-study-guide.md`.

**Scorecard (about 40 checkable answers):**
- about 28 ✅;
- 4 ❌ from **one bug** (P0‑1);
- 3 ❌ / ⚠️ from **ring E2 regiochemistry** (P0‑2);
- the rest are missing features (no Newman view, no stability comparison, acid-mode ranking, reverse synthesis).

---

## P0: wrong answers shown confidently (fix first; CLAUDE.md "report mistakes, then fix the cause")

### P0‑1 `buildProduct` makes the wrong bond double after a bond is removed: **FIXED 2026‑11‑11**
- **Done:** a `bondBetween()` scan in `reactivity.js` replaces `getBond()` inside `buildProduct`'s edits. Seed cases W7‑9l and W7‑10a were added, plus a check on every single-step E1/E2 product that it has exactly one new C=C. Both fail on the old code.
- **Symptom:**
  - 2,2‑dimethylcyclopentan‑1‑ol + H₂SO₄ gives the E1 "major" product "1,2‑dimethylcyclopentane", C₇H₁₄, which has no C=C.
  - The same happens with 2,2‑dimethylcyclohexanol.
  - This hits worksheet Q9l, Q10a and Q13a: the textbook methyl-shift-in-a-ring problem.
- **Cause:**
  - `reactivity.js` `buildProduct` calls `m.deleteBond(...)` for `removeBonds`, which renumbers the bond table.
  - It then calls `m.getBond(a, b)` for `setOrder`. But `getBond` reads OpenChemLib's **cached neighbour arrays**, which are now stale, so it returns the old index.
  - Here that old index belongs to the C–O bond, which is deleted a moment later, taking the "double bond" with it.
  - Reproduced in isolation: after `deleteBond(1‑0)`, `getBond(1,6)` returns 6, which is now bond 6‑7.
  - The acyclic case (3,3‑dimethylbutan‑2‑ol) only works because the numbering happens to line up.
- **Fix (whole class):**
  - Call `m.ensureHelperArrays(Molecule.cHelperNeighbours)` after every structural edit in `buildProduct`, or look bonds up with a small scan helper that doesn't use the cache.
  - Grep for other `getBond` calls after `deleteBond`/`addBond`.
  - Add the OpenChemLib fact to CLAUDE.md.
  - Add a guard: every E1/E2 product must have exactly one C=C more than the substrate (otherwise drop it and log it).
- **Tests (seed-cases.json):**
  - 2,2‑dimethylcyclopentanol / H₂SO₄ / heat → 1,2‑dimethylcyclopentene;
  - 2,2‑dimethylcyclohexanol → 1,2‑dimethylcyclohexene;
  - a ring-expansion case with a removed bond.

### P0‑2 Ring E2 ignores trans-diaxial geometry: **FIXED 2026‑11‑11**
- **Done:**
  - `ringAntiCheck()` in `predict.js` builds both chairs with `buildChairs`. A β ring carbon is allowed only if, in some chair, the LG is axial and that carbon has an axial H on the opposite face.
  - If one chair relaxes out of the chair shape (too strained), it is derived by swapping axial and equatorial.
  - Exocyclic β-carbons are always allowed (free rotation). Zaitsev/Hofmann then ranks the allowed alkenes.
  - A green note shows both chairs with their energies. The old warning remains only for 2+ ring stereocentres drawn without wedges, or for fused/bridged rings.
  - Ring C=C bonds no longer get a spurious E/Z flag (part of P0‑4).
  - Seed cases: W7‑9i, 9j, 9k, 10d, 13c and ring-e2-undefined, plus a UI check on 9j. Menthyl/neomenthyl is still to add.
- **Symptoms:**
  - Q9j (trans‑1‑Br‑2‑tBu): the app says 1‑tBu‑cyclohexene; the key and 3D say 3‑tBu.
  - Q9k: the app gives the Zaitsev 1‑methyl alkene; the key and 3D give 5‑tBu‑3‑methylcyclohexene.
  - Q10d: the app says "competing"; the key and 3D pick one.
  - Q13c is right by accident (the app calls it "Hofmann").
- **Plan (this is `mechanisms-plan.md` Session 4, now de-risked):**
  - For a ring Cα, call `buildChairs` (both chairs, with MMFF energies).
  - In each chair, list the β‑H's whose H–Cβ–Cα–LG dihedral is within 25° of 180°.
  - Form products only from those H's. The major product comes from the lowest-energy chair that can react, with Zaitsev as the tie-break inside that chair.
  - Explain it in text: "Br is equatorial in the stable chair; the flipped chair (+x kcal/mol) has Br axial; only C6 has an axial H".
  - The prototype lives in the scratchpad `anti3.mjs` (about 30 lines). It reproduced all 5 key answers and uses only `chair.js` plus a dihedral function.
  - Keep "not covered" for fused or bridged rings.
- **Tests:** 9i, 9j, 9k, 10d, 13c (SMILES and expected products are in the study guide), plus menthyl vs neomenthyl chloride (seed 22) once it's checked against the textbook.

### P0‑3 Acyclic E2 where both carbons are stereocentres: "E/Z not covered": **FIXED 2026‑11‑11**
- **Done:**
  - New `anti.js`: `antiConformers()` takes OpenChemLib conformers, turns each β-H exactly anti to the LG, relaxes with MMFF94s+, keeps it if still within 25° of 180°, and records whether the two carbons' reference groups end up cis or trans (gauche → cis). The lowest-energy conformer per outcome is kept. `cis2D()` matches that to the E or Z product.
  - `predict.js` `antiGeometry()`: used for every open-chain C=C that could be E or Z. One β-H with both centres wedged → only one isomer (stereospecific). Two β-H's → both, ranked by the reacting conformer's energy (gap < 0.15 kcal/mol falls back to the bulk rule). A stereocentre drawn without wedges and one β-H → both shown with the `e2_stereo_undrawn` note. The green `e2_anti_checked` note says which conformer reacts and its energy gap.
  - Seed cases W7-5, W7-5-diast, W7-4b-RR, W7-4b-RS, e2-stereo-undrawn; seed 6 now checks the note.
- **Symptom:** Q5 shows "(hept-3-en-4-yl)cyclohexane" with no E/Z.
- **Plan:** use the same dihedral approach on the substrate's conformers. Because dihedral *differences* don't change with rotation, one conformer is enough:
  - E/Z = sign of [d(group₁‑Cβ‑Cα‑group₂) − d(H‑Cβ‑Cα‑LG) + 180°].
  - Or, more simply, build the alkene from an anti conformer, as the prototype does.
- **Checks:**
  - Q5 → (E) ✅;
  - Q4b (3R,4R) → E and (3R,4S) → Z;
  - 2‑bromobutane gives E as major (from the lower-energy anti conformer).

### P0‑4 Small labelling errors: **FIXED 2026‑11‑11**
- **Done:** the ring-alkene `ezNotCovered` text went with P0‑2. For Q4c, `namer.js` now gives E/Z for a C=C from the parent to a substituent (…ylidene), with the parent atom's locant: (2E)- and (2Z)-1,4-dimethyl-2-propylidenecyclohexane, both checked with OPSIN. Namer tests and seed case W7-4c added.
- A ring alkene with no possible E/Z gets the `ezNotCovered` "E/Z not decided by geometry" text (Q9i–k cards): `e2()` sets it whenever `betaDefined`, even when the alkene has no E/Z at all.
- Q4c lists two products with the identical name "1,4‑dimethyl‑2‑propylidenecyclohexane". These are E/Z isomers of an exocyclic C=C on a ring with stereocentres, and the namer drops the descriptor. Either name them properly or merge them as "E/Z mixture".

---

## P1: Ch 7 features the worksheet needs

| # | Feature | Worksheet Qs | Notes |
|---|---|---|---|
| 1 | **Newman projection tab** (replace "soon"): look along any chosen C–C from the 3D conformer, rotate in 60° steps, highlight the anti H/LG pair, and label "E2 from here gives (E)/(Z)/…" | 3, 5e, 4b | Reuses the P0‑3 dihedral code. Make the drawn Newman tappable as a quiz ("which conformation gives E?") |
| 2 | **Alkene stability meter + compare** (draw two or more alkenes, then *Rank by stability*) | 8, all "major product" reasoning | Rule-based key: substitution count; trans > cis; ring strain (C=C in or on a 3/4 ring, exocyclic on a 5 ring); conjugation. Show the reasons, as in SN1 ranking. MMFF energies are **not** valid between constitutional isomers; don't use them |
| 3 | **Check multiple-choice names**: paste the options; each is read by OPSIN (already used) and compared with the drawn structure by ID code, stereo included | 2, 4, 5b, 6b | OPSIN reads course-style names ("3‑heptene", "isopropyl", "sec‑butyl"). Also show a "course style" name next to the 2013 name (isopropyl/isobutyl/sec/tert, ene locant first) |
| 4 | **E1 ranking under acid**: OH counts as OH₂⁺; include hydride-shift potential and allylic stabilisation in the key | 12 | Today every alcohol is "no leaving group" |
| 5 | **Reverse planner ("get from A to B")**: draw start and target; brute-force a short list of 1–2 step sequences through `runSequence` (H₂SO₄/Δ; SOCl₂→NaOEt / KOtBu; TsCl→NaOEt / KOtBu; PBr₃→…; TsCl→NaI→base) and report every sequence whose **major** product matches the target, with why the others fail (rearrangement, Hofmann vs Zaitsev, trans-diaxial) | 10, 13 | Uses only the forward engine, so no new chemistry rules. Depends on P0‑1 and P0‑2 |
| 6 | **Heat favours elimination**: with heat and a weak nucleophile on 3°/2°, E1 should be major (or at least competing) and SN1 minor; allow "Δ only" (no reagent) as solvolysis | 7 | Check the rule against the course key; tag rows `course` |
| 7 | **Reagents:** KHSO₄ (acid, heat), TsOH, POCl₃/pyridine (E2 dehydration without a cation), NaI/acetone or DMSO (in the 13c route) | 9n, 13c | NaI may already exist as "iodide"; check the aliases |
| 8 | **Rate law and molecularity on each card** ("Rate = k[substrate][base]: bimolecular") | 5c, 6c | The text exists only in the glossary today |
| 9 | **Energy profile with labels**: the E1 hill shows protonated alcohol → cation → alkene with the Eₐ arrow on the slow step, exportable as a picture | 6a | The hill already exists; add labels and Eₐ |
| 10 | **E/Z and stereocentre counts** in the facts box ("10 stereocentres; C=C: 5 E, 4 Z, 0 not stereogenic"), with highlighting on the drawing | 1 | When a structure comes from PubChem, warn that database stereo can differ from the course drawing (PubChem's chivosazole F record has all 9 C=C as Z) |

## P2: nice to have
- Names offline for fused, spiro and bridged rings (Q9a, m, n). PubChem covers them when online. Extending `namer.js` is a big job; skip it unless needed.
- Wagner–Meerwein shifts in bicyclic systems (Q9n): keep it "not covered", with the reason.
- Chivosazole and other "why it matters" blurbs: a short per-reaction context line on the result card.
- A practice mode with Ch 7 problem templates (mechanisms-plan Session 5).

---

## Proposed order of work (each step ends usable, with tests first)
1. ~~Fix P0‑1~~ done.
2. ~~P0‑2~~, ~~P0‑3~~ and ~~P0‑4~~ done.
3. **P1‑1 Newman tab**: reuses step 2's geometry. Playwright test: 2‑bromobutane, rotate, anti highlight, "gives (E)".
4. **P1‑2 stability ranking** and **P1‑4 acid ranking**: both extend the existing ranking mode.
5. **P1‑3 name checker** and course-style names.
6. **P1‑5 reverse planner**, then P1‑6 to P1‑10 as small follow-ups.
7. Update `docs/ch7-study-guide.md` (flip ❌ to ✅) and CLAUDE.md's file table, and bump `sw.js` VERSION with each shipped step.

## Questions for Peter / the instructor
- **Q13b:** the key uses KOtBu to make the *Zaitsev* alkene 2‑methylhex‑2‑ene. Standard rules (and the app) say a bulky base gives the Hofmann alkene, so NaOEt is the textbook choice. Ask which your course expects.
- **Q7 / heat:** should "heat, no nucleophile" always be read as E1 major in your course? That decides P1‑6.
- **Worksheet typos:** Q5 options E and F are identical, and so are Q6 options C and E.
