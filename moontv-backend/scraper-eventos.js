// scraper-eventos.js — ESPN API oficial
// Reemplaza el scraper de ole.com.ar por la API pública de ESPN
const axios = require('axios');
const Event   = require('./models/Event');
const Channel = require('./models/Channel');

// ─── LIGAS A CONSULTAR ────────────────────────────────────────────────────────
const LEAGUES = [
  { slug: 'arg.1',                   name: 'Liga Profesional Argentina' },
  { slug: 'conmebol.libertadores',   name: 'Copa Libertadores'          },
  { slug: 'conmebol.sudamericana',   name: 'Copa Sudamericana'          },
  { slug: 'uefa.champions',          name: 'Champions League'           },
  { slug: 'uefa.europa',             name: 'Europa League'              },
  { slug: 'esp.1',                   name: 'La Liga'                    },
  { slug: 'eng.1',                   name: 'Premier League'             },
  { slug: 'ita.1',                   name: 'Serie A'                    },
  { slug: 'ger.1',                   name: 'Bundesliga'                 },
  { slug: 'fra.1',                   name: 'Ligue 1'                    },
  { slug: 'mex.1',                   name: 'Liga MX'                    },
  { slug: 'esp.copa_del_rey',        name: 'Copa del Rey'               },
  { slug: 'eng.fa',                  name: 'FA Cup'                     },
  { slug: 'fifa.worldq.conmebol',    name: 'Eliminatorias'              },
  { slug: 'arg.copa',                name: 'Copa Argentina'             },
];

// ─── MAPEO CANAL ESPN → CANAL EN MONGODB ─────────────────────────────────────
// Clave: lo que devuelve ESPN en broadcasts[].names[]
// Valor: array de nombres a buscar en tu DB (en orden de preferencia)
const CHANNEL_MAP = {
  'ESPN':           ['ESPN', 'ESPN HD'],
  'ESPN2':          ['ESPN 2', 'ESPN 2 HD'],
  'ESPN3':          ['ESPN 3', 'ESPN 3 HD'],
  'ESPN Deportes':  ['ESPN', 'ESPN HD'],
  'Fox Sports':     ['FOX Sports', 'Fox Sports'],
  'Fox Sports 2':   ['FOX Sports 2', 'Fox Sports 2'],
  'Fox Sports 3':   ['FOX Sports 3', 'Fox Sports 3'],
  'TNT Sports':     ['TNT Sports', 'TNT'],
  'TyC Sports':     ['TyC Sports', 'TyC Sport'],
  'DSports':        ['DSports', 'DSPORTS'],
  'DSports 2':      ['DSports 2', 'DSPORTS 2'],
  'Claro Sports':   ['Claro Sports'],
  'DeporTV':        ['DeporTV', 'DEPORTV'],
  'Star+':          ['Star+', 'Star Plus'],
  'Disney+':        ['Disney+'],
};

// ─── BUSCAR CANAL EN MONGODB ──────────────────────────────────────────────────
async function getChannelsFromDB(broadcastNames) {
  const results = [];
  const seen    = new Set();

  for (const bName of broadcastNames) {
    // Buscar key exacta primero, luego parcial
    const key = Object.keys(CHANNEL_MAP).find(k =>
      bName.toLowerCase().includes(k.toLowerCase()) ||
      k.toLowerCase().includes(bName.toLowerCase())
    );
    if (!key) continue;

    for (const alias of CHANNEL_MAP[key]) {
      try {
        const ch = await Channel.findOne({
          name:   { $regex: alias, $options: 'i' },
          status: 'active',
        });
        if (ch && !seen.has(ch.name)) {
          seen.add(ch.name);
          results.push({
            name:      ch.name,
            streamUrl: ch.streamUrl || ch.servers?.[0]?.url || '',
            logo:      ch.logo || '',
          });
          break;
        }
      } catch {}
    }
  }
  return results;
}

