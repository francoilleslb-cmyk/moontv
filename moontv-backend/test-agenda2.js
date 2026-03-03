const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process']});
  const page = await browser.newPage();
  await page.goto('https://pelotalibretv.su/agenda/', {waitUntil:'networkidle2', timeout:30000});
  await new Promise(r=>setTimeout(r,5000));
  const text = await page.evaluate(() => document.body.innerText);
  console.log(text.substring(0, 3000));
  await browser.close();
})();
