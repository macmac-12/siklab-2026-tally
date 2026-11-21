# AGENTS.md — UI & Design System Rules

You are an expert product designer and front-end engineer. Every interface you build must adhere strictly to this design system. Never fall back on generic AI styling.

## 1. Visual Aesthetic & Philosophy
- **Theme:** Clean, high-contrast, modern editorial / Swiss-minimalist aesthetic.
- **Surface Hierarchy:** Avoid wrapping every group of elements in bordered boxes or heavy drop shadows. Use whitespace, subtle 1px borders (`#E5E7EB`), and slight background shifts (`#FAFAFA` vs `#FFFFFF`) to create separation.
- **Anti-Patterns (STRICTLY FORBIDDEN):**
  - No neon purple/blue mesh gradients.
  - No heavy drop shadows (`shadow-xl` or `shadow-2xl`).
  - No decorative emojis in headings, buttons, or navigation items.
  - No generic "hero with floating 3D illustration" layouts unless explicitly requested.

## 2. Color Tokens
Use semantic CSS variables or Tailwind classes mapped to these exact tokens:
- **Background Primary:** `#FFFFFF` (Dark mode: `#0A0A0A`)
- **Background Secondary / Subtle:** `#F9FAFB` (Dark mode: `#141414`)
- **Text Primary:** `#111827` (Dark mode: `#F9FAFB`)
- **Text Secondary / Muted:** `#6B7280` (Dark mode: `#9CA3AF`)
- **Border Subtle:** `#E5E7EB` (Dark mode: `#262626`)
- **Brand Accent:** `#0F172A` (Hover: `#1E293B`) — *Swap this for your primary brand hex.*
- **Semantic Status:** Success `#16A34A`, Warning `#D97706`, Error `#DC2626`.

## 3. Typography
- **Font Families:**
  - Sans (UI & Body): `'Inter', -apple-system, BlinkMacSystemFont, sans-serif`
  - Monospace (Code, Data, Numbers): `'JetBrains Mono', monospace`
- **Type Scale & Rules:**
  - **Page Title (`h1`):** `28px` / `1.75rem`, weight `600`, tracking `-0.02em`, line-height `1.2`.
  - **Section Heading (`h2`):** `18px` / `1.125rem`, weight `600`, tracking `-0.01em`, line-height `1.3`.
  - **Body Copy:** `14px` / `0.875rem`, weight `400`, line-height `1.5`.
  - **Labels / Captions:** `12px` / `0.75rem`, weight `500`, color `Text Secondary`.
  - Use `tabular-nums` (`font-variant-numeric: tabular-nums`) on all tables, metrics, prices, and timestamps.

## 4. Spacing, Layout & Radius
- **Spacing Scale:** Strictly use multiples of `4px` (`4px`, `8px`, `12px`, `16px`, `24px`, `32px`, `48px`, `64px`). Never use arbitrary values like `13px` or `22px`.
- **Container Width:** Max-width `1200px` centered with `24px` horizontal padding on desktop, `16px` on mobile.
- **Border Radius:**
  - Buttons, inputs, badges: `6px` (`rounded-md`)
  - Cards, modals, panels: `8px` (`rounded-lg`)
  - Avatars, status dots: `9999px` (`rounded-full`)

## 5. Component Standards
- **Buttons:** Height `36px` (default) or `32px` (compact). Padding `0 14px`. Medium font weight (`500`). Clear hover and focus-visible ring states.
- **Inputs:** Height `36px`, `1px solid Border Subtle`, `6px` radius. Focus state must show a crisp `2px` ring without shifting layout.
- **Icons:** Use **Lucide Icons** (`lucide-react`) exclusively. Standard size `16px` (`w-4 h-4`) with `1.75px` stroke width. Never mix icon libraries.
- **Empty States:** Every list, table, or data view must include a clean empty state with a subtle icon, 1-sentence explanation, and a primary action button.

## 6. Motion & Responsiveness
- **Transitions:** Keep UI transitions fast and purposeful (`150ms cubic-bezier(0.16, 1, 0.3, 1)`). Avoid bouncy spring animations.
- **Mobile First:** All grids must collapse cleanly to a single column below `768px`. No horizontal page scrolling.

## 7. Self-Verification Checklist (Run Before Finishing)
Before completing any UI task, verify:
1. All interactive elements have hover, focus, and disabled states.
2. Contrast ratios meet WCAG AA standards (at least `4.5:1` for normal text).
3. No hardcoded hex values exist outside the token definitions.
4. No text truncates awkwardly or overflows its container on `375px` mobile width.