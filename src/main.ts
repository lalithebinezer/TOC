import './style.css';
import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as BUI from "@thatopen/ui";
import { PropertyEditor, initPropertyEditorUI } from "./PropertyEditor";
import "./BimViewCube";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { BluePenShader } from "./shaders/BluePenShader";
import { getCategoryColor, THEME_POST_PROCESS_CONFIG } from "./theme-palette";
import { ScheduleManager } from "./schedule-manager";
import { exportBOQAsCSV, generateBOQSummary, extractQuantityData, type BOQLineItem } from "./boq-generator";

import { BCFManager } from "./bcf-manager";
import { IDSChecker } from "./ids-checker";
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

const container = document.getElementById("container")!;
world.renderer = new OBF.PostproductionRenderer(components, container);
world.renderer.three.setPixelRatio(Math.min(window.devicePixelRatio, 2));
world.renderer.three.shadowMap.enabled = true;
world.renderer.three.shadowMap.type = THREE.PCFShadowMap;
world.camera = new OBC.OrthoPerspectiveCamera(components);
if (world.camera.controls) {
  const controls = world.camera.controls as any;
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
world.camera.set("Orbit");

scene.setup();
scene.three.background = null;

components.init();

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

const bimEngine = BimEngine.getInstance(components, world);
const modelManager = new ModelManager();
const viewportController = new ViewportController();
const clippingModule = new ClippingModule();
const queryModule = new QueryModule();
const idsModule = new IdsModule();
const timeline4DModule = new Timeline4DModule();
const boq5DModule = new Boq5DModule();
const federationModule = new FederationModule();

(window as any).bimEngine = bimEngine;
(window as any).modelManager = modelManager;
(window as any).viewportController = viewportController;
(window as any).federationModule = federationModule;

// Setup Command Palette (Ctrl + K)
const commandPalette = new CommandPalette([
  { label: "Switch to ⛩️ Zen Infrastructure Theme", action: () => {
      const themeSelect = document.getElementById("btn-theme-toggle") as HTMLSelectElement | null;
      if (themeSelect) {
        themeSelect.value = "zen";
        themeSelect.dispatchEvent(new Event("change"));
      }
    } 
  },
  { label: "Toggle Zen Ghost Workspace (Transparent Model)", action: () => idsModule.toggleGhostMode() },
  { label: "Isolate Architectural Discipline (ARQ)", action: () => federationModule.isolateDiscipline("ARQ") },
  { label: "Isolate Structural Discipline (STR)", action: () => federationModule.isolateDiscipline("STR") },
  { label: "Isolate MEP Discipline (MEP)", action: () => federationModule.isolateDiscipline("MEP") },
  { label: "Reset All Federated Model Layers", action: () => federationModule.resetAllVisibility() },
  { label: "Fit Camera to Federated Bounding Box", action: () => federationModule.fitCameraToFederation() },
  { label: "Toggle Section Clipper Plane", action: () => clippingModule.createSectionPlane() },
  { label: "Clear All Section Planes", action: () => clippingModule.deleteAllPlanes() },
  { label: "Run IDS Door Compliance Audit", action: () => {
      const spec = idsModule.createSampleDoorSpec();
      idsModule.runAudit(spec);
    } 
  },
  { label: "Start 4D Simulation Playback", action: () => timeline4DModule.startSimulation() },
  { label: "Stop 4D Simulation", action: () => timeline4DModule.stopSimulation() },
  { label: "Export 5D BOQ as CSV", action: () => boq5DModule.exportCSV() },
  { label: "Reset Model Visibility", action: () => queryModule.resetVisibility() },
]);
(window as any).commandPalette = commandPalette;

world.onCameraChanged.add((camera) => {
  for (const [, model] of fragments.list) {
    model.useCamera(camera.three);
  }
});
if (world.renderer) {
  world.renderer.showLogo = false;
}

// Add Grid via OBC.Grids component
const grids = components.get(OBC.Grids);
let simpleGrid: any;
try {
  simpleGrid = grids.create(world);
} catch (e) {
  simpleGrid = (grids as any).list?.values()?.next()?.value;
}
(window as any).viewer_grid = simpleGrid;

const grid = new THREE.GridHelper(100, 100, 0x1d283a, 0x111926);
grid.position.y = -0.01;
world.scene.three.add(grid);

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

// Configure default light intensities and turn shadows off by default
if (ambientLight) ambientLight.intensity = 1.5;
if (dirLight) {
  dirLight.intensity = 1.5;
  dirLight.castShadow = false;
}
world.scene.shadowsEnabled = false;

export function syncPostProcessingWithTheme(themeName: string) {
  if (!bluePenPass) return;
  const cfg = THEME_POST_PROCESS_CONFIG[themeName] || THEME_POST_PROCESS_CONFIG['zen'];
  bluePenPass.uniforms.paperColor.value.setStyle(cfg.paperColor);
  bluePenPass.uniforms.inkColor.value.setStyle(cfg.inkColor);
  bluePenPass.uniforms.outlineGlowColor.value.setStyle(cfg.outlineGlowColor);
  bluePenPass.uniforms.vignetteIntensity.value = cfg.vignetteIntensity;
  bluePenPass.uniforms.bloomThreshold.value = cfg.bloomThreshold;
  bluePenPass.uniforms.bloomStrength.value = cfg.bloomStrength;
  bluePenPass.uniforms.toonSteps.value = cfg.toonSteps;
  bluePenPass.uniforms.lineThickness.value = cfg.lineThickness;
  bluePenPass.uniforms.jitterAmount.value = cfg.jitterAmount;
  bluePenPass.uniforms.postMode.value = cfg.postMode;
  bluePenPass.uniforms.chromaticAberration.value = cfg.chromaticAberration;
}
(window as any).syncPostProcessingWithTheme = syncPostProcessingWithTheme;

// Attach BluePenShader postprocessing pass for sketched/themed model elements
let bluePenPass: ShaderPass | null = null;
const postproduction = (world.renderer as any).postproduction;
if (postproduction) {
  postproduction.enabled = true;
  if (postproduction.composer) {
    bluePenPass = new ShaderPass(BluePenShader as any);
    if (postproduction.depthTexture) {
      bluePenPass.uniforms.tDepth.value = postproduction.depthTexture;
    }
    bluePenPass.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
    postproduction.composer.addPass(bluePenPass);
    syncPostProcessingWithTheme('zen');
  }
}

// --- BIM & GEOMETRY INGESTION SETUP ---
const ifcLoader = components.get(OBC.IfcLoader);

// --- CLIPPER (SECTION PLANES) SETUP ---
const clipper = components.get(OBC.Clipper);
clipper.enabled = false;

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

// Add double-click listener to create section cuts when Clipper is active, or pick elements when it is disabled
container.addEventListener("dblclick", async () => {
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
        await highlighter.clear("select");
        resetPropertiesPanel();
        return;
      }

      const modelId = result.fragments.modelId;
      const localId = result.localId;
      const modelIdMap = { [modelId]: new Set([localId]) };

      // Highlight the clicked element
      await highlighter.highlightByID("select", modelIdMap, true, false);

      // Display properties in panel
      const model = fragments.list.get(modelId);
      if (model) {
        displayElementProperties(model, localId);
        if (propertyEditor) {
          await propertyEditor.selectElement(model, localId);
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
highlighter.styles.set("timeline-inprogress", {
  color: new THREE.Color("#8b5cf6"), // Electric Violet
  opacity: 0.6,
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
  const storeys = classifier.list.get("Storeys");
  if (storeys) {
    for (const [storeyName, groupData] of storeys) {
      const map = await groupData.get();
      for (const mId in map) {
        if (mId === modelId || fragments.list.get(mId) === model) {
          for (const id of map[mId]) {
            globalElementStoreysMap[`${mId}-${id}`] = storeyName;
          }
        }
      }
    }
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
  const elTotalCost = document.getElementById("stat-total-cost");
  if (elTotalCost) elTotalCost.innerText = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(totalCost);

  const elCount = document.getElementById("stat-elements-count");
  if (elCount) elCount.innerText = String(elementCount);

  const elTotalLabel = document.getElementById("total-elements-label");
  if (elTotalLabel) elTotalLabel.innerText = String(elementCount);

  const progressPctVal = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;

  const elPct = document.getElementById("stat-progress-pct");
  if (elPct) elPct.innerText = `${progressPctVal}%`;

  const elCompleted = document.getElementById("stat-completed-tasks");
  if (elCompleted) elCompleted.innerText = `${completedCount}/${totalTasks} Tasks`;

  const elBar = document.getElementById("stat-progress-bar");
  if (elBar) elBar.style.width = `${progressPctVal}%`;

  // Render Material allocation breakdown list
  const breakdownList = document.getElementById("breakdown-list");
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

const costUnit = document.getElementById("cost-unit-cost")! as HTMLInputElement;
const costQty = document.getElementById("cost-quantity")! as HTMLInputElement;
const costCalc = document.getElementById("cost-calculated-total")!;

const schedTask = document.getElementById("sched-task")! as HTMLInputElement;
const schedStatus = document.getElementById("sched-status")! as HTMLSelectElement;
const schedStart = document.getElementById("sched-start")! as HTMLInputElement;
const schedEnd = document.getElementById("sched-end")! as HTMLInputElement;

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
const propsContainer = document.getElementById("properties-selected-state");
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

  document.getElementById("properties-empty-state")!.style.display = "none";
  document.getElementById("properties-selected-state")!.style.display = "flex";

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
  const headerStatusText = document.getElementById("header-status-text");
  if (headerStatusText) {
    headerStatusText.innerText = `${entityName}: ${nameVal} (#${expressId})`;
  }

  const propExpressIdEl = document.getElementById("prop-express-id");
  if (propExpressIdEl) propExpressIdEl.innerText = String(expressId);

  const propIfcTypeEl = document.getElementById("prop-ifc-type");
  if (propIfcTypeEl) propIfcTypeEl.innerText = entityName;

  const propNameEl = document.getElementById("prop-name");
  if (propNameEl) propNameEl.innerText = nameVal;

  const badgePropsIdEl = document.getElementById("badge-props-id");
  if (badgePropsIdEl) badgePropsIdEl.innerText = `#${expressId}`;

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
    divider.innerHTML = `<span>⚡</span> <span>${psetName}</span>`;
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
      typeDivider.innerHTML = `<span>🏷️</span> <span>Type: ${typeProps.Name?.value || typeProps.Name || "IFC Type"}</span>`;
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
      divider.innerHTML = `<span>⚡</span> <span>Type: ${psetName}</span>`;
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
  const headerStatusText = document.getElementById("header-status-text");
  if (headerStatusText) {
    headerStatusText.innerText = "Ready • 3D Workspace";
  }
  const badgePropsIdEl = document.getElementById("badge-props-id");
  if (badgePropsIdEl) {
    badgePropsIdEl.innerText = "#--";
  }
  const emptyState = document.getElementById("properties-empty-state");
  if (emptyState) emptyState.style.display = "flex";

  const selectedState = document.getElementById("properties-selected-state");
  if (selectedState) selectedState.style.display = "none";

  if (propertyEditor) {
    propertyEditor.deselect();
  }
}

// Wire BOQ CSV export button
const btnExportBoqCsv = document.getElementById("btn-export-boq-csv");
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
const btnExport4dCsv = document.getElementById("btn-export-4d-csv");
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
    updateViewportHint("📥 4D Schedule CSV Template downloaded! Open in Excel to edit task dates.");
  });
}

const btnImport4dCsvInput = document.getElementById("btn-import-4d-csv-input") as HTMLInputElement | null;
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
        alert(`✅ Imported ${count} custom 4D schedule tasks from CSV!\nTimeline and simulation playback updated.`);
        updateViewportHint(`✅ Custom 4D Schedule CSV applied (${count} tasks updated)`);
      } else {
        alert("⚠️ Could not parse valid 4D tasks from the CSV file. Please check column headers (TaskID, StartDate, EndDate).");
      }
      target.value = "";
    }
  });
}

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
const saveBtn = document.getElementById("save-data-btn")!;
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

      // Apply current active theme to newly loaded Three.js model materials
      const currentTheme = document.documentElement.getAttribute("data-theme") || "cozy";
      applyThemeToThreeMaterials(currentTheme);
      updateThemeShaderUniforms(currentTheme);

      if (postproduction) {
        postproduction.enabled = true;
        if (postproduction.customEffects) {
          postproduction.customEffects.setNeedsUpdate();
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
    const loadingOverlay = document.getElementById("loading-overlay");
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
    const text = document.getElementById("loading-text")!;
    text.innerText = "Initialization Error";
    const subtitle = document.getElementById("loading-subtitle")!;
    subtitle.innerText = "Could not initialize WebAssembly or rendering environment.";
  }
};

