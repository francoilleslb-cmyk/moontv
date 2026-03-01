const puppeteer = require('puppeteer');
const Event = require('./models/Event');

function decodeStreamUrl(href) {
  try {
    const url = new URL(href);
    const r = url.searchParams.get('r');
    if (r) return Buffer.from(r, 'base64').toString('utf8');
  } catch (e) {}
  return href;
}

function parseDateTime(timeStr) {
  // timeStr es algo como "17:30"
  const now = new Date();
  const [hours, minutes] = timeStr.split(':').map(Number);
  const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);
  return dt;
}

function parseCompetitionAndTeams(text) {
  // Formato: "LaLiga: Real Betis vs Sevilla17:30"
  // Separar competicion del partido
  const timeMatch = text.match(/(\d{2}:\d{2})$/);
  const time = timeMatch ? timeMatch[1] : '00:00';
  const withoutTime = text.replace(/\d{2}:\d{2}$/, '').trim();

  const colonIdx = withoutTime.indexOf(':');
  let competition = '';
  let matchTitle = withoutTime;

  if (colonIdx !== -1) {
    competition = withoutTime.substring(0, colonIdx).trim();
    matchTitle = withoutTime.substring(colonIdx + 1).trim();
  }

  const vsParts = matchTitle.split(' vs ');
  const teamHome = vsParts[0] ? vsParts[0].trim() : '';
  const teamAway = vsParts[1] ? vsParts[1].trim() : '';

  return { competition, matchTitle, teamHome, teamAway, time };
}

function cleanChannelName(text) {
  // "ESPN 2Calidad 720p" -> "ESPN 2"
  return text.replace(/Calidad\s+\d+p.*/i, '').trim();
}

async function runEventosScraper() {
  console.log('[EventosScraper] Iniciando scraper de eventos...');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote','--single-process']
  });

  try {
    const page = await browser.newPage();
    await page.goto('https://pelotalibretv.su/agenda/', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 5000));

    const eventos = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('li'))
        .filter(li => li.textContent.includes(' vs '))
        .map(li => {
          const titleLink = li.querySelector('a[href*="#"]');
          const titleText = titleLink ? titleLink.textContent.trim() : '';

          const channels = Array.from(li.querySelectorAll('a[href*="eventos"]')).map(a => ({
            name: a.textContent.trim(),
            href: a.href
          }));

          return { titleText, channels };
        })
        .filter(e => e.titleText.length > 0);
    });

    await browser.close();

    console.log('Eventos encontrados: ' + eventos.length);

    // Limpiar eventos del dia para reemplazar con datos frescos
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    await Event.deleteMany({ datetime: { $gte: today, $lt: tomorrow } });

    let eCount = 0;
    for (const ev of eventos) {
      const { competition, matchTitle, teamHome, teamAway, time } = parseCompetitionAndTeams(ev.titleText);
      const datetime = parseDateTime(time);

      const channels = ev.channels.map(ch => ({
        name: cleanChannelName(ch.name),
        streamUrl: decodeStreamUrl(ch.href),
        logo: ''
      })).filter(ch => ch.streamUrl && !ch.streamUrl.includes('#'));

      if (channels.length === 0) continue;

      const title = teamHome && teamAway ? teamHome + ' vs ' + teamAway : matchTitle;

      try {
        await Event.create({
          title,
          competition: competition || 'Fútbol',
          sport: 'football',
          teamHome,
          teamAway,
          datetime,
          channels,
          status: 'upcoming',
          isActive: true
        });
        eCount++;
        console.log('[' + eCount + '] ' + title + ' (' + time + ') - ' + channels.length + ' canales');
      } catch (err) {
        console.error('Error guardando "' + title + '": ' + err.message);
      }
    }

    console.log('[EventosScraper] Finalizado. ' + eCount + ' eventos guardados.');

  } catch (e) {
    await browser.close();
    console.error('Error en scraper de eventos: ' + e.message);
  }
}

module.exports = runEventosScraper;
