const axios = require('axios');
const cheerio = require('cheerio');
const Series = require('./models/Series');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Referer': 'https://www.google.com/'
};

async function scrapeSerieDetalle(serieSlug) {
  try {
    const url = 'https://cuevana.bi/serie/' + serieSlug;
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 10000 });
    const $ = cheerio.load(data);

    const title = $('h1').first().text().trim().replace(/\(\d{4}\)/, '').trim();

    const description =
      $('.description').first().text().trim() ||
      $('[class*="sinopsis"]').first().text().trim() ||
      $('[class*="overview"]').first().text().trim() ||
      $('p').filter((i, el) => $(el).text().trim().length > 80).first().text().trim();

    const genre = $('a[href*="/series?genero"]').first().text().trim() ||
      $('a[href*="/genero/"]').first().text().trim() || '';

    const yearText = $('h1').first().text().trim();
    const yearMatch = yearText.match(/\b(20\d{2}|19\d{2})\b/);
    const year = yearMatch ? parseInt(yearMatch[0]) : null;

    const poster =
      $('img[class*="poster"]').attr('src') ||
      $('img[class*="cover"]').attr('src') ||
      $('.poster img').attr('src') ||
      $('img').filter((i, el) => {
        const src = $(el).attr('src') || '';
        return src.includes('tmdb') || src.includes('poster');
      }).first().attr('src') || '';

    return { title, description, genre, year, poster };
  } catch (e) {
    console.error('scrapeSerieDetalle error: ' + e.message);
    return { title: '', description: '', genre: '', year: null, poster: '' };
  }
}

async function runSeriesScraper() {
  console.log('[SeriesScraper] Iniciando scraper de series Cuevana...');

  try {
    const { data } = await axios.get('https://cuevana.bi/episodios/recientes', {
      headers: HEADERS,
      timeout: 10000
    });

    const $ = cheerio.load(data);
    const episodiosMap = {};

    $('a').each((i, el) => {
      const href = $(el).attr('href') || '';
      const img = $(el).find('img');
      const text = img.attr('alt') || $(el).text().trim();

      if (!href.includes('/serie/') || !href.includes('/episodio-')) return;

      // Extraer slug de serie y codigo de episodio
      // URL: /serie/nombre-serie/episodio-1x5
      const match = href.match(/\/serie\/([^/]+)\/episodio-(\d+)x(\d+)/);
      if (!match) return;

      const serieSlug = match[1];
      const season = parseInt(match[2]);
      const episode = parseInt(match[3]);

      // Limpiar titulo del episodio
      let epTitle = text.replace(/\d+x\d+/, '').trim();
if (!epTitle || epTitle.toLowerCase().includes('poster')) {
  epTitle = 'Episodio ' + episode;
}

      const poster =
        img.attr('data-src') ||
        img.attr('src') || '';

      const fullUrl = href.startsWith('http') ? href : 'https://cuevana.bi' + href;
      let fullPoster = poster.startsWith('//') ? 'https:' + poster : poster;
      if (fullPoster && !fullPoster.startsWith('http')) fullPoster = 'https://cuevana.bi' + fullPoster;

      if (!episodiosMap[serieSlug]) {
        episodiosMap[serieSlug] = {
          slug: serieSlug,
          poster: fullPoster,
          episodes: []
        };
      }

      // Solo agregar si no existe ya este episodio
      const exists = episodiosMap[serieSlug].episodes.find(e => e.season === season && e.number === episode);
      if (!exists) {
        episodiosMap[serieSlug].episodes.push({
          season,
          number: episode,
          title: epTitle,
          streamUrl: fullUrl
        });
      }
    });

    const series = Object.values(episodiosMap);
    console.log('Series encontradas: ' + series.length);

    let sCount = 0;
    for (const s of series) {
      const detalle = await scrapeSerieDetalle(s.slug);

      const title = detalle.title || s.slug.replace(/-/g, ' ');
      const maxSeason = Math.max(...s.episodes.map(e => e.season));
      const poster = detalle.poster || s.poster;

      console.log('[' + (sCount + 1) + '] ' + title);
      console.log('   Episodios: ' + s.episodes.length + ' | Genero: ' + (detalle.genre || 'N/A'));

      try {
        // Buscar serie existente
        const existing = await Series.findOne({ title: { $regex: new RegExp('^' + title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') } });

        if (existing) {
          // Actualizar episodios existentes y agregar nuevos
          for (const ep of s.episodes) {
            const epExists = existing.episodeList.find(e => e.season === ep.season && e.number === ep.number);
            if (!epExists) {
              existing.episodeList.push(ep);
            }
          }
          existing.episodes = existing.episodeList.length;
          existing.seasons = Math.max(existing.seasons || 1, maxSeason);
          if (detalle.description) existing.description = detalle.description;
          if (detalle.genre) existing.genre = detalle.genre;
          if (poster) existing.poster = poster;
          await existing.save();
        } else {
          await Series.create({
            title,
            poster,
            description: detalle.description || '',
            genre: detalle.genre || '',
            category: 'Series',
            year: detalle.year || null,
            seasons: maxSeason,
            episodes: s.episodes.length,
            episodeList: s.episodes,
            status: 'active'
          });
        }
        sCount++;
      } catch (err) {
        console.error('Error guardando "' + title + '": ' + err.message);
      }

      await new Promise(r => setTimeout(r, 800));
    }

    console.log('[SeriesScraper] Finalizado. ' + sCount + ' series en MongoDB.');

  } catch (e) {
    console.error('Error en scraper de series: ' + e.message);
  }
}

module.exports = runSeriesScraper;
        
