// scraper-tmdb.js
const axios = require('axios');
const Movie = require('./models/Movie');

const TMDB_KEY   = '629090337a8714f47918a99ed0fedbe3';
const TMDB_BASE  = 'https://api.themoviedb.org/3';
const LANG       = 'es-MX';
const POSTER_BASE   = 'https://image.tmdb.org/t/p/w500';
const BACKDROP_BASE = 'https://image.tmdb.org/t/p/w1280';
const PAGES = 5; // 5 páginas x 20 = 100 por endpoint

const GENRE_MAP = {
  28: 'Acción', 12: 'Aventura', 16: 'Animación', 35: 'Comedia',
  80: 'Crimen', 99: 'Documental', 18: 'Drama', 10751: 'Familia',
  14: 'Fantasía', 36: 'Historia', 27: 'Terror', 10402: 'Música',
  9648: 'Misterio', 10749: 'Romance', 878: 'Ciencia Ficción',
  10770: 'Película de TV', 53: 'Thriller', 10752: 'Bélica', 37: 'Western',
};

// Idiomas que se consideran "en español / latino"
const SPANISH_LANGUAGES = ['es'];

async function fetchMovies(endpoint, pages) {
  const movies = [];
  for (let page = 1; page <= pages; page++) {
    try {
      const { data } = await axios.get(`${TMDB_BASE}${endpoint}`, {
        params: { api_key: TMDB_KEY, language: LANG, page },
        timeout: 10000,
      });
      movies.push(...data.results);
      await new Promise(r => setTimeout(r, 250));
    } catch(e) {
      console.error('[TMDB] Error fetch página', page, e.message);
    }
  }
  return movies;
}

async function getImdbId(tmdbId) {
  try {
    const { data } = await axios.get(`${TMDB_BASE}/movie/${tmdbId}/external_ids`, {
      params: { api_key: TMDB_KEY },
      timeout: 8000,
    });
    return data.imdb_id || null;
  } catch(e) {
    return null;
  }
}

async function runTMDBScraper() {
  console.log('[TMDB] Iniciando scraper (solo español/latino)...');
  try {
    // Endpoints: populares + mejor valoradas + descubrir en español
    console.log('[TMDB] Cargando populares...');
    const popular = await fetchMovies('/movie/popular', PAGES);

    console.log('[TMDB] Cargando mejor valoradas...');
    const topRated = await fetchMovies('/movie/top_rated', PAGES);

    // Discover: películas en español directamente
    console.log('[TMDB] Cargando discover en español...');
    const discoverES = await fetchMovies(
      '/discover/movie?with_original_language=es&sort_by=popularity.desc',
      PAGES
    );

    // Combinar y deduplicar
    const allMovies = [...popular, ...topRated, ...discoverES];
    const unique = [];
    const seen = new Set();
    for (const m of allMovies) {
      if (!seen.has(m.id)) { seen.add(m.id); unique.push(m); }
    }

    // Filtrar solo idioma español
    const currentYear = new Date().getFullYear();
const spanishMovies = unique
  .filter(m => {
    const year = m.release_date ? parseInt(m.release_date.substring(0, 4)) : 0;
    return year >= currentYear - 5;
  })
  .filter(m => m.vote_average >= 6.5)        // puntuación mínima 6.5
  .sort((a, b) => b.vote_average - a.vote_average); // mejor puntuadas primero

    console.log(`[TMDB] Total únicas: ${unique.length} | En español: ${spanishMovies.length}`);

    let added = 0, updated = 0, skipped = 0;

    for (const m of spanishMovies) {
      if (!m.title || !m.poster_path) { skipped++; continue; }

      const imdbId = await getImdbId(m.id);
      if (!imdbId) { skipped++; continue; }

      await new Promise(r => setTimeout(r, 150));

      const genres   = (m.genre_ids || []).map(id => GENRE_MAP[id]).filter(Boolean);
      const category = genres[0] || 'Películas';

      const movieData = {
        title:         m.title,
        originalTitle: m.original_title,
        synopsis:      m.overview || '',
        description:   m.overview || '',
        poster:        POSTER_BASE + m.poster_path,
        backdrop:      m.backdrop_path ? BACKDROP_BASE + m.backdrop_path : '',
        year:          m.release_date ? parseInt(m.release_date.substring(0, 4)) : null,
        rating:        m.vote_average ? parseFloat(m.vote_average.toFixed(1)) : 0,
        genres,
        genre:         category,   // campo legado sincronizado
        category,                  // género principal para filtros
        language:      m.original_language,  // 'es'
        imdbId,
        tmdbId:        m.id,
        streamUrl:     `https://vidsrc.xyz/embed/movie/${imdbId}?ds_lang=es`,
        embedType:     'vidsrc',
        status:        'active',
        isActive:      true,
      };

      try {
        const existing = await Movie.findOne({ imdbId });
        if (existing) {
          await Movie.updateOne({ imdbId }, { $set: movieData });
          updated++;
          console.log(`[UPD] ${m.title} (${movieData.year}) → ${category}`);
        } else {
          await Movie.create(movieData);
          added++;
          console.log(`[ADD] ${m.title} (${movieData.year}) → ${category}`);
        }
      } catch(err) {
        console.error('[TMDB] Error guardando:', m.title, err.message);
        skipped++;
      }
    }

    console.log(`[TMDB] Finalizado. Nuevas: ${added} | Actualizadas: ${updated} | Saltadas: ${skipped}`);
  } catch(e) {
    console.error('[TMDB] Error general:', e.message);
  }
}

function startCron() {
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  setInterval(runTMDBScraper, WEEK);
  console.log('[TMDB] Cron semanal activo');
}

module.exports = runTMDBScraper;
module.exports.startCron = startCron;
