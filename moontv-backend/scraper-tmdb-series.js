const axios = require('axios');
const Series = require('./models/Series');

const TMDB_KEY = '629090337a8714f47918a99ed0fedbe3';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const LANG = 'es-MX';
const POSTER_BASE = 'https://image.tmdb.org/t/p/w500';
const BACKDROP_BASE = 'https://image.tmdb.org/t/p/w1280';
const PAGES = 5; // 5 páginas x 20 = 100 series por categoría

const GENRE_MAP = {
  10759: 'Acción y Aventura', 16: 'Animación', 35: 'Comedia', 80: 'Crimen',
  99: 'Documental', 18: 'Drama', 10751: 'Familia', 10762: 'Infantil',
  9648: 'Misterio', 10763: 'Noticias', 10764: 'Reality', 10765: 'Ciencia Ficción y Fantasía',
  10766: 'Telenovela', 10767: 'Talk Show', 10768: 'Guerra y Política', 37: 'Western'
};

async function fetchSeries(endpoint, pages) {
  const results = [];
  for (let page = 1; page <= pages; page++) {
    try {
      const { data } = await axios.get(`${TMDB_BASE}${endpoint}`, {
        params: { api_key: TMDB_KEY, language: LANG, page },
        timeout: 10000
      });
      results.push(...data.results);
      await new Promise(r => setTimeout(r, 250));
    } catch(e) {
      console.error('Error fetch página', page, e.message);
    }
  }
  return results;
}

async function getExternalIds(tmdbId) {
  try {
    const { data } = await axios.get(`${TMDB_BASE}/tv/${tmdbId}/external_ids`, {
      params: { api_key: TMDB_KEY },
      timeout: 8000
    });
    return data.imdb_id || null;
  } catch(e) {
    return null;
  }
}

async function runTMDBSeriesScraper() {
  console.log('[TMDBSeries] Iniciando scraper...');
  try {
    console.log('[TMDBSeries] Cargando series populares...');
    const popular = await fetchSeries('/tv/popular', PAGES);

    console.log('[TMDBSeries] Cargando series mejor valoradas...');
    const topRated = await fetchSeries('/tv/top_rated', PAGES);

    // Deduplicar
    const all = [...popular, ...topRated];
    const unique = [];
    const seen = new Set();
    for (const s of all) {
      if (!seen.has(s.id)) { seen.add(s.id); unique.push(s); }
    }
console.log('[TMDBSeries] Total únicas:', unique.length);

const currentYear = new Date().getFullYear();
const filtered = unique
  .filter(s => {
    const year = s.first_air_date ? parseInt(s.first_air_date.substring(0, 4)) : 0;
    return year >= currentYear - 5;
  })
  .filter(s => s.vote_average >= 6.5)
  .sort((a, b) => b.vote_average - a.vote_average);

console.log('[TMDBSeries] Después de filtros:', filtered.length);

    let added = 0, updated = 0, skipped = 0;

    for (const s of filtered) {
      if (!s.name || !s.poster_path) { skipped++; continue; }

      const imdbId = await getExternalIds(s.id);
      if (!imdbId) { skipped++; continue; }

      await new Promise(r => setTimeout(r, 150));

      const genres = (s.genre_ids || []).map(id => GENRE_MAP[id]).filter(Boolean);
      streamUrl: `https://www.cineby.gd/movie/${m.id}`,

      const seriesData = {
        title: s.name,
        originalTitle: s.original_name || '',
        synopsis: s.overview || '',
        description: s.overview || '',
        poster: POSTER_BASE + s.poster_path,
        backdrop: s.backdrop_path ? BACKDROP_BASE + s.backdrop_path : '',
        year: s.first_air_date ? parseInt(s.first_air_date.substring(0, 4)) : null,
        rating: s.vote_average ? parseFloat(s.vote_average.toFixed(1)) : 0,
        genre: genres[0] || 'Series',
        genres,
        category: genres[0] || 'Series',
        imdbId,
        tmdbId: s.id,
        streamUrl,
        embedType: 'cineby',
        status: 'active',
        isActive: true,
      };

      try {
        const existing = await Series.findOne({ imdbId });
        if (existing) {
          await Series.updateOne({ imdbId }, { $set: seriesData });
          updated++;
        } else {
          await Series.create(seriesData);
          added++;
        }
        console.log(`[${added+updated}] ${s.name} (${seriesData.year}) → ${imdbId}`);
      } catch(err) {
        console.error('Error guardando:', s.name, err.message);
      }
    }

    console.log(`[TMDBSeries] Finalizado. Nuevas: ${added} | Actualizadas: ${updated} | Saltadas: ${skipped}`);
  } catch(e) {
    console.error('[TMDBSeries] Error:', e.message);
  }
}

function startCron() {
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  setInterval(runTMDBSeriesScraper, WEEK);
  console.log('[TMDBSeries] Cron semanal activo');
}

module.exports = runTMDBSeriesScraper;
module.exports.startCron = startCron;
