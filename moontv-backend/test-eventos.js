const axios = require('axios');
const cheerio = require('cheerio');
(async () => {
  const { data } = await axios.get('https://pelotalibretv.su/', { 
    headers: { 'User-Agent': 'Mozilla/5.0' }, 
    timeout: 10000 
  });
  const fs = require('fs');
  fs.writeFileSync('/tmp/eventos.html', data);
  console.log('Size: ' + data.length);
  const $ = cheerio.load(data);
  // Ver texto de partidos
  const items = [];
  $('a, .match, .event, .game, article').each((i, el) => {
    const text = $(el).text().trim().substring(0, 100);
    if (text.length > 10) items.push(text);
  });
  console.log(JSON.stringify(items.slice(0, 10), null, 2));
})();
