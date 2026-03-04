const mongoose = require('mongoose');
const run = require('./scraper-eventos');
require('dotenv').config();
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  await run();
  process.exit(0);
});
