import './style.css';
import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as BUI from "@thatopen/ui";
import { PropertyEditor, initPropertyEditorUI } from "./PropertyEditor";

BUI.Manager.init();

// --- THEME TOGGLE ---
function initTheme() {
  const saved = localStorage.getItem('bim-theme');
  if (saved === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }
}
initTheme();

// --- 3D ENVIRONMENT SETUP ---
const components = new OBC.Components();
const worlds = components.get(OBC.Worlds);

// Create world with SimpleScene, SimpleCamera, and PostproductionRenderer
const world = worlds.create<
  OBC.ShadowedScene,
  OBC.OrthoPerspectiveCamera,
  OBF.PostproductionRenderer
>();

const scene = new OBC.ShadowedScene(components);
world.scene = scene;

const container = document.getElementById("container")!;
world.renderer = new OBF.PostproductionRenderer(components, container);
world.renderer.three.shadowMap.enabled = true;
world.renderer.three.shadowMap.type = THREE.PCFSoftShadowMap;
world.camera = new OBC.OrthoPerspectiveCamera(components);

scene.setup();
scene.three.background = null; // Use transparent background for our body styling
world.onCameraChanged.add((camera) => {
  for (const [, model] of fragments.list) {
    model.useCamera(camera.three);
  }
});
if (world.renderer) {
  world.renderer.showLogo = true;
}

// Initialize components system
components.init();

// Add a standard Grid Helper
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

// --- BIM & GEOMETRY INGESTION SETUP ---
const fragments = components.get(OBC.FragmentsManager);
fragments.init(import.meta.env.BASE_URL + "worker.mjs");
const ifcLoader = components.get(OBC.IfcLoader);

// --- CLIPPER (SECTION PLANES) SETUP ---
const clipper = components.get(OBC.Clipper);
clipper.enabled = false;

// Initialize Raycasters for Clipper section plane picking
const raycasters = components.get(OBC.Raycasters);
raycasters.get(world);

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

  // Initial status determined by start date relative to project start/current date
  let status: "Planned" | "In Progress" | "Completed" = "Planned";
  const currentMs = projectStart.getTime();
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

    // Initial status determined by start date relative to project start/current date
    let status: "Planned" | "In Progress" | "Completed" = "Planned";
    const currentMs = projectStart.getTime(); // Treat projectStart as current date initially
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
      <div class="list-item-val" style="font-weight:600; color:#fff;">
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
  activeModelId = model.uuid || model.id || (model.object && model.object.uuid) || "default-model";
  activeExpressId = expressId;

  const elementProps = properties[expressId];
  if (!elementProps) return;

  document.getElementById("properties-empty-state")!.style.display = "none";
  document.getElementById("properties-selected-state")!.style.display = "flex";

  // Render all properties dynamically
  const tableEl = document.querySelector(".properties-widget .property-table")!;
  tableEl.innerHTML = "";

  addPropertyRow(tableEl, "Express ID", String(expressId));
  if (elementProps.type) {
    const entityName = getIfcEntityName(elementProps.type);
    addPropertyRow(tableEl, "IFC Entity", entityName, "color-green");
  }
  
  const nameVal = elementProps.Name ? getPropValue(elementProps.Name) : "Unnamed Element";
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

  // Resolve type relation (IFCRELDEFINESBYTYPE)
  let typeElementId: number | null = null;
  for (const id in properties) {
    const rel = properties[id];
    if (rel && rel.type === "IFCRELDEFINESBYTYPE") {
      const relatedObjects = rel.RelatedObjects;
      if (relatedObjects) {
        let isRelated = false;
        if (Array.isArray(relatedObjects)) {
          isRelated = relatedObjects.some((obj: any) => {
            const val = obj.value ?? obj;
            return Number(val) === expressId;
          });
        } else {
          const val = relatedObjects.value ?? relatedObjects;
          isRelated = Number(val) === expressId;
        }

        if (isRelated) {
          const relatingType = rel.RelatingType;
          if (relatingType) {
            typeElementId = Number(relatingType.value ?? relatingType);
          }
          break;
        }
      }
    }
  }

  // Resolve and render property sets!
  const psets = resolveElementPropertySets(properties, expressId);
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

  // Retrieve 4D/5D data from local twin database or generate mock
  const ifcType = String(elementProps.type ?? "").toUpperCase();
  const twinData = getOrGenerateTwinData(activeModelId || "default-model", expressId, ifcType);

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

