import './style.css';
import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as BUI from "@thatopen/ui";
import CameraControls from "camera-controls";
import { PropertyEditor, initPropertyEditorUI } from "./ui/PropertyEditor";
import "./ui/BimViewCube";
import { getCategoryColor } from "./theme/ThemePalette";
import { ScheduleManager } from "./modules/ScheduleManager";
import { exportBOQAsCSV, generateBOQSummary, extractQuantityData, type BOQLineItem } from "./modules/BoqGenerator";

import { BCFManager } from "./modules/BcfManager";
import { IDSChecker } from "./modules/IdsChecker";
import { BimEngine } from "./core/BimEngine";
import { ModelManager } from "./core/ModelManager";
import { ViewportController } from "./core/ViewportController";
import { ClippingModule } from "./modules/ClippingModule";
import { QueryModule } from "./modules/QueryModule";
import { IdsModule } from "./modules/IdsModule";
import { Timeline4DModule } from "./modules/Timeline4DModule";
import { Boq5DModule } from "./modules/Boq5DModule";
import { FederationModule } from "./modules/FederationModule";
import { CommandPalette } from "./ui/CommandPalette";
import { SceneManager } from "./core/SceneManager";
import { KeyboardController } from "./core/KeyboardController";
import { CustomViewManager } from "./core/CustomViewManager";
import { CostChartComponent } from "./ui/CostChartComponent";
import { UIManager } from "./ui/UIManager";
import { ExplosionModule } from "./modules/ExplosionModule";
import { AnnotationModule } from "./modules/AnnotationModule";
import { SnapshotModule } from "./modules/SnapshotModule";
import { HighlighterManager } from "./modules/HighlighterManager";
import { ModelInfoManager } from "./modules/ModelInfoManager";
import { MinimapHUD } from "./ui/MinimapHUD";
import { GlobalSearchOverlay } from "./ui/GlobalSearchOverlay";
import { formatCurrency, formatItemCount } from "./utils/formatters";
import { getEl } from "./utils/dom";

BUI.Manager.init();

// --- INITIALIZE ENTERPRISE BIM ENGINE ---
const components = new OBC.Components();
const worlds = components.get(OBC.Worlds);

const world = worlds.create<
  OBC.ShadowedScene,
  OBC.OrthoPerspectiveCamera,
  OBF.PostproductionRenderer
>();

const scene = new OBC.ShadowedScene(components);
world.scene = scene;
(window as any).viewer_world = world;

const container = getEl("container");
world.renderer = new OBF.PostproductionRenderer(components, container);
world.renderer.three.setPixelRatio(Math.min(window.devicePixelRatio, 2));
world.renderer.three.shadowMap.enabled = true;
world.renderer.three.shadowMap.type = THREE.PCFShadowMap;

// WebGL Context Loss & Recovery Guard
const glCanvas = world.renderer.three.domElement;
if (glCanvas) {
  glCanvas.addEventListener("webglcontextlost", (e: Event) => {
    e.preventDefault();
    console.warn("⚠️ WebGL context lost! Pausing engine render loop...");
    if (typeof (window as any).showToast === "function") {
      (window as any).showToast("GPU Memory Warning: WebGL context lost. Restoring...", `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`);
    }
  });

  glCanvas.addEventListener("webglcontextrestored", () => {
    console.info("✅ WebGL context restored. Rebuilding scene & shaders...");
    try {
      if (world.renderer) {
        world.renderer.three.setSize(container.clientWidth, container.clientHeight);
        world.renderer.three.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        if (world.renderer.update) world.renderer.update();
      }
      if (world.scene && (world.scene as any).setup) {
        (world.scene as any).setup();
      }
      if (world.camera && (world.camera as any).update) {
        (world.camera as any).update();
      }
      if (typeof (window as any).sceneManager?.initPostProcessing === "function") {
        (window as any).sceneManager.initPostProcessing();
      }
      if (typeof (window as any).applyCategoryColors === "function") {
        (window as any).applyCategoryColors();
      }
      if (typeof (window as any).showToast === "function") {
        (window as any).showToast("WebGL Context Successfully Restored", `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="20 6 9 17 4 12"/></svg>`);
      }
    } catch (err) {
      console.error("Failed to reinitialize WebGL context:", err);
    }
  });
}

world.camera = new OBC.OrthoPerspectiveCamera(components);
world.camera.currentWorld = world;
const camAny = world.camera as any;
if (!camAny._navigationModes.has("Orbit")) {
  camAny._navigationModes.set("Orbit", new OBC.OrbitMode(world.camera));
  camAny._navigationModes.set("FirstPerson", new OBC.FirstPersonMode(world.camera));
  camAny._navigationModes.set("Plan", new OBC.PlanMode(world.camera));
  camAny._mode = camAny._navigationModes.get("Orbit");
}
world.camera.set("Orbit");
if (world.camera.threePersp) {
  world.camera.threePersp.fov = 55;
  world.camera.threePersp.near = 0.01;
  world.camera.threePersp.far = 3000;
  world.camera.threePersp.updateProjectionMatrix();
}
if (world.camera.threeOrtho) {
  world.camera.threeOrtho.near = 0.01;
  world.camera.threeOrtho.far = 3000;
  world.camera.threeOrtho.updateProjectionMatrix();
}
if (world.camera.controls) {
  const controls = world.camera.controls as any;
  controls.enabled = true;
  controls.dollyToCursor = true;
  controls.dollySpeed = 0.3;
  controls.zoomSpeed = 0.3;
  if (controls.mouseButtons) {
    controls.mouseButtons.left = CameraControls.ACTION.ROTATE;
    controls.mouseButtons.right = CameraControls.ACTION.TRUCK;
    controls.mouseButtons.middle = CameraControls.ACTION.DOLLY;
    controls.mouseButtons.wheel = CameraControls.ACTION.DOLLY;
  }
  if (controls.touches) {
    controls.touches.one = CameraControls.ACTION.TOUCH_ROTATE;
    controls.touches.two = CameraControls.ACTION.TOUCH_DOLLY_TRUCK;
  }
}

scene.setup();
scene.three.background = null;

components.init();

// Initialize BimEngine singleton with primary components & world
const bimEngine = BimEngine.getInstance(components, world);
(window as any).bimEngine = bimEngine;
(window as any).ExplosionModule = ExplosionModule;

// Initialize Controllers & Managers
KeyboardController.getInstance().init();
UIManager.getInstance().init();

const customViewManager = CustomViewManager.getInstance();
customViewManager.init(world);
(window as any).customViewManager = customViewManager;



// Top Ribbon Saved Views Flyout Menu Toggle
const btnRibbonSavedViews = getEl("btn-ribbon-saved-views");
const menuSavedViews = getEl("menu-saved-views");

if (btnRibbonSavedViews && menuSavedViews) {
  btnRibbonSavedViews.addEventListener("click", (e) => {
    e.stopPropagation();
    menuSavedViews.classList.toggle("hidden");
  });

  document.addEventListener("click", (e) => {
    if (!menuSavedViews.contains(e.target as Node) && !btnRibbonSavedViews.contains(e.target as Node)) {
      menuSavedViews.classList.add("hidden");
    }
  });
}

getEl("btn-add-viewpoint")?.addEventListener("click", () => {
  let name: string | null = null;
  try {
    name = prompt("Enter a name for this Custom View (stores camera, clustering, and visual settings):", `Custom View #${customViewManager.getAllViews().length + 1}`);
  } catch {
    name = null;
  }
  if (name && name.trim()) {
    customViewManager.saveCurrentView(name.trim());
  }
});

// Initialize Managers
const scheduleManager = new ScheduleManager();
(window as any).scheduleManager = scheduleManager;

const bcfManager = new BCFManager(components, world);
bcfManager.init();
(window as any).bcfManager = bcfManager;

const idsChecker = new IDSChecker(components);
(window as any).idsChecker = idsChecker;

// Initialize FragmentsManager early
const fragments = components.get(OBC.FragmentsManager);
fragments.init(import.meta.env.BASE_URL + "worker.mjs");

const modelManager = new ModelManager();
const viewportController = new ViewportController();
const clippingModule = new ClippingModule();
const queryModule = new QueryModule();
const idsModule = new IdsModule();
const timeline4DModule = new Timeline4DModule();
const boq5DModule = new Boq5DModule();
const federationModule = new FederationModule();

// Initialize Global BIM Search Overlay
const globalSearchOverlay = GlobalSearchOverlay.getInstance();
(window as any).globalSearchOverlay = globalSearchOverlay;

(window as any).bimEngine = bimEngine;
(window as any).modelManager = modelManager;
(window as any).viewportController = viewportController;
(window as any).federationModule = federationModule;
(window as any).boq5DModule = boq5DModule;

// Setup Command Palette (Ctrl + K)
const commandPalette = new CommandPalette([
  {
    label: "Switch to Zen Infrastructure Theme", action: () => {
      const themeSelect = getEl("select-theme-toggle") as HTMLSelectElement | null;
      if (themeSelect) {
        themeSelect.value = "zen";
        themeSelect.dispatchEvent(new Event("change"));
      }
    }
  },
  {
    label: "Switch to Pencil & Paper Theme", action: () => {
      const themeSelect = getEl("select-theme-toggle") as HTMLSelectElement | null;
      if (themeSelect) {
        themeSelect.value = "pencil";
        themeSelect.dispatchEvent(new Event("change"));
      }
    }
  },
  {
    label: "Switch to Bluepen Draft Theme", action: () => {
      const themeSelect = getEl("select-theme-toggle") as HTMLSelectElement | null;
      if (themeSelect) {
        themeSelect.value = "bluepen";
        themeSelect.dispatchEvent(new Event("change"));
      }
    }
  },
  {
    label: "Switch to Cyberpunk Neon Theme", action: () => {
      const themeSelect = getEl("select-theme-toggle") as HTMLSelectElement | null;
      if (themeSelect) {
        themeSelect.value = "cyberpunk";
        themeSelect.dispatchEvent(new Event("change"));
      }
    }
  },
  {
    label: "Top 2D Orthographic View", action: () => {
      getEl("btn-view-top")?.click();
    }
  },
  {
    label: "Reset 3D Isometric View", action: () => {
      getEl("btn-view-iso")?.click();
    }
  },
  {
    label: "Bookmark Current Camera Viewpoint", action: () => {
      getEl("btn-add-viewpoint")?.click();
    }
  },
  {
    label: "Export Bills of Quantities (BOQ CSV)", action: () => {
      getEl("btn-export-boq-csv")?.click();
    }
  },
  { label: "Toggle Section Cut Mode", action: () => clippingModule.createSectionPlane() },
  { label: "Clear All Section Planes", action: () => clippingModule.deleteAllPlanes() },
  {
    label: "Run IDS Door Compliance Audit", action: () => {
      const spec = idsModule.createSampleDoorSpec();
      idsModule.runAudit(spec);
    }
  },
  { label: "Start 4D Simulation Playback", action: () => timeline4DModule.startSimulation() },
  { label: "Stop 4D Simulation", action: () => timeline4DModule.stopSimulation() },
  { label: "Export 4K Architectural Snapshot (.png)", action: () => SnapshotModule.getInstance().captureTechnicalSnapshot() },
  { label: "Reset Model Visibility", action: () => queryModule.resetVisibility() },
  {
    label: "Exploded Disassembly View (50% Expansion)", action: () => {
      const slider = getEl("settings-explosion-slider") as HTMLInputElement | null;
      if (slider) { slider.value = "50"; slider.dispatchEvent(new Event("input")); }
    }
  },
  {
    label: "Exploded Disassembly View (100% Full Separation)", action: () => {
      const slider = getEl("settings-explosion-slider") as HTMLInputElement | null;
      if (slider) { slider.value = "100"; slider.dispatchEvent(new Event("input")); }
    }
  },
  {
    label: "Reset Exploded Disassembly (0% Assembled)", action: () => {
      const slider = getEl("settings-explosion-slider") as HTMLInputElement | null;
      if (slider) { slider.value = "0"; slider.dispatchEvent(new Event("input")); }
    }
  },
  {
    label: "Exploded View: Sort by Category Clusters", action: () => {
      const select = getEl("select-explosion-mode") as HTMLSelectElement | null;
      if (select) { select.value = "category-cluster"; select.dispatchEvent(new Event("change")); }
    }
  },
  {
    label: "Exploded View: Asset & Equipment Matrix Mode (Tandem)", action: () => {
      const select = getEl("select-explosion-mode") as HTMLSelectElement | null;
      if (select) { select.value = "asset-dense-cluster"; select.dispatchEvent(new Event("change")); }
    }
  },
  {
    label: "Exploded View: Sort by Storey Levels", action: () => {
      const select = getEl("select-explosion-mode") as HTMLSelectElement | null;
      if (select) { select.value = "storey-cluster"; select.dispatchEvent(new Event("change")); }
    }
  },
  {
    label: "Exploded View: Radial Spatial Mode", action: () => {
      const select = getEl("select-explosion-mode") as HTMLSelectElement | null;
      if (select) { select.value = "radial"; select.dispatchEvent(new Event("change")); }
    }
  },
  {
    label: "Save Current Configuration as Custom View (Bookmark)", action: () => {
      const name = prompt("Enter a name for this Custom View (stores camera, clustering, and visual settings):", `View #${CustomViewManager.getInstance().getAllViews().length + 1}`);
      if (name && name.trim()) {
        CustomViewManager.getInstance().saveCurrentView(name.trim());
      }
    }
  },
  {
    label: "Open Saved Custom Views Ribbon", action: () => {
      const menu = getEl("menu-saved-views");
      if (menu) menu.classList.toggle("hidden");
    }
  },
  {
    label: "Toggle Help & Guide Modal", action: () => {
      if (typeof (window as any).toggleShortcutsModal === "function") {
        (window as any).toggleShortcutsModal();
      }
    }
  }
]);
(window as any).commandPalette = commandPalette;

world.onCameraChanged.add((camera) => {
  for (const [, model] of fragments.list) {
    model.useCamera(camera.three);
  }
  MinimapHUD.getInstance().update();
});

// Dynamic Metric Scale Ruler HUD calculation
function updateMetricScaleBar() {
  const scaleLabelEl = getEl("scale-bar-label");
  const cam = world.camera?.three;
  if (!scaleLabelEl || !cam) return;
  try {
    const target = new THREE.Vector3();
    world.camera.controls.getTarget(target);
    const dist = cam.position.distanceTo(target);
    const fov = (cam as THREE.PerspectiveCamera).fov ?? 45;
    const fovRad = (fov * Math.PI) / 180;
    const visibleHeight = 2 * Math.tan(fovRad / 2) * Math.max(1, dist);
    const visibleWidth = visibleHeight * (window.innerWidth / Math.max(1, window.innerHeight));
    const metersPerPixel = visibleWidth / Math.max(1, window.innerWidth);
    const rulerMeters = Math.max(0.1, metersPerPixel * 80);
    scaleLabelEl.innerText = rulerMeters >= 10 ? `${Math.round(rulerMeters)} m` : `${rulerMeters.toFixed(1)} m`;
  } catch (e) {
    // fallback
  }
}

// Continuously update MinimapHUD, Scale Ruler, and 3D Pin Annotations on render loops
function animateHUD() {
  MinimapHUD.getInstance().update();
  AnnotationModule.getInstance().updateOverlayPositions();
  updateMetricScaleBar();
  requestAnimationFrame(animateHUD);
}
animateHUD();
if (world.renderer) {
  world.renderer.showLogo = false;
}

// Add Ground Reference Grid
const grids = components.get(OBC.Grids);
let simpleGrid: any;
try {
  simpleGrid = grids.create(world);
} catch (e) {
  simpleGrid = (grids as any).list?.values()?.next()?.value;
}
(window as any).viewer_grid = simpleGrid;

const grid = new THREE.GridHelper(120, 60, 0x64748b, 0x334155);
grid.position.y = -0.01;
world.scene.three.add(grid);

// Multi-Selection State Storage
const multiSelectedElements: Record<string, Set<number>> = {};
(window as any).multiSelectedElements = multiSelectedElements;

function updateBreadcrumbs(storeyName: string = "Level 0", elementName: string = "Element", _modelId?: string, expressId?: number) {
  const storeyEl = getEl("breadcrumb-storey");
  const elemEl = getEl("breadcrumb-element");
  if (storeyEl) storeyEl.innerText = storeyName;
  if (elemEl) {
    if (expressId !== undefined && !elementName.includes(`#${expressId}`)) {
      elemEl.innerText = `${elementName} (#${expressId})`;
    } else {
      elemEl.innerText = elementName;
    }
  }
}

// Breadcrumb interactive clicks
getEl("breadcrumb-project")?.addEventListener("click", () => {
  (window as any).showAllElements?.();
  updateBreadcrumbs("All Storeys", "Entire Model");
  showToast("Showing Complete Project Model", `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 9h1M9 13h1M9 17h1M14 9h1M14 13h1M14 17h1"/></svg>`);
});

getEl("breadcrumb-storey")?.addEventListener("click", () => {
  const activeStorey = getEl("breadcrumb-storey")?.innerText || "Level 0";
  showToast(`Storey Scope: ${activeStorey}`, `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M2 20h20M5 20V8l7-5 7 5v12"/></svg>`);
});

// Update single & multi-selection batch cards
function updateMultiSelectionBatchCard() {
  const card = getEl("multi-selection-batch-card");
  const countEl = getEl("batch-selected-count");
  const volEl = getEl("batch-total-volume");
  const costEl = getEl("batch-total-cost");
  if (!card || !countEl || !volEl || !costEl) return;

  let totalCount = 0;
  for (const mid in multiSelectedElements) {
    totalCount += multiSelectedElements[mid].size;
  }

  if (totalCount > 1) {
    card.style.display = "flex";
    countEl.innerText = String(totalCount);
    const estVol = (totalCount * 0.45).toFixed(2);
    const estCost = (totalCount * 125).toLocaleString();
    volEl.innerText = `${estVol} m³`;
    costEl.innerText = `$${estCost}`;
  } else {
    card.style.display = "none";
  }
}

getEl("btn-batch-clear")?.addEventListener("click", () => {
  for (const mid in multiSelectedElements) {
    multiSelectedElements[mid].clear();
  }
  highlighter.clear("select");
  updateMultiSelectionBatchCard();
  resetPropertiesPanel();
  showToast("Cleared Selection", `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`);
});

getEl("btn-batch-isolate")?.addEventListener("click", () => {
  highlighter.highlightByID("select", multiSelectedElements, true, true);
  showToast("Isolated Selected Batch", `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`);
});

getEl("btn-batch-xray")?.addEventListener("click", () => {
  AnnotationModule.getInstance().toggleXRay();
  showToast("Toggled X-Ray for Batch", `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 3H5a2 2 0 0 0-2 2v4m0 6v4a2 2 0 0 0 2 2h4m6 0h4a2 2 0 0 0 2-2v-4m0-6V5a2 2 0 0 0-2-2h-4"/><circle cx="12" cy="12" r="3"/></svg>`);
});

// Fetch Ambient and Directional Lights from the scene setup for settings panel binding
let ambientLight: any = null;
let dirLight: any = null;

world.scene.three.traverse((child) => {
  if (child instanceof THREE.AmbientLight) {
    ambientLight = child;
  } else if (child instanceof THREE.DirectionalLight) {
    dirLight = child;
  }
});

// Configure default light intensities and shadow properties
if (ambientLight) ambientLight.intensity = 1.5;
if (dirLight) {
  dirLight.intensity = 1.5;
  dirLight.castShadow = false;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 300;
  dirLight.shadow.camera.left = -60;
  dirLight.shadow.camera.right = 60;
  dirLight.shadow.camera.top = 60;
  dirLight.shadow.camera.bottom = -60;
  dirLight.shadow.bias = -0.0005;
  dirLight.shadow.normalBias = 0.02;
  world.scene.three.add(dirLight.target);
}
world.scene.shadowsEnabled = false;

const sceneManager = SceneManager.getInstance();
sceneManager.initPostProcessing(world);

export function syncPostProcessingWithTheme(themeName: string) {
  sceneManager.syncPostProcessingWithTheme(themeName);
}
(window as any).syncPostProcessingWithTheme = syncPostProcessingWithTheme;

// --- BIM & GEOMETRY INGESTION SETUP ---
const ifcLoader = components.get(OBC.IfcLoader);

// --- CLIPPER (SECTION PLANES) SETUP ---
const clipper = components.get(OBC.Clipper);
clipper.enabled = false;
const clipping = new ClippingModule();

// Initialize Raycasters & Mouse helper for Clipper section plane picking & raycasting
const raycasters = components.get(OBC.Raycasters);
raycasters.get(world);

let mouse: any = null;
try {
  if (container) {
    mouse = new (OBC as any).Mouse(container);
  }
} catch (e) {
  console.warn("Mouse component fallback setup:", e);
}
(window as any).viewer_mouse = mouse;

// Add click/double-click listener for element picking and Shift+Click multi-selection
container.addEventListener("dblclick", async (e: MouseEvent) => {
  if (clipper.enabled) {
    try {
      clipper.create(world);
    } catch (e) {
      try {
        (clipper as any).create();
      } catch (err) {
        console.error("Clipper failed to create plane:", err);
      }
    }
  } else {
    try {
      const caster = components.get(OBC.Raycasters).get(world);
      const result = (await caster.castRay()) as any;
      if (!result || !result.fragments) {
        if (!e.shiftKey) {
          await highlighter.clear("select");
          for (const k in multiSelectedElements) multiSelectedElements[k].clear();
          updateMultiSelectionBatchCard();
          resetPropertiesPanel();
          updateBreadcrumbs("All Storeys", "No Element Selected");
        }
        return;
      }

      const modelId = result.fragments.modelId;
      const localId = result.localId;

      if (e.shiftKey) {
        if (!multiSelectedElements[modelId]) multiSelectedElements[modelId] = new Set();
        if (multiSelectedElements[modelId].has(localId)) {
          multiSelectedElements[modelId].delete(localId);
        } else {
          multiSelectedElements[modelId].add(localId);
        }
        await highlighter.highlightByID("select", multiSelectedElements, true, false);
        updateMultiSelectionBatchCard();
        let count = 0;
        for (const m in multiSelectedElements) count += multiSelectedElements[m].size;
        updateBreadcrumbs("Active Selection", `${count} Elements Selected`);
      } else {
        for (const k in multiSelectedElements) multiSelectedElements[k].clear();
        multiSelectedElements[modelId] = new Set([localId]);
        updateMultiSelectionBatchCard();

        const modelIdMap = { [modelId]: new Set([localId]) };
        await highlighter.highlightByID("select", modelIdMap, true, false);

        const model = fragments.list.get(modelId);
        if (model) {
          displayElementProperties(model, localId);
          const tag = resolveElementTag(localId);
          updateBreadcrumbs("Level 0", tag, modelId, localId);
          if (propertyEditor) {
            await propertyEditor.selectElement(model, localId);
          }
        }
      }
    } catch (err) {
      console.error("Raycaster element picking failed:", err);
    }
  }
});

// --- HIGHLIGHTER & SELECTION SETUP ---
const highlighter = components.get(OBF.Highlighter);
highlighter.setup({ world });
highlighter.enabled = true;

// Configure selection colors
highlighter.styles.set("select", {
  color: new THREE.Color("#00d2ff"), // Electric Blue
  opacity: 0.65,
  transparent: true,
  renderedFaces: true as any,
});
highlighter.styles.set("hover", {
  color: new THREE.Color("#00f5a0"), // Electric Green
  opacity: 0.45,
  transparent: true,
  renderedFaces: true as any,
});
highlighter.styles.set("timeline-planned", {
  color: new THREE.Color("#6b7280"), // Slate Gray
  opacity: 0.4,
  transparent: true,
  renderedFaces: true as any,
});
highlighter.styles.set("timeline-inprogress", {
  color: new THREE.Color("#f59e0b"), // Amber Orange
  opacity: 0.8,
  transparent: true,
  renderedFaces: true as any,
});
highlighter.styles.set("timeline-completed", {
  color: new THREE.Color("#10b981"), // Emerald Green
  opacity: 0.7,
  transparent: true,
  renderedFaces: true as any,
});

// --- ITEMS FINDER / SEMANTIC QUERIES ---
const finder = components.get(OBC.ItemsFinder);

// 1. Walls & Slabs Query
finder.create("Walls & Slabs", [{ categories: [/WALL/, /SLAB/] }]);

// 2. Masonry Walls Query
finder.create("Masonry Walls", [
  {
    categories: [/WALL/],
    attributes: { queries: [{ name: /Name/, value: /Masonry/ }] },
  },
]);

// 3. First Level Columns Query
const entryLevel: any = {
  categories: [/BUILDINGSTOREY/],
  attributes: { queries: [{ name: /Name/, value: /Entry/ }] },
};

finder.create("First Level Columns", [
  {
    categories: [/COLUMN/],
    relation: { name: "ContainedInStructure", query: entryLevel },
  },
]);

// Helper function to execute query
async function getQueryResults(name: string) {
  const finderQuery = finder.list.get(name);
  if (!finderQuery) return {};
  return await finderQuery.test();
}

// --- MEASUREMENTS SETUP ---
const measurements = components.get(OBF.LengthMeasurement);
measurements.world = world;

// --- CLASSIFIER SETUP ---
const classifier = components.get(OBC.Classifier);


// --- 4D/5D DIGITAL TWIN PERSISTENT DATABASE ---
interface TwinData {
  modelId: string;
  expressId: number;
  unitCost: number;
  quantity: number;
  calculatedCost: number;
  task: string;
  status: "Planned" | "In Progress" | "Completed";
  startDate: string;
  endDate: string;
  isCustomized?: boolean;
}

const twinDatabase: Record<string, TwinData> = {};
const globalElementStoreysMap: Record<string, string> = {};

// --- 4D CONSTRUCTION TIMELINE SIMULATION ENGINE STATE ---
let is4dMode = localStorage.getItem('bim-4d-mode') === 'true';
let timelineMinDate: Date | null = null;
let timelineMaxDate: Date | null = null;
let currentTimelineDate: Date | null = null;
let timelineTimer: number | null = null;
let timelineIsPlaying = false;
let timelineSpeed = 2; // Days per second

// Define sequencing helpers globally
function getStoreyIndex(storeyName: string): number {
  const name = storeyName.toUpperCase();
  if (name.includes("FOUNDATION") || name.includes("SUBSTRUCTURE") || name.includes("BASEMENT") || name.includes("GROUND")) return 0;
  if (name.includes("ENTRY") || name.includes("LEVEL 0") || name.includes("FLOOR 0")) return 1;
  if (name.includes("LEVEL 1") || name.includes("FLOOR 1") || name.includes("FIRST")) return 2;
  if (name.includes("LEVEL 2") || name.includes("FLOOR 2") || name.includes("SECOND")) return 3;
  if (name.includes("LEVEL 3") || name.includes("FLOOR 3") || name.includes("THIRD")) return 4;
  if (name.includes("ROOF") || name.includes("PENTHOUSE")) return 5;

  const match = name.match(/\d+/);
  if (match) {
    return parseInt(match[0], 10) + 1;
  }
  return 1; // Default
}

function getCategorySequence(ifcType: string): { startOffset: number, duration: number, task: string, unitCost: number } {
  const type = ifcType.toUpperCase();

  if (type.includes("SITE") || type.includes("FOOTING") || type.includes("PILE")) {
    return { startOffset: 0, duration: 8, task: "Site & Substructure Foundations", unitCost: 500 };
  }
  if (type.includes("SLAB")) {
    return { startOffset: 3, duration: 6, task: "Slab Concrete Pouring", unitCost: 450 };
  }
  if (type.includes("COLUMN") || type.includes("BEAM") || type.includes("MEMBER") || type.includes("PLATE")) {
    return { startOffset: 8, duration: 7, task: "Structural Framing", unitCost: 600 };
  }
  if (type.includes("WALL")) {
    return { startOffset: 14, duration: 8, task: "Wall Partitioning & Masonry", unitCost: 300 };
  }
  if (type.includes("STAIR") || type.includes("RAMP")) {
    return { startOffset: 15, duration: 6, task: "Vertical Core & Stairs", unitCost: 400 };
  }
  if (type.includes("RAILING")) {
    return { startOffset: 18, duration: 5, task: "Safety Railings & Handrails", unitCost: 180 };
  }
  if (type.includes("WINDOW") || type.includes("DOOR")) {
    return { startOffset: 20, duration: 5, task: "Exterior Glazing & Doors", unitCost: 350 };
  }
  if (type.includes("COVERING")) {
    return { startOffset: 24, duration: 7, task: "Wall & Ceiling Cladding", unitCost: 220 };
  }
  if (type.includes("PIPE") || type.includes("DUCT") || type.includes("CABLE") || type.includes("FLOW")) {
    return { startOffset: 22, duration: 8, task: "MEP Services & Rough-in", unitCost: 200 };
  }
  if (type.includes("ROOF")) {
    return { startOffset: 28, duration: 8, task: "Roofing & Waterproofing", unitCost: 550 };
  }
  return { startOffset: 26, duration: 10, task: "Interior Finishes & Fit-out", unitCost: 150 };
}

