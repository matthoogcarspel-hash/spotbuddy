const https = require('https');

module.exports = function handler(req, res) {
  const { latitude, longitude } = req.query;
  if (!latitude || !longitude) {
    res.status(400).json({ error: 'latitude and longitude required' });
    return;
  }

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=kn`;

  https.get(url, (upstream) => {
    let body = '';
    upstream.on('data', (chunk) => { body += chunk; });
    upstream.on('end', () => {
      try {
        const data = JSON.parse(body);
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
        res.status(200).json(data);
      } catch {
        res.status(502).json({ error: 'invalid upstream response' });
      }
    });
  }).on('error', (err) => {
    res.status(502).json({ error: err.message });
  });
};
