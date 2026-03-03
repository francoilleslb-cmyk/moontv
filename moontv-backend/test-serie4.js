const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process']});
  const page = await browser.newPage();
  await page.goto('https://cuevana.bi/serie/como-agua-para-chocolate-2', {waitUntil:'networkidle2', timeout:30000});
  await new Promise(r=>setTimeout(r,3000));
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a')).filter(a => a.href.includes('episodio')).map(a => ({ text: a.textContent.trim(), href: a.href }));
  });
  console.log(JSON.stringify(links.slice(0,5), null, 2));
  await browser.close();
})();