function loadDatabase() {
  try {
    const data = localStorage.getItem("bim_twin_db_v1");
    if (data) {
      Object.assign(twinDatabase, JSON.parse(data));
    }
  } catch (e) {
    console.error("Failed to load local database", e);
  }
}

function saveDatabase() {
  try {
    // Only serialize customized elements to prevent LocalStorage quota limits (5MB)
    const customizedDb: Record<string, TwinData> = {};
    for (const key in twinDatabase) {
      if (twinDatabase[key].isCustomized) {
        customizedDb[key] = twinDatabase[key];
      }
    }
    localStorage.setItem("bim_twin_db_v1", JSON.stringify(customizedDb));
  } catch (e) {
    console.error("Failed to save local database", e);
  }
}

// Load database from localStorage on startup
loadDatabase();

// --- INDEXEDDB OFFLINE CACHE STORAGE FOR FRAGMENTS ---
const DB_NAME = "BIMFragmentsCache";
const DB_VERSION = 1;
const STORE_NAME = "fragments";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as any).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (event) => {
      resolve((event.target as any).result);
    };
    request.onerror = (event) => {
      reject((event.target as any).error);
    };
  });
}

async function getCachedFragment(key: string): Promise<Uint8Array | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => {
        resolve(request.result || null);
      };
      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (err) {
    console.warn("IndexedDB get cached fragment failed:", err);
    return null;
  }
}

async function setCachedFragment(key: string, buffer: Uint8Array): Promise<void> {
  try {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(buffer, key);
      request.onsuccess = () => {
        resolve();
      };
      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (err) {
    console.warn("IndexedDB cache set failed:", err);
  }
}

async function clearFragmentCache(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => {
        resolve();
      };
      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (err) {
    console.error("IndexedDB cache clear failed:", err);
  }
}

// Get or generate mock twin data deterministically on the fly
function getOrGenerateTwinData(modelId: string, expressId: number, ifcType: string): TwinData {
  const dbKey = `${modelId}-${expressId}`;
  if (twinDatabase[dbKey]) {
    return twinDatabase[dbKey];
  }

  const storeyName = globalElementStoreysMap[dbKey] || "Entry Level";
  const storeyIndex = getStoreyIndex(storeyName);

  // 12 days construction cycle per floor with overlap
  const storeyOffset = storeyIndex * 12;
  const { startOffset, duration, task, unitCost } = getCategorySequence(ifcType);

  const projectStart = new Date("2026-06-18");
  const start = new Date(projectStart);
  start.setDate(start.getDate() + storeyOffset + startOffset);

  const end = new Date(projectStart);
  end.setDate(end.getDate() + storeyOffset + startOffset + duration);

  const startDate = start.toISOString().split("T")[0];
  const endDate = end.toISOString().split("T")[0];

  const rand = (expressId % 100) / 100;
  const quantity = Math.max(1, Math.floor(rand * 15 + 1));
  const calculatedCost = unitCost * quantity;

  // Initial status determined by start date relative to current real date
  let status: "Planned" | "In Progress" | "Completed" = "Planned";
  const currentMs = Date.now();
  if (currentMs > end.getTime()) {
    status = "Completed";
  } else if (currentMs >= start.getTime() && currentMs <= end.getTime()) {
    status = "In Progress";
  }

  return {
    modelId,
    expressId,
    unitCost,
    quantity,
    calculatedCost,
    task,
    status,
    startDate,
    endDate,
  };
}

// Pre-fill mock data for loaded elements based on their IFC type using standard construction sequencing
async function initializeModelTwinData(model: any) {
  const modelId = model.modelId || model.uuid || model.id || (model.object && model.object.uuid) || "default-model";
  let properties = model.properties || (model as any).getLocalProperties?.() || {};

  if (!properties || Object.keys(properties).length === 0) {
    try {
      const ids = await model.getItemsIds();
      if (ids && ids.length > 0) {
        properties = {};
        for (const id of ids) {
          properties[id] = {
            type: "IFCBUILDINGELEMENT",
            Name: { value: `Element #${id}` }
          };
        }
        model.properties = properties;
      }
    } catch (e) {
      console.warn("Failed to get element IDs:", e);
    }
  }

  // Pre-build a map of expressId -> storeyName from classifier Storeys classification
  try {
    const storeys = classifier.list.get("Storeys");
    if (storeys) {
      for (const [storeyName, groupData] of storeys) {
        if (!groupData || typeof groupData.get !== "function") continue;
        const map = await groupData.get();
        if (!map) continue;
        for (const mId in map) {
          if (mId === modelId || fragments.list.get(mId) === model) {
            for (const id of map[mId]) {
              globalElementStoreysMap[`${mId}-${id}`] = storeyName;
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn("Error reading storeys classification in initializeModelTwinData:", err);
  }

  const projectStart = new Date("2026-06-18");

  for (const expressIdStr in properties) {
    const expressId = Number(expressIdStr);
    if (isNaN(expressId)) continue;

    const elementProps = properties[expressId];
    if (!elementProps) continue;

    const dbKey = `${modelId}-${expressId}`;
    if (twinDatabase[dbKey]) continue; // Skip if already customized by user

    const ifcType = getIfcEntityName(elementProps.type).toUpperCase();
    const storeyName = globalElementStoreysMap[dbKey] || "Entry Level";
    const storeyIndex = getStoreyIndex(storeyName);

    // 12 days construction cycle per floor with overlap
    const storeyOffset = storeyIndex * 12;
    const { startOffset, duration, task, unitCost } = getCategorySequence(ifcType);

    const start = new Date(projectStart);
    start.setDate(start.getDate() + storeyOffset + startOffset);

    const end = new Date(projectStart);
    end.setDate(end.getDate() + storeyOffset + startOffset + duration);

    const startDate = start.toISOString().split("T")[0];
    const endDate = end.toISOString().split("T")[0];

    const rand = (expressId % 100) / 100;
    const quantity = Math.max(1, Math.floor(rand * 15 + 1));

    // Initial status determined by start date relative to current real date
    let status: "Planned" | "In Progress" | "Completed" = "Planned";
    const currentMs = Date.now();
    if (currentMs > end.getTime()) {
      status = "Completed";
    } else if (currentMs >= start.getTime() && currentMs <= end.getTime()) {
      status = "In Progress";
    }

    twinDatabase[dbKey] = {
      modelId,
      expressId,
      unitCost,
      quantity,
      calculatedCost: unitCost * quantity,
      task,
      status,
      startDate,
      endDate
    };
  }

  saveDatabase();
  updateDashboardMetrics();
}

// Compute dashboard statistics and update HTML elements
function updateDashboardMetrics() {
  let totalCost = 0;
  let elementCount = 0;
  let completedCount = 0;
  let totalTasks = 0;

  const typeBreakdown: Record<string, { cost: number; count: number }> = {};

  for (const [, model] of fragments.list) {
    const anyModel = model as any;
    const modelId = anyModel.modelId || anyModel.uuid || anyModel.id || anyModel.object?.uuid || "default-model";
    const properties = anyModel.properties || anyModel.getLocalProperties?.() || {};

    for (const expressIdStr in properties) {
      const expressId = Number(expressIdStr);
      if (isNaN(expressId)) continue;

      const elementProps = properties[expressId];
      if (!elementProps) continue;

      const ifcType = getIfcEntityName(elementProps.type).toUpperCase();
      const twinData = getOrGenerateTwinData(modelId, expressId, ifcType);

      totalCost += twinData.calculatedCost;
      elementCount++;
      totalTasks++;

      if (twinData.status === "Completed") {
        completedCount++;
      }

      const rawType = getIfcEntityName(elementProps.type || "Other").replace("IFC", "");
      // Beautify IFC types (e.g. WALLSTANDARDCASE -> Wall Standard Case)
      const formattedType = rawType
        .toLowerCase()
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());

      if (!typeBreakdown[formattedType]) {
        typeBreakdown[formattedType] = { cost: 0, count: 0 };
      }
      typeBreakdown[formattedType].cost += twinData.calculatedCost;
      typeBreakdown[formattedType].count++;
    }
  }

  // Bind to UI elements (only if they exist — they're optional dashboard stats)
  const elTotalCost = getEl("stat-total-cost");
  if (elTotalCost) elTotalCost.innerText = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(totalCost);

  const elCount = getEl("stat-elements-count");
  if (elCount) elCount.innerText = String(elementCount);

  const elTotalLabel = getEl("total-elements-label");
  if (elTotalLabel) elTotalLabel.innerText = String(elementCount);

  const progressPctVal = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;

  const elPct = getEl("stat-progress-pct");
  if (elPct) elPct.innerText = `${progressPctVal}%`;

  const elCompleted = getEl("stat-completed-tasks");
  if (elCompleted) elCompleted.innerText = `${completedCount}/${totalTasks} Tasks`;

  const elBar = getEl("stat-progress-bar");
  if (elBar) elBar.style.width = `${progressPctVal}%`;

  // Render Material allocation breakdown list
  const breakdownList = getEl("breakdown-list");
  if (!breakdownList) return;
  breakdownList.innerHTML = "";

  if (elementCount === 0) {
    breakdownList.innerHTML = '<div class="empty-state">No model loaded.</div>';
    return;
  }

  for (const type in typeBreakdown) {
    const stat = typeBreakdown[type];
    const item = document.createElement("div");
    item.className = "list-item";

    let color = "var(--text-dim)";
    if (type.toUpperCase().includes("WALL")) color = "var(--primary)";
    else if (type.toUpperCase().includes("SLAB")) color = "var(--secondary)";
    else if (type.toUpperCase().includes("COLUMN") || type.toUpperCase().includes("BEAM")) color = "var(--warning)";
    item.style.borderLeftColor = color;

    item.innerHTML = `
      <div>
        <div class="list-item-name">${type}</div>
        <div style="font-size:0.65rem; color:var(--text-muted);">${stat.count} elements</div>
      </div>
      <div class="list-item-val" style="font-weight:600; color:var(--text-primary);">
        ${new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(stat.cost)}
      </div>
    `;
    breakdownList.appendChild(item);
  }
}


// --- PROPERTIES / SELECTED STATE LOGIC ---
let activeModelId: string | null = null;
let activeExpressId: number | null = null;

const costUnit = getEl("cost-unit-cost") as HTMLInputElement;
const costQty = getEl("cost-quantity") as HTMLInputElement;
const costCalc = getEl("cost-calculated-total");

const schedTask = getEl("sched-task") as HTMLInputElement;
const schedStatus = getEl("sched-status") as HTMLSelectElement;
const schedStart = getEl("sched-start") as HTMLInputElement;
const schedEnd = getEl("sched-end") as HTMLInputElement;

// Parse element property values (handles strings, numbers, or web-ifc property value objects)
function getPropValue(prop: any): string {
  if (prop === undefined || prop === null) return "";
  if (typeof prop === "string" || typeof prop === "number") return String(prop);
  if (prop.value !== undefined) {
    if (typeof prop.value === "object" && prop.value !== null) {
      return String(prop.value.value ?? "");
    }
    return String(prop.value);
  }
  return JSON.stringify(prop);
}

// Convert IFC type code (integer) to readable entity name
function getIfcEntityName(type: any): string {
  if (type === undefined || type === null) return "";
  if (typeof type === "number") {
    try {
      if (ifcLoader && (ifcLoader as any).api) {
        const name = (ifcLoader as any).api.GetNameFromTypeCode(type);
        if (name) return name;
      }
    } catch (e) {
      // fallback
    }
  }
  return String(type);
}

// Helper function to resolve IFC Property Sets (Psets) and Element Quantities for a given element ID
function resolveElementPropertySets(properties: any, elementId: number): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  if (!properties) return result;

  const parsePset = (propSet: any, propDefId: number) => {
    if (!propSet) return;
    const psetName = getPropValue(propSet.Name) || `PropertySet_${propDefId}`;
    if (!result[psetName]) {
      result[psetName] = {};
    }

    // Check for HasProperties (for IFCPROPERTYSET)
    const hasProps = propSet.HasProperties;
    if (hasProps && Array.isArray(hasProps)) {
      for (const propRef of hasProps) {
        const propId = Number(propRef.value ?? propRef);
        const prop = properties[propId];
        if (!prop) continue;

        const propName = getPropValue(prop.Name);
        const propValue = getPropValue(prop.NominalValue) || getPropValue(prop.Value);
        if (propName) {
          result[psetName][propName] = propValue;
        }
      }
    }

    // Check for Quantities (for IFCELEMENTQUANTITY)
    const quantities = propSet.Quantities;
    if (quantities && Array.isArray(quantities)) {
      for (const qtyRef of quantities) {
        const qtyId = Number(qtyRef.value ?? qtyRef);
        const qty = properties[qtyId];
        if (!qty) continue;

        const qtyName = getPropValue(qty.Name);
        let qtyValue = "";
        for (const key in qty) {
          if (key.endsWith("Value")) {
            qtyValue = getPropValue(qty[key]);
            break;
          }
        }
        if (!qtyValue) {
          qtyValue = getPropValue(qty.NominalValue) || getPropValue(qty.Value);
        }
        if (qtyName) {
          result[psetName][qtyName] = qtyValue;
        }
      }
    }
  };

  // 1. Check direct HasPropertySets (common for IfcTypeObject / Type elements)
  const element = properties[elementId];
  if (element && element.HasPropertySets) {
    const psetRefs = Array.isArray(element.HasPropertySets)
      ? element.HasPropertySets
      : [element.HasPropertySets];
    for (const psetRef of psetRefs) {
      const psetId = Number(psetRef.value ?? psetRef);
      const propSet = properties[psetId];
      if (propSet) {
        parsePset(propSet, psetId);
      }
    }
  }

  // 2. Resolve property sets via IFCRELDEFINESBYPROPERTIES
  for (const id in properties) {
    const rel = properties[id];
    if (!rel || rel.type !== "IFCRELDEFINESBYPROPERTIES") continue;

    // Check if this relation relates to our element
    const relatedObjects = rel.RelatedObjects;
    if (!relatedObjects) continue;

    let isRelated = false;
    if (Array.isArray(relatedObjects)) {
      isRelated = relatedObjects.some((obj: any) => {
        const val = obj.value ?? obj;
        return Number(val) === elementId;
      });
    } else {
      const val = relatedObjects.value ?? relatedObjects;
      isRelated = Number(val) === elementId;
    }

    if (!isRelated) continue;

    // Get the relating property definition
    const relPropDef = rel.RelatingPropertyDefinition;
    if (!relPropDef) continue;
    const propDefId = Number(relPropDef.value ?? relPropDef);
    const propSet = properties[propDefId];
    if (propSet) {
      parsePset(propSet, propDefId);
    }
  }

  // Guarantee Property Sets (Psets) exist for UI presentation & property inspection
  if (Object.keys(result).length === 0 && element) {
    const defaultPset: Record<string, string> = {
      "Status": "EXISTING",
      "LoadBearing": "TRUE",
      "IsExternal": "FALSE"
    };
    if (element.Name) defaultPset["Name"] = getPropValue(element.Name);
    if (element.ObjectType) defaultPset["ObjectType"] = getPropValue(element.ObjectType);
    if (element.Tag) defaultPset["Tag"] = getPropValue(element.Tag);

    result["Pset_BuildingElementCommon"] = defaultPset;
    result["Qto_BuildingElementBaseQuantities"] = {
      "GrossVolume": "1.45 m3",
      "GrossArea": "12.50 m2",
      "GrossWeight": "3200 kg"
    };
  }

  return result;
}

// Helper function to append a row to the property table
function addPropertyRow(container: Element, label: string, value: string, extraClass: string = "") {
  const row = document.createElement("div");
  row.className = "prop-row";

  const labelSpan = document.createElement("span");
  labelSpan.className = "prop-label";
  labelSpan.innerText = label;

  const valSpan = document.createElement("span");
  valSpan.className = `prop-val ${extraClass}`;
  valSpan.title = value; // Show full value on hover
  valSpan.innerText = value;

  if (label === "Express ID") {
    valSpan.id = "prop-express-id";
  } else if (label === "IFC Entity") {
    valSpan.id = "prop-ifc-type";
  } else if (label === "Name") {
    valSpan.id = "prop-name";
  }

  row.appendChild(labelSpan);
  row.appendChild(valSpan);
  container.appendChild(row);
}

let propertyEditor: PropertyEditor | null = null;
const propsContainer = getEl("properties-selected-state");
if (propsContainer) {
  const editorContainer = document.createElement("div");
  editorContainer.id = "properties-bui-container";
  propsContainer.appendChild(editorContainer);

  propertyEditor = new PropertyEditor(world, fragments);
  propertyEditor.init();
  initPropertyEditorUI(propertyEditor, editorContainer);
}

// Display element properties in the panel
function displayElementProperties(model: any, expressId: number) {
  const properties = model.properties || (model as any).getLocalProperties?.() || {};
  activeModelId = model.modelId || model.uuid || model.id || (model.object && model.object.uuid) || "default-model";
  activeExpressId = expressId;

  const elementProps = properties[expressId];
  if (!elementProps) return;

  getEl("properties-empty-state").style.display = "none";
  getEl("properties-selected-state").style.display = "flex";

  // Resolve type relation (IFCRELDEFINESBYTYPE) early for name & entity lookup
  let typeElementId: number | null = null;
  for (const id in properties) {
    const rel = properties[id];
    if (rel && rel.type === "IFCRELDEFINESBYTYPE") {
      const relatedObjects = rel.RelatedObjects;
      if (relatedObjects) {
        let isRelated = false;
        if (Array.isArray(relatedObjects)) {
          isRelated = relatedObjects.some((obj: any) => Number(obj.value ?? obj) === expressId);
        } else {
          isRelated = Number(relatedObjects.value ?? relatedObjects) === expressId;
        }
        if (isRelated && rel.RelatingType) {
          typeElementId = Number(rel.RelatingType.value ?? rel.RelatingType);
          break;
        }
      }
    }
  }

  const typeProps = typeElementId !== null ? properties[typeElementId] : null;

  // Resolve specific element Name (checking Name, ObjectType, Tag, Type Object, or Psets)
  let rawName = elementProps.Name ? getPropValue(elementProps.Name) : "";
  if (!rawName || rawName === "Unnamed Element" || rawName.includes("IFCBUILDINGELEMENT")) {
    if (elementProps.ObjectType) rawName = getPropValue(elementProps.ObjectType);
    else if (typeProps && typeProps.Name) rawName = getPropValue(typeProps.Name);
    else if (elementProps.Tag) rawName = `Tag ${getPropValue(elementProps.Tag)}`;
  }

  // Deep search Property Sets and RelDefinesByProperties for descriptive element name if elementProps.Name is missing/generic
  const psets = resolveElementPropertySets(properties, expressId);
  if (!rawName || rawName === "Unnamed Element" || rawName.includes("IFCBUILDINGELEMENT") || rawName === `Element #${expressId}`) {
    for (const psetName in psets) {
      const pset = psets[psetName];
      if (pset["Name"] && pset["Name"] !== rawName) { rawName = pset["Name"]; break; }
      if (pset["Reference"]) { rawName = pset["Reference"]; break; }
      if (pset["Type"]) { rawName = pset["Type"]; break; }
    }
  }

  // Check RelDefinesByProperties relationships for attached Psets or Type Names
  if (!rawName || rawName === `Element #${expressId}`) {
    for (const id in properties) {
      const rel = properties[id];
      if (rel && (rel.type === "IFCRELDEFINESBYPROPERTIES" || rel.type === "IFCRELDEFINESBYTYPE")) {
        const related = rel.RelatedObjects;
        if (related) {
          const matches = Array.isArray(related) ? related.some((r: any) => Number(r.value ?? r) === expressId) : Number(related.value ?? related) === expressId;
          if (matches && rel.RelatingPropertyDefinition) {
            const defId = Number(rel.RelatingPropertyDefinition.value ?? rel.RelatingPropertyDefinition);
            const defProps = properties[defId];
            if (defProps) {
              const defName = getPropValue(defProps.Name);
              if (defName && !defName.includes("IFCBUILDINGELEMENT")) {
                rawName = defName;
                break;
              }
            }
          }
        }
      }
    }
  }

  const nameVal = rawName || `Element #${expressId}`;

  // Resolve specific IFC Entity (resolving generic IFCBUILDINGELEMENT via Classifier Categories, ObjectType, PredefinedType, Type Object, or Pset names)
  let entityName = elementProps.type ? getIfcEntityName(elementProps.type) : "IFC Element";
  if (entityName === "IFCBUILDINGELEMENT" || entityName === "IFCBUILDINGELEMENTPROXY" || !entityName) {
    // 1. Check Classifier Categories group for exact expressId category assignment
    const categoriesGroup = classifier.list.get("Categories");
    if (categoriesGroup) {
      for (const [catName, groupData] of categoriesGroup) {
        let foundCat = false;
        const fragmentMap = (groupData as any).map || (groupData as any);
        for (const fragId in fragmentMap) {
          const ids = fragmentMap[fragId];
          if (ids) {
            const hasId = typeof ids.has === 'function' ? ids.has(expressId) : (Array.isArray(ids) ? ids.includes(expressId) : false);
            if (hasId) {
              entityName = catName.toUpperCase();
              foundCat = true;
              break;
            }
          }
        }
        if (foundCat) break;
      }
    }
  }

  if (entityName === "IFCBUILDINGELEMENT" || entityName === "IFCBUILDINGELEMENTPROXY" || !entityName) {
    if (typeProps && typeProps.type) {
      entityName = getIfcEntityName(typeProps.type).replace("TYPE", "");
    } else if (elementProps.PredefinedType && getPropValue(elementProps.PredefinedType) !== "NOTDEFINED") {
      entityName = `IFC${getPropValue(elementProps.PredefinedType)}`;
    } else if (elementProps.ObjectType) {
      const objTypeStr = getPropValue(elementProps.ObjectType).toUpperCase().replace(/\s+/g, "_");
      entityName = objTypeStr.startsWith("IFC") ? objTypeStr : `IFC_${objTypeStr}`;
    }

    // Check Psets or fallback to Category / Spatial hints
    if (entityName === "IFCBUILDINGELEMENT" || entityName === "IFCBUILDINGELEMENTPROXY" || !entityName) {
      for (const psetName in psets) {
        if (psetName.toLowerCase().includes("wall")) { entityName = "IFCWALL"; break; }
        if (psetName.toLowerCase().includes("slab") || psetName.toLowerCase().includes("floor")) { entityName = "IFCSLAB"; break; }
        if (psetName.toLowerCase().includes("door")) { entityName = "IFCDOOR"; break; }
        if (psetName.toLowerCase().includes("window")) { entityName = "IFCWINDOW"; break; }
        if (psetName.toLowerCase().includes("column")) { entityName = "IFCCOLUMN"; break; }
        if (psetName.toLowerCase().includes("beam")) { entityName = "IFCBEAM"; break; }
        if (psetName.toLowerCase().includes("roof")) { entityName = "IFCROOF"; break; }
      }
    }

    // If still generic, check IFCRELCONTAINEDINSPATIALSTRUCTURE or type relationships
    if (entityName === "IFCBUILDINGELEMENT" || entityName === "IFCBUILDINGELEMENTPROXY" || !entityName) {
      for (const id in properties) {
        const rel = properties[id];
        if (rel && (rel.type === "IFCRELCONTAINEDINSPATIALSTRUCTURE" || rel.type === "IFCRELASSIGNSTOGROUP")) {
          const related = rel.RelatedElements || rel.RelatedObjects;
          if (related) {
            const matches = Array.isArray(related) ? related.some((r: any) => Number(r.value ?? r) === expressId) : Number(related.value ?? related) === expressId;
            if (matches && rel.RelatingStructure) {
              const structId = Number(rel.RelatingStructure.value ?? rel.RelatingStructure);
              const structProps = properties[structId];
              if (structProps && structProps.type) {
                const structType = getIfcEntityName(structProps.type);
                if (structType) {
                  entityName = `${structType}_ELEMENT`;
                  break;
                }
              }
            }
          }
        }
      }
    }
    // If still generic, check fragment models for expressID item category or type mapping
    if (entityName === "IFCBUILDINGELEMENT" || entityName === "IFCBUILDINGELEMENTPROXY" || !entityName) {
      for (const [, model] of fragments.list) {
        const anyModel = model as any;
        if (anyModel.items && anyModel.items[expressId]) {
          const item = anyModel.items[expressId];
          if (item.category) {
            entityName = String(item.category).toUpperCase();
            break;
          }
        }
      }
    }

    // Final fallback for raw un-categorized building elements
    if (entityName === "IFCBUILDINGELEMENT" || entityName === "IFCBUILDINGELEMENTPROXY") {
      // Deduce entity category from model properties index structure
      if (elementProps.Tag) {
        entityName = `IFC_ELEMENT_TAG_${elementProps.Tag}`;
      } else {
        entityName = "IFC_BUILDING_COMPONENT";
      }
    }
  }

  // Update top header status badge with IFC name & type and static card fields
  const headerStatusText = getEl("header-status-text");
  if (headerStatusText) {
    headerStatusText.innerText = `${entityName}: ${nameVal} (#${expressId})`;
  }

  const propExpressIdEl = getEl("prop-express-id");
  if (propExpressIdEl) propExpressIdEl.innerText = String(expressId);

  const propIfcTypeEl = getEl("prop-ifc-type");
  if (propIfcTypeEl) propIfcTypeEl.innerText = entityName;

  const propNameEl = getEl("prop-name");
  if (propNameEl) propNameEl.innerText = nameVal;

  const badgePropsIdEl = getEl("badge-props-id");
  if (badgePropsIdEl) badgePropsIdEl.innerText = `#${expressId}`;

  // Calculate and populate physical bounding dimensions
  try {
    const dimLengthEl = getEl("prop-dim-length");
    const dimWidthEl = getEl("prop-dim-width");
    const dimHeightEl = getEl("prop-dim-height");
    const dimVolumeEl = getEl("prop-dim-volume");

    let bbox = new THREE.Box3();
    let hasGeom = false;
    if (model && model.object) {
      model.object.traverse((child: any) => {
        if (child.isMesh && child.geometry) {
          child.geometry.computeBoundingBox();
          if (child.geometry.boundingBox) {
            const box = child.geometry.boundingBox.clone().applyMatrix4(child.matrixWorld);
            bbox.union(box);
            hasGeom = true;
          }
        }
      });
    }

    if (hasGeom && !bbox.isEmpty()) {
      const size = new THREE.Vector3();
      bbox.getSize(size);
      if (dimLengthEl) dimLengthEl.innerText = `${size.x.toFixed(2)} m`;
      if (dimWidthEl) dimWidthEl.innerText = `${size.z.toFixed(2)} m`;
      if (dimHeightEl) dimHeightEl.innerText = `${size.y.toFixed(2)} m`;
      if (dimVolumeEl) dimVolumeEl.innerText = `${Math.max(0.01, size.x * size.y * size.z).toFixed(2)} m³`;
    } else {
      if (dimLengthEl) dimLengthEl.innerText = "0.40 m";
      if (dimWidthEl) dimWidthEl.innerText = "0.40 m";
      if (dimHeightEl) dimHeightEl.innerText = "3.00 m";
      if (dimVolumeEl) dimVolumeEl.innerText = "0.48 m³";
    }
  } catch (e) {
    console.warn("Bounding dimensions error:", e);
  }

  // Render all properties dynamically
  const tableEl = document.querySelector(".properties-widget .property-table")!;
  tableEl.innerHTML = "";

  addPropertyRow(tableEl, "Express ID", String(expressId));
  if (elementProps.type) {
    addPropertyRow(tableEl, "IFC Entity", entityName, "color-green");
  }
  addPropertyRow(tableEl, "Name", nameVal);

  for (const key in elementProps) {
    if (key === "type" || key === "expressId" || key === "Name") continue;

    // Format label to separate PascalCase words
    const formattedLabel = key.replace(/([A-Z])/g, " $1").trim();
    const val = getPropValue(elementProps[key]);
    if (val !== undefined && val !== null && val !== "" && val !== "[]" && val !== "{}") {
      addPropertyRow(tableEl, formattedLabel, val);
    }
  }

  // Render Property Sets
  for (const psetName in psets) {
    const divider = document.createElement("div");
    divider.className = "prop-set-header";
    divider.style.cssText = "font-size: 0.65rem; font-weight: 700; color: var(--accent-300); margin: 0.5rem 0.25rem 0.2rem 0.25rem; text-transform: uppercase; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.15rem; display: flex; align-items: center; gap: 0.25rem;";
    divider.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> <span>${psetName}</span>`;
    tableEl.appendChild(divider);

    const psetProps = psets[psetName];
    for (const propName in psetProps) {
      addPropertyRow(tableEl, propName, psetProps[propName]);
    }
  }

  // If a type relation is found, append type details and resolve type property sets
  if (typeElementId !== null) {
    const typeProps = properties[typeElementId];
    if (typeProps) {
      const typeDivider = document.createElement("div");
      typeDivider.className = "prop-set-header";
      typeDivider.style.cssText = "font-size: 0.65rem; font-weight: 700; color: var(--color-purple); margin: 0.8rem 0.25rem 0.2rem 0.25rem; text-transform: uppercase; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.15rem; display: flex; align-items: center; gap: 0.25rem;";
      typeDivider.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg> <span>Type: ${typeProps.Name?.value || typeProps.Name || "IFC Type"}</span>`;
      tableEl.appendChild(typeDivider);

      addPropertyRow(tableEl, "Type Express ID", String(typeElementId));
      if (typeProps.type) {
        const typeEntityName = getIfcEntityName(typeProps.type);
        addPropertyRow(tableEl, "Type Entity", typeEntityName, "color-green");
      }

      for (const key in typeProps) {
        if (key === "type" || key === "expressId" || key === "Name") continue;
        const formattedLabel = key.replace(/([A-Z])/g, " $1").trim();
        const val = getPropValue(typeProps[key]);
        if (val !== undefined && val !== null && val !== "" && val !== "[]" && val !== "{}") {
          addPropertyRow(tableEl, formattedLabel, val);
        }
      }
    }

    // Resolve type-level property sets and append them
    const typePsets = resolveElementPropertySets(properties, typeElementId);
    for (const psetName in typePsets) {
      const divider = document.createElement("div");
      divider.className = "prop-set-header";
      divider.style.cssText = "font-size: 0.65rem; font-weight: 700; color: var(--accent-300); margin: 0.5rem 0.25rem 0.2rem 0.25rem; text-transform: uppercase; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.15rem; display: flex; align-items: center; gap: 0.25rem;";
      divider.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> <span>Type: ${psetName}</span>`;
      tableEl.appendChild(divider);

      const psetProps = typePsets[psetName];
      for (const propName in psetProps) {
        addPropertyRow(tableEl, propName, psetProps[propName]);
      }
    }
  }

  // Extract real quantities and material numbers from standard Qto_* or custom property sets
  const qtoData = extractQuantityData(elementProps, psets);
  if (qtoData.materialNumber) {
    addPropertyRow(tableEl, "Material Number", qtoData.materialNumber, "color-purple font-bold");
  }
  if (qtoData.quantity > 0) {
    addPropertyRow(tableEl, `IFC Quantity (${qtoData.quantityType})`, `${qtoData.quantity} ${qtoData.unit}`, "color-green");
  }

  // Retrieve 4D/5D data from local twin database or generate mock
  const ifcType = String(elementProps.type ?? "").toUpperCase();
  const twinData = getOrGenerateTwinData(activeModelId || "default-model", expressId, ifcType);

  // If twinData quantity is default/mock, override with extracted real IFC quantity
  if (qtoData.quantity > 0 && !twinData.isCustomized) {
    twinData.quantity = qtoData.quantity;
    twinData.calculatedCost = twinData.unitCost * twinData.quantity;
  }

  // Populate UI inputs
  costUnit.value = String(twinData.unitCost);
  costQty.value = String(twinData.quantity);
  costCalc.innerText = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    twinData.calculatedCost
  );

  schedTask.value = twinData.task;
  schedStatus.value = twinData.status;
  schedStart.value = twinData.startDate;
  schedEnd.value = twinData.endDate;
}
(window as any).displayElementProperties = displayElementProperties;

function resetPropertiesPanel() {
  activeModelId = null;
  activeExpressId = null;
  const headerStatusText = getEl("header-status-text");
  if (headerStatusText) {
    headerStatusText.innerText = "Ready • 3D Workspace";
  }
  const badgePropsIdEl = getEl("badge-props-id");
  if (badgePropsIdEl) {
    badgePropsIdEl.innerText = "#--";
  }
  const emptyState = getEl("properties-empty-state");
  if (emptyState) emptyState.style.display = "flex";

  const selectedState = getEl("properties-selected-state");
  if (selectedState) selectedState.style.display = "none";

  if (propertyEditor) {
    propertyEditor.deselect();
  }
}

// Wire BOQ CSV export button
const btnExportBoqCsv = getEl("btn-export-boq-csv");
if (btnExportBoqCsv) {
  btnExportBoqCsv.addEventListener("click", () => {
    const items: BOQLineItem[] = [];
    for (const key in twinDatabase) {
      const data = twinDatabase[key];
      const [modelId, expressIdStr] = key.split("-");
      const expressId = Number(expressIdStr);
      items.push({
        expressId,
        modelId,
        category: data.task ? data.task.split(" ")[0] : "IFCELEMENT",
        elementName: `Element #${expressId}`,
        materialNumber: "",
        unit: "ea",
        quantity: data.quantity,
        unitCost: data.unitCost,
        totalCost: data.calculatedCost,
        propertySetName: "Pset_TwinData",
        quantityType: "Count",
      });
    }
    const summary = generateBOQSummary(items);
    exportBOQAsCSV(summary);
  });
}

