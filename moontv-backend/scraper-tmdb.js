const axios = require('axios');
const Movie = require('./models/Movie');

const TMDB_KEY = '629090337a8714f47918a99ed0fedbe3';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const LANG = 'es-MX';
const POSTER_BASE = 'https://image.tmdb.org/t/p/w500';
const BACKDROP_BASE = 'https://image.tmdb.org/t/p/w1280';
const PAGES = 5; // 5 páginas x 20 = 100 películas por categoría

const GENRE_MAP = {
  28: 'Acción', 12: 'Aventura', 16: 'Animación', 35: 'Comedia',
  80: 'Crimen', 99: 'Documental', 18: 'Drama', 10751: 'Familia',
  14: 'Fantasía', 36: 'Historia', 27: 'Terror', 10402: 'Música',
  9648: 'Misterio', 10749: 'Romance', 878: 'Ciencia Ficción',
  10770: 'Película de TV', 53: 'Thriller', 10752: 'Bélica', 37: 'Western'
};

async function fetchMovies(endpoint, pages) {
  const movies = [];
  for (let page = 1; page <= pages; page++) {
    try {
      const { data } = await axios.get(`${TMDB_BASE}${endpoint}`, {
        params: { api_key: TMDB_KEY, language: LANG, page },
        timeout: 10000
      });
      movies.push(...data.results);
      await new Promise(r => setTimeout(r, 250)); // rate limit
    } catch(e) {
      console.error('Error fetch página', page, e.message);
    }
  }
  return movies;
}

async function getImdbId(tmdbId) {
  try {
    const { data } = await axios.get(`${TMDB_BASE}/movie/${tmdbId}/external_ids`, {
      params: { api_key: TMDB_KEY },
      timeout: 8000
    });
    return data.imdb_id || null;
  } catch(e) {
    return null;
  }
}

async function runTMDBScraper() {
  console.log('[TMDB] Iniciando scraper...');
  try {
    // Traer películas populares y mejor valoradas
    console.log('[TMDB] Cargando películas populares...');
    const popular = await fetchMovies('/movie/popular', PAGES);

    console.log('[TMDB] Cargando películas mejor valoradas...');
    const topRated = await fetchMovies('/movie/top_rated', PAGES);

    // Combinar y deduplicar por tmdbId
    const allMovies = [...popular, ...topRated];
    const unique = [];
    const seen = new Set();
    for (const m of allMovies) {
      if (!seen.has(m.id)) { seen.add(m.id); unique.push(m); }
    }
    console.log('[TMDB] Total únicas:', unique.length);

    let added = 0, updated = 0, skipped = 0;

    for (const m of unique) {
      if (!m.title || !m.poster_path) { skipped++; continue; }

      // Obtener IMDB ID
      const imdbId = await getImdbId(m.id);
      if (!imdbId) { skipped++; continue; }

      await new Promise(r => setTimeout(r, 150)); // rate limit

      const genres = (m.genre_ids || []).map(id => GENRE_MAP[id]).filter(Boolean);
      const streamUrl = `https://vidsrc.to/embed/movie/${imdbId}`;

      const movieData = {
        title: m.title,
        originalTitle: m.original_title,
        synopsis: m.overview || '',
        poster: POSTER_BASE + m.poster_path,
        backdrop: m.backdrop_path ? BACKDROP_BASE + m.backdrop_path : '',
        year: m.release_date ? parseInt(m.release_date.substring(0, 4)) : null,
        rating: m.vote_average ? m.vote_average.toFixed(1) : null,
        genres,
        category: genres[0] || 'Películas',
        imdbId,
        tmdbId: m.id,
        streamUrl,
        embedType: 'vidsrc',
        isActive: true,
      };

      try {
        const existing = await Movie.findOne({ imdbId });
        if (existing) {
          await Movie.updateOne({ imdbId }, { $set: movieData });
          updated++;
        } else {
          await Movie.create(movieData);
          added++;
        }
        console.log(`[${added+updated}] ${m.title} (${movieData.year}) → ${imdbId}`);
      } catch(err) {
        console.error('Error guardando:', m.title, err.message);
      }
    }

    console.log(`[TMDB] Finalizado. Nuevas: ${added} | Actualizadas: ${updated} | Saltadas: ${skipped}`);
  } catch(e) {
    console.error('[TMDB] Error:', e.message);
  }
}

function startCron() {
  // Actualizar catálogo cada 7 días
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  setInterval(runTMDBScraper, WEEK);
  console.log('[TMDB] Cron semanal activo');
}

module.exports = runTMDBScraper;
module.exports.startCron = startCron;
