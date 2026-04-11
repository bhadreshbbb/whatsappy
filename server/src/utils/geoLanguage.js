/**
 * India State & City → Language Mapping
 * Used to auto-assign visitor language from geo data.
 * Non-India countries → 'en' by default.
 * Codes: hi, en, gu, mr, bn, ta, te, ur
 */

// State-level primary language (covers all of India)
const STATE_LANGUAGE = {
  'Andhra Pradesh':             'te',
  'Arunachal Pradesh':          'en',
  'Assam':                      'en',   // Assamese not in supported set
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
  'Karnataka':                  'en',   // Kannada not in supported set; English dominant
  'Kerala':                     'en',   // Malayalam not in supported set
  'Ladakh':                     'ur',
  'Lakshadweep':                'en',
  'Madhya Pradesh':             'hi',
  'Maharashtra':                'mr',
  'Manipur':                    'en',
  'Meghalaya':                  'en',
  'Mizoram':                    'en',
  'Nagaland':                   'en',
  'Odisha':                     'en',   // Odia not in supported set
  'Puducherry':                 'ta',
  'Punjab':                     'hi',   // Punjabi not in supported set
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

// City-level overrides (more specific than state)
const CITY_LANGUAGE = {
  // Maharashtra
  'Mumbai':           'mr',
  'Pune':             'mr',
  'Nagpur':           'mr',
  'Nashik':           'mr',
  'Aurangabad':       'mr',
  'Solapur':          'mr',
  'Amravati':         'mr',
  'Kolhapur':         'mr',
  // Gujarat
  'Ahmedabad':        'gu',
  'Surat':            'gu',
  'Vadodara':         'gu',
  'Rajkot':           'gu',
  'Bhavnagar':        'gu',
  'Jamnagar':         'gu',
  'Gandhinagar':      'gu',
  'Anand':            'gu',
  // Tamil Nadu
  'Chennai':          'ta',
  'Coimbatore':       'ta',
  'Madurai':          'ta',
  'Tiruchirappalli':  'ta',
  'Salem':            'ta',
  'Tirunelveli':      'ta',
  'Vellore':          'ta',
  // Telangana / Andhra Pradesh
  'Hyderabad':        'te',
  'Visakhapatnam':    'te',
  'Vijayawada':       'te',
  'Warangal':         'te',
  'Tirupati':         'te',
  // West Bengal
  'Kolkata':          'bn',
  'Howrah':           'bn',
  'Asansol':          'bn',
  'Siliguri':         'bn',
  'Durgapur':         'bn',
  // Karnataka → English (cosmopolitan)
  'Bangalore':        'en',
  'Bengaluru':        'en',
  'Mysore':           'en',
  'Mysuru':           'en',
  'Hubli':            'en',
  'Mangalore':        'en',
  // Kerala → English
  'Kochi':            'en',
  'Cochin':           'en',
  'Thiruvananthapuram':'en',
  'Kozhikode':        'en',
  'Thrissur':         'en',
  // Hindi belt
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
  // J&K / Urdu belt
  'Srinagar':         'ur',
  'Jammu':            'ur',
};

/**
 * Resolve language code from geo data.
 * @param {string} city
 * @param {string} state
 * @param {string} countryCode  - ISO 2-letter code, e.g. 'IN', 'US'
 * @returns {string} language code
 */
export function getLanguageFromGeo(city = '', state = '', countryCode = '') {
  if (countryCode && countryCode.toUpperCase() !== 'IN') return 'en';

  const cityKey = (city || '').trim();
  if (cityKey && CITY_LANGUAGE[cityKey]) return CITY_LANGUAGE[cityKey];

  const stateKey = (state || '').trim();
  if (stateKey && STATE_LANGUAGE[stateKey]) return STATE_LANGUAGE[stateKey];

  // India but city/state not mapped → Hindi (most widely spoken)
  if (countryCode && countryCode.toUpperCase() === 'IN') return 'hi';

  return 'en';
}

export { STATE_LANGUAGE, CITY_LANGUAGE };
