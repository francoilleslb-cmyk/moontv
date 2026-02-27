const axios = require('axios');
const cheerio = require('cheerio');
const Movie = require('./models/Movie');

async function runScraper() {
  console.log("🚀 [Scraper] Intento de rescate total...");
  
  try {
    const { data } = await axios.get('https://cuevana.bi/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0' }
    });
    
    const $ = cheerio.load(data);
    let mCount = 0;

    // Buscamos todos los artículos o div que suelen contener películas
    $('a').each(async (i, el) => {
      const link = $(el).attr('href');
      // Buscamos una imagen dentro del link
      const img = $(el).find('img');
      const poster = img.attr('data-src') || img.attr('src');
      const title = img.attr('alt') || $(el).find('.title, h2').text().trim();

      // Si tiene link, titulo y poster, lo guardamos sin importar la URL
      if (link && title && poster && link.length > 5) {
        const fullUrl = link.startsWith('http') ? link : `https://cuevana.bi${link}`;
        const fullPoster = poster.startsWith('//') ? `https:${poster}` : 
                          (poster.startsWith('http') ? poster : `https://cuevana.bi${poster}`);

        // Limpieza básica de año en el título
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
              description: "Añadida recientemente." 
          }},
          { upsert: true }
        );
        mCount++;
      }
    });

    // Pequeño delay para que el log no salga antes de procesar
    setTimeout(() => console.log(`🎬 [Scraper] ¡Éxito! Se encontraron ${mCount} elementos.`), 3000);

  } catch (e) {
    console.error("❌ Error en el rescate:", e.message);
  }
}

module.exports = runScraper;
