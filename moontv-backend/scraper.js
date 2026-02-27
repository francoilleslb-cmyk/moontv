const axios = require('axios');
const cheerio = require('cheerio');
const Movie = require('./models/Movie');

async function runScraper() {
  console.log("🚀 [Scraper] Extrayendo estrenos de GNula...");
  
  try {
    const { data } = await axios.get('https://www2.gnula.one/category/estreno/', {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': 'https://www.google.com/'
      },
      timeout: 10000
    });
    
    const $ = cheerio.load(data);
    let mCount = 0;

    // En GNula los estrenos suelen estar en contenedores <article> o divs con clase .resumido
    $('article, .resumido, .post-column').each(async (i, el) => {
      try {
        const link = $(el).find('a').attr('href');
        const title = $(el).find('h2, .entry-title').text().trim();
        const poster = $(el).find('img').attr('src'); // GNula suele cargar imágenes directo en src

        if (link && title && poster) {
          // Limpieza de título: GNula a veces añade "Ver película..." o años
          let finalTitle = title.replace(/Ver película/gi, '').replace(/Online/gi, '').trim();
          
          // Extraer año si existe
          const yearMatch = title.match(/\b(20)\d{2}\b/);
          const finalYear = yearMatch ? parseInt(yearMatch[0]) : 2025;
          if(yearMatch) finalTitle = finalTitle.replace(yearMatch[0], '').replace(/-/g, '').trim();

          await Movie.updateOne(
            { sourceUrl: link },
            { $set: { 
                title: finalTitle, 
                sourceUrl: link, 
                poster: poster,
                category: "Estrenos",
                status: "active",
                year: finalYear,
                description: "Estreno sincronizado desde GNula."
            }},
            { upsert: true }
          );
          mCount++;
        }
      } catch (innerError) {
        // Error en una película individual
      }
    });

    // Esperar un momento para que terminen las promesas de MongoDB
    setTimeout(() => console.log(`🎬 [Scraper] ¡Éxito! GNula devolvió ${mCount} estrenos.`), 3000);

  } catch (e) {
    console.error("❌ Error en GNula:", e.message);
  }
}

module.exports = runScraper;
