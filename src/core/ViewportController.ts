import * as OBC from "@thatopen/components";
import { BimEngine } from "./BimEngine";

export class ViewportController {
  private engine: BimEngine;
  public grid: any;

  constructor() {
    this.engine = BimEngine.getInstance();
    this.setupGrid();
  }

  private setupGrid() {
    const grids = this.engine.components.get(OBC.Grids);
    try {
      this.grid = grids.create(this.engine.world);
    } catch (e) {
      // Grid already created for world
      this.grid = (grids as any).list?.values()?.next()?.value;
    }
  }

  public setCameraMode(mode: "Orbit" | "FirstPerson" | "Plan") {
    if (this.engine.world.camera) {
      (this.engine.world.camera as any).set(mode as any);
    }
  }

  public setGridVisible(visible: boolean) {
    if (this.grid && this.grid.config) {
      this.grid.config.visible = visible;
    }
  }

  public setGridElevation(elevation: number) {
    if (this.grid && this.grid.three) {
      this.grid.three.position.y = elevation;
    }
  }
}
