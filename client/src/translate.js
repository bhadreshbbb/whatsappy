// ─── Real-time Translation Utility ───────────────────────────────────────────
// Uses free MyMemory API (no API key required).
// Preserves {{variable}} placeholders during translation.

const LANG_NAMES = {
  auto: 'en', hi: 'hi', en: 'en', gu: 'gu', mr: 'mr',
  bn: 'bn', ta: 'ta', te: 'te', ur: 'ur', ar: 'ar',
  de: 'de', fr: 'fr', es: 'es', pt: 'pt',
};

// Cache to avoid re-translating same text+lang combo
const _cache = new Map();

/**
 * Translates text to target language, preserving {{variables}}.
 * @param {string} text - Source text (can contain {{vars}})
 * @param {string} targetLang - Target language code (e.g. 'hi', 'ta')
 * @param {string} sourceLang - Source language code (default: 'en')
 * @returns {Promise<string>} Translated text with {{vars}} restored
 */
export async function translateText(text, targetLang, sourceLang = 'en') {
  if (!text || !targetLang || targetLang === 'auto' || targetLang === sourceLang) {
    return text;
  }

  const key = `${sourceLang}|${targetLang}|${text}`;
  if (_cache.has(key)) return _cache.get(key);

  // Replace {{variable}} with unique tokens to protect them during translation
  const tokens = {};
  let tokenIndex = 0;
  const protected_ = text.replace(/\{\{(\w+)\}\}/g, (match) => {
    const token = `XVARX${tokenIndex++}X`;
    tokens[token] = match;
    return token;
  });

  try {
    const langpair = `${sourceLang}|${LANG_NAMES[targetLang] || targetLang}`;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(protected_)}&langpair=${langpair}`;

    const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();

    let translated = data?.responseData?.translatedText || text;

    // Restore {{variables}} from tokens
    Object.entries(tokens).forEach(([token, original]) => {
      translated = translated.replace(new RegExp(token, 'gi'), original);
    });

    // Fallback: if we still see loose token chars, restore from original
    translated = translated.replace(/XVARX\d+X/gi, match => tokens[match] || match);

    _cache.set(key, translated);
    return translated;

  } catch (err) {
    console.warn('[translate] API error:', err.message);
    return text; // graceful fallback to original
  }
}

/**
 * Translates all text fields of a template object.
 * @param {object} template - Template with body_text, header_text, footer_text
 * @param {string} targetLang - e.g. 'hi'
 * @returns {Promise<object>} Translated template copy
 */
export async function translateTemplate(template, targetLang) {
  if (!template || !targetLang || targetLang === 'auto') return template;

  const [body, header, footer] = await Promise.all([
    translateText(template.body_text   || '', targetLang),
    translateText(template.header_text || '', targetLang),
    translateText(template.footer_text || '', targetLang),
  ]);

  return {
    ...template,
    body_text:   body,
    header_text: header,
    footer_text: footer,
  };
}
