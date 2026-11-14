# Ch 8 and 10 worksheet: app gaps and plan

Audit date 2026-11-14, engine at commit `38e1e8c`. Topic: addition reactions of alkenes (Ch 8) and an intro to radicals (Ch 10).

Every worksheet problem was run through the engine as it is today (`predict.js` `runSequence`, `reagents.js` `findReagent`/`guessBox`) and compared with Peter's handwritten key (`docs/ch8-10-worksheet/`, git-ignored because the repo is public). Problem-by-problem answers, and how to solve each one, are in `ch8-10-study-guide.md`.

This session was planning only. The checks below come from throwaway Node spikes in the scratchpad, not from app code:
- **audit**: each problem through `runSequence`;
- **faces**: which face of a C=C is less hindered, from MMFF conformers;
- **build**: products made by placing the new atoms on a 3D conformer and letting OpenChemLib read the stereo;
- **sides**: an independent check of which ring face each substituent ends up on;
- **cation**: `cationPathways` reused for a protonated alkene;
- **ozonolysis**: a C=C → 2 C=O graph edit;
- **names**: every expected product named by `namer.js`, then read back by OPSIN.

## Scorecard

About 45 checkable answers: Q2a–q, Q3a–g, Q4 (7 arrows), Q5, Q6–8, Q9, Q10, Q11.

- **The engine has no addition, radical or ozonolysis chemistry.** Every addition or radical step stops:
  - with `unknown_reagent` (Br₂, Cl₂, H₂/Pd, BH₃, mCPBA/PhCO₃H, O₃, "HBr, ROOR", "H₂SO₄ (aq)" are not in the catalogue);
  - or with `no_site` when the reagent is known (HBr, HCl, H₂SO₄ on an alkene).
- **The elimination steps inside the Ch 8 sequences already work (8 of 9):**
  - 2n step 1;
  - 2o step 2 and 2p step 2;
  - 2q steps 2–3: the trans-diaxial rule gives the key's non-Zaitsev 3-isopropylcyclohexene;
  - Q4: TsCl then NaOEt gives 1,5-dimethylcyclopentene; H₂SO₄ with heat gives 1,2-dimethylcyclopentene;
  - Q10 step 2;
  - Q11 step 1.
- **One disagreement, not a bug:**
  - In Q5 step 2 (KOtBu), the app gives the Hofmann alkene as major.
  - The key gives the tetrasubstituted Zaitsev alkene 60 %.
  - This is the same question as Ch 7 Q13b (see "Questions for Peter").
- **No wrong addition product is shown today.** Three messages are misleading, though (P0 below).

---

## P0: misleading messages today (fix first, before any new chemistry)

### P0‑1 An alkene with HBr/HCl/H₂SO₄ says "No leaving group was found"
- **Symptom:** 1-methylcyclopentene + HBr (Q3a) → `notCovered: no_site`. The text reads as if nothing happens, but this is the main reaction of Ch 8.
- **Fix (whole class):** before `no_site`, check for a non-aromatic C=C (or an alkane with a radical reagent). Until the addition engine lands, return a new key, `addition_not_yet`: "This is an alkene: addition reactions (Ch 8) aren't covered yet." Once S1 lands, that branch calls the addition engine instead.
- **Test:** seed case: 1-methylcyclopentene + HBr → `addition_not_yet` (then replaced by the S1 product test).

### P0‑2 Drawn oxidants get an SN/E role
- **Symptom:** `guessBox` estimates a role for any drawn reagent:
  - ozone drawn as `[O-][O+]=O` → "nucbase (hydroxide/alkoxide-like)";
  - H₂O₂ and peracetic acid → "weak (water-like)".
  
  With a halide substrate, this gives a confident-looking SN/E prediction ("estimated", but still wrong).
- **Fix:** `guessBox` returns `null` and the reason `not_sn_e_reagent` when the molecule has:
  - an O–O bond (peroxide, peracid, ozone);
  - X–X (Br₂, Cl₂, I₂);
  - H–H;
  - boron (BH₃);
  - or is O₃.
  
  The catalogue entries added in S1 match these first anyway.
- **Test:** `reagentMatching` rows for drawn O₃, H₂O₂, CH₃CO₃H, Br₂, H₂ and BH₃ → no estimated box.

### P0‑3 A substrate with both a C=C and a leaving group
- **Symptom:** an allylic or homoallylic alcohol with HBr is predicted as substitution only. Addition to the C=C is never mentioned.
- **Fix:** when the substrate has a C=C that isn't part of the reacting allyl/benzyl system and the reagent can add to alkenes (HX, X₂, H₃O⁺), add the warning `alkene_also_reacts`: "The C=C can also add HBr; only the substitution is shown."
- **Test:** one seed case with the warning key.

---

## What is new, and what can be reused

