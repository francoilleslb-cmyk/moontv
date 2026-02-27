const axios = require('axios');
const cheerio = require('cheerio');
const Movie = require('./models/Movie');
const Event = require('./models/Event');

async function runScraper() {
  console.log("🚀 [Scraper] Iniciando actualización desde /peliculas...");
  
  try {
    const { data } = await axios.get('https://cuevana.bi/peliculas', {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });
    
    const $ = cheerio.load(data);
    let count = 0;

    // Selector específico para el grid de películas
    $('.item, .ml-item').each(async (i, el) => {
      const title = $(el).find('h2').text().trim();
      const poster = $(el).find('img').attr('data-src') || $(el).find('img').attr('src');
      let sourceUrl = $(el).find('a').attr('href');

      if (title && sourceUrl) {
        if (!sourceUrl.startsWith('http')) sourceUrl = `https://cuevana.bi${sourceUrl}`;
        
        await Movie.updateOne(
          { title: title },
          { $set: {
              title: title,
              poster: poster,
              backdrop: poster,
              category: "Estrenos",
              sourceUrl: sourceUrl,
              status: "active",
              year: 2026,
              description: "Sincronizado desde Cuevana."
          }},
          { upsert: true }
        );
        count++;
      }
    });

    // Esperamos un poco para el log
    setTimeout(() => console.log(`✅ [Scraper] Películas sincronizadas: ${count}`), 3000);
    
    await runDeportesScraper();

  } catch (e) {
    console.error("❌ [Scraper] Error en películas:", e.message);
    // Si falla películas, intentamos deportes de todos modos
    await runDeportesScraper();
  }
}

async function runDeportesScraper() {
  try {
    const { data } = await axios.get('https://www.pirlotvonline.org/', { timeout: 10000 });
    const $ = cheerio.load(data);
    let dCount = 0;
    
    $('a').each(async (i, el) => {
      const title = $(el).text().trim();
      const link = $(el).attr('href');
      if (title.toLowerCase().includes('vs')) {
        await Event.updateOne(
          { title: title },
          { $set: { title: title, sourceUrl: link, category: "Deportes", status: "active", type: "live" }},
          { upsert: true }
        );
        dCount++;
      }
    });
    console.log(`⚽ [Scraper] Deportes actualizados: ${dCount}`);
  } catch (e) {
    console.log("❌ [Scraper] Error en deportes:", e.message);
  }
}

module.exports = runScraper;
