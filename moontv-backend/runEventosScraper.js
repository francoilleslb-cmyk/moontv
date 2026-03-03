const puppeteer = require('puppeteer');
const Event = require('./models/Event');

// Funciones de utilidad mejoradas
const decodeStreamUrl = (href) => {
  try {
    const url = new URL(href);
    const r = url.searchParams.get('r');
    return r ? Buffer.from(r, 'base64').toString('utf8') : href;
  } catch { return href; }
};

const parseDateTime = (timeStr) => {
  const now = new Date();
  const [hours, minutes] = timeStr.split(':').map(Number);
  const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
  if (dt < now && hours < 5) dt.setDate(dt.getDate() + 1); 
  return dt;
};

const parseCompetitionAndTeams = (text) => {
  const timeMatch = text.match(/(\d{2}:\d{2})$/);
  const time = timeMatch ? timeMatch[1] : '00:00';
  const cleanText = text.replace(time, '').trim();

  const parts = cleanText.split(':');
  const competition = parts.length > 1 ? parts[0].trim() : 'Fútbol';
  const matchPart = parts.length > 1 ? parts[1].trim() : parts[0].trim();

  const [teamHome, teamAway] = matchPart.split(/\s+vs\s+/i).map(t => t?.trim() || '');
  return { competition, teamHome, teamAway, time };
};

async function runEventosScraper() {
  console.log('[EventosScraper] Iniciando en Cloud...');

  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox', 
      '--disable-dev-shm-usage', // Vital para Docker/Cloud
      '--disable-gpu',
      '--no-zygote'
    ]
  });

  try {
    const page = await browser.newPage();
    
    // OPTIMIZACIÓN DE MEMORIA: No cargar basura
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'stylesheet', 'font'].includes(req.resourceType())) req.abort();
      else req.continue();
    });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    await page.goto('https://pelotalibretv.su/agenda/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    // Esperar a que los eventos carguen
    await page.waitForSelector('li', { timeout: 10000 });

    const rawEventos = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('li'))
        .filter(li => li.textContent.includes(' vs '))
        .map(li => {
          const links = Array.from(li.querySelectorAll('a'));
          // El primer link que contiene "vs" es la URL del evento
          const eventLink = links.find(a => a.textContent.includes(' vs '));
          
          const channels = links
            .filter(a => !a.href.includes('#') && !a.href.includes('agenda'))
            .map(a => ({ name: a.textContent.trim(), href: a.href }));

          return {
            titleText: li.innerText.split('\n')[0].trim(),
            eventUrl: eventLink ? eventLink.href : null,
            channels
          };
        })
        .filter(e => e.eventUrl);
    });

    console.log(`[Scraper] ${rawEventos.length} eventos encontrados. Guardando...`);

    for (const ev of rawEventos) {
      const { competition, teamHome, teamAway, time } = parseCompetitionAndTeams(ev.titleText);
      const datetime = parseDateTime(time);

      const eventData = {
        title: `${teamHome} vs ${teamAway}`.trim(),
        competition,
        sport: 'football',
        teamHome,
        teamAway,
        datetime,
        eventUrl: ev.eventUrl,
        channels: ev.channels.map(ch => ({
          name: ch.name.replace(/Calidad\s+\d+p.*/i, '').trim(),
          streamUrl: decodeStreamUrl(ch.href)
        })),
        status: 'upcoming',
        isActive: true
      };

      // UPSERT: Si el partido ya existe (por URL), lo actualiza. Si no, lo crea.
      await Event.findOneAndUpdate(
        { eventUrl: ev.eventUrl },
        eventData,
        { upsert: true, new: true }
      );
    }

    console.log('[EventosScraper] Finalizado con éxito.');

  } catch (error) {
    console.error('[EventosScraper] Error:', error.message);
  } finally {
    await browser.close();
  }
}

module.exports = runEventosScraper;
