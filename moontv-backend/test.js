// test.js
const mongoose = require('mongoose');
const runScraper = require('./runEventosScraper');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log("Conectado. Empezando...");
    await runScraper();
    console.log("Terminado.");
    process.exit(0);
  });
