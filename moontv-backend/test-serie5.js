const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process']});
  const page = await browser.newPage();
  await page.goto('https://cuevana.bi/episodios/recientes', {waitUntil:'networkidle2', timeout:30000});
  await new Promise(r=>setTimeout(r,3000));
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a')).filter(a => a.href.includes('/serie/')).map(a => ({ text: a.textContent.trim(), href: a.href })).slice(0,10);
  });
  console.log(JSON.stringify(links, null, 2));
  await browser.close();
})();
