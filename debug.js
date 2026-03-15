const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    page.on('console', msg => console.log('BROWSER_CONSOLE:', msg.text()));
    page.on('pageerror', error => console.error('BROWSER_ERROR:', error));

    await page.goto('http://localhost:8000', { waitUntil: 'networkidle' });

    await new Promise(r => setTimeout(r, 2000)); // wait for init

    await browser.close();
})();