| Need | New | Reuse (verified in a spike unless marked) |
|---|---|---|
| Markovnikov H–X / H₃O⁺, with shifts | protonation step | **`cationPathways`** works on a protonated alkene: set the C=C to single and attach a dummy atom (Xe) as `lgAtoms` on the carbon that becomes C⁺. It then lists hydride/methyl shifts and ring expansion as for SN1/E1. Spike: 3,3-dimethylbut-1-ene → methyl shift to 3°; 2b → no shift (3°→3° isn't higher); 2d → benzylic. **Only protonate at the end that gives the higher-scored cation.** Protonating the other end produces fake "hydride shifts" back to the Markovnikov cation |
| Nucleophile attaches to C⁺ | nothing | `buildProduct` with `attach` (already used by SN1) |
| Anti / syn addition, faces | `faces.js` (new) | 3D placement on an MMFF conformer (the pattern of `anti.js`), then OpenChemLib reads the parities: **build** spike. `chair.js` is not needed for additions |
| Anti-Markovnikov (radical HBr, BH₃) | radical stability score, B → less substituted C | `cationScore` gives the same 3° > 2° > 1° order, and allylic/benzylic is the same idea, so reuse it as `radicalScore` |
| Radical halogenation of alkanes | C–H site finder | carbon classing from `analyse` |
| Ozonolysis | C=C → 2 C=O edit | `buildProduct` (`removeBonds` + `attach` O with order 2); `getFragments()` splits the products; `namer.js` names them (spike: 6-oxoheptanal, hexanedial, heptane-2,6-dione, pentan-3-one + formaldehyde) |
| Sequences (2n–q, Q10, Q11) | composite steps ("BH₃ then H₂O₂/OH⁻", "O₃ then DMS") | `runSequence` unchanged, once `predict` dispatches alkenes and alkanes to the new engine |
| Reverse synthesis (Q10, Q11) | forward search (P1‑6) | `planner.js` `sameAs`, `runSequence` |
| Viewer | halonium, radical chain with fishhooks, concerted 4-centre, epoxidation, hydrogenation | `mech-view.js` fields (`partial`, `pdouble`, `pOrbital`, `move`, flags, quiz), the hill (radical chain = two humps), `density.js`, `mech-place.js` |
| Names | simple oxiranes (2k, Q3f) | `namer.js` names everything else except fused/bridged rings (2a, 2c, 2m: PubChem when online) |
| Study sheet | Ch 8/10 cards and terms | `study.json` format, Try it, `reactions.test.mjs` example checks |

---

## Design: an addition engine that never guesses

### Data, not code paths
Add a new file, **`data/additions.json`**. It works like `rules.json`: rows checked in order, first match wins, and rows may carry `tags: course | disagree`.

**Keys in `when`:**
- `sub`: `alkene` | `alkane` | `epoxide`;
- `act`: the reagent's addition role (list below);
- `heat`, `light`, `peroxide`.

**Fields in `then`:**
- `intermediate`: `cation` | `halonium` | `radical` | `concerted` | `surface` | `ozonide` | `none`;
- `regio`: `markovnikov` | `anti-markovnikov` | `none`;
- `stereo`: `syn` | `anti` | `none`;
- `shifts`: true | false;
- `adds`: `{ more: frag, less: frag }`, the fragments that go to the more and the less substituted carbon;
- `stereospecific`: Y | N;
- `template`: the viewer template;
- `reasons`: reason keys.

**Example rows:**
- `HX` → cation, Markovnikov, shifts, `stereo: none`, stereospecific N.
- `HBr` + `peroxide` → radical, anti-Markovnikov, `stereo: none`, N. HCl or HI with peroxide falls through to the plain HX row, with the reason `only_hbr_radical`.
- `X2` → halonium, anti, Y.
- `X2` + `H2O` (or an alcohol solvent) → halonium; OH (or OR) on the more substituted C; anti; Y.
- `X2` + `light` on an alkane → radical substitution (radical halogenation rows below). On an alkene: `notCovered: allylic_needs_nbs`, because Br₂ still adds to the C=C, and allylic bromination needs NBS.
- `H3O` (H₂SO₄ aq, H₃O⁺, "1) conc. H₂SO₄ 2) H₂O, heat") → cation, Markovnikov, OH, shifts, N. Alkene + acid with heat and no water → `notCovered: hydration_vs_dehydration` (the equilibrium goes back to the alkene).
- `BH3` (two-part step) → concerted, anti-Markovnikov, syn, Y; B → OH with retention.
- `H2cat` (H₂ with Pd/C, Pt or Ni) → surface, syn, Y (only visible when new stereocentres form).
- `peracid` (mCPBA, PhCO₃H, CH₃CO₃H, RCO₃H) → concerted epoxide, syn, Y; cis alkene → cis epoxide.
- `O3` (+ DMS or Zn/HOAc) → ozonide, cleavage, `stereo: none`. Oxidative workup (H₂O₂) → `notCovered` until needed.
- `epoxide` + `H3O`/`HO`/`enzyme` → SN2 opening (Q1).
  - Basic/neutral Nu → less substituted C. Acid → more substituted C.
  - Anti, so a cis epoxide gives the trans diol.
  - This reuses the SN2 inversion code.

**New catalogue entries (`data/reagents.json`), each with an `add` role:**
- **Ionic halogenation:** Br₂ (CH₂Cl₂, CCl₄), Cl₂.
- **Halohydrins:** Br₂/H₂O, Cl₂/H₂O (Q9's "aqueous chlorine").
- **Radical:** Br₂/hν, Cl₂/hν (light/heat).
- **Radical HBr:** HBr/ROOR (peroxides, heat).
- **Hydroboration:** BH₃·THF, plus its partner H₂O₂/NaOH (`pairsWith`).
- **Hydrogenation:** H₂ with Pd, Pd/C, Pt, PtO₂ or Ni.
- **Peracids:** mCPBA, PhCO₃H, CH₃CO₃H, RCO₃H (as text, and drawn).
- **Ozonolysis:** O₃, plus its partners DMS, Zn/HOAc, Zn/H₂O.
- **Acids and solvents:** H₂SO₄ (aq), H₃O⁺, dilute acid; HI/ether, HCl/CHCl₃.

**`parseSequence`** must keep "BH₃·THF followed by H₂O₂/HO⁻" and "O₃ followed by DMS" as one step, and must also merge a BH₃ step with a following H₂O₂ step (2i writes them as 1.) and 2.)). BH₃ with no oxidation step stops with `needs_workup` rather than naming an organoborane.

### Regiochemistry
- **Markovnikov:** protonate the end that gives the higher cation score (`cationScore`: carbons on C⁺, +1 allylic/benzylic). Then run `cationPathways` for shifts (a shift is taken only if it raises the score, as in SN1/E1). The nucleophile goes to the final C⁺.
  - Equal scores at both ends (e.g. pent-2-ene + HBr) → both products, "competing". Never pick one.
