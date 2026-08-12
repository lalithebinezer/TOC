import { BimEngine } from "../core/BimEngine";


export class ClippingModule {
  private engine: BimEngine;

  constructor() {
    this.engine = BimEngine.getInstance();
  }

  public setEnabled(enabled: boolean) {
    this.engine.clipper.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.engine.clipper.enabled;
  }

  public createSectionPlane() {
    try {
      this.engine.clipper.create(this.engine.world);
    } catch (e) {
      try {
        (this.engine.clipper as any).create();
      } catch (err) {
        console.error("Failed to create section plane:", err);
      }
    }
  }

  public deleteAllPlanes() {
    this.engine.clipper.deleteAll();
  }
}
