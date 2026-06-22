import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const logs = [];
  page.on('console', msg => {
    if (msg.type() === 'error') logs.push(`Error: ${msg.text()}`);
  });

  await page.goto('http://localhost:3000/TOC/');
  
  // Click load sample
  await page.click('#load-sample-btn');
  
  // Wait for loading overlay to disappear
  await page.waitForFunction(() => document.querySelector('#loading-overlay').classList.contains('hidden'), { timeout: 15000 });
  
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