// ─── FETCH DE UNA LIGA ────────────────────────────────────────────────────────
async function fetchLeague(league) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.slug}/scoreboard`;
  try {
    const { data } = await axios.get(url, { timeout: 10000 });
    return (data.events || []).map(event => {
      const comp     = event.competitions?.[0];
      const home     = comp?.competitors?.find(c => c.homeAway === 'home');
      const away     = comp?.competitors?.find(c => c.homeAway === 'away');
      const status   = event.status?.type;
      const broadcasts = (comp?.broadcasts || []).flatMap(b => b.names || []);

      return {
        espnId:      event.id,
        competition: league.name,
        teamHome:    home?.team?.displayName || home?.team?.name || '',
        teamAway:    away?.team?.displayName || away?.team?.name || '',
        logoHome:    home?.team?.logo || '',
        logoAway:    away?.team?.logo || '',
        scoreHome:   home?.score || '0',
        scoreAway:   away?.score || '0',
        datetime:    new Date(event.date),
        statusName:  status?.name    || 'pre',       // pre / in / post
        statusDesc:  status?.detail  || 'Programado',
        broadcasts,                                   // ["ESPN", "TyC Sports", ...]
        leagueLogo:  data.leagues?.[0]?.logos?.[0]?.href || '',
      };
    });
  } catch (err) {
    console.error(`[ESPN] Error ${league.name}: ${err.message}`);
    return [];
  }
}

// ─── DETERMINAR STATUS ────────────────────────────────────────────────────────
function resolveStatus(espnStatusName, datetime) {
  if (espnStatusName === 'in')   return 'live';
  if (espnStatusName === 'post') return 'finished';
  // Para 'pre', verificar si ya pasó más de 2h (por si ESPN no actualizó)
  const diffMin = (new Date() - datetime) / 60000;
  if (diffMin > 120) return 'finished';
  if (diffMin > -5)  return 'live';
  return 'upcoming';
}

// ─── SCRAPER PRINCIPAL ────────────────────────────────────────────────────────
async function runEventosScraper() {
  console.log('[ESPN] Iniciando scraper de eventos...');
  let total = 0;

  try {
    // Rango: hoy y mañana
    const todayStart       = new Date(); todayStart.setHours(0, 0, 0, 0);
    const dayAfterTomorrow = new Date(todayStart); dayAfterTomorrow.setDate(todayStart.getDate() + 2);

    // Limpiar eventos del período
    await Event.deleteMany({ datetime: { $gte: todayStart, $lt: dayAfterTomorrow } });

    // Traer todas las ligas en paralelo
    const allEvents = (await Promise.all(LEAGUES.map(fetchLeague))).flat();
    console.log(`[ESPN] Eventos crudos recibidos: ${allEvents.length}`);

    // Filtrar solo hoy y mañana
    const filtered = allEvents.filter(ev =>
      ev.datetime >= todayStart && ev.datetime < dayAfterTomorrow &&
      ev.teamHome && ev.teamAway
    );

    // Deduplicar por espnId
    const unique = [...new Map(filtered.map(e => [e.espnId, e])).values()];
    console.log(`[ESPN] Eventos filtrados (hoy/mañana): ${unique.length}`);

    for (const ev of unique) {
      const channels = await getChannelsFromDB(ev.broadcasts);
      const status   = resolveStatus(ev.statusName, ev.datetime);
      const title    = `${ev.teamHome} vs ${ev.teamAway}`;

      try {
        await Event.create({
          title,
          competition:  ev.competition,
          sport:        'football',
          teamHome:     ev.teamHome,
          teamAway:     ev.teamAway,
          logoHome:     ev.logoHome,
          logoAway:     ev.logoAway,
          leagueLogo:   ev.leagueLogo,
          datetime:     ev.datetime,
          statusDetail: ev.statusDesc,
          channels,
          status,
          isActive:     true,
          source:       'espn',
        });
        total++;
        console.log(`[${total}] ${title} | ${ev.competition} | ${ev.datetime.toLocaleTimeString('es-AR')} | [${status}] | TV: ${ev.broadcasts.join(', ') || 'sin dato'} | DB: ${channels.map(c => c.name).join(', ') || 'sin canal'}`);
      } catch (err) {
        console.error(`[ESPN] Error guardando "${title}": ${err.message}`);
      }
    }

    console.log(`[ESPN] ✅ Finalizado. ${total} eventos guardados.`);
  } catch (err) {
    console.error('[ESPN] Error general:', err.message);
  }
}

// ─── ACTUALIZAR STATUS EN VIVO ────────────────────────────────────────────────
async function updateLiveStatus() {
  try {
    const now         = new Date();
    const windowStart = new Date(now.getTime() - 120 * 60 * 1000);
    const windowEnd   = new Date(now.getTime() +   5 * 60 * 1000);

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
  } catch (err) {
    console.error('[LiveStatus] Error:', err.message);
  }
}

// ─── CRON ─────────────────────────────────────────────────────────────────────
function startCron() {
  // Correr al inicio
  runEventosScraper();

  // Actualizar eventos cada 6 horas
  setInterval(runEventosScraper, 6 * 60 * 60 * 1000);

  // Actualizar status en vivo cada 5 minutos
  setInterval(updateLiveStatus, 5 * 60 * 1000);

  console.log('[ESPN] Cron activo: eventos cada 6h, live status cada 5min');
}

module.exports = runEventosScraper;
module.exports.startCron = startCron;