- **Halonium opening** (X₂/H₂O, X₂/ROH, Q9): water attacks the more substituted carbon. That carbon carries more δ+ in the bridged ion; decide it with the same score.
  - No shifts: the bridged ion doesn't rearrange.
  - Equal scores → both regio-isomers.
- **Anti-Markovnikov, radical HBr:** Br• adds to the end that leaves the more stable radical (same score), so Br ends up on the less substituted C.
- **Anti-Markovnikov, hydroboration:** B goes to the carbon with fewer carbons attached (sterics plus the partial + on the other carbon); H goes to the other.
  - Equal → both.
- **Radical halogenation of alkanes:** list C–H types by class (3° > 2° > 1°).
  - **Br₂:** the most substituted class is major; others minor. Two different positions of the top class → competing.
  - **Cl₂:** every position is lit as "competing (mixture)", with a reason that Cl• is much less selective than Br• (Hammond postulate). No percentages unless Peter confirms which textbook's relative rates to show (see questions).
  - Allylic/benzylic C–H → `notCovered: allylic_needs_nbs`.

### Stereochemistry
- **How products are built (decided by the spike):**
  - Take the lowest-energy MMFF94s+ conformer of the substrate.
  - Make the C=C single, and place each new atom 1.1–1.5 Å from its carbon along the π normal, on the chosen face. An epoxide O goes over the middle of the bond.
  - Call `setParitiesValid(0)` and re-read through a molfile so OpenChemLib computes R/S from the 3D coordinates.
  
  All 14 stereo products below were checked this way. Where the key draws wedges, the result matched it, and a second, independent check (`sides`: the sign of each substituent's bond along the ring normal, in a fresh conformer of the product) agreed.
  
  ⚠️ One early spike run built the wrong diastereomer of 2i, and I didn't pin down why (a different conformer seed and normal convention). So **every stereo seed case must be checked twice in the test**: by ID code, and by the `sides` face check.
- **Syn vs anti:**
  - syn: H₂/cat, BH₃, peracid;
  - anti: X₂, X₂/H₂O. For anti, the bridged ion forms on face f and the nucleophile comes in from the other face.
  - `stereo: none` (cation or radical): both faces are equally likely at the planar centre. Build both and dedupe by ID code. They are diastereomers if there was another stereocentre (label them "mixture"), or enantiomers otherwise.
- **Racemic vs a single stereoisomer.** These rules come from the course and the textbook, and are shown as text on the card:
  - Achiral substrate + achiral reagent → a chiral product forms as a **racemate**.
    - Show one enantiomer drawn, labelled "(±) racemic: the other enantiomer forms equally".
    - Tests compare against the expected ID code **or its mirror image**, but the diastereomer must match exactly.
    - A meso product (2,3-dibromobutane from E-but-2-ene) is labelled meso.
  - Substrate with a defined stereocentre (wedges, as in 2a, 2c, 2i, 2j) → a **single stereoisomer** (one face, decided below). Undefined stereocentre (no wedges) → as today: say the stereo isn't defined and draw the relative configuration only.
- **"Stereospecific":**
  - **Y** for syn/anti mechanisms: bridged ion, concerted, surface.
  - **N** for cation and radical additions and for radical substitution.
  - This follows the course key (Q8 counts Br₂/H₂O on 1-methylcyclohexene as stereospecific), so the row is tagged `course`.
  - The card adds the textbook meaning: "cis and trans alkenes give different stereoisomers" (cis → cis epoxide, Q3f/2k; E- and Z-pent-2-ene + Br₂ give different diastereomers).

### Facial selectivity (the spike result)
- **Probe:** for each face, put a point 2.0 Å above each alkene carbon along the π normal. Sum (3.0 Å − r) over every atom within 3.0 Å of the point, then add the two carbons' sums.
  - Average over up to 16 conformers, Boltzmann-weighted at 298 K.
  - Report the ratio (more hindered ÷ less hindered) and how many conformers agree.

| Case | Ratio | Conformers agreeing | Key's face | Spike verdict |
|---|---|---|---|---|
| 2a 3-tBu-cyclohexene + peracid | 1.71 | 8/8 | anti to tBu | ✅ decided |
| 2i 6-tBu-1-methylcyclohexene + BH₃ | 1.34 | 8/8 | anti to tBu | ✅ decided (close to the threshold) |
| 2j 3-iPr-1-methylcyclopentene + Br₂/H₂O | 1.57 | 8/8 | Br⁺ anti to iPr | ✅ decided |
| 2m α-pinene + H₂/Ni | 1.71 | 1/1 (rigid) | anti to the CMe₂ bridge → cis-pinane | ✅ decided |
| 2c 4a-methyl-octalin + H₂/Pd | 1.04 | 5/8 | anti to the angular CH₃ → trans-decalin | ❌ **3D can't separate the faces** |
| Q4 1,5-dimethylcyclopentene + Br₂ (worksheet's printed answer) | 1.19 | 3/3 | Br⁺ anti to CH₃ | ⚠️ direction right, too weak to decide |
| Controls: 3-Me-, 4-Me- and 4-tBu-cyclohexene | 1.05–1.13 | – | mixture (textbook) | ✅ correctly undecided |

**Rule for the app (three tiers, the tier shown on the card):**
1. **Computed:** ratio ≥ 1.3 and every conformer within 1.5 kcal/mol agrees → "reagent adds to the less hindered face (computed from the 3D shape)". This covers 2a, 2i, 2j and 2m.
2. **Course rule:** not decided by 3D, but exactly one allylic stereocentre carries a non-H group (2c's angular CH₃, Q4's 5-CH₃), and the 3D direction doesn't contradict it → "adds anti to the CH₃ (textbook rule; the 3D shape shows only a small difference, so expect some of the other isomer)". Tagged `course`.
3. **Otherwise:** both faces → "mixture of diastereomers: facial selectivity not covered", with both products shown and no ranking.

Keep 1.3 as a constant in `additions.json` and calibrate it in S2 on more cases: norbornene (exo), camphene, 3-methylcyclohexene (mixture) and 1-methyl-4-tBu-cyclohexene (mixture). If 2i drops below the threshold, it falls to tier 2 with the same answer.

### Intermediates (what the card and viewer say)
- **Carbocation:** as SN1/E1, with shifts.
- **Bromonium/chloronium:** three-membered, no shifts, anti opening.
- **Radical:** planar or shallow pyramid, 3° > 2° > 1°, and allylic/benzylic best.
  - Br₂ much more selective than Cl₂, because the H-abstraction step is uphill for Br• (late, product-like transition state: Hammond).
- **Concerted (BH₃, peracid):** no intermediate, so no shifts. This is why hydroboration never rearranges.
- **Hydrogenation:** "H atoms delivered from the metal surface to one face". No mechanism detail beyond that.

### Ozonolysis
- Each non-aromatic C=C becomes two C=O: `removeBonds` + attach O (order 2) on each carbon. Then split with `getFragments()`.
  - A ring C=C gives one chain with two carbonyls (2l, 2p, Q11).
  - =CH₂ gives formaldehyde (Q3b).
- Name each fragment with the normal flow. All of these names were checked with OPSIN.
- Reductive workup (DMS, Zn/HOAc) keeps aldehydes. Oxidative workup (H₂O₂) is `notCovered` until the course needs it.
- **Show the "cut and number" teaching aid:** number the carbons the way the key does (2l, Q11), so the student can map old atoms to new.

---

## The viewer: new templates (as data in `mech-templates.js`, text in `mech-text.json`)

**New renderer fields** (general, not one per mechanism):
- `fishhook`: a single-barbed arrow that moves one electron;
- `radical`: a role with one dot;
- `bridge`: a role bonded to two atoms with a formal +;
- `ts4`: a four-centre transition state with partial bonds (`partial` already exists);
- `surface`: a grey bar standing for the metal;
- `fragments`: a frame showing separate products.

`density.js` needs one new rule: a radical carbon is "poor", one level only.

| Template | Frames | Quiz point |
|---|---|---|
| `addHX` (HX, H₃O⁺) | π attacks H (C⁺ on the more substituted end) → optional shift frames (from SN1) → Nu attacks C⁺ → (H₃O⁺: deprotonate, `proton: true`) | "Which carbon gets the H?" |
| `halonium` (X₂) | π attacks X₂, X–X breaks → bridged X⁺ (Br⁻ leaves) → Br⁻ backside attack → anti product | "Which face does Br⁻ come from?" |
| `halohydrin` (X₂/H₂O) | as `halonium`, then water attacks the **more substituted** C, then deprotonation. This is Q9's answer E | "Which carbon does water attack?" |
| `hbrRadical` | initiation: RO–OR → 2 RO• (fishhooks); RO• + H–Br → ROH + Br•; propagation 1: Br• adds to the CH₂ end → 3° radical; propagation 2: R• + H–Br → product + Br• (chain); termination (optional) | "Which end does Br• add to?" |
| `radicalHalogenation` (X₂/hν) | initiation X–X → 2 X•; propagation 1 X• takes the 3° H; propagation 2 R• + X₂ → R–X + X•; termination | "Which H does Br• take?" |
| `hydroboration` | four-centre transition state (B to the less substituted C, H to the other, same face) → organoborane → the oxidation, summarised in one frame ("B replaced by OH with retention") | "Same face or opposite?" |
| `epoxidation` | concerted transfer of O (butterfly transition state, 4 arrows) → epoxide + carboxylic acid | — |
| `hydrogenation` | H₂ on the surface → alkene lies flat on its less hindered face → two H's delivered (syn) | "Which face touches the metal?" |
| `ozonolysis` | one summary frame: C=C cut, both ends become C=O. The molozonide/ozonide is mentioned in WHY, not drawn | — |
| `epoxideOpening` (Q1) | (acid) the epoxide O is protonated by Tyr–OH while the Nu (Asp–CO₂⁻) attacks the backside of one C → ring-opened ester (the intermediate Q1a asks for) → note that hydrolysis gives the trans diol | "Which way does the C–O bond break?" |

---

## P1: Ch 8/10 features the worksheet needs

| # | Feature | Worksheet Qs | Notes |
|---|---|---|---|
| 1 | **Addition engine, ionic regiochemistry**: HX, H₃O⁺, HBr/ROOR, X₂/H₂O regiochemistry, ozonolysis; result card with *Intermediate / Regiochemistry / Stereospecific? / Racemic?* lines | 2b, d, e, g, l, p; 3a–c; 6, 7; Q11 | Sessions S1–S2 |
| 2 | **Stereo additions + facial selectivity** (`faces.js`) | 2a, c, h, i, j, k, m, n, o; 3d–g; 4; 8 | S2 |
| 3 | **Radical halogenation of alkanes**, Br₂ vs Cl₂ selectivity | 2f, o, p; Q10 | S3 |
| 4 | **Epoxide opening** (SN2 with an epoxide LG, regiochemistry by conditions, anti → trans diol) | 1 | S2 (engine), S4 (template) |
| 5 | **Viewer templates** in the table above, including fishhooks | 1, 2, 9 | S4 |
| 6 | **Planner: forward search** (Q10, Q11) | 10, 11 | S5, design below |
| 7 | **Classify helper** for "pick all that apply" (Markovnikov, anti-Markovnikov, stereospecific) | 6–8 | The card lines from P1‑1 already answer each option. Add *Classify* in ranking mode: paste lines like `C=CC(C)(C)C >> H2SO4` and get a ✓ table. S5 |
| 8 | **Study sheet**: Ch 8/10 cards + glossary (list below) | all | S5 |
| 9 | **Course-style names** for new classes ("2-bromo-1-methylcyclohexanol" without "‑1‑ol" locants is fine in OPSIN) | 2, 3 | Check `courseStyle` on halohydrins, diols and dibromides |
| 10 | **Names offline for simple oxiranes** (2-ethyl-3-methyloxirane) | 2k, 3f, 8B | `namer.js` refuses heterocycles today. Small extension for an oxirane ring with alkyl groups only; check with OPSIN |

### Planner (P1‑6): search forward, don't list routes
- **Why:**
  - Today's `planner.js` tries 16 fixed routes, all starting from an OH or an X. Q10 starts from an alkane and Q11 ends with ozonolysis, so listing routes by hand would need dozens of new rows and would still miss combinations.
  - A forward search over the reagents uses the same engine and adds no chemistry rules.
- **How:**
  - Breadth-first, depth ≤ 4, following only each state's **major** product (the planner already judges routes by the major product).
  - Reagents are chosen by the functional group the state has:
    - alkane → Br₂/hν, Cl₂/hν;
    - halide → NaOEt, KOtBu, H₂O/EtOH heat;
    - alcohol → H₂SO₄/Δ, TsCl, SOCl₂, PBr₃, HBr;
    - alkene → HBr, HBr/ROOR, H₃O⁺, Br₂, Br₂/H₂O, BH₃, H₂/Pd, peracid, O₃/DMS.
  - Memoise `predict` by (ID code, reagent).
  - Stop a branch when the state's ID code was seen before.
  - With about 4–9 reagents per state and memoising, depth 4 is a few hundred `predict` calls.
  - Ring E2 costs about 1 s (chairs), so run it async with a progress line, or in a module worker (no build step needed).
  - Report all shortest routes, then the near misses with their reason (minor only, a stop).
- **Stereo match:** if the route's product is racemic, accept the target or its mirror image. Q10's target is drawn as one enantiomer of a racemate. Keep the constitution-only match when the target has no stereo.
- **Tests:** P‑Q10 (methylcyclohexane → trans-2-bromo-1-methylcyclohexanol: Br₂/hν → NaOEt → Br₂/H₂O) and P‑Q11 (2,2-dimethylcyclopentanol → heptane-2,6-dione: H₂SO₄/Δ → O₃/DMS). Both must find the key's route as the shortest.

### Selectivity and ranking tools
- **Radical selectivity:** *Rank C–H by radical stability* in ranking mode. One molecule: each H type gets a place (3° > 2° > 1°, with allylic/benzylic flagged as best but "use NBS"). A Br₂-vs-Cl₂ note explains why Br₂ gives one product.
- **Q5's yield split:** the app must **not** produce percentages. It ranks the E2 products (major, minor, minor) with reasons, and the student matches the worksheet's given yields to that order.
  - This is where the KOtBu disagreement shows. Checked in the audit spike:
    - **KOtBu (app today):** exocyclic (major) > trisubstituted > tetrasubstituted.
    - **The key:** tetrasubstituted 60 % > trisubstituted 25 % > exocyclic 15 %. That is exactly the app's **NaOEt** order.
  - **The trans-diaxial rule matters here too:**
    - HCl gives both diastereomers of 1-chloro-1,2-dimethylcyclohexane (the cation is flat).
    - In one of them, C2 has no H anti to the axial Cl, so that diastereomer **cannot** give the tetrasubstituted alkene at all. With NaOEt its major product is the trisubstituted one.
    - The step-2 card should run both diastereomers and say so, instead of the `ring_e2_warning` it shows for the undefined input today.
  - Until Peter answers, the Q5 card carries the `disagree` tag text.

## P2: nice to have
- Allylic bromination with NBS (not on this worksheet).
- Oxidative ozonolysis (H₂O₂ → acids), OsO₄/KMnO₄ syn-dihydroxylation, oxymercuration. These are standard Ch 8 reactions but not on this worksheet: add them as rows when the course reaches them.
- Names offline for fused/bridged products (2a's 7-oxabicyclo[4.1.0]heptane, decalins, pinane): PubChem when online.
- 3D button for the stereo moments (bromonium back-side attack, the hydroboration face, the hydrogenation face). Reuse the Chair tab's 3Dmol frames, and highlight the probe points from `faces.js`.
- Termination steps and the chain length in the radical viewer.

---

## Seed cases (all read from the key with confidence unless marked)
Every product name below was given by `namer.js`, or (for unnamed fused/bridged rings and oxiranes) built as a name and read back by **OPSIN** with an ID-code match (2026-11-14). Stereo SMILES come from the **build** spike and were checked with the **sides** spike. ± = racemic: the test accepts either enantiomer.

For 2a, 2c, 2i, 2j, 2m and Q4-5, the key fixes only the *relative* configuration: which face is wedged. The substrate SMILES pick one enantiomer, so the test should also run the mirror-image substrate and expect the mirror-image product. I could not tell from the handwriting which absolute enantiomer is drawn, and it doesn't change the answer.

| id | Substrate (SMILES) | Steps | Expected major product (SMILES) | Name | Checks |
|---|---|---|---|---|---|
| A-2a | `CC(C)(C)[C@@H]1CCCC=C1` | CH₃CO₃H | `CC(C)(C)[C@H]1[C@@H]2O[C@@H]2CCC1` | 2-tert-butyl-7-oxabicyclo[4.1.0]heptane, O anti to tBu | face tier 1; name offline: none (fused) |
| A-2b | `CC=C(C)C(C)(C)C` | HCl | `CCC(C)(Cl)C(C)(C)C` ± | 3-chloro-2,2,3-trimethylpentane | no shift (3°→3°). ⚠️ key drawing unclear, see questions |
| A-2c | `C[C@@]12CCCCC1=CCCC2` | H₂, Pd | `C[C@]1(CCCC2)[C@H]2CCCC1` (trans-fused) | 4a-methyldecahydronaphthalene (trans) | face tier 2 (course rule) |
| A-2d | `C/C=C/c1ccccc1` | HBr | `CCC(Br)c1ccccc1` ± | (1-bromopropyl)benzene | benzylic C⁺ |
| A-2e | `C=C(C)CCC` | HBr, ROOR, Δ | `CCCC(C)CBr` ± | 1-bromo-2-methylpentane | radical, anti-Markovnikov |
| A-2f | `CC1CCCCC1` | Br₂, hν | `CC1(Br)CCCCC1` | 1-bromo-1-methylcyclohexane | 3° C–H |
| A-2g | `CCC(CC)=CC` | H₂SO₄ (aq) | `CCC(O)(CC)CC` | 3-ethylpentan-3-ol | Markovnikov |
| A-2h | `C1=CCCCC1` | Br₂ | `Br[C@@H]1[C@H](CCCC1)Br` ± | (1S,2S)-1,2-dibromocyclohexane (trans) | anti |
| A-2i | `CC1=CCCC[C@H]1C(C)(C)C` | 1) BH₃ 2) H₂O₂/OH⁻ | `C[C@H]([C@@H](CCC1)C(C)(C)C)[C@@H]1O` | (1R,2R,3R)-3-tert-butyl-2-methylcyclohexan-1-ol | syn + face tier 1; OH and C2-H anti to tBu (CH₃ ends up cis to tBu) |
| A-2j | `CC1=C[C@H](C(C)C)CC1` | Br₂, H₂O | `CC(C)[C@H](CC[C@]1(C)O)[C@@H]1Br` | (1S,2S,3S)-2-bromo-1-methyl-3-(propan-2-yl)cyclopentan-1-ol | Br⁺ anti to iPr; OH on the 3° C |
| A-2k | `CC/C=C\C` | PhCO₃H | `CC[C@@H]1O[C@@H]1C` ± | (2S,3R)-2-ethyl-3-methyloxirane (cis) | cis → cis; namer can't name it offline yet |
| A-2l | `CC1=CCCCC1` | 1) O₃ 2) DMS | `CC(=O)CCCCC=O` | 6-oxoheptanal | ring opening |
| A-2m | `CC1=CC[C@@H]2C[C@H]1C2(C)C` | H₂, Ni | `C[C@@H]1[C@@H](C2)C(C)(C)[C@@H]2CC1` | 2,6,6-trimethylbicyclo[3.1.1]heptane (cis-pinane) | face tier 1; also run with the other enantiomer |
| A-2n | `CCC(C)(O)C(C)C` | 1) H₂SO₄, Δ 2) Br₂ | `CCC(C)(Br)C(C)(C)Br` ± | 2,3-dibromo-2,3-dimethylpentane | step 1 already ✅ |
| A-2o | `CC1CCCC1` | 1) Br₂, hν 2) NaOEt 3) Cl₂, H₂O | `C[C@@](CCC1)([C@@H]1Cl)O` ± | (1R,2R)-2-chloro-1-methylcyclopentan-1-ol (trans) | via 1-bromo-1-methylcyclopentane, 1-methylcyclopentene |
| A-2p | `C1CCCCC1` | 1) Cl₂, hν 2) NaOEt 3) O₃ then DMS | `O=CCCCCC=O` | hexanedial | step 2 already ✅ |
| A-2q | `CC(C)C1=CCCCC1` | 1) BH₃·THF then H₂O₂/HO⁻ 2) TsCl, py 3) NaOEt | `CC(C)C1CCCC=C1` ± | 3-(propan-2-yl)cyclohexene | via `CC(C)[C@@H](CCCC1)[C@H]1O` ± (trans-2-isopropylcyclohexanol); steps 2–3 already ✅ |
| A-Q3a | `CC1=CCCC1` | HBr | `CC1(Br)CCCC1` | 1-bromo-1-methylcyclopentane | |
| A-Q3b | `C=C(CC)CC` | 1) O₃ 2) DMS | `CCC(=O)CC` + `C=O` | pentan-3-one + formaldehyde | |
| A-Q3c | `CCC=C(C)C` | HBr, ROOR | `CCC(Br)C(C)C` ± | 3-bromo-2-methylpentane | |
| A-Q3d | `CC/C=C/C` | Br₂ | `CC[C@@H]([C@@H](C)Br)Br` ± | (2R,3S)-2,3-dibromopentane | key draws no stereo: constitution check + stereo from anti |
| A-Q3e | `CC1=CCCCC1` | 1) BH₃·THF 2) H₂O₂/OH⁻ | `C[C@@H](CCCC1)[C@H]1O` ± | (1S,2S)-2-methylcyclohexan-1-ol (trans) | |
| A-Q3f | `CC/C=C\C` | PhCO₃H | same as A-2k | | |
| A-Q3g | `CC1=CCCC1` | Br₂, H₂O | `C[C@@](CCC1)([C@@H]1Br)O` ± | (1R,2R)-2-bromo-1-methylcyclopentan-1-ol (trans) | |
| A-Q4-1 | `CC1CCC(O)C1C` | 1) TsCl 2) NaOEt | `CC1C(C)=CCC1` | 1,5-dimethylcyclopentene | already ✅ |
| A-Q4-2 | `CC1CCC(O)C1C` | H₂SO₄, Δ | `CC1=C(C)CCC1` | 1,2-dimethylcyclopentene | already ✅; ⚠️ key left this arrow blank |
| A-Q4-3 | `CC1=CCCC1C` | HBr | `CC1CCCC1(C)Br` | 1-bromo-1,2-dimethylcyclopentane | also from `CC1=C(C)CCC1` |
| A-Q4-4 | `CC1=CCCC1C` | HBr, ROOR | `CC1CCC(Br)C1C` | 1-bromo-2,3-dimethylcyclopentane | |
| A-Q4-5 | `CC1=CCC[C@H]1C` | Br₂ | `C[C@H](CC[C@@H]1Br)[C@]1(C)Br` | (1S,2S,5R)-1,2-dibromo-1,5-dimethylcyclopentane | printed answer; face tier 2 |
| A-Q4-6 | `CC1=C(C)CCC1` | Br₂ | `C[C@@](CCC1)([C@]1(C)Br)Br` ± | (1R,2R)-1,2-dibromo-1,2-dimethylcyclopentane (trans) | printed answer |
| A-Q5 | `CC1CCCC=C1C` | 1) HCl 2) KOtBu | step 1: `CC1CCCCC1(C)Cl` (both diastereomers); step 2: see questions | 1-chloro-1,2-dimethylcyclohexane | ⚠️ `disagree` |
| A-Q10 | `CC1CCCCC1` | 1) Br₂, hν 2) NaOEt 3) Br₂, H₂O | `C[C@@](CCCC1)([C@@H]1Br)O` ± | (1R,2R)-2-bromo-1-methylcyclohexan-1-ol (trans) | |
| A-Q11 | `CC1(C)CCCC1O` | 1) H₂SO₄, Δ 2) O₃ then DMS | `CC(=O)CCCC(C)=O` | heptane-2,6-dione | step 1 already ✅ |
| A-classify | Q6 A, D, F Markovnikov; Q7 B, C anti-Markovnikov; Q8 B, C, F stereospecific | | | | P1‑7 |
| A-Q1 (pattern) | `C[C@@H]1O[C@@H]1C` | H₃O⁺ (or enzyme) | racemic trans opening → (2R,3R)-butane-2,3-diol ± | | ⚠️ not from the key (the key uses R/R′). Build and check in S2 |
| A-ctrl | `C[C@H]1CCC=CC1` | H₂O/Br₂ | both diastereomers, "facial selectivity not covered" | | face tier 3 control |

