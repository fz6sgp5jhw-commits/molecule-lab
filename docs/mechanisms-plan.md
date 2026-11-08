# SN1 / SN2 / E1 / E2: learning plan and app design

Owner: Peter (student). Builder: a Claude Code agent working in this repo. Read `CLAUDE.md` first.
Scope: substitution and elimination of **alkyl halides** and **alcohols** (including tosylates/mesylates and other ways of activating an OH group).

The document has two parts:
- **Part A** is the study path. It says what to learn, in what order, and how to know when you've got it.
- **Part B** is the app design that supports that path, split into phases with acceptance tests. The build order follows the study order, so each phase is useful as soon as it ships.

---

## Part A: How to learn it

Work through the stages in order. Each one ends with a self-check you should be able to do without notes. Then use the mixed practice in Stage 8 until the decisions feel automatic.

### Stage 1: The four ingredients (about 2 sessions)
Every one of these problems comes down to the same four questions.
1. **Substrate:** what kind of carbon carries the leaving group?
   - Methyl, 1°, 2° or 3°.
   - Allylic or benzylic (special: they form stabilised carbocations *and* still do SN2 well).
   - Vinyl or aryl carbons do **none** of these four reactions.
   - Neopentyl (1° but next to a quaternary carbon): SN2 is very slow.
2. **Leaving group:** how good is it?
   - The weaker the base it becomes, the better it leaves: I⁻ > Br⁻ > Cl⁻ ≫ F⁻.
   - TsO⁻ and MsO⁻ (tosylate, mesylate) are excellent.
   - **HO⁻ is a poor leaving group**, so alcohols must be *activated* first (Stage 6).
3. **Reagent:** is it a nucleophile, a base, or both? How strong, and how bulky?
   - Strong nucleophile, weak base: I⁻, Br⁻, RS⁻, N₃⁻, CN⁻, RCOO⁻.
   - Strong nucleophile and strong base: HO⁻, MeO⁻, EtO⁻.
   - Strong, bulky base (poor nucleophile): (CH₃)₃CO⁻ (KOtBu), DBU.
   - Weak nucleophile and weak base: H₂O, ROH (often the solvent itself).
4. **Conditions:**
   - Polar aprotic solvents (DMSO, DMF, acetone, MeCN) speed up SN2.
   - Polar protic solvents (H₂O, ROH) stabilise carbocations and favour SN1/E1.
   - **Heat favours elimination.**

**Self-check:** for any alkyl halide, say its class and rank three leaving groups. Sort ten reagents into the four reagent boxes above.
**App support (Sessions 1–2):** a *Reactivity facts* panel that shows the class, leaving group, β-hydrogens and the carbocation that would form.

### Stage 2: SN2 (about 1–2 sessions)
- **How it happens:** one step. The nucleophile attacks from the back, opposite the leaving group (backside attack).
- **Rate:** rate = k[substrate][Nu], so the rate depends on both.
- **Stereo:** **inversion of configuration** (Walden inversion).
  - Trap: the *label* (R/S) does not always flip. Whether it flips depends on CIP priorities, so always work it out from the 3D picture, not the letter.
- **Sterics:** methyl > 1° > 2° ≫ 3° (3° never does SN2). Neopentyl is very slow.
- **Best conditions:** strong nucleophile, polar aprotic solvent.

**Self-check:**
- draw the product of (R)-2-bromobutane + NaI in acetone and give its R/S label;
- explain why 2-bromo-2-methylpropane doesn't do SN2.

**App support (Sessions 2 and 4):** a predicted product with the inverted stereocentre, and a 3D animation of backside attack (the umbrella flip).

### Stage 3: SN1 (about 1–2 sessions)
- **How it happens:** two steps. The leaving group leaves first, giving a carbocation, which the nucleophile then captures.
- **Rate:** rate = k[substrate], so only the substrate matters.
- **Carbocation stability:** 3° ≈ allylic/benzylic > 2° ≫ 1° and methyl (these last two essentially never form).
- **Stereo:** the carbocation is flat, so the product is **racemised**. In practice there is often a slight excess of inversion.
- **Rearrangements:** a 1,2-hydride or 1,2-methyl shift happens when it gives a *more stable* carbocation (2° → 3°, 2° → benzylic).
- **Best conditions:** weak nucleophile (often the solvent: "solvolysis"), polar protic solvent.

