# BIM Viewer & Digital Twin Dashboard

An enterprise-grade, fully responsive Web BIM Viewer and 4D/5D Digital Twin Dashboard built using `@thatopen/components` (Fragments API), Three.js, and Vanilla TypeScript. This application features a premium frosted glassmorphic UI, responsive layout styling, and offline IndexedDB caching.

---

## 🌟 Key Features

### 1. High-Performance 3D Viewport
- **IFC & Fragment Loading**: Fast local IFC parsing using WebAssembly-backed loaders. Includes instant caching using IndexedDB to bypass parsing delays on subsequent loads.
- **Sample Files**: Direct download and loading of standard sample models (e.g., `school_arq.frag`) for testing.
- **3D Navigation Modes**: Quick switching between **Orbit**, **First Person** (WASD/Mouse), and **Plan** navigation.
- **Section Planes (Clipper)**: Add dynamic section cuts in real-time by double-clicking inside the viewport.

### 2. Interactive 3D ViewCube
- **Orientation Synchronization**: Stays in sync with camera rotations in real-time.
- **Quick Alignment**: Click on any cube face (`FRONT`, `BACK`, `LEFT`, `RIGHT`, `TOP`, `BOTTOM`) to instantly orient the camera.
- **Touch & Mouse Orbiting**: Drag directly on the ViewCube to rotate the scene.

### 3. Dynamic Items Finder & Classifier
- **Model Categories**: Dynamically scans the loaded model and populates query cards for every present IFC category.
- **Toggled Isolation**: Click "Isolate" on a category card to hide all other objects. Click "Show All" to restore full model visibility.

### 4. 4D Simulation & 5D Estimating
- **Timeline Scrubber**: Plays a construction sequence simulation. Visual states highlight objects (Planned = Hidden, In Progress = Pulsing Highlight, Completed = Solid).
- **Cost Calculations**: View and customize Unit Cost and Quantity on selected elements to calculate total costs.

### 5. Premium Responsive Layout
- **Minimizable Panels**: Collapse panel sections in the sidebar via headers or minimize buttons to expand the 3D workspace.
- **Sliding Drawers**: Sidebars slide smoothly off-screen on tablets and mobiles, toggled via header hamburger/controls buttons.
- **High Contrast Accessibility**: WCAG-compliant slate typography in both Dark and Light themes.

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- npm (Node Package Manager)

### Installation
1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd TOC
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Running Locally
To launch the local development server:
```bash
npm run dev
```
Open [http://localhost:3000/TOC/](http://localhost:3000/TOC/) (or the port specified in your console) in your web browser.

### Building for Production
To generate the optimized client bundle under `/dist`:
```bash
npm run build
```

---

## 🖱️ How to Use

1. **Load a Model**: Click **Load IFC** in the bottom toolbar to upload a local `.ifc` / `.frag` file, or click **Load Sample** to download the architectural school model.
2. **Select Elements**: Double-click on any element in the viewport to open its property sheet in the right sidebar.
3. **Measure**: Toggle **Tape Measure** in the Measurements panel and click points inside the viewport to measure lengths. Press `ESC` to cancel or `Backspace` to delete measurement nodes.
4. **Isolate**: Go to **Items Finder** in the left sidebar and click "Isolate" next to any category to focus on specific structural parts.
5. **Run 4D Simulation**: Click **Activate 4D** in the top header. Press **Play Simulation** on the bottom timeline bar to view the animated construction progress.
6. **Minimize Panels**: Click any panel header (e.g. *Scene* or *Properties*) to collapse it out of the way.
