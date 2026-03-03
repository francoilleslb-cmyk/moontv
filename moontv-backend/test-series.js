const axios = require('axios');
const cheerio = require('cheerio');
(async () => {
  const { data } = await axios.get('https://cuevana.bi/', { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
  const $ = cheerio.load(data);
  const series = [];
  $('a').each((i, el) => {
    const link = $(el).attr('href');
    const img = $(el).find('img');
    const title = img.attr('alt') || '';
    if (link && link.includes('/serie/')) {
      series.push({ title, link });
    }
  });
  console.log(JSON.stringify(series.slice(0, 5), null, 2));
})();
