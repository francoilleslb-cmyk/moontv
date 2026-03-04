const axios = require('axios');
const cheerio = require('cheerio');
const Event = require('./models/Event');
const Channel = require('./models/Channel');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'es-AR,es;q=0.9',
  'Referer': 'https://www.google.com/'
};

// Mapeo de nombres de canales del scraper a nombres en la DB
const CHANNEL_MAP = {
  'ESPN': ['ESPN HD', 'ESPN', 'ESPN 1'],
  'ESPN 2': ['ESPN 2 HD', 'ESPN 2'],
  'ESPN 3': ['ESPN 3 HD'],
  'ESPN 4': ['ESPN 4HD'],
  'ESPN 5': ['ESPN 5HD'],
  'ESPN 6': ['ESPN 6HD'],
  'ESPN 7': ['ESPN 7HD'],
  'ESPN Premium': ['ESPN Premium HD', 'FOX SPORT PREMIUM'],
  'TNT Sports': ['TNT Sports'],
  'TNT': ['TNT Sports'],
  'TyC Sports': ['TyC Sport'],
  'TyC': ['TyC Sport'],
  'Fox Sports': ['FOX Sports', 'FOX Sports HD'],
  'Fox Sports 2': ['FOX Sports 2'],
  'Fox Sports 3': ['FOX Sports 3'],
  'DSports': ['DSports', 'DSports 2'],
  'Claro Sports': ['Claro Sports'],
  'DeporTV': ['DeporTV'],
  'Disney +': [],   // streaming, no canal de cable
  'Disney + Premium': [],
  'DGO': [],
  'Star+': [],
  'Paramount+': [],
};

function parseDateTime(timeStr, dateStr) {
  try {
    // dateStr ejemplo: "miércoles 4 de marzo de 2026"
    const months = {
      'enero': 0, 'febrero': 1, 'marzo': 2, 'abril': 3, 'mayo': 4, 'junio': 5,
      'julio': 6, 'agosto': 7, 'septiembre': 8, 'octubre': 9, 'noviembre': 10, 'diciembre': 11
    };
    const dateParts = dateStr.toLowerCase().match(/(\d+)\s+de\s+(\w+)\s+de\s+(\d+)/);
    const [hours, minutes] = timeStr.split(':').map(Number);

    if (dateParts) {
      const day = parseInt(dateParts[1]);
      const month = months[dateParts[2]] ?? new Date().getMonth();
      const year = parseInt(dateParts[3]);
      return new Date(year, month, day, hours, minutes, 0);
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);
  } catch (e) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  }
}

async function getChannelsFromDB(channelNames) {
  const results = [];
  for (const name of channelNames) {
    const aliases = CHANNEL_MAP[name];
    if (!aliases) continue;
    if (aliases.length === 0) continue; // streaming, ignorar

    for (const alias of aliases) {
      const ch = await Channel.findOne({
        name: { $regex: alias, $options: 'i' },
        status: 'active'
      });
      if (ch) {
        const url = ch.streamUrl || (ch.servers && ch.servers[0] && ch.servers[0].url) || '';
        if (url && !results.find(r => r.name === ch.name)) {
          results.push({ name: ch.name, streamUrl: url, logo: ch.logo || '' });
        }
        break;
      }
    }
  }
  return results;
}

