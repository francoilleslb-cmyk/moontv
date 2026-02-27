const axios = require('axios');
const cheerio = require('cheerio');
const Movie = require('./models/Movie');

async function runScraper() {
  console.log("🚀 [Scraper] Iniciando escaneo de emergencia...");
  
  try {
    const { data } = await axios.get('https://cuevana.bi/', {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' 
      },
      timeout: 10000
    });
    
    const $ = cheerio.load(data);
    let mCount = 0;

    // Buscamos todos los links que tengan una imagen adentro
    $('a').each(async (i, el) => {
      try {
        const link = $(el).attr('href');
        const img = $(el).find('img');
        const poster = img.attr('data-src') || img.attr('src');
        const title = img.attr('alt') || $(el).find('h2').text().trim();

        // Validamos que tenga la información mínima
        if (link && title && poster) {
          const fullUrl = link.startsWith('http') ? link : `https://cuevana.bi${link}`;
          let fullPoster = poster.startsWith('//') ? `https:${poster}` : poster;
          if (!fullPoster.startsWith('http')) fullPoster = `https://cuevana.bi${fullPoster}`;

          // Limpieza de año básica
          let finalTitle = title;
          let finalYear = 2025;
          const yearMatch = title.match(/\b(20)\d{2}\b/);
          if (yearMatch) {
            finalYear = parseInt(yearMatch[0]);
            finalTitle = title.replace(yearMatch[0], '').replace(/-/g, '').trim();
          }

          await Movie.updateOne(
            { sourceUrl: fullUrl },
            { $set: { 
                title: finalTitle, 
                sourceUrl: fullUrl, 
                poster: fullPoster,
                category: "Películas",
                status: "active",
                year: finalYear,
                description: "Actualizado automáticamente."
            }},
            { upsert: true }
          );
          mCount++;
        }
      } catch (err) {
        // Ignorar errores individuales de una película
      }
    });

    // Usamos un log simple para evitar problemas de sincronía
    console.log("✅ [Scraper] Escaneo finalizado.");
  } catch (e) {
    console.error("❌ Error en el scraper:", e.message);
  }
}

module.exports = runScraper;
