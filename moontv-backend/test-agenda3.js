const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process']});
  const page = await browser.newPage();
  await page.goto('https://pelotalibretv.su/agenda/', {waitUntil:'networkidle2', timeout:30000});
  await new Promise(r=>setTimeout(r,5000));
  const items = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a, li, .match, .event, tr, div'))
      .filter(el => el.textContent.includes('vs') || el.textContent.match(/\d{2}:\d{2}/))
      .map(el => ({ tag: el.tagName, text: el.textContent.trim().substring(0,100), href: el.href || '' }))
      .slice(0, 20);
  });
  console.log(JSON.stringify(items, null, 2));
  await browser.close();
})();
