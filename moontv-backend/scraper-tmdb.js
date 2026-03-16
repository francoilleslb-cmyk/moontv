// scraper-tmdb.js — TMDB metadata + Xtream Codes streams en español latino
const axios = require('axios');
const Movie = require('./models/Movie');

const TMDB_KEY      = '629090337a8714f47918a99ed0fedbe3';
const TMDB_BASE     = 'https://api.themoviedb.org/3';
const LANG          = 'es-MX';
const POSTER_BASE   = 'https://image.tmdb.org/t/p/w500';
const BACKDROP_BASE = 'https://image.tmdb.org/t/p/w1280';
const PAGES         = 5;

const XTREAM_HOST = 'http://tv.m3uts.xyz';
const XTREAM_USER = 'm';
const XTREAM_PASS = 'm';
const XTREAM_API  = `${XTREAM_HOST}/player_api.php?username=${XTREAM_USER}&password=${XTREAM_PASS}`;

const GENRE_MAP = {
  28: 'Acción', 12: 'Aventura', 16: 'Animación', 35: 'Comedia',
  80: 'Crimen', 99: 'Documental', 18: 'Drama', 10751: 'Familia',
  14: 'Fantasía', 36: 'Historia', 27: 'Terror', 10402: 'Música',
  9648: 'Misterio', 10749: 'Romance', 878: 'Ciencia Ficción',
  10770: 'Película de TV', 53: 'Thriller', 10752: 'Bélica', 37: 'Western',
};

const EMBED_SOURCES = [
  { name: 'vidsrc',     url: (id) => `https://vidsrc.to/embed/movie/${id}` },
  { name: 'embedsu',    url: (id) => `https://embed.su/embed/movie/${id}` },
  { name: 'multiembed', url: (id) => `https://multiembed.mov/?tmdb_id=${id}&video_type=movie` },
];

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

let xtreamCatalog = null;

async function loadXtreamCatalog() {
  if (xtreamCatalog) return xtreamCatalog;
  console.log('[Xtream] Cargando catálogo VOD...');
  try {
    const { data: cats } = await axios.get(`${XTREAM_API}&action=get_vod_categories`, { timeout: 15000 });
    const catalog = [];
    for (const cat of cats) {
      if (!cat.category_id) continue;
      try {
        const { data: streams } = await axios.get(
          `${XTREAM_API}&action=get_vod_streams&category_id=${cat.category_id}`,
          { timeout: 15000 }
        );
        if (Array.isArray(streams)) {
          streams.forEach(s => {
            if (s.stream_id && s.name) {
              catalog.push({
                stream_id: s.stream_id,
                name:      s.name,
                poster:    s.stream_icon || '',
                backdrop:  s.backdrop || '',
                year:      s.release ? parseInt(s.release) : null,
                category:  cat.category_name || '',
                streamUrl: `${XTREAM_HOST}/movie/${XTREAM_USER}/${XTREAM_PASS}/${s.stream_id}.mp4`,
              });
            }
          });
        }
        await delay(200);
      } catch {}
    }
    const seen = new Set();
    xtreamCatalog = catalog.filter(s => {
      if (seen.has(s.stream_id)) return false;
      seen.add(s.stream_id);
      return true;
    });
    console.log(`[Xtream] ✅ Catálogo: ${xtreamCatalog.length} películas`);
    return xtreamCatalog;
  } catch (err) {
    console.error('[Xtream] Error:', err.message);
    return [];
  }
}

function normalizeName(name) {
  return name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ').trim();
}

function findInXtream(title, year, catalog) {
  const n = normalizeName(title);
  let match = catalog.find(s => normalizeName(s.name) === n);
  if (match) return match;
  if (year) {
    match = catalog.find(s => normalizeName(s.name) === n && s.year === year);
    if (match) return match;
  }
  match = catalog.find(s => {
    const sn = normalizeName(s.name);
    return sn.includes(n) || n.includes(sn);
  });
  return match || null;
}

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
    } catch (e) { console.error('[TMDB] Error página', page, e.message); }
  }
  return movies;
}

async function getImdbId(tmdbId) {
  try {
    const { data } = await axios.get(`${TMDB_BASE}/movie/${tmdbId}/external_ids`, {
      params: { api_key: TMDB_KEY }, timeout: 8000,
    });
    return data.imdb_id || null;
  } catch { return null; }
}

async function testEmbed(url) {
  try {
    const res = await axios.get(url, {
      timeout: 6000, headers: { 'User-Agent': 'Mozilla/5.0' },
      validateStatus: s => s < 500,
    });
    return res.status === 200;
  } catch { return false; }
}

