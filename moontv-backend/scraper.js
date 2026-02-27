const axios = require('axios');
const cheerio = require('cheerio');
const Movie = require('./models/Movie');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
};

async function scrapeDetalle(url) {
  try {
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 10000 });
    const $ = cheerio.load(data);

    const description = $(
      '.synopsis p, .Description p, .sinopsis p, [itemprop="description"], .info-content p'
    ).first().text().trim();

    const genre = $(
      '.genres a, .Genres a, .genre a, [itemprop="genre"]'
    ).first().text().trim() || '';

    const yearText = $(
      '.year, .Year, [itemprop="dateCreated"], .date'
    ).first().text().trim();
    const yearMatch = yearText.match(/\b(20\d{2}|19\d{2})\b/);
    const year = yearMatch ? parseInt(yearMatch[0]) : null;

    return { description, genre, year };
  } catch {
    return { description: '', genre: '', year: null };
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
    const peliculas = [];

    $('a').each((i, el) => {
      const link   = $(el).attr('href');
      const img    = $(el).find('img');
      const poster = img.attr('data-src') || img.attr('src');
      const title  = img.attr('alt') || $(el).find('h2').text().trim();

      if (!link || !title || !poster) return;
      if (title.length < 2) return;

      // Filtrar series y basura
      if (/\d+x\d+/i.test(title)) return;
      if (/logo|banner|icon/i.test(title)) return;

      const fullUrl = link.startsWith('http') ? link : `https://cuevana.bi${link}`;
      let fullPoster = poster.startsWith('//') ? `https:${poster}` : poster;
      if (!fullPoster.startsWith('http')) fullPoster = `https://cuevana.bi${fullPoster}`;

      // Limpiar año del título
      const yearMatch = title.match(/\b(20\d{2}|19\d{2})\b/);
      const yearFromTitle = yearMatch ? parseInt(yearMatch[0]) : null;
      const cleanTitle = yearMatch 
        ? title.replace(yearMatch[0], '').replace(/\s*-\s*/g, ' ').trim()
        : title.trim();

      if (!peliculas.find(p => p.url === fullUrl)) {
        peliculas.push({ url: fullUrl, title: cleanTitle, poster: fullPoster, yearFromTitle });
      }
    });

    if (peliculas.length === 0) {
      console.warn('⚠️ 0 resultados — posible bloqueo. HTML:', data.substring(0, 500));
      return;
    }

    console.log(`📦 Encontradas: ${peliculas.length} películas. Obteniendo detalles...`);

    let mCount = 0;
    for (const p of peliculas) {
      const detalle = await scrapeDetalle(p.url);
      const finalYear = detalle.year || p.yearFromTitle || new Date().getFullYear();

      try {
        await Movie.updateOne(
          { streamUrl: p.url },
          { $set: { 
              title:       p.title, 
              streamUrl:   p.url,
              poster:      p.poster,
              genre:       detalle.genre,
              category:    'Películas',
              status:      'active',
              year:        finalYear,
              description: detalle.description || 'Sin sinopsis disponible.'
          }},
          { upsert: true }
        );
        mCount++;
        console.log(`✅ [${mCount}] ${p.title} (${finalYear})`);
      } catch (err) {
        console.error(`❌ Error guardando "${p.title}":`, err.message);
      }

      await new Promise(r => setTimeout(r, 800));
    }

    console.log(`🎬 [Scraper] Finalizado. ${mCount} películas en MongoDB.`);

  } catch (e) {
    console.error("❌ Error en el scraper:", e.message);
  }
}

module.exports = runScraper;
