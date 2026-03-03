const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process']});
  const page = await browser.newPage();
  await page.goto('https://pelotalibretv.su/', {waitUntil:'networkidle2', timeout:30000});
  await new Promise(r=>setTimeout(r,5000));
  const html = await page.content();
  const fs = require('fs');
  fs.writeFileSync('/tmp/eventos_full.html', html);
  console.log('Size: ' + html.length);
  await browser.close();
})();