async function resolveEmbedUrl(tmdbId) {
  for (const source of EMBED_SOURCES) {
    const url = source.url(tmdbId);
    if (await testEmbed(url)) {
      console.log(`   [embed] ${source.name} ✅`);
      return { streamUrl: url, embedType: source.name, streamType: 'embed' };
    }
    console.log(`   [embed] ${source.name} ❌`);
    await delay(300);
  }
  return { streamUrl: EMBED_SOURCES[0].url(tmdbId), embedType: EMBED_SOURCES[0].name, streamType: 'embed' };
}

async function runTMDBScraper() {
  console.log('[TMDB] Iniciando scraper (TMDB + Xtream Codes)...\n');
  try {
    const catalog = await loadXtreamCatalog();

    console.log('[TMDB] Cargando populares...');
    const popular = await fetchMovies('/movie/popular', PAGES);
    console.log('[TMDB] Cargando mejor valoradas...');
    const topRated = await fetchMovies('/movie/top_rated', PAGES);
    console.log('[TMDB] Cargando estrenos en español...');
    const discoverES = await fetchMovies('/discover/movie?with_original_language=es&sort_by=popularity.desc', PAGES);

    const allMovies = [...popular, ...topRated, ...discoverES];
    const seen = new Set();
    const unique = allMovies.filter(m => { if (seen.has(m.id)) return false; seen.add(m.id); return true; });

    const currentYear = new Date().getFullYear();
    const filtered = unique
      .filter(m => { const y = m.release_date ? parseInt(m.release_date.substring(0, 4)) : 0; return y >= currentYear - 5; })
      .filter(m => m.vote_average >= 6.5)
      .sort((a, b) => b.vote_average - a.vote_average);

    console.log(`\n[TMDB] Únicas: ${unique.length} | Filtradas: ${filtered.length}\n`);

    let added = 0, updated = 0, skipped = 0, xtreamHits = 0;

    for (const m of filtered) {
      if (!m.title || !m.poster_path) { skipped++; continue; }
      console.log(`[→] ${m.title} (${m.release_date?.substring(0, 4) || '?'})`);

      const imdbId = await getImdbId(m.id);
      if (!imdbId) { console.log(`   [skip] Sin imdbId`); skipped++; await delay(150); continue; }

      const year = m.release_date ? parseInt(m.release_date.substring(0, 4)) : null;
      const xtreamMatch = findInXtream(m.title, year, catalog);

      let streamUrl, embedType, streamType;
      if (xtreamMatch) {
        streamUrl = xtreamMatch.streamUrl;
        embedType = 'xtream';
        streamType = 'mp4';
        xtreamHits++;
        console.log(`   [xtream] ✅ 🇦🇷 ${xtreamMatch.name}`);
      } else {
        console.log(`   [xtream] ❌ usando embed...`);
        const embed = await resolveEmbedUrl(m.id);
        streamUrl = embed.streamUrl; embedType = embed.embedType; streamType = embed.streamType;
      }

      const genres   = (m.genre_ids || []).map(id => GENRE_MAP[id]).filter(Boolean);
      const category = genres[0] || 'Películas';

      const movieData = {
        title: m.title, originalTitle: m.original_title || '',
        synopsis: m.overview || '', description: m.overview || '',
        poster: POSTER_BASE + m.poster_path,
        backdrop: m.backdrop_path ? BACKDROP_BASE + m.backdrop_path : '',
        year, rating: m.vote_average ? parseFloat(m.vote_average.toFixed(1)) : 0,
        genres, genre: category, category,
        language: m.original_language || 'es',
        imdbId, tmdbId: m.id, streamUrl, embedType, streamType,
        status: 'active', isPaid: false, isFeatured: false, sortOrder: 0,
      };

      try {
        const existing = await Movie.findOne({ imdbId });
        if (existing) { await Movie.updateOne({ imdbId }, { $set: movieData }); updated++; console.log(`   [UPD] ${category}`); }
        else { await Movie.create(movieData); added++; console.log(`   [ADD] ${category}`); }
      } catch (err) { console.error(`   [ERR] ${err.message}`); skipped++; }
      await delay(150);
    }

    console.log(`\n[TMDB] ✅  Finalizado`);
    console.log(`   Nuevas      : ${added}`);
    console.log(`   Actualizadas: ${updated}`);
    console.log(`   Saltadas    : ${skipped}`);
    console.log(`   🇦🇷 Xtream   : ${xtreamHits} con audio español`);
  } catch (e) { console.error('[TMDB] Error general:', e.message); }
}

function startCron() {
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  runTMDBScraper();
  setInterval(runTMDBScraper, WEEK);
  console.log('[TMDB] Cron semanal activo ✅');
}

module.exports = runTMDBScraper;
module.exports.startCron = startCron;
