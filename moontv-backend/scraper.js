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
      timeout: 10000
    });
    
    const $ = cheerio.load(data);
    let count = 0;

    // Buscamos los elementos de las películas
    const items = $('.item, .ml-item, .movie');
    
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

        await Movie.updateOne({ title: title }, { $set: movieData }, { upsert: true });
        count++;
      }
    }

    console.log(`✅ [Scraper] Proceso terminado. ${count} películas sincronizadas.`);
  } catch (e) {
    console.error("❌ [Scraper] Error:", e.message);
  }
}

module.exports = runScraper;
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
