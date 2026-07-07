import * as THREE from "three";

export class BimViewCube extends HTMLElement {
  private _camera: THREE.Camera | null = null;
  private cubeElement: HTMLDivElement;

  private isDraggingCube = false;
  private startPointerX = 0;
  private startPointerY = 0;
  private hasDraggedCube = false;
  private clickedFace: string | null = null;
  public mouseSensitivity = 1.0;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    this.shadowRoot!.innerHTML = `
      <style>
        :host {
          display: block;
          position: absolute;
          width: 60px;
          height: 60px;
          perspective: 400px;
          z-index: 99;
          pointer-events: auto;
          /* Inherit position from parent or set defaults */
          right: 1.5rem;
          bottom: 1.5rem;
        }

        .view-cube-container {
          width: 100%;
          height: 100%;
          transform-style: preserve-3d;
          cursor: grab;
        }

        .view-cube-container:active {
          cursor: grabbing;
        }

        .view-cube {
          width: 100%;
          height: 100%;
          position: relative;
          transform-style: preserve-3d;
          transform: matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
        }

        .cube-face {
          position: absolute;
          width: 60px;
          height: 60px;
          background: rgba(45, 55, 72, 0.85);
          border: 1.5px solid rgba(160, 174, 192, 0.8);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-sans, sans-serif);
          font-size: 0.6rem;
          font-weight: 700;
          letter-spacing: 0.5px;
          user-select: none;
          transition: background 0.2s, border-color 0.2s;
        }

        .cube-face:hover {
          background: rgba(66, 153, 225, 0.9);
          border-color: #fff;
          cursor: pointer;
        }

        .cube-front  { transform: rotateY(  0deg) translateZ(30px); }
        .cube-back   { transform: rotateY(180deg) translateZ(30px); }
        .cube-left   { transform: rotateY(-90deg) translateZ(30px); }
        .cube-right  { transform: rotateY( 90deg) translateZ(30px); }
        .cube-top    { transform: rotateX( 90deg) translateZ(30px); }
        .cube-bottom { transform: rotateX(-90deg) translateZ(30px); }
      </style>
      <div class="view-cube-container">
        <div class="view-cube" id="view-cube">
          <div class="cube-face cube-front" data-face="front">FRONT</div>
          <div class="cube-face cube-back" data-face="back">BACK</div>
          <div class="cube-face cube-left" data-face="left">LEFT</div>
          <div class="cube-face cube-right" data-face="right">RIGHT</div>
          <div class="cube-face cube-top" data-face="top">TOP</div>
          <div class="cube-face cube-bottom" data-face="bottom">BOTTOM</div>
        </div>
      </div>
    `;

    this.cubeElement = this.shadowRoot!.getElementById("view-cube") as HTMLDivElement;
    this.setupEvents();
  }

  set camera(cam: THREE.Camera | null) {
    this._camera = cam;
    this.updateOrientation();
  }

  get camera() {
    return this._camera;
  }

  public updateOrientation() {
    if (!this._camera) return;

    this._camera.updateMatrixWorld(true);
    const matrix = new THREE.Matrix4();
    matrix.extractRotation(this._camera.matrixWorld);

    const e = matrix.elements;
    this.cubeElement.style.transform = `matrix3d(
      ${e[0].toFixed(6)}, ${-e[1].toFixed(6)}, ${-e[2].toFixed(6)}, 0,
      ${-e[4].toFixed(6)}, ${e[5].toFixed(6)}, ${e[6].toFixed(6)}, 0,
      ${-e[8].toFixed(6)}, ${e[9].toFixed(6)}, ${e[10].toFixed(6)}, 0,
      0, 0, 0, 1
    )`;
  }

  private setupEvents() {
    const container = this.shadowRoot!.querySelector(".view-cube-container") as HTMLDivElement;
    
    container.addEventListener("pointerdown", (e: PointerEvent) => {
      const faceEl = (e.target as HTMLElement).closest(".cube-face");
      this.clickedFace = faceEl ? faceEl.getAttribute("data-face") : null;
      
      this.isDraggingCube = true;
      this.hasDraggedCube = false;
      this.startPointerX = e.clientX;
      this.startPointerY = e.clientY;
      container.setPointerCapture(e.pointerId);
    });

    container.addEventListener("pointermove", (e: PointerEvent) => {
      if (!this.isDraggingCube) return;
      const dx = e.clientX - this.startPointerX;
      const dy = e.clientY - this.startPointerY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        this.hasDraggedCube = true;
      }
      
      const speed = this.mouseSensitivity * 0.005; 
      
      this.dispatchEvent(new CustomEvent("drag", {
        detail: { dx: -dx * speed, dy: -dy * speed }
      }));
      
      this.startPointerX = e.clientX;
      this.startPointerY = e.clientY;
    });

    container.addEventListener("pointerup", (e: PointerEvent) => {
      if (this.isDraggingCube) {
        this.isDraggingCube = false;
        container.releasePointerCapture(e.pointerId);
        
        if (!this.hasDraggedCube && this.clickedFace) {
          this.dispatchEvent(new CustomEvent(`${this.clickedFace}click`));
        }
      }
      this.clickedFace = null;
    });

    container.addEventListener("pointercancel", (e: PointerEvent) => {
      if (this.isDraggingCube) {
        this.isDraggingCube = false;
        container.releasePointerCapture(e.pointerId);
      }
      this.clickedFace = null;
    });
  }
}

customElements.define("bim-view-cube", BimViewCube);
