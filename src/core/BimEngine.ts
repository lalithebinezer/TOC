import * as THREE from "three";
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
    this.container = document.getElementById("container")!;
    if (!this.container) {
      throw new Error("Container element #container not found");
    }

    this.components = existingComponents || new OBC.Components();
    const worlds = this.components.get(OBC.Worlds);

    this.world = existingWorld || worlds.create<
      OBC.ShadowedScene,
      OBC.OrthoPerspectiveCamera,
      OBF.PostproductionRenderer
    >();

    if (!existingWorld) {
      const scene = new OBC.ShadowedScene(this.components);
      this.world.scene = scene;

      this.world.renderer = new OBF.PostproductionRenderer(this.components, this.container);
      this.world.renderer.three.shadowMap.enabled = true;
      this.world.renderer.three.shadowMap.type = THREE.PCFShadowMap;
      (this.world.renderer as any).showLogo = false;

      this.world.camera = new OBC.OrthoPerspectiveCamera(this.components);
      if (this.world.camera.controls) {
        const controls = this.world.camera.controls as any;
        controls.enabled = true;
        if (controls.mouseButtons) {
          controls.mouseButtons.left = 1;
          controls.mouseButtons.right = 2;
          controls.mouseButtons.wheel = 3;
        }
        if (controls.touches) {
          controls.touches.one = 1;
          controls.touches.two = 3;
        }
      }
      (this.world.camera as any).set("Orbit");

      scene.setup();
      scene.three.background = null;

      this.components.init();
    }

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
    this.world.onCameraChanged.add((camera: any) => {
      for (const [, model] of this.fragments.list) {
        model.useCamera(camera.three);
      }
    });

    this.container.addEventListener("wheel", (e: WheelEvent) => {
      e.preventDefault();
      if (this.world.camera && this.world.camera.controls) {
        const zoomFactor = e.deltaY > 0 ? 1.15 : 0.85;
        this.world.camera.controls.dollyTo(this.world.camera.controls.distance * zoomFactor, true);
      }
    }, { passive: false });
  }
}