// Start the initialization
initBim();

// --- DYNAMIC FILE LIST MANAGEMENT ---
function refreshFileList() {
  const fileListEl = document.getElementById("file-list")!;
  fileListEl.innerHTML = '';

  const headerStatusEl = document.getElementById("header-status-text");

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

  const badgeFilesCount = document.getElementById("badge-files-count");
  if (badgeFilesCount) badgeFilesCount.textContent = String(fragments.list.size);

  const tickerModelName = document.getElementById("ticker-model-name");
  if (tickerModelName) tickerModelName.textContent = firstModelName.toUpperCase();

  const tickerCount = document.getElementById("ticker-elements-count");
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
    });

    fileListEl.appendChild(item);
  }
  updateHeaderLabel();
}

// File search filter
const fileSearchInput = document.getElementById('file-search') as HTMLInputElement;
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
  const overlay = document.getElementById("loading-overlay")!;
  const text = document.getElementById("loading-text")!;
  const progress = document.getElementById("loading-progress")!;
  const subtitle = document.getElementById("loading-subtitle")!;

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
        
        model = await fragments.core.load(cachedBuffer, { modelId: name } as any);
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
      model = await fragments.core.load(buffer, { modelId: name } as any);
    }

    clearInterval(interval);
    progress.innerText = "100%";
    text.innerText = "Building Semantic Model database...";

    if (model) {
      (window as any).viewer_model = model;
      federationModule.registerModel(model, name);
      // Enable shadows if checked
      const shadowsToggleEl = document.getElementById("settings-toggle-shadows") as HTMLInputElement | null;
      const shadowsOn = shadowsToggleEl?.checked ?? false;
      model.object.traverse((child: any) => {
        if (child.isMesh) {
          child.castShadow = shadowsOn;
          child.receiveShadow = shadowsOn;
        }
      });

      // Run dynamic classifications
      console.log("CLASSIFIER: starting byCategory");
      await classifier.byCategory({ classificationName: "Categories" });
      console.log("CLASSIFIER: byCategory done");
      console.log("CLASSIFIER: starting byIfcBuildingStorey");
      await classifier.byIfcBuildingStorey({ classificationName: "Storeys" });
      console.log("CLASSIFIER: byIfcBuildingStorey done");
      console.log("CLASSIFIER: starting byModel");
      try {
        await classifier.byModel({ classificationName: "Models" });
      } catch (e) {
        console.warn("Classifier byModel info:", e);
      }
      console.log("CLASSIFIER: byModel done");

      // Apply category-based theme colors to three.js mesh materials
      await applyCategoryColors();

      // Sync/generate local database twin properties using classifications
      await initializeModelTwinData(model);

      // Auto-populate 4D Schedule tasks for all elements and categories in loaded model
      const categoriesGroup = classifier.list.get("Categories");
      if (categoriesGroup) {
        const catMap = new Map<string, { modelId: string; elementIds: number[] }[]>();
        for (const [catName, groupData] of categoriesGroup) {
          const res = await groupData.get();
          const itemsArr: { modelId: string; elementIds: number[] }[] = [];
          for (const mId in res) {
            itemsArr.push({ modelId: mId, elementIds: Array.from(res[mId]) });
          }
          catMap.set(catName, itemsArr);
        }
        scheduleManager.generateFromCategories(catMap);
      }

      // Update 5D cumulative project budget now that twin data is populated
      if (typeof (window as any).updateCumulative5DCost === 'function') {
        (window as any).updateCumulative5DCost();
      }

      console.log("CLASSIFIER: starting updateClassificationUI");
      await updateClassificationUI();
      console.log("CLASSIFIER: updateClassificationUI done");
      calculateTimelineBounds();

      // Force renderer to resize and update layout
      if (world.renderer) {
        world.renderer.resize();
      }
      window.dispatchEvent(new Event('resize'));

      // Sync 4D simulation state for newly loaded model
      if (typeof calculateTimelineBounds === 'function') {
        calculateTimelineBounds();
      }
      if (is4dMode && typeof (window as any).updateTimelineVisualState === 'function') {
        (window as any).updateTimelineVisualState();
      }

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
      }, 300);
    }

    // Update dynamic file list
    refreshFileList();

    // Success path: hide overlay after a short delay
    setTimeout(() => {
      overlay.classList.add("hidden");
    }, 500);

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
const fileInput = document.getElementById("file-input")! as HTMLInputElement;
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
  const loadSampleBtn = document.getElementById("load-sample-btn");
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

