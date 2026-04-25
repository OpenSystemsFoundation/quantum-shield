---
version: alpha
name: QuantumShield
description: Enterprise post-quantum readiness interface for Salesforce security and compliance teams.
colors:
  primary: "#0b5cab"
  primary-strong: "#0b3a7a"
  primary-soft: "#eef4fc"
  primary-border: "#dbe7f6"
  background: "#f4f6fa"
  background-alt: "#eaeef4"
  surface: "#ffffff"
  surface-alt: "#fbfcfe"
  line: "#d9dfe8"
  line-soft: "#e5e9f0"
  line-strong: "#c3cbd8"
  ink: "#0d1424"
  ink-soft: "#1f2a40"
  ink-muted: "#3d4a62"
  muted: "#5b6885"
  muted-soft: "#8391a8"
  success: "#0a7a4a"
  success-bg: "#dff3e8"
  warning: "#8a5a00"
  warning-bg: "#fbecc9"
  high: "#a3411d"
  high-bg: "#fbddd0"
  critical: "#8a1722"
  critical-bg: "#f6d1d6"
  advisory: "#2e4a7a"
  advisory-bg: "#dbe3f3"
  hndl: "#5a2a8a"
  hndl-bg: "#e9dcf5"
  on-primary: "#ffffff"
  on-critical: "#ffffff"
  on-high: "#ffffff"
  on-warning: "#ffffff"
typography:
  h1:
    fontFamily: Source Serif 4
    fontSize: 52px
    fontWeight: 500
    lineHeight: "1.05"
    letterSpacing: "0px"
  h2:
    fontFamily: Source Serif 4
    fontSize: 34px
    fontWeight: 500
    lineHeight: "1.16"
    letterSpacing: "0px"
  panel-title:
    fontFamily: Inter Tight
    fontSize: 13px
    fontWeight: 600
    lineHeight: "1.35"
    letterSpacing: "0px"
  body:
    fontFamily: Inter Tight
    fontSize: 13px
    fontWeight: 400
    lineHeight: "1.45"
    letterSpacing: "0px"
  body-lg:
    fontFamily: Inter Tight
    fontSize: 16px
    fontWeight: 400
    lineHeight: "1.5"
    letterSpacing: "0px"
  label-caps:
    fontFamily: Inter Tight
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
  xs: 3px
  sm: 4px
  md: 6px
  lg: 8px
  xl: 10px
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
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.md}"
    padding: 7px 12px
    typography: "{typography.body}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: 14px 16px
  app-sidebar-item-active:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: 7px 10px
  severity-critical:
    backgroundColor: "{colors.critical}"
    textColor: "{colors.on-critical}"
    rounded: "{rounded.sm}"
    padding: 2px 7px
  severity-high:
    backgroundColor: "{colors.high}"
    textColor: "{colors.on-high}"
    rounded: "{rounded.sm}"
    padding: 2px 7px
  severity-medium:
    backgroundColor: "{colors.warning}"
    textColor: "{colors.on-warning}"
    rounded: "{rounded.sm}"
    padding: 2px 7px
  severity-low:
    backgroundColor: "{colors.advisory-bg}"
    textColor: "{colors.advisory}"
    rounded: "{rounded.sm}"
    padding: 2px 7px
  success-pill:
    backgroundColor: "{colors.success}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.sm}"
    padding: 2px 7px
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
    rounded: "{rounded.sm}"
    padding: 2px 7px
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

QuantumShield should feel like an auditor-grade security workbench: direct,
quiet, and built for repeated operational use. The visual system favors dense
information, restrained hierarchy, and clear status signals over marketing
decoration. The CLI is the recommended product path; the browser UI supports
setup, scan progress, findings triage, and artifact export.

The interface should look trustworthy without looking generic. Use the serif
family for major product and report headings, the sans family for task surfaces,
and the mono family for identifiers, algorithms, timestamps, endpoints, and rule
IDs.

## Colors

The palette is cool, low-saturation, and enterprise-oriented.

- **Primary navy (#0b5cab):** Primary actions, active navigation, selected
  states, and product emphasis.
- **Deep navy (#0b3a7a):** Hover state for primary actions and stronger
  enterprise emphasis.
- **Paper surfaces (#ffffff, #fbfcfe):** Cards, panels, reports, tables, and
  toolbars.
- **Slate foundation (#f4f6fa, #eaeef4):** Application background and muted
  workspace bands.
- **Severity colors:** Use red, rust, amber, blue, green, and purple only for
  security meaning. Do not reuse them as decorative accents.

Avoid one-note blue pages. Navy is the identity color, but screens need neutral
surfaces, border structure, and severity colors to carry the operational tone.

## Typography

Use `Source Serif 4` for hero headings, report headings, and large numeric
summaries. Use `Inter Tight` for all UI controls, body copy, tables, and panels.
Use `JetBrains Mono` for technical identifiers and compact metadata.

Letter spacing is `0` for normal text. Uppercase metadata may use `0.08em`.
Do not scale type with viewport width. Compact panels should use panel-scale
headings, not hero-scale type.

## Layout

Application screens use a 52px top bar, a 240px sidebar, and a dense main work
area. Repeated objects may be cards; page sections should remain unframed unless
there is a real tool, modal, report page, or repeated item to frame.

Use stable dimensions for scan rows, filters, severity summaries, and toolbars
so dynamic counts and long labels do not shift the layout. Tables should favor
scanability: sticky headers, compact rows, clear columns, and technical metadata
in mono.

## Elevation & Depth

Depth is functional, not decorative. Use shallow shadows for report previews and
floating drawers. Most panels should rely on borders, surface contrast, and
spacing rather than large shadows.

## Shapes

Corners are small and utilitarian: 6px for buttons and controls, 8px for cards,
and 3-4px for tags and severity pills. Use pill radius only for badges that are
visually token-like, such as the landing badge.

## Components

Primary buttons are navy with white text. Secondary buttons are white with a
strong border. Ghost buttons are reserved for low-risk actions such as reset,
back, and clear controls.

Severity pills are uppercase mono labels. Use:

- Critical: white text on `critical`
- High: white text on `high`
- Medium: white text on `warning`
- Low/advisory: advisory text on advisory background
- HNDL: purple text on purple background

Finding tables should open details in a drawer or adjacent detail region, not a
full-page jump. Export buttons should stay near the active report surface.

## Do's and Don'ts

Do:

- Keep the CLI-first story visible in public copy.
- Use direct labels such as "Start scan", "Download PDF", and "Browser setup".
- Mark mock, sample, or demo data clearly.
- Preserve read-only and no-proxy trust language.
- Prefer concise operational copy over promotional language.

Don't:

- Add decorative blobs, gradients, or oversized marketing cards to work surfaces.
- Use severity colors for brand decoration.
- Hide setup caveats behind vague reassurance.
- Imply legal attestation or complete compliance coverage.
- Request broader Salesforce OAuth scopes without documenting the reason.
