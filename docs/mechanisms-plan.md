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
**App support (Phase 1):** a *Reactivity facts* panel that shows the class, leaving group, β-hydrogens and the carbocation that would form.

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

**App support (Phases 2 and 4):** a predicted product with the inverted stereocentre, and a 3D animation of backside attack (the umbrella flip).

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

**App support:** a carbocation explorer (Phase 1) and an energy diagram with the intermediate (Phase 3).

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

**App support (Phase 4):**
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
- **App support (Phase 5):** a practice mode that generates problems, checks your drawn product, explains the rule you missed, and tracks your weak spots.

---

## Part B: App design (for the Claude Code agent)

### Principles (non-negotiable, consistent with `CLAUDE.md`)
1. **The rules engine is deterministic.**
   - Predictions come from explicit textbook rules stored as data (a rules table plus a reagent catalogue), never from a model.
   - Products are made by editing the molecule graph in OpenChemLib.
   - Names come from the existing naming flow (PubChem, then `namer.js`, then the OPSIN check).
2. **Show the reasoning.** Every prediction lists the chain of rules it used, like "How this name was built" does. The aim is to teach the decision, not just give the answer.
3. **Be honest about uncertainty.**
   - Say "major", "minor" or "competing". Never give made-up percentages.
   - When textbooks disagree (2° substrates, 1° with alkoxides), say so.
   - If a case is outside the rules' scope, say "not covered" and give the reason.
4. **Stereo comes from OpenChemLib**, never from swapping letters by hand:
   - SN2: make the inverted geometry, then let OpenChemLib work out R/S.
   - SN1: show both enantiomers (racemic).
   - E2: work out E/Z from the anti-periplanar geometry.
   - E1: give the more stable alkene, usually trans.
5. **Keep the house style:** Windows 95 look, works on a phone, works offline, no build step.

