const axios = require('axios');
const cheerio = require('cheerio');
(async () => {
  const { data } = await axios.get('https://cuevana.bi/serie/como-agua-para-chocolate-2', { 
    headers: { 'User-Agent': 'Mozilla/5.0' }, 
    timeout: 10000 
  });
  const fs = require('fs');
  fs.writeFileSync('/tmp/serie.html', data);
  console.log('Guardado, size: ' + data.length);
})();