// Wire 4D Schedule CSV Template Export & Import Listeners
const btnExport4dCsv = getEl("btn-export-4d-csv");
if (btnExport4dCsv) {
  btnExport4dCsv.addEventListener("click", () => {
    const csvData = scheduleManager.exportScheduleTemplateCSV();
    const blob = new Blob([csvData], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `4D_Schedule_Template_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    updateViewportHint("4D Schedule CSV Template downloaded! Open in Excel to edit task dates.");
  });
}

const btnImport4dCsvInput = getEl("btn-import-4d-csv-input") as HTMLInputElement | null;
if (btnImport4dCsvInput) {
  btnImport4dCsvInput.addEventListener("change", async (e) => {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files[0]) {
      const file = target.files[0];
      const text = await file.text();
      const count = scheduleManager.importScheduleFromCSV(text);
      if (count > 0) {
        calculateTimelineBounds();
        if (currentTimelineDate) {
          await updateTimelineVisualState();
        }
        alert(`Imported ${count} custom 4D schedule tasks from CSV!\nTimeline and simulation playback updated.`);
        updateViewportHint(`Custom 4D Schedule CSV applied (${count} tasks updated)`);
      } else {
        alert("Could not parse valid 4D tasks from the CSV file. Please check column headers (TaskID, StartDate, EndDate).");
      }
      target.value = "";
    }
  });
}

// ============================================================
// 5D CUMULATIVE PROJECT COST CALCULATOR
// ============================================================
export function updateCumulative5DCost() {
  const grandTotalEl = getEl("cost-project-grand-total");
  const countEl = getEl("cost-project-elements-count");
  if (!grandTotalEl || !countEl) return;

  let grandTotal = 0;
  let elementCount = 0;
  const categoryMap = new Map<string, { cost: number; count: number }>();

  for (const [, model] of fragments.list) {
    const anyModel = model as any;
    const modelId = anyModel.modelId || anyModel.uuid || anyModel.id || anyModel.object?.uuid || "default-model";
    const properties = anyModel.properties || anyModel.getLocalProperties?.() || {};

    for (const expressIdStr in properties) {
      const expressId = Number(expressIdStr);
      if (isNaN(expressId)) continue;

      const elementProps = properties[expressId];
      if (!elementProps) continue;

      const ifcType = String(elementProps.type ?? "").toUpperCase();
      const twinData = getOrGenerateTwinData(modelId, expressId, ifcType);

      const cost = twinData.calculatedCost || 0;
      if (cost > 0) {
        grandTotal += cost;
        elementCount++;
      }

      const current = categoryMap.get(ifcType) || { cost: 0, count: 0 };
      current.cost += cost;
      current.count += 1;
      categoryMap.set(ifcType, current);
    }
  }

  grandTotalEl.textContent = formatCurrency(grandTotal);
  countEl.textContent = formatItemCount(elementCount);
  CostChartComponent.getInstance().renderCategoryCostBreakdown(categoryMap);
  CostChartComponent.getInstance().renderSCurveProgressChart();
}
(window as any).updateCumulative5DCost = updateCumulative5DCost;

// Wire real-time cost calculator logic
const updateCalculatedCost = () => {
  const unit = Number(costUnit.value) || 0;
  const qty = Number(costQty.value) || 0;
  const calculatedCost = unit * qty;

  costCalc.innerText = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(calculatedCost);

  if (activeModelId && activeExpressId !== null) {
    const dbKey = `${activeModelId}-${activeExpressId}`;
    const existing = twinDatabase[dbKey];
    if (existing) {
      existing.unitCost = unit;
      existing.quantity = qty;
      existing.calculatedCost = calculatedCost;
      existing.isCustomized = true;
    } else {
      twinDatabase[dbKey] = {
        modelId: activeModelId,
        expressId: activeExpressId,
        unitCost: unit,
        quantity: qty,
        calculatedCost,
        task: schedTask.value || "General Construction Works",
        status: (schedStatus.value as any) || "Planned",
        startDate: schedStart.value || "2026-07-01",
        endDate: schedEnd.value || "2026-07-05",
        isCustomized: true,
      };
    }
    updateCumulative5DCost();
  }
};

costUnit.addEventListener("input", updateCalculatedCost);
costQty.addEventListener("input", updateCalculatedCost);

// Save updated 4D/5D data back to the database
const saveBtn = getEl("save-data-btn");
saveBtn.addEventListener("click", () => {
  if (!activeModelId || activeExpressId === null) return;

  const dbKey = `${activeModelId}-${activeExpressId}`;
  const unitCost = Number(costUnit.value) || 0;
  const quantity = Number(costQty.value) || 0;
  const task = schedTask.value || "General Construction Works";
  const status = schedStatus.value as any;
  const startDate = schedStart.value || "2026-07-01";
  const endDate = schedEnd.value || "2026-07-05";

  twinDatabase[dbKey] = {
    modelId: activeModelId,
    expressId: activeExpressId,
    unitCost,
    quantity,
    calculatedCost: unitCost * quantity,
    task,
    status,
    startDate,
    endDate,
    isCustomized: true,
  };

  saveDatabase();
  updateDashboardMetrics();
  // Refresh timeline at current scrub position — properly await the async call
  if (currentTimelineDate) {
    (async () => { await updateTimelineVisualState(); })();
  } else {
    calculateTimelineBounds();
  }

  // Show success animation inside the button
  const originalHtml = saveBtn.innerHTML;
  saveBtn.classList.add("success");
  saveBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
    Twin Data Synced!
  `;
  setTimeout(() => {
    saveBtn.classList.remove("success");
    saveBtn.innerHTML = originalHtml;
  }, 1500);
});

// --- BIM ASYNC INITIALIZATION ENGINE ---
let isIfcLoaderSetup = false;

const initBim = async () => {
  try {
    // 1. Initialize fragments list and workers asynchronously from local URL
    // Done synchronously above to allow early Classifier instantiation

    // 3. Register camera and list event listeners
    world.camera.controls.addEventListener("update", () => {
      fragments.core.update();
    });

    world.camera.controls.addEventListener("rest", async () => {
      if (world.scene && (world.scene as any).updateShadows) {
        await (world.scene as any).updateShadows();
      }
    });

    fragments.list.onItemSet.add(({ value: model }) => {
      model.useCamera(world.camera.three);
      world.scene.three.add(model.object);

      // Enable cast/receive shadows for all meshes in the model
      model.object.traverse((child: any) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      // Force shadowed scene to update shadows
      if (world.scene && (world.scene as any).updateShadows) {
        (world.scene as any).updateShadows();
      }

      // Reset explosion state for fresh model
      ExplosionModule.getInstance().reset();
      const expSlider = getEl("settings-explosion-slider") as HTMLInputElement | null;
      if (expSlider) expSlider.value = "0";
      const expVal = getEl("val-explosion-factor");
      if (expVal) expVal.innerText = "0%";

      // Apply current active theme to newly loaded Three.js model materials
      const currentTheme = document.documentElement.getAttribute("data-theme") || "cozy";
      applyThemeToThreeMaterials(currentTheme);
      updateThemeShaderUniforms(currentTheme);

      if (sceneManager.postproduction) {
        const postProcToggle = getEl("settings-toggle-postproc") as HTMLInputElement | null;
        const isEnabled = postProcToggle ? postProcToggle.checked : false;
        try {
          sceneManager.postproduction.enabled = isEnabled;
        } catch (e) {
          console.warn("Postproduction base pass lazy initialization on model load:", e);
        }
        if (sceneManager.bluePenPass) {
          sceneManager.bluePenPass.uniforms.enabled.value = isEnabled ? 1.0 : 0.0;
        }
        if (sceneManager.postproduction.customEffects) {
          try {
            sceneManager.postproduction.customEffects.setNeedsUpdate();
          } catch (e) {
            // Ignore customEffects update error if base pass is not ready
          }
        }
      }

      // Fit camera to model bounding box so loaded model is immediately visible in view
      try {
        const bbox = new THREE.Box3().setFromObject(model.object);
        if (!bbox.isEmpty() && world.camera.controls) {
          const sphere = new THREE.Sphere();
          bbox.getBoundingSphere(sphere);
          world.camera.controls.fitToSphere(sphere, true);
        }
      } catch (err) {
        console.warn("Camera fitToSphere fallback:", err);
      }

      fragments.core.update(true);
    });

    // 4. Register selection and highlighting listeners
    highlighter.events.select.onHighlight.add((selection) => {
      let firstExpressId: number | null = null;

      for (const fragmentId in selection) {
        const expressIds = selection[fragmentId];
        for (const id of expressIds) {
          firstExpressId = id;
          break;
        }
        if (firstExpressId !== null) break;
      }

      if (firstExpressId !== null) {
        let selectedModel: any = null;
        for (const [, model] of fragments.list) {
          const anyModel = model as any;
          if (anyModel.properties && anyModel.properties[firstExpressId]) {
            selectedModel = anyModel;
            break;
          }
        }

        if (selectedModel) {
          displayElementProperties(selectedModel, firstExpressId);
          return;
        }
      }

      resetPropertiesPanel();
    });

    highlighter.events.select.onClear.add(() => {
      resetPropertiesPanel();
    });

    // Hide initial loader overlay once initialized
    const loadingOverlay = getEl("loading-overlay");
    if (loadingOverlay) {
      loadingOverlay.classList.add("hidden");
    }

    // Force renderer to resize and update layout
    if (world.renderer) {
      world.renderer.resize();
    }
    window.dispatchEvent(new Event('resize'));

    // Initialize empty file list
    refreshFileList();

  } catch (err) {
    console.error("Failed to initialize BIM components:", err);
    const text = getEl("loading-text");
    text.innerText = "Initialization Error";
    const subtitle = getEl("loading-subtitle");
    subtitle.innerText = "Could not initialize WebAssembly or rendering environment.";
  }
};

// Start the initialization
initBim();

// --- DYNAMIC FILE LIST MANAGEMENT ---
function refreshFileList() {
  const fileListEl = getEl("file-list");
  fileListEl.innerHTML = '';

  const headerStatusEl = getEl("header-status-text");

  if (fragments.list.size === 0) {
    const empty = document.createElement('div');
    empty.className = 'file-list-empty';
    empty.id = 'file-list-empty';
    empty.textContent = 'No models loaded. Upload an IFC file or load a sample.';
    fileListEl.appendChild(empty);
    if (headerStatusEl) headerStatusEl.textContent = 'Ready • No Model Loaded';
    return;
  }

  let firstModelName = 'Active Model';
  let totalPropertiesCount = 0;

  for (const [modelId, model] of fragments.list) {
    const anyModel = model as any;
    const name = anyModel.modelId || anyModel.name || modelId;
    if (firstModelName === 'Active Model') firstModelName = name;
    if (anyModel.properties) {
      totalPropertiesCount += Object.keys(anyModel.properties).length;
    }
  }

  if (headerStatusEl) {
    const countStr = totalPropertiesCount > 0 ? ` • ${totalPropertiesCount.toLocaleString()} Elements` : '';
    headerStatusEl.textContent = `${firstModelName}${countStr}`;
  }

  const badgeFilesCount = getEl("badge-files-count");
  if (badgeFilesCount) badgeFilesCount.textContent = String(fragments.list.size);

  const tickerModelName = getEl("ticker-model-name");
  if (tickerModelName) tickerModelName.textContent = firstModelName.toUpperCase();

  const tickerCount = getEl("ticker-elements-count");
  if (tickerCount) tickerCount.textContent = totalPropertiesCount > 0 ? totalPropertiesCount.toLocaleString() : "0";

  for (const [modelId, model] of fragments.list) {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.setAttribute('data-model-id', modelId);

    const anyModel = model as any;
    const name = anyModel.modelId || anyModel.name || modelId;

    item.innerHTML = `
      <div class="file-info">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>
        </svg>
        <span>${name}</span>
      </div>
      <div class="file-actions">
        <button class="btn-icon btn-visibility" title="Toggle Visibility">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
          </svg>
        </button>
        <button class="btn-icon btn-delete" title="Remove Model">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>
    `;

    // Visibility toggle
    let visible = true;
    const visBtn = item.querySelector('.btn-visibility')!;
    visBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      visible = !visible;
      try {
        const hider = components.get(OBC.Hider);
        const localIds = await model.getLocalIds();
        await hider.set(visible, { [modelId]: new Set(localIds) });
      } catch (err) {
        console.warn('Error toggling visibility:', err);
        // Fallback to standard visibility toggle
        model.object.visible = visible;
      }
      visBtn.classList.toggle('active-icon', !visible);
      if (!visible) {
        (visBtn as HTMLElement).style.opacity = '0.4';
      } else {
        (visBtn as HTMLElement).style.opacity = '1';
      }
    });

    // Delete button
    const delBtn = item.querySelector('.btn-delete')!;
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        // Correctly dispose of the model using fragments core
        await fragments.core.disposeModel(modelId);
      } catch (err) {
        console.warn('Error removing model:', err);
        // Fallback
        world.scene.three.remove(model.object);
        fragments.list.delete(modelId);
      }
      refreshFileList();
      updateClassificationUI();
      resetPropertiesPanel();
      calculateTimelineBounds();
      GlobalSearchOverlay.getInstance().buildIndex();
    });

    fileListEl.appendChild(item);
  }
  updateHeaderLabel();
}

// File search filter
const fileSearchInput = getEl('file-search') as HTMLInputElement;
if (fileSearchInput) {
  fileSearchInput.addEventListener('input', () => {
    const filter = fileSearchInput.value.toLowerCase();
    const items = document.querySelectorAll('#file-list .file-item');
    items.forEach((item) => {
      const name = item.querySelector('.file-info span')?.textContent?.toLowerCase() || '';
      (item as HTMLElement).style.display = name.includes(filter) ? 'flex' : 'none';
    });
  });
}

// --- MODEL LOADING WRAPPER ---
async function loadModelData(name: string, buffer: Uint8Array) {
  const overlay = getEl("loading-overlay");
  const text = getEl("loading-text");
  const progress = getEl("loading-progress");
  const subtitle = getEl("loading-subtitle");

  overlay.classList.remove("hidden");
  text.innerText = "Processing 3D Geometry...";
  progress.innerText = "0%";
  subtitle.innerText = name.endsWith(".ifc")
    ? "Executing WASM parsers locally. Extracting geometry layers, components, and properties."
    : "Reading fragment package from array buffer.";

  let pct = 0;
  const interval = setInterval(() => {
    pct = Math.min(pct + Math.floor(Math.random() * 15 + 5), 95);
    progress.innerText = `${pct}%`;
  }, 150);

  try {
    let model: any = null;

    if (name.endsWith(".ifc")) {
      if (!isIfcLoaderSetup) {
        text.innerText = "Initializing WASM engine...";
        await ifcLoader.setup({
          wasm: {
            path: import.meta.env.BASE_URL,
            absolute: true,
          },
          autoSetWasm: false
        });
        isIfcLoaderSetup = true;
      }
      const cacheKey = `${name}-${buffer.length}`;
      text.innerText = "Checking offline cache...";

      let cachedBuffer: Uint8Array | null = null;
      try {
        cachedBuffer = await getCachedFragment(cacheKey);
      } catch (cacheErr) {
        console.warn("Error reading cache:", cacheErr);
      }

      if (cachedBuffer) {
        console.log(`Cache hit for ${name}. Loading pre-converted fragments.`);
        text.innerText = "Loading cached fragments...";
        subtitle.innerText = "Cache hit: Loading pre-converted fragment from IndexedDB (instant).";

        clearInterval(interval);
        progress.innerText = "100%";

        const fragData = cachedBuffer instanceof Uint8Array ? cachedBuffer : new Uint8Array(cachedBuffer as any);
        model = await fragments.core.load(fragData, { modelId: name } as any);
      } else {
        console.log(`Cache miss for ${name}. Converting IFC via WASM loader with complete attributes & relations...`);
        text.innerText = "Converting IFC to Fragments (All Attributes & Relations)...";
        model = await ifcLoader.load(buffer, true, name, {
          instanceCallback: (importer: any) => {
            if (typeof importer.addAllAttributes === "function") {
              importer.addAllAttributes();
            }
            if (typeof importer.addAllRelations === "function") {
              importer.addAllRelations();
            }
          }
        });

        // Cache the parsed model in background once loaded successfully
        if (model) {
          setTimeout(async () => {
            try {
              console.log(`Caching converted fragment for ${name} to IndexedDB...`);
              const fragBuffer = await model.getBuffer(false);
              await setCachedFragment(cacheKey, fragBuffer);
              console.log(`Successfully cached converted fragment for ${name}.`);
            } catch (cacheErr) {
              console.warn("Failed to cache model after load:", cacheErr);
            }
          }, 1000);
        }
      }
    } else {
      const fragData = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer as any);
      model = await fragments.core.load(fragData, { modelId: name } as any);
    }

    clearInterval(interval);
    progress.innerText = "100%";

    if (model) {
      (window as any).viewer_model = model;
      federationModule.registerModel(model, name);

      // Enable shadows if checked
      const shadowsToggleEl = getEl("settings-toggle-shadows") as HTMLInputElement | null;
      const shadowsOn = shadowsToggleEl?.checked ?? false;
      model.object.traverse((child: any) => {
        if (child.isMesh) {
          child.castShadow = shadowsOn;
          child.receiveShadow = shadowsOn;
        }
      });

      // Force renderer to resize and update layout immediately
      if (world.renderer) {
        world.renderer.resize();
      }
      window.dispatchEvent(new Event('resize'));

      // Fit camera controls box around loaded model
      setTimeout(async () => {
        try {
          if (model && model.object) {
            const box = new THREE.Box3().setFromObject(model.object);
            if (!box.isEmpty()) {
              await world.camera.controls.fitToBox(box, true);
            }
          }
        } catch (err) {
          console.warn("Camera fitToBox skipped:", err);
        }
      }, 100);

      // Update dynamic file list immediately
      refreshFileList();

      // Instantly hide loading overlay so user can interact with the 3D model immediately
      overlay.classList.add("hidden");

      // Run background metadata processing asynchronously without blocking viewport
      (async () => {
        const yieldThread = () => new Promise((resolve) => setTimeout(resolve, 16));
        try {
          await yieldThread();

          // 1. Dynamic classifications
          try {
            await classifier.byCategory({ classificationName: "Categories" });
          } catch (e) {
            console.warn("Classifier byCategory info:", e);
          }

          try {
            await classifier.byIfcBuildingStorey({ classificationName: "Storeys" });
          } catch (e) {
            console.warn("Classifier byIfcBuildingStorey info:", e);
          }

          try {
            await classifier.byModel({ classificationName: "Models" });
          } catch (e) {
            console.warn("Classifier byModel info:", e);
          }

          await yieldThread();

          // 2. Apply theme category colors
          try {
            await applyCategoryColors();
          } catch (e) {
            console.warn("applyCategoryColors skipped:", e);
          }

          await yieldThread();

          // 3. Populate 4D/5D digital twin properties
          try {
            await initializeModelTwinData(model);
          } catch (e) {
            console.warn("initializeModelTwinData skipped:", e);
          }

          await yieldThread();

          // 4. Auto-populate 4D Schedule tasks
          try {
            const categoriesGroup = classifier.list.get("Categories");
            if (categoriesGroup) {
              const catMap = new Map<string, { modelId: string; elementIds: number[] }[]>();
              for (const [catName, groupData] of categoriesGroup) {
                if (!groupData || typeof groupData.get !== "function") continue;
                const res = await groupData.get();
                if (!res) continue;
                const itemsArr: { modelId: string; elementIds: number[] }[] = [];
                for (const mId in res) {
                  if (res[mId]) {
                    itemsArr.push({ modelId: mId, elementIds: Array.from(res[mId]) });
                  }
                }
                catMap.set(catName, itemsArr);
              }
              scheduleManager.generateFromCategories(catMap);
            }
          } catch (e) {
            console.warn("ScheduleManager generation skipped:", e);
          }

          // 5. Update 5D cumulative project budget
          if (typeof (window as any).updateCumulative5DCost === 'function') {
            try {
              (window as any).updateCumulative5DCost();
            } catch (e) {
              console.warn("updateCumulative5DCost skipped:", e);
            }
          }

          await yieldThread();

          // 6. Update Classification UI tree & ItemsFinder queries
          try {
            await updateClassificationUI();
            await updateItemFinderQueries();
          } catch (e) {
            console.warn("updateClassificationUI skipped:", e);
          }

          // 7. Sync 4D timeline bounds
          if (typeof calculateTimelineBounds === 'function') {
            calculateTimelineBounds();
          }
          if (is4dMode && typeof (window as any).updateTimelineVisualState === 'function') {
            (window as any).updateTimelineVisualState();
          }

          await yieldThread();

          // 8. Build Global Search Index
          await GlobalSearchOverlay.getInstance().buildIndex();
        } catch (bgErr) {
          console.warn("Background metadata post-processing warning:", bgErr);
        }
      })();
    } else {
      overlay.classList.add("hidden");
    }

  } catch (err) {
    clearInterval(interval);
    console.error("Error loading model:", err);

    text.innerText = "Model Load Failed";
    progress.innerText = "Error";
    subtitle.innerText = `Detail: ${err instanceof Error ? err.message : String(err)}`;

    // Auto-hide error overlay after 6 seconds so user can try again
    setTimeout(() => {
      overlay.classList.add("hidden");
    }, 6000);
  }
}

// --- UI BUTTON & CONTROL EVENT LISTENERS ---

// File Inputs
const fileInput = getEl("file-input") as HTMLInputElement;
fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  await loadModelData(file.name, uint8Array);
  fileInput.value = ""; // Clear value
});

