/**
 * Design system color tokens
 *
 * Each color has light and dark mode variants with hex and P3 color space values.
 * These are consumed by:
 * - tailwind.config.ts (generates Tailwind classes)
 * - color-styles.tsx (generates CSS variables)
 *
 * ===========================================
 * BACKGROUND TOKENS - When to use which?
 * ===========================================
 *
 * BACKGROUND-BASE (bg-background-base)
 * ──────────────────────────────────────
 * Purpose: The base page/app background color
 * Usage:   Root layout, main app container, page backgrounds
 * Light:   Very light gray (#f9f9f9) - almost white but with subtle warmth
 * Dark:    Very dark gray (#0a0a0a) - almost black
 * Example: <body>, <main>, root <div> containers
 *
 * BACKGROUND-LIGHTER (bg-background-lighter)
 * ───────────────────────────────────────────
 * Purpose: Slightly lighter variant of the base background
 * Usage:   Subtle background variations, nested sections that need slight elevation
 * Light:   Off-white (#fbfbfb) - slightly lighter than base
 * Dark:    Dark gray (#141414) - slightly lighter than base
 * Example: Secondary sections, nested containers within base background
 *
 * SURFACE (bg-surface)
 * ────────────────────
 * Purpose: UI container backgrounds - elements that sit ON TOP of the page background
 * Usage:   Cards, modals, dropdowns, menus, sheets, popovers, tooltips
 * Light:   Pure white (#ffffff) - creates clear contrast against base background
 * Dark:    Dark gray (#171717) - creates clear contrast against base background
 * Example: <Card>, <Modal>, <DropdownMenu>, <Sheet>, <Popover>
 *
 * SURFACE-RAISED (bg-surface-raised)
 * ──────────────────────────────────
 * Purpose: Elevated surfaces that sit ON TOP of other surfaces
 * Usage:   Nested cards, hover states, tooltips on top of popovers, stacked modals
 * Light:   Pure white (#ffffff) - same as surface (no visual difference in light mode)
 * Dark:    Slightly lighter dark gray (#1f1f1f) - creates subtle elevation in dark mode
 * Example: Card inside a card, tooltip on a popover, hover state overlays
 *
 * ACCENT-WHITE (text-accent-white or bg-accent-white)
 * ────────────────────────────────────────────────────
 * Purpose: White text on colored backgrounds (buttons, badges, CTAs)
 * Usage:   Text color on heat-100 buttons, colored badges, colored backgrounds
 * Light:   Pure white (#ffffff)
 * Dark:    Pure white (#ffffff) - stays white in both modes
 * Note:    Use for TEXT on colored backgrounds. Do NOT use for container backgrounds.
 *          Use bg-surface instead for white backgrounds in light mode.
 *
 * ===========================================
 * DECISION TREE
 * ===========================================
 *
 * Q: What are you styling?
 *
 * → Page/app background?
 *   → Use: bg-background-base
 *
 * → Card/modal/dropdown/menu?
 *   → Use: bg-surface
 *
 * → Something inside a card/modal?
 *   → Use: bg-surface-raised (for subtle elevation in dark mode)
 *
 * → White text on colored button/badge?
 *   → Use: text-accent-white
 *
 * → White background container?
 *   → Use: bg-surface (not bg-accent-white!)
 */

interface ColorValue {
  hex: string;
  p3: string;
}

interface ColorToken {
  light: ColorValue;
  dark: ColorValue;
}

type Colors = Record<string, ColorToken>;

