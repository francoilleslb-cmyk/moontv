const axios = require('axios');
const cheerio = require('cheerio');
const Movie = require('./models/Movie');

async function runScraper() {
  console.log("🚀 [Scraper] Iniciando escaneo profundo con sinopsis...");
  
  try {
    const { data } = await axios.get('https://cuevana.bi/peliculas', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0' },
      timeout: 15000
    });
    
    const $ = cheerio.load(data);
    const movieLinks = [];

    // 1. Primero recolectamos los links y datos básicos
    $('a[href*="/pelicula/"]').each((i, el) => {
      const link = $(el).attr('href');
      const rawTitle = $(el).text().trim() || $(el).attr('title') || $(el).find('h2').text().trim();
      let poster = $(el).find('img').attr('data-src') || $(el).find('img').attr('src');

      if (link && rawTitle && rawTitle.length > 2) {
        movieLinks.push({
          url: link.startsWith('http') ? link : `https://cuevana.bi${link}`,
          rawTitle,
          poster: poster && poster.startsWith('//') ? `https:${poster}` : poster
        });
      }
    });

    // 2. Visitamos cada película para sacar la sinopsis (limitamos a 15 para no saturar)
    for (const item of movieLinks.slice(0, 18)) {
      try {
        const { data: detailData } = await axios.get(item.url, { timeout: 8000 });
        const $$ = cheerio.load(detailData);
        
        // Buscamos la sinopsis (Cuevana suele usar clases como .description o .sinopsis)
        const description = $$('.description, .sinopsis, #sinopsis').text().trim() || "Sin descripción disponible.";
        
        // Limpieza de Título y Año (Regex)
        let finalTitle = item.rawTitle;
        let finalYear = 2024;
        const yearMatch = item.rawTitle.match(/\b(19|20)\d{2}\b/);
        if (yearMatch) {
          finalYear = parseInt(yearMatch[0]);
          finalTitle = item.rawTitle.replace(yearMatch[0], '').replace(/-/g, '').trim();
        }

        await Movie.updateOne(
          { sourceUrl: item.url },
          { $set: { 
              title: finalTitle, 
              sourceUrl: item.url, 
              poster: item.poster,
              description: description, // <--- AQUÍ LA SINOPSIS
              category: "Películas",
              status: "active",
              year: finalYear 
          }},
          { upsert: true }
        );
      } catch (err) {
        console.log(`⚠️ No se pudo obtener detalle de: ${item.rawTitle}`);
      }
    }

    console.log(`✅ [Scraper] Proceso completado con sinopsis.`);
  } catch (e) {
    console.error("❌ Error General:", e.message);
  }
}

module.exports = runScraper;
