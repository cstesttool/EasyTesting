/**
 * Run before publish: ensure dist includes pressKey and waitForLoad.
 */
const fs = require('fs');
const path = require('path');

const distBrowser = path.join(__dirname, '..', 'dist', 'browser', 'cdp-page.js');
if (!fs.existsSync(distBrowser)) {
  console.error('Missing dist/browser/cdp-page.js - run npm run build');
  process.exit(1);
}
const content = fs.readFileSync(distBrowser, 'utf8');
if (!content.includes('pressKey')) {
  console.error('pressKey missing in dist/browser/cdp-page.js - run npm run build');
  process.exit(1);
}
if (!content.includes('waitForLoad')) {
  console.error('waitForLoad missing in dist/browser/cdp-page.js - run npm run build');
  process.exit(1);
}
console.log('OK: dist includes pressKey and waitForLoad');
process.exit(0);
