const axios = require('axios');
const cheerio = require('cheerio');
const Movie = require('./models/Movie');
const Event = require('./models/Event');

async function runScraper() {
  console.log("🚀 [Scraper] Iniciando escaneo de emergencia...");
  
  try {
    // Probamos con la URL de películas directamente
    const { data } = await axios.get('https://cuevana.bi/peliculas', {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9'
      },
      timeout: 15000
    });
    
    const $ = cheerio.load(data);
    let mCount = 0;

    // Buscamos TODOS los enlaces que contengan /pelicula/
    $('a[href*="/pelicula/"]').each(async (i, el) => {
      const link = $(el).attr('href');
      // Sacamos el título del texto del link o del atributo title
      const title = $(el).text().trim() || $(el).attr('title') || $(el).find('h2').text().trim();
      
      // Buscamos la imagen en el link o en sus parientes cercanos
      let poster = $(el).find('img').attr('data-src') || 
                   $(el).find('img').attr('src') || 
                   $(el).parent().find('img').attr('data-src');

      if (link && title && title.length > 2) {
        const fullUrl = link.startsWith('http') ? link : `https://cuevana.bi${link}`;
        
        // Limpiar URL del póster
        if (poster && poster.startsWith('//')) poster = `https:${poster}`;
        if (poster && !poster.startsWith('http')) poster = `https://cuevana.bi${poster}`;

        await Movie.updateOne(
          { title: title },
          { $set: { 
              title: title, 
              sourceUrl: fullUrl, 
              poster: poster || 'https://via.placeholder.com/500x750?text=No+Poster',
              category: "Estrenos", 
              status: "active",
              year: 2026 
          }},
          { upsert: true }
        );
        mCount++;
      }
    });

    setTimeout(() => console.log(`🎬 [Scraper] ¡Éxito! Películas encontradas: ${mCount}`), 3000);

  } catch (e) {
    console.error("❌ [Scraper] Error crítico:", e.message);
  }

  // Deportes (PelotaLibre)
  try {
    const pRes = await axios.get('https://pelotalibretv.su/', { timeout: 10000 });
    const $p = cheerio.load(pRes.data);
    let pCount = 0;
    $p('a').each(async (i, el) => {
        const dTitle = $p(el).text().trim();
        const dLink = $p(el).attr('href');
        if (dLink && (dLink.includes('/en-vivo/') || dTitle.toLowerCase().includes('vs'))) {
            await Event.updateOne(
                { title: dTitle },
                { $set: { title: dTitle, sourceUrl: dLink, category: "Deportes", status: "active", type: "live" }},
                { upsert: true }
            );
            pCount++;
        }
    });
    console.log(`⚽ [Scraper] PelotaLibre: ${pCount} eventos.`);
  } catch (e) { console.error("❌ Error Deportes:", e.message); }
}

module.exports = runScraper;
