const axios = require('axios');
const cheerio = require('cheerio');
const Movie = require('./models/Movie');
const Event = require('./models/Event');

async function runScraper() {
  console.log("🚀 [Scraper] Iniciando escaneo de Películas y PelotaLibre...");
  
  // --- SECCIÓN PELÍCULAS (CUEVANA) ---
  try {
    const { data } = await axios.get('https://cuevana.bi/peliculas', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0' },
      timeout: 10000
    });
    const $ = cheerio.load(data);
    let mCount = 0;

    // Buscamos cualquier enlace que lleve a una película
    $('a[href*="/pelicula/"]').each(async (i, el) => {
      const title = $(el).find('h2, .title').text().trim() || $(el).text().trim();
      let link = $(el).attr('href');
      
      if (title && link && title.length > 2) {
        const fullUrl = link.startsWith('http') ? link : `https://cuevana.bi${link}`;
        await Movie.updateOne(
          { title: title },
          { $set: { 
              title: title, 
              sourceUrl: fullUrl, 
              category: "Estrenos", 
              status: "active",
              poster: "https://via.placeholder.com/500x750?text=MoonTV" 
          }},
          { upsert: true }
        );
        mCount++;
      }
    });
    setTimeout(() => console.log(`🎬 [Scraper] Películas encontradas: ${mCount}`), 2000);
  } catch (e) {
    console.error("❌ Error en Cuevana:", e.message);
  }

  // --- SECCIÓN DEPORTES (PELOTA LIBRE) ---
  try {
    const { data: pData } = await axios.get('https://pelotalibretv.su/', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000
    });
    const $p = cheerio.load(pData);
    let pCount = 0;

    // PelotaLibre suele usar tablas o listas de enlaces para los partidos
    $p('a').each(async (i, el) => {
      const title = $p(el).text().trim();
      const link = $p(el).attr('href');

      // Filtramos enlaces que parezcan partidos (suelen tener "vs" o nombres de equipos)
      if (link && (title.toLowerCase().includes('vs') || link.includes('-en-vivo'))) {
        const fullLink = link.startsWith('http') ? link : `https://pelotalibretv.su${link}`;
        await Event.updateOne(
          { title: title },
          { $set: { 
              title: title, 
              sourceUrl: fullLink, 
              category: "Deportes", 
              status: "active",
              type: "live" 
          }},
          { upsert: true }
        );
        pCount++;
      }
    });
    console.log(`⚽ [Scraper] PelotaLibre actualizado: ${pCount} eventos.`);
  } catch (e) {
    console.error("❌ Error en PelotaLibre:", e.message);
  }
}

module.exports = runScraper;
