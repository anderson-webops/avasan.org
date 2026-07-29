# Hero Design QA

## Evidence

- Source visual truth: `/var/folders/l2/hs_3m4zd08d89jp_dzj2fqmw0000gn/T/codex-clipboard-fa7dcc09-b693-43d3-b445-ad865d23aaab.png`
- Normalized source: `/tmp/avasan-hero-source-normalized.png`
- Desktop implementation: `/tmp/avasan-hero-implementation-desktop.png`
- Mobile implementation: `/tmp/avasan-hero-implementation-mobile.png`
- Combined comparison: `/tmp/avasan-hero-comparison.png`
- Desktop viewport and CSS size: 1026 × 904 at device scale 1
- Source pixels: 2052 × 1978; normalized to 1026 × 989, then cropped below the 85-pixel browser chrome to
  1026 × 904
- Desktop implementation pixels: 1026 × 904
- Mobile viewport, CSS size, and implementation pixels: 390 × 844 at device scale 1
- State: homepage, dark system theme, no hover or focus state

## Full-view Comparison

The original title consumed most of the viewport and wrapped across four lines. The revised hero preserves the centered
composition, serif/sans hierarchy, palette, background treatment, supporting copy, and primary link while changing the
headline to “Math & code.” and reducing its responsive maximum from 7.5rem to 4.75rem. The result leaves the title as
the clear first read without letting it dominate the entire page. The added math destination is rendered as a quiet
underlined text link beneath the filled computer-science button, so computer science remains the unmistakable primary
action.

The mobile capture confirms the shorter title remains on one line, the supporting copy stays readable, the primary link
retains a full-width tap target, and the secondary math link remains subordinate without clipping or horizontal
overflow.

Focused-region comparison was unnecessary because the page contains one compact hero and every typographic and
interactive element is legible in the normalized full-view comparison. The mobile capture provides the additional
responsive evidence.

## Required Fidelity Surfaces

- Fonts and typography: The existing DM Serif Display and DM Sans pairing is preserved. The revised title uses a
  smaller 2.75rem–4.75rem range, 1.0 line height, and slightly relaxed negative tracking.
- Spacing and layout rhythm: The content column is reduced from 58rem to 44rem, with tighter eyebrow and lede spacing.
  The hero remains vertically and horizontally centered at both tested sizes.
- Colors and visual tokens: Existing light/dark tokens, contrast, focus color, and teal primary action are unchanged.
- Image quality and asset fidelity: No raster imagery or icons are introduced. The existing subtle background treatment
  remains sharp and unobtrusive.
- Copy and content: The headline is shortened to “Math & code.” The explicit grade-school teaching description remains,
  with `cs.avasan.org` as the filled primary action and `math.avasan.org` as the quieter secondary action.

## Findings

No actionable P0, P1, or P2 issues remain. The intentional headline and scale differences directly address the user’s
request rather than representing fidelity drift.

## Comparison History

1. Earlier finding: the four-line headline was oversized and occupied most of the visible page.
2. Fix: shortened the headline, lowered the responsive type range, narrowed the intro column, and tightened vertical
   spacing.
3. Follow-up request: add `math.avasan.org` without diluting the primary computer-science destination.
4. Fix: placed the math destination below the primary button as an underlined text link with the same accessible focus
   treatment and restrained arrow motion.
5. Post-fix evidence: the normalized desktop comparison shows a compact one-line title and clear primary/secondary
   action hierarchy; the 390 × 844 capture confirms the same hierarchy without mobile overflow.

## Interaction and Runtime Checks

- The primary link resolves uniquely to `https://cs.avasan.org`.
- The secondary link resolves uniquely to `https://math.avasan.org`.
- Desktop and mobile browser consoles report no errors.
- The homepage renders as a single semantic `h1` with both destinations visible and keyboard-focusable.

## Follow-up Polish

No P3 follow-up is necessary for this scoped adjustment.

final result: passed
