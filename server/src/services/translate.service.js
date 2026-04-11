/**
 * Server-side Translation Service
 * Uses MyMemory free API — same logic as client/src/translate.js
 * Preserves {{variable}} placeholders during translation.
 */

// In-process cache: key = 'src|tgt|text' → translated string
const _cache = new Map();

const SUPPORTED = new Set(['hi', 'en', 'gu', 'mr', 'bn', 'ta', 'te', 'ur', 'ar', 'de', 'fr', 'es', 'pt']);

/**
 * Translate a single piece of text, keeping {{vars}} intact.
 * Returns original text on any error (graceful fallback).
 */
export async function translateText(text, targetLang, sourceLang = 'en') {
  if (!text || !targetLang || targetLang === 'en' || targetLang === sourceLang) return text;
  if (!SUPPORTED.has(targetLang)) return text;

  const key = `${sourceLang}|${targetLang}|${text}`;
  if (_cache.has(key)) return _cache.get(key);

  // Protect {{variable}} tokens from being mangled by the translation API
  const tokens = {};
  let idx = 0;
  const protected_ = text.replace(/\{\{(\w+)\}\}/g, (match) => {
    const token = `XVARX${idx++}X`;
    tokens[token] = match;
    return token;
  });

  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(protected_)}&langpair=${sourceLang}|${targetLang}`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();

    let translated = data?.responseData?.translatedText || text;

    // Restore {{variables}}
    Object.entries(tokens).forEach(([token, original]) => {
      translated = translated.replace(new RegExp(token, 'gi'), original);
    });
    // Catch any stragglers
    translated = translated.replace(/XVARX\d+X/gi, m => tokens[m] || m);

    _cache.set(key, translated);
    return translated;
  } catch (err) {
    console.warn('[translate] API error:', err.message);
    return text;
  }
}

/**
 * Translate the text fields of a WhatsApp components array.
 * Only translates BODY text — header/footer/buttons stay as-is
 * because WhatsApp templates use numbered params for those.
 */
export async function translateComponents(components, targetLang) {
  if (!components || !targetLang || targetLang === 'en') return components;

  return Promise.all(components.map(async (comp) => {
    if (comp.type === 'body' && comp.text) {
      return { ...comp, text: await translateText(comp.text, targetLang) };
    }
    return comp;
  }));
}
