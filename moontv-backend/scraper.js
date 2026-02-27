const axios = require('axios');
const cheerio = require('cheerio');
const Movie = require('./models/Movie');
const Event = require('./models/Event');

async function runScraper() {
  console.log("🚀 [Scraper] Iniciando escaneo profundo de contenido...");
  
  // --- SECCIÓN PELÍCULAS (CUEVANA) ---
  try {
    const { data } = await axios.get('https://cuevana.bi/peliculas', {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' 
      },
      timeout: 10000
    });
    const $ = cheerio.load(data);
    let mCount = 0;

    // Buscamos en los contenedores de películas
    $('.item, .ml-item, article').each(async (i, el) => {
      const title = $(el).find('h2, .title').text().trim();
      let link = $(el).find('a').attr('href');
      
      // Captura inteligente de imagen (probamos varios atributos)
      let poster = $(el).find('img').attr('data-src') || 
                   $(el).find('img').attr('data-lazy-src') || 
                   $(el).find('img').attr('src');

      if (title && link && link.includes('/pelicula/')) {
        // Limpieza de URLs
        const fullUrl = link.startsWith('http') ? link : `https://cuevana.bi${link}`;
        
        // Si la imagen empieza con //, le agregamos https:
        if (poster && poster.startsWith('//')) poster = `https:${poster}`;

        await Movie.updateOne(
          { title: title },
          { $set: { 
              title: title, 
              sourceUrl: fullUrl, 
              poster: poster || 'https://via.placeholder.com/500x750?text=MoonTV',
              backdrop: poster,
              category: "Estrenos", 
              status: "active",
              year: 2026,
              description: "Sincronizado automáticamente desde Cuevana."
          }},
          { upsert: true }
        );
        mCount++;
      }
    });
    // Log con delay para esperar a las promesas
    setTimeout(() => console.log(`🎬 [Scraper] Películas sincronizadas: ${mCount}`), 3000);
  } catch (e) {
    console.error("❌ [Scraper] Error en Cuevana:", e.message);
  }

  // --- SECCIÓN DEPORTES (PELOTA LIBRE) ---
  try {
    const { data: pData } = await axios.get('https://pelotalibretv.su/', {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0',
        'Referer': 'https://www.google.com/'
      },
      timeout: 10000
    });
    const $p = cheerio.load(pData);
    let pCount = 0;

    // PelotaLibre suele poner los partidos en enlaces dentro de la página principal
    $p('a').each(async (i, el) => {
      const dTitle = $p(el).text().trim();
      const dLink = $p(el).attr('href');

      // Filtro para detectar eventos deportivos reales
      if (dLink && (dLink.includes('/en-vivo/') || dTitle.toLowerCase().includes('vs'))) {
        const fullLink = dLink.startsWith('http') ? dLink : `https://pelotalibretv.su${dLink}`;
        
        await Event.updateOne(
          { title: dTitle },
          { $set: { 
              title: dTitle, 
              sourceUrl: fullLink, 
              category: "Deportes", 
              status: "active",
              type: "live",
              poster: "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?q=80&w=500" // Imagen genérica de deportes
          }},
          { upsert: true }
        );
        pCount++;
      }
    });
    console.log(`⚽ [Scraper] PelotaLibre: ${pCount} eventos encontrados.`);
  } catch (e) {
    console.error("❌ [Scraper] Error en PelotaLibre:", e.message);
  }
}

module.exports = runScraper;