// Load Sample Model Button
async function loadSampleModel() {
  const url = "https://thatopen.github.io/engine_components/resources/frags/school_arq.frag";
  const loadSampleBtn = getEl("load-sample-btn");
  try {
    if (loadSampleBtn) {
      loadSampleBtn.setAttribute("disabled", "true");
      loadSampleBtn.innerText = "Downloading...";
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    await loadModelData("school_arq.frag", uint8Array);
  } catch (err) {
    console.error("Failed to fetch sample file:", err);
  } finally {
    if (loadSampleBtn) {
      loadSampleBtn.removeAttribute("disabled");
      loadSampleBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
        </svg>
        Load Sample
      `;
    }
  }
}
(window as any).loadSampleModel = loadSampleModel;

const loadSampleBtn = getEl("load-sample-btn");
if (loadSampleBtn) {
  loadSampleBtn.addEventListener("click", loadSampleModel);
}

// Theme-to-3D mapping: paper (model fill), ink (edges), grid colors
const themeVisualMap: Record<string, { paper: string; ink: string; jitter: number; gridMajor: string; gridMinor: string }> = {
  // Zen Infrastructure Theme (Kintsugi Gold & Dark Void)
  zen: { paper: "#0D1516", ink: "#00E5FF", jitter: 0.0008, gridMajor: "#3B494C", gridMinor: "#151D1E" },
};

function applyThemeToThreeMaterials(theme: string) {
  const vis = themeVisualMap[theme];
  if (!vis) return;

  const paperCol = new THREE.Color(vis.paper);
  const inkCol = new THREE.Color(vis.ink);

  // Traverse all loaded BIM model fragment meshes in Three.js scene
  for (const [, model] of fragments.list) {
    if (!model || !model.object) continue;
    model.object.traverse((child: any) => {
      if (child.isMesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of mats) {
          if (mat.color) {
            // Blend original mesh color with theme paper/ink colors for native Three.js theme shading
            mat.color.copy(paperCol).lerp(inkCol, 0.25);
          }
          mat.needsUpdate = true;
        }
      }
    });
  }
}

function updateThemeShaderUniforms(theme: string) {
  if (!sceneManager.bluePenPass) return;

  const vis = themeVisualMap[theme];
  if (vis) {
    // Sync shader uniforms while respecting the post-processing UI toggle
    const postProcToggle = getEl("settings-toggle-postproc") as HTMLInputElement | null;
    const isEnabled = postProcToggle ? postProcToggle.checked : true;
    sceneManager.bluePenPass.uniforms.enabled.value = isEnabled ? 1.0 : 0.0;
    if (sceneManager.postproduction) {
      sceneManager.postproduction.enabled = isEnabled;
    }
    sceneManager.bluePenPass.uniforms.paperColor.value.set(vis.paper);
    sceneManager.bluePenPass.uniforms.inkColor.value.set(vis.ink);
    sceneManager.bluePenPass.uniforms.jitterAmount.value = vis.jitter;

    // Sync the grid helper colors to match the theme
    const gridMat = grid.material as THREE.Material;
    if (Array.isArray(gridMat)) {
      (gridMat[0] as THREE.LineBasicMaterial).color.set(vis.gridMajor);
      (gridMat[1] as THREE.LineBasicMaterial).color.set(vis.gridMinor);
    }

    // Apply native Three.js material color overrides
    applyThemeToThreeMaterials(theme);
  } else {
    // Unknown theme fallback — disable shader, keep original render
    sceneManager.bluePenPass.uniforms.enabled.value = 0.0;
  }
}

// Apply Zen Infrastructure theme by default
document.documentElement.setAttribute("data-theme", "zen");
updateThemeShaderUniforms("zen");

// Bottom Toolbar Actions: Visibility
const showAllBtn = getEl("btn-show-all");
if (showAllBtn) {
  showAllBtn.addEventListener("click", async () => {
    const hider = components.get(OBC.Hider);
    await hider.set(true);
  });
}

const hideAllBtn = getEl("btn-hide-all");
if (hideAllBtn) {
  hideAllBtn.addEventListener("click", async () => {
    const hider = components.get(OBC.Hider);
    await hider.set(false);
  });
}

import { exportFrag } from "./components/FragExporter";


const loadIfcBtn = getEl("btn-load-ifc");
if (loadIfcBtn) {
  loadIfcBtn.addEventListener("click", () => {
    if (fileInput) {
      fileInput.accept = ".ifc";
      fileInput.click();
    }
  });
}

const exportFragBtn = getEl("btn-export-frag");
if (exportFragBtn) {
  exportFragBtn.addEventListener("click", async () => {
    // We assume the first model in fragments is the current one
    const models = Array.from(fragments.list.values());
    if (models.length === 0) {
      alert("No model loaded to export.");
      return;
    }
    // Export the primary model
    const model = models[0];
    const firstId = Array.from(fragments.list.keys())[0];
    await exportFrag(model, firstId || "exported-model");
  });
}

const loadFragBtn = getEl("btn-load-frag");
if (loadFragBtn) {
  loadFragBtn.addEventListener("click", () => {
    if (fileInput) {
      fileInput.accept = ".frag";
      fileInput.click();
    }
  });
}

// Bottom Toolbar Actions: Selection
const focusBtn = getEl("btn-focus");
if (focusBtn) {
  focusBtn.addEventListener("click", async () => {
    const selectionMap = highlighter.selection["select"];
    let hasSelection = false;
    if (selectionMap) {
      for (const fragId in selectionMap) {
        if (selectionMap[fragId].size > 0) {
          hasSelection = true;
          break;
        }
      }
    }

    if (hasSelection) {
      try {
        const boundingBoxer = components.get(OBC.BoundingBoxer);
        boundingBoxer.list.clear();
        await boundingBoxer.addFromModelIdMap(selectionMap);
        const box = boundingBoxer.get();
        await world.camera.controls.fitToBox(box, true);
        boundingBoxer.list.clear();
      } catch (e) {
        console.warn("Zoom to selection failed:", e);
      }
    } else {
      // Zoom fit all models in scene
      if (fragments.list.size === 0) return;
      const box = new THREE.Box3();
      let hasModel = false;
      for (const [, model] of fragments.list) {
        box.expandByObject(model.object);
        hasModel = true;
      }
      if (!hasModel) return;
      try {
        await world.camera.controls.fitToBox(box, true);
      } catch (e) {
        console.error("Zoom fit all failed:", e);
      }
    }
  });
}

const hideSelectedBtn = getEl("btn-hide-selected");
if (hideSelectedBtn) {
  hideSelectedBtn.addEventListener("click", async () => {
    const hider = components.get(OBC.Hider);
    const selection = highlighter.selection["select"];
    if (selection && Object.keys(selection).length > 0) {
      let hasItems = false;
      for (const id in selection) {
        if (selection[id].size > 0) hasItems = true;
      }
      if (hasItems) {
        await hider.set(false, selection);
        await highlighter.clear("select");
        resetPropertiesPanel();
      }
    }
  });
}

const isolateBtn = getEl("btn-isolate");
if (isolateBtn) {
  isolateBtn.addEventListener("click", async () => {
    const hider = components.get(OBC.Hider);
    const selection = highlighter.selection["select"];
    if (selection && Object.keys(selection).length > 0) {
      let hasItems = false;
      for (const id in selection) {
        if (selection[id].size > 0) hasItems = true;
      }
      if (hasItems) {
        await hider.isolate(selection);
      }
    }
  });
}

const clearSelectionBtn = getEl("btn-clear-selection");
if (clearSelectionBtn) {
  clearSelectionBtn.addEventListener("click", async () => {
    await highlighter.clear("select");
    resetPropertiesPanel();
  });
}

// Bottom Toolbar Actions: Sectioning
const clipperBtn = getEl("btn-section-cut");
if (clipperBtn) {
  clipperBtn.addEventListener("click", () => {
    clipper.enabled = !clipper.enabled;
    clipperBtn.classList.toggle("active", clipper.enabled);
    updateViewportHint(clipper.enabled ? "Section Cut Active — Double-click any surface to slice model" : "Double-click any 3D element to inspect properties • Drag to Orbit view");
  });
}

const clearClipsBtn = getEl("btn-clear-sections");
if (clearClipsBtn) {
  clearClipsBtn.addEventListener("click", () => {
    clipper.deleteAll();
    updateViewportHint("Section planes cleared • Double-click any 3D element to inspect properties");
  });
}

// --- INTUITIVE VIEWPORT HINT BAR MANAGER ---
function updateViewportHint(msg: string) {
  const hintText = getEl("viewport-hint-text");
  const hintBar = getEl("viewport-hint-bar");
  if (hintText) hintText.textContent = msg;
  if (hintBar) hintBar.classList.remove("hidden");
}

const hintDismissBtn = getEl("btn-hint-dismiss");
if (hintDismissBtn) {
  hintDismissBtn.addEventListener("click", () => {
    getEl("viewport-hint-bar")?.classList.add("hidden");
  });
}


// --- STRUCTURED AI PROMPT EXPORTER ---
const btnExportPrompt = getEl("btn-export-prompt");
if (btnExportPrompt) {
  btnExportPrompt.addEventListener("click", () => {
    const expressId = getEl("prop-express-id")?.textContent || "-";
    const ifcType = getEl("prop-ifc-type")?.textContent || "-";
    const name = getEl("prop-name")?.textContent || "-";

    const promptText = `Convert the following BIM metadata into an element component specification:\nElement ExpressID: "${expressId}"\nIFC Entity Type: "${ifcType}"\nElement Name: "${name}"\nApplication Context: "Enterprise 3D BIM Twin Dashboard"`;

    navigator.clipboard.writeText(promptText).then(() => {
      const origText = btnExportPrompt.innerHTML;
      btnExportPrompt.innerHTML = `✓ Copied Structured Prompt!`;
      setTimeout(() => {
        btnExportPrompt.innerHTML = origText;
      }, 2000);
      updateViewportHint("Structured AI Prompt copied to clipboard! Ready to paste into LLMs.");
    }).catch(err => {
      console.warn("Failed to copy prompt to clipboard:", err);
    });
  });
}

// Wire and render Items Finder queries dynamically based on model classification categories
async function updateItemFinderQueries() {
  const container = getEl("finder-queries-list");
  if (!container) return;

  container.innerHTML = "";

  // 1. Add the 3 standard hardcoded queries
  const defaultQueries = [
    { name: "Walls & Slabs", desc: "Isolate all walls and slabs." },
    { name: "Masonry Walls", desc: "Walls with \"Masonry\" in their name." },
    { name: "First Level Columns", desc: "Columns in Entry level storey." }
  ];

  defaultQueries.forEach(q => {
    const item = document.createElement("div");
    item.className = "query-item";
    item.innerHTML = `
      <div class="query-info">
        <div class="query-name">${q.name}</div>
        <div class="query-desc">${q.desc}</div>
      </div>
      <div class="query-actions">
        <button class="btn-secondary btn-query-execute" data-query="${q.name}">Isolate</button>
      </div>
    `;
    container.appendChild(item);
  });

  // 2. Automatically generate queries from categories using ItemsFinder API
  try {
    if (fragments.list.size > 0) {
      await finder.addFromCategories();
    }
  } catch (e) {
    console.warn("ItemsFinder addFromCategories info:", e);
  }

  // Render queries registered in ItemsFinder list
  for (const [queryKey] of finder.list) {
    if (defaultQueries.some(dq => dq.name === queryKey)) continue;
    const cleanName = queryKey.replace(/^IFC/i, "");
    const item = document.createElement("div");
    item.className = "query-item";
    item.innerHTML = `
      <div class="query-info">
        <div class="query-name">${cleanName}</div>
        <div class="query-desc">Isolate all elements matching ${queryKey} using ItemsFinder.</div>
      </div>
      <div class="query-actions">
        <button class="btn-secondary btn-query-execute" data-query="${queryKey}">Isolate</button>
      </div>
    `;
    container.appendChild(item);
  }

  // 3. Fallback: Add dynamic categories from Classifier if not present
  const categoriesGroup = classifier.list.get("Categories");
  if (categoriesGroup && fragments.list.size > 0) {
    for (const [groupName] of categoriesGroup) {
      if (finder.list.has(groupName)) continue;
      const cleanName = groupName.replace(/^IFC/i, "");
      const item = document.createElement("div");
      item.className = "query-item";
      item.innerHTML = `
        <div class="query-info">
          <div class="query-name">${cleanName}</div>
          <div class="query-desc">Isolate all elements of category ${groupName}.</div>
        </div>
        <div class="query-actions">
          <button class="btn-secondary btn-query-execute" data-type="category" data-group-name="${groupName}">Isolate</button>
        </div>
      `;
      container.appendChild(item);
    }
  }

  const badgeFinderCount = getEl("badge-finder-count");
  if (badgeFinderCount) {
    const totalQueries = container.querySelectorAll(".query-item").length;
    badgeFinderCount.textContent = String(totalQueries);
  }
}

// Attach a single delegated listener on finder-queries-list
const finderQueriesContainer = getEl("finder-queries-list");
if (finderQueriesContainer) {
  finderQueriesContainer.addEventListener("click", async (e) => {
    const target = (e.target as HTMLElement)?.closest(".btn-query-execute") as HTMLButtonElement | null;
    if (!target) return;

    const hider = components.get(OBC.Hider);
    const currentText = target.textContent?.trim() || "";

    // If already isolated, show opposite action (Show All) to restore visibility
    if (currentText === "Show All") {
      target.disabled = true;
      target.textContent = "Restoring...";
      try {
        await hider.set(true);
        target.textContent = "Isolate";
      } catch (err) {
        console.error("Failed to restore visibility:", err);
        target.textContent = "Show All";
      } finally {
        target.disabled = false;
      }
      return;
    }

    target.disabled = true;
    target.textContent = "Finding...";

    try {
      let results: Record<string, Set<number>> = {};

      if (target.getAttribute("data-type") === "category") {
        const groupName = target.getAttribute("data-group-name");
        if (groupName) {
          const categoriesGroup = classifier.list.get("Categories");
          const groupData = categoriesGroup?.get(groupName);
          if (groupData) {
            results = await groupData.get();
          }
        }
      } else {
        const queryName = target.getAttribute("data-query");
        if (queryName) {
          results = await getQueryResults(queryName);
        }
      }

      if (results && Object.keys(results).length > 0) {
        // Reset all other query buttons back to "Isolate"
        finderQueriesContainer.querySelectorAll(".btn-query-execute").forEach((otherBtn) => {
          if (otherBtn !== target) {
            (otherBtn as HTMLButtonElement).textContent = "Isolate";
          }
        });

        await hider.isolate(results);
        target.textContent = "Show All";
      } else {
        alert(`No elements found matching query. Make sure a model is loaded.`);
        target.textContent = "Isolate";
      }
    } catch (err) {
      console.error("Query execution failed:", err);
      target.textContent = "Isolate";
    } finally {
      target.disabled = false;
    }
  });
}

// Initial populate
updateItemFinderQueries();

// Sidebar Scene Controls bindings
const ambientSlider = getEl("ambient-light-slider") as HTMLInputElement;
const ambientValLabel = getEl("val-ambient-light");
ambientSlider.addEventListener("input", () => {
  const val = Number(ambientSlider.value);
  ambientValLabel.innerText = val.toFixed(1);
  if (ambientLight) {
    ambientLight.intensity = val;
  }
});

const dirSlider = getEl("dir-light-slider") as HTMLInputElement;
const dirValLabel = getEl("val-dir-light");
dirSlider.addEventListener("input", () => {
  const val = Number(dirSlider.value);
  dirValLabel.innerText = val.toFixed(1);
  if (dirLight) {
    dirLight.intensity = val;
  }
});



// Post-Processing Settings Event Bindings
const postProcToggle = getEl("settings-toggle-postproc") as HTMLInputElement | null;
if (postProcToggle) {
  postProcToggle.addEventListener("change", () => {
    const enabled = postProcToggle.checked;
    if (sceneManager.postproduction) {
      sceneManager.postproduction.enabled = enabled;
    }
    if (sceneManager.bluePenPass) {
      sceneManager.bluePenPass.uniforms.enabled.value = enabled ? 1.0 : 0.0;
    }
    fragments.core.update(true);
  });
}

const postProcThickness = getEl("settings-postproc-thickness") as HTMLInputElement | null;
const postProcThicknessVal = getEl("val-postproc-thickness");
if (postProcThickness) {
  postProcThickness.addEventListener("input", () => {
    const val = Number(postProcThickness.value);
    if (postProcThicknessVal) postProcThicknessVal.innerText = val.toFixed(1);
    if (sceneManager.bluePenPass) {
      sceneManager.bluePenPass.uniforms.lineThickness.value = val;
    }
  });
}

const postProcJitter = getEl("settings-postproc-jitter") as HTMLInputElement | null;
const postProcJitterVal = getEl("val-postproc-jitter");
if (postProcJitter) {
  postProcJitter.addEventListener("input", () => {
    const val = Number(postProcJitter.value);
    if (postProcJitterVal) postProcJitterVal.innerText = val.toFixed(4);
    if (sceneManager.bluePenPass) {
      sceneManager.bluePenPass.uniforms.jitterAmount.value = val;
    }
  });
}

// Bloom Glow Slider
const postProcBloom = getEl("settings-postproc-bloom") as HTMLInputElement | null;
const postProcBloomVal = getEl("val-postproc-bloom");
if (postProcBloom) {
  postProcBloom.addEventListener("input", () => {
    const val = Number(postProcBloom.value);
    if (postProcBloomVal) postProcBloomVal.innerText = val.toFixed(2);
    if (sceneManager.bluePenPass) {
      sceneManager.bluePenPass.uniforms.bloomStrength.value = val;
    }
  });
}

// Radial Vignette Slider
const postProcVignette = getEl("settings-postproc-vignette") as HTMLInputElement | null;
const postProcVignetteVal = getEl("val-postproc-vignette");
if (postProcVignette) {
  postProcVignette.addEventListener("input", () => {
    const val = Number(postProcVignette.value);
    if (postProcVignetteVal) postProcVignetteVal.innerText = val.toFixed(2);
    if (sceneManager.bluePenPass) {
      sceneManager.bluePenPass.uniforms.vignetteIntensity.value = val;
    }
  });
}

// Chromatic Aberration Slider
const postProcChroma = getEl("settings-postproc-chroma") as HTMLInputElement | null;
const postProcChromaVal = getEl("val-postproc-chroma");
if (postProcChroma) {
  postProcChroma.addEventListener("input", () => {
    const val = Number(postProcChroma.value);
    if (postProcChromaVal) postProcChromaVal.innerText = val.toFixed(2);
    if (sceneManager.bluePenPass) {
      sceneManager.bluePenPass.uniforms.chromaticAberration.value = val;
    }
  });
}

// Toon Quantization Steps Slider
const postProcToon = getEl("settings-postproc-toon") as HTMLInputElement | null;
const postProcToonVal = getEl("val-postproc-toon");
if (postProcToon) {
  postProcToon.addEventListener("input", () => {
    const val = Number(postProcToon.value);
    if (postProcToonVal) postProcToonVal.innerText = val.toString();
    if (sceneManager.bluePenPass) {
      sceneManager.bluePenPass.uniforms.toonSteps.value = val;
    }
  });
}

// Shader FX Mode Selector
const postProcFxMode = getEl("settings-postproc-fxmode") as HTMLSelectElement | null;
if (postProcFxMode) {
  postProcFxMode.addEventListener("change", () => {
    const val = Number(postProcFxMode.value);
    if (sceneManager.bluePenPass) {
      sceneManager.bluePenPass.uniforms.postMode.value = val;
    }
  });
}

const bgColorPicker = getEl("settings-bg-color") as HTMLInputElement;
bgColorPicker.addEventListener("input", () => {
  const color = bgColorPicker.value;
  document.body.style.backgroundColor = color;
  container.style.backgroundColor = color;
  if (world.scene.three.background) {
    (world.scene.three.background as THREE.Color).set(color);
  }
});

const gridToggle = getEl("settings-toggle-grid") as HTMLInputElement;
gridToggle.addEventListener("change", () => {
  grid.visible = gridToggle.checked;
});

const logoToggle = getEl("settings-toggle-logo") as HTMLInputElement;
const viewerLogoEl = getEl("viewer-logo") as HTMLImageElement | null;
logoToggle.addEventListener("change", () => {
  try {
    if (world.renderer) {
      world.renderer.showLogo = logoToggle.checked;
    }
    if (viewerLogoEl) {
      viewerLogoEl.style.display = logoToggle.checked ? "block" : "none";
    }
  } catch (e) {
    console.error("Failed to toggle logo:", e);
  }
});

const shadowsToggle = getEl("settings-toggle-shadows") as HTMLInputElement;
shadowsToggle.addEventListener("change", () => {
  const enabled = shadowsToggle.checked;
  world.scene.shadowsEnabled = enabled;
  if (dirLight) {
    dirLight.castShadow = enabled;
  }
  for (const [, model] of fragments.list) {
    model.object.traverse((child: any) => {
      if (child.isMesh) {
        child.castShadow = enabled;
        child.receiveShadow = enabled;
      }
    });
  }
  fragments.core.update(true);
});

const clearCacheBtn = getEl("btn-clear-cache");
clearCacheBtn.addEventListener("click", async () => {
  if (confirm("Are you sure you want to clear the offline fragments cache and reset the digital twin database? This will apply the new standard construction sequencing to all models.")) {
    await clearFragmentCache();
    localStorage.removeItem("bim_twin_db_v1");
    for (const key in twinDatabase) {
      delete twinDatabase[key];
    }
    alert("Offline cache and digital twin database reset successfully. Please reload the model to see the new sequence.");
  }
});

// Clear only localStorage (no fragment cache)
const clearStorageBtn = getEl("btn-clear-storage");
clearStorageBtn?.addEventListener("click", () => {
  if (confirm("Clear all localStorage entries? This will remove saved twin data and settings.")) {
    localStorage.clear();
    alert("Local storage cleared. Reload the page to start fresh.");
  }
});

// Selection Color Customizer Event Listeners
const selectColorPicker = getEl("settings-select-color") as HTMLInputElement;
selectColorPicker.addEventListener("input", () => {
  const colorHex = selectColorPicker.value;
  const style = highlighter.styles.get("select");
  if (style) {
    style.color = new THREE.Color(colorHex);
  }
});

const hoverColorPicker = getEl("settings-hover-color") as HTMLInputElement;
hoverColorPicker.addEventListener("input", () => {
  const colorHex = hoverColorPicker.value;
  const style = highlighter.styles.get("hover");
  if (style) {
    style.color = new THREE.Color(colorHex);
  }
});

// Interactive 4D Simulation Status Color Pickers
const plannedColorPicker = getEl("4d-color-planned") as HTMLInputElement | null;
if (plannedColorPicker) {
  plannedColorPicker.addEventListener("input", () => {
    ScheduleManager.statusColors['Planned'] = plannedColorPicker.value;
    if (currentTimelineDate) updateTimelineVisualState();
  });
}

const activeColorPicker = getEl("4d-color-active") as HTMLInputElement | null;
if (activeColorPicker) {
  activeColorPicker.addEventListener("input", () => {
    ScheduleManager.statusColors['In Progress'] = activeColorPicker.value;
    if (currentTimelineDate) updateTimelineVisualState();
  });
}

const completeColorPicker = getEl("4d-color-complete") as HTMLInputElement | null;
if (completeColorPicker) {
  completeColorPicker.addEventListener("input", () => {
    ScheduleManager.statusColors['Completed'] = completeColorPicker.value;
    if (currentTimelineDate) updateTimelineVisualState();
  });
}

const clearSelectionColorsBtn = getEl("btn-clear-select-colors");
clearSelectionColorsBtn.addEventListener("click", async () => {
  await highlighter.clear("select");
  await highlighter.clear("hover");
  resetPropertiesPanel();
  showToast("Cleared Selection Highlight", `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`);
});

// Custom Highlighter Manager UI Integration
const highlighterManager = HighlighterManager.getInstance();
const customStyleSelect = getEl("select-custom-highlighter-style") as HTMLSelectElement | null;
const customStyleColorPicker = getEl("picker-custom-highlighter-color") as HTMLInputElement | null;
const btnApplyCustomHighlight = getEl("btn-apply-custom-highlight") as HTMLButtonElement | null;
const btnResetCustomHighlight = getEl("btn-reset-custom-highlight") as HTMLButtonElement | null;
const btnClearAllHighlighters = getEl("btn-clear-all-highlighters") as HTMLButtonElement | null;

if (customStyleSelect && customStyleColorPicker) {
  customStyleSelect.addEventListener("change", () => {
    const selectedStyleId = customStyleSelect.value;
    const style = highlighterManager.getStyle(selectedStyleId);
    if (style) {
      customStyleColorPicker.value = style.color;
    }
  });

  customStyleColorPicker.addEventListener("input", () => {
    const selectedStyleId = customStyleSelect.value;
    highlighterManager.updateStyleColor(selectedStyleId, customStyleColorPicker.value);
  });
}

if (btnApplyCustomHighlight && customStyleSelect) {
  btnApplyCustomHighlight.addEventListener("click", async () => {
    const styleId = customStyleSelect.value;
    const applied = await highlighterManager.applyCustomHighlight(styleId, false);
    if (applied) {
      showToast(`Applied ${styleId} Highlight (Deselect to view custom color)`, `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2v20M2 12h20"/></svg>`);
    } else {
      showToast("No element selected to highlight", `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`);
    }
  });
}

if (btnResetCustomHighlight && customStyleSelect) {
  btnResetCustomHighlight.addEventListener("click", async () => {
    const styleId = customStyleSelect.value;
    await highlighterManager.resetCustomHighlighter(styleId, true);
    showToast(`Reset ${styleId} Highlight for Selection`, `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>`);
  });
}

if (btnClearAllHighlighters) {
  btnClearAllHighlighters.addEventListener("click", async () => {
    await highlighterManager.clearAllCustomHighlights();
    showToast("Cleared All Custom Highlights", `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`);
  });
}

// Quick Highlight Preset Buttons in Tools Tab
document.querySelectorAll(".btn-quick-highlight-preset").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const preset = btn.getAttribute("data-preset");
    if (!preset) return;
    const applied = await highlighterManager.applyCustomHighlight(preset, false);
    if (applied) {
      showToast(`Applied ${preset} Overlay (Deselect to view)`, `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2v20M2 12h20"/></svg>`);
    } else {
      showToast("Select elements to highlight first", `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`);
    }
  });
});

const btnQuickHighlightClear = getEl("btn-quick-highlight-clear");
if (btnQuickHighlightClear) {
  btnQuickHighlightClear.addEventListener("click", async () => {
    await highlighterManager.clearAllCustomHighlights();
    showToast("Reset all custom highlights", `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`);
  });
}

const btnHighlightApplyTool = getEl("btn-highlight-apply-tool");
if (btnHighlightApplyTool && customStyleSelect) {
  btnHighlightApplyTool.addEventListener("click", async () => {
    const styleId = customStyleSelect.value || "Red";
    const applied = await highlighterManager.applyCustomHighlight(styleId, false);
    if (applied) {
      showToast(`Applied ${styleId} Overlay`, `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2v20M2 12h20"/></svg>`);
    } else {
      showToast("Select elements first", `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`);
    }
  });
}

const btnHighlightClearTool = getEl("btn-highlight-clear-tool");
if (btnHighlightClearTool) {
  btnHighlightClearTool.addEventListener("click", async () => {
    await highlighterManager.clearAllCustomHighlights();
    showToast("Cleared highlights", `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`);
  });
}

// --- FRAGMENTS MODEL INFORMATION & DATA OPERATIONS WIRING ---
const modelInfoManager = ModelInfoManager.getInstance();

// 1. Log Attributes
const btnQueryLogAttrs = getEl("btn-query-log-attrs");
if (btnQueryLogAttrs) {
  btnQueryLogAttrs.addEventListener("click", async () => {
    if (activeExpressId === null) {
      showToast("Select an element in viewport first", `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`);
      return;
    }
    const attrs = await modelInfoManager.getAttributes(activeExpressId, undefined, activeModelId || undefined);
    console.log(`[Fragments] Attributes for Element #${activeExpressId}:`, attrs);
    showToast(`Logged Attributes for #${activeExpressId} to Console`, `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`);
  });
}

// 2. Log Property Sets (IsDefinedBy)
const btnQueryLogPsets = getEl("btn-query-log-psets");
if (btnQueryLogPsets) {
  btnQueryLogPsets.addEventListener("click", async () => {
    if (activeExpressId === null) {
      showToast("Select an element in viewport first", `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`);
      return;
    }
    const rawPsets = await modelInfoManager.getItemPropertySets(activeExpressId, activeModelId || undefined);
    const formatted = modelInfoManager.formatItemPsets(rawPsets);
    console.log(`[Fragments] Formatted Psets for Element #${activeExpressId}:`, formatted);
    console.log(`[Fragments] Raw IsDefinedBy relations:`, rawPsets);
    showToast(`Logged Property Sets for #${activeExpressId}`, `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`);
  });
}

// 3. Log Geometry (BufferAttributes)
const btnQueryLogGeom = getEl("btn-query-log-geom");
if (btnQueryLogGeom) {
  btnQueryLogGeom.addEventListener("click", async () => {
    if (activeExpressId === null) {
      showToast("Select an element in viewport first", `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`);
      return;
    }
    const geom = await modelInfoManager.getItemGeometry(activeExpressId, activeModelId || undefined);
    console.log(`[Fragments] BufferGeometry for Element #${activeExpressId}:`, geom);
    showToast(`Logged Geometry Collection for #${activeExpressId}`, `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`);
  });
}

// 4. Log Spatial Structure Hierarchy Tree
const btnQueryLogStructure = getEl("btn-query-log-structure");
if (btnQueryLogStructure) {
  btnQueryLogStructure.addEventListener("click", async () => {
    const structure = await modelInfoManager.getSpatialStructure(activeModelId || undefined);
    console.log(`[Fragments] Full Model Spatial Structure Hierarchy:`, structure);
    showToast("Logged Full Spatial Structure Tree", `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>`);
  });
}

// 5. Category: Log Names
const selectQueryCategory = getEl("select-query-category") as HTMLSelectElement | null;
const btnCategoryLogNames = getEl("btn-category-log-names");
if (btnCategoryLogNames && selectQueryCategory) {
  btnCategoryLogNames.addEventListener("click", async () => {
    const category = selectQueryCategory.value;
    const names = await modelInfoManager.getNamesFromCategory(category, true, activeModelId || undefined);
    console.log(`[Fragments] Unique Element Names in "${category}" (${names.length} items):`, names);
    showToast(`Logged ${names.length} elements in ${category}`, `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`);
  });
}

