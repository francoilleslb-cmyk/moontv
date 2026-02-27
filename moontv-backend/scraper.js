const axios = require('axios');
const cheerio = require('cheerio');
const Movie = require('./models/Movie');

// Función para pausar el código (milisegundos)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runScraper() {
  console.log("🚀 [Scraper] Iniciando escaneo con pausas anti-bloqueo...");
  
  try {
    const { data } = await axios.get('https://cuevana.bi/peliculas', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' }
    });
    
    const $ = cheerio.load(data);
    const movieLinks = [];

    $('a[href*="/pelicula/"]').each((i, el) => {
      const link = $(el).attr('href');
      const rawTitle = $(el).find('h2, .title').text().trim() || $(el).attr('title');
      const poster = $(el).find('img').attr('data-src') || $(el).find('img').attr('src');

      if (link && rawTitle) {
        movieLinks.push({
          url: link.startsWith('http') ? link : `https://cuevana.bi${link}`,
          rawTitle,
          poster: poster && poster.startsWith('//') ? `https:${poster}` : poster
        });
      }
    });

    // Procesamos solo 15 para probar, con PAUSAS
    for (const item of movieLinks.slice(0, 15)) {
      try {
        console.log(`🔍 Extrayendo: ${item.rawTitle}...`);
        
        // Esperamos 2 segundos antes de cada petición para no ser bloqueados
        await delay(2000); 

        const { data: detailData } = await axios.get(item.url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }
        });
        
        const $$ = cheerio.load(detailData);
        const description = $$('.description, .sinopsis, p').first().text().trim() || "Ver detalles en la web.";
        
        let finalTitle = item.rawTitle;
        let finalYear = 2026;
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
              description: description,
              category: "Películas",
              status: "active",
              year: finalYear 
          }},
          { upsert: true }
        );
      } catch (err) {
        console.log(`⚠️ Bloqueado en: ${item.rawTitle}. Reintentando con datos básicos...`);
        // Si falla la sinopsis, al menos guardamos lo básico para que no esté vacío
        await Movie.updateOne(
          { sourceUrl: item.url },
          { $set: { title: item.rawTitle, sourceUrl: item.url, poster: item.poster, status: "active" }},
          { upsert: true }
        );
      }
    }
    console.log(`✅ [Scraper] Terminado.`);
  } catch (e) {
    console.error("❌ Error General:", e.message);
  }
}

module.exports = runScraper;
