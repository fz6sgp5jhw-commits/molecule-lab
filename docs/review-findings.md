# Code-review findings on 0942189 (Session 3 mechanisms)

High-effort review of `0942189`. Line numbers refer to that commit. Most severe first.

**Status:** all nine were fixed in `44c0a87` ("Fix code-review findings on the Session 3 mechanisms"), with tests. Check that commit before reworking any of them.

1. **`mech-templates.js:95`**: the SN1 "which carbon will Nu bond to?" tap quiz has no `if: 'major'` guard, and its answer is always this card's `c`.
   *Failure:* 3-bromobut-1-ene + EtOH, heat, Quiz on. Tapping the other allylic end (also C⁺ in the resonance form) is marked "Not quite", though both ends are correct.
2. **`mech-templates.js:66`**: the yes/no shift quiz answers from `canShift`, which ignores allylic resonance.
   *Failure:* allylic SN1 with Quiz on. The answer "No… it stays put" is followed by the resonance frame, which shares the + over both ends.
3. **`reactions-ui.js:398`**: neutral Nu labels come from `r.label`, which is "drawn reagent" for a drawn, uncatalogued reagent.
   *Failure:* draw isopropanol as the reagent and Watch SN1. The oxonium frame reads "O⁺ (H)(drawn reagent)".
4. **`mech-view.js:706`**: `build()` makes new frame objects, but `st.answered` is keyed by the old ones.
   *Failure:* answer the shift quiz, then tick "Skip proton transfers". The same question is asked again.
5. **`tests/reactions-ui.test.mjs:160`**: no test opens the allylic resonance frame, the hydride-shift arc, or the PBr₃/SOCl₂ preludes. CLAUDE.md says: "add tests for every new feature".
   *Failure:* a regression in the gh landing-spot code or the resonance merge would ship unnoticed.
6. **`mech-view.js:384`**: long-label start/end anchoring applies to any heteroatom label of 3+ characters, not just the activated leaving group.
   *Failure:* an NH₂ substituent to the left of Cα is drawn as "H₂N", offset from its atom, so bonds stop short of the glyph.
7. **`reactions-ui.js:379`** (efficiency): `mechOptions` and `sn2Stereo` re-run `analyse()` although `onMolecule` already stored the result in `st.an`.
   *Failure:* every Watch or lamp click redoes ring perception and site analysis two or three times.
8. **`reactions-ui.js:420`** (reuse): `carbonsOn` and `clsName` duplicate reactivity.js's carbon counting and the `CLS_TEXT` map.
   *Failure:* the two counts can drift, so the dialog's `{cation2}` class could disagree with the engine's score.
9. **`mech-view.js:216`** (simplification): `f.forceAll` is never set by any template, and nothing uses the `{ P, R }` that `drawFrame` returns.
   *Failure:* dead paths make the role resolver harder to follow.
