import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });
  
  const logs = [];
  page.on('console', msg => {
    if (msg.type() === 'error') logs.push(`Error: ${msg.text()}`);
  });

  const portArg = process.argv[2] || process.env.PORT;
  let targetUrl = '';
  if (portArg) {
    targetUrl = `http://localhost:${portArg}/TOC/`;
  } else {
    const ports = [3000, 3001, 3002, 3003, 3004, 3005];
    for (const port of ports) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1000);
        const res = await fetch(`http://localhost:${port}/TOC/`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
          targetUrl = `http://localhost:${port}/TOC/`;
          break;
        }
      } catch (err) {
        // Ignored
      }
    }
  }

  if (!targetUrl) {
    console.error('Error: Could not find any running server on ports 3000-3005.');
    await browser.close();
    process.exit(1);
  }

  console.log(`Navigating to target url: ${targetUrl}`);
  await page.goto(targetUrl);

  // Wait for application init
  await page.waitForFunction(() => {
    const overlay = document.querySelector('#loading-overlay');
    return overlay && overlay.classList.contains('hidden');
  }, null, { timeout: 30000 }).catch(() => {});

  // Trigger sample model loading
  await page.evaluate(() => {
    if (typeof window.loadSampleModel === 'function') {
      window.loadSampleModel();
    }
  });
  
  // Wait for viewer_model to be defined
  await page.waitForFunction(() => {
    return typeof window.viewer_model !== 'undefined';
  }, null, { timeout: 45000 });
  
  // Wait for scene to settle
  await page.waitForTimeout(1000);
  
  // Double click canvas to select element
  const canvas = await page.$('#container canvas');
  if (canvas) {
    const box = await canvas.boundingBox();
    if (box) {
      // Try exact center
      await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(500);
      
      let name = await page.$eval('#prop-name', el => el.textContent).catch(() => '-');
      if (name === '-' || name === '') {
        // Try offset 1
        await page.mouse.dblclick(box.x + box.width / 2 + 100, box.y + box.height / 2 + 50);
        await page.waitForTimeout(500);
        name = await page.$eval('#prop-name', el => el.textContent).catch(() => '-');
      }
      
      if (name === '-' || name === '') {
        // Try offset 2
        await page.mouse.dblclick(box.x + box.width / 2 - 100, box.y + box.height / 2 - 50);
        await page.waitForTimeout(500);
      }
    }
  }
  
  // Perform Mouse Orbit Drag Test
  const initialCamPos = await page.evaluate(() => {
    if (!window.viewer_world || !window.viewer_world.camera) return null;
    const p = window.viewer_world.camera.three.position;
    return { x: p.x, y: p.y, z: p.z };
  });

  if (canvas) {
    const box = await canvas.boundingBox();
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down({ button: 'left' });
      await page.mouse.move(cx + 200, cy + 100, { steps: 10 });
      await page.mouse.up({ button: 'left' });
      await page.waitForTimeout(500);
    }
  }

  const newCamPos = await page.evaluate(() => {
    if (!window.viewer_world || !window.viewer_world.camera) return null;
    const p = window.viewer_world.camera.three.position;
    return { x: p.x, y: p.y, z: p.z };
  });

  console.log("Initial Camera Position:", initialCamPos);
  console.log("Post-Orbit Camera Position:", newCamPos);

  // Wheel Zoom Test
  const initialDist = await page.evaluate(() => window.viewer_world.camera.controls.distance);
  if (canvas) {
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, 500); // Scroll down to zoom out
      await page.waitForTimeout(500);
    }
  }
  const newDist = await page.evaluate(() => window.viewer_world.camera.controls.distance);
  console.log(`Zoom Test -- Initial Distance: ${initialDist}, Post-Zoom Distance: ${newDist}`);

  // WASD Keyboard Movement Test
  const preWASDPos = await page.evaluate(() => {
    const p = window.viewer_world.camera.three.position;
    return { x: p.x, y: p.y, z: p.z };
  });

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(600);
  await page.keyboard.up('KeyW');

  const postWASDPos = await page.evaluate(() => {
    const p = window.viewer_world.camera.three.position;
    return { x: p.x, y: p.y, z: p.z };
  });
  console.log("WASD Move Test -- Pre Pos:", preWASDPos, "Post Pos:", postWASDPos);

  // Dump properties from the model
  const propsDump = await page.evaluate(() => {
    if (!window.viewer_model) return "No model";
    if (!window.viewer_model.properties) return "No properties object";
    const keys = Object.keys(window.viewer_model.properties);
    return `Properties count: ${keys.length}, sample keys: ${keys.slice(0, 10).join(', ')}, type of first val: ${typeof window.viewer_model.properties[keys[0]]}, keys of first val: ${window.viewer_model.properties[keys[0]] ? Object.keys(window.viewer_model.properties[keys[0]]).join(', ') : 'null'}`;
  });
  console.log("Model properties dump:", propsDump);
  
  const ifcEntity = await page.$eval('#prop-ifc-type', el => el.textContent).catch(() => 'Not found');
  const name = await page.$eval('#prop-name', el => el.textContent).catch(() => 'Not found');
  
  // Comprehensive IFC property conversion audit
  const conversionAudit = await page.evaluate(() => {
    if (!window.viewer_model || !window.viewer_model.properties) return { error: "No model properties loaded" };
    
    const allIds = Object.keys(window.viewer_model.properties).map(Number);
    const nonRelIds = allIds.filter(id => {
      const p = window.viewer_model.properties[id];
      return p && p.type && !String(p.type).startsWith("IFCREL");
    });

    // Collect distinct IFC types present in model.properties
    const typeCounts = {};
    allIds.forEach(id => {
      const p = window.viewer_model.properties[id];
      if (p && p.type) {
        const t = String(p.type);
        typeCounts[t] = (typeCounts[t] || 0) + 1;
      }
    });

    const testId = 74481;
    const rawProps = window.viewer_model.properties[testId];

    if (typeof window.displayElementProperties === 'function') {
      window.displayElementProperties(window.viewer_model, testId);
    }

    // Extract rendered UI property rows from the Element Properties panel table
    const uiRows = Array.from(document.querySelectorAll('.properties-widget .property-table .prop-row')).map(row => {
      const label = row.querySelector('.prop-label')?.textContent?.trim() || '';
      const val = row.querySelector('.prop-val')?.textContent?.trim() || '';
      return { label, val };
    });

    const uiPsetHeaders = Array.from(document.querySelectorAll('.properties-widget .property-table .prop-set-header')).map(header => header.textContent?.trim() || '');

    return {
      totalPropertiesInFrag: allIds.length,
      nonRelationElementsCount: nonRelIds.length,
      auditedElementId: testId,
      rawFragProperties: rawProps,
      renderedUiRowsCount: uiRows.length,
      renderedUiPsetsCount: uiPsetHeaders.length,
      renderedUiRowsSample: uiRows.slice(0, 15),
      renderedUiPsetHeaders: uiPsetHeaders
    };
  });

  console.log("=== COMPREHENSIVE IFC -> FRAG -> UI PROPERTY CONVERSION AUDIT ===");
  console.log(JSON.stringify(conversionAudit, null, 2));

  console.log('--- Verification Results ---');
  console.log(`IFC Entity Name: ${ifcEntity}`);
  console.log(`Element Name: ${name}`);
  console.log(`Console Errors: ${logs.length === 0 ? 'None' : logs.join('\n')}`);
  
  await browser.close();
})();
