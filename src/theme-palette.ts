/**
 * Theme Palette — Per-theme, per-IFC-category color maps.
 * 
 * Each theme defines a set of hex colors for major IFC categories.
 * These are applied to Three.js mesh materials after model load
 * and re-applied on theme switch.
 */

export interface CategoryColorMap {
  [ifcCategory: string]: string;
}

export interface ThemePalettes {
  [themeName: string]: CategoryColorMap;
}

export interface ThemePostProcessConfig {
  paperColor: string;
  inkColor: string;
  outlineGlowColor: string;
  vignetteIntensity: number;
  bloomThreshold: number;
  bloomStrength: number;
  toonSteps: number;
  lineThickness: number;
  jitterAmount: number;
  postMode: number; // 0: Standard, 1: Draft Grid, 2: Cyber Scanlines, 3: Pencil Cross-Hatching
  chromaticAberration: number;
}

export const THEME_POST_PROCESS_CONFIG: Record<string, ThemePostProcessConfig> = {
  zen: {
    paperColor: '#0d1516',
    inkColor: '#d4af37', // Kintsugi Gold Outlines
    outlineGlowColor: '#00e5ff',
    vignetteIntensity: 0.35,
    bloomThreshold: 0.75,
    bloomStrength: 0.4,
    toonSteps: 4,
    lineThickness: 1.2,
    jitterAmount: 0.0012,
    postMode: 0,
    chromaticAberration: 0.05,
  },
  pencil: {
    paperColor: '#f8fafc',
    inkColor: '#0f172a', // Clean Graphite Outline
    outlineGlowColor: '#0284c7',
    vignetteIntensity: 0.12,
    bloomThreshold: 0.95,
    bloomStrength: 0.1,
    toonSteps: 3,
    lineThickness: 1.6,
    jitterAmount: 0.0035, // Hand-drawn sketch jitter
    postMode: 3, // Cross-hatch sketch pass
    chromaticAberration: 0.0,
  },
  bluepen: {
    paperColor: '#0b1329',
    inkColor: '#60a5fa', // Architectural Blue Draft Ink
    outlineGlowColor: '#3b82f6',
    vignetteIntensity: 0.45,
    bloomThreshold: 0.70,
    bloomStrength: 0.5,
    toonSteps: 3,
    lineThickness: 1.4,
    jitterAmount: 0.0022,
    postMode: 1, // Architectural grid background
    chromaticAberration: 0.08,
  },
  cozy: {
    paperColor: '#1c1917',
    inkColor: '#f59e0b', // Warm Amber Ink
    outlineGlowColor: '#d97706',
    vignetteIntensity: 0.28,
    bloomThreshold: 0.80,
    bloomStrength: 0.3,
    toonSteps: 4,
    lineThickness: 1.1,
    jitterAmount: 0.0008,
    postMode: 0,
    chromaticAberration: 0.02,
  },
  cyberpunk: {
    paperColor: '#11111b',
    inkColor: '#f5c2e7', // Neon Magenta Edge
    outlineGlowColor: '#89dceb',
    vignetteIntensity: 0.55,
    bloomThreshold: 0.50,
    bloomStrength: 0.85, // Intense Cyber Bloom
    toonSteps: 5,
    lineThickness: 1.5,
    jitterAmount: 0.0005,
    postMode: 2, // CRT Scanline overlay
    chromaticAberration: 0.35, // High Chromatic Fringe
  },
  amber: {
    paperColor: '#0f0500',
    inkColor: '#fbbf24', // Retro Amber CRT Outline
    outlineGlowColor: '#f59e0b',
    vignetteIntensity: 0.50,
    bloomThreshold: 0.65,
    bloomStrength: 0.65,
    toonSteps: 3,
    lineThickness: 1.3,
    jitterAmount: 0.0004,
    postMode: 2, // Retro CRT Scanlines
    chromaticAberration: 0.15,
  },
  emerald: {
    paperColor: '#011711',
    inkColor: '#34d399', // Matrix Emerald Outline
    outlineGlowColor: '#10b981',
    vignetteIntensity: 0.42,
    bloomThreshold: 0.65,
    bloomStrength: 0.6,
    toonSteps: 4,
    lineThickness: 1.2,
    jitterAmount: 0.0006,
    postMode: 1, // Terminal Matrix Grid
    chromaticAberration: 0.12,
  },
  indigo: {
    paperColor: '#070619',
    inkColor: '#818cf8', // High-Tech Indigo Line
    outlineGlowColor: '#6366f1',
    vignetteIntensity: 0.38,
    bloomThreshold: 0.70,
    bloomStrength: 0.48,
    toonSteps: 4,
    lineThickness: 1.1,
    jitterAmount: 0.0010,
    postMode: 0,
    chromaticAberration: 0.06,
  },
  light: {
    paperColor: '#f1f5f9',
    inkColor: '#0284c7', // Ice Blue Outline
    outlineGlowColor: '#38bdf8',
    vignetteIntensity: 0.15,
    bloomThreshold: 0.90,
    bloomStrength: 0.2,
    toonSteps: 3,
    lineThickness: 1.0,
    jitterAmount: 0.0002,
    postMode: 0,
    chromaticAberration: 0.0,
  },
};

