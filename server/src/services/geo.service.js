export const geoService = {
  async getLocation(ip) {
    if (!ip) {
      return { city: null, country: null, countryCode: null, state: null, timezone: null };
    }

    const cleanIp = ip.replace(/^::ffff:/, '');
    
    if (cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp.startsWith('192.168.') || cleanIp.startsWith('10.')) {
      return { city: 'Local', country: 'Local', countryCode: 'XX', state: 'Local', timezone: 'UTC' };
    }

    try {
      const geoip = await import('geoip-lite').catch(() => null);
      if (geoip && geoip.default) {
        const geo = geoip.default.lookup(cleanIp);
        if (geo) {
          return {
            city: geo.city || null,
            country: geo.country || null,
            countryCode: geo.country || null,
            state: geo.region || null,
            timezone: geo.timezone || null,
            ll: geo.ll,
          };
        }
      }
    } catch (e) {
      console.error('Geo lookup error:', e);
    }

    return { city: null, country: null, countryCode: null, state: null, timezone: null };
  },

  async getLocationFromExternal(ip) {
    try {
      const cleanIp = ip.replace(/^::ffff:/, '');
      const response = await fetch(`https://api.freeipapi.app/api/v1/lookup?ip=${encodeURIComponent(cleanIp)}`, {
        headers: {
          'Authorization': `Bearer ${process.env.FREEIPAPI_TOKEN}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) return { city: null, country: null, countryCode: null, state: null, timezone: null };

      const data = await response.json();

      return {
        city:        data.cityName    || null,
        country:     data.countryName || null,
        countryCode: data.countryCode || null,
        state:       data.regionName  || null,
        timezone:    data.timeZone    || null,
        ll: data.latitude && data.longitude ? [data.latitude, data.longitude] : null,
      };
    } catch (e) {
      console.error('External geo lookup error:', e.message);
    }

    return { city: null, country: null, countryCode: null, state: null, timezone: null };
  },
};
