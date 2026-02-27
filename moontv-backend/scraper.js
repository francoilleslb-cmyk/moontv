const axios = require('axios');
const Movie = require('./models/Movie');

async function runScraper() {
  console.log("🚀 [Scraper] Llenando MongoDB con estrenos...");

  try {
    // 1. Obtenemos los últimos estrenos de la API de TMDB (Es gratis y no bloquea)
    const tmdbRes = await axios.get(`https://api.themoviedb.org/3/movie/now_playing?api_key=4f4c3529241975b2b93609823337a7f4&language=es-MX&page=1`);
    
    const peliculas = tmdbRes.data.results;
    let guardadas = 0;

    for (const p of peliculas) {
      // 2. Creamos el link de búsqueda para GNula automáticamente
      // Esto le dice a la App dónde ir a buscar el video después
      const searchTitle = p.title.toLowerCase().replace(/ /g, '-');
      const gnulaLink = `https://www2.gnula.one/pelicula/${searchTitle}-online/`;

      // 3. GUARDAR EN MONGODB
      await Movie.updateOne(
        { title: p.title }, // Si el título coincide...
        { 
          $set: { 
            title: p.title,
            description: p.overview,
            poster: `https://image.tmdb.org/t/p/w500${p.poster_path}`,
            sourceUrl: gnulaLink, // El link de video se queda guardado aquí
            category: "Estrenos",
            year: parseInt(p.release_date) || 2026,
            status: "active"
          }
        },
        { upsert: true } // Si no existe, la crea
      );
      guardadas++;
    }

    console.log(`✅ [Scraper] MongoDB actualizado: ${guardadas} películas listas.`);

  } catch (error) {
    console.error("❌ Error al llenar Mongo:", error.message);
  }
}

module.exports = runScraper;