/** Fallback color when a category is not in the palette */
export const FALLBACK_COLOR = '#888888';

/**
 * Canonical IFC category keys used throughout the application.
 * Normalized to uppercase, stripped of "IFCSTANDARDCASE" suffixes.
 */
export const IFC_CATEGORIES = [
  'IFCWALL',
  'IFCWALLSTANDARDCASE',
  'IFCSLAB',
  'IFCCOLUMN',
  'IFCBEAM',
  'IFCDOOR',
  'IFCWINDOW',
  'IFCROOF',
  'IFCSTAIR',
  'IFCSTAIRFLIGHT',
  'IFCRAILING',
  'IFCFURNISHINGELEMENT',
  'IFCFLOWSEGMENT',
  'IFCFLOWFITTING',
  'IFCFLOWTERMINAL',
  'IFCCOVERING',
  'IFCPLATE',
  'IFCMEMBER',
  'IFCFOOTING',
  'IFCBUILDINGSTOREY',
  'IFCSITE',
  'IFCBUILDINGELEMENTPROXY',
] as const;

export type IfcCategoryKey = typeof IFC_CATEGORIES[number] | string;

/**
 * Per-theme color palettes for IFC categories.
 * 
 * Design rationale:
 * - Zen: Kintsugi Gold & Charcoal infrastructure theme
 */
