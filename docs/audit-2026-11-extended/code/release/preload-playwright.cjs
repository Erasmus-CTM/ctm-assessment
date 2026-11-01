// Load the shared Playwright object before ESM suites import its facade.
require('./local-browser-preload.cjs');
require('playwright');
