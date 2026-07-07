import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
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
  
  // Click load sample
  await page.click('#load-sample-btn');
  
  // Wait for model to load and loading overlay to disappear
  await page.waitForFunction(() => {
    return typeof window.viewer_model !== 'undefined' && 
           document.querySelector('#loading-overlay').classList.contains('hidden');
  }, { timeout: 30000 });
  
  // Double click canvas to select element
  const canvas = await page.$('#container canvas');
  if (canvas) {
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    }
  }
  
  // Dump properties from the model
  const propsDump = await page.evaluate(() => {
    if (!window.viewer_model) return "No model";
    if (!window.viewer_model.properties) return "No properties object";
    const keys = Object.keys(window.viewer_model.properties);
    return `Properties count: ${keys.length}, sample keys: ${keys.slice(0, 10).join(', ')}, type of first val: ${typeof window.viewer_model.properties[keys[0]]}, keys of first val: ${window.viewer_model.properties[keys[0]] ? Object.keys(window.viewer_model.properties[keys[0]]).join(', ') : 'null'}`;
  });
  console.log("Model properties dump:", propsDump);
  
  // Wait for properties panel
  await page.waitForTimeout(1000);
  
  const ifcEntity = await page.$eval('#prop-ifc-type', el => el.textContent).catch(() => 'Not found');
  const name = await page.$eval('#prop-name', el => el.textContent).catch(() => 'Not found');
  
  console.log('--- Verification Results ---');
  console.log(`IFC Entity Name: ${ifcEntity}`);
  console.log(`Element Name: ${name}`);
  console.log(`Console Errors: ${logs.length === 0 ? 'None' : logs.join('\n')}`);
  
  await browser.close();
})();
