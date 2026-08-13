import * as THREE from "three";
import { BimEngine } from "../core/BimEngine";

export class MinimapHUD {
  private static instance: MinimapHUD | null = null;
  private engine: BimEngine;
  private canvasEl: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private containerEl: HTMLElement | null = null;
  private visible: boolean = true;

  private constructor() {
    this.engine = BimEngine.getInstance();
    this.setupDOM();
  }

  public static getInstance(): MinimapHUD {
    if (!MinimapHUD.instance) {
      MinimapHUD.instance = new MinimapHUD();
    }
    return MinimapHUD.instance;
  }

  private setupDOM() {
    this.containerEl = document.getElementById("minimap-hud-container");
    if (!this.containerEl) {
      this.containerEl = document.createElement("div");
      this.containerEl.id = "minimap-hud-container";
      this.containerEl.style.cssText = `
        position: absolute;
        bottom: 70px;
        right: 20px;
        width: 140px;
        height: 140px;
        background: var(--bg-card, rgba(15, 23, 42, 0.85));
        border: 1px solid var(--border-color, rgba(255, 255, 255, 0.15));
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(8px);
        z-index: 12;
        overflow: hidden;
        pointer-events: auto;
      `;

      this.canvasEl = document.createElement("canvas");
      this.canvasEl.width = 140;
      this.canvasEl.height = 140;
      this.containerEl.appendChild(this.canvasEl);
      this.ctx = this.canvasEl.getContext("2d");

      // Label header
      const label = document.createElement("div");
      label.style.cssText = "position: absolute; top: 4px; left: 8px; font-size: 0.6rem; font-weight: 700; color: var(--text-dim, #94a3b8); text-transform: uppercase;";
      label.innerText = "MINIMAP";
      this.containerEl.appendChild(label);

      document.getElementById("container")?.appendChild(this.containerEl);
    }
  }

  public setVisible(visible: boolean) {
    this.visible = visible;
    if (this.containerEl) {
      this.containerEl.style.display = visible ? "block" : "none";
    }
  }

  public update() {
    if (!this.visible || !this.ctx || !this.canvasEl || !this.engine.world.camera) return;

    const ctx = this.ctx;
    const w = this.canvasEl.width;
    const h = this.canvasEl.height;
    const center = w / 2;

    ctx.clearRect(0, 0, w, h);

    // Background grid
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Get model bounding box footprint
    const bbox = new THREE.Box3();
    let hasModel = false;
    for (const [, model] of this.engine.fragments.list) {
      if (model && model.object) {
        bbox.expandByObject(model.object);
        hasModel = true;
      }
    }

    const camPos = new THREE.Vector3();
    const cam = this.engine.world.camera;
    if (!cam || !cam.controls) return;
    cam.controls.getPosition(camPos);

    const dir = new THREE.Vector3();
    cam.three.getWorldDirection(dir);
    const angle = Math.atan2(dir.x, dir.z);

    // Draw model footprint box
    if (hasModel && !bbox.isEmpty()) {
      const modelCenter = new THREE.Vector3();
      bbox.getCenter(modelCenter);
      const size = new THREE.Vector3();
      bbox.getSize(size);

      const scale = 80 / Math.max(size.x, size.z, 10);
      const relX = (modelCenter.x - camPos.x) * scale;
      const relZ = (modelCenter.z - camPos.z) * scale;

      ctx.save();
      ctx.translate(center + relX, center + relZ);
      ctx.strokeStyle = "rgba(59, 130, 246, 0.5)";
      ctx.fillStyle = "rgba(59, 130, 246, 0.1)";
      ctx.lineWidth = 1.5;
      ctx.fillRect(-size.x * scale / 2, -size.z * scale / 2, size.x * scale, size.z * scale);
      ctx.strokeRect(-size.x * scale / 2, -size.z * scale / 2, size.x * scale, size.z * scale);
      ctx.restore();
    }

    // Draw camera position indicator (Player Dot & Vision Cone)
    ctx.save();
    ctx.translate(center, center);

    // Vision frustum cone
    ctx.fillStyle = "rgba(234, 179, 8, 0.15)";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 35, -angle - Math.PI / 2 - 0.4, -angle - Math.PI / 2 + 0.4);
    ctx.closePath();
    ctx.fill();

    // Direction arrow
    ctx.rotate(-angle);
    ctx.fillStyle = "#eab308";
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(6, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}
