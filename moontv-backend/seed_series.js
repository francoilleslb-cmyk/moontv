require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Series = require('./models/Series');

async function seed() {
    try {
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            console.log('No MONGODB_URI found, skipping series seeder.');
            return;
        }

        await mongoose.connect(mongoUri);
        console.log('✅ Conectado a MongoDB para importar series...');

        const dataPath = path.join(__dirname, 'series_seeder_data.json');
        if (!fs.existsSync(dataPath)) {
            console.log('No se encontró series_seeder_data.json, omitiendo semilla.');
            process.exit(0);
        }

        const jsonData = fs.readFileSync(dataPath, 'utf-8');
        const seriesList = JSON.parse(jsonData);

        console.log(`Encontradas ${seriesList.length} series en el JSON.`);

        const seriesDocs = seriesList.filter(s => !!s.title).map(s => {
            const episodeList = [];
            if (s.streamUrl) {
                episodeList.push({
                    title: "Capítulo 1",
                    number: 1,
                    season: 1,
                    streamUrl: s.streamUrl,
                    duration: "24/7"
                });
            }

            return {
                title: s.title || '',
                poster: s.poster || '',
                genre: s.genre || '',
                category: s.genre || 'Series',
                seasons: s.seasons || 1,
                episodes: s.episodes || 1,
                rating: s.rating || 0,
                status: s.status === 'active' ? 'active' : 'inactive',
                episodeList
            };
        });

        // Validar duplicados si ya existen o borrar primero
        // Dado que son nuevos, insertarlos, o hacer un upsert basado en el título para no duplicarlos
        // si Render ejecuta el script varias veces

        let count = 0;
        for (const doc of seriesDocs) {
            const exists = await Series.findOne({ title: doc.title });
            if (!exists) {
                await Series.create(doc);
                count++;
            }
        }

        console.log(`✅ ¡Importación completa! Se insertaron ${count} series nuevas.`);

        // Opcional: borrar el archivo para no sembrar más en el futuro
        // fs.unlinkSync(dataPath);

    } catch (err) {
        console.error('❌ Error en el seeder:', err);
    } finally {
        process.exit(0);
    }
}

seed();
