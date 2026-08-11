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
 * - Cyberpunk: Neon-saturated, high-contrast sci-fi palette
 * - Sakura: Warm earth tones, organic Japanese garden palette
 * - BluePen: Monochrome blue drafting tones (blueprint style)
 * - Light: Clean pastel tones for light backgrounds
 * - Default (dark): Industrial/muted tones for the default dark theme
 */
export const THEME_PALETTES: ThemePalettes = {

  // ── Default Dark Theme ──
  default: {
    IFCWALL:                '#6B7280',  // cool grey
    IFCWALLSTANDARDCASE:    '#6B7280',
    IFCSLAB:                '#4B5563',  // darker grey
    IFCCOLUMN:              '#9CA3AF',  // light grey
    IFCBEAM:                '#78716C',  // warm grey
    IFCDOOR:                '#D97706',  // amber
    IFCWINDOW:              '#38BDF8',  // sky blue (glass)
    IFCROOF:                '#92400E',  // brown
    IFCSTAIR:               '#A78BFA',  // violet
    IFCSTAIRFLIGHT:         '#A78BFA',
    IFCRAILING:             '#F59E0B',  // yellow
    IFCFURNISHINGELEMENT:   '#34D399',  // emerald
    IFCFLOWSEGMENT:         '#F472B6',  // pink (MEP)
    IFCFLOWFITTING:         '#F472B6',
    IFCFLOWTERMINAL:        '#FB923C',  // orange (MEP)
    IFCCOVERING:            '#A3E635',  // lime
    IFCPLATE:               '#94A3B8',  // slate
    IFCMEMBER:              '#7DD3FC',  // light blue
    IFCFOOTING:             '#57534E',  // stone
    IFCBUILDINGSTOREY:      '#6B7280',
    IFCSITE:                '#166534',  // dark green
    IFCBUILDINGELEMENTPROXY:'#9CA3AF',
  },

  // ── Cyberpunk Neon Theme ──
  cyberpunk: {
    IFCWALL:                '#0E7490',  // dark cyan
    IFCWALLSTANDARDCASE:    '#0E7490',
    IFCSLAB:                '#164E63',  // deep teal
    IFCCOLUMN:              '#22D3EE',  // cyan neon
    IFCBEAM:                '#06B6D4',  // cyan
    IFCDOOR:                '#FBBF24',  // electric gold
    IFCWINDOW:              '#67E8F9',  // ice cyan (glass)
    IFCROOF:                '#7C3AED',  // violet neon
    IFCSTAIR:               '#A78BFA',  // purple
    IFCSTAIRFLIGHT:         '#A78BFA',
    IFCRAILING:             '#F59E0B',  // amber
    IFCFURNISHINGELEMENT:   '#10B981',  // neon green
    IFCFLOWSEGMENT:         '#EC4899',  // hot pink (MEP)
    IFCFLOWFITTING:         '#EC4899',
    IFCFLOWTERMINAL:        '#F97316',  // neon orange (MEP)
    IFCCOVERING:            '#84CC16',  // lime
    IFCPLATE:               '#3B82F6',  // electric blue
    IFCMEMBER:              '#38BDF8',  // sky
    IFCFOOTING:             '#475569',  // dark slate
    IFCBUILDINGSTOREY:      '#0891B2',
    IFCSITE:                '#059669',  // emerald
    IFCBUILDINGELEMENTPROXY:'#06B6D4',
  },

  // ── Sakura / Cozy Theme ──
  sakura: {
    IFCWALL:                '#8B7355',  // warm wood
    IFCWALLSTANDARDCASE:    '#8B7355',
    IFCSLAB:                '#6B5B4A',  // dark wood
    IFCCOLUMN:              '#A0826D',  // warm stone
    IFCBEAM:                '#7A6552',  // walnut
    IFCDOOR:                '#C4956A',  // honey oak
    IFCWINDOW:              '#69D7A5',  // jade green (glass)
    IFCROOF:                '#8B4513',  // saddle brown
    IFCSTAIR:               '#B8927A',  // terracotta
    IFCSTAIRFLIGHT:         '#B8927A',
    IFCRAILING:             '#D4A76A',  // gold bamboo
    IFCFURNISHINGELEMENT:   '#4ECB93',  // matcha green
    IFCFLOWSEGMENT:         '#CD8B76',  // salmon (MEP)
    IFCFLOWFITTING:         '#CD8B76',
    IFCFLOWTERMINAL:        '#E8A87C',  // peach (MEP)
    IFCCOVERING:            '#9CAF88',  // sage
    IFCPLATE:               '#A89080',  // warm grey
    IFCMEMBER:              '#7D9B8A',  // moss
    IFCFOOTING:             '#5C4F44',  // dark earth
    IFCBUILDINGSTOREY:      '#8B7355',
    IFCSITE:                '#3D6B4F',  // forest green
    IFCBUILDINGELEMENTPROXY:'#A0826D',
  },

  // ── Blue Pen / Blueprint Theme ──
  bluepen: {
    IFCWALL:                '#002395',  // royal blue
    IFCWALLSTANDARDCASE:    '#002395',
    IFCSLAB:                '#001A70',  // navy
    IFCCOLUMN:              '#1D4ED8',  // cobalt
    IFCBEAM:                '#1E3A8A',  // dark blue
    IFCDOOR:                '#2563EB',  // bright blue
    IFCWINDOW:              '#60A5FA',  // light blue (glass)
    IFCROOF:                '#1E40AF',  // dark royal
    IFCSTAIR:               '#3B82F6',  // blue
    IFCSTAIRFLIGHT:         '#3B82F6',
    IFCRAILING:             '#93C5FD',  // pale blue
    IFCFURNISHINGELEMENT:   '#2563EB',  // medium blue
    IFCFLOWSEGMENT:         '#6366F1',  // indigo (MEP)
    IFCFLOWFITTING:         '#6366F1',
    IFCFLOWTERMINAL:        '#818CF8',  // light indigo (MEP)
    IFCCOVERING:            '#BFDBFE',  // ice blue
    IFCPLATE:               '#1E3A8A',  // dark blue
    IFCMEMBER:              '#3B82F6',  // blue
    IFCFOOTING:             '#0F172A',  // near black blue
    IFCBUILDINGSTOREY:      '#002395',
    IFCSITE:                '#1E3A8A',
    IFCBUILDINGELEMENTPROXY:'#1D4ED8',
  },

  // ── Light Theme ──
  light: {
    IFCWALL:                '#D1D5DB',  // light grey
    IFCWALLSTANDARDCASE:    '#D1D5DB',
    IFCSLAB:                '#E5E7EB',  // pale grey
    IFCCOLUMN:              '#9CA3AF',  // medium grey
    IFCBEAM:                '#B0A090',  // warm beige
    IFCDOOR:                '#F59E0B',  // amber
    IFCWINDOW:              '#93C5FD',  // soft blue (glass)
    IFCROOF:                '#B45309',  // dark amber
    IFCSTAIR:               '#C084FC',  // soft purple
    IFCSTAIRFLIGHT:         '#C084FC',
    IFCRAILING:             '#FCD34D',  // light yellow
    IFCFURNISHINGELEMENT:   '#6EE7B7',  // mint
    IFCFLOWSEGMENT:         '#F9A8D4',  // soft pink (MEP)
    IFCFLOWFITTING:         '#F9A8D4',
    IFCFLOWTERMINAL:        '#FDBA74',  // soft orange (MEP)
    IFCCOVERING:            '#BEF264',  // lime
    IFCPLATE:               '#CBD5E1',  // blue grey
    IFCMEMBER:              '#BAE6FD',  // pale blue
    IFCFOOTING:             '#78716C',  // stone
    IFCBUILDINGSTOREY:      '#D1D5DB',
    IFCSITE:                '#86EFAC',  // soft green
    IFCBUILDINGELEMENTPROXY:'#D1D5DB',
  },
};

/**
 * Get the category color for a given theme and IFC category.
 * Falls back to `FALLBACK_COLOR` if no mapping exists.
 */
export function getCategoryColor(themeName: string, ifcCategory: string): string {
  const normalizedCategory = ifcCategory.toUpperCase().replace(/STANDARDCASE$/, '');
  const palette = THEME_PALETTES[themeName] || THEME_PALETTES['default'];
  return palette[ifcCategory.toUpperCase()] 
    || palette[normalizedCategory]
    || palette['default']?.[ifcCategory.toUpperCase()]
    || FALLBACK_COLOR;
}

/**
 * Get the full palette for the current theme.
 */
export function getThemePalette(themeName: string): CategoryColorMap {
  return THEME_PALETTES[themeName] || THEME_PALETTES['default'];
}
