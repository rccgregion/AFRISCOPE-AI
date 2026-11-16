# AfriScope AI — Design System

A calm, trustworthy interface for evidence-based decision intelligence. Inspired by modern healthcare product design — the Cleargrin dental-clinic reference: soft sage greens, generous whitespace, rounded geometry, friendly pill CTAs, floating glass cards, and icon-led service grids — realised as a deliberate blend of four tactile styles: **glassmorphism**, **neumorphism**, **claymorphism**, and **skeuomorphism**.

> **Reference:** Cleargrin Dental Clinic (cleargrindental.co) — “Healthy Smiles, Happier Lives.” AfriScope borrows its _calm clinical warmth_: deep-green headlines, mint surfaces, cream background, circular icon badges, trust rows, and a floating action card. It does not copy Cleargrin branding, imagery, or copy.

## Design principles

1. **Evidence before action.** Every number is traceable to a source version; uncertainty is shown, never hidden.
2. **Calm over noise.** Muted greens and warm neutrals; one accent per view; no visual shouting.
3. **Tactile but honest.** Depth cues (glass, clay, soft shadow) communicate interactivity — never fake functionality. Every control works.
4. **Accessible by default.** WCAG 2.2 AA contrast (verified by automated audit), visible focus, keyboard operable, reduced-motion respected.
5. **Synthetic data is labelled.** Demo workspaces carry a persistent “Demonstration Environment” banner; synthetic records are never presented as real. Facility names are real Nigerian public hospitals; all figures are synthetic.

## Palette (from the Cleargrin reference)

| Token         | Value     | Use                                           |
| ------------- | --------- | --------------------------------------------- |
| `--green-950` | `#0b2e23` | Display headlines, footer, deepest emphasis   |
| `--green-900` | `#123f31` | Primary text, headings, primary buttons       |
| `--green-700` | `#1f6b4f` | Interactive elements, links, active states    |
| `--green-500` | `#3f9d74` | Highlights, success, chart series 1           |
| `--mint-300`  | `#a9d8bd` | Icon badges, soft fills, chart series 2       |
| `--sage-300`  | `#a9c6b2` | Secondary text on dark, borders               |
| `--sage-100`  | `#e3efe6` | Subtle fills, hover states, service-card tint |
| `--mint-50`   | `#f0f7f2` | Section alternation, inset wells              |
| `--cream`     | `#f7f5ef` | App background                                |
| `--surface`   | `#ffffff` | Cards, panels                                 |
| `--ink`       | `#1c2b24` | Body text                                     |
| `--amber`     | `#b7791f` | Warnings, pending review                      |
| `--red`       | `#b3261e` | Errors, rejections                            |

Charts use a colour-blind-safe categorical ramp derived from the greens, with direct labels (never colour alone).

## The four-style blend

### Glassmorphism — overlays & floating chrome

Used for: top navigation bar, modal dialogs, the assistant panel, toasts, the demo banner, and the floating “action card” (the Cleargrin booking-card pattern — e.g. a floating evidence-summary card over the GIS map).

- `background: rgba(255,255,255,0.72)` with `backdrop-filter: blur(14px) saturate(1.4)`
- 1px `rgba(18,63,49,0.08)` border, soft `0 8px 32px rgba(18,63,49,0.12)` shadow
- Content scrolls beneath; glass never sits over interactive data without a scrim.

### Neumorphism — inset controls & wells

Used for: search/filter wells, toggle tracks, inset stat wells, and the sidebar active-item background.

- Background matches the parent surface; dual shadows `inset 2px 2px 6px rgba(18,63,49,0.10), inset -2px -2px 6px rgba(255,255,255,0.9)`
- Pressed state deepens the inset shadow to signal toggle/selection.

### Claymorphism — primary cards & CTAs

Used for: module cards, primary buttons, KPI tiles, service-grid cards (the Cleargrin “Our Services” pattern), and empty-state illustrations.

