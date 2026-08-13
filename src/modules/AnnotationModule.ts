import * as THREE from "three";
import { BimEngine } from "../core/BimEngine";

export interface PinAnnotation {
  id: string;
  position: THREE.Vector3;
  title: string;
  comment: string;
  category: string;
  elementId?: number;
  timestamp: string;
  elementEl?: HTMLElement;
}

export class AnnotationModule {
  private static instance: AnnotationModule | null = null;
  private engine: BimEngine;
  public enabled: boolean = false;
  private annotations: PinAnnotation[] = [];
  private containerEl: HTMLElement | null = null;

  private constructor() {
    this.engine = BimEngine.getInstance();
    this.setupOverlayContainer();
  }

  public static getInstance(): AnnotationModule {
    if (!AnnotationModule.instance) {
      AnnotationModule.instance = new AnnotationModule();
    }
    return AnnotationModule.instance;
  }

  private setupOverlayContainer() {
    this.containerEl = document.getElementById("annotation-overlay-container");
    if (!this.containerEl) {
      this.containerEl = document.createElement("div");
      this.containerEl.id = "annotation-overlay-container";
      this.containerEl.style.cssText = "position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 15;";
      document.getElementById("container")?.appendChild(this.containerEl);
    }
  }

  public enablePinCreation(enabled: boolean) {
    this.enabled = enabled;
  }

  public addAnnotation(pos: THREE.Vector3, title: string, comment: string, category: string = "Issue", elementId?: number): PinAnnotation {
    const anno: PinAnnotation = {
      id: `anno-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      position: pos.clone(),
      title,
      comment,
      category,
      elementId,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    this.annotations.push(anno);
    this.renderAnnotationDOM(anno);
    this.updateOverlayPositions();
    return anno;
  }

  private renderAnnotationDOM(anno: PinAnnotation) {
    if (!this.containerEl) return;

    const pinEl = document.createElement("div");
    pinEl.className = "annotation-pin-badge";
    pinEl.dataset.id = anno.id;
    pinEl.style.cssText = `
      position: absolute;
      transform: translate(-50%, -100%);
      pointer-events: auto;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.3rem;
      background: var(--bg-card, rgba(15, 23, 42, 0.9));
      border: 1.5px solid var(--accent-500, #3b82f6);
      color: #ffffff;
      padding: 0.25rem 0.5rem;
      border-radius: 20px;
      font-size: 0.7rem;
      font-weight: 600;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
      transition: transform 0.15s ease, border-color 0.15s ease;
    `;

    pinEl.innerHTML = `
      <span style="background: var(--accent-500, #3b82f6); width: 8px; height: 8px; border-radius: 50%; display: inline-block;"></span>
      <span>${anno.title}</span>
      <button class="btn-remove-pin" title="Delete pin" style="background: none; border: none; color: #ef4444; font-size: 0.8rem; cursor: pointer; padding: 0 0.1rem;">×</button>
    `;

    const removeBtn = pinEl.querySelector(".btn-remove-pin");
    if (removeBtn) {
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.removeAnnotation(anno.id);
      });
    }

    pinEl.addEventListener("click", () => {
      alert(`📌 Annotation Details:\nTitle: ${anno.title}\nCategory: ${anno.category}\nComment: ${anno.comment}\nTime: ${anno.timestamp}`);
    });

    this.containerEl.appendChild(pinEl);
    anno.elementEl = pinEl;
  }

  public removeAnnotation(id: string) {
    const idx = this.annotations.findIndex(a => a.id === id);
    if (idx !== -1) {
      const anno = this.annotations[idx];
      if (anno.elementEl) {
        anno.elementEl.remove();
      }
      this.annotations.splice(idx, 1);
    }
  }

  public updateOverlayPositions() {
    if (!this.engine.world.camera || this.annotations.length === 0) return;

    const camera = this.engine.world.camera.three;
    const canvas = this.engine.container;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    for (const anno of this.annotations) {
      if (!anno.elementEl) continue;

      const tempV = anno.position.clone();
      tempV.project(camera);

      // Check if point is behind camera
      if (tempV.z > 1) {
        anno.elementEl.style.display = "none";
        continue;
      }

      anno.elementEl.style.display = "flex";
      const x = (tempV.x * 0.5 + 0.5) * width;
      const y = (tempV.y * -0.5 + 0.5) * height;

      anno.elementEl.style.left = `${x}px`;
      anno.elementEl.style.top = `${y}px`;
    }
  }

  public getAnnotations(): PinAnnotation[] {
    return this.annotations;
  }

  public clearAll() {
    for (const anno of this.annotations) {
      if (anno.elementEl) anno.elementEl.remove();
    }
    this.annotations = [];
  }
}
