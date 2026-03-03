const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process']});
  const page = await browser.newPage();
  await page.goto('https://pelotalibretv.su/agenda/', {waitUntil:'networkidle2', timeout:30000});
  await new Promise(r=>setTimeout(r,5000));
  const eventos = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('li'))
      .filter(li => li.textContent.includes(' vs '))
      .map(li => {
        const links = Array.from(li.querySelectorAll('a')).map(a => ({ text: a.textContent.trim(), href: a.href }));
        return { links };
      });
  });
  // Mostrar los que NO tienen links de eventos
  eventos.forEach((ev, i) => {
    const sinStream = ev.links.filter(l => !l.href.includes('eventos') && !l.href.includes('#'));
    if (sinStream.length > 0 || ev.links.filter(l => l.href.includes('eventos')).length === 0) {
      console.log('Evento ' + i + ':');
      console.log(JSON.stringify(ev.links, null, 2));
    }
  });
  await browser.close();
})();