**Self-check:**
- product(s) of 2-bromo-2-methylpropane in water;
- product of 3-methylbutan-2-ol + HBr (a hydride shift gives 2-bromo-2-methylbutane).

**App support:** carbocation facts (Session 1) and the energy hill with the intermediate (Session 3).

### Stage 4: E2 (about 2 sessions; the most stereo-heavy stage)
- **How it happens:** one step. The base removes a β-H while the leaving group leaves, forming the C=C.
- **Rate:** rate = k[substrate][base].
- **Geometry:** the β-H and the leaving group must be **anti-periplanar** (180° apart).
  - Because of this, E2 is *stereospecific*: the anti arrangement decides whether the alkene is E or Z.
  - **In cyclohexanes**, the leaving group and the β-H must both be **axial** (trans-diaxial). Sometimes only one chair can react, and that chair may be the less stable one.
- **Which alkene (regiochemistry):**
  - **Zaitsev** (the more substituted alkene) with small strong bases (EtO⁻, HO⁻).
  - **Hofmann** (the less substituted alkene) with bulky bases (KOtBu).
  - Trans alkenes are usually preferred over cis.
- **Who does E2:** 3° and 2° with strong bases; 1° mainly with bulky bases.

**Self-check:**
- 2-bromobutane + NaOEt versus + KOtBu: which alkene is major in each?
- Why does menthyl chloride give a different alkene from neomenthyl chloride? (Use the Chair tab.)

**App support (Session 4):**
- a Newman projection along Cα–Cβ that highlights anti-periplanar H's;
- the Chair tab marking which chair has the leaving group axial, and which axial β-H's are anti to it.

### Stage 5: E1 (about 1 session)
- **How it happens:** two steps. The same carbocation as SN1 forms, then a β-H is lost.
- **Which alkene:** Zaitsev, and rearrangements are possible.
- **Competition:** E1 competes with SN1, and **heat favours E1**.
- **Classic example:** acid-catalysed dehydration of 2° and 3° alcohols (H₂SO₄ or H₃PO₄ with heat).

**Self-check:** dehydration of 2-methylbutan-2-ol, and of 3,3-dimethylbutan-2-ol (this one involves a methyl shift).

### Stage 6: Alcohols (about 2 sessions)
OH has to be turned into a better leaving group first. Each method has its own mechanism and stereo outcome.

| Reagent | What happens | Stereo at C–O carbon |
|---|---|---|
| HX (HBr, HCl, HI) | Protonate OH → H₂O leaves. 3°/2°: SN1 (watch for rearrangements); 1°: SN2 | 3°/2°: racemised; 1°: inversion (not usually visible at CH₂) |
| PBr₃, SOCl₂ (+ pyridine) | Activates OH in place, then SN2 by Br⁻ or Cl⁻ (1°/2°) | **Inversion**, no rearrangement |
| TsCl or MsCl + pyridine | Makes a tosylate or mesylate; the C–O bond is **not** broken | **Retention**, then the next SN2 or E2 step inverts as usual |
| H₂SO₄ or H₃PO₄, heat | Dehydration. 3°/2°: E1; 1°: E2 on the protonated alcohol (can still rearrange) | Gives an alkene (Zaitsev) |

**Self-check:**
- (R)-butan-2-ol → tosylate → + NaCN: give the product and its R/S label;
- why PBr₃ is better than HBr when you want to avoid a rearrangement.

### Stage 7: Putting it together: the decision chart
For each substrate class:
- **Methyl:** SN2 only, if the nucleophile is reasonable.
- **1°:**
  - SN2 with good nucleophiles, even strong unhindered bases (NaOEt gives mostly SN2, with a little E2);
  - **E2 with bulky bases** (KOtBu).
- **2°:** this is where it gets messy.
  - Strong nucleophile that is a weak base, in an aprotic solvent: **SN2**.
  - Strong base (HO⁻, RO⁻): **mostly E2**.
  - Weak nucleophile or base in a protic solvent: SN1/E1 (slow, mixtures).
  - Textbooks disagree slightly here, so the app should show the competition honestly.
- **3°:**
  - Strong base: **E2**.
  - Weak nucleophile or base: **SN1 + E1** (more E1 with heat).
  - Never SN2.
