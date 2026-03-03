const axios = require('axios');
const cheerio = require('cheerio');
(async () => {
  const { data } = await axios.get('https://cuevana.bi/serie/como-agua-para-chocolate-2', { 
    headers: { 'User-Agent': 'Mozilla/5.0' }, 
    timeout: 10000 
  });
  const $ = cheerio.load(data);
  console.log('TITULO:', $('h1').first().text().trim());
  console.log('DESC:', $('p').filter((i,el) => $(el).text().length > 80).first().text().trim().substring(0,150));
  console.log('GENERO:', $('a[href*="/genero/"]').first().text().trim());
  const episodios = [];
  $('a[href*="/episodio-"]').each((i,el) => {
    episodios.push({ text: $(el).text().trim(), href: $(el).attr('href') });
  });
  console.log('EPISODIOS:', JSON.stringify(episodios.slice(0,5), null, 2));
})();
