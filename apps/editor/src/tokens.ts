/**
 * Design tokens — single source of truth for all visual values.
 *
 * CSS layer:   import "./tokens.css" (custom properties for Tailwind @theme)
 * Canvas/Konva: import { tokens } from "@/tokens"
 */

// ---------------------------------------------------------------------------
// Base palette
// ---------------------------------------------------------------------------

const blue = {
  300: "#6BB0F0",
  400: "#4A90D9",
  500: "#3B82F6",
  600: "#2563EB",
} as const

const orange = {
  300: "#F0A060",
  400: "#E87D3E",
  500: "#D97706",
} as const

const red = {
  400: "#E5534B",
  500: "#DC2626",
} as const

const green = {
  500: "#22C55E",
} as const

const amber = {
  500: "#F59E0B",
} as const

const neutral = {
  50: "#FAFAFA",
  100: "#F5F5F5",
  200: "#E5E5E5",
  400: "#A1A1AA",
  500: "#71717A",
  600: "#52525B",
  700: "#3F3F46",
  800: "#27272A",
  900: "#18181B",
  950: "#0A0A0A",
} as const

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

export const tokens = {
  // -- Base palette (direct access when needed) --
  color: {
    blue,
    orange,
    red,
    green,
    amber,
    neutral,

    // -- Semantic (UI layer) --
    bg: neutral[950],
    fg: neutral[50],
    surface: neutral[800],
    muted: neutral[700],
    mutedFg: neutral[400],
    border: neutral[700],
    ring: neutral[500],
    primary: neutral[50],
    primaryFg: neutral[800],
    secondary: neutral[700],
    secondaryFg: neutral[50],
    accent: neutral[700],
    accentFg: neutral[50],
    destructive: red[500],
    destructiveFg: red[400],

    // -- Semantic (status) --
    success: green[500],
    warning: amber[500],
    error: red[500],
    info: blue[500],

    // -- Domain: canvas / bezier path --
    canvas: {
      vertex: blue[400],
      vertexHover: blue[300],
      vertexStroke: neutral[50],
      edge: neutral[50],
      edgeInactive: neutral[500],
      edgeGuide: neutral[600],
      ghost: blue[400],
      handle: orange[400],
      handleHover: orange[300],
    },

    // -- Domain: timeline --
    timeline: {
      bg: neutral[900],
      grid: neutral[700],
      label: neutral[400],
      tick: neutral[500],
      playhead: blue[500],
      activeBg: "rgba(59, 130, 246, 0.3)",
    },
  },

  // -- Typography --
  fontFamily: {
    sans: "'Inter Variable', system-ui, -apple-system, sans-serif",
    mono: "ui-monospace, monospace",
  },

  fontSize: {
    xs: "0.75rem",
    sm: "0.875rem",
    base: "1rem",
    lg: "1.125rem",
    xl: "1.25rem",
    "2xl": "1.5rem",
    "3xl": "1.875rem",
  },

  fontWeight: {
    medium: 500,
    semibold: 600,
    bold: 700,
  },

  lineHeight: {
    none: 1,
    tight: 1.25,
    normal: 1.5,
  },

  // -- Spacing (4px base) --
  spacing: {
    0: "0px",
    1: "4px",
    2: "8px",
    3: "12px",
    4: "16px",
    6: "24px",
    8: "32px",
    10: "40px",
    16: "64px",
  },

  // -- Border radius --
  radius: {
    sm: "0.25rem",
    md: "0.375rem",
    lg: "0.5rem",
    xl: "0.75rem",
    full: "9999px",
  },

  // -- Shadows --
  shadow: {
    sm: "0 1px 2px rgba(0, 0, 0, 0.3)",
    base: "0 1px 3px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.3)",
  },

  // -- Breakpoints --
  breakpoint: {
    sm: "640px",
    md: "768px",
    lg: "1024px",
    xl: "1280px",
  },

  // -- Canvas sizing (unitless — used in Konva, not CSS) --
  canvas: {
    pointRadius: 4,
    handleRadius: 3,
    pointStrokeWidth: 1,
    guideStrokeWidth: 1,
    pathWidth: 2,
    pathWidthInactive: 1,
    hitTolerance: 10,
    pointHitBuffer: 6,
    handleHitBuffer: 6,
    ghostOpacity: 0.4,
  },

  // -- Timeline sizing (unitless) --
  timeline: {
    cellBaseWidth: 24,
    height: 64,
    headerHeight: 20,
    labelFontSize: 10,
    labelOffsetY: 4,
    markerWidth: 1,
    playheadWidth: 2,
  },
} as const
