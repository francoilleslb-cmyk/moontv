const axios = require('axios');
const cheerio = require('cheerio');
const Movie = require('./models/Movie');

async function runScraper() {
  console.log("🚀 [Scraper] Carga rápida (1 sola petición para evitar bloqueos)...");
  
  try {
    // Solo UNA petición a la página principal de estrenos
    const { data } = await axios.get('https://www2.gnula.one/category/estreno/', {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0',
        'Referer': 'https://www.google.com/'
      },
      timeout: 10000
    });
    
    const $ = cheerio.load(data);
    let mCount = 0;

    // Buscamos todos los artículos en la página
    $('article').each(async (i, el) => {
      const link = $(el).find('a').attr('href');
      const title = $(el).find('h2').text().trim();
      const poster = $(el).find('img').attr('src');

      if (link && title && poster) {
        // Limpiamos el título
        const cleanTitle = title.replace(/Ver película/gi, '').replace(/Online/gi, '').trim();

        await Movie.updateOne(
          { sourceUrl: link },
          { $set: { 
              title: cleanTitle, 
              sourceUrl: link, 
              poster: poster,
              category: "Estrenos",
              status: "active",
              year: 2026,
              // Sinopsis automática para no tener que entrar al link
              description: `Disfruta de ${cleanTitle} en Moon TV. Estreno disponible con la mejor calidad de imagen y sonido.`
          }},
          { upsert: true }
        );
        mCount++;
      }
    });

    console.log(`✅ [Scraper] ¡Listo! ${mCount} películas cargadas sin riesgo de bloqueo.`);

  } catch (e) {
    console.error("❌ Error en carga rápida:", e.message);
  }
}

module.exports = runScraper;