**Lesson from this audit:** one hand-typed stereo SMILES (2h) was the meso isomer, not the trans one. OPSIN caught it. Seed stereo SMILES must come from a build plus an OPSIN round trip, never from typing.

---

## Proposed order of work (each session ends usable, tests first)

Every session follows the "Saving tokens" rules in `mechanisms-plan.md`:
- logic in Node, with one-line failures;
- `npm run test:reactions` while working, `npm test` once before committing;
- `sw.js` VERSION bumped, and new files added to `ASSETS`;
- `ch8-10-study-guide.md` updated (⏳ → ✅).

1. **S1: P0 + the ionic addition engine (Node first, then a minimal card).**
   - P0‑1 to P0‑3.
   - `data/additions.json`, the new catalogue entries, `parseSequence` composite steps.
   - New `addition.js` with `predictAddition(OCL, mol, reagent, opts, data)` (returns the same result shape as `predict`); `predict` dispatches alkenes to it.
   - Rows: HX + shifts, H₃O⁺, HBr/ROOR, ozonolysis (no stereo yet: products ± with `stereo: none`).
   - Result card lines: Intermediate, Regiochemistry, Stereospecific? Lamps: one "Addition" lamp, so SN/E lamps aren't faked.
   - **Tests first:** A-2b, 2d, 2e, 2g, 2l, Q3a–c, Q4-3/4, Q11, 2p step 3; classify rows for Q6/Q7; one Playwright check (1-methylcyclopentene + HBr card).
