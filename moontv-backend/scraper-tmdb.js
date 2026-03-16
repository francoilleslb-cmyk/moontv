// scraper-tmdb.js — películas con Torrentio (ExoPlayer) + vidsrc fallback
const axios = require('axios');
const Movie = require('./models/Movie');

const TMDB_KEY      = '629090337a8714f47918a99ed0fedbe3';
const TMDB_BASE     = 'https://api.themoviedb.org/3';
const LANG          = 'es-MX';
const POSTER_BASE   = 'https://image.tmdb.org/t/p/w500';
const BACKDROP_BASE = 'https://image.tmdb.org/t/p/w1280';
const PAGES         = 5;

const GENRE_MAP = {
  28: 'Acción', 12: 'Aventura', 16: 'Animación', 35: 'Comedia',
  80: 'Crimen', 99: 'Documental', 18: 'Drama', 10751: 'Familia',
  14: 'Fantasía', 36: 'Historia', 27: 'Terror', 10402: 'Música',
  9648: 'Misterio', 10749: 'Romance', 878: 'Ciencia Ficción',
  10770: 'Película de TV', 53: 'Thriller', 10752: 'Bélica', 37: 'Western',
};

// Torrentio config — filtra por español latino/español
// Docs: https://torrentio.strem.fun/configure
const TORRENTIO_BASE = 'https://torrentio.strem.fun';
const TORRENTIO_CONFIG = 'sort=qualitysize|qualityfilter=480p,scr,cam';

// Palabras clave de audio español en el título del torrent
const SPANISH_KEYWORDS = [
  'spanish', 'español', 'espanol', 'latino', 'lat', 'spa',
  'dual', 'multi', 'castellano', 'es.', '[es]', '(es)',
];

function hasSpanishAudio(title) {
  const t = title.toLowerCase();
  return SPANISH_KEYWORDS.some(k => t.includes(k));
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── TMDB ────────────────────────────────────────────────────────────────────
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
  } catch {
    return null;
  }
}

// ─── TORRENTIO ───────────────────────────────────────────────────────────────
async function getTorrentioStreams(imdbId) {
  try {
    const url = `${TORRENTIO_BASE}/${TORRENTIO_CONFIG}/stream/movie/${imdbId}.json`;
    const { data } = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    const streams = data.streams || [];
    if (!streams.length) return null;

    // Prioridad 1: streams con audio español explícito
    const spanishStreams = streams.filter(s =>
      hasSpanishAudio(s.title || '') || hasSpanishAudio(s.name || '')
    );

    // Prioridad 2: cualquier stream si no hay en español
    const candidates = spanishStreams.length ? spanishStreams : streams;

    // Preferir 1080p > 720p > el resto
    const sorted = candidates.sort((a, b) => {
      const score = (s) => {
        const t = (s.title || '').toLowerCase();
        if (t.includes('1080')) return 3;
        if (t.includes('720'))  return 2;
        return 1;
      };
      return score(b) - score(a);
    });

    const best = sorted[0];
    if (!best?.url) return null;

    const isSpanish = hasSpanishAudio(best.title || '');
    console.log(`   [torrentio] ✅ ${isSpanish ? '🇦🇷 español' : '🌐 sin español'} — ${(best.title || '').split('\n')[0].substring(0, 60)}`);

    return {
      streamUrl:  best.url,
      streamType: best.url.includes('.m3u8') ? 'hls' : 'torrent',
      embedType:  'torrentio',
      hasSpanish: isSpanish,
    };
  } catch (e) {
    console.log(`   [torrentio] ❌ ${e.message}`);
    return null;
  }
}

// ─── EMBED FALLBACK ──────────────────────────────────────────────────────────
const EMBED_SOURCES = [
  { name: 'vidsrc',     url: (id) => `https://vidsrc.to/embed/movie/${id}` },
  { name: 'embedsu',    url: (id) => `https://embed.su/embed/movie/${id}` },
  { name: 'multiembed', url: (id) => `https://multiembed.mov/?tmdb_id=${id}&video_type=movie` },
];

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

async function resolveEmbedUrl(tmdbId) {
  for (const source of EMBED_SOURCES) {
    const url = source.url(tmdbId);
    const ok  = await testEmbed(url);
    if (ok) {
      console.log(`   [embed] ${source.name} ✅`);
      return { streamUrl: url, embedType: source.name, streamType: 'embed' };
    }
    console.log(`   [embed] ${source.name} ❌`);
    await delay(300);
  }
  return {
    streamUrl: EMBED_SOURCES[0].url(tmdbId),
    embedType: EMBED_SOURCES[0].name,
    streamType: 'embed',
  };
}

// ─── RESOLVER PRINCIPAL ───────────────────────────────────────────────────────
// Intenta Torrentio primero, si falla cae a embed
async function resolveStreamUrl(imdbId, tmdbId) {
  const torrentio = await getTorrentioStreams(imdbId);
  if (torrentio) return torrentio;

  console.log(`   [torrentio] sin resultado, usando embed...`);
  return resolveEmbedUrl(tmdbId);
}

// ─── SCRAPER PRINCIPAL ────────────────────────────────────────────────────────
async function runTMDBScraper() {
  console.log('[TMDB] Iniciando scraper de películas con Torrentio...\n');
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

    const allMovies = [...popular, ...topRated, ...discoverES];
    const seen = new Set();
    const unique = allMovies.filter(m => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });

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
      console.log(`[→] ${m.title} (${m.release_date?.substring(0, 4) || '?'})`);

      const imdbId = await getImdbId(m.id);
      if (!imdbId) {
        console.log(`   [skip] Sin imdbId`);
        skipped++;
        await delay(150);
        continue;
      }

      const { streamUrl, embedType, streamType, hasSpanish } = await resolveStreamUrl(imdbId, m.id);

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
        streamType:    streamType || 'embed',
        hasSpanishAudio: hasSpanish || false,
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
      await delay(200);
    }

    console.log(`\n[TMDB] ✅  Finalizado`);
    console.log(`   Nuevas      : ${added}`);
    console.log(`   Actualizadas: ${updated}`);
    console.log(`   Saltadas    : ${skipped}`);
  } catch (e) {
    console.error('[TMDB] Error general:', e.message);
  }
}

function startCron() {
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  runTMDBScraper();
  setInterval(runTMDBScraper, WEEK);
  console.log('[TMDB] Cron semanal activo ✅');
}

module.exports = runTMDBScraper;
module.exports.startCron = startCron;