- **Allylic/benzylic:** SN1 and SN2 are both fast; the conditions decide which.

### Stage 8: Practice routine
- **Mix the problem types.** After each stage, do 10 mixed problems rather than 10 of one kind; mixing is what builds the decision skill.
- **Explain every answer.** For each problem, say: substrate class → reagent type → conditions → mechanism → product, with stereo. Then check.
- **Keep a mistakes list.** Each time, note which rule you got wrong, and redo those problems 2 days later and again a week later.
- **App support (Session 5):** a practice mode that generates problems, checks your drawn product, explains the rule you missed, and tracks your weak spots.

---

## Part B: App design (for the Claude Code agent)

Agreed with Peter on 2026-11-07. This is a **visual learning tool**: every step is animated *and* explained, including *why* it happens.

### Principles (non-negotiable, consistent with `CLAUDE.md`)
1. **The rules engine is deterministic.** Predictions come from textbook rules stored as data (`data/reagents.json`, `data/rules.json`), never from a model. Products are made by editing the molecule graph in OpenChemLib. Names come from the existing naming flow (PubChem → `namer.js` → OPSIN check).
2. **Show the reasoning.** Every prediction shows the decision path and the rules used.
3. **Be honest about uncertainty.** Say "major", "minor" or "competing", never percentages. Say so where textbooks disagree (2° substrates, 1° + alkoxide). Out of scope → "not covered yet, because …".
4. **Stereo comes from OpenChemLib**, never from swapping R/S letters by hand.
5. **Visual cues are qualitative and rule-based.** Clouds, δ labels, the energy hill and the stability meter come from textbook rules (electronegativity, lone pairs, formal charge, cation class). No made-up numbers. Computed values (e.g. MMFF) only appear where they are real, and are labelled as computed.
6. **House style:** Windows 95 look, phone (390 px) and laptop layouts, offline, no build step.

