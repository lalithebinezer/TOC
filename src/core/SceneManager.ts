import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { BluePenShader } from "../shaders/BluePenShader";
import { THEME_POST_PROCESS_CONFIG } from "../theme/ThemePalette";

export class SceneManager {
  private static instance: SceneManager | null = null;
  public bluePenPass: ShaderPass | null = null;
  public world: any = null;

  private constructor() {}

  public static getInstance(): SceneManager {
    if (!SceneManager.instance) {
      SceneManager.instance = new SceneManager();
    }
    return SceneManager.instance;
  }

  public get postproduction(): any {
    return this.world?.renderer?.postproduction ?? null;
  }

  public initPostProcessing(world: any) {
    this.world = world;
    const postproduction = (world.renderer as any).postproduction;
    if (postproduction) {
      const postProcToggle = document.getElementById("settings-toggle-postproc") as HTMLInputElement | null;
      const isEnabled = postProcToggle ? postProcToggle.checked : false;
      try {
        postproduction.enabled = isEnabled;
      } catch (e) {
        // Base pass initialized lazily by @thatopen/components
        console.warn("Postproduction base pass lazy initialization:", e);
      }
      if (postproduction.composer) {
        this.bluePenPass = new ShaderPass(BluePenShader as any);
        if (postproduction.depthTexture) {
          this.bluePenPass.uniforms.tDepth.value = postproduction.depthTexture;
        }
        this.bluePenPass.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
        this.bluePenPass.uniforms.enabled.value = isEnabled ? 1.0 : 0.0;
        postproduction.composer.addPass(this.bluePenPass);
        this.syncPostProcessingWithTheme('zen');
      }
    }
  }

  public syncPostProcessingWithTheme(themeName: string) {
    if (!this.bluePenPass) return;
    const cfg = THEME_POST_PROCESS_CONFIG[themeName] || THEME_POST_PROCESS_CONFIG['zen'];
    
    this.bluePenPass.uniforms.paperColor.value.setStyle(cfg.paperColor);
    this.bluePenPass.uniforms.inkColor.value.setStyle(cfg.inkColor);
    this.bluePenPass.uniforms.outlineGlowColor.value.setStyle(cfg.outlineGlowColor);
    this.bluePenPass.uniforms.vignetteIntensity.value = cfg.vignetteIntensity;
    this.bluePenPass.uniforms.bloomThreshold.value = cfg.bloomThreshold;
    this.bluePenPass.uniforms.bloomStrength.value = cfg.bloomStrength;
    this.bluePenPass.uniforms.toonSteps.value = cfg.toonSteps;
    this.bluePenPass.uniforms.lineThickness.value = cfg.lineThickness;
    this.bluePenPass.uniforms.jitterAmount.value = cfg.jitterAmount;
    this.bluePenPass.uniforms.postMode.value = cfg.postMode;
    this.bluePenPass.uniforms.chromaticAberration.value = cfg.chromaticAberration;

    // Sync UI Controls & Badges while respecting user's toggle state
    const postProcToggle = document.getElementById("settings-toggle-postproc") as HTMLInputElement | null;
    const postproduction = this.postproduction;
    const isEnabled = postProcToggle ? postProcToggle.checked : false;
    if (postproduction) {
      try {
        postproduction.enabled = isEnabled;
      } catch (e) {
        // Base pass initialized lazily by @thatopen/components
        console.warn("Postproduction base pass lazy initialization:", e);
      }
    }
    if (this.bluePenPass) {
      this.bluePenPass.uniforms.enabled.value = isEnabled ? 1.0 : 0.0;
    }
    if (postProcToggle) {
      postProcToggle.checked = isEnabled;
    }

    const thicknessInput = document.getElementById("settings-postproc-thickness") as HTMLInputElement | null;
    const thicknessVal = document.getElementById("val-postproc-thickness");
    if (thicknessInput) thicknessInput.value = cfg.lineThickness.toString();
    if (thicknessVal) thicknessVal.innerText = cfg.lineThickness.toFixed(1);

    const jitterInput = document.getElementById("settings-postproc-jitter") as HTMLInputElement | null;
    const jitterVal = document.getElementById("val-postproc-jitter");
    if (jitterInput) jitterInput.value = cfg.jitterAmount.toString();
    if (jitterVal) jitterVal.innerText = cfg.jitterAmount.toFixed(4);

    const bloomInput = document.getElementById("settings-postproc-bloom") as HTMLInputElement | null;
    const bloomVal = document.getElementById("val-postproc-bloom");
    if (bloomInput) bloomInput.value = cfg.bloomStrength.toString();
    if (bloomVal) bloomVal.innerText = cfg.bloomStrength.toFixed(2);

    const vignetteInput = document.getElementById("settings-postproc-vignette") as HTMLInputElement | null;
    const vignetteVal = document.getElementById("val-postproc-vignette");
    if (vignetteInput) vignetteInput.value = cfg.vignetteIntensity.toString();
    if (vignetteVal) vignetteVal.innerText = cfg.vignetteIntensity.toFixed(2);

    const chromaInput = document.getElementById("settings-postproc-chroma") as HTMLInputElement | null;
    const chromaVal = document.getElementById("val-postproc-chroma");
    if (chromaInput) chromaInput.value = cfg.chromaticAberration.toString();
    if (chromaVal) chromaVal.innerText = cfg.chromaticAberration.toFixed(2);

    const toonInput = document.getElementById("settings-postproc-toon") as HTMLInputElement | null;
    const toonVal = document.getElementById("val-postproc-toon");
    if (toonInput) toonInput.value = cfg.toonSteps.toString();
    if (toonVal) toonVal.innerText = cfg.toonSteps.toString();

    const fxModeInput = document.getElementById("settings-postproc-fxmode") as HTMLSelectElement | null;
    if (fxModeInput) fxModeInput.value = cfg.postMode.toString();
  }
}