2. **S2: stereo additions + faces + epoxide opening.**
   - New `faces.js`: probe, tiers, constants in `additions.json`.
   - 3D placement builder for syn/anti/epoxide.
   - Racemic/meso/single labels; X₂, X₂/H₂O, BH₃ (two-part), H₂/cat, peracid; epoxide + H₃O⁺/HO⁻ (SN2 opening).
   - **Tests first:** A-2a, c, h, i, j, k, m, n, o (step 3 on the alkene), q step 1, Q3d–g, Q4-5/6, Q8 classify, A-Q1 pattern, A-ctrl, plus calibration cases (norbornene exo, 3-methylcyclohexene mixture). Every stereo case is checked by ID code **and** the `sides` face check.
3. **S3: radicals.**
   - Alkane C–H sites, Br₂/hν vs Cl₂/hν rows, radical stability ranking in ranking mode, `allylic_needs_nbs`.
   - Full sequences A-2f, 2o, 2p, Q10 (runSequence).
   - Answer the Q5 question with Peter first; then add A-Q5 with the agreed tag.
4. **S4: viewer.**
   - Renderer fields: fishhook, radical dot, bridge, ts4, surface, fragments.
   - Templates `addHX`, `halonium`, `halohydrin`, `hbrRadical`, `radicalHalogenation`, `hydroboration`, `epoxidation`, `hydrogenation`, `ozonolysis`, `epoxideOpening`; text in `mech-text.json`; quiz points.
   - Extend `reactions-ui.test.mjs` to open each one once, with the overlap check on every frame.
   - Peter reviews the look once.