const colors = {
  // ===========================================
  // BRAND - Heat (Orange)
  // Primary brand color at various opacities
  // ===========================================
  "heat-4": {
    light: { hex: "fa5d190a", p3: "0.980392 0.364706 0.098039 / 0.039216" },
    dark: { hex: "fa5d190a", p3: "0.980392 0.364706 0.098039 / 0.039216" },
  },
  "heat-8": {
    light: { hex: "fa5d1914", p3: "0.980392 0.364706 0.098039 / 0.078431" },
    dark: { hex: "fa5d1914", p3: "0.980392 0.364706 0.098039 / 0.078431" },
  },
  "heat-12": {
    light: { hex: "fa5d191f", p3: "0.980392 0.364706 0.098039 / 0.121569" },
    dark: { hex: "fa5d191f", p3: "0.980392 0.364706 0.098039 / 0.121569" },
  },
  "heat-16": {
    light: { hex: "fa5d1929", p3: "0.980392 0.364706 0.098039 / 0.160784" },
    dark: { hex: "fa5d1929", p3: "0.980392 0.364706 0.098039 / 0.160784" },
  },
  "heat-20": {
    light: { hex: "fa5d1933", p3: "0.980392 0.364706 0.098039 / 0.200000" },
    dark: { hex: "fa5d1933", p3: "0.980392 0.364706 0.098039 / 0.200000" },
  },
  "heat-24": {
    light: { hex: "fa5d193d", p3: "0.980392 0.364706 0.098039 / 0.239216" },
    dark: { hex: "fa5d193d", p3: "0.980392 0.364706 0.098039 / 0.239216" },
  },
  "heat-40": {
    light: { hex: "fa5d1966", p3: "0.980392 0.364706 0.098039 / 0.400000" },
    dark: { hex: "fa5d1966", p3: "0.980392 0.364706 0.098039 / 0.400000" },
  },
  "heat-48": {
    light: { hex: "fa5d197a", p3: "0.980392 0.364706 0.098039 / 0.478431" },
    dark: { hex: "fa5d197a", p3: "0.980392 0.364706 0.098039 / 0.478431" },
  },
  "heat-90": {
    light: { hex: "fa5d19e6", p3: "0.980392 0.364706 0.098039 / 0.900000" },
    dark: { hex: "fa5d19e6", p3: "0.980392 0.364706 0.098039 / 0.900000" },
  },
  "heat-100": {
    light: { hex: "fa5d19ff", p3: "0.980392 0.364706 0.098039 / 1.000000" },
    dark: { hex: "fa5d19ff", p3: "0.980392 0.364706 0.098039 / 1.000000" },
  },

  // ===========================================
  // SEMANTIC - Text & Surfaces
  // ===========================================

  /** Primary text color - inverts between modes */
  "accent-black": {
    light: { hex: "262626ff", p3: "0.149020 0.149020 0.149020 / 1.000000" },
    dark: { hex: "f5f5f5ff", p3: "0.960784 0.960784 0.960784 / 1.000000" },
  },

  /**
   * Text on colored backgrounds (buttons, badges) - always white
   * Use: text-accent-white for white text on colored backgrounds
   * Do NOT use: bg-accent-white for container backgrounds (use bg-surface instead)
   */
  "accent-white": {
    light: { hex: "ffffffff", p3: "1.000000 1.000000 1.000000 / 1.000000" },
    dark: { hex: "ffffffff", p3: "1.000000 1.000000 1.000000 / 1.000000" },
  },

  /**
   * UI container backgrounds - elements that sit ON TOP of page background
   * Use: bg-surface for cards, modals, dropdowns, menus, sheets, popovers
   * See top-level documentation for detailed usage guide
   */
  surface: {
    light: { hex: "ffffffff", p3: "1.000000 1.000000 1.000000 / 1.000000" },
    dark: { hex: "171717ff", p3: "0.090196 0.090196 0.090196 / 1.000000" },
  },

  /**
   * Elevated surfaces - for elements ON TOP of other surfaces
   * Use: bg-surface-raised for nested cards, hover states, stacked modals
   * See top-level documentation for detailed usage guide
   */
  "surface-raised": {
    light: { hex: "ffffffff", p3: "1.000000 1.000000 1.000000 / 1.000000" },
    dark: { hex: "1f1f1fff", p3: "0.121569 0.121569 0.121569 / 1.000000" },
  },

  // ===========================================
  // ACCENT COLORS
  // Slightly brighter in dark mode for visibility
  // ===========================================
  "accent-amethyst": {
    light: { hex: "9061ffff", p3: "0.564706 0.380392 1.000000 / 1.000000" },
    dark: { hex: "a07affff", p3: "0.627451 0.478431 1.000000 / 1.000000" },
  },
  "accent-bluetron": {
    light: { hex: "2a6dfbff", p3: "0.164706 0.427451 0.984314 / 1.000000" },
    dark: { hex: "5a8ffcff", p3: "0.352941 0.560784 0.988235 / 1.000000" },
  },
  "accent-crimson": {
    light: { hex: "eb3424ff", p3: "0.921569 0.203922 0.141176 / 1.000000" },
    dark: { hex: "f05545ff", p3: "0.941176 0.333333 0.270588 / 1.000000" },
  },
  "accent-forest": {
    light: { hex: "42c366ff", p3: "0.258824 0.764706 0.400000 / 1.000000" },
    dark: { hex: "5cd47fff", p3: "0.360784 0.831373 0.498039 / 1.000000" },
  },
  "accent-honey": {
    light: { hex: "ecb730ff", p3: "0.925490 0.717647 0.188235 / 1.000000" },
    dark: { hex: "f0c550ff", p3: "0.941176 0.772549 0.313725 / 1.000000" },
  },

  // ===========================================
  // BLACK ALPHA
  // Transparent overlays - become white in dark mode
  // Used for: subtle backgrounds, muted text, overlays
  // ===========================================
  "black-alpha-1": {
    light: { hex: "00000003", p3: "0.000000 0.000000 0.000000 / 0.011765" },
    dark: { hex: "ffffff03", p3: "1.000000 1.000000 1.000000 / 0.011765" },
  },
  "black-alpha-2": {
    light: { hex: "00000005", p3: "0.000000 0.000000 0.000000 / 0.019608" },
    dark: { hex: "ffffff05", p3: "1.000000 1.000000 1.000000 / 0.019608" },
  },
  "black-alpha-3": {
    light: { hex: "00000008", p3: "0.000000 0.000000 0.000000 / 0.031373" },
    dark: { hex: "ffffff08", p3: "1.000000 1.000000 1.000000 / 0.031373" },
  },
  "black-alpha-4": {
    light: { hex: "0000000a", p3: "0.000000 0.000000 0.000000 / 0.039216" },
    dark: { hex: "ffffff0a", p3: "1.000000 1.000000 1.000000 / 0.039216" },
  },
  "black-alpha-5": {
    light: { hex: "0000000d", p3: "0.000000 0.000000 0.000000 / 0.050980" },
    dark: { hex: "ffffff0d", p3: "1.000000 1.000000 1.000000 / 0.050980" },
  },
  "black-alpha-6": {
    light: { hex: "0000000f", p3: "0.000000 0.000000 0.000000 / 0.058824" },
    dark: { hex: "ffffff0f", p3: "1.000000 1.000000 1.000000 / 0.058824" },
  },
  "black-alpha-7": {
    light: { hex: "00000012", p3: "0.000000 0.000000 0.000000 / 0.070588" },
    dark: { hex: "ffffff12", p3: "1.000000 1.000000 1.000000 / 0.070588" },
  },
  "black-alpha-8": {
    light: { hex: "00000014", p3: "0.000000 0.000000 0.000000 / 0.078431" },
    dark: { hex: "ffffff14", p3: "1.000000 1.000000 1.000000 / 0.078431" },
  },
  "black-alpha-10": {
    light: { hex: "0000001a", p3: "0.000000 0.000000 0.000000 / 0.101961" },
    dark: { hex: "ffffff1a", p3: "1.000000 1.000000 1.000000 / 0.101961" },
  },
  "black-alpha-12": {
    light: { hex: "0000001f", p3: "0.000000 0.000000 0.000000 / 0.121569" },
    dark: { hex: "ffffff1f", p3: "1.000000 1.000000 1.000000 / 0.121569" },
  },
  "black-alpha-16": {
    light: { hex: "00000029", p3: "0.000000 0.000000 0.000000 / 0.160784" },
    dark: { hex: "ffffff29", p3: "1.000000 1.000000 1.000000 / 0.160784" },
  },
  "black-alpha-20": {
    light: { hex: "00000033", p3: "0.000000 0.000000 0.000000 / 0.200000" },
    dark: { hex: "ffffff33", p3: "1.000000 1.000000 1.000000 / 0.200000" },
  },
  "black-alpha-24": {
    light: { hex: "0000003d", p3: "0.000000 0.000000 0.000000 / 0.239216" },
    dark: { hex: "ffffff3d", p3: "1.000000 1.000000 1.000000 / 0.239216" },
  },
  "black-alpha-32": {
    light: { hex: "26262652", p3: "0.149020 0.149020 0.149020 / 0.321569" },
    dark: { hex: "ffffff52", p3: "1.000000 1.000000 1.000000 / 0.321569" },
  },
  "black-alpha-40": {
    light: { hex: "26262666", p3: "0.149020 0.149020 0.149020 / 0.400000" },
    dark: { hex: "ffffff66", p3: "1.000000 1.000000 1.000000 / 0.400000" },
  },
  "black-alpha-48": {
    light: { hex: "2626267a", p3: "0.149020 0.149020 0.149020 / 0.478431" },
    dark: { hex: "ffffff7a", p3: "1.000000 1.000000 1.000000 / 0.478431" },
  },
  "black-alpha-56": {
    light: { hex: "2626268f", p3: "0.149020 0.149020 0.149020 / 0.560784" },
    dark: { hex: "ffffff8f", p3: "1.000000 1.000000 1.000000 / 0.560784" },
  },
  "black-alpha-64": {
    light: { hex: "262626a3", p3: "0.149020 0.149020 0.149020 / 0.639216" },
    dark: { hex: "ffffffa3", p3: "1.000000 1.000000 1.000000 / 0.639216" },
  },
  "black-alpha-72": {
    light: { hex: "262626b8", p3: "0.149020 0.149020 0.149020 / 0.721569" },
    dark: { hex: "ffffffb8", p3: "1.000000 1.000000 1.000000 / 0.721569" },
  },
  "black-alpha-88": {
    light: { hex: "262626e0", p3: "0.149020 0.149020 0.149020 / 0.878431" },
    dark: { hex: "ffffffe0", p3: "1.000000 1.000000 1.000000 / 0.878431" },
  },

  // ===========================================
  // WHITE ALPHA
  // Transparent white overlays - become black in dark mode
  // ===========================================
  "white-alpha-56": {
    light: { hex: "ffffff8f", p3: "1.000000 1.000000 1.000000 / 0.560784" },
    dark: { hex: "0000008f", p3: "0.000000 0.000000 0.000000 / 0.560784" },
  },
  "white-alpha-72": {
    light: { hex: "ffffffb8", p3: "1.000000 1.000000 1.000000 / 0.721569" },
    dark: { hex: "000000b8", p3: "0.000000 0.000000 0.000000 / 0.721569" },
  },

  // ===========================================
  // BORDERS
  // Light gray in light mode, dark gray in dark mode
  // ===========================================
  "border-faint": {
    light: { hex: "edededff", p3: "0.929412 0.929412 0.929412 / 1.000000" },
    dark: { hex: "2a2a2aff", p3: "0.164706 0.164706 0.164706 / 1.000000" },
  },
  "border-muted": {
    light: { hex: "e8e8e8ff", p3: "0.909804 0.909804 0.909804 / 1.000000" },
    dark: { hex: "333333ff", p3: "0.200000 0.200000 0.200000 / 1.000000" },
  },
  "border-loud": {
    light: { hex: "e6e6e6ff", p3: "0.901961 0.901961 0.901961 / 1.000000" },
    dark: { hex: "404040ff", p3: "0.250980 0.250980 0.250980 / 1.000000" },
  },

  // ===========================================
  // ILLUSTRATIONS
  // Decorative elements that invert with theme
  // ===========================================
  "illustrations-faint": {
    light: { hex: "edededff", p3: "0.929412 0.929412 0.929412 / 1.000000" },
    dark: { hex: "2a2a2aff", p3: "0.164706 0.164706 0.164706 / 1.000000" },
  },
  "illustrations-muted": {
    light: { hex: "e6e6e6ff", p3: "0.901961 0.901961 0.901961 / 1.000000" },
    dark: { hex: "3d3d3dff", p3: "0.239216 0.239216 0.239216 / 1.000000" },
  },
  "illustrations-default": {
    light: { hex: "dbdbdbff", p3: "0.858824 0.858824 0.858824 / 1.000000" },
    dark: { hex: "525252ff", p3: "0.321569 0.321569 0.321569 / 1.000000" },
  },

  // ===========================================
  // BACKGROUNDS
  // Page-level backgrounds - see top-level documentation for usage guide
  // ===========================================
  /**
   * Base page/app background - use for root layouts and main containers
   * Use: bg-background-base for <body>, <main>, root <div> containers
   */
  "background-base": {
    light: { hex: "f9f9f9ff", p3: "0.976471 0.976471 0.976471 / 1.000000" },
    dark: { hex: "0a0a0aff", p3: "0.039216 0.039216 0.039216 / 1.000000" },
  },
  /**
   * Slightly lighter variant - use for subtle background variations
   * Use: bg-background-lighter for nested sections needing slight elevation
   */
  "background-lighter": {
    light: { hex: "fbfbfbff", p3: "0.984314 0.984314 0.984314 / 1.000000" },
    dark: { hex: "141414ff", p3: "0.078431 0.078431 0.078431 / 1.000000" },
  },
} as const satisfies Colors;

export default colors;
