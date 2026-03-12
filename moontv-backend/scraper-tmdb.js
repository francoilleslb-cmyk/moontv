// scraper-tmdb.js — películas con vidsrc embed
const axios = require('axios');
const Movie = require('./models/Movie');

const TMDB_KEY      = '629090337a8714f47918a99ed0fedbe3';
const TMDB_BASE     = 'https://api.themoviedb.org/3';
const LANG          = 'es-MX';
const POSTER_BASE   = 'https://image.tmdb.org/t/p/w500';
const BACKDROP_BASE = 'https://image.tmdb.org/t/p/w1280';
const PAGES         = 5; // 5 páginas x 20 = 100 por endpoint

const GENRE_MAP = {
  28: 'Acción', 12: 'Aventura', 16: 'Animación', 35: 'Comedia',
  80: 'Crimen', 99: 'Documental', 18: 'Drama', 10751: 'Familia',
  14: 'Fantasía', 36: 'Historia', 27: 'Terror', 10402: 'Música',
  9648: 'Misterio', 10749: 'Romance', 878: 'Ciencia Ficción',
  10770: 'Película de TV', 53: 'Thriller', 10752: 'Bélica', 37: 'Western',
};

// Fuentes de embed — se prueban en orden
// vidsrc.to es el más completo con audio en español latino
const EMBED_SOURCES = [
  {
    name: 'vidsrc',
    url: (tmdbId) => `https://vidsrc.to/embed/movie/${tmdbId}`,
  },
  {
    name: 'embedsu',
    url: (tmdbId) => `https://embed.su/embed/movie/${tmdbId}`,
  },
  {
    name: 'multiembed',
    url: (tmdbId) => `https://multiembed.mov/?tmdb_id=${tmdbId}&video_type=movie`,
  },
];

async function fetchMovies(endpoint, pages) {
  const movies = [];
  for (let page = 1; page <= pages; page++) {
    try {
      const { data } = await axios.get(`${TMDB_BASE}${endpoint}`, {
        params: { api_key: TMDB_KEY, language: LANG, page },
        timeout: 10000,
      });
      movies.push(...data.results);
      await delay(250);
    } catch (e) {
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
  } catch (e) {
    return null;
  }
}

// Verifica si el embed responde (status 200)
async function testEmbed(url) {
  try {
    const res = await axios.get(url, {
      timeout: 6000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
      validateStatus: s => s < 500,
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

// Devuelve la primera fuente que responde, o la primera por defecto
async function resolveStreamUrl(tmdbId) {
  for (const source of EMBED_SOURCES) {
    const url = source.url(tmdbId);
    const ok  = await testEmbed(url);
    if (ok) {
      console.log(`   [embed] ${source.name} ✅`);
      return { streamUrl: url, embedType: source.name };
    }
    console.log(`   [embed] ${source.name} ❌`);
    await delay(300);
  }
  // Fallback: vidsrc igual (el player lo maneja)
  return {
    streamUrl: EMBED_SOURCES[0].url(tmdbId),
    embedType: EMBED_SOURCES[0].name,
  };
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runTMDBScraper() {
  console.log('[TMDB] Iniciando scraper de películas con vidsrc...\n');

  try {
    console.log('[TMDB] Cargando populares...');
    const popular = await fetchMovies('/movie/popular', PAGES);

    console.log('[TMDB] Cargando mejor valoradas...');
    const topRated = await fetchMovies('/movie/top_rated', PAGES);

    console.log('[TMDB] Cargando estrenos en español...');
    const discoverES = await fetchMovies(
      '/discover/movie?with_original_language=es&sort_by=popularity.desc',
      PAGES
    );

    // Deduplicar
    const allMovies = [...popular, ...topRated, ...discoverES];
    const seen = new Set();
    const unique = allMovies.filter(m => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });

    // Filtrar: últimos 5 años + rating mínimo 6.5
    const currentYear = new Date().getFullYear();
    const filtered = unique
      .filter(m => {
        const year = m.release_date ? parseInt(m.release_date.substring(0, 4)) : 0;
        return year >= currentYear - 5;
      })
      .filter(m => m.vote_average >= 6.5)
      .sort((a, b) => b.vote_average - a.vote_average);

    console.log(`\n[TMDB] Únicas: ${unique.length} | Filtradas: ${filtered.length}\n`);

    let added = 0, updated = 0, skipped = 0;

    for (const m of filtered) {
      if (!m.title || !m.poster_path) { skipped++; continue; }

      console.log(`[→] ${m.title} (${m.release_date?.substring(0,4) || '?'})`);

      const imdbId = await getImdbId(m.id);
      if (!imdbId) {
        console.log(`   [skip] Sin imdbId`);
        skipped++;
        await delay(150);
        continue;
      }

      // Resolver embed funcional
      const { streamUrl, embedType } = await resolveStreamUrl(m.id);

      const genres   = (m.genre_ids || []).map(id => GENRE_MAP[id]).filter(Boolean);
      const category = genres[0] || 'Películas';

      const movieData = {
        title:         m.title,
        originalTitle: m.original_title || '',
        synopsis:      m.overview || '',
        description:   m.overview || '',
        poster:        POSTER_BASE + m.poster_path,
        backdrop:      m.backdrop_path ? BACKDROP_BASE + m.backdrop_path : '',
        year:          m.release_date ? parseInt(m.release_date.substring(0, 4)) : null,
        rating:        m.vote_average ? parseFloat(m.vote_average.toFixed(1)) : 0,
        genres,
        genre:         category,
        category,
        language:      m.original_language || 'es',
        imdbId,
        tmdbId:        m.id,
        streamUrl,
        embedType,
        status:        'active',
        isPaid:        false,
        isFeatured:    false,
        sortOrder:     0,
      };

      try {
        const existing = await Movie.findOne({ imdbId });
        if (existing) {
          await Movie.updateOne({ imdbId }, { $set: movieData });
          updated++;
          console.log(`   [UPD] ${category}`);
        } else {
          await Movie.create(movieData);
          added++;
          console.log(`   [ADD] ${category}`);
        }
      } catch (err) {
        console.error(`   [ERR] ${err.message}`);
        skipped++;
      }

      await delay(150);
    }

    console.log(`\n[TMDB] ✅ Finalizado`);
    console.log(`   Nuevas   : ${added}`);
    console.log(`   Actualizadas: ${updated}`);
    console.log(`   Saltadas : ${skipped}`);

  } catch (e) {
    console.error('[TMDB] Error general:', e.message);
  }
}

function startCron() {
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  runTMDBScraper(); // ejecutar al inicio
  setInterval(runTMDBScraper, WEEK);
  console.log('[TMDB] Cron semanal activo ✅');
}

module.exports = runTMDBScraper;
module.exports.startCron = startCron;
