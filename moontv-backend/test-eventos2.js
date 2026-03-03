const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process']});
  const page = await browser.newPage();
  await page.goto('https://pelotalibretv.su/', {waitUntil:'networkidle2', timeout:30000});
  await new Promise(r=>setTimeout(r,3000));
  const items = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a, .match, .event, .card, article, li'))
      .map(el => ({ text: el.textContent.trim().substring(0, 100), href: el.href || '' }))
      .filter(el => el.text.length > 10)
      .slice(0, 20);
  });
  console.log(JSON.stringify(items, null, 2));
  await browser.close();
})();
