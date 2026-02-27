const axios = require('axios');
const cheerio = require('cheerio');
const Movie = require('./models/Movie');
const Event = require('./models/Event');

async function runScraper() {
  console.log("🚀 [Scraper] Iniciando actualización desde Cuevana...");
  try {
    // Intentamos con la sección de estrenos que es más estable
    const { data } = await axios.get('https://cuevana.bi/estrenos', {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept-Language': 'es-ES,es;q=0.9'
      },
      timeout: 15000
    });
    
    const $ = cheerio.load(data);
    let count = 0;

    // Selector ultra-preciso para Cuevana: busca los artículos de películas
    $('ul.movies-list li, .item, .xxx-item').each(async (i, el) => {
      const title = $(el).find('h2').text().trim() || $(el).find('.title').text().trim();
      const poster = $(el).find('img').attr('data-src') || $(el).find('img').attr('src');
      let sourceUrl = $(el).find('a').attr('href');

      if (title && sourceUrl) {
        // Aseguramos que la URL sea completa
        if (!sourceUrl.startsWith('http')) {
            sourceUrl = `https://cuevana.bi${sourceUrl}`;
        }

        const movieData = {
          title: title,
          poster: poster,
          backdrop: poster,
          description: "Estreno sincronizado automáticamente.",
          genre: "Película",
          category: "Estrenos",
          year: 2026,
          sourceUrl: sourceUrl,
          status: "active",
          provider: "cuevana"
        };

        await Movie.updateOne({ title: title }, { $set: movieData }, { upsert: true });
        count++;
      }
    });

    // Pequeño delay para que los logs alcancen a mostrar el conteo real
    setTimeout(() => console.log(`✅ [Scraper] Películas encontradas: ${count}`), 2000);
    
    await runDeportesScraper();

  } catch (e) {
    console.error("❌ [Scraper] Error en películas:", e.message);
  }
}

async function runDeportesScraper() {
  try {
    const { data } = await axios.get('https://www.pirlotvonline.org/', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const $ = cheerio.load(data);
    
    // Usamos un bucle tradicional para evitar cierres prematuros
    const links = $('a').toArray();
    for (const el of links) {
      const eventTitle = $(el).text().trim();
      const eventLink = $(el).attr('href');

      if (eventTitle.toLowerCase().includes('vs')) {
        await Event.updateOne(
          { title: eventTitle },
          { $set: { 
              title: eventTitle, 
              sourceUrl: eventLink, 
              category: "Deportes", 
              status: "active",
              type: "live" 
          }},
          { upsert: true }
        );
      }
    }
    console.log("⚽ [Scraper] Deportes actualizados.");
  } catch (e) {
    console.log("❌ [Scraper] Error en deportes:", e.message);
  }
}

module.exports = runScraper;
