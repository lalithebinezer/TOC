import * as THREE from "three";
import { BimEngine } from "../core/BimEngine";

export class ClippingModule {
  private engine: BimEngine;
  private sectionPlanes: THREE.Plane[] = [];
  public sectionBoxEnabled: boolean = false;

  constructor() {
    this.engine = BimEngine.getInstance();
    this.initSectionPlanes();
  }

  private initSectionPlanes() {
    this.sectionPlanes = [
      new THREE.Plane(new THREE.Vector3(1, 0, 0), 1000),   // X-Min
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), 1000),  // X-Max
      new THREE.Plane(new THREE.Vector3(0, 1, 0), 1000),   // Y-Min
      new THREE.Plane(new THREE.Vector3(0, -1, 0), 1000),  // Y-Max
      new THREE.Plane(new THREE.Vector3(0, 0, 1), 1000),   // Z-Min
      new THREE.Plane(new THREE.Vector3(0, 0, -1), 1000)   // Z-Max
    ];
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
    this.setSectionBoxEnabled(false);
  }

  public setSectionBoxEnabled(enabled: boolean) {
    this.sectionBoxEnabled = enabled;
    const rendererThree = this.engine.world.renderer.three;
    
    if (enabled) {
      rendererThree.clippingPlanes = this.sectionPlanes;
      this.updateSectionBoxBounds(0, 0, 0, 50, 50, 50);
    } else {
      rendererThree.clippingPlanes = [];
    }
    
    if (this.engine.fragments.core) {
      this.engine.fragments.core.update(true);
    }
  }

  public updateSectionBoxBounds(
    minX: number, maxX: number,
    minY: number, maxY: number,
    minZ: number, maxZ: number
  ) {
    if (!this.sectionBoxEnabled) return;

    this.sectionPlanes[0].constant = -minX;
    this.sectionPlanes[1].constant = maxX;
    this.sectionPlanes[2].constant = -minY;
    this.sectionPlanes[3].constant = maxY;
    this.sectionPlanes[4].constant = -minZ;
    this.sectionPlanes[5].constant = maxZ;

    if (this.engine.fragments.core) {
      this.engine.fragments.core.update(true);
    }
  }
}
