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

// Solo fútbol — ordenadas de mayor a menor longitud
const FOOTBALL_COMPETITIONS = [
  'La Liga Hypermotion', 'Champions League', 'Copa Libertadores', 'Copa Sudamericana',
  'Liga Profesional', 'Premier League', 'Coupe de France', 'Copa del Rey',
  'Supercopa de Italia', 'Supercopa de Espana', 'Nations League', 'Copa Italia',
  'Copa de Portugal', 'La Liga', 'Liga MX', 'Serie A', 'Bundesliga',
  'Ligue 1', 'FA CUP', 'FA Cup', 'Eredivisie', 'Eurocopa',
  'Eliminatorias', 'Mundial',
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

  // Detectar fechas con sus posiciones en el texto original
  const datePattern = /(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s+(\d+)\s+de\s+(\w+)\s+de\s+(\d{4})/gi;
  const datePositions = [];
  let dm;
  while ((dm = datePattern.exec(text)) !== null) {
    datePositions.push({ index: dm.index, dateStr: dm[0] });
  }

  const channelPattern = /(ESPN\s*(?:PREMIUM|Premium|\d)?|TNT\s*Sports?|TyC\s*Sports?|Fox\s*Sports?\s*\d?|DSports?\s*\d?|Claro\s*Sports?|DeporTV)/gi;

  // ENFOQUE: dividir texto en bloques por "Formaciones y más datos" / "Más datos"
  // Cada bloque termina justo antes del separador y contiene exactamente 1 partido
  const SEP_RE = /Formaciones y más datos|Más datos/g;
  const sepPositions = [];
  let sp;
  while ((sp = SEP_RE.exec(text)) !== null) {
    sepPositions.push({ start: sp.index, end: sp.index + sp[0].length });
  }

  const eventos = [];
  const seen = new Set();

  for (let i = 0; i < sepPositions.length; i++) {
    const sep = sepPositions[i];

    // El bloque de este partido va desde el separador anterior (o inicio) hasta este
    const blockStart = i > 0 ? sepPositions[i-1].end : 0;
    const blockEnd = sep.start;
    const block = text.substring(blockStart, blockEnd).trim();

    // Los canales están entre este separador y el siguiente
    const channelStart = sep.end;
    const channelEnd = i + 1 < sepPositions.length ? sepPositions[i+1].start : Math.min(sep.end + 300, text.length);
    const channelZone = text.substring(channelStart, channelEnd);

    // Buscar el tiempo (HH:MM) en el bloque
    const timeMatch = block.match(/\b(\d{1,2}:\d{2})\b/);
    if (!timeMatch) continue;
    const time = timeMatch[1];
    const timeIdx = block.indexOf(timeMatch[0]);

    // Texto antes y después del tiempo
    const beforeTime = block.substring(0, timeIdx).trim();
    const afterTime = block.substring(timeIdx + time.length).trim();

    if (!beforeTime || !afterTime) continue;

    // Equipo local = últimas palabras antes del tiempo (después de cualquier competición)
    // Equipo visitante = primeras palabras después del tiempo
    const beforeWords = beforeTime.split(/\s+/);
    const afterWords = afterTime.split(/\s+/).filter(w => w.length > 0);

    // Buscar competición en beforeWords — la competición precede al equipo
    let competition = '';
    let compEndIdx = -1;
    const normBefore = normalize(beforeTime);
    for (const comp of FOOTBALL_COMPETITIONS) {
      const nc = normalize(comp);
      const idx = normBefore.lastIndexOf(nc);
      if (idx !== -1) {
        competition = comp;
        compEndIdx = idx + comp.length;
        break;
      }
    }

    // Si no hay competición de fútbol, saltar
    if (!competition) continue;

    // Equipo local = palabras después de la competición
    const afterComp = beforeTime.substring(compEndIdx).trim();
    const homeWords = afterComp.split(/\s+/).filter(w => w.length > 0).slice(0, 5);
    const teamHome = homeWords.join(' ');

    // Equipo visitante = primeras palabras después del tiempo (máx 5)
    const teamAway = afterWords.slice(0, 5).join(' ');

    if (!teamHome || !teamAway || teamHome.length < 2 || teamAway.length < 2) continue;
    if (teamHome === teamAway) continue;

    // Fecha más cercana antes de este bloque
    const absPos = blockStart;
    let currentDate = '';
    for (const dp of datePositions) {
      if (dp.index <= absPos + blockEnd) currentDate = dp.dateStr;
    }

    // Filtrar solo hoy y mañana
    const eventDate = parseDateTime(time, currentDate);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayAfterTomorrow = new Date(todayStart);
    dayAfterTomorrow.setDate(todayStart.getDate() + 2);
    if (eventDate < todayStart || eventDate >= dayAfterTomorrow) continue;

    // Canales
    const channelMatches = [...channelZone.matchAll(channelPattern)].map(c => c[0].trim());
    const uniqueChannels = [...new Set(channelMatches)];

    const key = normalize(teamHome) + '|' + normalize(teamAway) + '|' + time;
    if (!seen.has(key)) {
      seen.add(key);
      eventos.push({ competition, teamHome, teamAway, time, channelNames: uniqueChannels, dateStr: currentDate });
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
'+err.message); }
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