export const THEME_PALETTES: ThemePalettes = {

  // ── Zen Infrastructure Theme (Future-Ready Engineering) ──
  zen: {
    IFCWALL:                '#333535',  // slate charcoal
    IFCWALLSTANDARDCASE:    '#333535',
    IFCSLAB:                '#1A1C1C',  // deep charcoal
    IFCCOLUMN:              '#D4AF37',  // kintsugi liquid gold
    IFCBEAM:                '#B5952F',  // antique gold
    IFCDOOR:                '#FFD700',  // electric amber gold
    IFCWINDOW:              '#00E5FF',  // electric cyan glass
    IFCROOF:                '#997A20',  // dark metallic gold
    IFCSTAIR:               '#C5A028',  // brushed gold
    IFCSTAIRFLIGHT:         '#C5A028',
    IFCRAILING:             '#FFB300',  // safety amber
    IFCFURNISHINGELEMENT:   '#D4AF37',  // liquid gold
    IFCFLOWSEGMENT:         '#EC4899',  // hot pink MEP accent
    IFCFLOWFITTING:         '#EC4899',
    IFCFLOWTERMINAL:        '#F97316',  // neon orange MEP accent
    IFCCOVERING:            '#84CC16',  // lime
    IFCPLATE:               '#D4AF37',  // gold plate
    IFCMEMBER:              '#B5952F',  // antique gold member
    IFCFOOTING:             '#080F11',  // obsidian foundation
    IFCBUILDINGSTOREY:      '#333535',
    IFCSITE:                '#151D1E',  // deep site
    IFCBUILDINGELEMENTPROXY:'#D4AF37',
  },

  pencil: {
    IFCWALL:                '#e2e8f0',
    IFCWALLSTANDARDCASE:    '#e2e8f0',
    IFCSLAB:                '#cbd5e1',
    IFCCOLUMN:              '#0284c7',
    IFCBEAM:                '#0369a1',
    IFCDOOR:                '#f59e0b',
    IFCWINDOW:              '#38bdf8',
    IFCROOF:                '#94a3b8',
    IFCSTAIR:               '#64748b',
    IFCSTAIRFLIGHT:         '#64748b',
    IFCRAILING:             '#ea580c',
    IFCFURNISHINGELEMENT:   '#a855f7',
    IFCFLOWSEGMENT:         '#ef4444',
    IFCFLOWFITTING:         '#ef4444',
    IFCFLOWTERMINAL:        '#f97316',
    IFCCOVERING:            '#84cc16',
    IFCPLATE:               '#0284c7',
    IFCMEMBER:              '#0369a1',
    IFCFOOTING:             '#475569',
    IFCBUILDINGSTOREY:      '#e2e8f0',
    IFCSITE:                '#f8fafc',
    IFCBUILDINGELEMENTPROXY:'#0284c7',
  },

  bluepen: {
    IFCWALL:                '#1e3a8a',
    IFCWALLSTANDARDCASE:    '#1e3a8a',
    IFCSLAB:                '#1e40af',
    IFCCOLUMN:              '#60a5fa',
    IFCBEAM:                '#3b82f6',
    IFCDOOR:                '#f59e0b',
    IFCWINDOW:              '#93c5fd',
    IFCROOF:                '#1d4ed8',
    IFCSTAIR:               '#2563eb',
    IFCSTAIRFLIGHT:         '#2563eb',
    IFCRAILING:             '#f97316',
    IFCFURNISHINGELEMENT:   '#c084fc',
    IFCFLOWSEGMENT:         '#f43f5e',
    IFCFLOWFITTING:         '#f43f5e',
    IFCFLOWTERMINAL:        '#fb923c',
    IFCCOVERING:            '#a3e635',
    IFCPLATE:               '#60a5fa',
    IFCMEMBER:              '#3b82f6',
    IFCFOOTING:             '#172554',
    IFCBUILDINGSTOREY:      '#1e3a8a',
    IFCSITE:                '#0f172a',
    IFCBUILDINGELEMENTPROXY:'#60a5fa',
  },

  cozy: {
    IFCWALL:                '#44403c',
    IFCWALLSTANDARDCASE:    '#44403c',
    IFCSLAB:                '#292524',
    IFCCOLUMN:              '#f59e0b',
    IFCBEAM:                '#d97706',
    IFCDOOR:                '#b45309',
    IFCWINDOW:              '#38bdf8',
    IFCROOF:                '#78350f',
    IFCSTAIR:               '#92400e',
    IFCSTAIRFLIGHT:         '#92400e',
    IFCRAILING:             '#ef4444',
    IFCFURNISHINGELEMENT:   '#fbbf24',
    IFCFLOWSEGMENT:         '#f43f5e',
    IFCFLOWFITTING:         '#f43f5e',
    IFCFLOWTERMINAL:        '#fb923c',
    IFCCOVERING:            '#a3e635',
    IFCPLATE:               '#f59e0b',
    IFCMEMBER:              '#d97706',
    IFCFOOTING:             '#1c1917',
    IFCBUILDINGSTOREY:      '#44403c',
    IFCSITE:                '#0c0a09',
    IFCBUILDINGELEMENTPROXY:'#f59e0b',
  },

  cyberpunk: {
    IFCWALL:                '#181825',
    IFCWALLSTANDARDCASE:    '#181825',
    IFCSLAB:                '#11111b',
    IFCCOLUMN:              '#f5c2e7',
    IFCBEAM:                '#cba6f7',
    IFCDOOR:                '#fab387',
    IFCWINDOW:              '#89dceb',
    IFCROOF:                '#b4befe',
    IFCSTAIR:               '#74c7ec',
    IFCSTAIRFLIGHT:         '#74c7ec',
    IFCRAILING:             '#f38ba8',
    IFCFURNISHINGELEMENT:   '#a6e3a1',
    IFCFLOWSEGMENT:         '#f38ba8',
    IFCFLOWFITTING:         '#f38ba8',
    IFCFLOWTERMINAL:        '#fab387',
    IFCCOVERING:            '#a6e3a1',
    IFCPLATE:               '#f5c2e7',
    IFCMEMBER:              '#cba6f7',
    IFCFOOTING:             '#1e1e2e',
    IFCBUILDINGSTOREY:      '#181825',
    IFCSITE:                '#11111b',
    IFCBUILDINGELEMENTPROXY:'#f5c2e7',
  },

  amber: {
    IFCWALL:                '#451a03',
    IFCWALLSTANDARDCASE:    '#451a03',
    IFCSLAB:                '#290f02',
    IFCCOLUMN:              '#f59e0b',
    IFCBEAM:                '#d97706',
    IFCDOOR:                '#b45309',
    IFCWINDOW:              '#fbbf24',
    IFCROOF:                '#78350f',
    IFCSTAIR:               '#92400e',
    IFCSTAIRFLIGHT:         '#92400e',
    IFCRAILING:             '#f97316',
    IFCFURNISHINGELEMENT:   '#fef08a',
    IFCFLOWSEGMENT:         '#ef4444',
    IFCFLOWFITTING:         '#ef4444',
    IFCFLOWTERMINAL:        '#ea580c',
    IFCCOVERING:            '#ca8a04',
    IFCPLATE:               '#f59e0b',
    IFCMEMBER:              '#d97706',
    IFCFOOTING:             '#180800',
    IFCBUILDINGSTOREY:      '#451a03',
    IFCSITE:                '#0f0500',
    IFCBUILDINGELEMENTPROXY:'#f59e0b',
  },

  emerald: {
    IFCWALL:                '#064e3b',
    IFCWALLSTANDARDCASE:    '#064e3b',
    IFCSLAB:                '#022c22',
    IFCCOLUMN:              '#34d399',
    IFCBEAM:                '#10b981',
    IFCDOOR:                '#fbbf24',
    IFCWINDOW:              '#6ee7b7',
    IFCROOF:                '#047857',
    IFCSTAIR:               '#059669',
    IFCSTAIRFLIGHT:         '#059669',
    IFCRAILING:             '#f97316',
    IFCFURNISHINGELEMENT:   '#a7f3d0',
    IFCFLOWSEGMENT:         '#ef4444',
    IFCFLOWFITTING:         '#ef4444',
    IFCFLOWTERMINAL:        '#ea580c',
    IFCCOVERING:            '#84cc16',
    IFCPLATE:               '#34d399',
    IFCMEMBER:              '#10b981',
    IFCFOOTING:             '#022c22',
    IFCBUILDINGSTOREY:      '#064e3b',
    IFCSITE:                '#011711',
    IFCBUILDINGELEMENTPROXY:'#34d399',
  },

  indigo: {
    IFCWALL:                '#312e81',
    IFCWALLSTANDARDCASE:    '#312e81',
    IFCSLAB:                '#1e1b4b',
    IFCCOLUMN:              '#818cf8',
    IFCBEAM:                '#6366f1',
    IFCDOOR:                '#f59e0b',
    IFCWINDOW:              '#a5b4fc',
    IFCROOF:                '#4338ca',
    IFCSTAIR:               '#4f46e5',
    IFCSTAIRFLIGHT:         '#4f46e5',
    IFCRAILING:             '#f97316',
    IFCFURNISHINGELEMENT:   '#c7d2fe',
    IFCFLOWSEGMENT:         '#ef4444',
    IFCFLOWFITTING:         '#ef4444',
    IFCFLOWTERMINAL:        '#ea580c',
    IFCCOVERING:            '#84cc16',
    IFCPLATE:               '#818cf8',
    IFCMEMBER:              '#6366f1',
    IFCFOOTING:             '#0f0d2e',
    IFCBUILDINGSTOREY:      '#312e81',
    IFCSITE:                '#070619',
    IFCBUILDINGELEMENTPROXY:'#818cf8',
  },

  light: {
    IFCWALL:                '#cbd5e1',
    IFCWALLSTANDARDCASE:    '#cbd5e1',
    IFCSLAB:                '#94a3b8',
    IFCCOLUMN:              '#0284c7',
    IFCBEAM:                '#0369a1',
    IFCDOOR:                '#d97706',
    IFCWINDOW:              '#38bdf8',
    IFCROOF:                '#64748b',
    IFCSTAIR:               '#475569',
    IFCSTAIRFLIGHT:         '#475569',
    IFCRAILING:             '#ea580c',
    IFCFURNISHINGELEMENT:   '#9333ea',
    IFCFLOWSEGMENT:         '#dc2626',
    IFCFLOWFITTING:         '#dc2626',
    IFCFLOWTERMINAL:        '#d97706',
    IFCCOVERING:            '#65a30d',
    IFCPLATE:               '#0284c7',
    IFCMEMBER:              '#0369a1',
    IFCFOOTING:             '#334155',
    IFCBUILDINGSTOREY:      '#cbd5e1',
    IFCSITE:                '#e2e8f0',
    IFCBUILDINGELEMENTPROXY:'#0284c7',
  },
};

/** Default fallback palette */
THEME_PALETTES['default'] = THEME_PALETTES.zen;

/**
 * Get the category color for a given theme and IFC category.
 * Falls back to `FALLBACK_COLOR` if no mapping exists.
 */
export function getCategoryColor(themeName: string, ifcCategory: string): string {
  const normalizedCategory = ifcCategory.toUpperCase().replace(/STANDARDCASE$/, '');
  const palette = THEME_PALETTES[themeName] || THEME_PALETTES['zen'];
  const defaultPalette = THEME_PALETTES['zen'];
  return palette[ifcCategory.toUpperCase()] 
    || palette[normalizedCategory]
    || defaultPalette[ifcCategory.toUpperCase()]
    || FALLBACK_COLOR;
}

/**
 * Get the full palette for the current theme.
 */
export function getThemePalette(themeName: string): CategoryColorMap {
  return THEME_PALETTES[themeName] || THEME_PALETTES['zen'];
}
