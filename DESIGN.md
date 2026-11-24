---
version: alpha
colors:
  background: "#171C24"
  surface: "#202731"
  subtle: "#293340"
  text: "#F2F4F7"
  muted: "#BAC3CF"
  border: "#465365"
  controlBorder: "#718196"
  primary: "#FF8A50"
  onPrimary: "#25180F"
  accentText: "#FFAB7D"
  scoreboard: "#111820"
typography:
  display:
    fontFamily: "Barlow Condensed, Impact, sans-serif"
  sans:
    fontFamily: "Inter Variable, Inter, sans-serif"
  mono:
    fontFamily: "JetBrains Mono Variable, monospace"
rounded:
  control: "6px"
  panel: "8px"
spacing:
  unit: "4px"
  gutter: "24px"
  mobileGutter: "16px"
omitted:
  - section: components
    reason: "Runtime component contracts are maintained in UX-CONTRACT.md and the shared theme."
---

# Siklab broadcast design

## Overview

The CSPC intramurals dashboard helps students see the official leaders immediately, find competitions across sports, culture, special events and E-games, and follow published outcomes and completed events. Staff use the same broadcast identity to manage the event. English Philippine campus product; Asia/Manila dates. The hosting target is Vercel Hobby with Supabase Free; local development remains available.

The signature is the official multicolor torch with department crests, a compact leaders strip, and dark scoreboard headers over layered charcoal competition cards. Dark is the first-visit default; the original light broadcast appearance remains available. Standings precede the daily schedule on phones. No large marketing hero delays the tally.

## Colors

Canonical runtime owner: src/app/theme.css (runtime-owned Model B). DESIGN.md mirrors accepted values; globals.css, public.css and staff.css consume or adapt those semantic variables. Do not duplicate palette literals in components or downstream styles.

Dark screen palette: canvas #171C24, card surface #202731, raised controls/dialogs #293340, off-white text #F2F4F7, muted text #BAC3CF, dividers #465365, control borders #718196, Siklab orange #FF8A50, accent text #FFAB7D and scoreboard #111820. Orange actions use dark #25180F text. Success #88D4A7, warning #F1CA79, error #FFABA2 and info #B4CCF2 each have their own dark semantic surface.

The retained light palette uses white #FFFFFF, subtle #F3F4F6, text #15181C, muted #59616D, border #E1E4E8, Siklab orange #D8471C, accessible accent text #B93612 and scoreboard charcoal #171B20. Success #187445, warning #925600 and error #B42318 remain semantic. Control borders use #7A8494 for clear boundaries. Department accent tokens remain centrally owned; color always supplements visible names and status text.

Tokens map by role: canvas/public-canvas own page backgrounds, bg owns cards, raised/control-bg own interactive surfaces, and on-scoreboard/on-primary/on-danger own text on filled surfaces. Medal chips have separate background/text pairs in each palette. The root light token set also owns print; the screen-only dark selector applies unless data-theme is light. All logo plates, control borders, focus, overlays and semantic colors are defined in theme.css, never duplicated downstream.

## Typography

Self-hosted Barlow Condensed 600/700 for display headings, Inter Variable for interface text and JetBrains Mono Variable for numeric data. Scores, times, ranks, medal counts, metrics and timestamps use tabular numerals. The interface uses 16px body text, 14px form labels and supporting copy, and metadata at least 12px. Compact score labels remain legible at 375px and 200% zoom.

## Layout

1200px public container and 1280px staff workspace, 24px desktop /16px phone gutters. Mobile-first breakpoint 768px. Shared navigation, document scrolling and naturally sized forms remain operable. The public header scrolls; only the compact leaders strip stays pinned on phones. The seven-team official tally is first in the overview and sticky beside the daily schedule on desktop. Bracket and table overflow belong to their own accessible regions, never the document. Scroll offsets account for the actual leaders strip height.

## Elevation & Depth

Layered charcoal surfaces with restrained borders make cards and controls readable without pure black. The light alternative retains white surfaces and subtle gray canvases. Theme-owned shadow-card and shadow-panel tokens give the official tally, timeline and compact fixture cards restrained depth. Low-opacity diagonal college-color gradients express two competing colleges; fields with more than two distinct colleges use all seven canonical college accent tokens in a restrained rainbow; an approved single-college winner receives a subtle winner tint and explicit label. Dark scoreboard headers retain hierarchy in both themes.

