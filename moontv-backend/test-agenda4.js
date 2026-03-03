const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process']});
  const page = await browser.newPage();
  await page.goto('https://pelotalibretv.su/agenda/', {waitUntil:'networkidle2', timeout:30000});
  await new Promise(r=>setTimeout(r,5000));
  const items = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('li')).filter(li => li.textContent.includes('vs')).slice(0,3).map(li => ({
      text: li.textContent.trim().substring(0,200),
      links: Array.from(li.querySelectorAll('a')).map(a => ({ text: a.textContent.trim(), href: a.href }))
    }));
  });
  console.log(JSON.stringify(items, null, 2));
  await browser.close();
})();
