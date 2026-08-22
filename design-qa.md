# Mattis M1 design QA

**Source visual truth paths**

- Home: `generated_images/exec-7d72ce25-c718-4775-b2a1-80dbc487a223.png`
- Algebra chat: `generated_images/exec-c94204db-17d6-4a76-9bf5-ea6179c5401c.png`
- Geometry chat: `generated_images/exec-cbf91979-39df-4ce3-920f-a51546eb57c5.png`

**Implementation screenshot paths**

- `design-qa/images/home-implementation.jpg`
- `design-qa/images/algebra-implementation.jpg`
- `design-qa/images/geometry-implementation.jpg`

**Viewport and normalization**

- CSS viewport: 426 × 923 px; mobile portrait; device scale factor 1.
- Home and geometry sources: 852 × 1846 px, normalized to 426 × 923 px.
- Algebra source: 850 × 1850 px, resized to cover and center-cropped to 426 × 923 px.
- Browser captures: 426 × 923 app region. Wider 1363 × 936 cloud-browser captures were cropped to
  the 426 × 923 app region without rescaling.

**State**

- Synthetic student Nora, 10th grade.
- Home plan before session start.
- Algebra homework phase with three existing messages.
- Geometry homework phase with the triangle task and three existing messages.

**Full-view comparison evidence**

- `design-qa/images/home-comparison.jpg`
- `design-qa/images/algebra-comparison.jpg`
- `design-qa/images/geometry-comparison.jpg`

The reference is on the left and the rendered implementation is on the right in every comparison.

**Focused-region comparison evidence**

No additional crops were needed: typography, task cards, figures, messages, composer, controls,
icons, and bottom navigation are readable at original comparison resolution.

**Required fidelity surfaces**

- Fonts and typography: the Newsreader-style serif fallback and compact sans-serif UI reproduce the
  reference hierarchy. Implementation text is slightly smaller on home to keep the full plan and
  navigation visible in one viewport; this is an accepted responsive constraint.
- Spacing and layout rhythm: main regions, card widths, mobile margins, task hierarchy, and anchored
  composer match the reference. The explicit `Neste oppgave` control adds one planned-session action
  below the composer and is an intentional product decision.
- Colors and visual tokens: warm cream canvas, navy type, coral action, teal learning state, and gold
  summary accents map consistently to the documented design tokens.
- Image quality and asset fidelity: official Lucide SVG assets are used for UI icons. The geometry
  figure is deterministic mathematical content. The abstract home motif and Mattis tutor glyph are
  code-native PoC stand-ins because the user explicitly rejected AI-generated production
  illustrations; licensed production brand assets have not yet been sourced.
- Copy and content: Norwegian Bokmål demo copy matches the chosen Nora scenario and avoids excess
  explanatory text. Session structure and pedagogical prompts remain visible inside the chat UI.

**Findings**

- [P2] Production illustration assets are not yet sourced.
  Location: home hero and tutor avatar.
  Evidence: the source mock uses a bespoke abstract illustration; the implementation uses a
  deterministic code-native approximation to respect the user's no-AI-illustration constraint.
  Impact: acceptable for PoC testing, but not a production-ready asset pipeline.
  Fix: commission or license a small, coherent vector brand kit with provenance and replace the PoC
  stand-ins before production.
- [P2] Client-side interaction verification is blocked in the cloud preview client.
  Location: onboarding radio controls, form submission, capture/delete, task switching, and composer.
  Evidence: native links navigate, but stateful React controls do not change and the onboarding form
  falls back to a native GET despite waiting for hydration. No app-origin console error is emitted.
  Impact: the browser-rendered visuals are verified, but the complete interactive journey cannot be
  certified in this browser session.
  Fix: run the committed Playwright journey in a normal Chromium runtime or re-check after the cloud
  preview client can load/hydrate the Next.js client bundle.

**Open Questions**

- Choose the long-term source for licensed brand illustration assets before production design lock.

**Implementation Checklist**

- Run all engineering gates and preserve the browser captures in the M1 archive.
- Re-run the primary Playwright journey in a normal Chromium runtime.
- Replace PoC decorative stand-ins with licensed, traceable brand assets before a production release.

**Comparison history**

- Iteration 1: the home illustration stacked above the session card and pushed persistent controls
  below the viewport. The hero was repositioned beside the welcome copy, timeline rows were reduced,
  and the revised 426 × 923 capture shows the complete plan, CTA, appointment, and bottom navigation.
- Iteration 1: the session help control inherited full-width button chrome. It was reset to a compact
  text action; the revised algebra and geometry captures show the composer anchored at the bottom.
- Iteration 1: custom inline icon paths were present. They were replaced with locally stored official
  Lucide assets under the ISC license; post-fix captures show consistent icons in navigation,
  timeline, composer, and actions.
- Remaining P2 blockers are the production asset source and cloud-preview client hydration described
  above.

**Browser verification**

- Browser-rendered implementation screenshots: captured in Chrome from the running Sites preview.
- Primary interactions tested: native route links; onboarding weekly-goal selection; onboarding
  submission; session start. Native link navigation worked. Stateful React interactions did not
  hydrate in this cloud preview client, so remaining main-flow interactions were not certified.
- Console errors checked: no application-origin warnings or errors. Repeated errors originate from
  the cloud-browser extension metadata content script and are unrelated to Mattis.

**Follow-up Polish**

- [P3] Evaluate a slightly larger home greeting after the final production hero asset is available.
- [P3] Add the active progress segment between the phase markers if it remains legible at small sizes.

final result: blocked
