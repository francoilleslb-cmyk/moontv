// test.js
const mongoose = require('mongoose');
const runScraper = require('./runEventosScraper');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI || 'tu_url_de_mongo')
  .then(async () => {
    console.log("Conectado. Empezando...");
    await runScraper();
    console.log("Terminado.");
    process.exit(0);
  });