### Simplifications (decided to keep the code small)
- **Roles, not compounds.** A mechanism only touches the reaction centre: Nu/base, Cα, LG, Cβ, Hβ (plus the shifting group). The analyser finds these roles; the rest of the molecule is a grey spectator. So the visual cues are **one template per mechanism**, not one per compound, and no list of approved compounds is needed.
- **Four reagent boxes instead of a 3-axis grid.** Each reagent is in exactly one box: `nuc` (strong Nu, weak base: I⁻, Br⁻, CN⁻, N₃⁻, RS⁻, AcO⁻), `nucbase` (HO⁻, MeO⁻, EtO⁻), `bulky` (KOtBu, DBU), `weak` (H₂O, ROH). Plus a fifth kind, `activator` (HX, PBr₃, SOCl₂, TsCl, MsCl, H₂SO₄/H₃PO₄), each with its own fixed sequence.
- **Conditions are two switches:** solvent = protic / aprotic (the chips map to one of these) and heat on/off.
- **The decision table is about 15 rows**, keyed by (substrate class, reagent box, solvent type, heat) → lamps (major/minor/none) + reason keys. Data, not code.
- **Carbocation stability is an integer:** the number of carbons on C⁺, +1 if allylic/benzylic, +1 if the shift relieves ring strain (3-, 4- or 5-ring opening to a bigger ring).
- **Shifts (core, needed by worksheet problems 4 and 5):** list every 1,2-shift of H, CH₃/alkyl or a ring bond (ring expansion) from a neighbour of C⁺. Each shift that gives a score ≥ the start is its own pathway; at most one shift per pathway. All products are shown, ranked: highest final cation score = major, others = minor, equal = competing.
- **Ranking mode (worksheet problems 6 and 7):** each separate molecule in the editor is a candidate. SN1 order: cation score, then leaving group (I > Br > Cl). SN2 order: steric class (methyl > 1° > 2°; 3° = none), allylic/benzylic boost, minus graded β-branching (each extra carbon on Cβ slows it; neopentyl slowest of the 1°), then leaving group. Ties shown as ties, each place with its reason.
- **Stereospecific? Y/N** on every result card (SN2 and E2: yes; SN1 at the reacting centre: no, racemic), as worksheet problem 3 asks.
- **Products from fragments:** each reagent stores its nucleophile fragment (SMILES + attaching atom), so one `attachFragment()` handles every substitution.
- **E2 stereo, v1:** acyclic substrates with *no* defined stereocentre at Cβ → report E (trans) major, Z minor (Zaitsev/trans preference). Cases where the anti-periplanar geometry decides E vs Z (both Cα and Cβ defined) say "not covered yet" until Session 4.
- **Ring E2, v1:** simple cases (all β-H's give the same alkene) are normal. When trans-diaxial geometry would decide *which* alkene forms, give the Zaitsev alkene **with a visible warning**: "may differ: the trans-diaxial requirement isn't checked yet; see the Chair tab". (Peter's choice, 2026-11-07.)
- **One elimination function:** `alkenesFrom(mol, centre)` lists the alkenes from removing a β-H next to `centre`. E2 calls it on the substrate (centre = Cα), E1 on the cation (centre = C⁺, after any shift).
- **Zaitsev score:** number of carbons on the C=C, +2 if conjugated with an aromatic ring or another C=C. A tie → "competing", never a guess. Bulky base → lowest score wins (Hofmann; note that textbooks vary for 2° substrates).
- **E/Z must be set explicitly** on every new double bond (OpenChemLib would otherwise read it from arbitrary 2D positions), and only where OpenChemLib says the bond can be stereo (no label on but-1-ene). See spike S4.
- **SN2 stereo trick:** the nucleophile's attaching atom takes the leaving group's atom index, so the stored parity means retention; flipping it gives inversion, and OpenChemLib then computes R/S. Substrate drawn without wedges → "no stereocentre defined", no stereo claimed.
- **Allylic cations (SN1/E1):** the + is shared between both ends. Show the two resonance forms in one frame, explain the sharing, and give **both** products. Allylic SN2 is normal (no SN2′ in v1).
- **Two or more leaving groups:** show site chips ("Which site? [C1–Br] [C3–Br]") and analyse the one picked. Don't claim which site reacts faster.
- **No MMFF in this feature (v1).** Product stability is ranked by the rules above only.
- **Typed reagent names** match an alias list per catalogue entry ("NaOEt", "sodium ethoxide", "EtONa"). No OPSIN lookup for reagents.
- **Names offline:** if neither PubChem (offline) nor `namer.js` can name a product, say "name unavailable offline"; never guess.
- **2D frames don't move atoms** except a shifting H/CH₃ along an arc. The SN2 transition state is shown with dashed partial bonds; the actual umbrella flip is only in the 3D view.
- **Unknown reagents:** three rules (negative charge on O/S/N/halide → Nu; tertiary carbon next to the charge → bulky; neutral O–H → weak) make a guess, shown pre-selected among the four box buttons, marked "estimated". The student confirms or changes it.
- **Drawn reagents:** strip metal counter-ions (Na⁺, K⁺, Li⁺) before matching by ID code, so drawn "Na⁺ ⁻OEt" and typed "NaOEt" both match ethoxide.
- **Explanations are template text** with placeholders (`{LG}`, `{class}`, `{Nu}`), written once per mechanism step and reviewed once, not generated per compound.
- **The renderer reuses OpenChemLib 2D coordinates.** Coordinates are computed once for substrate + reagent and kept in every frame, so atoms never jump. The nucleophile is placed at the mirror point of LG across Cα. Only the Hβ that gets removed is drawn as an explicit H.

### UI (agreed)
**Reactions window** (new grey window under the editor):
- **Reagent editor:** a second small editor. Draw it, type a name or formula (NaOEt, "sodium iodide"), or tap a quick chip.
- **Conditions:** choosing a reagent auto-fills its usual solvent. Chips change it (H₂O, MeOH, EtOH, DMSO, DMF, acetone). A 🔥 Heat toggle.
- **Predict** → decision path (substrate → reagent → conditions, each box tappable for its rule) ending in **four lamps** SN1 / SN2 / E1 / E2: bright = major, dim = minor, off = doesn't happen. Tap a lamp to open its mechanism.

**Mechanism screen** (one pathway at a time; stacked on a phone, two columns on a laptop):
- **Frames:** 2D drawing, arrows that draw themselves, bonds fading out or in, charges appearing. Short transitions between frames.
- **Electron density layer:** one blue glow for electron density (Peter, 2026-11-08): bright where electrons are rich (Nu lone pair, LG), faint where poor (Cα, C⁺) so the breaking bond stays visible, plus δ+/δ− labels. Updated every frame. A **pull line** from the Nu lone pair to Cα tightens over the frames into the new bond.
- **Energy:** a small **hill with a ball** (one hump for SN2/E2; two humps with a dip for the carbocation in SN1/E1) that moves with the frames, plus a **stability meter** for "how happy is the molecule now" (explains cation class and shifts). Qualitative, no numbers.
- **Dialog box** in retro RPG style (pixel font, typewriter text, blinking ▼): tap to finish the text, tap again for the next step. **WHY?** adds 1–3 extra pages to the same box (e.g. "the 2° cation shifts a hydride because the 3° cation is stabilised by three neighbouring carbons (hyperconjugation)"). Plain wording, with exam terms highlighted; tap a term for its definition (glossary).
- **Alcohol activation** (protonation, tosylate, PBr₃, SOCl₂) gets full frames of its own.
- **Quiz me toggle:** at key moments, pause and ask ("Tap the atom the nucleophile attacks", "Will this cation shift? Yes/No"), then reveal and explain.
- **Ending:** a result card shows the product drawing, its name, R/S or E/Z, and major/minor, with **Load into editor** to chain steps (tosylate → + NaCN). If a pathway competes, the dialog offers "E1 also competes here. See it?" and explains why it's minor.
- **3D button:** opens a short 3D animation only for the stereo moments (SN2 umbrella flip, the flat cation attacked from both faces, E2 anti-periplanar).

### Files (keep new code out of `index.html`)
| File | Contents |
|---|---|
| `reactivity.js` | `analyse(OCL, mol)` → sites with roles, class, flags, β-H's, cation score, shift |
| `reagents.js` | catalogue loader, counter-ion stripping, matching by ID code / name, unknown-reagent guess |
| `predict.js` | decision table lookup + product building |
| `data/reagents.json`, `data/rules.json` | the catalogue and the decision table |
| `mech-templates.js` | frames per mechanism as data (roles, bond changes, charges, arrows, cloud levels, hill position, meter, dialog text, why pages, quiz points) |
| `mech-view.js` | SVG renderer, frame transitions, dialog box, hill, meter |
| `index.html` | only a mount point, the Reactions window markup and CSS |

All new files go in `ASSETS` in `sw.js`, with `VERSION` bumped.

### Phases: 3 core sessions + 2 optional
Grouped so each session ends with something usable, and so all the chemistry logic is done (and tested cheaply in Node) before any UI work. Templates, rules, reagents and explanation text are **data files**, so later mechanisms add data, not code.

#### Session 1: All the logic, no UI (Opus, high effort)
- Spikes first (each a few lines in a Node script, kept only if useful):
  - **S1 SN2 inversion:** copy the molecule, swap LG for Nu, invert the parity at Cα, let OpenChemLib give R/S. Prove it on (R)-2-bromobutane + I⁻ → (2S)-2-iodobutane, and on a case where the label does *not* flip.
  - **S2 Counter-ions:** drawn Na⁺/K⁺ salts match the catalogue entries.
  - **S3 Tosylates:** OS(=O)(=O)Ar recognised as a leaving group; tosylate names come from PubChem (don't extend `namer.js`).
  - **S1 must also pass a ring cis/trans case with no R/S centre** (worksheet 3e: 1-iodo-4-isopropylcyclohexane + NaN₃ → the other diastereomer).
  - **S4 E/Z on a new double bond:** from 2-bromobutane, build (2E)- and (2Z)-but-2-ene on purpose and get the right names, and confirm but-1-ene gets no E/Z. If this fails, stop and report: E2/E1 stereo depends on it.
- `reactivity.js` (analyser), `reagents.js` + `data/reagents.json`, `predict.js` + `data/rules.json`.
- `tests/seed-cases.json` (the seed table as data) + `tests/reactions.test.mjs` (Node only).
- Acceptance: every in-scope seed row gives the stated pathway, product ID code (incl. stereo) and name; vinyl/aryl and neopentyl rows give their flags.

#### Session 2: Reactions window + mechanism viewer with SN2 (Opus, medium effort)
- "Reactivity facts" panel under the existing facts (class, LG, β-H's, cation + any shift), and site chips when there are two or more leaving groups.
- Reactions window: reagent editor, chips, solvent auto-fill, heat toggle, Predict, decision path, four lamps, result card with "Load into editor".
- `mech-view.js`: renderer, density layer, pull line, hill + ball, meter, RPG dialog with WHY pages and glossary.
- `mech-templates.js` with **SN2 only**, and `data/mech-text.json` for all dialog/why/glossary text.
- Built straight into the app (no separate prototype page): `mech-view.js` is its own file, so changing the look later doesn't touch `index.html`.
- One Playwright test: predict on 2-bromobutane + NaI, open SN2, step through, check dialog text and final product name.
- **Then Peter reviews the look once, with all changes in one message.**

#### Session 3: The other mechanisms + quiz (Opus, high effort)
- **Prep from Session 2 (done 2026-11-07):** the Reactions window is its own app tab (Molecule | Reactions, `#reactions` links to it). Each result card has **▶ Watch**, which opens that card's own pathway, so an SN1 with three shift pathways (worksheet 4) or Zaitsev/Hofmann E2 products can each be animated. `docs/worksheet-guide.md` lists how to solve each worksheet problem with the app; keep it current when behaviour changes.
- **What the renderer still needs** (`drawFrame` in `mech-view.js` only knows roles nu, ca, lg): the base and Hβ (drawn as an explicit H on Cβ) for E2/E1; a C=C forming between Cα and Cβ (`bonds: { 'ca-cb': 'double' }`); C⁺ with an empty p orbital; the shifting group moving along an arc (the one time an atom moves); and a resonance frame with two structures for allylic cations. The hill already does two humps (`humps: 2`). Add these as new frame fields, not as special cases per mechanism.
- **Seed rows (2026-11-07, from the answer-key photos):** 3a, 3b, 3e and 5 are now confirmed (W3a, W3b, S1-ring, W5). Checking 5 found a Session 1 bug: `sharesRing()` always returned true, so any shift from a ring C⁺ was dropped as a "ring contraction" and ring expansions like spiro → decalin were missed. Fixed. Still missing: 6, 7 and 8 (structures and answers not in the photos yet).
- **Decided by Peter (2026-11-07):** keep ranking shifted SN1/E1 products by cation score (worksheet 4: ring expansion major, the others minor), even though the answer key lists all three without a ranking. All three are always shown.
- Apply Peter's review changes first.
- Templates for SN1 (shift as an inserted sub-step; allylic resonance frame with two products), E1, E2 (Zaitsev/Hofmann), alcohol activation preludes (protonation, PBr₃, SOCl₂, TsCl).
- Quiz points (they are template data) + the Quiz me toggle; competing-path offer at the end.
- Extend the one Playwright test to open each mechanism once.

- **Done 2026-11-07.** Templates SN1/E1/E2 + preludes (protonate, PBr₃, SOCl₂, TsCl) in `mech-templates.js`; text in `data/mech-text.json`. Products now carry `centre`/`group`/`beta` (predict.js), so each ▶ Watch follows its own cation and β-H. Renderer fields are general (`if`/`unless`/`when` flags, role-pair bonds incl. `pdouble`, `@token` charges/labels, `pOrbital`, `move`/`moved`, `resonance`, named hill stops; a shift adds a third hump). Notes:
  - A ring expansion is drawn as the migrating ring bond reaching Cα (a long bond); ring atoms don't move. Only a shifting H or an acyclic alkyl branch travels along the arc.
  - After activation, the step-2 nucleophile (Br⁻/Cl⁻) appears at its attack position rather than travelling from where step 1 left it.
  - E1 shows the solvent as the base (water for H₂SO₄/H₃PO₄). Chemistry worth a textbook check: PBr₃ shown without a separate deprotonation (leaving group HOPBr₂), SOCl₂/pyridine via the chlorosulfite with inversion (SNi without pyridine: not covered).

#### Session 4 (optional): 3D + geometry-decided E2 (Opus, high effort)
- 3D button for stereo moments (reuse the Chair tab's 3Dmol frame approach).
- E2 where anti-periplanar geometry decides E/Z; ring E2 via `chair.js`; menthyl vs neomenthyl (verify against a textbook first). Newman projection.

#### Session 5 (optional): Practice mode (Sonnet, medium; Opus if checking logic gets tricky)
- Generated problems (only cases the engine covers); draw the product; check by ID code with and without stereo; feedback names the missed rule; weak spots in localStorage with re-tries; reagent flashcards.

#### Stretch
Several consecutive shifts, SN2′, neighbouring-group participation, E1cB: only when the course needs them. Drawing your own curved arrows in practice.

### Saving tokens (rules for every session)
**Tests are the biggest repeat cost, because each failing run is re-read in full.** So:
- **Logic is tested in Node, not the browser.** Node tests run in a second and print little. Playwright is only for checking that the UI is wired up, run once near the end of a session.
- **Table-driven tests with one-line failures.** One test loops over `tests/seed-cases.json` and prints only failures, e.g. `#6 E2: expected (2E)-but-2-ene, got but-1-ene`. Never print molecules, stacks or passing cases.
- **Run only the suite you're working on:** `npm run test:reactions` (add the script in Session 1). Run `npm test` (everything) once, before committing.
- **Fail fast and short:** `--max-failures=1` and the `line` reporter for Playwright; pipe output through `tail -n 30`.
- **No screenshot comparisons.** Check DOM text (names, lamp states, dialog text) instead. Screenshots only when Peter asks to see something.
- **Fix the cause, then rerun once.** Don't rerun unchanged code hoping it passes.
- Read only the files a session names; never read `index.html` whole (use `grep -n` to find the anchor, then read that range).
- One commit at the end of each session; the next session starts fresh, not continuing a long chat.
- One `/code-review medium` after Session 3, not after each session.

### Seed test set (expected textbook answers)
| # | Substrate | Reagent / conditions | Major pathway | Major product |
|---|---|---|---|---|
| 1 | bromomethane | NaOH, H₂O/acetone | SN2 | methanol |
| 2 | 1-bromobutane | NaCN, DMSO | SN2 | pentanenitrile |
| 3 | 1-bromobutane | KOtBu, tBuOH | E2 | but-1-ene |
| 4 | 1-bromobutane | NaOEt, EtOH | SN2 (some E2) | 1-ethoxybutane |
| 5 | (R)-2-bromobutane | NaI, acetone | SN2, inversion | (S)-2-iodobutane |
| 6 | 2-bromobutane | NaOEt, EtOH, heat | E2 (Zaitsev) | (E)-but-2-ene (major) > (Z)-but-2-ene > but-1-ene |
| 7 | 2-bromobutane | KOtBu | E2 (Hofmann) | but-1-ene |
| 8 | 2-bromo-2-methylpropane | H₂O | SN1 (+ some E1) | 2-methylpropan-2-ol |
| 9 | 2-bromo-2-methylpropane | NaOEt, EtOH | E2 | 2-methylprop-1-ene |
| 10 | 2-bromo-2-methylpropane | EtOH, heat | E1 + SN1 | 2-methylprop-1-ene + 2-ethoxy-2-methylpropane |
| 11 | 2-bromo-2-methylbutane | NaOEt / KOtBu | E2 | 2-methylbut-2-ene / 2-methylbut-1-ene |
| 12 | 3-methylbutan-2-ol | HBr | SN1 with hydride shift | 2-bromo-2-methylbutane |
| 13 | cyclohexanol | H₃PO₄, heat | E1 | cyclohexene |
| 14 | 2-methylbutan-2-ol | H₂SO₄, heat | E1 (Zaitsev) | 2-methylbut-2-ene |
| 15 | butan-1-ol | PBr₃ | SN2 | 1-bromobutane |
| 16 | (R)-butan-2-ol | SOCl₂, pyridine | SN2, inversion | (S)-2-chlorobutane |
| 17 | (R)-butan-2-ol | 1) TsCl, pyridine 2) NaCN, DMSO | retention, then SN2 inversion | (S)-2-methylbutanenitrile |
| 18 | 1-bromo-2,2-dimethylpropane | NaOEt | SN2 very slow (neopentyl) | flag "very slow / not covered" |
| 19 | bromobenzene, bromoethene | any of the above | none | "vinyl/aryl: no SN/E" |
| 20 | (bromomethyl)benzene | NaCN, DMSO | SN2 | 2-phenylacetonitrile |
| 21 | 3,3-dimethylbutan-2-ol | H₂SO₄, heat | E1 with methyl shift | 2,3-dimethylbut-2-ene |
| 22 | menthyl vs neomenthyl chloride | NaOEt, EtOH | E2 (anti-periplanar in the chair) | **verify against the course textbook** before encoding |

Each case needs a test that checks the pathway verdict, the product by ID code (including stereo), and the product's name.
All product names and R/S labels above were checked with this repo's OpenChemLib and `namer.js` on 2026-11-07. Note that the namer writes stereo in 2013 style, e.g. `(2S)-2-iodobutane` and `(2E)-but-2-ene`, so tests should compare against that form.


### Course worksheet (Chemistry 2310, Ch 6), the target problems
Photos shared 2026-11-07. The app must handle these; add them to `tests/seed-cases.json` **only with answers confirmed from the answer key** (don't encode guesses):
- **3a–f** products with wedges + stereospecific Y/N: 2-iodobutane (Fischer drawing) + NaCN/DMSO; a 2° alcohol + SOCl₂/pyridine; a 2° allylic chloride + NaOCH₃/THF 40 °C; (1-bromoethyl)benzene + CH₃OH 80 °C; 1-iodo-4-isopropylcyclohexane + NaN₃/DMF; a 2° alcohol + 1) TsCl/pyridine 2) NaCN/DMF.
- **4a–c** 1-(1-bromoethyl)-1-methylcyclopentane in EtOH + heat: three ethers via no shift, methyl shift, ring expansion.
- **5** a cyclohexyl/cyclopentyl bromide in EtOH + heat: two ethers, major vs minor (rearrangement).
- **6, 7** rank five halides by SN1 rate and by SN2 rate.
- **8** (S)-2-chloropentane + CH₃SNa/DMSO: SN2 mechanism with curly arrows.
Notes: the editor can't take Fischer projections, so the student redraws with wedges (say so in the help). Add THF to the aprotic solvent chips and CH₃SNa/"sodium methanethiolate" to the aliases. Proton-transfer frames are marked so they can be skipped ("neglect proton transfer steps").

**Confirmed from Peter's annotated solutions (2026-11-07)**, so encode these as rules and test cases:
- **Weak nucleophile in a polar protic solvent (EtOH/MeOH), with heat → SN1 substitution is the major answer** (3d: (1-bromoethyl)benzene + CH₃OH, 80 °C → racemic ether, stereospecific N; "polar protic attenuates the Nu"). E1 is shown as *competing* and explained, not as major. Heat makes E1 major only with a non-nucleophilic acid (H₂SO₄/H₃PO₄ dehydration, Stage 5).
- **2° allylic halide + NaOCH₃ in THF (polar aprotic) → SN2 major, with inversion, stereospecific Y** (3c). E2 shown as competing.
- **4a–c:** all three pathways happen and give products: no shift (2° cation → ether), methyl shift (→ 3° cation on the ring → ether), ring expansion (cyclopentyl → 3° cyclohexyl cation → ether). So the unshifted pathway is always listed alongside the shifted ones. Proton-transfer steps are neglected in the answer.

### Answers from Peter (2026-11-07)
1. **Textbook:** not known yet. Use standard intro-textbook conventions and flag where books disagree.
2. **Entering reagents:** draw, type or pick (second editor).
3. **Arrows:** practice predicts products; drawing your own arrows is a stretch goal.
4. **Exam style:** major/minor only, no ratios.
5. **Reagents:** the seed list is enough for now; more are added later as data.
6. **Checking the teaching text:** all dialog/WHY/glossary text lives in `data/mech-text.json`. After Session 3, a separate AI review compares it with standard textbook explanations and flags doubtful pages; then Peter skims the flagged parts against his notes.
7. **Release:** push to `main` at the end of every session (Session 1's logic stays hidden until Session 2 adds the UI).
8. **Where to work:** the git clone of `fz6sgp5jhw-commits/molecule-lab` (`~/Desktop/molecule-lab-repo`), not the old non-git copy.

### Suggested first prompt for the agent
> Read CLAUDE.md and docs/mechanisms-plan.md (Part B only). Do Session 1: spikes S1–S3, then reactivity.js, reagents.js, predict.js and their data files. Write tests/seed-cases.json and a Node test first. Follow "Saving tokens". No UI work.
