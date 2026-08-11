# 4D/5D IFC BIM Viewer & Digital Twin Dashboard

An enterprise-grade, fully responsive Web BIM Viewer, 4D Construction Simulation engine, and 5D Cost Estimating Dashboard built using `@thatopen/components` (Fragments API), Three.js, and Vanilla TypeScript. This application features a premium frosted glassmorphic UI, responsive mobile/tablet layout styling, BCF 2.1/3.0 issue tracking, IDS data compliance audits, and offline IndexedDB caching.

---

## 🏢 Overview & Architectural Capabilities

Building Information Modeling (BIM) connects 3D spatial models with rich parameter databases (e.g. dimensions, materials, IFC entity types, property sets). This viewer provides a high-performance web suite for loaded IFC models without server processing delays.

For a complete walkthrough of concepts, prerequisites, features, and debugging guides, check out our **[Developer Onboarding Guide](ONBOARDING.md)**.

---

## 🌟 Key Features

### 1. High-Performance 3D Viewport
- **IFC & Fragment Loading**: Fast local IFC parsing using WebAssembly-backed loaders with IndexedDB caching.
- **Sample Model Loading**: Instant download and loading of sample models (e.g., `school_arq.frag`) for testing.
- **3D Navigation Modes**: Orbit, First-Person Walkthrough (WASD / Mouse look), and 2D Plan view.
- **Section Planes (Clipper)**: Add dynamic section cuts in real-time by double-clicking in the viewport.

### 2. 4D Construction Scheduling Engine
- **Trade Sequencing**: Automatically sequences construction tasks (`IFCSITE` → `IFCFOOTING` → `IFCSLAB` → `IFCWALL` → `IFCROOF` → MEP).
- **Timeline Playback**: Interactive timeline slider with speed controls (`1x`, `2x`, `5x`, `10x`) and visual state highlighting (Planned = Hidden, In Progress = Pulsing Highlight, Completed = Solid).
- **4D Schedule Task List**: Dedicated dock panel displaying task progress percentages, date ranges, and 1-click element isolation.

### 3. 5D Cost Estimating & BOQ Generation
- **Quantity Extraction**: Automatically parses standard `Qto_*` property sets (`NetArea`, `NetVolume`, `Length`, `Count`) and custom properties (`Material Number`, `Qty`).
- **BOQ Export**: 1-click export of Bills of Quantities as structured `.csv` files.
- **Cumulative Project Budget**: Aggregates total cost and element metrics in real-time.

### 4. BCF Issue Management (BCF 2.1 / 3.0)
- **Issue Tracking**: Create BCF topics with type (`Clash`, `Coordination`, `Schedule Risk`, `Cost OVR`), priority, and description.
- **Viewpoint Anchoring**: Automatically links 3D camera viewpoints and selection states to created topics.
- **BCF Export**: Export tracked issues as standardized `.bcfzip` archives for external BIM tools (Solibri, Revit, Navisworks).

### 5. IDS Data Compliance Audit (`OBC.IDSSpecifications`)
- **Automated Validation**: Audits loaded IFC models against Information Delivery Specifications to ensure required 4D/5D parameters exist.
- **Pass/Fail Breakdown**: Reports passing vs failing element counts and missing property sets.

### 6. Dynamic Category Theming
- **5 Palette Presets**: Default Dark, Cozy Studio, Blue Pen Drafting, Cyberpunk, and Light Mode.
- **22 IFC Category Colors**: Material color mapping per category (`IFCWALL`, `IFCSLAB`, `IFCCOLUMN`, `IFCDOOR`, `IFCWINDOW`, etc.).

### 7. Cross-Device Responsive UI
- **Mobile, Tablet & Desktop**: Adaptive grid switching to slide-out drawers on touch devices with `touch-action: none` viewport locking.
- **Auto-Dismiss Drawers**: Drawers collapse on mobile screens upon task selection for full-screen 3D inspection.

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- npm (Node Package Manager)

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/lalithebinezer/TOC.git
   cd TOC
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Running Locally
Launch the development server:
```bash
npm run dev
```
Open [http://localhost:3000/TOC/](http://localhost:3000/TOC/) in your browser.

### Building for Production
Generate the production bundle in `/dist`:
```bash
npm run build
```

---

## 🖱️ How to Use

1. **Load Model**: Click **Load IFC** in the toolbar or click **Load Sample** to load the school model.
2. **Inspect Properties**: Double-click any 3D element to view properties, quantities, unit costs, and schedule status.
3. **4D Timeline**: Click **Activate 4D** in the top header and press **Play Simulation** to watch the timeline sequence.
4. **Export BOQ**: Click **Export Bills of Quantities (BOQ CSV)** in the 5D inspector section to download project cost data.
5. **Log BCF Issue**: Open the **Tools** tab in the right dock, fill in issue details, and click **Log BCF Issue** or **Export .bcfzip**.
6. **Run IDS Audit**: Click **Validate IDS 4D/5D Data Readiness** in the inspector panel to check BIM model compliance.