## Shapes

6px controls, 8px panels. Restrained angled/ribbon details borrow from the torch rather than introducing an unrelated sports brand. Source logos remain unchanged; tightly cropped transparent WebP derivatives preserve complete silhouettes and reserve dimensions.

## Components

Shared Brand uses the supplied official logo on a light surface. Shared CollegeIdentity and CollegeCrest own department identity across standings, leaders, competition cards, result banners, brackets and staff participants. Branding metadata owns BC presentation of stored BUHI and exact user-supplied department names.

ThemeProvider owns the document theme and browser preference; ThemeScript initializes it before body paint and ThemeToggle is the only appearance control. First visits ignore the OS appearance and use dark. Valid dark/light preferences use the localStorage key siklab-theme, synchronize across tabs and survive navigation/reload. Unavailable storage falls back to an in-memory preference for the document. Root markup and no-JavaScript screens default to dark. A fixed-footprint 44px-minimum toggle appears in every public/staff header and equivalent auth header, with a sun/moon icon and accessible action label. Native controls receive the matching color-scheme; print remains light and hides appearance controls.

Foreground/background pairs change together rather than fading through low-contrast intermediate colors. Button and link micro-interactions animate borders only; reduced motion disables those transitions too.

PublicApp owns filters and navigation; ScoreViews owns published results and completed field cards, official standings and leaders; StudentViews owns date-grouped cards and college result banners; BracketView owns connected rounds. StaffApp.run owns staff busy/error/success and idempotent retries. Shared shadcn/Radix primitives own buttons, dialogs, confirmations and status choices; StaffDialog owns bounded modal editors, dirty-close confirmation and focus restoration. Sonner owns action-specific transient feedback without shifting page content. Recovery previews remain inside their modal with upload progress and persistent errors. Password reveal controls retain fixed geometry. Native select/date/time popups retain platform behavior. Lucide icons supplement labels. Tailwind supplies component utilities without Preflight; ui.css adapts the primitives to the canonical Siklab tokens and portal surfaces.

Manage official tally is the primary administrator operation. Manual tally edits are an authorized event operation for administrators and superadministrators. The editor accepts desired Points/Gold/Silver/Bronze totals, then shows a warning, reason and before/after confirmation. Public totals combine championship awards and separate correction offsets; actual awarded-category counts remain unchanged. Full account and system history, including correction audit details, remains superadministrator-only.

Public Relations reuses the staff broadcast shell as an explicitly read-only workspace: Schedules, Published results, Published standings and My password only. Athletics race schedules use the existing native-select form language for Time trial versus Final race. Superadministrator discipline creation and guarded deletion reuse StaffDialog, StaffForm, canonical danger actions, official-reason fields and visible dependency explanations; no new visual system or destructive browser-native confirmation is introduced.

## Do's and Don'ts

Preserve shared points ranks, private drafts, legacy pending submissions, rule holds, role visibility, corrections and recovery. Game staff only manage assigned schedules/statuses; administrators own outcomes, entries, brackets, direct tally totals and optional certified/calculated awards. Published scoreless winners have explicit Won/Lost labels. Completed field events need no result revision. Administrator publication uses shared before/after tally confirmation when an award changes. Safe rescheduling preserves scoring fingerprints. Medal counts combine published championship podium awards and explicitly confirmed college tally offsets; match wins and completion statuses never generate medals. Do not invent live clocks, periods or scores from an ongoing status. No public staff controls, print/export/share controls, neon gradients or oversized hero. Visible focus, touch targets, stale notices, stable loading and reduced motion are required.

## Verification

Run typecheck, tests, build, strict premium audit, designmd lint and browser verification. Inspect both themes on public and staff screens at 375/768/1440, native controls, keyboard, 200% zoom, reduced motion and loading/empty/error/stale states. Test startup paint, preference persistence, cross-tab changes, invalid/unavailable storage, light print and forced colors. Normal text meets 4.5:1 contrast and relevant control boundaries/focus meet 3:1. Browser mutations use the disposable rehearsal database; historical evidence remains unchanged.
