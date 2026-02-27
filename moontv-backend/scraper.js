const axios = require('axios');
const cheerio = require('cheerio');
const Movie = require('./models/Movie');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
};

// Entra a la página de cada película y saca sinopsis, categoría y año limpio
async function scrapeDetalle(url) {
  try {
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 10000 });
    const $ = cheerio.load(data);

    // Selectores comunes en Cuevana/clones
    const description = $(
      '.synopsis p, .Description p, .sinopsis p, [itemprop="description"], .info-content p'
    ).first().text().trim();

    const category = $(
      '.genres a, .Genres a, .genre a, [itemprop="genre"]'
    ).first().text().trim() || 'Películas';

    // Año limpio desde la página de detalle
    const yearText = $(
      '.year, .Year, [itemprop="dateCreated"], .date'
    ).first().text().trim();
    const yearMatch = yearText.match(/\b(20\d{2}|19\d{2})\b/);
    const year = yearMatch ? parseInt(yearMatch[0]) : null;

    return { description, category, year };
  } catch {
    return { description: '', category: 'Películas', year: null };
  }
}

async function runScraper() {
  console.log("🚀 [Scraper] Iniciando scraper Cuevana...");
  
  try {
    const { data } = await axios.get('https://cuevana.bi/', {
      headers: HEADERS,
      timeout: 10000
    });
    
    const $ = cheerio.load(data);

    // ✅ Paso 1: recolectar síncronamente
    const peliculas = [];
    $('a').each((i, el) => {
      const link   = $(el).attr('href');
      const img    = $(el).find('img');
      const poster = img.attr('data-src') || img.attr('src');
      const title  = img.attr('alt') || $(el).find('h2').text().trim();

      if (!link || !title || !poster) return;
      if (title.length < 2) return; // Ignorar títulos vacíos o íconos

      const fullUrl = link.startsWith('http') ? link : `https://cuevana.bi${link}`;
      let fullPoster = poster.startsWith('//') ? `https:${poster}` : poster;
      if (!fullPoster.startsWith('http')) fullPoster = `https://cuevana.bi${fullPoster}`;

      // ✅ Regex corregido — captura el año completo
      const yearMatch = title.match(/\b(20\d{2}|19\d{2})\b/);
      const yearFromTitle = yearMatch ? parseInt(yearMatch[0]) : null;
      const cleanTitle = yearMatch 
        ? title.replace(yearMatch[0], '').replace(/\s*-\s*/g, ' ').trim()
        : title.trim();

      // Evitar duplicados en el array
      if (!peliculas.find(p => p.url === fullUrl)) {
        peliculas.push({ 
          url: fullUrl, 
          title: cleanTitle, 
          poster: fullPoster, 
          yearFromTitle 
        });
      }
    });

    if (peliculas.length === 0) {
      console.warn('⚠️ 0 resultados — posible bloqueo. HTML:', data.substring(0, 500));
      return;
    }

    console.log(`📦 Encontradas: ${peliculas.length} películas. Obteniendo detalles...`);

    // ✅ Paso 2: entrar a cada película para sacar sinopsis y categoría
    let mCount = 0;
    for (const p of peliculas) {
      const detalle = await scrapeDetalle(p.url);

      const finalYear = detalle.year || p.yearFromTitle || 2025;

      try {
        await Movie.updateOne(
          { sourceUrl: p.url },
          { $set: { 
              title:       p.title, 
              sourceUrl:   p.url, 
              poster:      p.poster,
              category:    detalle.category,
              status:      'active',
              year:        finalYear,
              description: detalle.description || 'Sin sinopsis disponible.'
          }},
          { upsert: true }
        );
        mCount++;
        console.log(`✅ [${mCount}] ${p.title} (${finalYear}) - ${detalle.category}`);
      } catch (err) {
        console.error(`❌ Error guardando "${p.title}":`, err.message);
      }

      // Delay entre requests para no banear la IP
      await new Promise(r => setTimeout(r, 800));
    }

    console.log(`🎬 [Scraper] Finalizado. ${mCount} películas en MongoDB.`);

  } catch (e) {
    console.error("❌ Error en el scraper:", e.message);
  }
}

module.exports = runScraper;