function resetPropertiesPanel() {
  activeModelId = null;
  activeExpressId = null;
  document.getElementById("properties-empty-state")!.style.display = "flex";
  document.getElementById("properties-selected-state")!.style.display = "none";
  if (propertyEditor) {
    propertyEditor.deselect();
  }
}

// Wire real-time cost calculator logic
const updateCalculatedCost = () => {
  const unit = Number(costUnit.value) || 0;
  const qty = Number(costQty.value) || 0;
  costCalc.innerText = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(unit * qty);
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
    document.getElementById("loading-overlay")!.classList.add("hidden");

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

  if (fragments.list.size === 0) {
    const empty = document.createElement('div');
    empty.className = 'file-list-empty';
    empty.id = 'file-list-empty';
    empty.textContent = 'No models loaded. Upload an IFC file or load a sample.';
    fileListEl.appendChild(empty);
    return;
  }

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
    visBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      visible = !visible;
      model.object.visible = visible;
      visBtn.classList.toggle('active-icon', !visible);
      if (!visible) {
        (visBtn as HTMLElement).style.opacity = '0.4';
      } else {
        (visBtn as HTMLElement).style.opacity = '1';
      }
    });

    // Delete button
    const delBtn = item.querySelector('.btn-delete')!;
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      try {
        world.scene.three.remove(model.object);
        fragments.list.delete(modelId);
        fragments.core.update(true);
      } catch (err) {
        console.warn('Error removing model:', err);
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
          autoSetWasm: false,
          wasm: {
            path: import.meta.env.BASE_URL,
            absolute: true,
          }
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
        console.log(`Cache miss for ${name}. Converting IFC via WASM loader...`);
        text.innerText = "Converting IFC to Fragments...";
        model = await ifcLoader.load(buffer, true, name);
        
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
      // Enable shadows if checked
      const shadowsOn = shadowsToggle.checked;
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

      // Sync/generate local database twin properties using classifications
      await initializeModelTwinData(model);

      console.log("CLASSIFIER: starting updateClassificationUI");
      await updateClassificationUI();
      console.log("CLASSIFIER: updateClassificationUI done");
      calculateTimelineBounds();

      // Force renderer to resize and update layout
      if (world.renderer) {
        world.renderer.resize();
      }
      window.dispatchEvent(new Event('resize'));

      // Set to viewer mode (exit 4D) initially when a project is loaded
      apply4dMode(false);

      // Fit camera controls box around loaded model
      setTimeout(async () => {
        try {
          console.log("LOADED MODEL:", model);
          console.log("MODEL.OBJECT:", model ? model.object : undefined);
          const box = new THREE.Box3().setFromObject(model.object);
          await world.camera.controls.fitToBox(box, true);
        } catch (err) {
          console.warn("Camera fitToBox failed:", err);
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
const loadSampleBtn = document.getElementById("load-sample-btn")!;
loadSampleBtn.addEventListener("click", async () => {
  const url = "https://thatopen.github.io/engine_components/resources/frags/school_arq.frag";
  try {
    loadSampleBtn.setAttribute("disabled", "true");
    loadSampleBtn.innerText = "Downloading...";

    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    await loadModelData("school_arq.frag", uint8Array);
  } catch (err) {
    console.error("Failed to fetch sample file:", err);
    alert("Could not load sample model. Check internet connectivity.");
  } finally {
    loadSampleBtn.removeAttribute("disabled");
    loadSampleBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
      </svg>
      Load Sample
    `;
  }
});

// Bottom Toolbar Actions: Visibility
const showAllBtn = document.getElementById("btn-show-all")!;
showAllBtn.addEventListener("click", async () => {
  const hider = components.get(OBC.Hider);
  await hider.set(true);
});

const hideAllBtn = document.getElementById("btn-hide-all")!;
hideAllBtn.addEventListener("click", async () => {
  const hider = components.get(OBC.Hider);
  await hider.set(false);
});

// Bottom Toolbar Actions: Data
const loadIfcBtn = document.getElementById("btn-load-ifc")!;
loadIfcBtn.addEventListener("click", () => {
  fileInput.click();
});

// Bottom Toolbar Actions: Selection
const focusBtn = document.getElementById("btn-focus")!;
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

const hideSelectedBtn = document.getElementById("btn-hide-selected")!;
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

const isolateBtn = document.getElementById("btn-isolate")!;
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

const clearSelectionBtn = document.getElementById("btn-clear-selection")!;
clearSelectionBtn.addEventListener("click", async () => {
  await highlighter.clear("select");
  resetPropertiesPanel();
});

// Bottom Toolbar Actions: Sectioning
const clipperBtn = document.getElementById("btn-section-cut")!;
clipperBtn.addEventListener("click", () => {
  clipper.enabled = !clipper.enabled;
  clipperBtn.classList.toggle("active", clipper.enabled);
});

const clearClipsBtn = document.getElementById("btn-clear-sections")!;
clearClipsBtn.addEventListener("click", () => {
  clipper.deleteAll();
});

// Wire and render Items Finder queries dynamically based on model classification categories
function updateItemFinderQueries() {
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

  // 2. Add dynamic categories found in model classification tree
  const categoriesGroup = classifier.list.get("Categories");
  if (categoriesGroup && fragments.list.size > 0) {
    for (const [groupName] of categoriesGroup) {
      // Clean up IFC prefix if present for visual elegance
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

const clearSelectionColorsBtn = document.getElementById("btn-clear-select-colors")!;
clearSelectionColorsBtn.addEventListener("click", async () => {
  await highlighter.clear("select");
  await highlighter.clear("hover");
  resetPropertiesPanel();
});

// --- CAMERA NAVIGATION & PROJECTIONS BINDINGS ---
const settingsCameraMode = document.getElementById("settings-camera-mode")! as HTMLSelectElement;
settingsCameraMode.addEventListener("change", () => {
  world.camera.set(settingsCameraMode.value);
});

// WASD Keyboard Navigation for First Person Mode
const keyBindings = {
  forward: localStorage.getItem("key-bind-forward") || "w",
  left: localStorage.getItem("key-bind-left") || "a",
  backward: localStorage.getItem("key-bind-backward") || "s",
  right: localStorage.getItem("key-bind-right") || "d",
};

const firstPersonKeys = { forward: false, left: false, backward: false, right: false };

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
  if (pressedKey === keyBindings.forward) firstPersonKeys.forward = true;
  if (pressedKey === keyBindings.left) firstPersonKeys.left = true;
  if (pressedKey === keyBindings.backward) firstPersonKeys.backward = true;
  if (pressedKey === keyBindings.right) firstPersonKeys.right = true;
});

window.addEventListener("keyup", (e) => {
  if (activeBindingAction) return;

  const pressedKey = e.key.toLowerCase();
  if (pressedKey === keyBindings.forward) firstPersonKeys.forward = false;
  if (pressedKey === keyBindings.left) firstPersonKeys.left = false;
  if (pressedKey === keyBindings.backward) firstPersonKeys.backward = false;
  if (pressedKey === keyBindings.right) firstPersonKeys.right = false;
});

// Update rotateSpeed on camera controls initialization/change
world.camera.controls.addEventListener("update", () => {
  if (world.camera.controls && (world.camera.controls as any).rotateSpeed !== mouseSensitivity) {
    (world.camera.controls as any).rotateSpeed = mouseSensitivity;
  }
});

function animateFirstPerson() {
  requestAnimationFrame(animateFirstPerson);
  if (settingsCameraMode.value !== "FirstPerson") return;
  if (!toggleWASD.checked) return;

  const controls = world.camera.controls;
  if (!controls) return;

  if (firstPersonKeys.forward) controls.forward(movementSpeed, false);
  if (firstPersonKeys.backward) controls.forward(-movementSpeed, false);
  if (firstPersonKeys.left) controls.truck(-movementSpeed, 0, false);
  if (firstPersonKeys.right) controls.truck(movementSpeed, 0, false);
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
let timelineMinDate: Date | null = null;
let timelineMaxDate: Date | null = null;
let currentTimelineDate: Date | null = null;
let timelineTimer: number | null = null;
let timelineIsPlaying = false;
let timelineSpeed = 2; // Days per second

const timelineSlider = document.getElementById("timeline-slider")! as HTMLInputElement;
const timelinePlayBtn = document.getElementById("timeline-play-btn")!;
const timelineSpeedSelect = document.getElementById("timeline-speed")! as HTMLSelectElement;
const timelineDateBadge = document.getElementById("timeline-date-badge")!;

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
    timelineSlider.removeAttribute("disabled");
    timelinePlayBtn.removeAttribute("disabled");

    // Configure slider range (in total days)
    const diffDays = Math.ceil((timelineMaxDate.getTime() - timelineMinDate.getTime()) / (1000 * 60 * 60 * 24));
    timelineSlider.max = String(diffDays);
    timelineSlider.value = "0";

    updateTimelineDateUI();
    updateTimelineVisualState();
  } else {
    timelineMinDate = null;
    timelineMaxDate = null;
    currentTimelineDate = null;
    timelineSlider.value = "0";
    timelineSlider.setAttribute("disabled", "true");
    timelinePlayBtn.setAttribute("disabled", "true");
    timelineDateBadge.innerText = "No Dates";
  }
}

function updateTimelineDateUI() {
  if (!currentTimelineDate) return;
  const year = currentTimelineDate.getFullYear();
  const month = String(currentTimelineDate.getMonth() + 1).padStart(2, '0');
  const day = String(currentTimelineDate.getDate()).padStart(2, '0');
  timelineDateBadge.innerText = `${year}-${month}-${day}`;
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
        timelineSlider.value = String(diffDays);
        
        updateTimelineDateUI();
        await updateTimelineVisualState();
      }
    });

    container.appendChild(item);
  }
}

function startTimelinePlayback() {
  if (timelineIsPlaying || !timelineMinDate) return;
  timelineIsPlaying = true;
  timelinePlayBtn.classList.add("playing");
  timelinePlayBtn.innerHTML = `
    <span class="ctrl-icon">⏸</span>
    <span>Pause Simulation</span>
  `;

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
      timelineSlider.value = timelineSlider.max;
      updateTimelineDateUI();
      updateTimelineVisualState();
      stopTimelinePlayback();
    } else {
      currentTimelineDate = new Date(newMs);
      const diffMs = currentTimelineDate.getTime() - timelineMinDate.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      timelineSlider.value = String(diffDays);
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
  timelinePlayBtn.classList.remove("playing");
  timelinePlayBtn.innerHTML = `
    <span class="ctrl-icon">▶</span>
    <span>Play Simulation</span>
  `;
}

// Scrubber events
timelineSlider.addEventListener("input", () => {
  if (!timelineMinDate) return;
  const daysOffset = Number(timelineSlider.value);
  currentTimelineDate = new Date(timelineMinDate.getTime() + (daysOffset * 24 * 60 * 60 * 1000));
  updateTimelineDateUI();
  updateTimelineVisualState();
});

timelinePlayBtn.addEventListener("click", () => {
  if (timelineIsPlaying) {
    stopTimelinePlayback();
  } else {
    // If we are at the end, restart from beginning
    if (currentTimelineDate && timelineMaxDate && currentTimelineDate.getTime() >= timelineMaxDate.getTime()) {
      currentTimelineDate = new Date(timelineMinDate!);
      timelineSlider.value = "0";
    }
    startTimelinePlayback();
  }
});

timelineSpeedSelect.addEventListener("change", () => {
  timelineSpeed = Number(timelineSpeedSelect.value);
});

// Initial empty state call
updateClassificationUI();
calculateTimelineBounds();

// --- THEME TOGGLE BUTTON ---
const themeToggleBtn = document.getElementById('btn-theme-toggle');
if (themeToggleBtn) {
  // Set initial icon based on current theme
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  themeToggleBtn.textContent = isLight ? '☀️' : '🌙';

  themeToggleBtn.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    if (currentTheme === 'light') {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('bim-theme', 'dark');
      themeToggleBtn.textContent = '🌙';
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('bim-theme', 'light');
      themeToggleBtn.textContent = '☀️';
    }
  });
}

// --- 4D MODE TOGGLE ---
let is4dMode = localStorage.getItem('bim-4d-mode') === 'true';
const btn4dMode = document.getElementById('btn-4d-mode')!;
const btn4dLabel = document.getElementById('btn-4d-label')!;

function updateHeaderLabel() {
  const labelEl = document.getElementById('project-header-label');
  if (!labelEl) return;
  
  let projectName = "Projects";
  if (fragments.list.size > 0) {
    // Get the name of the first loaded model
    const firstEntry = fragments.list.entries().next().value;
    if (firstEntry) {
      const [firstModelId, firstModel] = firstEntry;
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

  if (active) {
    document.body.classList.add('mode-4d');
    btn4dMode.classList.add('active');
    btn4dLabel.textContent = 'Exit 4D';
    // Initialize timeline when 4D is first activated
    calculateTimelineBounds();
    updateScheduleWidgetUI();
  } else {
    document.body.classList.remove('mode-4d');
    btn4dMode.classList.remove('active');
    btn4dLabel.textContent = 'Activate 4D';
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
function updateViewCubeOrientation() {
  const cube = document.getElementById("view-cube");
  if (!cube) return;

  const camera = world.camera.three;
  camera.updateMatrixWorld(true);
  const matrix = new THREE.Matrix4();
  matrix.extractRotation(camera.matrixWorld);

  const e = matrix.elements;
  // Apply rotation matrix to CSS 3D matrix3d to map Three.js coordinates to CSS
  cube.style.transform = `matrix3d(
    ${e[0].toFixed(6)}, ${-e[1].toFixed(6)}, ${-e[2].toFixed(6)}, 0,
    ${-e[4].toFixed(6)}, ${e[5].toFixed(6)}, ${e[6].toFixed(6)}, 0,
    ${-e[8].toFixed(6)}, ${e[9].toFixed(6)}, ${e[10].toFixed(6)}, 0,
    0, 0, 0, 1
  )`;
}

// Track dragging variables
let isDraggingCube = false;
let startPointerX = 0;
let startPointerY = 0;
let hasDraggedCube = false;
let clickedFace: string | null = null;

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
    case "front":
      posZ += d;
      break;
    case "back":
      posZ -= d;
      break;
    case "left":
      posX -= d;
      break;
    case "right":
      posX += d;
      break;
    case "top":
      posY += d;
      break;
    case "bottom":
      posY -= d;
      break;
  }

  await world.camera.controls.setLookAt(posX, posY, posZ, center.x, center.y, center.z, true);
}

const viewCubeContainer = document.querySelector(".view-cube-container");
if (viewCubeContainer) {
  viewCubeContainer.addEventListener("pointerdown", (e: any) => {
    const faceEl = e.target.closest(".cube-face");
    clickedFace = faceEl ? faceEl.getAttribute("data-face") : null;
    
    isDraggingCube = true;
    hasDraggedCube = false;
    startPointerX = e.clientX;
    startPointerY = e.clientY;
    viewCubeContainer.setPointerCapture(e.pointerId);
  });

  viewCubeContainer.addEventListener("pointermove", (e: any) => {
    if (!isDraggingCube) return;
    const dx = e.clientX - startPointerX;
    const dy = e.clientY - startPointerY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      hasDraggedCube = true;
    }
    
    // Scale factor to translate screen pixels to relative rotation in camera controls
    const speed = mouseSensitivity * 0.005; 
    
    world.camera.controls.rotate(-dx * speed, -dy * speed, false);
    
    startPointerX = e.clientX;
    startPointerY = e.clientY;
  });

  viewCubeContainer.addEventListener("pointerup", async (e: any) => {
    if (isDraggingCube) {
      isDraggingCube = false;
      viewCubeContainer.releasePointerCapture(e.pointerId);
      
      if (!hasDraggedCube && clickedFace) {
        await orientCameraToFace(clickedFace);
      }
    }
    clickedFace = null;
  });

  viewCubeContainer.addEventListener("pointercancel", (e: any) => {
    if (isDraggingCube) {
      isDraggingCube = false;
      viewCubeContainer.releasePointerCapture(e.pointerId);
    }
    clickedFace = null;
  });
}

// Add event listener to camera controls to sync rotation on every update
world.camera.controls.addEventListener("control", updateViewCubeOrientation);
world.camera.controls.addEventListener("update", updateViewCubeOrientation);

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
  minimizeBtn.title = "Collapse Panel";
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
setTimeout(updateViewCubeOrientation, 500);

