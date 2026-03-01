const axios = require('axios');
const cheerio = require('cheerio');
const Movie = require('./models/Movie');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Referer': 'https://www.google.com/'
};

async function scrapeDetalle(url) {
  try {
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 10000 });
    const $ = cheerio.load(data);

    // Sinopsis - selector especifico de Cuevana
    const description =
      $('.description').first().text().trim() ||
      $('[class*="sinopsis"]').first().text().trim() ||
      $('[class*="overview"]').first().text().trim() ||
      $('p').filter((i, el) => $(el).text().trim().length > 80).first().text().trim();

    // Genero - links de genero en Cuevana
    const genreLinks = [];
    $('a[href*="/genero/"], a[href*="/genre/"]').each((i, el) => {
      const g = $(el).text().trim();
      if (g) genreLinks.push(g);
    });
    const genre = genreLinks[0] || 
      $('.jump-link[href*="genero"]').first().text().trim() ||
      $('[class*="genre"]').first().text().trim() || '';

    // Año
    const yearText = $('.year, .Year, [itemprop="dateCreated"], .date, .extra span').first().text().trim();
    const yearMatch = yearText.match(/\b(20\d{2}|19\d{2})\b/);
    const year = yearMatch ? parseInt(yearMatch[0]) : null;

    // Rating
    const ratingText = $('[class*="rating"], [class*="score"], [class*="vote"]').first().text().trim();
    const ratingMatch = ratingText.match(/[\d.]+/);
    const rating = ratingMatch ? parseFloat(ratingMatch[0]) : 0;

    console.log('   Sinopsis: ' + (description ? description.substring(0, 60) + '...' : 'VACIA'));
    console.log('   Genero: ' + (genre || 'VACIO'));
    console.log('   Ano: ' + (year || 'NO ENCONTRADO'));

    return { description, genre, year, rating };
  } catch (e) {
    console.error('scrapeDetalle error: ' + e.message);
    return { description: '', genre: '', year: null, rating: 0 };
  }
}

async function runScraper() {
  console.log('[Scraper] Iniciando scraper Cuevana...');

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
      let title    = img.attr('alt') || $(el).find('h2').text().trim();

      if (!link || !title || !poster) return;
      if (title.length < 2) return;

      // Filtrar Discord y links externos
      if (link.includes('discord') || link.includes('discord.gg')) return;
      if (!link.includes('cuevana') && !link.startsWith('/')) return;

      // Filtrar series
      if (/^serie\s/i.test(title)) return;
      if (/temporada\s\d+/i.test(title)) return;
      if (/\d+x\d+/i.test(title)) return;

      // Solo aceptar links de peliculas
      if (!link.includes('/pelicula/')) return;

      // Limpiar prefijo "Pelicula"
      title = title.replace(/^pelicula\s+/i, '').trim();

      // Filtrar logos y basura
      if (/logo|banner|icon|discord/i.test(title)) return;
      if (title.length < 3) return;

      const fullUrl = link.startsWith('http') ? link : 'https://cuevana.bi' + link;
      let fullPoster = poster.startsWith('//') ? 'https:' + poster : poster;
      if (!fullPoster.startsWith('http')) fullPoster = 'https://cuevana.bi' + fullPoster;

      // Filtrar posters de Discord u otros externos raros
      if (fullPoster.includes('discord') || fullPoster.includes('discordlogo')) return;

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
      console.warn('0 resultados - posible bloqueo. HTML: ' + data.substring(0, 500));
      return;
    }

    console.log('Encontradas: ' + peliculas.length + ' peliculas. Obteniendo detalles...');

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
              category:    'Peliculas',
              status:      'active',
              year:        finalYear,
              description: detalle.description || '',
              rating:      detalle.rating || 0
          }},
          { upsert: true }
        );
        mCount++;
        console.log('[' + mCount + '] ' + p.title + ' (' + finalYear + ')');
      } catch (err) {
        console.error('Error guardando "' + p.title + '": ' + err.message);
      }

      await new Promise(r => setTimeout(r, 800));
    }

    console.log('[Scraper] Finalizado. ' + mCount + ' peliculas en MongoDB.');

  } catch (e) {
    console.error('Error en el scraper: ' + e.message);
  }
}

module.exports = runScraper;
