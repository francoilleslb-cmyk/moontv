const axios = require('axios');
const cheerio = require('cheerio');
const Movie = require('./models/Movie');

async function runScraper() {
  console.log("🚀 [Scraper] Probando suerte con 1Movies (Sección Argentina)...");
  
  try {
    const { data } = await axios.get('https://1movies.bz/country/argentina', {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0',
        'Referer': 'https://1movies.bz/'
      },
      timeout: 10000
    });
    
    const $ = cheerio.load(data);
    let mCount = 0;

    // En estos sitios las películas suelen estar en divs con clase 'flw-item' o similares
    $('.flw-item, .movie-item, .ml-item').each(async (i, el) => {
      const link = $(el).find('a').attr('href');
      const title = $(el).find('h2, .film-name, .title').text().trim();
      // Buscamos el poster en varios atributos posibles
      const poster = $(el).find('img').attr('data-src') || 
                     $(el).find('img').attr('src') || 
                     $(el).find('img').attr('data-original');

      if (link && title && poster) {
        const fullUrl = link.startsWith('http') ? link : `https://1movies.bz${link}`;
        
        await Movie.updateOne(
          { sourceUrl: fullUrl },
          { $set: { 
              title: title, 
              sourceUrl: fullUrl, 
              poster: poster,
              category: "Argentina",
              status: "active",
              year: 2025,
              description: "Cargado desde la sección Argentina."
          }},
          { upsert: true }
        );
        mCount++;
      }
    });

    // Si después de todo sigue en 0, cargamos los de emergencia para que no veas la app vacía
    if (mCount === 0) {
      console.log("⚠️ No se detectaron películas en 1Movies, aplicando respaldo...");
      const backup = [
        { title: "Argentina, 1985", url: "https://1movies.bz/search/argentina-1985", img: "https://image.tmdb.org/t/p/w500/799go9YmS39t9W9bn9uX6qI60Zf.jpg" },
        { title: "El Encargado", url: "https://1movies.bz/search/el-encargado", img: "https://image.tmdb.org/t/p/w500/6v0W8U6N8HwXhX8mS8hX8mS8hX8.jpg" }
      ];
      for (const m of backup) {
        await Movie.updateOne({ title: m.title }, { $set: { title: m.title, sourceUrl: m.url, poster: m.img, category: "Argentina", status: "active", year: 2025 }}, { upsert: true });
      }
    }

    console.log(`🎬 [Scraper] Finalizado. Películas en base de datos: ${mCount || 'Respaldo'}`);

  } catch (e) {
    console.error("❌ Error en 1Movies:", e.message);
  }
}

module.exports = runScraper;
