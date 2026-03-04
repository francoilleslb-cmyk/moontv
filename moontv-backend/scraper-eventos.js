const axios = require('axios');
const Event = require('./models/Event');
const Channel = require('./models/Channel');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept-Language': 'es-AR,es;q=0.9',
};

const CHANNEL_MAP = {
  'ESPN PREMIUM': ['ESPN Premium HD'],
  'ESPN 2': ['ESPN 2 HD', 'ESPN 2'],
  'ESPN 3': ['ESPN 3 HD'],
  'ESPN 4': ['ESPN 4HD'],
  'ESPN 5': ['ESPN 5HD'],
  'ESPN 6': ['ESPN 6HD'],
  'ESPN 7': ['ESPN 7HD'],
  'ESPN': ['ESPN HD', 'ESPN'],
  'TNT SPORTS': ['TNT Sports'],
  'TNT': ['TNT Sports'],
  'TYC SPORTS': ['TyC Sport'],
  'TYC': ['TyC Sport'],
  'FOX SPORTS 3': ['FOX Sports 3'],
  'FOX SPORTS 2': ['FOX Sports 2'],
  'FOX SPORTS': ['FOX Sports'],
  'DSPORTS 2': ['DSports 2'],
  'DSPORTS': ['DSports'],
  'CLARO SPORTS': ['Claro Sports'],
  'DEPORTV': ['DeporTV'],
};

// Ordenadas de más larga a más corta para evitar matches parciales
const FOOTBALL_COMPETITIONS = [
  'La Liga Hypermotion', 'Champions League', 'Copa Libertadores', 'Copa Sudamericana',
  'Liga Profesional', 'Premier League', 'Copa del Rey', 'Copa Italia', 'Copa de Portugal',
  'Coupe de France', 'Supercopa de Italia', 'Supercopa de España', 'Nations League',
  'La Liga', 'Liga MX', 'Serie A', 'Bundesliga', 'Ligue 1', 'FA Cup', 'FA CUP', 'MLS',
  'Primera Division', 'Eredivisie', 'Eurocopa', 'Eliminatorias', 'Mundial',
  'Liga BetPlay', 'Torneo Apertura', 'Torneo Clausura',
].sort((a, b) => b.length - a.length);

const MONTHS = {
  'enero':0,'febrero':1,'marzo':2,'abril':3,'mayo':4,'junio':5,
  'julio':6,'agosto':7,'septiembre':8,'octubre':9,'noviembre':10,'diciembre':11
};