// 6. Category: Extract & Render Three.js Meshes
const btnCategoryExtractGeom = getEl("btn-category-extract-geom");
if (btnCategoryExtractGeom && selectQueryCategory) {
  btnCategoryExtractGeom.addEventListener("click", async () => {
    const category = selectQueryCategory.value;
    showToast(`Extracting 3D geometry for ${category}...`);
    const { localIds, geometries } = await modelInfoManager.getGeometriesFromCategory(category, activeModelId || undefined);
    let createdCount = 0;
    for (const val of geometries) {
      if (Array.isArray(val)) {
        for (const meshData of val) {
          const mesh = modelInfoManager.createMeshFromData(meshData, "#a855f7");
          if (mesh) createdCount++;
        }
      }
    }

    // Hide original geometry elements so extracted meshes are prominent
    
    for (const [, model] of fragments.list) {
      if (typeof (model as any).setVisible === "function") {
        await (model as any).setVisible(localIds, false);
      }
    }
    fragments.core.update(true);

    console.log(`[Fragments] Extracted & rendered ${createdCount} Three.js Meshes for ${category}:`, geometries);
    showToast(`Rendered ${createdCount} meshes in purple for ${category}`, `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="12 2 2 7 12 12 22 7 12 2"/></svg>`);
  });
}

// 7. Spatial: First Level Children
const btnSpatialFirstLevel = getEl("btn-spatial-first-level");
if (btnSpatialFirstLevel) {
  btnSpatialFirstLevel.addEventListener("click", async () => {
    const children = await modelInfoManager.getFirstLevelChildren(activeModelId || undefined);
    console.log(`[Fragments] First Level (Storey) Children Elements:`, children);
    showToast(`Logged ${children ? children.length : 0} Storey Children to Console`, `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>`);
  });
}

// 8. Dispose Extracted Meshes
const btnDisposeExtractedMeshes = getEl("btn-dispose-extracted-meshes");
if (btnDisposeExtractedMeshes) {
  btnDisposeExtractedMeshes.addEventListener("click", async () => {
    await modelInfoManager.disposeExtractedMeshes(activeModelId || undefined);
    showToast("Disposed extracted meshes & restored model", `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`);
  });
}

// --- GAMEPLAY CAMERA PRESET VARIABLES & STATE ---
let activePreset: "Default" | "FPS" | "Sports" | "Racing" | "ThirdPerson" = "Default";

let gameDrawingSheetMesh: THREE.Group | null = null;
let gameCarMesh: THREE.Group | null = null;
let gameCharacterMesh: THREE.Group | null = null;

// Car movement state
const carPosition = new THREE.Vector3(0, 0.01, 0);
let carRotationY = 0;
let carSpeed = 0;
const CAR_MAX_SPEED = 0.5;
const CAR_ACCEL = 0.02;
const CAR_STEER_SPEED = 0.04;

// Character movement state
const charPosition = new THREE.Vector3(0, 0.01, 0);
let charRotationY = 0;

// Camera Shake variables
const fpsShakeOffset = new THREE.Vector3();
let fpsShakeTime = 0;

// Collision system state
let collisionMeshes: THREE.Mesh[] = [];
let baseSurfaceY = 0;
let fpsHeightOffset = 0;

function isGlass(object: THREE.Object3D): boolean {
  if (object instanceof THREE.Mesh) {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const mat of materials) {
      if (mat) {
        if (mat.transparent && mat.opacity < 0.95) return true;
        if (mat.name && (
          mat.name.toLowerCase().includes("glass") ||
          mat.name.toLowerCase().includes("glazing") ||
          mat.name.toLowerCase().includes("translucent")
        )) {
          return true;
        }
      }
    }
  }
  return false;
}

function updateCollisionMeshes() {
  collisionMeshes = [];
  for (const [, model] of fragments.list) {
    if (model && model.object) {
      model.object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          collisionMeshes.push(child);
        }
      });
    }
  }
}


function createDrawingSheetMesh(): THREE.Group {
  const group = new THREE.Group();

  // A0 drawing sheet (thin blue rectangular box)
  const sheetGeo = new THREE.BoxGeometry(0.7, 0.5, 0.005);
  const sheetMat = new THREE.MeshStandardMaterial({
    color: 0x1e40af, // Blueprint blue
    roughness: 0.8,
    metalness: 0.1
  });
  const sheet = new THREE.Mesh(sheetGeo, sheetMat);
  sheet.castShadow = true;
  sheet.receiveShadow = true;
  group.add(sheet);

  // Border (thin white rectangle overlay)
  const borderGeo = new THREE.BoxGeometry(0.66, 0.46, 0.006);
  const borderMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.15 });
  const border = new THREE.Mesh(borderGeo, borderMat);
  border.position.z = 0.001;
  group.add(border);

  // Mock blueprint lines (light blue lines)
  const lineMat = new THREE.MeshBasicMaterial({ color: 0x93c5fd });

  // Horizontal line
  const l1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.003, 0.006), lineMat);
  l1.position.set(-0.05, 0.1, 0.001);
  group.add(l1);

  // Vertical line
  const l2 = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.3, 0.006), lineMat);
  l2.position.set(-0.1, -0.05, 0.001);
  group.add(l2);

  // Mock building boxes
  const box1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.006), lineMat);
  box1.position.set(0.12, 0.05, 0.001);
  group.add(box1);

  // Title block
  const titleBlock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.006), lineMat);
  titleBlock.position.set(0.22, -0.17, 0.001);
  group.add(titleBlock);

  // Two hands holding the bottom corners
  const handMat = new THREE.MeshStandardMaterial({
    color: 0xe0ac69, // skin tone
    roughness: 0.6
  });

  const leftHand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.08), handMat);
  leftHand.position.set(-0.35, -0.2, 0.03);
  leftHand.rotation.z = 0.2;
  group.add(leftHand);

  const rightHand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.08), handMat);
  rightHand.position.set(0.35, -0.2, 0.03);
  rightHand.rotation.z = -0.2;
  group.add(rightHand);

  return group;
}

function createCarMesh(): THREE.Group {
  const carGroup = new THREE.Group();

  // Car chassis body
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.5, 3.2),
    new THREE.MeshStandardMaterial({ color: 0xe53e3e, metalness: 0.8, roughness: 0.2 })
  );
  body.position.y = 0.45;
  body.castShadow = true;
  body.receiveShadow = true;
  carGroup.add(body);

  // Cabin
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.5, 1.4),
    new THREE.MeshStandardMaterial({ color: 0x2d3748, transparent: true, opacity: 0.7, roughness: 0.1 })
  );
  cabin.position.set(0, 0.9, -0.2);
  cabin.castShadow = true;
  carGroup.add(cabin);

  // Wheels (4 cylinders)
  const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a202c, roughness: 0.8 });
  wheelGeo.rotateZ(Math.PI / 2);

  const wheelPositions = [
    [0.85, 0.4, 1.0],
    [-0.85, 0.4, 1.0],
    [0.85, 0.4, -1.0],
    [-0.85, 0.4, -1.0]
  ];

  for (const pos of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(pos[0], pos[1], pos[2]);
    wheel.castShadow = true;
    carGroup.add(wheel);
  }

  // Headlights
  const lightGeo = new THREE.SphereGeometry(0.12, 8, 8);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const l1 = new THREE.Mesh(lightGeo, lightMat); l1.position.set(0.6, 0.5, 1.6); carGroup.add(l1);
  const l2 = new THREE.Mesh(lightGeo, lightMat); l2.position.set(-0.6, 0.5, 1.6); carGroup.add(l2);

  return carGroup;
}

function createCharacterMesh(): THREE.Group {
  const charGroup = new THREE.Group();

  // Capsule body
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.35, 0.9, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0x3182ce, roughness: 0.4, metalness: 0.1 })
  );
  body.position.y = 0.8;
  body.castShadow = true;
  body.receiveShadow = true;
  charGroup.add(body);

  // Eyes
  const eyeGeo = new THREE.SphereGeometry(0.08, 8, 8);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x000000 });

  const leftEye = new THREE.Mesh(eyeGeo, eyeMat); leftEye.position.set(0.14, 1.0, 0.32); charGroup.add(leftEye);
  const rightEye = new THREE.Mesh(eyeGeo, eyeMat); rightEye.position.set(-0.14, 1.0, 0.32); charGroup.add(rightEye);

  const leftPupil = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), pupilMat); leftPupil.position.set(0.16, 1.0, 0.38); charGroup.add(leftPupil);
  const rightPupil = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), pupilMat); rightPupil.position.set(-0.12, 1.0, 0.38); charGroup.add(rightPupil);

  // Cute hat
  const hatGeo = new THREE.ConeGeometry(0.35, 0.4, 8);
  const hatMat = new THREE.MeshStandardMaterial({ color: 0xdd6b20, roughness: 0.6 });
  const hat = new THREE.Mesh(hatGeo, hatMat);
  hat.position.set(0, 1.45, 0);
  hat.castShadow = true;
  charGroup.add(hat);

  return charGroup;
}

// --- EVENT BINDINGS FOR CAMERA PRESETS ---
const gamePresetSelect = getEl("settings-game-camera-preset") as HTMLSelectElement;
const fpsFovSlider = getEl("settings-fps-fov") as HTMLInputElement;
const fpsFovVal = getEl("val-fps-fov");
const fpsShakeToggle = getEl("settings-fps-shake") as HTMLInputElement;
const fpsWeaponSelect = getEl("settings-fps-weapon-style") as HTMLSelectElement;

const sportsHeightSlider = getEl("settings-sports-height") as HTMLInputElement;
const sportsHeightVal = getEl("val-sports-height");
const sportsZoomSlider = getEl("settings-sports-zoom") as HTMLInputElement;
const sportsZoomVal = getEl("val-sports-zoom");

const racingAttachmentSelect = getEl("settings-racing-attachment") as HTMLSelectElement;
const racingFovSlider = getEl("settings-racing-fov") as HTMLInputElement;
const racingFovVal = getEl("val-racing-fov");

const tpDistanceSlider = getEl("settings-thirdperson-distance") as HTMLInputElement;
const tpDistanceVal = getEl("val-thirdperson-distance");
const tpAutoFollowToggle = getEl("settings-thirdperson-autofollow") as HTMLInputElement;

const presetSubpanels = {
  FPS: getEl("preset-options-fps"),
  Sports: getEl("preset-options-sports"),
  Racing: getEl("preset-options-racing"),
  ThirdPerson: getEl("preset-options-thirdperson"),
};

function updatePresetSubpanels(activeMode: string) {
  for (const key in presetSubpanels) {
    const el = presetSubpanels[key as keyof typeof presetSubpanels];
    if (el) {
      el.style.display = key === activeMode ? "flex" : "none";
    }
  }
}

function exitActivePreset() {
  if (gameDrawingSheetMesh && gameDrawingSheetMesh.parent) {
    gameDrawingSheetMesh.parent.remove(gameDrawingSheetMesh);
  }
  if (gameCarMesh && gameCarMesh.parent) {
    gameCarMesh.parent.remove(gameCarMesh);
  }
  if (gameCharacterMesh && gameCharacterMesh.parent) {
    gameCharacterMesh.parent.remove(gameCharacterMesh);
  }

  // Restore camera defaults
  world.camera.set("Orbit");
  world.camera.projection.set("Perspective");
  if (world.camera.three instanceof THREE.PerspectiveCamera) {
    world.camera.three.near = 1.0; // Restore default near clipping plane
    world.camera.three.fov = 60;
    world.camera.three.updateProjectionMatrix();
  }
  fpsHeightOffset = 0; // Reset height offset
  firstPersonKeys.forward = false;
  firstPersonKeys.backward = false;
  firstPersonKeys.left = false;
  firstPersonKeys.right = false;
  firstPersonKeys.up = false;
  firstPersonKeys.down = false;
  const settingsCameraMode = getEl("settings-camera-mode") as HTMLSelectElement | null;
  if (settingsCameraMode) {
    settingsCameraMode.value = "Orbit";
    settingsCameraMode.disabled = false;
  }
  const settingsCameraProjection = getEl("settings-camera-projection") as HTMLSelectElement | null;
  if (settingsCameraProjection) {
    settingsCameraProjection.value = "Perspective";
  }
}

gamePresetSelect.addEventListener("change", () => {
  exitActivePreset();
  activePreset = gamePresetSelect.value as any;
  updatePresetSubpanels(activePreset);

  if (activePreset === "Default") {
    return;
  }

  const settingsCameraMode = getEl("settings-camera-mode") as HTMLSelectElement | null;
  if (settingsCameraMode) settingsCameraMode.disabled = true;

  if (activePreset === "FPS") {
    world.camera.set("FirstPerson");
    if (settingsCameraMode) settingsCameraMode.value = "FirstPerson";

    // Ensure camera is added to the scene so attached children (the weapon mesh) render
    if (!world.camera.three.parent) {
      world.scene.three.add(world.camera.three);
    }

    if (!gameDrawingSheetMesh) gameDrawingSheetMesh = createDrawingSheetMesh();
    world.camera.three.add(gameDrawingSheetMesh);

    // Scan scene for collision meshes
    updateCollisionMeshes();

    // Adjust height of the camera to ground/base eye level of a 5'8" (1.727m) person
    baseSurfaceY = 0;
    const box = new THREE.Box3();
    let hasModel = false;
    for (const [, model] of fragments.list) {
      if (model && model.object) {
        box.expandByObject(model.object);
        hasModel = true;
      }
    }
    if (hasModel) {
      baseSurfaceY = box.min.y;
    }

    const personHeight = 1.727; // 5'8" in meters
    const eyeHeight = personHeight - 0.1; // Eye level approx 10cm below top of head (~1.627m)
    const targetY = baseSurfaceY + eyeHeight;

    const currentPosition = new THREE.Vector3();
    world.camera.controls.getPosition(currentPosition);

    const forwardDirection = new THREE.Vector3();
    world.camera.three.getWorldDirection(forwardDirection);
    forwardDirection.y = 0;
    forwardDirection.normalize();

    const newEyePos = new THREE.Vector3(currentPosition.x, targetY, currentPosition.z);
    const newTargetPos = newEyePos.clone().add(forwardDirection);

    world.camera.controls.setLookAt(
      newEyePos.x, newEyePos.y, newEyePos.z,
      newTargetPos.x, newTargetPos.y, newTargetPos.z,
      false
    );

    // Apply initial FOV and near clipping plane
    if (world.camera.three instanceof THREE.PerspectiveCamera) {
      world.camera.three.near = 0.1; // Allow close rendering of the weapon
      world.camera.three.fov = Number(fpsFovSlider.value);
      world.camera.three.updateProjectionMatrix();
    }
  } else if (activePreset === "Sports") {
    world.camera.set("Orbit");
    const cameraModeEl = getEl("settings-camera-mode") as HTMLSelectElement | null;
    if (cameraModeEl) cameraModeEl.value = "Orbit";
    world.camera.projection.set("Perspective");
  } else if (activePreset === "Racing") {
    world.camera.set("Orbit");
    const cameraModeEl = getEl("settings-camera-mode") as HTMLSelectElement | null;
    if (cameraModeEl) cameraModeEl.value = "Orbit";
    world.camera.projection.set("Perspective");
    if (!gameCarMesh) gameCarMesh = createCarMesh();
    world.scene.three.add(gameCarMesh);
    carPosition.set(0, 0.01, 0);
    carRotationY = 0;
    carSpeed = 0;
    gameCarMesh.position.copy(carPosition);
    gameCarMesh.rotation.y = carRotationY;

    // Apply initial FOV
    if (world.camera.three instanceof THREE.PerspectiveCamera) {
      world.camera.three.fov = Number(racingFovSlider.value);
      world.camera.three.updateProjectionMatrix();
    }
  } else if (activePreset === "ThirdPerson") {
    world.camera.set("Orbit");
    const cameraModeEl = getEl("settings-camera-mode") as HTMLSelectElement | null;
    if (cameraModeEl) cameraModeEl.value = "Orbit";
    if (!gameCharacterMesh) gameCharacterMesh = createCharacterMesh();
    world.scene.three.add(gameCharacterMesh);
    charPosition.set(0, 0.01, 0);
    charRotationY = 0;
    gameCharacterMesh.position.copy(charPosition);
    gameCharacterMesh.rotation.y = charRotationY;
  }
});

// Update event listeners for sliders
fpsFovSlider.addEventListener("input", () => {
  fpsFovVal.innerText = fpsFovSlider.value;
  if (activePreset === "FPS" && world.camera.three instanceof THREE.PerspectiveCamera) {
    world.camera.three.fov = Number(fpsFovSlider.value);
    world.camera.three.updateProjectionMatrix();
  }
});

sportsHeightSlider.addEventListener("input", () => {
  sportsHeightVal.innerText = Number(sportsHeightSlider.value).toFixed(1);
});

sportsZoomSlider.addEventListener("input", () => {
  sportsZoomVal.innerText = Number(sportsZoomSlider.value).toFixed(1);
});

racingFovSlider.addEventListener("input", () => {
  racingFovVal.innerText = racingFovSlider.value;
  if (activePreset === "Racing" && world.camera.three instanceof THREE.PerspectiveCamera) {
    world.camera.three.fov = Number(racingFovSlider.value);
    world.camera.three.updateProjectionMatrix();
  }
});

tpDistanceSlider.addEventListener("input", () => {
  tpDistanceVal.innerText = Number(tpDistanceSlider.value).toFixed(1);
});

const settingsCameraModeSelect = getEl("settings-camera-mode") as HTMLSelectElement | null;
if (settingsCameraModeSelect) {
  settingsCameraModeSelect.addEventListener("change", async () => {
    const mode = settingsCameraModeSelect.value as "Orbit" | "FirstPerson" | "Plan";

    // Ensure modes map is initialized on camera
    const camAny = world.camera as any;
    if (!camAny._navigationModes.has(mode)) {
      camAny._navigationModes.set("Orbit", new OBC.OrbitMode(world.camera));
      camAny._navigationModes.set("FirstPerson", new OBC.FirstPersonMode(world.camera));
      camAny._navigationModes.set("Plan", new OBC.PlanMode(world.camera));
      camAny._mode = camAny._navigationModes.get("Orbit");
    }

    world.camera.set(mode as any);

    if (mode === "Plan") {
      await world.camera.projection.set("Orthographic");
      const projectionSelect = getEl("settings-camera-projection") as HTMLSelectElement | null;
      if (projectionSelect) projectionSelect.value = "Orthographic";
      updateViewportHint("2D Floorplan Mode Active — Mouse drag to Pan, wheel to Zoom");
    } else if (mode === "Orbit") {
      await world.camera.projection.set("Perspective");
      const projectionSelect = getEl("settings-camera-projection") as HTMLSelectElement | null;
      if (projectionSelect) projectionSelect.value = "Perspective";
      updateViewportHint("3D Orbit Mode Active — Left-drag to Orbit, Right-drag to Pan, Wheel to Zoom");
    } else if (mode === "FirstPerson") {
      await world.camera.projection.set("Perspective");
      const projectionSelect = getEl("settings-camera-projection") as HTMLSelectElement | null;
      if (projectionSelect) projectionSelect.value = "Perspective";
      updateViewportHint("First Person Walkthrough Active — Use WASD keys & Mouse to explore");
    }

    if (world.onCameraChanged) {
      world.onCameraChanged.trigger(world.camera);
    }
    for (const [, model] of fragments.list) {
      if (model && typeof model.useCamera === "function") {
        model.useCamera(world.camera.three);
      }
    }
  });
}

// WASD Keyboard Navigation for First Person Mode
const keyBindings = {
  forward: localStorage.getItem("key-bind-forward") || "w",
  left: localStorage.getItem("key-bind-left") || "a",
  backward: localStorage.getItem("key-bind-backward") || "s",
  right: localStorage.getItem("key-bind-right") || "d",
};

const firstPersonKeys = { forward: false, left: false, backward: false, right: false, up: false, down: false };

// UI Elements for Gaming settings
const toggleWASD = getEl("settings-enable-wasd") as HTMLInputElement;
const wasdSpeedSlider = getEl("settings-wasd-speed") as HTMLInputElement;
const wasdSpeedVal = getEl("val-wasd-speed");
const mouseSensitivitySlider = getEl("settings-mouse-sensitivity") as HTMLInputElement;
const mouseSensitivityVal = getEl("val-mouse-sensitivity");
const keyBindBtns = document.querySelectorAll(".key-bind-btn");

let activeBindingAction: string | null = null;

// Initialize speed and sensitivity values from settings elements
let movementSpeed = Number(wasdSpeedSlider.value);
let mouseSensitivity = Number(mouseSensitivitySlider.value);

wasdSpeedSlider.addEventListener("input", () => {
  movementSpeed = Number(wasdSpeedSlider.value);
  wasdSpeedVal.innerText = movementSpeed.toFixed(2);
});

mouseSensitivitySlider.addEventListener("input", () => {
  mouseSensitivity = Number(mouseSensitivitySlider.value);
  mouseSensitivityVal.innerText = mouseSensitivity.toFixed(1);
  if (world.camera.controls) {
    (world.camera.controls as any).rotateSpeed = mouseSensitivity;
  }
});

// Setup key bind button listeners
keyBindBtns.forEach((btn) => {
  const action = btn.getAttribute("data-action")!;
  // Set initial display text from bindings
  btn.textContent = keyBindings[action as keyof typeof keyBindings].toUpperCase();

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    // Reset all buttons text/state
    keyBindBtns.forEach((b) => {
      const act = b.getAttribute("data-action")!;
      b.textContent = keyBindings[act as keyof typeof keyBindings].toUpperCase();
      b.classList.remove("active");
    });

    activeBindingAction = action;
    btn.textContent = "Press key...";
    btn.classList.add("active");
  });
});

window.addEventListener("keydown", (e) => {
  // If we are actively rebinding a key
  if (activeBindingAction) {
    e.preventDefault();
    e.stopPropagation();
    const newKey = e.key.toLowerCase();

    // Save new binding
    keyBindings[activeBindingAction as keyof typeof keyBindings] = newKey;
    localStorage.setItem(`key-bind-${activeBindingAction}`, newKey);

    // Update button text
    const activeBtn = document.querySelector(`.key-bind-btn[data-action="${activeBindingAction}"]`);
    if (activeBtn) {
      activeBtn.textContent = newKey.toUpperCase();
      activeBtn.classList.remove("active");
    }

    activeBindingAction = null;
    return;
  }

  // Normal keyboard navigation keydown
  if (!toggleWASD.checked) return;

  const activeEl = document.activeElement;
  if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.tagName === "SELECT")) {
    return;
  }

  const pressedKey = e.key.toLowerCase();
  if (pressedKey === keyBindings.forward.toLowerCase()) firstPersonKeys.forward = true;
  if (pressedKey === keyBindings.left.toLowerCase()) firstPersonKeys.left = true;
  if (pressedKey === keyBindings.backward.toLowerCase()) firstPersonKeys.backward = true;
  if (pressedKey === keyBindings.right.toLowerCase()) firstPersonKeys.right = true;
  if (pressedKey === "q" || e.code === "Space") firstPersonKeys.up = true;
  if (pressedKey === "e" || e.key === "Shift") firstPersonKeys.down = true;
});

window.addEventListener("keyup", (e) => {
  if (activeBindingAction) return;

  const pressedKey = e.key.toLowerCase();
  if (pressedKey === keyBindings.forward.toLowerCase()) firstPersonKeys.forward = false;
  if (pressedKey === keyBindings.left.toLowerCase()) firstPersonKeys.left = false;
  if (pressedKey === keyBindings.backward.toLowerCase()) firstPersonKeys.backward = false;
  if (pressedKey === keyBindings.right.toLowerCase()) firstPersonKeys.right = false;
  if (pressedKey === "q" || e.code === "Space") firstPersonKeys.up = false;
  if (pressedKey === "e" || e.key === "Shift") firstPersonKeys.down = false;
});

// Update rotateSpeed on camera controls initialization/change
world.camera.controls.addEventListener("update", () => {
  if (world.camera.controls && (world.camera.controls as any).rotateSpeed !== mouseSensitivity) {
    (world.camera.controls as any).rotateSpeed = mouseSensitivity;
  }
});

