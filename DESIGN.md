---
version: alpha
name: QuantumShield
description: Free, open-source post-quantum readiness interface for Salesforce teams, aligned with the OpenSF design system.
colors:
  primary: "#00579f"
  primary-strong: "#00457e"
  primary-soft: "#e6f1fb"
  primary-border: "#bcd6ff"
  background: "#f8f9ff"
  background-alt: "#eceef6"
  surface: "#ffffff"
  surface-alt: "#f1f3fb"
  line: "#e2e5ee"
  line-soft: "#eceef6"
  line-strong: "#c1c7d4"
  ink: "#181c21"
  ink-soft: "#262b33"
  ink-muted: "#414752"
  muted: "#565d6a"
  muted-soft: "#8a92a2"
  success: "#1f7a48"
  success-bg: "#dff3e8"
  warning: "#8c4100"
  warning-bg: "#fdebd9"
  high: "#a3411d"
  high-bg: "#fbddd0"
  critical: "#ba1a1a"
  critical-bg: "#fbdcdc"
  advisory: "#445d80"
  advisory-bg: "#dce8fb"
  hndl: "#5a2a8a"
  hndl-bg: "#e9dcf5"
  on-primary: "#ffffff"
  on-critical: "#ffffff"
  on-high: "#ffffff"
  on-warning: "#ffffff"
typography:
  h1:
    fontFamily: Poppins
    fontSize: 52px
    fontWeight: 600
    lineHeight: "1.06"
    letterSpacing: "0px"
  h2:
    fontFamily: Poppins
    fontSize: 34px
    fontWeight: 600
    lineHeight: "1.12"
    letterSpacing: "0px"
  panel-title:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 600
    lineHeight: "1.35"
    letterSpacing: "0px"
  body:
    fontFamily: Inter
    fontSize: 13.5px
    fontWeight: 400
    lineHeight: "1.5"
    letterSpacing: "0px"
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: "1.5"
    letterSpacing: "0px"
  label-caps:
    fontFamily: Inter
    fontSize: 10.5px
    fontWeight: 600
    lineHeight: "1.2"
    letterSpacing: "0.08em"
  mono:
    fontFamily: JetBrains Mono
    fontSize: 11.5px
    fontWeight: 400
    lineHeight: "1.45"
    letterSpacing: "0px"
rounded:
  xs: 4px
  sm: 6px
  md: 8px
  lg: 14px
  xl: 20px
  pill: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
  3xl: 48px
components:
  app-background:
    backgroundColor: "{colors.background}"
    textColor: "{colors.ink}"
  app-background-alt:
    backgroundColor: "{colors.background-alt}"
    textColor: "{colors.ink-soft}"
  surface-subtle:
    backgroundColor: "{colors.surface-alt}"
    textColor: "{colors.ink-muted}"
  divider:
    backgroundColor: "{colors.line}"
    textColor: "{colors.ink}"
  divider-soft:
    backgroundColor: "{colors.line-soft}"
    textColor: "{colors.ink}"
  divider-strong:
    backgroundColor: "{colors.line-strong}"
    textColor: "{colors.ink}"
  org-chip:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.md}"
    padding: 5px 10px
  org-chip-border:
    backgroundColor: "{colors.primary-border}"
    textColor: "{colors.primary-strong}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    padding: 10px 16px
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "{colors.primary-strong}"
    textColor: "{colors.on-primary}"
  button-secondary:
    backgroundColor: "{colors.background-alt}"
    textColor: "{colors.primary-strong}"
    rounded: "{rounded.md}"
    padding: 7px 12px
    typography: "{typography.body}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: 18px 20px
  app-sidebar-item-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: 7px 10px
  severity-critical:
    backgroundColor: "{colors.critical}"
    textColor: "{colors.on-critical}"
    rounded: "{rounded.pill}"
    padding: 2px 8px
  severity-high:
    backgroundColor: "{colors.high}"
    textColor: "{colors.on-high}"
    rounded: "{rounded.pill}"
    padding: 2px 8px
  severity-medium:
    backgroundColor: "{colors.warning}"
    textColor: "{colors.on-warning}"
    rounded: "{rounded.pill}"
    padding: 2px 8px
  severity-low:
    backgroundColor: "{colors.advisory-bg}"
    textColor: "{colors.advisory}"
    rounded: "{rounded.pill}"
    padding: 2px 8px
  success-pill:
    backgroundColor: "{colors.success}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.pill}"
    padding: 2px 8px
  success-panel:
    backgroundColor: "{colors.success-bg}"
    textColor: "{colors.success}"
    rounded: "{rounded.lg}"
    padding: 14px 16px
  warning-panel:
    backgroundColor: "{colors.warning-bg}"
    textColor: "{colors.warning}"
    rounded: "{rounded.xl}"
    padding: 18px 20px
  high-panel:
    backgroundColor: "{colors.high-bg}"
    textColor: "{colors.high}"
    rounded: "{rounded.lg}"
    padding: 14px 16px
  critical-panel:
    backgroundColor: "{colors.critical-bg}"
    textColor: "{colors.critical}"
    rounded: "{rounded.lg}"
    padding: 14px 16px
  hndl-pill:
    backgroundColor: "{colors.hndl-bg}"
    textColor: "{colors.hndl}"
    rounded: "{rounded.pill}"
    padding: 2px 8px
  muted-caption:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    typography: "{typography.label-caps}"
  muted-caption-soft:
    backgroundColor: "{colors.muted-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.mono}"