async function runEventosScraper() {
  console.log('[EventosScraper] Iniciando scraper ole.com.ar...');

  try {
    const { data } = await axios.get('https://www.ole.com.ar/agenda-deportiva', {
      headers: HEADERS,
      timeout: 15000
    });

    const $ = cheerio.load(data);

    // Extraer texto limpio de la agenda
    const text = $.text().replace(/\s+/g, ' ').trim();

    // Encontrar la fecha actual
    const dateMatch = text.match(/Agenda Deportiva del\s+([^]+?)\s+(?:La Liga|Premier|Copa|Liga|MLB|NFL|NBA|UFC)/i);
    const dateStr = dateMatch ? dateMatch[1].trim() : '';
    console.log('Fecha agenda: ' + dateStr);

    // Parsear eventos desde los elementos del DOM
    const eventos = [];

    // Ole usa una estructura de cards - buscar por selectores comunes
    const eventSelectors = [
      '.event-card', '.agenda-event', '.match-card', 
      '[class*="event"]', '[class*="match"]', '[class*="partido"]'
    ];

    let found = false;
    for (const sel of eventSelectors) {
      const els = $(sel);
      if (els.length > 3) {
        console.log('Selector encontrado: ' + sel + ' (' + els.length + ' elementos)');
        found = true;

        els.each((i, el) => {
          const elText = $(el).text().replace(/\s+/g, ' ').trim();

          // Buscar hora
          const timeMatch = elText.match(/\b(\d{1,2}:\d{2})\b/);
          if (!timeMatch) return;
          const time = timeMatch[1];

          // Buscar canales conocidos
          const channelNames = [];
          const channelPattern = /ESPN\s*\d*\s*(?:Premium)?|TNT\s*Sports?|TyC\s*Sports?|Fox\s*Sports?\s*\d*|DSports?\s*\d*|Claro\s*Sports?|DeporTV/gi;
          const channelMatches = elText.match(channelPattern) || [];
          channelMatches.forEach(c => channelNames.push(c.trim()));

          // Extraer equipos - buscar patrón "Equipo1 HORA Equipo2"
          const beforeTime = elText.substring(0, elText.indexOf(time)).trim();
          const afterTime = elText.substring(elText.indexOf(time) + time.length).trim();

          // Competición suele estar antes del primer equipo
          const lines = beforeTime.split(/\s{2,}/).filter(l => l.trim().length > 0);
          const competition = lines[0] || '';
          const teamHome = lines[lines.length - 1] || '';
          const teamAway = afterTime.split(/\s{2,}/)[0] || '';

          if (teamHome && teamAway && teamHome !== teamAway) {
            eventos.push({ competition, teamHome, teamAway, time, channelNames, dateStr });
          }
        });
        break;
      }
    }

    // Fallback: parsear el texto plano si no encontró selectores
    if (!found || eventos.length === 0) {
      console.log('Usando parser de texto plano...');

      // Buscar competiciones conocidas y sus partidos
      const competitionPattern = /(?:La Liga|Premier League|Liga Profesional|Champions League|Copa Libertadores|Copa Sudamericana|Liga MX|Serie A|Bundesliga|Ligue 1|Copa del Rey|FA Cup|MLB|NBA|NFL|UFC|MLS|Eredivisie|Liga BetPlay|Primera División)/gi;
      const competitionMatches = [...text.matchAll(competitionPattern)];

      for (let i = 0; i < competitionMatches.length; i++) {
        const compStart = competitionMatches[i].index;
        const compEnd = competitionMatches[i + 1] ? competitionMatches[i + 1].index : compStart + 500;
        const block = text.substring(compStart, compEnd);
        const competition = competitionMatches[i][0];

        // Buscar partidos en el bloque: "Equipo1 HH:MM Equipo2"
        const matchPattern = /([A-ZÁÉÍÓÚÑa-záéíóúñ\s\.]+?)\s+(\d{1,2}:\d{2})\s+([A-ZÁÉÍÓÚÑa-záéíóúñ\s\.]+?)(?=\s+(?:Formaciones|Más datos|ESPN|TNT|TyC|Fox|DSport|Disney|$))/g;
        let matchResult;

        while ((matchResult = matchPattern.exec(block)) !== null) {
          const teamHome = matchResult[1].trim();
          const time = matchResult[2];
          const teamAway = matchResult[3].trim();

          if (teamHome.length < 2 || teamAway.length < 2) continue;
          if (teamHome === teamAway) continue;

          // Buscar canales después del partido
          const afterMatch = block.substring(matchResult.index + matchResult[0].length);
          const channelNames = [];
          const channelPattern = /ESPN\s*\d*\s*(?:Premium)?|TNT\s*Sports?|TyC\s*Sports?|Fox\s*Sports?\s*\d*|DSports?\s*\d*|Claro\s*Sports?|DeporTV/gi;
          const channelMatches = afterMatch.substring(0, 200).match(channelPattern) || [];
          channelMatches.forEach(c => channelNames.push(c.trim()));

          eventos.push({ competition, teamHome, teamAway, time, channelNames, dateStr });
        }
      }
    }

    console.log('Eventos parseados: ' + eventos.length);

    if (eventos.length === 0) {
      console.log('[EventosScraper] No se encontraron eventos.');
      return;
    }

    // Limpiar eventos del día
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    await Event.deleteMany({ datetime: { $gte: today, $lt: tomorrow } });

    let eCount = 0;
    for (const ev of eventos) {
      const datetime = parseDateTime(ev.time, ev.dateStr);
      const channels = await getChannelsFromDB(ev.channelNames);

      const title = ev.teamHome + ' vs ' + ev.teamAway;

      try {
        await Event.create({
          title,
          competition: ev.competition || 'Fútbol',
          sport: 'football',
          teamHome: ev.teamHome,
          teamAway: ev.teamAway,
          datetime,
          channels,
          status: 'upcoming',
          isActive: true
        });
        eCount++;
        console.log('[' + eCount + '] ' + title + ' (' + ev.time + ') - ' + channels.length + ' canales: ' + ev.channelNames.join(', '));
      } catch (err) {
        console.error('Error guardando "' + title + '": ' + err.message);
      }
    }

    console.log('[EventosScraper] Finalizado. ' + eCount + ' eventos guardados.');

  } catch (e) {
    console.error('Error en scraper de eventos: ' + e.message);
  }
}

module.exports = runEventosScraper;