- Large radii (`20–28px`), thick soft borders, and layered pastel shadows:
  `0 2px 0 rgba(255,255,255,0.6) inset, 0 12px 24px rgba(18,63,49,0.10), 0 4px 8px rgba(18,63,49,0.06)`
- Slightly inflated scale on hover (`transform: translateY(-1px)`); press compresses (`scale(0.98)`).
- Service cards carry a circular mint icon badge (Cleargrin pattern) with a Lucide glyph in green-900.

### Skeuomorphism — data artefacts (restrained)

Used for: report documents, evidence records, approval stamps, and export buttons — objects that represent real artefacts.

- Paper-like surfaces with subtle top-light gradient and a faint deckle edge.
- Approval/evidence stamps use a pressed-foil treatment (inset highlight + letterpress shadow).
- Skeuomorphism is **never** used for controls that would imply physical behaviour the app doesn't have.

## Typography

- Display: `Nunito` (rounded geometric sans, 800–900) for page titles and hero numerals — warm, friendly, clinical, matching the Cleargrin headline voice (“Healthy Smiles” style).
- UI: `Inter` for body, labels, and data tables.
- Mono: `IBM Plex Mono` for IDs, checksums, and audit references.
- Scale: 12 / 14 / 16 / 20 / 28 / 40. Body line-height 1.5; data tables 1.4.
- Eyebrow labels (section kickers) are 11px, letter-spaced uppercase in green-700, e.g. “CARING TODAY FOR BRIGHTER TOMORROWS” → AfriScope: “EVIDENCE BEFORE ACTION”.

## Components

- **Buttons:** clay primary (green-900 fill, cream text, pill radius), glass secondary (blur, green-900 text), text tertiary. Focus ring: 2px green-500 offset 2px.
- **Cards:** clay surface, 24px radius, 20px padding, 1px sage border.
- **Service grid:** 6-up (desktop) clay cards with circular mint icon badges, title, and one-line description — mirrors the Cleargrin “Our Services” row for the six AfriScope modules.
- **Trust row:** icon + label pairs (shield “Verified evidence”, people “Human review”, chart “Deterministic core”) under the hero, mirroring Cleargrin’s badge row.
- **Stats row:** 4-up KPI tiles with Lucide icons, large numerals, and captions (Cleargrin stats pattern).
- **Tables:** sticky header (glass), zebra rows in sage-100 at 40%, numeric columns right-aligned in mono.
- **Charts:** Recharts with the green ramp; tooltips are glass; every chart has a text summary for screen readers.
- **Forms:** neumorphic wells for inputs; labels always visible (never placeholder-only); inline validation with plain-language remediation. Floating action cards use glass with a secure-note footer (“Your information is secure” pattern).
- **Status:** pills with icon + text (never colour alone) — Draft, In review, Approved, Rejected, Expired.

## Motion

- Micro-interactions 120–200ms, `cubic-bezier(0.2, 0.8, 0.2, 1)`.
- Page transitions fade + 4px rise. `prefers-reduced-motion` disables all non-essential motion.
- Skeleton loaders use a soft sage shimmer (no spinners on data views).

## Layout

- Desktop: 260px glass sidebar, fluid content (max 1440px), 24px gutters.
- Hero pattern (public pages): split headline + CTAs left, floating glass action card right, trust row beneath.
- Mobile (<768px): bottom nav, single column, tables become stacked cards.
- Density is comfortable by default; a compact toggle is available in Settings.

## Iconography

Lucide icons only, 1.5px stroke, 20px default, inside circular mint badges for service/KPI cards. No emoji in UI chrome. Status icons pair with text labels.

## Accessibility checklist (enforced in CI)

- Automated axe audit on all key routes: 0 violations.
- Contrast: body text ≥ 4.5:1, large text ≥ 3:1 (checked in `scripts/a11y_audit.mjs`).
- All interactive elements keyboard reachable with visible focus.
- Charts and data tables have text alternatives.
