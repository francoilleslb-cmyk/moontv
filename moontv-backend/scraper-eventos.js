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

// Palabras basura que aparecen en los nombres de equipos por error del parser
const GARBAGE_WORDS = [
  /^(PN|LB|HL|UP|FL|BA|GP|ET|DGO)\s+/gi,
  /\s+(PN|LB|HL|UP|FL|BA|GP|ET|DGO)$/gi,
  /Disney\s*\+\s*(?:Premium)?/gi,
  /Star\s*\+/gi,
  /Paramount\s*\+/gi,
  /ESPN\s*\d*/gi,
  /TNT\s*Sports?/gi,
  /TyC\s*Sports?/gi,
  /Fox\s*Sports?\s*\d*/gi,
  /DSports?\s*\d*/gi,
  /Claro\s*Sports?/gi,
  /DeporTV/gi,
  /Formaciones y más datos/gi,
  /Más datos/gi,
  /Finalizado/gi,
  /En vivo/gi,
  /&#x27;/g,
];

function cleanTeamName(name) {
  let clean = name;
  for (const pattern of GARBAGE_WORDS) {
    clean = clean.replace(pattern, ' ');
  }
  // Quitar números sueltos y caracteres raros
  clean = clean.replace(/\b\d+\b/g, ' ');
  clean = clean.replace(/[^a-záéíóúñüA-ZÁÉÍÓÚÑÜ0-9\s\.\-\']/g, ' ');
  clean = clean.replace(/\s+/g, ' ').trim();
  return clean;
}

function parseDateTime(timeStr, dateStr) {
  const months = {
    'enero':0,'febrero':1,'marzo':2,'abril':3,'mayo':4,'junio':5,
    'julio':6,'agosto':7,'septiembre':8,'octubre':9,'noviembre':10,'diciembre':11
  };
  const [hours, minutes] = timeStr.split(':').map(Number);
  const dateParts = dateStr.toLowerCase().match(/(\d+)\s+de\s+(\w+)\s+de\s+(\d+)/);
  if (dateParts) {
    return new Date(parseInt(dateParts[3]), months[dateParts[2]] ?? 0, parseInt(dateParts[1]), hours, minutes, 0);
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
  const text = data.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  const COMPETITIONS = [
    'La Liga','Premier League','Liga Profesional','Champions League',
    'Copa Libertadores','Copa Sudamericana','Liga MX','Serie A',
    'Bundesliga','Ligue 1','Copa del Rey','FA Cup','MLS','Copa Italia',
    'Copa de Portugal','Primera División','NHL','NBA','UFC',
    'Fórmula 1','Fórmula 2','Euroliga','ATP','WTA','Súper Rugby',
    'Liga Nacional','Rugby','Voleibol','Básquet'
  ];

  const timePattern = /\b(\d{1,2}:\d{2})\b/g;
  const compPattern = new RegExp(COMPETITIONS.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');
  const channelPattern = /(ESPN\s*(?:PREMIUM|Premium|\d)?|TNT\s*Sports?|TyC\s*Sports?|Fox\s*Sports?\s*\d?|DSports?\s*\d?|Claro\s*Sports?|DeporTV)/gi;
  const datePattern = /(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s+\d+\s+de\s+\w+\s+de\s+\d{4}/gi;

  // Fecha inicial
  const firstDateMatch = text.match(/Agenda Deportiva del\s+([\w\s]+?\d{4})/i);
  let currentDate = firstDateMatch ? firstDateMatch[1].trim() : '';
  let currentComp = 'Fútbol';
  const eventos = [];

  let m;
  while ((m = timePattern.exec(text)) !== null) {
    const time = m[1];
    const before = text.substring(Math.max(0, m.index - 300), m.index);
    const after = text.substring(m.index + time.length, m.index + time.length + 350);

    // Detectar nueva fecha
    const newDates = [...before.matchAll(datePattern)];
    if (newDates.length > 0) currentDate = newDates[newDates.length - 1][0];

    // Detectar competición
    const compsInBefore = [...before.matchAll(compPattern)];
    if (compsInBefore.length > 0) currentComp = compsInBefore[compsInBefore.length - 1][0];

    // Equipo local — texto limpio antes de la hora
    const beforeClean = before
      .replace(/Formaciones y más datos|Más datos|Finalizado|En vivo|ET/gi, ' ')
      .replace(/\d+\s*[-–]\s*\d+/g, ' ')
      .replace(/\s+/g, ' ').trim();
    const beforeParts = beforeClean.split(/\s{2,}/).filter(p => p.trim().length > 1);
    const rawHome = beforeParts[beforeParts.length - 1] || '';
    const teamHome = cleanTeamName(rawHome);

    // Equipo visitante — texto limpio después de la hora
    const afterClean = after
      .replace(/Formaciones y más datos|Más datos|Finalizado|En vivo|ET/gi, ' ')
      .replace(/\d+\s*[-–]\s*\d+/g, ' ');
    const teamAwayMatch = afterClean.match(/^\s*([\wáéíóúñüÁÉÍÓÚÑÜ\s\.\-\']{3,50}?)(?=\s+(?:Formaciones|Más|ESPN|TNT|TyC|Fox|DSport|Disney|Claro|DGO|Star|Finalizado|En vivo|\d{1,2}:\d{2}))/i);
    const rawAway = teamAwayMatch ? teamAwayMatch[1] : '';
    const teamAway = cleanTeamName(rawAway);

    if (!teamHome || !teamAway) continue;
    if (teamHome.length < 3 || teamAway.length < 3) continue;
    if (teamHome === teamAway) continue;
    if (/^\d+$/.test(teamHome) || /^\d+$/.test(teamAway)) continue;

    // Canales
    const channelZone = after.substring(0, 280);
    const channelMatches = [...channelZone.matchAll(channelPattern)].map(c => c[0].trim());
    const uniqueChannels = [...new Set(channelMatches)];

    // Evitar duplicados
    const key = teamHome + '|' + teamAway + '|' + time;
    if (!eventos.find(e => e.key === key)) {
      eventos.push({ key, competition: currentComp, teamHome, teamAway, time, channelNames: uniqueChannels, dateStr: currentDate });
    }
  }

  return eventos;
}

async function runEventosScraper() {
  console.log('[EventosScraper] Iniciando scraper ole.com.ar...');
  try {
    const eventos = await scrapePage();
    console.log('Eventos encontrados: ' + eventos.length);

    if (eventos.length === 0) { console.log('[EventosScraper] Sin eventos.'); return; }

    // Borrar eventos de hoy y mañana antes de recargar
    const today = new Date(); today.setHours(0,0,0,0);
    const dayAfterTomorrow = new Date(today); dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
    await Event.deleteMany({ datetime: { $gte: today, $lt: dayAfterTomorrow } });

    let eCount = 0;
    for (const ev of eventos) {
      const datetime = parseDateTime(ev.time, ev.dateStr);
      const channels = await getChannelsFromDB(ev.channelNames);
      const title = ev.teamHome + ' vs ' + ev.teamAway;
      try {
        await Event.create({
          title, competition: ev.competition, sport: 'football',
          teamHome: ev.teamHome, teamAway: ev.teamAway,
          datetime, channels, status: 'upcoming', isActive: true
        });
        eCount++;
        console.log('['+eCount+'] '+title+' ('+ev.time+') -> '+(channels.map(c=>c.name).join(', ')||'sin canal'));
      } catch(err) { console.error('Error: '+err.message); }
    }
    console.log('[EventosScraper] Finalizado. '+eCount+' eventos guardados.');
  } catch(e) {
    console.error('Error en scraper de eventos: '+e.message);
  }
}

// Cron: correr una vez al día a las 6am
function startCron() {
  const now = new Date();
  const next6am = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6, 0, 0);
  if (next6am <= now) next6am.setDate(next6am.getDate() + 1);
  const msUntil6am = next6am - now;
  console.log('[EventosScraper] Próxima actualización: ' + next6am.toLocaleString('es-AR'));
  setTimeout(() => {
    runEventosScraper();
    setInterval(runEventosScraper, 24 * 60 * 60 * 1000); // cada 24hs
  }, msUntil6am);
}

module.exports = runEventosScraper;
module.exports.startCron = startCron;
