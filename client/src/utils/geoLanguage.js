/**
 * India State & City → Language Mapping
 * Used to auto-detect visitor language from geo data in the UI.
 * Non-India countries → 'en' by default.
 * Codes: hi, en, gu, mr, bn, ta, te, ur
 */

const STATE_LANGUAGE = {
  'Andhra Pradesh':             'te',
  'Arunachal Pradesh':          'en',
  'Assam':                      'en',
  'Bihar':                      'hi',
  'Chandigarh':                 'hi',
  'Chhattisgarh':               'hi',
  'Dadra and Nagar Haveli':     'gu',
  'Daman and Diu':              'gu',
  'Delhi':                      'hi',
  'Goa':                        'en',
  'Gujarat':                    'gu',
  'Haryana':                    'hi',
  'Himachal Pradesh':           'hi',
  'Jammu and Kashmir':          'ur',
  'Jammu & Kashmir':            'ur',
  'Jharkhand':                  'hi',
  'Karnataka':                  'en',
  'Kerala':                     'en',
  'Ladakh':                     'ur',
  'Lakshadweep':                'en',
  'Madhya Pradesh':             'hi',
  'Maharashtra':                'mr',
  'Manipur':                    'en',
  'Meghalaya':                  'en',
  'Mizoram':                    'en',
  'Nagaland':                   'en',
  'Odisha':                     'en',
  'Puducherry':                 'ta',
  'Punjab':                     'hi',
  'Rajasthan':                  'hi',
  'Sikkim':                     'en',
  'Tamil Nadu':                 'ta',
  'Telangana':                  'te',
  'Tripura':                    'bn',
  'Uttar Pradesh':              'hi',
  'Uttarakhand':                'hi',
  'West Bengal':                'bn',
  'Andaman and Nicobar Islands':'en',
};

const CITY_LANGUAGE = {
  'Mumbai':           'mr',
  'Pune':             'mr',
  'Nagpur':           'mr',
  'Nashik':           'mr',
  'Aurangabad':       'mr',
  'Solapur':          'mr',
  'Amravati':         'mr',
  'Kolhapur':         'mr',
  'Ahmedabad':        'gu',
  'Surat':            'gu',
  'Vadodara':         'gu',
  'Rajkot':           'gu',
  'Bhavnagar':        'gu',
  'Jamnagar':         'gu',
  'Gandhinagar':      'gu',
  'Anand':            'gu',
  'Chennai':          'ta',
  'Coimbatore':       'ta',
  'Madurai':          'ta',
  'Tiruchirappalli':  'ta',
  'Salem':            'ta',
  'Tirunelveli':      'ta',
  'Vellore':          'ta',
  'Hyderabad':        'te',
  'Visakhapatnam':    'te',
  'Vijayawada':       'te',
  'Warangal':         'te',
  'Tirupati':         'te',
  'Kolkata':          'bn',
  'Howrah':           'bn',
  'Asansol':          'bn',
  'Siliguri':         'bn',
  'Durgapur':         'bn',
  'Bangalore':        'en',
  'Bengaluru':        'en',
  'Mysore':           'en',
  'Mysuru':           'en',
  'Hubli':            'en',
  'Mangalore':        'en',
  'Kochi':            'en',
  'Cochin':           'en',
  'Thiruvananthapuram':'en',
  'Kozhikode':        'en',
  'Thrissur':         'en',
  'Delhi':            'hi',
  'New Delhi':        'hi',
  'Lucknow':          'hi',
  'Kanpur':           'hi',
  'Agra':             'hi',
  'Varanasi':         'hi',
  'Meerut':           'hi',
  'Allahabad':        'hi',
  'Prayagraj':        'hi',
  'Patna':            'hi',
  'Ranchi':           'hi',
  'Bhopal':           'hi',
  'Indore':           'hi',
  'Jabalpur':         'hi',
  'Raipur':           'hi',
  'Jaipur':           'hi',
  'Jodhpur':          'hi',
  'Udaipur':          'hi',
  'Kota':             'hi',
  'Dehradun':         'hi',
  'Amritsar':         'hi',
  'Ludhiana':         'hi',
  'Chandigarh':       'hi',
  'Faridabad':        'hi',
  'Gurgaon':          'hi',
  'Gurugram':         'hi',
  'Noida':            'hi',
  'Ghaziabad':        'hi',
  'Srinagar':         'ur',
  'Jammu':            'ur',
};

/**
 * Resolve language code from geo data.
 * @param {string} city
 * @param {string} state
 * @param {string} countryCode  - ISO 2-letter code
 * @returns {string} language code
 */
export function getLanguageFromGeo(city = '', state = '', countryCode = '') {
  if (countryCode && countryCode.toUpperCase() !== 'IN') return 'en';

  const cityKey = (city || '').trim();
  if (cityKey && CITY_LANGUAGE[cityKey]) return CITY_LANGUAGE[cityKey];

  const stateKey = (state || '').trim();
  if (stateKey && STATE_LANGUAGE[stateKey]) return STATE_LANGUAGE[stateKey];

  if (countryCode && countryCode.toUpperCase() === 'IN') return 'hi';

  return 'en';
}

export { STATE_LANGUAGE, CITY_LANGUAGE };
