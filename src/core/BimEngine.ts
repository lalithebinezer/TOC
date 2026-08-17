import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";

export class BimEngine {
  private static instance: BimEngine;

  public components: OBC.Components;
  public world: OBC.World;
  public container: HTMLElement;
  public fragments: OBC.FragmentsManager;
  public highlighter: OBF.Highlighter;
  public clipper: OBC.Clipper;
  public finder: OBC.ItemsFinder;
  public hider: OBC.Hider;

  private constructor(existingComponents?: OBC.Components, existingWorld?: OBC.World) {
    if (!existingComponents || !existingWorld) {
      throw new Error("BimEngine must be initialized with components and world first.");
    }
    
    if (typeof document !== "undefined") {
      const el = document.getElementById("container");
      if (!el) throw new Error("Critical: Missing #container in HTML for BimEngine");
      this.container = el;
    } else {
      this.container = {} as HTMLElement;
    }

    this.components = existingComponents;
    this.world = existingWorld;

    // Initialize core components
    this.fragments = this.components.get(OBC.FragmentsManager);
    this.highlighter = this.components.get(OBF.Highlighter);
    this.clipper = this.components.get(OBC.Clipper);
    this.finder = this.components.get(OBC.ItemsFinder);
    this.hider = this.components.get(OBC.Hider);

    this.setupListeners();
  }

  public static getInstance(components?: OBC.Components, world?: OBC.World): BimEngine {
    if (!BimEngine.instance) {
      BimEngine.instance = new BimEngine(components, world);
    }
    return BimEngine.instance;
  }

  private setupListeners() {
    if (this.world && this.world.onCameraChanged) {
      this.world.onCameraChanged.add((camera: any) => {
        for (const [, model] of this.fragments.list) {
          if (model && typeof model.useCamera === "function") {
            model.useCamera(camera.three);
          }
        }
      });
    }
  }
}