5. **S5: planner, classify, Study sheet.**
   - Forward-search planner (P‑Q10, P‑Q11, and the existing P‑10b/c/13b still pass).
   - *Classify* in ranking mode.
   - Study sheet cards and glossary (below); `reactions.test.mjs` checks each card's example.
   - Update CLAUDE.md's file table.

### Study sheet: cards and glossary (S5)
- **Cards:**
  - Electrophilic addition (HX, H₃O⁺: Markovnikov, shifts, racemic);
  - Halogenation and halohydrins (bridged ion, anti, water on the more substituted C);
  - Hydroboration–oxidation (concerted, syn, anti-Markovnikov, no shifts);
  - Hydrogenation (syn, less hindered face);
  - Epoxidation and epoxide opening (syn, cis → cis; opening is anti);
  - Ozonolysis (cut and number);
  - Radical halogenation (initiation/propagation/termination; Br₂ selective, Cl₂ not);
  - Radical HBr (peroxides; only HBr);
  - **one summary table card:** reagent → intermediate → regio → stereo → stereospecific? This answers Q3, Q4 and Q6–8 at a glance.
- **Glossary:** Markovnikov's rule, anti-Markovnikov, syn addition, anti addition, stereospecific, stereoselective, facial selectivity, halonium ion, halohydrin, racemic mixture, meso compound, hydroboration, organoborane, peroxy acid, epoxide (oxirane), ozonolysis, ozonide, oxidative cleavage, reductive workup, radical, homolytic cleavage, fishhook arrow, initiation, propagation, termination, bond dissociation energy, Hammond postulate, radical stability, chain reaction.