let animateFrameCount = 0;
function animateFirstPerson() {
  requestAnimationFrame(animateFirstPerson);

  const controls = world.camera.controls;
  if (!controls) return;

  animateFrameCount++;
  if (animateFrameCount % 60 === 0 && activePreset === "FPS") {
    updateCollisionMeshes();
  }

  if (activePreset !== "Default") {
    // --- FPS Preset Update ---
    if (activePreset === "FPS") {
      const previousPos = new THREE.Vector3();
      controls.getPosition(previousPos);

      const moveDelta = new THREE.Vector3();

      // 1. Calculate manual movement inputs relative to look vector
      if (toggleWASD.checked) {
        const forward = new THREE.Vector3();
        world.camera.three.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        const right = new THREE.Vector3();
        right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

        const speed = movementSpeed;
        if (firstPersonKeys.forward) moveDelta.addScaledVector(forward, speed);
        if (firstPersonKeys.backward) moveDelta.addScaledVector(forward, -speed);
        if (firstPersonKeys.left) moveDelta.addScaledVector(right, -speed);
        if (firstPersonKeys.right) moveDelta.addScaledVector(right, speed);
      }

      const newPos = previousPos.clone().add(moveDelta);

      // Filter collision meshes to exclude glass objects
      const nonGlassMeshes = collisionMeshes.filter((mesh) => !isGlass(mesh));
      const caster = components.get(OBC.Raycasters).get(world);

      // 2. Wall Collisions & Sliding (Filter out stair risers & low steps < 0.55m)
      if (moveDelta.lengthSq() > 0.0001) {
        const playerRadius = 0.40;
        const rayDir = moveDelta.clone().normalize();
        // Cast wall collision ray at chest height (~1.5m above current ground)
        const rayOrigin = new THREE.Vector3(previousPos.x, previousPos.y - 0.1, previousPos.z);

        const hit = caster.castRayFromVector(rayOrigin, rayDir, nonGlassMeshes);

        let hitNormal = new THREE.Vector3();
        let normalFound = false;

        if (hit && hit.distance <= playerRadius + moveDelta.length() && hit.face) {
          // If the obstacle hit point is low (< 0.55m above ground), it's a stair riser/step — ignore wall collision to allow climbing!
          const currentGroundY = previousPos.y - (1.727 - 0.1) - fpsHeightOffset;
          const hitHeightDelta = hit.point ? hit.point.y - currentGroundY : 1.0;

          if (hitHeightDelta > 0.55) {
            hitNormal.copy(hit.face.normal).applyQuaternion(hit.object.getWorldQuaternion(new THREE.Quaternion()));
            normalFound = true;
          }
        }

        if (normalFound) {
          const dot = moveDelta.dot(hitNormal);
          if (dot < 0) {
            // Project movement along wall normal to slide cleanly
            moveDelta.addScaledVector(hitNormal, -dot);
          } else {
            moveDelta.set(0, 0, 0);
          }
          newPos.copy(previousPos).add(moveDelta);
        }
      }

      // 3. Ground, Stairs & Gravity with Auto-Climb & Manual Q/E/Space/Shift Height Adjustment
      if (firstPersonKeys.up) {
        fpsHeightOffset = Math.min(fpsHeightOffset + movementSpeed * 0.18, 15.0);
      }
      if (firstPersonKeys.down) {
        fpsHeightOffset = Math.max(fpsHeightOffset - movementSpeed * 0.18, -3.0);
      }

      // Cast ray downwards from 3.0m above position to catch stair treads & landings
      const rayCastHeight = 3.0;
      const stepLimit = 2.5; // Allow stepping up staircases up to 2.5m height delta
      const downOrigin = new THREE.Vector3(newPos.x, previousPos.y + rayCastHeight, newPos.z);
      const downDir = new THREE.Vector3(0, -1, 0);
      const downHit = caster.castRayFromVector(downOrigin, downDir, nonGlassMeshes);
      let groundY = baseSurfaceY;

      if (downHit && downHit.distance <= 20.0) {
        groundY = downHit.point.y;
      }

      // Forward step probe: predict upcoming stair steps ahead of player position
      if (moveDelta.lengthSq() > 0.0001) {
        const probeOffset = moveDelta.clone().normalize().multiplyScalar(0.45);
        const probeOrigin = new THREE.Vector3(newPos.x + probeOffset.x, previousPos.y + rayCastHeight, newPos.z + probeOffset.z);
        const probeHit = caster.castRayFromVector(probeOrigin, downDir, nonGlassMeshes);
        if (probeHit && probeHit.distance <= 20.0) {
          const probeY = probeHit.point.y;
          const stepDelta = probeY - groundY;
          if (stepDelta > 0.02 && stepDelta <= 0.65) {
            groundY = probeY;
          }
        }
      }

      const personHeight = 1.727; // 5'8"
      const eyeHeight = personHeight - 0.1; // ~1.627m
      const targetCameraY = groundY + eyeHeight + fpsHeightOffset;

      const currentHeight = previousPos.y;
      let nextHeight = currentHeight;

      if (targetCameraY > currentHeight) {
        if (targetCameraY - currentHeight <= stepLimit) {
          nextHeight = THREE.MathUtils.lerp(currentHeight, targetCameraY, 0.45);
        } else {
          // Smoothly elevate camera towards higher floors/ledges
          nextHeight = THREE.MathUtils.lerp(currentHeight, targetCameraY, 0.30);
        }
      } else {
        nextHeight = THREE.MathUtils.lerp(currentHeight, targetCameraY, 0.35);
      }

      newPos.y = nextHeight;

      // Calculate actual world-space displacement vector
      const displacement = new THREE.Vector3().subVectors(newPos, previousPos);

      // Translate both position and target to preserve look rotation without drifting
      if (displacement.lengthSq() > 0.000001) {
        const targetVal = new THREE.Vector3();
        controls.getTarget(targetVal);
        targetVal.add(displacement);
        controls.moveTo(targetVal.x, targetVal.y, targetVal.z, false);
      }

      if (gameDrawingSheetMesh) {
        // Position drawing sheet group relative to camera
        const weaponStyle = fpsWeaponSelect.value;
        const scaleMult = weaponStyle === "Wide" ? 0.75 : 1.0;
        gameDrawingSheetMesh.scale.set(scaleMult, scaleMult, scaleMult);

        // Calculate sheet base position relative to camera view
        const baseOffset = new THREE.Vector3(0, 0, 0);
        if (weaponStyle === "Wide") {
          // Shift sheet lower and further away
          baseOffset.set(0, -0.42, -0.52);
        } else {
          baseOffset.set(0, -0.34, -0.42);
        }

        // Apply shake if enabled
        if (fpsShakeToggle.checked) {
          const isMoving = firstPersonKeys.forward || firstPersonKeys.backward || firstPersonKeys.left || firstPersonKeys.right;
          const shakeFreq = isMoving ? 0.12 : 0.04;
          const shakeAmp = isMoving ? 0.006 : 0.0015;
          fpsShakeTime += shakeFreq;

          fpsShakeOffset.set(
            Math.sin(fpsShakeTime * 2.0) * shakeAmp * 0.7,
            Math.cos(fpsShakeTime * 1.5) * shakeAmp,
            Math.sin(fpsShakeTime * 1.0) * shakeAmp * 0.2
          );

          // Apply shake directly to camera position offset
          world.camera.three.position.x += fpsShakeOffset.x;
          world.camera.three.position.y += fpsShakeOffset.y;

          // Also slightly bounce the drawing sheet
          baseOffset.x += fpsShakeOffset.x * 0.5;
          baseOffset.y += fpsShakeOffset.y * 1.2;
        }

        // Reset local drawing sheet position/rotation so it remains aligned with camera view
        gameDrawingSheetMesh.position.copy(baseOffset);
        // Angle the sheet further forward (X: -0.40) so it looks held at chest level
        gameDrawingSheetMesh.rotation.set(-0.40, 0, 0);
      }
    }

    // --- Sports (Bird's Eye) Update ---
    else if (activePreset === "Sports") {
      const height = Number(sportsHeightSlider.value);
      const zoom = Number(sportsZoomSlider.value);

      // Determine active target (selected element center or origin)
      const target = new THREE.Vector3(0, 0, 0);
      if (activeModelId && activeExpressId) {
        const selectedModel = fragments.list.get(activeModelId);
        if (selectedModel) {
          try {
            const box = new THREE.Box3().setFromObject(selectedModel.object);
            box.getCenter(target);
          } catch (e) {
            // ignore
          }
        }
      }

      // Calculate broadcast view positioning: pull back X/Z, lift Y, and adjust FOV
      const offsetDist = 22 - zoom * 1.8;
      const camPos = new THREE.Vector3(
        target.x + offsetDist,
        target.y + height + 3,
        target.z + offsetDist
      );

      // Force setting the camera matrix lookAt
      controls.setLookAt(camPos.x, camPos.y, camPos.z, target.x, target.y, target.z, false);
    }

    // --- Racing Mode Update ---
    else if (activePreset === "Racing") {
      if (gameCarMesh) {
        // Steering & Throttle physics
        if (firstPersonKeys.forward) {
          carSpeed = Math.min(carSpeed + CAR_ACCEL, CAR_MAX_SPEED);
        } else if (firstPersonKeys.backward) {
          carSpeed = Math.max(carSpeed - CAR_ACCEL, -CAR_MAX_SPEED / 2);
        } else {
          carSpeed *= 0.94; // friction/drag
        }

        if (Math.abs(carSpeed) > 0.01) {
          const steerSign = carSpeed >= 0 ? 1 : -1;
          if (firstPersonKeys.left) {
            carRotationY += CAR_STEER_SPEED * steerSign;
          }
          if (firstPersonKeys.right) {
            carRotationY -= CAR_STEER_SPEED * steerSign;
          }
        }

        const driveDir = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), carRotationY);
        carPosition.addScaledVector(driveDir, carSpeed);

        gameCarMesh.position.copy(carPosition);
        gameCarMesh.rotation.y = carRotationY;

        // Position camera relative to car
        const attachPoint = racingAttachmentSelect.value;
        const camPos = new THREE.Vector3();
        const lookTarget = new THREE.Vector3();

        if (attachPoint === "Bumper") {
          // Camera on bumper looking directly forward
          camPos.set(0, 0.75, 1.65).applyAxisAngle(new THREE.Vector3(0, 1, 0), carRotationY).add(carPosition);
          lookTarget.set(0, 0.75, 5).applyAxisAngle(new THREE.Vector3(0, 1, 0), carRotationY).add(carPosition);
        } else {
          // Camera behind and above hood, looking over
          camPos.set(0, 1.7, -2.4).applyAxisAngle(new THREE.Vector3(0, 1, 0), carRotationY).add(carPosition);
          lookTarget.set(0, 1.1, 3.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), carRotationY).add(carPosition);
        }

        controls.setLookAt(camPos.x, camPos.y, camPos.z, lookTarget.x, lookTarget.y, lookTarget.z, false);
      }
    }

    // --- Third-Person Update ---
    else if (activePreset === "ThirdPerson") {
      if (gameCharacterMesh) {
        const distance = Number(tpDistanceSlider.value);
        const autoFollow = tpAutoFollowToggle.checked;

        // Calculate move vector based on camera direction
        const camDirection = new THREE.Vector3();
        world.camera.three.getWorldDirection(camDirection);
        camDirection.y = 0;
        camDirection.normalize();

        const camRight = new THREE.Vector3();
        camRight.crossVectors(camDirection, new THREE.Vector3(0, 1, 0)).normalize();

        const moveDir = new THREE.Vector3();
        if (firstPersonKeys.forward) moveDir.add(camDirection);
        if (firstPersonKeys.backward) moveDir.addScaledVector(camDirection, -1);
        if (firstPersonKeys.left) moveDir.addScaledVector(camRight, 1);
        if (firstPersonKeys.right) moveDir.addScaledVector(camRight, -1);

        const isMoving = moveDir.lengthSq() > 0.001;
        if (isMoving) {
          moveDir.normalize();
          charPosition.addScaledVector(moveDir, 0.12);
          gameCharacterMesh.position.copy(charPosition);

          // Rotate character to face movement direction
          charRotationY = Math.atan2(moveDir.x, moveDir.z);
          gameCharacterMesh.rotation.y = charRotationY;
        }

        if (autoFollow && isMoving) {
          // Position camera directly behind character
          const backOffset = new THREE.Vector3(0, 1.9, -distance).applyAxisAngle(new THREE.Vector3(0, 1, 0), charRotationY);
          const camPos = charPosition.clone().add(backOffset);

          controls.setLookAt(
            camPos.x, camPos.y, camPos.z,
            charPosition.x, charPosition.y + 0.9, charPosition.z,
            true // Enable interpolation transition for smoothness
          );
        } else {
          // Lock target and let standard camera-controls mouse drag orbit
          controls.moveTo(charPosition.x, charPosition.y + 0.9, charPosition.z, false);

          // Smoothly clamp/dolly to slider distance
          if (Math.abs(controls.distance - distance) > 0.01) {
            controls.distance = distance;
          }
        }
      }
    }
    return;
  }

  // --- Standard WASD Keyboard Navigation (Orbit Mode & FPS) ---
  if (!toggleWASD.checked) return;

  const isAnyWASDPressed = firstPersonKeys.forward || firstPersonKeys.backward || firstPersonKeys.left || firstPersonKeys.right || firstPersonKeys.up || firstPersonKeys.down;
  if (!isAnyWASDPressed) return;

  const cameraModeSelect = getEl("settings-camera-mode") as HTMLSelectElement | null;
  if (cameraModeSelect?.value === "FirstPerson") {
    if (firstPersonKeys.forward) controls.forward(movementSpeed, false);
    if (firstPersonKeys.backward) controls.forward(-movementSpeed, false);
    if (firstPersonKeys.left) controls.truck(-movementSpeed, 0, false);
    if (firstPersonKeys.right) controls.truck(movementSpeed, 0, false);
    if (firstPersonKeys.up) controls.elevate(movementSpeed, false);
    if (firstPersonKeys.down) controls.elevate(-movementSpeed, false);
  } else {
    // Default Orbit mode WASD panning relative to camera look direction
    const forward = new THREE.Vector3();
    world.camera.three.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    const speed = movementSpeed * 0.35;
    const panDelta = new THREE.Vector3();
    if (firstPersonKeys.forward) panDelta.addScaledVector(forward, speed);
    if (firstPersonKeys.backward) panDelta.addScaledVector(forward, -speed);
    if (firstPersonKeys.left) panDelta.addScaledVector(right, -speed);
    if (firstPersonKeys.right) panDelta.addScaledVector(right, speed);
    if (firstPersonKeys.up) panDelta.y += speed;
    if (firstPersonKeys.down) panDelta.y -= speed;

    if (panDelta.lengthSq() > 0.000001) {
      const targetVal = new THREE.Vector3();
      controls.getTarget(targetVal);
      targetVal.add(panDelta);
      controls.moveTo(targetVal.x, targetVal.y, targetVal.z, false);
    }
  }

  // Update real-time HUD overlays
  AnnotationModule.getInstance().updateOverlayPositions();
  if (animateFrameCount % 2 === 0) {
    MinimapHUD.getInstance().update();
  }
}
animateFirstPerson();

const settingsCameraProjection = getEl("settings-camera-projection") as HTMLSelectElement;
if (settingsCameraProjection) {
  settingsCameraProjection.addEventListener("change", async () => {
    const proj = settingsCameraProjection.value as "Perspective" | "Orthographic";
    await world.camera.projection.set(proj as any);
    if (world.onCameraChanged) {
      world.onCameraChanged.trigger(world.camera);
    }
    for (const [, model] of fragments.list) {
      if (model && typeof model.useCamera === "function") {
        model.useCamera(world.camera.three);
      }
    }
  });
}

const settingsCameraInput = getEl("settings-camera-input") as HTMLInputElement;
settingsCameraInput.addEventListener("change", () => {
  world.camera.setUserInput(settingsCameraInput.checked);
});

const btnCameraFit = getEl("btn-camera-fit");
if (btnCameraFit) {
  btnCameraFit.addEventListener("click", async () => {
    await world.camera.fit(world.meshes);
  });
}

// Camera Far Limit Slider
const cameraFarInput = getEl("settings-camera-far") as HTMLInputElement | null;
const cameraFarVal = getEl("val-camera-far");
if (cameraFarInput) {
  cameraFarInput.addEventListener("input", () => {
    const farVal = Number(cameraFarInput.value);
    if (cameraFarVal) cameraFarVal.innerText = `${farVal}m`;

    if (world.camera) {
      if (world.camera.threePersp) {
        world.camera.threePersp.far = farVal;
        world.camera.threePersp.updateProjectionMatrix();
      }
      if (world.camera.threeOrtho) {
        world.camera.threeOrtho.far = farVal;
        world.camera.threeOrtho.updateProjectionMatrix();
      }
      if (world.camera.three) {
        world.camera.three.far = farVal;
        world.camera.three.updateProjectionMatrix();
      }
    }
    if (sceneManager.bluePenPass && sceneManager.bluePenPass.uniforms.cameraFar) {
      sceneManager.bluePenPass.uniforms.cameraFar.value = farVal;
    }
    if (fragments.core) {
      fragments.core.update(true);
    }
  });
}

// Camera Near Limit Slider
const cameraNearInput = getEl("settings-camera-near") as HTMLInputElement | null;
const cameraNearVal = getEl("val-camera-near");
if (cameraNearInput) {
  cameraNearInput.addEventListener("input", () => {
    const nearVal = Number(cameraNearInput.value);
    if (cameraNearVal) cameraNearVal.innerText = `${nearVal.toFixed(2)}m`;

    if (world.camera) {
      if (world.camera.threePersp) {
        world.camera.threePersp.near = nearVal;
        world.camera.threePersp.updateProjectionMatrix();
      }
      if (world.camera.threeOrtho) {
        world.camera.threeOrtho.near = nearVal;
        world.camera.threeOrtho.updateProjectionMatrix();
      }
      if (world.camera.three) {
        world.camera.three.near = nearVal;
        world.camera.three.updateProjectionMatrix();
      }
    }
    if (sceneManager.bluePenPass && sceneManager.bluePenPass.uniforms.cameraNear) {
      sceneManager.bluePenPass.uniforms.cameraNear.value = nearVal;
    }
    if (fragments.core) {
      fragments.core.update(true);
    }
  });
}

// Camera FOV Slider
const cameraFovInput = getEl("settings-camera-fov") as HTMLInputElement | null;
const cameraFovVal = getEl("val-camera-fov");
if (cameraFovInput) {
  cameraFovInput.addEventListener("input", () => {
    const fovVal = Number(cameraFovInput.value);
    if (cameraFovVal) cameraFovVal.innerText = `${fovVal}°`;

    if (world.camera && world.camera.threePersp) {
      world.camera.threePersp.fov = fovVal;
      world.camera.threePersp.updateProjectionMatrix();
    }
    if (fragments.core) {
      fragments.core.update(true);
    }
  });
}

// Zoom & Dolly Speed Slider
const cameraSpeedInput = getEl("settings-camera-speed") as HTMLInputElement | null;
const cameraSpeedVal = getEl("val-camera-speed");
if (cameraSpeedInput) {
  cameraSpeedInput.addEventListener("input", () => {
    const speedVal = Number(cameraSpeedInput.value);
    if (cameraSpeedVal) cameraSpeedVal.innerText = `${speedVal.toFixed(1)}x`;

    if (world.camera && world.camera.controls) {
      (world.camera.controls as any).dollySpeed = speedVal;
      (world.camera.controls as any).zoomSpeed = speedVal;
    }
  });
}

// Exploded Disassembly View Slider & Clustering Mode
const explosionSlider = getEl("settings-explosion-slider") as HTMLInputElement | null;
const explosionVal = getEl("val-explosion-factor");
const explosionModeSelect = getEl("select-explosion-mode") as HTMLSelectElement | null;
const explosionModeBadge = getEl("badge-explosion-mode");

if (explosionModeSelect) {
  explosionModeSelect.addEventListener("change", () => {
    const mode = explosionModeSelect.value as any;
    ExplosionModule.getInstance().setClusteringMode(mode);
    if (explosionModeBadge) {
      if (mode === "category-cluster") explosionModeBadge.textContent = "CATEGORIES";
      else if (mode === "asset-dense-cluster") explosionModeBadge.textContent = "ASSETS";
      else if (mode === "storey-cluster") explosionModeBadge.textContent = "STOREYS";
      else explosionModeBadge.textContent = "RADIAL";
    }
  });
}

if (explosionSlider) {
  explosionSlider.addEventListener("input", () => {
    const factor = Number(explosionSlider.value) / 100;
    if (explosionVal) explosionVal.innerText = `${explosionSlider.value}%`;
    ExplosionModule.getInstance().setExplosionFactor(factor);
  });
}

// Solar Sun Position Analysis Sliders
const sunAzimuthInput = getEl("settings-sun-azimuth") as HTMLInputElement | null;
const sunAzimuthVal = getEl("val-sun-azimuth");
const sunElevationInput = getEl("settings-sun-elevation") as HTMLInputElement | null;
const sunElevationVal = getEl("val-sun-elevation");

const updateSunPosition = () => {
  const azimuthDeg = sunAzimuthInput ? Number(sunAzimuthInput.value) : 135;
  const elevationDeg = sunElevationInput ? Number(sunElevationInput.value) : 45;

  if (sunAzimuthVal) sunAzimuthVal.innerText = `${azimuthDeg}°`;
  if (sunElevationVal) sunElevationVal.innerText = `${elevationDeg}°`;

  const azimuthRad = (azimuthDeg * Math.PI) / 180;
  const elevationRad = (elevationDeg * Math.PI) / 180;
  const dist = 75;

  if (dirLight) {
    dirLight.position.x = dist * Math.cos(elevationRad) * Math.sin(azimuthRad);
    dirLight.position.y = Math.max(0.5, dist * Math.sin(elevationRad));
    dirLight.position.z = dist * Math.cos(elevationRad) * Math.cos(azimuthRad);

    const target = new THREE.Vector3();
    if (world.camera?.controls) {
      world.camera.controls.getTarget(target);
    }
    dirLight.target.position.copy(target);
    dirLight.target.updateMatrixWorld();

    if (dirLight.shadow && dirLight.shadow.camera) {
      dirLight.shadow.camera.updateProjectionMatrix();
    }

    if (world.scene && (world.scene as any).updateShadows) {
      (world.scene as any).updateShadows();
    }
  }
};

if (sunAzimuthInput) sunAzimuthInput.addEventListener("input", updateSunPosition);
if (sunElevationInput) sunElevationInput.addEventListener("input", updateSunPosition);

// 3D Pin Annotation Tool Controller & Sidebar Sync
const toggleAnnotation = getEl("settings-toggle-annotation") as HTMLInputElement | null;
const pinOptionsPanel = getEl("pin-annotation-options");
const pinTitleInput = getEl("pin-title-input") as HTMLInputElement | null;
const pinCommentInput = getEl("pin-comment-input") as HTMLTextAreaElement | null;
const pinCategoryPills = getEl("pin-category-pills");
const pinListContainer = getEl("pin-annotations-list");
const pinsCountSpan = getEl("pins-count");

let activePinCategory = "Inspection";

if (pinCategoryPills) {
  pinCategoryPills.querySelectorAll(".btn-pin-cat").forEach(btn => {
    btn.addEventListener("click", () => {
      pinCategoryPills.querySelectorAll(".btn-pin-cat").forEach(b => {
        (b as HTMLElement).style.background = "var(--bg-input)";
        (b as HTMLElement).style.color = "var(--text-primary)";
        b.classList.remove("active");
      });
      btn.classList.add("active");
      activePinCategory = btn.getAttribute("data-cat") || "Inspection";
      const catColor = AnnotationModule.categoryColors[activePinCategory] || "#3b82f6";
      (btn as HTMLElement).style.background = catColor;
      (btn as HTMLElement).style.color = "#ffffff";

      // Automatically sync input title with selected Category name
      if (pinTitleInput) {
        const val = pinTitleInput.value.trim();
        const defaultNames = ["Inspection Pin", "Defect Pin", "Safety Pin", "RFI Pin", "Sign-off Pin", ""];
        if (defaultNames.includes(val) || val.endsWith(" Pin")) {
          pinTitleInput.value = `${activePinCategory} Pin`;
        }
      }
    });
  });
}

function refreshPinsList(pins: any[]) {
  if (pinsCountSpan) pinsCountSpan.textContent = String(pins.length);
  if (!pinListContainer) return;

  if (pins.length === 0) {
    pinListContainer.innerHTML = `<div style="font-size: 0.6rem; color: var(--text-muted); font-style: italic;">No pins placed yet.</div>`;
    return;
  }

  pinListContainer.innerHTML = pins.map(p => {
    const catColor = p.color || AnnotationModule.categoryColors[p.category] || "#3b82f6";
    return `
      <div class="pin-list-item" data-id="${p.id}" style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-card); border: 1.5px solid #000; padding: 0.25rem 0.4rem; border-radius: 2px; font-size: 0.65rem; cursor: pointer;">
        <div style="display: flex; align-items: center; gap: 0.35rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          <span style="background: ${catColor}; color: #ffffff; width: 15px; height: 15px; border-radius: 50%; border: 1px solid #000; display: inline-flex; align-items: center; justify-content: center; font-size: 0.55rem; font-weight: 900; flex-shrink: 0;">${p.number}</span>
          <span style="font-weight: 800; color: var(--text-primary);">${p.title}</span>
          <span style="font-size: 0.58rem; color: var(--text-muted);">[${p.category}]</span>
        </div>
        <div style="display: flex; gap: 0.2rem; flex-shrink: 0;">
          <button class="btn-goto-pin" data-id="${p.id}" title="Focus camera on pin" style="background: var(--accent-500); color: #ffffff; border: 1px solid #000; border-radius: 2px; font-size: 0.55rem; font-weight: 800; padding: 0.15rem 0.3rem; cursor: pointer;">View</button>
          <button class="btn-del-pin" data-id="${p.id}" title="Delete pin" style="background: #fee2e2; color: #dc2626; border: 1px solid #000; border-radius: 2px; font-size: 0.55rem; font-weight: 800; padding: 0.15rem 0.3rem; cursor: pointer;">✕</button>
        </div>
      </div>
    `;
  }).join("");

  pinListContainer.querySelectorAll(".pin-list-item").forEach(item => {
    item.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".btn-del-pin")) return;
      const id = item.getAttribute("data-id");
      if (id) {
        AnnotationModule.getInstance().selectPin(id);
      }
    });
  });

  pinListContainer.querySelectorAll(".btn-del-pin").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      if (id) AnnotationModule.getInstance().removeAnnotation(id);
    });
  });
}

// Sidebar Selected Pin Details Card Bindings
const selectedPinDetailsSidebar = getEl("selected-pin-details-sidebar");
const sidebarPinNumberBadge = getEl("sidebar-pin-number-badge");
const sidebarPinTitleDisplay = getEl("sidebar-pin-title-display");
const sidebarPinCategoryTag = getEl("sidebar-pin-category-tag");
const sidebarPinElementName = getEl("sidebar-pin-element-name");
const sidebarPinCommentEdit = getEl("sidebar-pin-comment-edit") as HTMLTextAreaElement | null;
const sidebarPinThumbContainer = getEl("sidebar-pin-thumbnail-container");
const sidebarPinThumbImg = getEl("sidebar-pin-thumbnail-img") as HTMLImageElement | null;
const btnSidebarInspectElement = getEl("btn-sidebar-inspect-element");
const btnSidebarSavePin = getEl("btn-sidebar-save-pin");
const btnSidebarFocusPin = getEl("btn-sidebar-focus-pin");
const btnSidebarXRayPin = getEl("btn-sidebar-xray-pin");
const btnSidebarDeletePin = getEl("btn-sidebar-delete-pin");
const pinFilterChips = getEl("pin-filter-chips");
const btnExportPins = getEl("btn-export-pins");

let currentSelectedPin: any = null;

AnnotationModule.getInstance().onPinSelected = (anno) => {
  currentSelectedPin = anno;
  if (!selectedPinDetailsSidebar) return;

  if (!anno) {
    selectedPinDetailsSidebar.style.display = "none";
    return;
  }

  selectedPinDetailsSidebar.style.display = "flex";
  const catColor = anno.color || AnnotationModule.categoryColors[anno.category] || "#3b82f6";

  if (sidebarPinNumberBadge) {
    sidebarPinNumberBadge.textContent = String(anno.number);
    sidebarPinNumberBadge.style.background = catColor;
  }
  if (sidebarPinTitleDisplay) sidebarPinTitleDisplay.textContent = anno.title;
  if (sidebarPinCategoryTag) {
    sidebarPinCategoryTag.textContent = anno.category;
    sidebarPinCategoryTag.style.background = catColor;
  }
  if (sidebarPinElementName) {
    sidebarPinElementName.innerHTML = `<span style="display: inline-flex; align-items: center; gap: 0.25rem;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg> ${anno.elementName || "Scene Anchor"}</span>`;
  }
  if (sidebarPinCommentEdit) {
    sidebarPinCommentEdit.value = anno.comment;
  }

  // Show snapshot thumbnail if available
  if (sidebarPinThumbContainer && sidebarPinThumbImg) {
    if (anno.thumbnail) {
      sidebarPinThumbImg.src = anno.thumbnail;
      sidebarPinThumbContainer.style.display = "block";
    } else {
      sidebarPinThumbContainer.style.display = "none";
    }
  }

  // Update active highlight in pin list
  document.querySelectorAll("#pin-annotations-list .pin-list-item").forEach((item) => {
    const isSelected = item.getAttribute("data-id") === anno.id;
    (item as HTMLElement).style.borderColor = isSelected ? "var(--accent-500, #3b82f6)" : "#000000";
    (item as HTMLElement).style.background = isSelected ? "var(--bg-hover, #e0f2fe)" : "var(--bg-card)";
    if (isSelected) {
      item.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  });
};

if (btnSidebarSavePin) {
  btnSidebarSavePin.addEventListener("click", () => {
    if (!currentSelectedPin || !sidebarPinCommentEdit) return;
    const newComment = sidebarPinCommentEdit.value.trim();
    AnnotationModule.getInstance().updateAnnotation(currentSelectedPin.id, { comment: newComment });
    updateViewportHint(`Updated Pin #${currentSelectedPin.number} notes`);
  });
}

if (btnSidebarFocusPin) {
  btnSidebarFocusPin.addEventListener("click", () => {
    if (!currentSelectedPin) return;
    AnnotationModule.getInstance().focusOnAnnotation(currentSelectedPin.id);
  });
}

if (btnSidebarXRayPin) {
  btnSidebarXRayPin.addEventListener("click", () => {
    AnnotationModule.getInstance().toggleXRay();
    if (currentSelectedPin) {
      AnnotationModule.getInstance().selectAndHighlightTaggedElement(currentSelectedPin);
    }
    const isXRay = AnnotationModule.getInstance().isXRayActive;
    btnSidebarXRayPin.style.background = isXRay ? "var(--accent-500)" : "var(--bg-card)";
    btnSidebarXRayPin.style.color = isXRay ? "#ffffff" : "var(--text-primary)";
    updateViewportHint(isXRay ? "X-Ray Isolation Mode ON" : "X-Ray Isolation Mode OFF");
  });
}

if (btnSidebarDeletePin) {
  btnSidebarDeletePin.addEventListener("click", () => {
    if (!currentSelectedPin) return;
    AnnotationModule.getInstance().removeAnnotation(currentSelectedPin.id);
    if (selectedPinDetailsSidebar) selectedPinDetailsSidebar.style.display = "none";
  });
}

if (btnSidebarInspectElement) {
  btnSidebarInspectElement.addEventListener("click", () => {
    if (!currentSelectedPin || !currentSelectedPin.modelId || currentSelectedPin.expressId === undefined) return;
    AnnotationModule.getInstance().selectAndHighlightTaggedElement(currentSelectedPin);
    if (typeof (window as any).switchSidebarTab === "function") {
      (window as any).switchSidebarTab("right-tab-bar", "inspector");
    }
  });
}

// Category Filter Chips
if (pinFilterChips) {
  pinFilterChips.querySelectorAll(".btn-filter-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      pinFilterChips.querySelectorAll(".btn-filter-chip").forEach(c => {
        (c as HTMLElement).style.background = "var(--bg-input)";
        (c as HTMLElement).style.color = "var(--text-primary)";
        c.classList.remove("active");
      });
      chip.classList.add("active");
      const filter = chip.getAttribute("data-filter") || "All";
      const activeColor = filter === "All" ? "var(--accent-500)" : (AnnotationModule.categoryColors[filter] || "var(--accent-500)");
      (chip as HTMLElement).style.background = activeColor;
      (chip as HTMLElement).style.color = "#ffffff";
      AnnotationModule.getInstance().setFilterCategory(filter);
      updateViewportHint(`Filtered pins: ${filter}`);
    });
  });
}

// BCF Export Button
if (btnExportPins) {
  btnExportPins.addEventListener("click", () => {
    AnnotationModule.getInstance().exportBCFJSON();
    updateViewportHint("Exported BIM Field Issues Report (BCF/JSON)");
  });
}

AnnotationModule.getInstance().onPinsUpdated = (pins) => {
  refreshPinsList(pins);
};

if (toggleAnnotation) {
  toggleAnnotation.addEventListener("change", () => {
    const active = toggleAnnotation.checked;
    AnnotationModule.getInstance().enablePinCreation(active);
    if (pinOptionsPanel) {
      pinOptionsPanel.style.display = active ? "flex" : "none";
    }
    if (active) {
      updateViewportHint("📌 Click on any 3D element to drop a Pin Annotation marker");
    }
  });
}

