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
      }
    });
    const $ = cheerio.load(data);
    let count = 0;

    // Selector actualizado: Cuevana suele usar .xxx o figuras dentro de listas
    // Vamos a intentar con 'ul.movies-list li' o '.item' que es lo más común
    $('.item, .ml-item, .movie').each(async (i, el) => {
      const title = $(el).find('h2, .title, .entry-title').text().trim();
      const poster = $(el).find('img').attr('data-src') || $(el).find('img').attr('src');
      const sourceUrl = $(el).find('a').attr('href');

      if (title && sourceUrl) {
        const movieData = {
          title: title,
          poster: poster,
          backdrop: poster,
          description: "Sincronizado desde Cuevana",
          genre: "Película",
          category: "Estrenos",
          year: 2026,
          sourceUrl: sourceUrl,
          status: "active",
          provider: "cuevana"
        };

        await Movie.updateOne({ title: title }, { $set: movieData }, { upsert: true });
        count++;
      }
    });

    console.log(`✅ [Scraper] Proceso terminado. ${count} películas intentadas.`);
  } catch (e) {
    console.error("❌ [Scraper] Error:", e.message);
  }
}

module.exports = runScraper;}

module.exports = runScraper;