---

## Questions for Peter / the instructor
1. **Q2b:**
   - The key's product drawing is hard to read: the right-hand carbon shows only two branches.
   - The engine's answer is **3-chloro-2,2,3-trimethylpentane**: Markovnikov to the 3° cation, and **no methyl shift**, because 3° → 3° gains nothing.
   - Is that the key's answer, or does your course expect a methyl shift here?
2. **Q4:** the arrow from the alcohol to 1,2-dimethylcyclopentene has no letter in the key. The app (and Ch 7) says **D, H₂SO₄/heat**: hydride shift to the 3° cation. Please confirm.
3. **Q5:**
   - The key assigns 60 % to the **tetrasubstituted** alkene with KOtBu.
   - Standard rules, and the app, say a bulky base favours the **Hofmann** (exocyclic) alkene.
   - This is the same question as Ch 7 Q13b. Which does your course expect?
4. **Q10:** the question says "starting with cyclohexane" but draws methylcyclohexane, and the key uses methylcyclohexane. A typo in the worksheet?
5. **2c:**
   - The 3D shape can't tell the two faces of this octalin apart (ratio 1.04).
   - The key's answer (H₂ anti to the angular CH₃, giving trans-4a-methyldecalin) would be shown as a **course rule**, not a computed result.
   - Is "add from the face opposite the nearest substituent" the rule your course wants in general?