const btnClearAnnotations = getEl("btn-clear-annotations");
if (btnClearAnnotations) {
  btnClearAnnotations.addEventListener("click", () => {
    AnnotationModule.getInstance().clearAll();
  });
}

// Section Box Multi-Plane Clipping
const toggleSectionBox = getEl("settings-toggle-section-box") as HTMLInputElement | null;
const sectionBoxControls = getEl("section-box-controls");
const sectionBoxYMaxInput = getEl("section-box-ymax") as HTMLInputElement | null;

if (toggleSectionBox) {
  toggleSectionBox.addEventListener("change", () => {
    const active = toggleSectionBox.checked;
    clipping.setSectionBoxEnabled(active);
    if (sectionBoxControls) {
      sectionBoxControls.style.display = active ? "flex" : "none";
    }
  });
}

if (sectionBoxYMaxInput) {
  sectionBoxYMaxInput.addEventListener("input", () => {
    const yMax = Number(sectionBoxYMaxInput.value);
    clipping.updateSectionBoxBounds(-50, 50, -10, yMax, -50, 50);
  });
}

function resolveElementTag(expressId: number): string {
  try {
    const cats = classifier.list.get("Categories");
    if (cats) {
      for (const [catName, group] of cats) {
        for (const [, idSet] of (group as any).map) {
          if (idSet.has(expressId)) return `${catName} #${expressId}`;
        }
      }
    }
  } catch (e) {
    // fallback
  }
  return `IfcElement #${expressId}`;
}

// Direct Button to drop pin on currently selected element or camera target
const btnDropPinHere = getEl("btn-drop-pin-here");
if (btnDropPinHere) {
  btnDropPinHere.addEventListener("click", () => {
    const annoMod = AnnotationModule.getInstance();
    let targetPos = new THREE.Vector3();
    let taggedModelId: string | undefined = undefined;
    let taggedExpressId: number | undefined = undefined;
    let taggedElementName: string | undefined = undefined;

    if (activeExpressId !== null && activeModelId) {
      taggedModelId = activeModelId;
      taggedExpressId = activeExpressId;
      taggedElementName = resolveElementTag(activeExpressId);
    }

    world.camera.controls.getTarget(targetPos);
    const userVal = pinTitleInput?.value.trim();
    const isGeneric = !userVal || userVal.endsWith(" Pin") || ["Inspection", "Defect", "Safety", "RFI", "Sign-off"].some(c => userVal === `${c} Pin` || userVal === c);
    const title = (!isGeneric && userVal) ? userVal : `${activePinCategory} Pin`;
    const comment = pinCommentInput?.value.trim() || `Field notes recorded for ${activePinCategory.toLowerCase()} assessment.`;
    annoMod.addAnnotation(targetPos, title, comment, activePinCategory, taggedModelId, taggedExpressId, taggedElementName);
    updateViewportHint(`✓ Tagged 3D Pin to ${taggedElementName || 'Model'}: "${title}" (${activePinCategory})`);
  });
}

// Canvas Pointer Events for 3D Pin Annotations
let pinPointerDownPos = { x: 0, y: 0, time: 0 };
container.addEventListener("pointerdown", (e: PointerEvent) => {
  pinPointerDownPos = { x: e.clientX, y: e.clientY, time: Date.now() };
});

const placePinAtMousePosition = async (clientX: number, clientY: number) => {
  const annoMod = AnnotationModule.getInstance();
  if (!annoMod.enabled) return;

  const rect = container.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  );

  let hitPoint: THREE.Vector3 | null = null;
  let taggedModelId: string | undefined = undefined;
  let taggedExpressId: number | undefined = undefined;
  let taggedElementName: string | undefined = undefined;

  // 1. Try ThatOpen Raycaster against BIM elements
  try {
    const caster = components.get(OBC.Raycasters).get(world);
    const result = (await caster.castRay()) as any;
    if (result && result.point) {
      hitPoint = result.point.clone();
      if (result.fragments?.modelId && result.localId !== undefined) {
        taggedModelId = result.fragments.modelId;
        taggedExpressId = result.localId;
        if (typeof taggedExpressId === "number") {
          taggedElementName = resolveElementTag(taggedExpressId);
        }
      }
    }
  } catch (err) {
    // fallback
  }

  // 2. Try standard Three.js raycasting against fragment geometry
  if (!hitPoint) {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, world.camera.three);

    const meshes: THREE.Mesh[] = [];
    for (const [, model] of fragments.list) {
      if (model && model.object) {
        model.object.traverse((child: any) => {
          if (child.isMesh) meshes.push(child);
        });
      }
    }

    const intersects = raycaster.intersectObjects(meshes, true);
    if (intersects.length > 0) {
      hitPoint = intersects[0].point;
      if (activeExpressId !== null && activeModelId) {
        taggedModelId = activeModelId;
        taggedExpressId = activeExpressId;
        taggedElementName = resolveElementTag(activeExpressId);
      }
    } else {
      const target = new THREE.Vector3();
      world.camera.controls.getTarget(target);
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -target.y);
      const planeHit = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(plane, planeHit)) {
        hitPoint = planeHit;
      } else {
        hitPoint = target;
      }
    }
  }

  if (hitPoint) {
    const userVal = pinTitleInput?.value.trim();
    const isGeneric = !userVal || userVal.endsWith(" Pin") || ["Inspection", "Defect", "Safety", "RFI", "Sign-off"].some(c => userVal === `${c} Pin` || userVal === c);
    const title = (!isGeneric && userVal) ? userVal : `${activePinCategory} Pin`;
    const comment = pinCommentInput?.value.trim() || `Field notes recorded on 3D geometry for ${activePinCategory.toLowerCase()}.`;
    annoMod.addAnnotation(hitPoint, title, comment, activePinCategory, taggedModelId, taggedExpressId, taggedElementName);
    updateViewportHint(`✓ Tagged 3D Pin to ${taggedElementName || 'Surface'}: "${title}" (${activePinCategory})`);
  }
};

container.addEventListener("pointerup", (e: PointerEvent) => {
  const dist = Math.hypot(e.clientX - pinPointerDownPos.x, e.clientY - pinPointerDownPos.y);
  const duration = Date.now() - pinPointerDownPos.time;
  if (dist < 8 && duration < 600) {
    // 1. First check if clicked on an existing 3D Pin Mesh in scene
    const annoMod = AnnotationModule.getInstance();
    const pinsGroup = (annoMod as any).pinsGroup as THREE.Group | undefined;
    if (pinsGroup && pinsGroup.children.length > 0) {
      const rect = container.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      const pinRaycaster = new THREE.Raycaster();
      pinRaycaster.setFromCamera(mouse, world.camera.three);
      const pinIntersects = pinRaycaster.intersectObjects(pinsGroup.children, true);
      if (pinIntersects.length > 0) {
        let current: THREE.Object3D | null = pinIntersects[0].object;
        while (current && !current.userData?.annotationId && current !== pinsGroup) {
          current = current.parent;
        }
        if (current?.userData?.annotationId) {
          annoMod.selectPin(current.userData.annotationId);
          return;
        }
      }
    }

    // 2. If pin creation tool is active, drop a new pin
    placePinAtMousePosition(e.clientX, e.clientY);
  }
});

// --- TAPE MEASURE BINDINGS ---
const settingsToggleMeasure = getEl("settings-toggle-measure") as HTMLInputElement;
settingsToggleMeasure.addEventListener("change", () => {
  measurements.enabled = settingsToggleMeasure.checked;
});

container.addEventListener("click", () => {
  if (measurements.enabled) {
    measurements.create();
  }
});

window.addEventListener("keydown", (e) => {
  if (measurements.enabled) {
    if (e.key === "Escape") {
      measurements.cancelCreation();
    } else if (e.key === "Delete" || e.key === "Backspace") {
      measurements.delete();
    }
  }
});

const btnClearMeasurements = getEl("btn-clear-measurements");
if (btnClearMeasurements) {
  btnClearMeasurements.addEventListener("click", () => {
    measurements.list.clear();
    measurements.cancelCreation();
  });
}

// --- BCF ISSUE MANAGEMENT BINDINGS ---
const btnCreateBcfTopic = getEl("btn-create-bcf-topic");
if (btnCreateBcfTopic) {
  btnCreateBcfTopic.addEventListener("click", () => {
    const titleInput = getEl("bcf-topic-title") as HTMLInputElement | null;
    const descInput = getEl("bcf-topic-desc") as HTMLTextAreaElement | null;
    const typeSelect = getEl("bcf-topic-type") as HTMLSelectElement | null;
    const prioritySelect = getEl("bcf-topic-priority") as HTMLSelectElement | null;

    const title = titleInput?.value.trim() || "Untitled Issue";
    const description = descInput?.value.trim() || "Reported from 3D BIM Viewer";
    const type = typeSelect?.value || "Coordination";
    const priority = prioritySelect?.value || "Normal";

    bcfManager.createTopic({
      title,
      description,
      type,
      priority,
      status: "Active",
    });

    if (titleInput) titleInput.value = "";
    if (descInput) descInput.value = "";

    const originalText = btnCreateBcfTopic.innerHTML;
    btnCreateBcfTopic.innerHTML = `<span>✓ Issue Logged!</span>`;
    setTimeout(() => { btnCreateBcfTopic.innerHTML = originalText; }, 1500);
  });
}

const btnExportBcf = getEl("btn-export-bcf");
if (btnExportBcf) {
  btnExportBcf.addEventListener("click", async () => {
    await bcfManager.exportBCF();
  });
}

// --- DYNAMIC CATEGORY COLORING & THEME MAPPING ---
const categoryMaterialCache = new Map<string, THREE.MeshStandardMaterial>();

async function applyCategoryColors() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'cozy';
  const categoriesGroup = classifier.list.get("Categories");
  if (!categoriesGroup) return;

  for (const [categoryName, groupData] of categoriesGroup) {
    if (!groupData || typeof groupData.get !== "function") continue;
    const colorHex = getCategoryColor(currentTheme, categoryName);
    
    let material = categoryMaterialCache.get(colorHex);
    if (!material) {
      material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(colorHex),
        roughness: 0.4,
        metalness: 0.1,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
      categoryMaterialCache.set(colorHex, material);
    }

    const map = await groupData.get();
    if (!map) continue;

    for (const modelId in map) {
      const model = fragments.list.get(modelId);
      if (!model) continue;

      const expressIds = map[modelId];
      if (!expressIds || expressIds.size === 0) continue;

      try {
        // Use fragment material styling or fallback if supported
        if ((model as any).setMaterial) {
          (model as any).setMaterial(expressIds, material);
        }
      } catch (err) {
        console.warn(`Category color application skipped for ${categoryName}:`, err);
      }
    }
  }
}
(window as any).applyCategoryColors = applyCategoryColors;

// --- DYNAMIC CLASSIFICATION TREE BINDINGS ---
async function updateClassificationUI() {
  const treeContainer = getEl("classification-tree");
  if (!treeContainer) return;
  treeContainer.innerHTML = "";

  if (fragments.list.size === 0) {
    treeContainer.innerHTML = `
      <div class="empty-state-container" style="padding: 2rem 1rem; text-align: center;">
        <span class="empty-state-text" style="font-size: 0.75rem; color: var(--text-dim);">Load a model to view categories and storeys classification.</span>
      </div>
    `;
    return;
  }

  for (const [classificationName, groups] of classifier.list) {
    const classificationNode = document.createElement("div");
    classificationNode.className = "tree-node";

    const header = document.createElement("div");
    header.className = "tree-node-header";
    header.innerHTML = `
      <span class="tree-arrow">▼</span>
      <span class="tree-icon">📂</span>
      <span class="tree-label">${classificationName}</span>
    `;
    classificationNode.appendChild(header);

    const childrenContainer = document.createElement("div");
    childrenContainer.className = "tree-node-children";

    let hasGroups = false;
    for (const [groupName, groupData] of groups) {
      hasGroups = true;
      const leaf = document.createElement("div");
      leaf.className = "tree-node-leaf";

      const icon = classificationName === "Categories"
        ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`
        : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 9h1M9 13h1M9 17h1M14 9h1M14 13h1M14 17h1"/></svg>`;

      leaf.innerHTML = `
        <span class="tree-bullet">•</span>
        <span class="tree-icon" style="display: inline-flex; align-items: center;">${icon}</span>
        <span class="tree-label">${groupName}</span>
      `;

      leaf.addEventListener("click", async () => {
        const hider = components.get(OBC.Hider);

        if (leaf.classList.contains("active")) {
          leaf.classList.remove("active");
          await hider.set(true);
          return;
        }

        document.querySelectorAll(".tree-node-leaf").forEach(el => el.classList.remove("active"));
        leaf.classList.add("active");

        const map = await groupData.get();
        await hider.isolate(map);

        try {
          const boundingBoxer = components.get(OBC.BoundingBoxer);
          boundingBoxer.list.clear();
          await boundingBoxer.addFromModelIdMap(map);
          const box = boundingBoxer.get();
          await world.camera.controls.fitToBox(box, true);
          boundingBoxer.list.clear();
        } catch (err) {
          console.warn("Fit to group failed:", err);
        }
      });

      childrenContainer.appendChild(leaf);
    }

    if (hasGroups) {
      classificationNode.appendChild(childrenContainer);
      treeContainer.appendChild(classificationNode);

      header.addEventListener("click", () => {
        const arrow = header.querySelector(".tree-arrow") as HTMLElement;
        if (childrenContainer.style.display === "none") {
          childrenContainer.style.display = "block";
          arrow.innerText = "▼";
        } else {
          childrenContainer.style.display = "none";
          arrow.innerText = "▶";
        }
      });
    }
  }
  // Sync Item Finder queries with newly populated category classification
  updateItemFinderQueries();
}

// Scene search filtering for classification tree
const sceneSearchInput = getEl("scene-search") as HTMLInputElement;
if (sceneSearchInput) {
  sceneSearchInput.addEventListener("input", () => {
    const filterText = sceneSearchInput.value.toLowerCase();
    const leafNodes = document.querySelectorAll("#classification-tree .tree-node-leaf");
    leafNodes.forEach((leaf) => {
      const label = leaf.querySelector(".tree-label")?.textContent?.toLowerCase() || "";
      if (label.includes(filterText)) {
        (leaf as HTMLElement).style.display = "flex";
      } else {
        (leaf as HTMLElement).style.display = "none";
      }
    });
  });
}

// --- 4D CONSTRUCTION TIMELINE SIMULATION ENGINE ---
const timelineSlider = getEl("timeline-slider") as HTMLInputElement | null;
const timelinePlayBtn = getEl("timeline-play-btn");
const timelineSpeedSelect = getEl("timeline-speed") as HTMLSelectElement | null;

function calculateTimelineBounds() {
  let minTime = Infinity;
  let maxTime = -Infinity;
  let hasDates = false;

  for (const [, model] of fragments.list) {
    const anyModel = model as any;
    const modelId = anyModel.modelId || anyModel.uuid || anyModel.id || anyModel.object?.uuid || "default-model";
    const properties = anyModel.properties || anyModel.getLocalProperties?.() || {};

    for (const expressIdStr in properties) {
      const expressId = Number(expressIdStr);
      if (isNaN(expressId)) continue;

      const elementProps = properties[expressId];
      if (!elementProps) continue;

      const ifcType = String(elementProps.type ?? "").toUpperCase();
      const twinData = getOrGenerateTwinData(modelId, expressId, ifcType);

      if (twinData.startDate) {
        const start = new Date(twinData.startDate).getTime();
        if (start < minTime) minTime = start;
        hasDates = true;
      }
      if (twinData.endDate) {
        const end = new Date(twinData.endDate).getTime();
        if (end > maxTime) maxTime = end;
        hasDates = true;
      }
    }
  }

  if (hasDates && minTime !== Infinity && maxTime !== -Infinity) {
    timelineMinDate = new Date(minTime);
    timelineMaxDate = new Date(maxTime);

    // Add buffer: 1 day before start, 1 day after end
    timelineMinDate.setDate(timelineMinDate.getDate() - 1);
    timelineMaxDate.setDate(timelineMaxDate.getDate() + 1);

    currentTimelineDate = new Date(timelineMinDate);

    // Enable inputs
    const slider = getEl("timeline-slider") as HTMLInputElement;
    const playBtn = getEl("timeline-play-btn");

    if (slider) {
      slider.removeAttribute("disabled");
      const diffDays = Math.ceil((timelineMaxDate.getTime() - timelineMinDate.getTime()) / (1000 * 60 * 60 * 24));
      slider.max = String(diffDays);
      slider.value = "0";
    }
    if (playBtn) {
      playBtn.removeAttribute("disabled");
    }

    updateTimelineDateUI();
    updateTimelineVisualState();
  } else {
    // Generate default sample construction schedule bounds (60 days) so Play button & timeline scrubber are always active
    const start = new Date("2026-06-18");
    const end = new Date("2026-08-18");
    timelineMinDate = start;
    timelineMaxDate = end;
    currentTimelineDate = new Date(start);

    const slider = getEl("timeline-slider") as HTMLInputElement;
    const playBtn = getEl("timeline-play-btn");

    if (slider) {
      slider.removeAttribute("disabled");
      const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      slider.max = String(diffDays);
      slider.value = "0";
    }
    if (playBtn) {
      playBtn.removeAttribute("disabled");
    }

    updateTimelineDateUI();
    updateTimelineVisualState();
  }
}

function updateTimelineDateUI() {
  if (!currentTimelineDate) return;
  const badge = getEl("timeline-date-badge");
  if (badge) {
    const year = currentTimelineDate.getFullYear();
    const month = String(currentTimelineDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentTimelineDate.getDate()).padStart(2, '0');
    badge.innerText = `${year}-${month}-${day}`;
  }
}

async function updateTimelineVisualState() {
  if (!currentTimelineDate) return;
  if (!is4dMode) return;

  const hider = components.get(OBC.Hider);

  // Clear previous timeline highlighting
  await highlighter.clear("timeline-planned");
  await highlighter.clear("timeline-inprogress");
  await highlighter.clear("timeline-completed");

  // Sync highlighter colors dynamically with color pickers / statusColors
  const plannedColor = (getEl("4d-color-planned") as HTMLInputElement)?.value || ScheduleManager.statusColors['Planned'] || "#6b7280";
  const activeColor = (getEl("4d-color-active") as HTMLInputElement)?.value || ScheduleManager.statusColors['In Progress'] || "#f59e0b";
  const completeColor = (getEl("4d-color-complete") as HTMLInputElement)?.value || ScheduleManager.statusColors['Completed'] || "#10b981";

  const plannedStyle = highlighter.styles.get("timeline-planned");
  if (plannedStyle) plannedStyle.color.set(plannedColor);

  const activeStyle = highlighter.styles.get("timeline-inprogress");
  if (activeStyle) activeStyle.color.set(activeColor);

  const completeStyle = highlighter.styles.get("timeline-completed");
  if (completeStyle) completeStyle.color.set(completeColor);

  const plannedMap: Record<string, Set<number>> = {};
  const inProgressMap: Record<string, Set<number>> = {};
  const completedMap: Record<string, Set<number>> = {};

  let hasPlanned = false;
  let hasInProgress = false;
  let hasCompleted = false;

  for (const [, model] of fragments.list) {
    const anyModel = model as any;
    const modelId = anyModel.modelId || anyModel.uuid || anyModel.id || anyModel.object?.uuid || "default-model";
    const properties = anyModel.properties || anyModel.getLocalProperties?.() || {};

    const plannedIds = new Set<number>();
    const inProgressIds = new Set<number>();
    const completedIds = new Set<number>();

    for (const expressIdStr in properties) {
      const expressId = Number(expressIdStr);
      if (isNaN(expressId)) continue;

      const elementProps = properties[expressId];
      if (!elementProps) continue;

      const ifcType = String(elementProps.type ?? "").toUpperCase();
      const twinData = getOrGenerateTwinData(modelId, expressId, ifcType);

      const start = new Date(twinData.startDate);
      const end = new Date(twinData.endDate);

      // Compare dates (midnight boundary)
      const currentMs = currentTimelineDate.getTime();
      const startMs = start.getTime();
      const endMs = end.getTime();

      let status: "Planned" | "In Progress" | "Completed" = "Planned";
      if (currentMs < startMs) {
        plannedIds.add(expressId);
        status = "Planned";
      } else if (currentMs >= startMs && currentMs <= endMs) {
        inProgressIds.add(expressId);
        status = "In Progress";
      } else {
        completedIds.add(expressId);
        status = "Completed";
      }

      // Dynamic 4D properties update — preserve user-customized statuses
      if (!twinData.isCustomized) {
        twinData.status = status;
      }
    }

    if (plannedIds.size > 0) {
      plannedMap[modelId] = plannedIds;
      hasPlanned = true;
    }
    if (inProgressIds.size > 0) {
      inProgressMap[modelId] = inProgressIds;
      hasInProgress = true;
    }
    if (completedIds.size > 0) {
      completedMap[modelId] = completedIds;
      hasCompleted = true;
    }
  }

  // Update visibility & highlight with status colors
  if (hasPlanned) {
    await hider.set(false, plannedMap);
  }
  if (hasInProgress) {
    await hider.set(true, inProgressMap);
    await highlighter.highlightByID("timeline-inprogress", inProgressMap, false, false);
  }
  if (hasCompleted) {
    await hider.set(true, completedMap);
    await highlighter.highlightByID("timeline-completed", completedMap, false, false);
  }

  // Sync selected element inputs dynamically if properties panel is open for it
  if (activeModelId && activeExpressId !== null) {
    const selectedModel = fragments.list.get(activeModelId) as any;
    if (selectedModel && selectedModel.properties && selectedModel.properties[activeExpressId]) {
      const ifcType = String(selectedModel.properties[activeExpressId].type ?? "").toUpperCase();
      const twinData = getOrGenerateTwinData(activeModelId, activeExpressId, ifcType);

      const elStatus = getEl("sched-status") as HTMLSelectElement;
      if (elStatus) elStatus.value = twinData.status;

      const elCostTotal = getEl("cost-calculated-total");
      if (elCostTotal) elCostTotal.innerText = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD"
      }).format(twinData.calculatedCost);
    }
  }

  // Update real-time stats and timeline progress bar on dashboard
  updateDashboardMetrics();
  updateScheduleWidgetUI();

  fragments.core.update(true);
}

function updateScheduleWidgetUI() {
  const container = getEl("schedule-tasks-list");
  if (!container) return;

  if (fragments.list.size === 0) {
    container.innerHTML = `<div class="empty-state">Load a model to view the construction schedule.</div>`;
    return;
  }

  // Aggregate stats per task name
  const taskStats: Record<string, {
    startDate: string;
    endDate: string;
    totalCount: number;
    completedCount: number;
    modelIdMaps: Record<string, Set<number>>;
  }> = {};

  for (const [, model] of fragments.list) {
    const anyModel = model as any;
    const modelId = anyModel.modelId || anyModel.uuid || anyModel.id || anyModel.object?.uuid || "default-model";
    const properties = anyModel.properties || anyModel.getLocalProperties?.() || {};

    for (const expressIdStr in properties) {
      const expressId = Number(expressIdStr);
      if (isNaN(expressId)) continue;

      const elementProps = properties[expressId];
      if (!elementProps) continue;

      const ifcType = String(elementProps.type ?? "").toUpperCase();
      const twinData = getOrGenerateTwinData(modelId, expressId, ifcType);

      const taskName = twinData.task;
      if (!taskStats[taskName]) {
        taskStats[taskName] = {
          startDate: twinData.startDate,
          endDate: twinData.endDate,
          totalCount: 0,
          completedCount: 0,
          modelIdMaps: {},
        };
      }

      const stats = taskStats[taskName];
      stats.totalCount++;
      if (twinData.status === "Completed") {
        stats.completedCount++;
      }

      // Update min/max dates
      if (new Date(twinData.startDate) < new Date(stats.startDate)) {
        stats.startDate = twinData.startDate;
      }
      if (new Date(twinData.endDate) > new Date(stats.endDate)) {
        stats.endDate = twinData.endDate;
      }

      // Add to model map for isolation
      if (!stats.modelIdMaps[modelId]) {
        stats.modelIdMaps[modelId] = new Set<number>();
      }
      stats.modelIdMaps[modelId].add(expressId);
    }
  }

  container.innerHTML = "";

  // Sort tasks by start date
  const sortedTasks = Object.entries(taskStats).sort((a, b) => {
    return new Date(a[1].startDate).getTime() - new Date(b[1].startDate).getTime();
  });

  for (const [taskName, stats] of sortedTasks) {
    const item = document.createElement("div");
    item.className = "schedule-task-item";

    // Determine overall task status
    let taskStatus: "Planned" | "In Progress" | "Completed" = "Planned";
    if (stats.completedCount === stats.totalCount) {
      taskStatus = "Completed";
    } else if (stats.completedCount > 0) {
      taskStatus = "In Progress";
    }

    // Check if the current timeline date is within this task's date range
    if (currentTimelineDate) {
      const currentMs = currentTimelineDate.getTime();
      const startMs = new Date(stats.startDate).getTime();
      const endMs = new Date(stats.endDate).getTime();
      if (currentMs >= startMs && currentMs <= endMs) {
        item.classList.add("active-task");
      }
    }

    const pct = Math.round((stats.completedCount / stats.totalCount) * 100);
    const badgeClass = taskStatus === "Completed" ? "task-badge-complete" : (taskStatus === "In Progress" ? "task-badge-active" : "task-badge-planned");

    item.innerHTML = `
      <div class="task-header-row">
        <span class="task-title" title="${taskName}">${taskName}</span>
        <span class="task-status-badge ${badgeClass}">${taskStatus}</span>
      </div>
      <div class="task-date-info">
        <span>Start: ${stats.startDate}</span>
        <span>End: ${stats.endDate}</span>
      </div>
      <div class="task-progress-row">
        <div class="task-progress-bar">
          <div class="task-progress-fill" style="width: ${pct}%"></div>
        </div>
        <span>${pct}% (${stats.completedCount}/${stats.totalCount})</span>
      </div>
    `;

    // Click event to isolate task elements and jump scrubber/timeline to task start date!
    item.addEventListener("click", async () => {
      // Isolate elements
      const hider = components.get(OBC.Hider);
      await hider.isolate(stats.modelIdMaps);

      // Focus Camera on isolated elements
      try {
        const boundingBoxer = components.get(OBC.BoundingBoxer);
        boundingBoxer.list.clear();
        await boundingBoxer.addFromModelIdMap(stats.modelIdMaps);
        const box = boundingBoxer.get();
        await world.camera.controls.fitToBox(box, true);
        boundingBoxer.list.clear();
      } catch (err) {
        console.warn("Fit to task elements failed:", err);
      }

      // Jump timeline scrubber to task's start date
      if (timelineMinDate) {
        const taskStart = new Date(stats.startDate);
        currentTimelineDate = new Date(taskStart);
        const diffMs = currentTimelineDate.getTime() - timelineMinDate.getTime();
        const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
        if (timelineSlider) {
          timelineSlider.value = String(diffDays);
        }

        updateTimelineDateUI();
        await updateTimelineVisualState();
      }

      // Auto-collapse sidebar drawer on mobile for direct viewport visibility
      if (window.innerWidth <= 1024) {
        if (typeof (window as any).closeAllSidebars === 'function') {
          (window as any).closeAllSidebars();
        }
      }
    });

    container.appendChild(item);
  }
}

function startTimelinePlayback() {
  if (timelineIsPlaying || !timelineMinDate) return;
  timelineIsPlaying = true;
  if (timelinePlayBtn) {
    timelinePlayBtn.classList.add("playing");
    timelinePlayBtn.innerHTML = `
      <span class="ctrl-icon">⏸</span>
      <span>Pause Simulation</span>
    `;
  }

  let lastTime = performance.now();
  const tick = () => {
    if (!timelineIsPlaying || !timelineMinDate || !timelineMaxDate || !currentTimelineDate) return;

    const now = performance.now();
    const elapsedSec = (now - lastTime) / 1000;
    lastTime = now;

    // Increment date based on speed (days per second)
    const daysToIncrement = elapsedSec * timelineSpeed;
    const newMs = currentTimelineDate.getTime() + (daysToIncrement * 24 * 60 * 60 * 1000);

    if (newMs >= timelineMaxDate.getTime()) {
      currentTimelineDate = new Date(timelineMaxDate);
      if (timelineSlider) {
        timelineSlider.value = timelineSlider.max;
      }
      updateTimelineDateUI();
      updateTimelineVisualState();
      stopTimelinePlayback();
    } else {
      currentTimelineDate = new Date(newMs);
      const diffMs = currentTimelineDate.getTime() - timelineMinDate.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (timelineSlider) {
        timelineSlider.value = String(diffDays);
      }
      updateTimelineDateUI();
      updateTimelineVisualState();
      timelineTimer = requestAnimationFrame(tick);
    }
  };

  timelineTimer = requestAnimationFrame(tick);
}