const loadSampleBtn = document.getElementById("load-sample-btn");
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
  if (!bluePenPass) return;

  const vis = themeVisualMap[theme];
  if (vis) {
    // Enable the shader for ALL themes — model syncs to theme colors
    bluePenPass.uniforms.enabled.value = 1.0;
    bluePenPass.uniforms.paperColor.value.set(vis.paper);
    bluePenPass.uniforms.inkColor.value.set(vis.ink);
    bluePenPass.uniforms.jitterAmount.value = vis.jitter;

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
    bluePenPass.uniforms.enabled.value = 0.0;
  }
}

// Apply Zen Infrastructure theme by default
document.documentElement.setAttribute("data-theme", "zen");
updateThemeShaderUniforms("zen");

// Bottom Toolbar Actions: Visibility
const showAllBtn = document.getElementById("btn-show-all");
if (showAllBtn) {
  showAllBtn.addEventListener("click", async () => {
    const hider = components.get(OBC.Hider);
    await hider.set(true);
  });
}

const hideAllBtn = document.getElementById("btn-hide-all");
if (hideAllBtn) {
  hideAllBtn.addEventListener("click", async () => {
    const hider = components.get(OBC.Hider);
    await hider.set(false);
  });
}

import { exportFrag } from "./components/FragExporter";

const loadIfcBtn = document.getElementById("btn-load-ifc");
if (loadIfcBtn) {
  loadIfcBtn.addEventListener("click", () => {
    if (fileInput) {
      fileInput.accept = ".ifc";
      fileInput.click();
    }
  });
}

const exportFragBtn = document.getElementById("btn-export-frag");
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

const loadFragBtn = document.getElementById("btn-load-frag");
if (loadFragBtn) {
  loadFragBtn.addEventListener("click", () => {
    if (fileInput) {
      fileInput.accept = ".frag";
      fileInput.click();
    }
  });
}

// Bottom Toolbar Actions: Selection
const focusBtn = document.getElementById("btn-focus");
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

const hideSelectedBtn = document.getElementById("btn-hide-selected");
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

const isolateBtn = document.getElementById("btn-isolate");
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

const clearSelectionBtn = document.getElementById("btn-clear-selection");
if (clearSelectionBtn) {
  clearSelectionBtn.addEventListener("click", async () => {
    await highlighter.clear("select");
    resetPropertiesPanel();
  });
}

// Bottom Toolbar Actions: Sectioning
const clipperBtn = document.getElementById("btn-section-cut");
if (clipperBtn) {
  clipperBtn.addEventListener("click", () => {
    clipper.enabled = !clipper.enabled;
    clipperBtn.classList.toggle("active", clipper.enabled);
    updateViewportHint(clipper.enabled ? "✂️ Section Cut Active — Double-click any surface to slice model" : "Double-click any 3D element to inspect properties • Drag to Orbit view");
  });
}