### Proposed UI
- A new **"Reactions"** window under the editor, with four parts:
  - a reagent picker (catalogue chips plus a search box);
  - solvent and heat toggles;
  - a **Predict** button;
  - results cards: one per pathway (SN1/SN2/E1/E2), each with a verdict (major / minor / doesn't happen), the product(s) as line drawings with names, and a "Why" list.
- A **Mechanism** viewer tab with:
  - step-by-step curved arrows on the 2D drawing, with a step slider;
  - an energy diagram (one step versus two steps with an intermediate);
  - a 3D animation (SN2 umbrella flip; E2 anti-periplanar).
- A **Practice** tab: a generated problem, you draw the answer in the editor, then Check → feedback.

### Phases

#### Phase 1: Substrate analyser (small; build it first)
`reactivity.js` with `analyse(OCL, mol)`, returning for each leaving-group site:
- **Leaving group:**
  - C–I, C–Br, C–Cl (C–F counts as "won't leave");
  - C–OH, flagged "needs activation";
  - C–OTs and C–OMs (supporting S needs its own perception, since the namer rejects S=O);
  - also protonated alcohols, C–OH₂⁺.
- **Carbon class:** methyl / 1° / 2° / 3°, plus allylic, benzylic, vinyl, aryl and neopentyl flags.
- **β-carbons and their hydrogens**, with the alkene each one would give: built as a product molecule, named, and ranked by substitution (number of carbons on the C=C) and E/Z.
- **The carbocation that would form**, scored (methyl < 1° < 2° < 3°; allylic/benzylic +1). Also any **1,2-H or 1,2-alkyl shift** to a strictly more stable cation (one shift only in v1; no ring expansions).
- **Display:** a "Reactivity facts" panel under the existing facts.

Acceptance:
- 2-bromobutane → 2°, Br; β-carbons C1 and C3; alkenes but-1-ene, (E)- and (Z)-but-2-ene.
- 3-methylbutan-2-ol → 2°, OH needs activation; the cation shifts by a hydride to the 3° cation.
- Bromobenzene and vinyl bromide → "vinyl/aryl: no SN1/SN2/E1/E2".
- Neopentyl bromide → 1°, neopentyl flag.

#### Phase 2: Reaction predictor
- **`data/reagents.json`** fields: `id, name, formula, smiles, nucleophile: strong|moderate|weak|none, base: strong|weak|none, bulky: bool, defaultSolvent, notes`.
  - Seed list: NaI, NaBr, NaCl, NaCN, NaN₃, NaSH/NaSR, NaOAc, NaOH, NaOMe, NaOEt, KOtBu, DBU, H₂O, MeOH, EtOH, HBr, HCl, HI, PBr₃, SOCl₂/pyridine, TsCl/pyridine, MsCl/Et₃N, H₂SO₄ + heat, H₃PO₄ + heat.
- **`data/rules.json`:** the Stage 7 decision table as data, so it can be checked and edited, with a citation note for each rule (for example "standard intro textbook rule").
- **`predict(OCL, mol, site, reagentId, {solvent, heat})`** returns a list of pathways, each with: `{ mechanism, verdict: 'major'|'minor'|'competing'|'none', products: [mol], why: [string] }`. How to build the products:
  - **Substitution:** replace the leaving group with the nucleophile atom (for CN⁻, attach through C; for N₃⁻, the azide; for RO⁻, an ether).
  - **SN2 stereo:** see Spike S1 below.
  - **SN1:** both configurations (use the rearranged cation when there is a shift).
  - **E2:**
    - Zaitsev or Hofmann depending on `bulky`.
    - Only anti-periplanar β-H's count. In rings, the leaving group must be axial in one of the chairs; reuse `chair.js`.
    - Work out E/Z from the anti conformation.
  - **E1:** the most substituted alkene from the cation (after any shift), with trans preferred.
  - **Alcohol reagents** follow the Stage 6 table. TsCl gives the tosylate with retention, and the user can then apply a second reagent ("chain the next step").

Acceptance: every seed problem below gives the stated major pathway and product.

#### Phase 3: Mechanism viewer
- **Step templates per mechanism, as data:**
  - each step lists its arrows, from a lone pair or bond to an atom or bond, written in terms of roles (Nu, Cα, Cβ, Hβ, LG);
  - the roles are mapped onto the real atoms from Phase 1.
- **Rendering:**
  - draw OpenChemLib's `toSVG` with atom coordinates, then overlay curved SVG arrows;
  - show charges and lone pairs on intermediates;
  - add a step slider.
- **Energy diagram:** SVG, qualitative only, with no fake numbers. Two humps with an intermediate for SN1/E1; one hump for SN2/E2.

#### Phase 4: 3D and conformations
- **SN2:**
  - frames that interpolate from the substrate with the nucleophile approaching from the back, to a trigonal-bipyramidal transition state, to the inverted product;
  - reuse the 3Dmol frame approach from the Chair tab.
- **Newman projection** (also on the main roadmap):
  - choose the Cα–Cβ bond, rotate the back carbon, and label staggered / eclipsed / gauche / anti;
  - highlight H–C–C–LG at 180°.
- **Chair tab:** when the ring carries a leaving group, mark "LG axial in this chair" and highlight the axial β-H's that are anti to it.
  - Classic test: menthyl versus neomenthyl chloride.

#### Phase 5: Practice mode
- **Problem generator:** substrate templates (1°/2°/3°/allylic/benzylic halides, alcohols, ring cases, cases with stereocentres) × reagent catalogue × conditions. Only generate problems the rules engine covers.
- **The student's answer:** they choose the mechanism and **draw the major product** in the editor. Check by comparing ID codes, with and without stereo, so the feedback can say "right product, wrong stereo".
- **Feedback:** name the specific rule that was missed, and link to the matching stage in Part A.
- **Progress:** stored in localStorage per topic (SN2 stereo, Zaitsev/Hofmann, rearrangements, alcohol activation…). Show weak areas and schedule re-tries (2 days, then 1 week).
- **Flashcards:** reagent → its nucleophile/base type.

#### Phase 6 (stretch)
- Rearrangement explorer with several shifts and ring expansion.
- SN2′ (allylic), neighbouring-group participation, E1cB: each only when it comes up in the course.

### Spikes to do before building (time-boxed)
- **S1: SN2 inversion in OpenChemLib.**
  - Option A: copy the molecule, swap the leaving-group atom for the nucleophile, then invert the atom's parity.
  - Option B: build 3D, put the nucleophile opposite the leaving group, delete the leaving group, then let OpenChemLib work out the parities from 3D coordinates.
  - Prove it on (R)-2-bromobutane + I⁻ → (S)-2-iodobutane, and on a case where the R/S label does *not* flip.
- **S2: Kekulé/aromatic handling** when making alkenes next to a benzene ring (conjugation counts as stability).
- **S3: Tosylate perception:** OS(=O)(=O)Ar as a leaving group without breaking `namer.js`. The namer currently refuses sulfonyl groups; either extend it (alkyl 4-methylbenzenesulfonate) or let PubChem name these.

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

### Open questions for Peter (ask before Phase 2)
1. **Textbook:** which one does the course use (Klein, Wade, McMurry, Clayden…)? The 2° cases and "1° + alkoxide" should follow its conventions.
2. **Entering reagents:** pick from a list only, or also draw them?
3. **Arrows:** should practice include *drawing* the curved arrows yourself (harder to build), or only predicting products?
4. **Exam style:** do exams ask for minor products and ratios, or just the major product?

### Suggested first prompt for the agent
> Read CLAUDE.md and docs/mechanisms-plan.md. Do Spike S1 and Phase 1 (substrate analyser) only. Write tests first from the seed table rows that Phase 1 covers. Ask me the open questions before starting Phase 2.
