import * as THREE from "three";
import { BimEngine } from "../core/BimEngine";

export class ExplosionModule {
  private static instance: ExplosionModule | null = null;
  private engine: BimEngine;
  private originalPositions: Map<THREE.Object3D, THREE.Vector3> = new Map();
  private modelCenter: THREE.Vector3 = new THREE.Vector3();
  private factor: number = 0;

  private constructor() {
    this.engine = BimEngine.getInstance();
  }

  public static getInstance(): ExplosionModule {
    if (!ExplosionModule.instance) {
      ExplosionModule.instance = new ExplosionModule();
    }
    return ExplosionModule.instance;
  }

  public cacheOriginalPositions() {
    this.originalPositions.clear();
    const box = new THREE.Box3();
    let hasObjects = false;

    for (const [, model] of this.engine.fragments.list) {
      if (model && model.object) {
        box.expandByObject(model.object);
        hasObjects = true;
        model.object.traverse((child: any) => {
          if (child.isMesh || child.isGroup) {
            this.originalPositions.set(child, child.position.clone());
          }
        });
      }
    }

    if (hasObjects) {
      box.getCenter(this.modelCenter);
    }
  }

  public setExplosionFactor(factor: number) {
    this.factor = Math.max(0, Math.min(1, factor));

    if (this.originalPositions.size === 0) {
      this.cacheOriginalPositions();
    }

    for (const [, model] of this.engine.fragments.list) {
      if (!model || !model.object) continue;

      model.object.traverse((child: any) => {
        const origPos = this.originalPositions.get(child);
        if (!origPos) return;

        if (this.factor === 0) {
          child.position.copy(origPos);
        } else {
          const worldPos = new THREE.Vector3();
          child.getWorldPosition(worldPos);

          const dir = worldPos.clone().sub(this.modelCenter);
          if (dir.lengthSq() < 0.0001) {
            dir.set(0, 1, 0);
          } else {
            dir.normalize();
          }

          // Displace outward up to 15 meters
          const offset = dir.multiplyScalar(this.factor * 15);
          child.position.copy(origPos).add(offset);
        }
      });
    }

    if (this.engine.fragments.core) {
      this.engine.fragments.core.update(true);
    }
  }

  public reset() {
    this.setExplosionFactor(0);
    this.originalPositions.clear();
  }
}