const clearClipsBtn = document.getElementById("btn-clear-sections");
if (clearClipsBtn) {
  clearClipsBtn.addEventListener("click", () => {
    clipper.deleteAll();
    updateViewportHint("Section planes cleared • Double-click any 3D element to inspect properties");
  });
}

// --- INTUITIVE VIEWPORT HINT BAR MANAGER ---
function updateViewportHint(msg: string) {
  const hintText = document.getElementById("viewport-hint-text");
  const hintBar = document.getElementById("viewport-hint-bar");
  if (hintText) hintText.textContent = msg;
  if (hintBar) hintBar.classList.remove("hidden");
}

const hintDismissBtn = document.getElementById("btn-hint-dismiss");
if (hintDismissBtn) {
  hintDismissBtn.addEventListener("click", () => {
    document.getElementById("viewport-hint-bar")?.classList.add("hidden");
  });
}


// --- STRUCTURED AI PROMPT EXPORTER ---
const btnExportPrompt = document.getElementById("btn-export-prompt");
if (btnExportPrompt) {
  btnExportPrompt.addEventListener("click", () => {
    const expressId = document.getElementById("prop-express-id")?.textContent || "-";
    const ifcType = document.getElementById("prop-ifc-type")?.textContent || "-";
    const name = document.getElementById("prop-name")?.textContent || "-";

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
  const container = document.getElementById("finder-queries-list");
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

  const badgeFinderCount = document.getElementById("badge-finder-count");
  if (badgeFinderCount) {
    const totalQueries = container.querySelectorAll(".query-item").length;
    badgeFinderCount.textContent = String(totalQueries);
  }

  // 3. Wire event listeners for all buttons
  wireItemFinderButtons();
}

function wireItemFinderButtons() {
  document.querySelectorAll(".btn-query-execute").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const target = e.currentTarget as HTMLButtonElement;
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
          document.querySelectorAll(".btn-query-execute").forEach((otherBtn) => {
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
  });
}

// Initial wire
updateItemFinderQueries();

// Sidebar Scene Controls bindings
const ambientSlider = document.getElementById("ambient-light-slider")! as HTMLInputElement;
const ambientValLabel = document.getElementById("val-ambient-light")!;
ambientSlider.addEventListener("input", () => {
  const val = Number(ambientSlider.value);
  ambientValLabel.innerText = val.toFixed(1);
  if (ambientLight) {
    ambientLight.intensity = val;
  }
});

const dirSlider = document.getElementById("dir-light-slider")! as HTMLInputElement;
const dirValLabel = document.getElementById("val-dir-light")!;
dirSlider.addEventListener("input", () => {
  const val = Number(dirSlider.value);
  dirValLabel.innerText = val.toFixed(1);
  if (dirLight) {
    dirLight.intensity = val;
  }
});



// Post-Processing Settings Event Bindings
const postProcToggle = document.getElementById("settings-toggle-postproc") as HTMLInputElement | null;
if (postProcToggle) {
  postProcToggle.addEventListener("change", () => {
    const enabled = postProcToggle.checked;
    if (postproduction) {
      postproduction.enabled = enabled;
    }
    if (bluePenPass) {
      bluePenPass.uniforms.enabled.value = enabled ? 1.0 : 0.0;
    }
    fragments.core.update(true);
  });
}

const postProcThickness = document.getElementById("settings-postproc-thickness") as HTMLInputElement | null;
const postProcThicknessVal = document.getElementById("val-postproc-thickness");
if (postProcThickness) {
  postProcThickness.addEventListener("input", () => {
    const val = Number(postProcThickness.value);
    if (postProcThicknessVal) postProcThicknessVal.innerText = val.toFixed(1);
    if (bluePenPass) {
      bluePenPass.uniforms.lineThickness.value = val;
    }
  });
}

const postProcJitter = document.getElementById("settings-postproc-jitter") as HTMLInputElement | null;
const postProcJitterVal = document.getElementById("val-postproc-jitter");
if (postProcJitter) {
  postProcJitter.addEventListener("input", () => {
    const val = Number(postProcJitter.value);
    if (postProcJitterVal) postProcJitterVal.innerText = val.toFixed(4);
    if (bluePenPass) {
      bluePenPass.uniforms.jitterAmount.value = val;
    }
  });
}

// Bloom Glow Slider
const postProcBloom = document.getElementById("settings-postproc-bloom") as HTMLInputElement | null;
const postProcBloomVal = document.getElementById("val-postproc-bloom");
if (postProcBloom) {
  postProcBloom.addEventListener("input", () => {
    const val = Number(postProcBloom.value);
    if (postProcBloomVal) postProcBloomVal.innerText = val.toFixed(2);
    if (bluePenPass) {
      bluePenPass.uniforms.bloomStrength.value = val;
    }
  });
}

// Radial Vignette Slider
const postProcVignette = document.getElementById("settings-postproc-vignette") as HTMLInputElement | null;
const postProcVignetteVal = document.getElementById("val-postproc-vignette");
if (postProcVignette) {
  postProcVignette.addEventListener("input", () => {
    const val = Number(postProcVignette.value);
    if (postProcVignetteVal) postProcVignetteVal.innerText = val.toFixed(2);
    if (bluePenPass) {
      bluePenPass.uniforms.vignetteIntensity.value = val;
    }
  });
}

// Chromatic Aberration Slider
const postProcChroma = document.getElementById("settings-postproc-chroma") as HTMLInputElement | null;
const postProcChromaVal = document.getElementById("val-postproc-chroma");
if (postProcChroma) {
  postProcChroma.addEventListener("input", () => {
    const val = Number(postProcChroma.value);
    if (postProcChromaVal) postProcChromaVal.innerText = val.toFixed(2);
    if (bluePenPass) {
      bluePenPass.uniforms.chromaticAberration.value = val;
    }
  });
}

// Toon Quantization Steps Slider
const postProcToon = document.getElementById("settings-postproc-toon") as HTMLInputElement | null;
const postProcToonVal = document.getElementById("val-postproc-toon");
if (postProcToon) {
  postProcToon.addEventListener("input", () => {
    const val = Number(postProcToon.value);
    if (postProcToonVal) postProcToonVal.innerText = val.toString();
    if (bluePenPass) {
      bluePenPass.uniforms.toonSteps.value = val;
    }
  });
}

// Shader FX Mode Selector
const postProcFxMode = document.getElementById("settings-postproc-fxmode") as HTMLSelectElement | null;
if (postProcFxMode) {
  postProcFxMode.addEventListener("change", () => {
    const val = Number(postProcFxMode.value);
    if (bluePenPass) {
      bluePenPass.uniforms.postMode.value = val;
    }
  });
}

const bgColorPicker = document.getElementById("settings-bg-color")! as HTMLInputElement;
bgColorPicker.addEventListener("input", () => {
  const color = bgColorPicker.value;
  document.body.style.backgroundColor = color;
  container.style.backgroundColor = color;
  if (world.scene.three.background) {
    (world.scene.three.background as THREE.Color).set(color);
  }
});

const gridToggle = document.getElementById("settings-toggle-grid")! as HTMLInputElement;
gridToggle.addEventListener("change", () => {
  grid.visible = gridToggle.checked;
});

const logoToggle = document.getElementById("settings-toggle-logo")! as HTMLInputElement;
logoToggle.addEventListener("change", () => {
  try {
    if (world.renderer) {
      world.renderer.showLogo = logoToggle.checked;
    }
  } catch (e) {
    console.error("Failed to toggle logo:", e);
  }
});

const shadowsToggle = document.getElementById("settings-toggle-shadows")! as HTMLInputElement;
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

const clearCacheBtn = document.getElementById("btn-clear-cache")!;
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
const clearStorageBtn = document.getElementById("btn-clear-storage");
clearStorageBtn?.addEventListener("click", () => {
  if (confirm("Clear all localStorage entries? This will remove saved twin data and settings.")) {
    localStorage.clear();
    alert("Local storage cleared. Reload the page to start fresh.");
  }
});

// Selection Color Customizer Event Listeners
const selectColorPicker = document.getElementById("settings-select-color")! as HTMLInputElement;
selectColorPicker.addEventListener("input", () => {
  const colorHex = selectColorPicker.value;
  const style = highlighter.styles.get("select");
  if (style) {
    style.color = new THREE.Color(colorHex);
  }
});

const hoverColorPicker = document.getElementById("settings-hover-color")! as HTMLInputElement;
hoverColorPicker.addEventListener("input", () => {
  const colorHex = hoverColorPicker.value;
  const style = highlighter.styles.get("hover");
  if (style) {
    style.color = new THREE.Color(colorHex);
  }
});

// Interactive 4D Simulation Status Color Pickers
const plannedColorPicker = document.getElementById("4d-color-planned") as HTMLInputElement | null;
if (plannedColorPicker) {
  plannedColorPicker.addEventListener("input", () => {
    ScheduleManager.statusColors['Planned'] = plannedColorPicker.value;
    if (currentTimelineDate) updateTimelineVisualState();
  });
}

const activeColorPicker = document.getElementById("4d-color-active") as HTMLInputElement | null;
if (activeColorPicker) {
  activeColorPicker.addEventListener("input", () => {
    ScheduleManager.statusColors['In Progress'] = activeColorPicker.value;
    if (currentTimelineDate) updateTimelineVisualState();
  });
}

const completeColorPicker = document.getElementById("4d-color-complete") as HTMLInputElement | null;
if (completeColorPicker) {
  completeColorPicker.addEventListener("input", () => {
    ScheduleManager.statusColors['Completed'] = completeColorPicker.value;
    if (currentTimelineDate) updateTimelineVisualState();
  });
}

const clearSelectionColorsBtn = document.getElementById("btn-clear-select-colors")!;
clearSelectionColorsBtn.addEventListener("click", async () => {
  await highlighter.clear("select");
  await highlighter.clear("hover");
  resetPropertiesPanel();
});

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
const gamePresetSelect = document.getElementById("settings-game-camera-preset") as HTMLSelectElement;
const fpsFovSlider = document.getElementById("settings-fps-fov") as HTMLInputElement;
const fpsFovVal = document.getElementById("val-fps-fov")!;
const fpsShakeToggle = document.getElementById("settings-fps-shake") as HTMLInputElement;
const fpsWeaponSelect = document.getElementById("settings-fps-weapon-style") as HTMLSelectElement;

const sportsHeightSlider = document.getElementById("settings-sports-height") as HTMLInputElement;
const sportsHeightVal = document.getElementById("val-sports-height")!;
const sportsZoomSlider = document.getElementById("settings-sports-zoom") as HTMLInputElement;
const sportsZoomVal = document.getElementById("val-sports-zoom")!;

const racingAttachmentSelect = document.getElementById("settings-racing-attachment") as HTMLSelectElement;
const racingFovSlider = document.getElementById("settings-racing-fov") as HTMLInputElement;
const racingFovVal = document.getElementById("val-racing-fov")!;

const tpDistanceSlider = document.getElementById("settings-thirdperson-distance") as HTMLInputElement;
const tpDistanceVal = document.getElementById("val-thirdperson-distance")!;
const tpAutoFollowToggle = document.getElementById("settings-thirdperson-autofollow") as HTMLInputElement;

const presetSubpanels = {
  FPS: document.getElementById("preset-options-fps")!,
  Sports: document.getElementById("preset-options-sports")!,
  Racing: document.getElementById("preset-options-racing")!,
  ThirdPerson: document.getElementById("preset-options-thirdperson")!,
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
  const settingsCameraMode = document.getElementById("settings-camera-mode") as HTMLSelectElement | null;
  if (settingsCameraMode) {
    settingsCameraMode.value = "Orbit";
    settingsCameraMode.disabled = false;
  }
  const settingsCameraProjection = document.getElementById("settings-camera-projection") as HTMLSelectElement | null;
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

  const settingsCameraMode = document.getElementById("settings-camera-mode") as HTMLSelectElement | null;
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
    const cameraModeEl = document.getElementById("settings-camera-mode") as HTMLSelectElement | null;
    if (cameraModeEl) cameraModeEl.value = "Orbit";
    world.camera.projection.set("Perspective");
  } else if (activePreset === "Racing") {
    world.camera.set("Orbit");
    const cameraModeEl = document.getElementById("settings-camera-mode") as HTMLSelectElement | null;
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
    const cameraModeEl = document.getElementById("settings-camera-mode") as HTMLSelectElement | null;
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

const settingsCameraModeSelect = document.getElementById("settings-camera-mode") as HTMLSelectElement | null;
if (settingsCameraModeSelect) {
  settingsCameraModeSelect.addEventListener("change", () => {
    const mode = settingsCameraModeSelect.value;
    world.camera.set(mode as any);
    if (mode === "Plan") {
      world.camera.projection.set("Orthographic");
      const projectionSelect = document.getElementById("settings-camera-projection") as HTMLSelectElement | null;
      if (projectionSelect) projectionSelect.value = "Orthographic";
      updateViewportHint("📐 2D Floorplan Mode Active — Mouse drag to Pan, wheel to Zoom");
    } else if (mode === "Orbit") {
      updateViewportHint("3D Orbit Mode Active — Left-drag to Orbit, Right-drag to Pan, Wheel to Zoom");
    } else if (mode === "FirstPerson") {
      updateViewportHint("🎮 First Person Walkthrough Active — Use WASD keys & Mouse to explore");
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
const toggleWASD = document.getElementById("settings-enable-wasd") as HTMLInputElement;
const wasdSpeedSlider = document.getElementById("settings-wasd-speed") as HTMLInputElement;
const wasdSpeedVal = document.getElementById("val-wasd-speed")!;
const mouseSensitivitySlider = document.getElementById("settings-mouse-sensitivity") as HTMLInputElement;
const mouseSensitivityVal = document.getElementById("val-mouse-sensitivity")!;
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

  const cameraModeSelect = document.getElementById("settings-camera-mode") as HTMLSelectElement | null;
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
}
animateFirstPerson();

const settingsCameraProjection = document.getElementById("settings-camera-projection")! as HTMLSelectElement;
settingsCameraProjection.addEventListener("change", () => {
  world.camera.projection.set(settingsCameraProjection.value as any);
});

const settingsCameraInput = document.getElementById("settings-camera-input")! as HTMLInputElement;
settingsCameraInput.addEventListener("change", () => {
  world.camera.setUserInput(settingsCameraInput.checked);
});

const btnCameraFit = document.getElementById("btn-camera-fit")!;
btnCameraFit.addEventListener("click", async () => {
  await world.camera.fit(world.meshes);
});

// --- TAPE MEASURE BINDINGS ---
const settingsToggleMeasure = document.getElementById("settings-toggle-measure")! as HTMLInputElement;
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

const btnClearMeasurements = document.getElementById("btn-clear-measurements")!;
btnClearMeasurements.addEventListener("click", () => {
  measurements.list.clear();
  measurements.cancelCreation();
});

// --- BCF ISSUE MANAGEMENT BINDINGS ---
const btnCreateBcfTopic = document.getElementById("btn-create-bcf-topic");
if (btnCreateBcfTopic) {
  btnCreateBcfTopic.addEventListener("click", () => {
    const titleInput = document.getElementById("bcf-topic-title") as HTMLInputElement | null;
    const descInput = document.getElementById("bcf-topic-desc") as HTMLTextAreaElement | null;
    const typeSelect = document.getElementById("bcf-topic-type") as HTMLSelectElement | null;
    const prioritySelect = document.getElementById("bcf-topic-priority") as HTMLSelectElement | null;

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

const btnExportBcf = document.getElementById("btn-export-bcf");
if (btnExportBcf) {
  btnExportBcf.addEventListener("click", async () => {
    await bcfManager.exportBCF();
  });
}

// --- DYNAMIC CATEGORY COLORING & THEME MAPPING ---
async function applyCategoryColors() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'cozy';
  const categoriesGroup = classifier.list.get("Categories");
  if (!categoriesGroup) return;

  for (const [categoryName, groupData] of categoriesGroup) {
    const colorHex = getCategoryColor(currentTheme, categoryName);
    const threeColor = new THREE.Color(colorHex);
    const map = await groupData.get();

    for (const modelId in map) {
      const model = fragments.list.get(modelId);
      if (!model) continue;

      const expressIds = map[modelId];
      if (!expressIds || expressIds.size === 0) continue;

      try {
        const material = new THREE.MeshStandardMaterial({
          color: threeColor,
          roughness: 0.4,
          metalness: 0.1,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        });

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
  const treeContainer = document.getElementById("classification-tree");
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
      
      const icon = classificationName === "Categories" ? "🧱" : "🏢";
      
      leaf.innerHTML = `
        <span class="tree-bullet">•</span>
        <span class="tree-icon">${icon}</span>
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
const sceneSearchInput = document.getElementById("scene-search") as HTMLInputElement;
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
const timelineSlider = document.getElementById("timeline-slider") as HTMLInputElement | null;
const timelinePlayBtn = document.getElementById("timeline-play-btn");
const timelineSpeedSelect = document.getElementById("timeline-speed") as HTMLSelectElement | null;

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
    const slider = document.getElementById("timeline-slider") as HTMLInputElement;
    const playBtn = document.getElementById("timeline-play-btn");

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
    timelineMinDate = null;
    timelineMaxDate = null;
    currentTimelineDate = null;

    const slider = document.getElementById("timeline-slider") as HTMLInputElement;
    const playBtn = document.getElementById("timeline-play-btn");
    const dateBadge = document.getElementById("timeline-date-badge");

    if (slider) {
      slider.value = "0";
      slider.setAttribute("disabled", "true");
    }
    if (playBtn) {
      playBtn.setAttribute("disabled", "true");
    }
    if (dateBadge) {
      dateBadge.innerText = "No Dates";
    }
  }
}

function updateTimelineDateUI() {
  if (!currentTimelineDate) return;
  const badge = document.getElementById("timeline-date-badge");
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
  await highlighter.clear("timeline-inprogress");

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

  // Update visibility & highlight
  if (hasPlanned) {
    await hider.set(false, plannedMap);
  }
  if (hasInProgress) {
    await hider.set(true, inProgressMap);
    await highlighter.highlightByID("timeline-inprogress", inProgressMap, true, false);
  }
  if (hasCompleted) {
    await hider.set(true, completedMap);
  }

  // Sync selected element inputs dynamically if properties panel is open for it
  if (activeModelId && activeExpressId !== null) {
    const selectedModel = fragments.list.get(activeModelId) as any;
    if (selectedModel && selectedModel.properties && selectedModel.properties[activeExpressId]) {
      const ifcType = String(selectedModel.properties[activeExpressId].type ?? "").toUpperCase();
      const twinData = getOrGenerateTwinData(activeModelId, activeExpressId, ifcType);
      
      const elStatus = document.getElementById("sched-status") as HTMLSelectElement;
      if (elStatus) elStatus.value = twinData.status;

      const elCostTotal = document.getElementById("cost-calculated-total");
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
  const container = document.getElementById("schedule-tasks-list");
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
        closeAllSidebars();
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
  const btn = document.getElementById("timeline-play-btn");
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
  timelinePlayBtn.addEventListener("click", () => {
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
  });
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
const btn4dMode = document.getElementById('btn-4d-mode')!;

function updateHeaderLabel() {
  const labelEl = document.getElementById('project-header-label');
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

  const btn4dMode = document.getElementById('btn-4d-mode');
  const btn4dLabel = document.getElementById('btn-4d-label');

  if (active) {
    document.body.classList.add('mode-4d');
    if (btn4dMode) btn4dMode.classList.add('active');
    if (btn4dLabel) btn4dLabel.textContent = 'Exit 4D';
    // Initialize timeline when 4D is activated
    calculateTimelineBounds();
    updateScheduleWidgetUI();
    updateTimelineVisualState();
  } else {
    document.body.classList.remove('mode-4d');
    if (btn4dMode) btn4dMode.classList.remove('active');
    if (btn4dLabel) btn4dLabel.textContent = 'Activate 4D';
    // Stop playback and restore all element visibility when leaving 4D mode
    stopTimelinePlayback();
    const hider = components.get(OBC.Hider);
    hider.set(true);
    highlighter.clear("timeline-inprogress");
  }
  updateHeaderLabel();
}

// Restore last 4D mode state on load
apply4dMode(is4dMode);

btn4dMode.addEventListener('click', () => apply4dMode(!is4dMode));

// --- 3D VIEW CUBE CONTROLLER ---
async function orientCameraToFace(face: string) {
  const target = new THREE.Vector3();
  world.camera.controls.getTarget(target);

  const box = new THREE.Box3();
  let hasModel = false;
  for (const [, model] of fragments.list) {
    box.expandByObject(model.object);
    hasModel = true;
  }

  let center = new THREE.Vector3();
  let d = 20;
  if (hasModel) {
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
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

const viewCube = document.getElementById("view-cube") as any;
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
  } catch (err) {
    console.warn("Failed to set camera projection mode:", err);
  }
}

const btnViewFit = document.getElementById("btn-view-fit");
const btnViewTop = document.getElementById("btn-view-top");
const btnViewIso = document.getElementById("btn-view-iso");
const tickerCamMode = document.getElementById("ticker-camera-mode");

if (btnViewFit) {
  btnViewFit.addEventListener("click", async () => {
    try {
      const box = new THREE.Box3();
      let hasModel = false;
      for (const [, model] of fragments.list) {
        box.expandByObject(model.object);
        hasModel = true;
      }
      if (hasModel) {
        await world.camera.controls.fitToBox(box, true);
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
    // 2. Orient camera to Isometric 3D view
    const target = new THREE.Vector3();
    world.camera.controls.getTarget(target);
    const box = new THREE.Box3();
    let hasModel = false;
    for (const [, model] of fragments.list) {
      box.expandByObject(model.object);
      hasModel = true;
    }
    let center = new THREE.Vector3();
    let d = 20;
    if (hasModel) {
      box.getCenter(center);
      const size = new THREE.Vector3();
      box.getSize(size);
      d = Math.max(size.x, size.y, size.z) * 1.35;
    } else {
      center.copy(target);
      d = world.camera.controls.distance || 20;
    }
    await world.camera.controls.setLookAt(center.x + d, center.y + d, center.z + d, center.x, center.y, center.z, true);
    if (tickerCamMode) tickerCamMode.textContent = "3D PERSPECTIVE ORBIT";
  });
}

// --- RESPONSIVE SIDEBAR DRAWER INTERACTION ---
const btnToggleLeft = document.getElementById("btn-toggle-left");
const btnToggleRight = document.getElementById("btn-toggle-right");
const leftSidebar = document.querySelector(".left-sidebar");
const rightSidebar = document.querySelector(".right-sidebar");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");

function closeAllSidebars() {
  leftSidebar?.classList.remove("open");
  rightSidebar?.classList.remove("open");
  sidebarBackdrop?.classList.remove("active");
}

if (btnToggleLeft && leftSidebar && sidebarBackdrop) {
  btnToggleLeft.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = leftSidebar.classList.contains("open");
    closeAllSidebars();
    if (!isOpen) {
      leftSidebar.classList.add("open");
      sidebarBackdrop.classList.add("active");
    }
  });
}

if (btnToggleRight && rightSidebar && sidebarBackdrop) {
  btnToggleRight.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = rightSidebar.classList.contains("open");
    closeAllSidebars();
    if (!isOpen) {
      rightSidebar.classList.add("open");
      sidebarBackdrop.classList.add("active");
    }
  });
}

if (sidebarBackdrop) {
  sidebarBackdrop.addEventListener("click", () => {
    closeAllSidebars();
  });
}

window.addEventListener("resize", () => {
  if (window.innerWidth > 1024) {
    closeAllSidebars();
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

// ============================================================
// TACTICAL SEGMENTED TAB SYSTEM CONTROLLER
// ============================================================
function setupSidebarTabSystem() {
  const leftTabButtons = document.querySelectorAll('#left-tab-bar .sidebar-tab-btn');
  const rightTabButtons = document.querySelectorAll('#right-tab-bar .sidebar-tab-btn');

  function switchSidebarTab(barId: string, tabName: string) {
    const isLeft = barId === 'left-tab-bar';
    const buttons = isLeft ? leftTabButtons : rightTabButtons;
    const prefix = isLeft ? 'tab-left-' : 'tab-right-';

    buttons.forEach((btn) => {
      if (btn.getAttribute('data-tab') === tabName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    const panels = document.querySelectorAll(isLeft ? '.left-sidebar .tab-content-panel' : '.right-sidebar .tab-content-panel');
    panels.forEach((panel) => {
      if (panel.id === `${prefix}${tabName}`) {
        panel.classList.add('active');
      } else {
        panel.classList.remove('active');
      }
    });
  }

  leftTabButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tab = btn.getAttribute('data-tab');
      if (tab) switchSidebarTab('left-tab-bar', tab);
    });
  });

  rightTabButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tab = btn.getAttribute('data-tab');
      if (tab) switchSidebarTab('right-tab-bar', tab);
    });
  });

  // Keyboard Shortcuts (Key 1..3 for Left, 4..7 for Right, ? for shortcuts modal)
  window.addEventListener('keydown', (e) => {
    const activeEl = document.activeElement;
    const isTyping = activeEl && (
      activeEl.tagName === 'INPUT' ||
      activeEl.tagName === 'TEXTAREA' ||
      activeEl.tagName === 'SELECT' ||
      (activeEl as HTMLElement).isContentEditable
    );

    if (e.key === '?' || (e.shiftKey && e.key === '/')) {
      if (!isTyping) {
        e.preventDefault();
        if (typeof (window as any).toggleShortcutsModal === "function") {
          (window as any).toggleShortcutsModal();
        }
      }
      return;
    }

    if (isTyping) return;

    switch (e.key) {
      case '1': switchSidebarTab('left-tab-bar', 'files'); break;
      case '2': switchSidebarTab('left-tab-bar', 'finder'); break;
      case '3': switchSidebarTab('left-tab-bar', 'schedule'); break;
      case '4': switchSidebarTab('right-tab-bar', 'scene'); break;
      case '5': switchSidebarTab('right-tab-bar', 'inspector'); break;
      case '6': switchSidebarTab('right-tab-bar', 'controls'); break;
      case '7': switchSidebarTab('right-tab-bar', 'tools'); break;
    }
  });

  // Expose switchSidebarTab globally so other components can switch tabs automatically
  (window as any).switchSidebarTab = switchSidebarTab;
}

setupSidebarTabSystem();

// ============================================================
// WELCOME TUTORIAL / HELP MODAL CONTROLLER
// ============================================================

const helpModal = document.getElementById("shortcuts-modal");
const btnShortcutsToggle = document.getElementById("btn-shortcuts-toggle");
const btnShortcutsClose  = document.getElementById("btn-shortcuts-close");
const btnHelpNext        = document.getElementById("btn-help-next") as HTMLButtonElement | null;
const btnHelpPrev        = document.getElementById("btn-help-prev") as HTMLButtonElement | null;
const btnHelpDone        = document.getElementById("btn-help-done") as HTMLButtonElement | null;
const helpDontShow       = document.getElementById("help-dont-show-again") as HTMLInputElement | null;

// Tab order
const HELP_TABS = ["welcome", "tools", "shortcuts", "navigate"] as const;
type HelpTab = typeof HELP_TABS[number];
let helpCurrentTab: HelpTab = "welcome";

function switchHelpTab(tab: HelpTab) {
  helpCurrentTab = tab;

  // Update tab buttons
  document.querySelectorAll(".help-tab-btn").forEach((btn) => {
    const isActive = (btn as HTMLElement).getAttribute("data-help-tab") === tab;
    btn.classList.toggle("active", isActive);
  });

  // Update panels
  document.querySelectorAll(".help-tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `help-tab-${tab}`);
  });

  // Update footer prev/next/done visibility
  const idx = HELP_TABS.indexOf(tab);
  if (btnHelpPrev) btnHelpPrev.classList.toggle("hidden", idx === 0);
  if (btnHelpNext) btnHelpNext.classList.toggle("hidden", idx === HELP_TABS.length - 1);
  if (btnHelpDone) btnHelpDone.classList.toggle("hidden", idx !== HELP_TABS.length - 1);
}

// Expose toggle globally for the ? hotkey (replaces old toggleShortcutsModal)
function toggleShortcutsModal(forceOpen?: boolean) {
  if (!helpModal) return;
  const isHidden = helpModal.classList.contains("hidden");
  if (forceOpen === true || (forceOpen === undefined && isHidden)) {
    openHelpModal("welcome");
  } else {
    closeHelpModal();
  }
}
(window as any).toggleShortcutsModal = toggleShortcutsModal;

function openHelpModal(startTab: HelpTab = "welcome") {
  if (!helpModal) return;
  helpModal.classList.remove("hidden");
  switchHelpTab(startTab);
}

function closeHelpModal() {
  if (!helpModal) return;
  helpModal.classList.add("hidden");
  // Persist "don't show again" preference
  if (helpDontShow?.checked) {
    localStorage.setItem("bim-help-dont-show", "1");
  }
}

// Wire tab buttons
document.querySelectorAll(".help-tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = (btn as HTMLElement).getAttribute("data-help-tab") as HelpTab;
    if (tab) switchHelpTab(tab);
  });
});

// Wire prev/next/done navigation
if (btnHelpNext) {
  btnHelpNext.addEventListener("click", () => {
    const idx = HELP_TABS.indexOf(helpCurrentTab);
    if (idx < HELP_TABS.length - 1) switchHelpTab(HELP_TABS[idx + 1]);
  });
}
if (btnHelpPrev) {
  btnHelpPrev.addEventListener("click", () => {
    const idx = HELP_TABS.indexOf(helpCurrentTab);
    if (idx > 0) switchHelpTab(HELP_TABS[idx - 1]);
  });
}
if (btnHelpDone) {
  btnHelpDone.addEventListener("click", closeHelpModal);
}

// Wire header close button and overlay backdrop click
if (btnShortcutsClose) {
  btnShortcutsClose.addEventListener("click", closeHelpModal);
}
if (helpModal) {
  helpModal.addEventListener("click", (e) => {
    if (e.target === helpModal) closeHelpModal();
  });
}

// Wire keybinds button in header
if (btnShortcutsToggle) {
  btnShortcutsToggle.addEventListener("click", () => {
    if (helpModal?.classList.contains("hidden")) {
      openHelpModal("welcome");
    } else {
      closeHelpModal();
    }
  });
}

// Auto-show on first visit (unless user dismissed it before)
const FIRST_VISIT_KEY = "bim-help-dont-show";
if (!localStorage.getItem(FIRST_VISIT_KEY)) {
  // Defer to after model check / page settle
  setTimeout(() => openHelpModal("welcome"), 800);
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

// ============================================================
// 5D CUMULATIVE PROJECT COST CALCULATOR
// ============================================================
function updateCumulative5DCost() {
  const grandTotalEl = document.getElementById("cost-project-grand-total");
  const countEl = document.getElementById("cost-project-elements-count");
  if (!grandTotalEl || !countEl) return;

  let grandTotal = 0;
  let elementCount = 0;

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

      if (twinData.calculatedCost) {
        grandTotal += twinData.calculatedCost;
        elementCount++;
      }
    }
  }

  grandTotalEl.textContent = `$${grandTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  countEl.textContent = `${elementCount.toLocaleString()} items`;
}

// Trigger initial cost calculation & expose globally
updateCumulative5DCost();
(window as any).updateCumulative5DCost = updateCumulative5DCost;

// ============================================================
// SENIOR UI MOBILE BOTTOM NAVIGATION HANDLER
// ============================================================
const mobileNavBtns = document.querySelectorAll<HTMLButtonElement>(".mobile-nav-btn");
mobileNavBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const targetTab = btn.getAttribute("data-mobile-tab");
    if (!targetTab) return;

    const leftSidebar = document.querySelector(".left-sidebar");
    const rightSidebar = document.querySelector(".right-sidebar");
    const isLeftOpen = leftSidebar?.classList.contains("open");
    const isRightOpen = rightSidebar?.classList.contains("open");
    const isBtnActive = btn.classList.contains("active");

    // Toggle drawer closed if tapping active tab while open
    if (isBtnActive && (isLeftOpen || isRightOpen)) {
      closeAllSidebars();
      return;
    }

    mobileNavBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    if (targetTab === "files" || targetTab === "finder" || targetTab === "sched") {
      rightSidebar?.classList.remove("open");
      leftSidebar?.classList.add("open");

      const actualTab = targetTab === "sched" ? "schedule" : targetTab;
      const tabBtn = document.querySelector<HTMLButtonElement>(`#left-tab-bar [data-tab="${actualTab}"]`);
      if (tabBtn) tabBtn.click();
    } else if (targetTab === "scene" || targetTab === "tools") {
      leftSidebar?.classList.remove("open");
      rightSidebar?.classList.add("open");

      const tabBtn = document.querySelector<HTMLButtonElement>(`#right-tab-bar [data-tab="${targetTab}"]`);
      if (tabBtn) tabBtn.click();
    }

    const backdrop = document.getElementById("sidebar-backdrop");
    if (backdrop) backdrop.classList.add("active");
  });
});

// ============================================================
// THEME SWITCHER HANDLER
// ============================================================
const themeSelect = document.getElementById("select-theme-toggle") as HTMLSelectElement | null;
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

