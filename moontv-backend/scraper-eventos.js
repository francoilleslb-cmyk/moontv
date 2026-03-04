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

const MONTHS = {
  'enero':0,'febrero':1,'marzo':2,'abril':3,'mayo':4,'junio':5,
  'julio':6,'agosto':7,'septiembre':8,'octubre':9,'noviembre':10,'diciembre':11
};

const DAYS_ES = ['lunes','martes','miércoles','miercoles','jueves','viernes','sábado','sabado','domingo'];

const NOISE_WORDS = [
  'Formaciones y más datos','Más datos','Finalizado','En vivo',
  'Disney + Premium','Disney +','Star +','Star+','DGO','Paramount+',
  'position','name','Agenda Deportiva','item','context','schema.org',
  'type','Website','url','www.ole.com.ar','agenda-deportiva',
  'horario','deporte','competición','día'
];

function parseDateTime(timeStr, dateStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const dateParts = dateStr.toLowerCase().match(/(\d+)\s+de\s+(\w+)\s+de\s+(\d+)/);
  if (dateParts) {
    return new Date(parseInt(dateParts[3]), MONTHS[dateParts[2]] ?? 0, parseInt(dateParts[1]), hours, minutes, 0);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);
}

function cleanName(raw) {
  if (!raw) return '';
  let s = raw;
  // Quitar palabras ruido
  for (const w of NOISE_WORDS) {
    s = s.replace(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ');
  }
  // Quitar siglas de 2-3 letras mayúsculas solas (PN, LB, HL, etc)
  s = s.replace(/\b[A-Z]{1,3}\b/g, ' ');
  // Quitar URLs y símbolos
  s = s.replace(/https?:\/\/\S+/g, ' ');
  s = s.replace(/[^a-záéíóúñüA-ZÁÉÍÓÚÑÜ0-9\s\.\-\']/g, ' ');
  // Quitar números sueltos
  s = s.replace(/\b\d+\b/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
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

  // Limpiar scripts, styles y tags HTML
  const text = data
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

  const COMPETITIONS = [
    'La Liga','Premier League','Liga Profesional','Champions League',
    'Copa Libertadores','Copa Sudamericana','Liga MX','Serie A',
    'Bundesliga','Ligue 1','Copa del Rey','FA Cup','MLS','Copa Italia',
    'Copa de Portugal','Primera División','NHL','NBA','UFC',
    'Fórmula 1','Fórmula 2','Euroliga','ATP','WTA','Súper Rugby',
    'Liga Nacional','Básquet','Volleyball','Voleibol','Rugby',
    'Liga Italiana','Supercopa','Copa América','Six Nations','6 Naciones'
  ];

  const channelPattern = /(ESPN\s*(?:PREMIUM|Premium|\d)?|TNT\s*Sports?|TyC\s*Sports?|Fox\s*Sports?\s*\d?|DSports?\s*\d?|Claro\s*Sports?|DeporTV)/gi;
  const dayPattern = new RegExp('(' + DAYS_ES.join('|') + ')\\s+(\\d+)\\s+de\\s+(\\w+)\\s+de\\s+(\\d{4})', 'gi');
  const compPattern = new RegExp(COMPETITIONS.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');

  // Encontrar todas las fechas en el texto con sus posiciones
  const datePositions = [];
  let dm;
  while ((dm = dayPattern.exec(text)) !== null) {
    datePositions.push({ index: dm.index, dateStr: dm[0] });
  }

  // Encontrar todas las competiciones con sus posiciones
  const compPositions = [];
  while ((dm = compPattern.exec(text)) !== null) {
    compPositions.push({ index: dm.index, comp: dm[0] });
  }

  // Encontrar todos los horarios
  const timePattern = /\b(\d{1,2}:\d{2})\b/g;
  const eventos = [];
  const seen = new Set();

  while ((dm = timePattern.exec(text)) !== null) {
    const time = dm[1];
    const pos = dm.index;

    // Fecha más cercana antes de esta posición
    let currentDate = '';
    for (const dp of datePositions) {
      if (dp.index <= pos) currentDate = dp.dateStr;
    }

    // Solo procesar hoy y mañana
    if (currentDate) {
      const eventDate = parseDateTime(time, currentDate);
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dayAfterTomorrow = new Date(todayStart); dayAfterTomorrow.setDate(todayStart.getDate() + 2);
      if (eventDate < todayStart || eventDate >= dayAfterTomorrow) continue;
    }

    // Competición más cercana antes de esta posición
    let currentComp = 'Fútbol';
    for (const cp of compPositions) {
      if (cp.index <= pos) currentComp = cp.comp;
    }

    // Ventana de texto: 150 chars antes y 300 después
    const before = text.substring(Math.max(0, pos - 150), pos);
    const after = text.substring(pos + time.length, pos + time.length + 300);

    // Equipo local: última "palabra de nombre" antes de la hora
    // Buscamos el último segmento limpio antes del horario
    const beforeClean = before
      .replace(new RegExp(NOISE_WORDS.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi'), ' ')
      .replace(channelPattern, ' ')
      .replace(/\b[A-Z]{1,3}\b/g, ' ')
      .replace(/\d+\s*[-–]\s*\d+/g, ' ')
      .replace(/\s+/g, ' ').trim();

    // El equipo local es el último token significativo
    const beforeTokens = beforeClean.split(/\s{2,}|(?<=\w)\s+(?=[A-ZÁÉÍÓÚÑ])/).filter(t => t.trim().length > 2);
    const rawHome = beforeTokens[beforeTokens.length - 1] || '';
    const teamHome = cleanName(rawHome);

    // Equipo visitante: primer segmento limpio después de la hora
    const afterClean = after
      .replace(new RegExp(NOISE_WORDS.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi'), ' ')
      .replace(channelPattern, ' ')
      .replace(/\b[A-Z]{1,3}\b/g, ' ')
      .replace(/\d+\s*[-–]\s*\d+/g, ' ')
      .replace(/\s+/g, ' ').trim();

    const awayMatch = afterClean.match(/^([\wáéíóúñüÁÉÍÓÚÑÜ\s\.\-\']{3,45})(?=\s+(?:\d{1,2}:\d{2}|$))/);
    const teamAway = awayMatch ? cleanName(awayMatch[1]) : '';

    if (!teamHome || !teamAway) continue;
    if (teamHome.length < 3 || teamAway.length < 3) continue;
    if (teamHome === teamAway) continue;

    // Canales en los 280 chars después del equipo visitante
    const channelZone = after.substring(0, 280);
    const channelMatches = [...channelZone.matchAll(channelPattern)].map(c => c[0].trim());
    const uniqueChannels = [...new Set(channelMatches)];

    const key = teamHome.toLowerCase() + '|' + teamAway.toLowerCase() + '|' + time;
    if (!seen.has(key)) {
      seen.add(key);
      eventos.push({ competition: currentComp, teamHome, teamAway, time, channelNames: uniqueChannels, dateStr: currentDate });
    }
  }

  return eventos;
}

async function updateLiveStatus() {
  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() - 120 * 60 * 1000); // 2hs atrás
    const windowEnd = new Date(now.getTime() + 5 * 60 * 1000);     // 5 min adelante

    // Marcar como live los que están en ventana
    await Event.updateMany(
      { datetime: { $gte: windowStart, $lte: windowEnd }, status: { $ne: 'finished' } },
      { status: 'live' }
    );

    // Marcar como finished los que pasaron hace más de 2hs
    await Event.updateMany(
      { datetime: { $lt: windowStart }, status: 'live' },
      { status: 'finished' }
    );

    // Restablecer upcoming los futuros que estaban mal
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
    console.log('Eventos encontrados: ' + eventos.length);
    if (eventos.length === 0) { console.log('[EventosScraper] Sin eventos.'); return; }

    // Borrar solo hoy y mañana
    const today = new Date(); today.setHours(0,0,0,0);
    const dayAfterTomorrow = new Date(today); dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
    await Event.deleteMany({ datetime: { $gte: today, $lt: dayAfterTomorrow } });

    let eCount = 0;
    for (const ev of eventos) {
      const datetime = parseDateTime(ev.time, ev.dateStr);
      const channels = await getChannelsFromDB(ev.channelNames);
      const title = ev.teamHome + ' vs ' + ev.teamAway;

      // Determinar status inicial
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
    console.error('Error en scraper de eventos: '+e.message);
  }
}

function startCron() {
  // Scraper completo a las 6am
  const now = new Date();
  const next6am = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6, 0, 0);
  if (next6am <= now) next6am.setDate(next6am.getDate() + 1);
  const msUntil6am = next6am - now;
  console.log('[EventosScraper] Próxima actualización completa: ' + next6am.toLocaleString('es-AR'));
  setTimeout(() => {
    runEventosScraper();
    setInterval(runEventosScraper, 24 * 60 * 60 * 1000);
  }, msUntil6am);

  // Estado en vivo cada 5 minutos
  setInterval(updateLiveStatus, 5 * 60 * 1000);
  console.log('[EventosScraper] Monitor en vivo activo (cada 5 min)');
}

module.exports = runEventosScraper;
module.exports.startCron = startCron;
  