6. **Radical rates:** should the app show textbook relative rates per H (for example Br₂ 1 : 82 : 1600, Cl₂ 1 : 3.9 : 5.2 for 1° : 2° : 3°)? If so, which textbook's numbers? Otherwise it stays qualitative (Br₂ selective, Cl₂ a mixture).
7. **Stereospecific (Q8C):**
   - The course counts Br₂/H₂O on 1-methylcyclohexene as stereospecific (an anti mechanism).
   - Some books use the word only when different alkene isomers give different products.
   - The app will follow your course and add the textbook meaning as a second line. OK?

---

## Kickoff prompt for the first build session (S1)

> Build session S1 of `docs/ch8-10-app-gaps.md` in molecule-lab-repo: the P0 fixes and the ionic addition engine.
>
> **Read first, and only these:**
> - CLAUDE.md;
> - `docs/ch8-10-app-gaps.md`: the sections "P0", "What is new, and what can be reused", "Design: an addition engine that never guesses" (Data, Regiochemistry, Ozonolysis) and "Seed cases";
> - the "Saving tokens" rules in `docs/mechanisms-plan.md`.
>
> **Scope (Node first, tests first):**
> 1. Add the S1 seed cases to `tests/seed-cases.json` and see them fail:
>    - A-2b, 2d, 2e, 2g, 2l, Q3a, Q3b, Q3c, Q4-3, Q4-4, Q11;
>    - 2p step 3;
>    - the Q6/Q7 classify rows;
>    - the three P0 rows.
> 2. **P0‑1 to P0‑3:** the `addition_not_yet` message (later replaced by the engine), `guessBox` refusing oxidants/X₂/H₂/BH₃, and the `alkene_also_reacts` warning.
> 3. **Data:**
>    - `data/additions.json` (rows as data, `course`/`disagree` tags);
>    - new reagent entries with an `add` role;
>    - `parseSequence` composite steps ("BH₃·THF followed by H₂O₂/HO⁻", "O₃ followed by DMS", and merging a numbered H₂O₂ step into BH₃).
> 4. **`addition.js` with `predictAddition`**, same result shape as `predict`:
>    - Markovnikov via `cationPathways`: protonate only the end that gives the higher cation score, with a dummy Xe atom as `lgAtoms`;
>    - HBr/ROOR anti-Markovnikov by radical score;
>    - H₃O⁺ hydration;
>    - ozonolysis by graph edit + `getFragments()`.
>    
>    `predict` dispatches alkenes to it. Products where stereo isn't decided yet are marked `stereo: none` (± or mixture), never given an invented stereo.
> 5. **A minimal result card:** one Addition lamp, and the lines Intermediate / Regiochemistry / Stereospecific?. Add one Playwright check: 1-methylcyclopentene + HBr.
>
> **Rules:**
> - Don't build stereo additions, faces, radicals or viewer templates: those are S2–S4.
> - Run `npm run test:reactions` while working and `npm test` once at the end.
> - Bump `sw.js` VERSION and add new files to `ASSETS`.
> - Mark the S1 problems ✅ in `docs/ch8-10-study-guide.md`.
> - Commit with a why-message; ask before pushing.
> - Never commit `docs/ch8-10-worksheet/`.
