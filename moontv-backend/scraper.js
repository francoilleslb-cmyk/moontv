const axios = require('axios');
const cheerio = require('cheerio');
const Movie = require('./models/Movie'); // Asegúrate de que la ruta a tu modelo sea correcta

async function runScraper() {
    console.log("🚀 [Scraper] Iniciando actualización desde Cuevana.bi...");
    try {
        const { data } = await axios.get('https://cuevana.bi/peliculas', {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const $ = cheerio.load(data);
        let count = 0;

        $('.item').each(async (i, el) => {
            const movieData = {
                title: $(el).find('h2').text().trim(),
                poster: $(el).find('img').attr('data-src') || $(el).find('img').attr('src'),
                sourceUrl: $(el).find('a').attr('href'),
                provider: 'cuevana',
                type: 'movie',
                category: '650000000000000000000001' // Pon aquí un ID de categoría válido de tu DB
            };

            if (movieData.title && movieData.sourceUrl) {
                await Movie.updateOne(
                    { title: movieData.title },
                    { $set: movieData },
                    { upsert: true }
                );
                count++;
            }
        });
        console.log(`✅ [Scraper] Proceso terminado. ${count} películas sincronizadas.`);
    } catch (e) {
        console.error("❌ [Scraper] Error:", e.message);
    }
}

module.exports = runScraper;
