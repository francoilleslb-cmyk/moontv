const axios = require('axios');
const cheerio = require('cheerio');
(async () => {
  const { data } = await axios.get('https://pelotalibretv.su/agenda/', { 
    headers: { 'User-Agent': 'Mozilla/5.0' }, 
    timeout: 10000 
  });
  const $ = cheerio.load(data);
  console.log($.text().substring(0, 2000));
})();
