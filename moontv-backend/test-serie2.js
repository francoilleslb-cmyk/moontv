const axios = require('axios');
const cheerio = require('cheerio');
(async () => {
  const { data } = await axios.get('https://cuevana.bi/serie/como-agua-para-chocolate-2', { 
    headers: { 'User-Agent': 'Mozilla/5.0' }, 
    timeout: 10000 
  });
  const $ = cheerio.load(data);
  // Ver todos los links
  const links = [];
  $('a').each((i,el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim();
    if (href.includes('episodio') || href.includes('genero') || text.match(/^\d+x\d+/)) {
      links.push({ text, href });
    }
  });
  console.log('LINKS:', JSON.stringify(links.slice(0,10), null, 2));
})();
