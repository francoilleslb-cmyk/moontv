const axios = require('axios');
const cheerio = require('cheerio');
const Movie = require('./models/Movie');
const Event = require('./models/Event');

async function runScraper() {
  console.log("🚀 [Scraper] Iniciando actualización desde Cuevana.bi...");
  try {
    const { data } = await axios.get('https://cuevana.bi/peliculas', {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
      },
      timeout: 15000
    });
    
    const $ = cheerio.load(data);
    let count = 0;

    // Seleccionamos los elementos y los convertimos en un array para iterar
    const items = $('.item, .ml-item, .movie').toArray();
    
    for (const el of items) {
      const title = $(el).find('h2, .title, .entry-title').text().trim();
      const poster = $(el).find('img').attr('data-src') || $(el).find('img').attr('src');
      const sourceUrl = $(el).find('a').attr('href');

      if (title && sourceUrl) {
        const movieData = {
          title: title,
          poster: poster,
          backdrop: poster,
          description: "Sincronizado automáticamente desde Cuevana",
          genre: "Película",
          category: "Estrenos",
          year: 2026,
          sourceUrl: sourceUrl,
          status: "active",
          provider: "cuevana"
        };

        // Aquí usamos el await correctamente dentro de la función async runScraper
        await Movie.updateOne({ title: title }, { $set: movieData }, { upsert: true });
        count++;
      }
    }

    console.log(`✅ [Scraper] Proceso terminado. ${count} películas sincronizadas.`);
    
    // Llamamos a la parte de deportes
    await runDeportesScraper();

  } catch (e) {
    console.error("❌ [Scraper] Error en películas:", e.message);
  }
}

async function runDeportesScraper() {
  try {
    const { data } = await axios.get('https://www.pirlotvonline.org/', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const $ = cheerio.load(data);
    const links = $('a').toArray();

    for (const el of links) {
      const eventTitle = $(el).text().trim();
      const eventLink = $(el).attr('href');

      if (eventTitle.toLowerCase().includes('vs')) {
        await Event.updateOne(
          { title: eventTitle },
          { $set: { 
              title: eventTitle, 
              sourceUrl: eventLink, 
              category: "Deportes", 
              status: "active",
              type: "live" 
          }},
          { upsert: true }
        );
      }
    }
    console.log("⚽ [Scraper] Deportes actualizados.");
  } catch (e) {
    console.log("❌ [Scraper] Error en deportes:", e.message);
  }
}

module.exports = runScraper;