---

## Overview

QuantumShield is an Open Systems Foundation (OpenSF) project: free for
everyone and open source. Its look follows the OpenSF design system, "The
Precision Curator" (see `AGENTS.md` in the
[opensf site repo](https://github.com/elgeffe/opensf)): editorial, high-trust,
calm. Boundaries come from tonal layering rather than hard lines, depth is felt
rather than seen, and the OpenSF blue carries the identity.

The app itself is still an auditor-grade workbench: dense information, clear
status signals, and operational copy. The public pages (landing, install,
docs, trust pages) use the OpenSF header, sky-wash hero and tonal footer; the
app screens use the same tokens with tighter spacing.

## Colors

All tokens live in `src/styles/design-system.css`. The OpenSF names
(`--primary`, `--surface-container-*`, `--gradient-cta` …) are canonical; the
older `--navy-*`, `--bg`, `--line` names remain as aliases so existing
components keep working.

- **Primary blue (#00579f → #0070c9):** the OpenSF CTA gradient for primary
  actions; `#00579f` alone for links, active navigation and emphasis.
- **Surfaces (#f8f9ff, #f1f3fb, #eceef6, #e6e8f0, #ffffff):** stack tones to
  express depth: page base, tinted section beds and sidebars, chip beds and
  secondary buttons, and white elevated cards.
- **Slate ink (#181c21, #414752):** text is slate, never pure black.
- **Severity colors:** red, rust, amber, blue-grey, green and purple carry
  security meaning only. Do not reuse them as decoration.

## Typography

Use `Poppins` (500/600 only) for headings, large numeric summaries and
buttons. Use `Inter` (400/500/600) for body copy, tables, panels and labels.
Use `JetBrains Mono` for technical identifiers: algorithms, endpoints, rule IDs
and timestamps.

All three families are self-hosted as woff2 files (latin and latin-ext subsets)
under `public/fonts/` and loaded via `/fonts/fonts.css`; pages must not load
fonts from third-party CDNs.

Headings use slightly negative tracking (`-0.01em`). Uppercase metadata may use
`0.05em` to `0.08em`. Compact panels use panel-scale headings, not hero-scale
type.

## Layout

Public pages use a 1200px container with a sticky, glassy header and the
OpenSF footer. Application screens use a 56px top bar, a 240px tonal sidebar,
and a dense main work area.

Use stable dimensions for scan rows, filters, severity summaries and toolbars
so dynamic counts and long labels do not shift the layout. Tables favor
scanability: sticky headers, compact rows, clear columns, technical metadata in
mono. Everything must work at 320px wide without sideways scrolling.

## Elevation & Depth

Ambient shadows only (`--shadow-card`, `--shadow-ambient`), tinted slate. If a
shadow looks like a shadow, it is too strong. Prefer a tonal background shift
over a border; where a container sits on a same-coloured surface, use the
ghost border (`--ghost-border`). Hairlines stay only where data needs them:
table rows and dividers inside a card.

## Shapes

Buttons and inputs use 8px corners, cards 14px, landing tiles and the hero
preview 20px. Severity pills, tags, chips and segmented controls are pills.

## Components

Primary buttons use the OpenSF gradient with white Poppins text and a soft blue
drop. Secondary buttons sit on `surface-container-high` with no border. Ghost
buttons are transparent with blue text, for low-risk actions.

Inputs follow the OpenSF field: `surface-container-highest` fill with a 2px
bottom accent that turns primary on focus.

Severity pills are uppercase mono labels:

- Critical: white text on `critical`
- High: white text on `high`
- Medium: white text on `warning`
- Low/advisory: advisory text on advisory background
- HNDL: purple text on purple background

Finding tables open details in an adjacent drawer, not a full-page jump. Export
buttons stay near the active report surface.

## Do's and Don'ts

Do:

- Present QuantumShield as a free, open-source OpenSF project. No pricing,
  sales or consulting language.
- Keep the CLI-first story visible in public copy.
- Use direct labels such as "Start scan", "Download PDF" and "Browser setup".
- Mark mock, sample or demo data clearly.
- Preserve read-only and no-proxy trust language.

Don't:

- Use 1px borders to section layouts; shift the tone instead.
- Use severity colors for brand decoration.
- Use gradient-clipped headline text, glowing dots, or icon-in-a-square tiles.
- Hide setup caveats behind vague reassurance.
- Imply legal attestation or complete compliance coverage.
- Request broader Salesforce OAuth scopes without documenting the reason.
