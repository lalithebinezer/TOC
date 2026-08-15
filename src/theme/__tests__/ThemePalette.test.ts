import { describe, it, expect } from "vitest";
import { THEME_PALETTES, getCategoryColor, THEME_POST_PROCESS_CONFIG, FALLBACK_COLOR } from "../ThemePalette";

describe("ThemePalette Unit Tests", () => {
  it("should have all 9 architectural themes registered", () => {
    const expectedThemes = [
      "zen",
      "pencil",
      "bluepen",
      "cozy",
      "cyberpunk",
      "amber",
      "emerald",
      "indigo",
      "light",
    ];

    expectedThemes.forEach((themeKey) => {
      expect(THEME_PALETTES[themeKey]).toBeDefined();
      expect(THEME_PALETTES[themeKey].IFCWALL).toBeDefined();
      expect(THEME_PALETTES[themeKey].IFCSLAB).toBeDefined();
    });
  });

  it("should resolve correct category color for a known IFC class", () => {
    const wallColor = getCategoryColor("zen", "IFCWALL");
    expect(wallColor).toBe("#333535");

    const roofColor = getCategoryColor("pencil", "IFCROOF");
    expect(roofColor).toBe("#94a3b8");

    const slabColor = getCategoryColor("cyberpunk", "IFCSLAB");
    expect(slabColor).toBe("#11111b");
  });

  it("should fallback gracefully for unknown IFC categories", () => {
    const fallbackColor = getCategoryColor("zen", "IFCUNKNOWNENTITY");
    expect(fallbackColor).toBe(FALLBACK_COLOR);
  });

  it("should have post-processing configurations for special shader themes", () => {
    expect(THEME_POST_PROCESS_CONFIG.pencil).toBeDefined();
    expect(THEME_POST_PROCESS_CONFIG.bluepen).toBeDefined();
    expect(THEME_POST_PROCESS_CONFIG.cyberpunk).toBeDefined();
  });
});