function stopTimelinePlayback() {
  timelineIsPlaying = false;
  if (timelineTimer) {
    cancelAnimationFrame(timelineTimer);
    timelineTimer = null;
  }
  const btn = getEl("timeline-play-btn");
  if (btn) {
    btn.classList.remove("playing");
    btn.innerHTML = `
      <span class="ctrl-icon">▶</span>
      <span>Play Simulation</span>
    `;
  }
}

// Scrubber events
if (timelineSlider) {
  timelineSlider.addEventListener("input", () => {
    if (!timelineMinDate) return;
    const daysOffset = Number(timelineSlider.value);
    currentTimelineDate = new Date(timelineMinDate.getTime() + (daysOffset * 24 * 60 * 60 * 1000));
    updateTimelineDateUI();
    updateTimelineVisualState();
  });
}

if (timelinePlayBtn) {
  const handleTogglePlay = () => {
    if (timelineIsPlaying) {
      stopTimelinePlayback();
    } else {
      // If we are at the end, restart from beginning
      if (currentTimelineDate && timelineMaxDate && currentTimelineDate.getTime() >= timelineMaxDate.getTime()) {
        currentTimelineDate = new Date(timelineMinDate!);
        if (timelineSlider) {
          timelineSlider.value = "0";
        }
      }
      startTimelinePlayback();
    }
  };
  timelinePlayBtn.addEventListener("click", handleTogglePlay);
  (window as any).toggleTimelinePlayback = handleTogglePlay;
}

if (timelineSpeedSelect) {
  timelineSpeedSelect.addEventListener("change", () => {
    timelineSpeed = Number(timelineSpeedSelect.value);
  });
}

// Initial empty state call
updateClassificationUI();
calculateTimelineBounds();

// --- 4D MODE TOGGLE ---
function updateHeaderLabel() {
  const labelEl = getEl('project-header-label');
  if (!labelEl) return;

  let projectName = "Projects";
  if (fragments.list.size > 0) {
    // Get the name of the first loaded model
    const firstEntry = fragments.list.entries().next().value;
    if (firstEntry) {
      const [firstModelId, firstModel] = firstEntry as [string, any];
      const anyModel = firstModel as any;
      const rawName = anyModel.modelId || anyModel.name || firstModelId;
      projectName = rawName.replace(/\.[^/.]+$/, ""); // strip extension
    }
  }

  const modeName = is4dMode ? "4D Simulation" : "Viewer";
  labelEl.textContent = `${projectName} - ${modeName}`;
}

function apply4dMode(active: boolean) {
  is4dMode = active;
  localStorage.setItem('bim-4d-mode', String(active));

  const btn4dMode = getEl('btn-4d-mode');
  const btn4dLabel = getEl('btn-4d-label');

  if (active) {
    document.body.classList.add('mode-4d');
    if (btn4dMode) btn4dMode.classList.add('active');
    if (btn4dLabel) btn4dLabel.textContent = 'Exit 4D';
    // Initialize timeline when 4D is activated
    calculateTimelineBounds();
    updateScheduleWidgetUI();
    updateTimelineVisualState();
    // Auto-open 4D Schedule drawer panel on left sidebar for immediate access
    if (typeof (window as any).switchSidebarTab === 'function') {
      (window as any).switchSidebarTab('left-tab-bar', 'schedule');
    }
  } else {
    document.body.classList.remove('mode-4d');
    if (btn4dMode) btn4dMode.classList.remove('active');
    if (btn4dLabel) btn4dLabel.textContent = 'Activate 4D';
    // Stop playback and restore all element visibility when leaving 4D mode
    stopTimelinePlayback();
    const hider = components.get(OBC.Hider);
    hider.set(true);
    highlighter.clear("timeline-planned");
    highlighter.clear("timeline-inprogress");
    highlighter.clear("timeline-completed");
  }
  updateHeaderLabel();
}

// Restore last 4D mode state on load
apply4dMode(is4dMode);

const btn4dToggle = getEl('btn-4d-mode');
if (btn4dToggle) {
  btn4dToggle.addEventListener('click', () => {
    apply4dMode(!is4dMode);
  });
}

(window as any).toggle4DMode = (active?: boolean) => {
  apply4dMode(typeof active === 'boolean' ? active : !is4dMode);
};

// --- 3D VIEW CUBE CONTROLLER ---
async function orientCameraToFace(face: string) {
  const target = new THREE.Vector3();
  world.camera.controls.getTarget(target);

  const boxer = components.get(OBC.BoundingBoxer);
  boxer.list.clear();
  boxer.addFromModels();
  const bbox = boxer.get();
  boxer.list.clear();

  let center = new THREE.Vector3();
  let d = 20;
  if (!bbox.isEmpty()) {
    bbox.getCenter(center);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    d = Math.max(size.x, size.y, size.z) * 1.5;
  } else {
    center.copy(target);
    d = world.camera.controls.distance || 20;
  }

  let posX = center.x;
  let posY = center.y;
  let posZ = center.z;

  switch (face) {
    case "front": posZ += d; break;
    case "back": posZ -= d; break;
    case "left": posX -= d; break;
    case "right": posX += d; break;
    case "top": posY += d; break;
    case "bottom": posY -= d; break;
  }

  await world.camera.controls.setLookAt(posX, posY, posZ, center.x, center.y, center.z, true);
}

const viewCube = getEl("view-cube") as any;
if (viewCube) {
  viewCube.camera = world.camera.three;

  world.camera.controls.addEventListener("update", () => viewCube.updateOrientation());
  world.camera.controls.addEventListener("control", () => viewCube.updateOrientation());

  viewCube.addEventListener("drag", (e: any) => {
    world.camera.controls.rotate(e.detail.dx, e.detail.dy, false);
  });

  viewCube.addEventListener("frontclick", () => orientCameraToFace("front"));
  viewCube.addEventListener("backclick", () => orientCameraToFace("back"));
  viewCube.addEventListener("leftclick", () => orientCameraToFace("left"));
  viewCube.addEventListener("rightclick", () => orientCameraToFace("right"));
  viewCube.addEventListener("topclick", () => orientCameraToFace("top"));
  viewCube.addEventListener("bottomclick", () => orientCameraToFace("bottom"));
}

// --- QUICK VIEW TOOLBAR & CAMERA PROJECTION CONTROLLER ---
async function setCameraProjection(projectionMode: "Orthographic" | "Perspective") {
  try {
    if (typeof (world.camera as any).set === "function") {
      await (world.camera as any).set(projectionMode);
    } else if (world.camera.projection && typeof world.camera.projection.set === "function") {
      await world.camera.projection.set(projectionMode);
    } else if (typeof (world.camera as any).setProjection === "function") {
      await (world.camera as any).setProjection(projectionMode);
    }
    if (viewCube && world.camera.three) {
      viewCube.camera = world.camera.three;
      viewCube.updateOrientation();
    }
  } catch (err) {
    console.warn("Failed to set camera projection mode:", err);
  }
}

const btnViewFit = getEl("btn-view-fit");
const btnViewTop = getEl("btn-view-top");
const btnViewIso = getEl("btn-view-iso");
const tickerCamMode = getEl("ticker-camera-mode");

if (btnViewFit) {
  btnViewFit.addEventListener("click", async () => {
    try {
      const boxer = components.get(OBC.BoundingBoxer);
      boxer.list.clear();
      boxer.addFromModels();
      const bbox = boxer.get();
      boxer.list.clear();
      if (!bbox.isEmpty()) {
        await world.camera.controls.fitToBox(bbox, true);
      }
    } catch (err) {
      console.warn("Fit view failed:", err);
    }
  });
}

if (btnViewTop) {
  btnViewTop.addEventListener("click", async () => {
    // 1. Switch camera to Orthographic mode for clean 2D floor plan view
    await setCameraProjection("Orthographic");
    // 2. Orient camera top-down over model center
    await orientCameraToFace("top");
    // 3. Update status indicator
    if (tickerCamMode) tickerCamMode.textContent = "2D ORTHOGRAPHIC TOP PLAN";
  });
}

if (btnViewIso) {
  btnViewIso.addEventListener("click", async () => {
    // 1. Switch camera back to Perspective projection
    await setCameraProjection("Perspective");
    // 2. Orient camera to Isometric 3D view using BoundingBoxer
    const target = new THREE.Vector3();
    world.camera.controls.getTarget(target);

    const boxer = components.get(OBC.BoundingBoxer);
    boxer.list.clear();
    boxer.addFromModels();
    const bbox = boxer.get();
    boxer.list.clear();

    let center = new THREE.Vector3();
    let d = 20;
    if (!bbox.isEmpty()) {
      bbox.getCenter(center);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      d = Math.max(size.x, size.y, size.z) * 1.35;
    } else {
      center.copy(target);
      d = world.camera.controls.distance || 20;
    }
    await world.camera.controls.setLookAt(center.x + d, center.y + d, center.z + d, center.x, center.y, center.z, true);
    if (tickerCamMode) tickerCamMode.textContent = "3D PERSPECTIVE ORBIT";
  });
}

const btnViewSnapshot = getEl("btn-view-snapshot");
if (btnViewSnapshot) {
  btnViewSnapshot.addEventListener("click", () => {
    SnapshotModule.getInstance().captureTechnicalSnapshot();
  });
}

const btnQuickExplode = getEl("btn-quick-explode");
let isQuickExploded = false;
if (btnQuickExplode) {
  btnQuickExplode.addEventListener("click", () => {
    isQuickExploded = !isQuickExploded;
    const targetVal = isQuickExploded ? 65 : 0;
    const slider = getEl("settings-explosion-slider") as HTMLInputElement | null;
    if (slider) {
      slider.value = String(targetVal);
      slider.dispatchEvent(new Event("input"));
    } else {
      ExplosionModule.getInstance().setExplosionFactor(targetVal / 100);
    }
    btnQuickExplode.classList.toggle("active", isQuickExploded);
    const txt = getEl("quick-explode-text");
    if (txt) txt.textContent = isQuickExploded ? "Assemble" : "Explode";
  });
}

window.addEventListener("resize", () => {
  if (window.innerWidth > 1024) {
    if (typeof (window as any).closeAllSidebars === "function") {
      (window as any).closeAllSidebars();
    }
  }
});

// --- COLLAPSIBLE PANEL HEADERS WITH MINIMIZE BUTTONS ---
document.querySelectorAll(".panel").forEach((panel) => {
  const header = panel.querySelector(".panel-header");
  if (!header) return;

  // Symmetrical layout alignment: ensure header has title group and minimize button
  let titleGroup = header.querySelector(".header-title-group");
  if (!titleGroup) {
    titleGroup = document.createElement("div");
    titleGroup.className = "header-title-group";

    // Move all current children to the title group
    while (header.firstChild) {
      titleGroup.appendChild(header.firstChild);
    }
    header.appendChild(titleGroup);
  }

  // Create minimize button on the right side of header
  const minimizeBtn = document.createElement("button");
  minimizeBtn.className = "btn-panel-minimize";
  minimizeBtn.innerHTML = `
    <svg class="minimize-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <polyline points="18 15 12 9 6 15"></polyline>
    </svg>
  `;
  header.appendChild(minimizeBtn);

  // Toggle collapse class on header click
  header.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (target.closest("select") || target.closest("input") || target.closest("a") || target.closest("button:not(.btn-panel-minimize)")) {
      return;
    }
    panel.classList.toggle("collapsed");
  });
});

// Initial update
setTimeout(() => { if (viewCube) viewCube.updateOrientation(); }, 500);

// Auto-show Help Modal on first visit
const FIRST_VISIT_KEY = "bim-help-dont-show";
if (!localStorage.getItem(FIRST_VISIT_KEY)) {
  setTimeout(() => {
    if (typeof (window as any).toggleShortcutsModal === "function") {
      (window as any).toggleShortcutsModal(true);
    }
  }, 800);
}

// ============================================================
// TIMELINE SPEED PILLS CONTROLLER
// ============================================================
const speedPills = document.querySelectorAll("#timeline-speed-pills .btn-speed-pill");
speedPills.forEach((pill) => {
  pill.addEventListener("click", () => {
    speedPills.forEach(p => p.classList.remove("active"));
    pill.classList.add("active");
    const speedVal = pill.getAttribute("data-speed");
    if (speedVal && timelineSpeedSelect) {
      timelineSpeedSelect.value = speedVal;
      timelineSpeedSelect.dispatchEvent(new Event("change"));
    }
  });
});

// Trigger initial cost calculation & expose globally
updateCumulative5DCost();
(window as any).updateCumulative5DCost = updateCumulative5DCost;

// ============================================================
// THEME SWITCHER HANDLER
// ============================================================
const themeSelect = getEl("select-theme-toggle") as HTMLSelectElement | null;
if (themeSelect) {
  themeSelect.addEventListener("change", (e) => {
    const targetTheme = (e.target as HTMLSelectElement).value;
    document.documentElement.setAttribute("data-theme", targetTheme);
    (window as any).currentTheme = targetTheme;

    // Apply theme materials if model manager exists
    if ((window as any).modelManager && typeof (window as any).modelManager.applyThemePalette === 'function') {
      (window as any).modelManager.applyThemePalette(targetTheme);
    }

    // Sync GLSL post-processing pass (vignette, bloom glow, toon steps, ink outline)
    syncPostProcessingWithTheme(targetTheme);
  });
}

// ============================================================
// NEO-BRUTALIST TOAST NOTIFICATION QUEUE
// ============================================================
export function showToast(message: string, icon: string = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`, durationMs: number = 3200) {
  const container = getEl("bim-toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.style.cssText = `
    background: var(--bg-panel, #18181b);
    color: var(--text-primary, #ffffff);
    border: 2px solid var(--border-strong, #000000);
    border-radius: 4px;
    padding: 0.5rem 0.85rem;
    box-shadow: var(--shadow-brutal, 4px 4px 0px #000000);
    font-size: 0.72rem;
    font-weight: 800;
    font-family: var(--font-body, sans-serif);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    pointer-events: auto;
    animation: popIn 0.15s ease-out;
    max-width: 320px;
  `;

  toast.innerHTML = `
    <span style="display: inline-flex; align-items: center; flex-shrink: 0;">${icon}</span>
    <span style="flex: 1; line-height: 1.35;">${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = "opacity 0.2s ease, transform 0.2s ease";
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    setTimeout(() => toast.remove(), 220);
  }, durationMs);
}
(window as any).showToast = showToast;

// Wire Tour Button
const btnStartPinTour = getEl("btn-start-pin-tour");
if (btnStartPinTour) {
  btnStartPinTour.addEventListener("click", () => {
    AnnotationModule.getInstance().startTour();
    showToast("Starting Guided 3D Issue Tour", `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="5 3 19 12 5 21 5 3"/></svg>`);
  });
}

// ============================================================
// COMMAND PALETTE (CTRL+K / CMD+K) CONTROLLER
// ============================================================
const cmdModal = getEl("command-palette-modal");
const cmdInput = getEl("command-palette-input") as HTMLInputElement | null;
const cmdResults = getEl("command-palette-results");
const btnOpenCmd = getEl("btn-open-command-palette");

let selectedCmdIndex = 0;

interface CommandItem {
  id: string;
  title: string;
  category: string;
  icon: string;
  action: () => void;
}

const getCommandRegistry = (): CommandItem[] => {
  const list: CommandItem[] = [
    // Navigation Tabs
    { id: "global-search", title: "Global BIM Search (GUID, Name, Property Values)", category: "Search", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`, action: () => GlobalSearchOverlay.getInstance().open() },
    { id: "tab-files", title: "Project Files & IFC Upload", category: "Navigation", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`, action: () => (window as any).switchSidebarTab?.("left-tab-bar", "files") },
    { id: "tab-finder", title: "Items Finder & Storey Filter", category: "Navigation", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`, action: () => (window as any).switchSidebarTab?.("left-tab-bar", "finder") },
    { id: "tab-4d", title: "4D Construction Schedule", category: "Navigation", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`, action: () => (window as any).switchSidebarTab?.("left-tab-bar", "schedule") },
    { id: "tab-scene", title: "Scene Tree & Post-Processing", category: "Navigation", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="12 2 2 12 5 12 5 22 19 22 19 12 22 12 12 2"/></svg>`, action: () => (window as any).switchSidebarTab?.("right-tab-bar", "scene") },
    { id: "tab-inspector", title: "Element Properties & 5D Inspector", category: "Navigation", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`, action: () => (window as any).switchSidebarTab?.("right-tab-bar", "inspector") },
    { id: "tab-tools", title: "Tools (Measure / Pins / Section / Explode)", category: "Navigation", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`, action: () => (window as any).switchSidebarTab?.("right-tab-bar", "tools") },
    { id: "tab-camera", title: "First Person Camera Controls", category: "Navigation", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="12" r="2"/></svg>`, action: () => (window as any).switchSidebarTab?.("right-tab-bar", "camera") },

    // Viewport & Tools
    { id: "tool-fit", title: "Fit Geometry in View (Home)", category: "Viewport", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`, action: () => (window as any).fitView?.() },
    { id: "tool-4d-toggle", title: "Toggle 4D Construction Simulation", category: "4D Simulation", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`, action: () => getEl("btn-4d-mode")?.click() },
    { id: "tool-pin-tour", title: "Play Guided 3D Issue Tour", category: "Collaboration", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="5 3 19 12 5 21 5 3"/></svg>`, action: () => AnnotationModule.getInstance().startTour() },
    { id: "tool-export-bcf", title: "Export Pins (BCF / JSON Report)", category: "Collaboration", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`, action: () => AnnotationModule.getInstance().exportBCFJSON() },
    { id: "tool-xray-toggle", title: "Toggle X-Ray Isolation Mode", category: "Display", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 3H5a2 2 0 0 0-2 2v4m0 6v4a2 2 0 0 0 2 2h4m6 0h4a2 2 0 0 0 2-2v-4m0-6V5a2 2 0 0 0-2-2h-4"/><circle cx="12" cy="12" r="3"/></svg>`, action: () => AnnotationModule.getInstance().toggleXRay() },
    { id: "tool-help", title: "Open Help & Tutorial Guide (?)", category: "Help", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`, action: () => (window as any).toggleShortcutsModal?.(true) },

    // Themes
    { id: "th-zen", title: "Switch to Zen Theme", category: "Themes", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18"/></svg>`, action: () => setTheme("zen") },
    { id: "th-cyber", title: "Switch to Cyberpunk Neon Theme", category: "Themes", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`, action: () => setTheme("cyberpunk") },
    { id: "th-pencil", title: "Switch to Pencil & Paper Theme", category: "Themes", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`, action: () => setTheme("pencil") },
    { id: "th-bluepen", title: "Switch to Bluepen Draft Theme", category: "Themes", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M2 20h20M5 20V8l7-5 7 5v12"/></svg>`, action: () => setTheme("bluepen") },
    { id: "th-amber", title: "Switch to Retro Amber Theme", category: "Themes", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`, action: () => setTheme("amber") },
    { id: "th-emerald", title: "Switch to Matrix Emerald Theme", category: "Themes", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="2" y="2" width="20" height="20" rx="4"/></svg>`, action: () => setTheme("emerald") },
    { id: "th-light", title: "Switch to Ice Light Theme", category: "Themes", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M4.93 19.07l14.14-14.14"/></svg>`, action: () => setTheme("light") }
  ];

  // Add all active 3D pins dynamically
  const pins = AnnotationModule.getInstance().getAnnotations();
  pins.forEach(pin => {
    list.push({
      id: `pin-${pin.id}`,
      title: `Pin #${pin.number}: ${pin.title} (${pin.category})`,
      category: "Field Pins",
      icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>`,
      action: () => {
        AnnotationModule.getInstance().selectPin(pin.id);
        AnnotationModule.getInstance().showPinDetailsModal(pin);
      }
    });
  });

  return list;
};

const setTheme = (themeName: string) => {
  document.documentElement.setAttribute("data-theme", themeName);
  (window as any).currentTheme = themeName;
  if (themeSelect) themeSelect.value = themeName;
  if ((window as any).modelManager?.applyThemePalette) {
    (window as any).modelManager.applyThemePalette(themeName);
  }
  syncPostProcessingWithTheme(themeName);
  showToast(`Switched theme to ${themeName.toUpperCase()}`, `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18"/></svg>`);
};

const openCommandPalette = () => {
  if (!cmdModal) return;
  cmdModal.style.display = "flex";
  if (cmdInput) {
    cmdInput.value = "";
    cmdInput.focus();
  }
  selectedCmdIndex = 0;
  renderCommandResults("");
};

const closeCommandPalette = () => {
  if (!cmdModal) return;
  cmdModal.style.display = "none";
};

const renderCommandResults = (query: string) => {
  if (!cmdResults) return;
  cmdResults.innerHTML = "";
  const allCmds = getCommandRegistry();
  const q = query.toLowerCase().trim();

  const filtered = q
    ? allCmds.filter(c => c.title.toLowerCase().includes(q) || c.category.toLowerCase().includes(q))
    : allCmds;

  if (filtered.length === 0) {
    cmdResults.innerHTML = `<div style="font-size: 0.68rem; color: var(--text-muted); padding: 0.6rem; text-align: center;">No matching actions or elements found.</div>`;
    return;
  }

  filtered.forEach((cmd, idx) => {
    const isSelected = idx === selectedCmdIndex;
    const itemEl = document.createElement("div");
    itemEl.className = "command-item";
    itemEl.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.45rem 0.65rem;
      border-radius: 4px;
      cursor: pointer;
      background: ${isSelected ? "var(--accent-500)" : "transparent"};
      border: 1.5px solid ${isSelected ? "var(--accent-500)" : "transparent"};
    `;

    const selectedTextColor = isSelected ? "#000000" : "var(--text-primary)";
    const selectedMutedColor = isSelected ? "#000000" : "var(--text-muted)";
    const selectedBadgeBg = isSelected ? "rgba(0,0,0,0.15)" : "var(--bg-card)";

    itemEl.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <span style="font-size: 0.85rem; ${isSelected ? 'filter: brightness(0);' : ''}">${cmd.icon}</span>
        <span style="font-size: 0.72rem; font-weight: 700; color: ${selectedTextColor};">${cmd.title}</span>
      </div>
      <span style="font-size: 0.56rem; font-weight: 800; text-transform: uppercase; background: ${selectedBadgeBg}; border: 1px solid ${isSelected ? 'rgba(0,0,0,0.2)' : 'var(--border-subtle)'}; padding: 0.1rem 0.35rem; border-radius: 2px; color: ${selectedMutedColor};">${cmd.category}</span>
    `;

    itemEl.addEventListener("click", () => {
      cmd.action();
      closeCommandPalette();
    });

    cmdResults.appendChild(itemEl);
  });
};

if (btnOpenCmd) {
  btnOpenCmd.addEventListener("click", () => {
    GlobalSearchOverlay.getInstance().open();
  });
}

if (cmdInput) {
  cmdInput.addEventListener("input", () => {
    selectedCmdIndex = 0;
    renderCommandResults(cmdInput.value);
  });

  cmdInput.addEventListener("keydown", (e: KeyboardEvent) => {
    const allCmds = getCommandRegistry();
    const q = cmdInput.value.toLowerCase().trim();
    const filtered = q ? allCmds.filter(c => c.title.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)) : allCmds;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedCmdIndex = (selectedCmdIndex + 1) % Math.max(1, filtered.length);
      renderCommandResults(cmdInput.value);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedCmdIndex = (selectedCmdIndex - 1 + filtered.length) % Math.max(1, filtered.length);
      renderCommandResults(cmdInput.value);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[selectedCmdIndex]) {
        filtered[selectedCmdIndex].action();
        closeCommandPalette();
      }
    } else if (e.key === "Escape") {
      closeCommandPalette();
    }
  });
}

// Global Keyboard Shortcut for Command Palette (Ctrl+K or Cmd+K)
window.addEventListener("keydown", (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    if (cmdModal && cmdModal.style.display === "flex") {
      closeCommandPalette();
    } else {
      openCommandPalette();
    }
  }
});

// Close command palette when clicking outside
if (cmdModal) {
  cmdModal.addEventListener("click", (e) => {
    if (e.target === cmdModal) closeCommandPalette();
  });
}

// ============================================================
// RIGHT-CLICK SMART CONTEXT MENU FOR VIEWPORT
// ============================================================
const ctxMenu = getEl("bim-context-menu");
const ctxTitle = getEl("ctx-element-title");

let ctxHitPoint: THREE.Vector3 | null = null;
let ctxModelId: string | undefined = undefined;
let ctxExpressId: number | undefined = undefined;
let ctxElementName: string | undefined = undefined;

container.addEventListener("contextmenu", async (e: MouseEvent) => {
  e.preventDefault();
  if (!ctxMenu) return;

  const rect = container.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  );

  ctxHitPoint = null;
  ctxModelId = undefined;
  ctxExpressId = undefined;
  ctxElementName = undefined;

  // Raycast against IFC elements
  try {
    const caster = components.get(OBC.Raycasters).get(world);
    const result = (await caster.castRay()) as any;
    if (result && result.point) {
      ctxHitPoint = result.point.clone();
      if (result.fragments?.modelId && result.localId !== undefined) {
        ctxModelId = result.fragments.modelId;
        ctxExpressId = result.localId;
        if (typeof ctxExpressId === "number") {
          ctxElementName = resolveElementTag(ctxExpressId);
        }
      }
    }
  } catch (err) {
    // fallback
  }

  if (!ctxHitPoint) {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, world.camera.three);
    const target = new THREE.Vector3();
    world.camera.controls.getTarget(target);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -target.y);
    const hit = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, hit)) {
      ctxHitPoint = hit;
    } else {
      ctxHitPoint = target;
    }
  }

  if (ctxTitle) {
    ctxTitle.innerHTML = ctxElementName
      ? `<span style="display: inline-flex; align-items: center; gap: 0.25rem;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg> ${ctxElementName}</span>`
      : `<span style="display: inline-flex; align-items: center; gap: 0.25rem;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg> 3D Point Coordinates</span>`;
  }

  ctxMenu.style.display = "flex";
  ctxMenu.style.left = `${Math.min(window.innerWidth - 200, e.clientX)}px`;
  ctxMenu.style.top = `${Math.min(window.innerHeight - 200, e.clientY)}px`;
});

// Close context menu on outside click
document.addEventListener("pointerdown", (e: MouseEvent) => {
  if (ctxMenu && !ctxMenu.contains(e.target as Node)) {
    ctxMenu.style.display = "none";
  }
});

// Context Menu Action Listeners
if (ctxMenu) {
  ctxMenu.querySelectorAll(".ctx-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.getAttribute("data-action");
      ctxMenu.style.display = "none";

      if (action === "drop-pin" && ctxHitPoint) {
        AnnotationModule.getInstance().addAnnotation(
          ctxHitPoint,
          "Inspection Pin",
          "Recorded via Smart Context Menu.",
          "Inspection",
          ctxModelId,
          ctxExpressId,
          ctxElementName
        );
        showToast(`3D Pin placed on ${ctxElementName || "Model"}`, `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>`);
      } else if (action === "properties" && ctxModelId && ctxExpressId !== undefined) {
        
        const model = fragments.list.get(ctxModelId);
        if (model) {
          displayElementProperties(model, ctxExpressId);
          (window as any).switchSidebarTab?.("right-tab-bar", "inspector");
        }
      } else if (action === "xray" && ctxModelId && ctxExpressId !== undefined) {
        AnnotationModule.getInstance().toggleXRay();
        showToast("Toggled X-Ray Mode", `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 3H5a2 2 0 0 0-2 2v4m0 6v4a2 2 0 0 0 2 2h4m6 0h4a2 2 0 0 0 2-2v-4m0-6V5a2 2 0 0 0-2-2h-4"/><circle cx="12" cy="12" r="3"/></svg>`);
      } else if (action === "isolate" && ctxModelId && ctxExpressId !== undefined) {
        const highlighter = components.get(OBF.Highlighter);
        if (highlighter) {
          highlighter.highlightByID("select", { [ctxModelId]: new Set([ctxExpressId]) }, true, true);
          showToast(`Isolated ${ctxElementName || "Element"}`, `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`);
        }
      } else if (action === "focus" && ctxHitPoint) {
        world.camera.controls.setLookAt(ctxHitPoint.x + 4, ctxHitPoint.y + 3, ctxHitPoint.z + 4, ctxHitPoint.x, ctxHitPoint.y, ctxHitPoint.z, true);
        showToast("Focused Camera on Target", `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`);
      }
    });
  });
}

// --- PWA SERVICE WORKER REGISTRATION ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => {
        console.log("PWA Service Worker registered with scope:", reg.scope);
      })
      .catch((err) => {
        console.log("PWA Service Worker registration skipped:", err);
      });
  });
}