function normalize(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function parseDateTime(timeStr, dateStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const dateParts = (dateStr || '').toLowerCase().match(/(\d+)\s+de\s+(\w+)\s+de\s+(\d+)/);
  if (dateParts) {
    return new Date(parseInt(dateParts[3]), MONTHS[dateParts[2]] ?? 0, parseInt(dateParts[1]), hours, minutes, 0);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);
}

async function getChannelsFromDB(channelNames) {
  const results = [];
  for (const name of channelNames) {
    const key = Object.keys(CHANNEL_MAP).find(k => name.toUpperCase().includes(k));
    if (!key) continue;
    for (const alias of CHANNEL_MAP[key]) {
      try {
        const ch = await Channel.findOne({ name: { $regex: alias, $options: 'i' }, status: 'active' });
        if (ch) {
          const url = ch.streamUrl || (ch.servers && ch.servers[0] && ch.servers[0].url) || '';
          if (url && !results.find(r => r.name === ch.name)) {
            results.push({ name: ch.name, streamUrl: url, logo: ch.logo || '' });
          }
          break;
        }
      } catch(e) {}
    }
  }
  return results;
}

async function scrapePage() {
  const { data } = await axios.get('https://www.ole.com.ar/agenda-deportiva', { headers: HEADERS, timeout: 15000 });

  const text = data
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Detectar fechas
  const datePattern = /(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s+(\d+)\s+de\s+(\w+)\s+de\s+(\d{4})/gi;
  const datePositions = [];
  let dm;
  while ((dm = datePattern.exec(text)) !== null) {
    datePositions.push({ index: dm.index, dateStr: dm[0] });
  }

  const channelPattern = /(ESPN\s*(?:PREMIUM|Premium|\d)?|TNT\s*Sports?|TyC\s*Sports?|Fox\s*Sports?\s*\d?|DSports?\s*\d?|Claro\s*Sports?|DeporTV)/gi;

  // Regex principal — captura RAWTEAM1 TIME RAWTEAM2 antes del separador
  const matchRe = /([\wáéíóúñüÁÉÍÓÚÑÜ][\wáéíóúñüÁÉÍÓÚÑÜ \.\-]{0,60}?)\s+(\d{1,2}:\d{2})\s+([\wáéíóúñüÁÉÍÓÚÑÜ][\wáéíóúñüÁÉÍÓÚÑÜ \.\-]{0,60}?)\s+(?:Formaciones y más datos|Más datos)/g;

  const eventos = [];
  const seen = new Set();
  let m;

  while ((m = matchRe.exec(text)) !== null) {
    const rawHome = m[1].trim();
    const time = m[2];
    const rawAway = m[3].trim();
    const pos = m.index;

    // Buscar competición dentro del rawHome (viene incluida)
    let competition = '';
    let teamHome = rawHome;

    const normHome = normalize(rawHome);
    for (const comp of FOOTBALL_COMPETITIONS) {
      const normComp = normalize(comp);
      const idx = normHome.lastIndexOf(normComp);
      if (idx !== -1) {
        competition = comp;
        // El equipo es lo que viene DESPUÉS de la competición
        teamHome = rawHome.substring(idx + comp.length).trim();
        break;
      }
    }

    // Si no encontró competición en rawHome, buscar en los 150 chars antes en el texto
    if (!competition) {
      const beforeText = text.substring(Math.max(0, pos - 150), pos);
      const normBefore = normalize(beforeText);
      for (const comp of FOOTBALL_COMPETITIONS) {
        if (normBefore.includes(normalize(comp))) {
          competition = comp;
          break;
        }
      }
    }

    // Solo fútbol — si no hay competición conocida, saltar
    if (!competition) continue;

    // Limpiar teamHome de prefijos de canales/streaming
    const cleanPrefixes = (s) => {
      let r = s.trim();
      let prev = '';
      while (prev !== r) {
        prev = r;
        r = r.replace(/^(?:Premium|Disney[^a-z]*|Star[^a-z]*|DGO|datos|ESPN\s*\d?|DSports?\s*\d?|TNT[^a-z]*|TyC[^a-z]*|Fox[^a-z]*)\s+/gi, '').trim();
      }
      return r;
    };

    const finalHome = cleanPrefixes(teamHome);
    const finalAway = cleanPrefixes(rawAway.split(/\s+/).slice(0, 5).join(' '));

    if (!finalHome || !finalAway || finalHome.length < 2 || finalAway.length < 2) continue;
    if (finalHome === finalAway) continue;

    // Fecha más cercana
    let currentDate = '';
    for (const dp of datePositions) {
      if (dp.index <= pos) currentDate = dp.dateStr;
    }

    // Solo hoy y mañana
    const eventDate = parseDateTime(time, currentDate);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayAfterTomorrow = new Date(todayStart);
    dayAfterTomorrow.setDate(todayStart.getDate() + 2);
    if (eventDate < todayStart || eventDate >= dayAfterTomorrow) continue;

    // Canales después del separador
    const afterPos = pos + m[0].length;
    const afterText = text.substring(afterPos, afterPos + 200);
    const channelMatches = [...afterText.matchAll(channelPattern)].map(c => c[0].trim());
    const uniqueChannels = [...new Set(channelMatches)];

    const key = normalize(finalHome) + '|' + normalize(finalAway) + '|' + time;
    if (!seen.has(key)) {
      seen.add(key);
      eventos.push({ competition, teamHome: finalHome, teamAway: finalAway, time, channelNames: uniqueChannels, dateStr: currentDate });
    }
  }

  return eventos;
}

async function updateLiveStatus() {
  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() - 120 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 5 * 60 * 1000);
    await Event.updateMany(
      { datetime: { $gte: windowStart, $lte: windowEnd }, status: { $ne: 'finished' } },
      { status: 'live' }
    );
    await Event.updateMany(
      { datetime: { $lt: windowStart }, status: 'live' },
      { status: 'finished' }
    );
    await Event.updateMany(
      { datetime: { $gt: windowEnd }, status: 'live' },
      { status: 'upcoming' }
    );
  } catch(e) {
    console.error('[LiveStatus] Error:', e.message);
  }
}

async function runEventosScraper() {
  console.log('[EventosScraper] Iniciando scraper ole.com.ar...');
  try {
    const eventos = await scrapePage();
    console.log('Eventos de futbol encontrados: ' + eventos.length);
    if (eventos.length === 0) { console.log('[EventosScraper] Sin eventos.'); return; }

    const today = new Date(); today.setHours(0,0,0,0);
    const dayAfterTomorrow = new Date(today); dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
    await Event.deleteMany({ datetime: { $gte: today, $lt: dayAfterTomorrow } });

    let eCount = 0;
    for (const ev of eventos) {
      const datetime = parseDateTime(ev.time, ev.dateStr);
      const channels = await getChannelsFromDB(ev.channelNames);
      const title = ev.teamHome + ' vs ' + ev.teamAway;
      const now = new Date();
      const diffMin = (datetime - now) / 60000;
      let status = 'upcoming';
      if (diffMin < 0 && diffMin > -120) status = 'live';
      else if (diffMin <= -120) status = 'finished';

      try {
        await Event.create({
          title, competition: ev.competition, sport: 'football',
          teamHome: ev.teamHome, teamAway: ev.teamAway,
          datetime, channels, status, isActive: true
        });
        eCount++;
        console.log('['+eCount+'] '+title+' ('+ev.time+') ['+status+'] -> '+(channels.map(c=>c.name).join(', ')||'sin canal'));
      } catch(err) { console.error('Error: '+err.message); }
    }
    console.log('[EventosScraper] Finalizado. '+eCount+' eventos guardados.');
  } catch(e) {
    console.error('Error en scraper: '+e.message);
  }
}

function startCron() {
  const now = new Date();
  const next6am = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6, 0, 0);
  if (next6am <= now) next6am.setDate(next6am.getDate() + 1);
  console.log('[EventosScraper] Proxima actualizacion: ' + next6am.toLocaleString());
  setTimeout(() => {
    runEventosScraper();
    setInterval(runEventosScraper, 24 * 60 * 60 * 1000);
  }, next6am - now);
  setInterval(updateLiveStatus, 5 * 60 * 1000);
  console.log('[EventosScraper] Monitor en vivo activo (cada 5 min)');
}

module.exports = runEventosScraper;
module.exports.startCron = startCron;
        
