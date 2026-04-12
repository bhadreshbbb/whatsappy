import { useEffect, useState, useRef } from "react";
import {
  Plus, Trash2, RefreshCw, CheckCircle2, Clock, XCircle,
  AlertCircle, Settings2, Send, Image, Type, Link,
  Zap, Copy, Check, FileText, X, LayoutGrid, ChevronLeft, ChevronRight,
  Globe, Loader2, ImagePlus, TrendingUp, ShoppingCart, Flame, Eye, Sparkles
} from "lucide-react";

const BASE        = `/api/meta-templates`;
const GALLERY_API = `/api/gallery`;
const CH = () => ({ 'x-channel-id': localStorage.getItem('channelId') || 'demo' });

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { ...CH(), 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const CATEGORIES = [
  { value: 'MARKETING', label: 'Marketing' },
  { value: 'UTILITY',   label: 'Utility' },
];
const LANGUAGES = [
  { value: 'en', label: '🇺🇸 English' }, { value: 'hi', label: '🇮🇳 Hindi' },
  { value: 'gu', label: '🇮🇳 Gujarati' }, { value: 'ta', label: '🇮🇳 Tamil' },
  { value: 'te', label: '🇮🇳 Telugu' },  { value: 'mr', label: '🇮🇳 Marathi' },
  { value: 'bn', label: '🇧🇩 Bengali' }, { value: 'ar', label: '🇦🇪 Arabic' },
];

const VAR_FIELD_OPTIONS = [
  { value: 'product_title', label: 'Product Title' },
  { value: 'product_price', label: 'Product Price' },
  { value: 'product_link',  label: 'Product Link/URL' },
  { value: 'product_image', label: 'Product Image URL' },
  { value: 'customer_name', label: 'Customer Name' },
  { value: 'cart_total',    label: 'Cart Total' },
  { value: 'cart_link',     label: 'Cart Link' },
  { value: 'custom',        label: 'Custom Fixed Text' },
];

const STATUS_CONFIG = {
  APPROVED:       { color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20',   icon: CheckCircle2, label: 'Approved' },
  PENDING:        { color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20', icon: Clock,        label: 'Pending Review' },
  REJECTED:       { color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20',       icon: XCircle,      label: 'Rejected' },
  DRAFT:          { color: 'text-slate-400',  bg: 'bg-slate-500/10 border-slate-500/20',   icon: FileText,     label: 'Draft' },
  SUBMIT_ERROR:   { color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20',       icon: AlertCircle,  label: 'Submit Error' },
  NO_CREDENTIALS: { color: 'text-slate-400',  bg: 'bg-slate-500/10 border-slate-500/20',   icon: AlertCircle,  label: 'No Credentials' },
};

const DEFAULT_VAR_MAP = { '1': 'product_title', '2': 'product_price', '3': 'product_link' };

const BLANK_CARD = {
  body: '{{1}}\n₹{{2}}',
  buttons: [{ type: 'URL', text: 'Buy Now', url: 'https://yourstore.com/{{3}}' }],
  image_id: '', header_media_id: '',
  source: 'manual',  // 'manual' | 'url' | 'auto'
  scrape_url: '',
  var_map: { ...DEFAULT_VAR_MAP },
};

const BLANK_TPL = {
  name: '', category: 'MARKETING', language: 'en',
  is_carousel: false, auto_product_mode: false,
  header_type: 'NONE', header_text: '',
  body: '', footer: '', buttons: [], variable_labels: [],
  carousel_cards: [{ ...BLANK_CARD }, { ...BLANK_CARD }, { ...BLANK_CARD }],
};

function extractVars(text) {
  return [...new Set([...(text || '').matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1]))].sort((a, b) => +a - +b);
}

// ── ROOT COMPONENT ─────────────────────────────────────────────────────────────
export default function Templates() {
  const [templates, setTemplates]         = useState([]);
  const [view, setView]                   = useState('list');
  const [form, setForm]                   = useState(BLANK_TPL);
  const [selected, setSelected]           = useState(null);
  const [loading, setLoading]             = useState(false);
  const [refreshing, setRefreshing]       = useState({});
  const [error, setError]                 = useState('');
  const [copied, setCopied]               = useState(null);
  const [galleries, setGalleries]         = useState([]);
  const [galleryImages, setGalleryImages] = useState([]);
  const [productConfig, setProductConfig] = useState({});

  useEffect(() => { loadTemplates(); }, []);

  async function loadTemplates() {
    setLoading(true);
    try { const d = await api('/'); setTemplates(d.templates); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function loadGallery() {
    try {
      const d = await fetch(`${GALLERY_API}/folders`, { headers: CH() }).then(r => r.json());
      setGalleries(d.folders || []);
    } catch (_) {}
  }

  async function loadFolderImages(folderId) {
    try {
      const d = await fetch(`${GALLERY_API}/folders/${folderId}/images`, { headers: CH() }).then(r => r.json());
      setGalleryImages(d.images || []);
    } catch (_) {}
  }

  async function submitTemplate() {
    setError('');
    if (!form.name.trim()) return setError('Template name is required');
    if (form.is_carousel) {
      if (form.carousel_cards.length < 2) return setError('Carousel needs at least 2 cards');
      if (form.carousel_cards.some(c => !c.body.trim())) return setError('All carousel cards need body text');
    } else {
      if (!form.body.trim()) return setError('Body text is required');
    }
    setLoading(true);
    try {
      const d = await api('/', { method: 'POST', body: JSON.stringify(form) });
      setTemplates(prev => [d.template, ...prev]);
      setView('list'); setForm(BLANK_TPL);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function handleRefresh(tpl) {
    setRefreshing(r => ({ ...r, [tpl.id]: true }));
    try {
      const d = await api(`/${tpl.id}/refresh`);
      setTemplates(prev => prev.map(t => t.id === tpl.id ? d.template : t));
    } catch (e) { setError(e.message); }
    finally { setRefreshing(r => ({ ...r, [tpl.id]: false })); }
  }

  async function deleteTpl(tpl) {
    if (!confirm(`Delete template "${tpl.name}"?`)) return;
    try {
      await api(`/${tpl.id}`, { method: 'DELETE' });
      setTemplates(prev => prev.filter(t => t.id !== tpl.id));
    } catch (e) { setError(e.message); }
  }

  async function saveConfig() {
    setLoading(true);
    try {
      const d = await api(`/${selected.id}/product-config`, { method: 'PUT', body: JSON.stringify(productConfig) });
      setTemplates(prev => prev.map(t => t.id === selected.id ? d.template : t));
      setView('list');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  function openConfig(tpl) {
    setSelected(tpl);
    if (tpl.is_carousel) {
      setProductConfig(tpl.product_config || {
        cards: tpl.carousel_cards.map(c => ({
          image_id: c.image_id || '', header_media_id: c.header_media_id || '',
          source: c.source || 'manual', title: '', price: '', link: '',
        })),
      });
    } else {
      setProductConfig(tpl.product_config || {
        header_image_id: '',
        products: [{ title: '', price: '', link: '', image_id: '' }],
        var_map: extractVars(tpl.body).reduce((a, v) => ({ ...a, [v]: '' }), {}),
        custom_values: {},
      });
    }
    loadGallery();
    setView('config');
  }

  function openCreate() {
    setView('create'); setError('');
    setForm(BLANK_TPL);
    loadGallery();
  }

  function copyName(name) {
    navigator.clipboard.writeText(name);
    setCopied(name); setTimeout(() => setCopied(null), 1500);
  }

  if (view === 'create') return (
    <CreateView
      form={form} setForm={setForm} error={error} setError={setError}
      loading={loading} onSubmit={submitTemplate} onBack={() => { setView('list'); setError(''); }}
      galleries={galleries} galleryImages={galleryImages} loadFolderImages={loadFolderImages}
    />
  );

  if (view === 'config') return (
    <ConfigView
      tpl={selected} config={productConfig} setConfig={setProductConfig}
      galleries={galleries} galleryImages={galleryImages} loadFolderImages={loadFolderImages}
      error={error} loading={loading} onSave={saveConfig}
      onBack={() => { setView('list'); setError(''); }}
    />
  );

  // ── LIST ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white text-xl font-bold">Meta Templates</h1>
          <p className="text-slate-400 text-sm mt-0.5">Create, submit for approval, configure product data</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-xl text-sm font-medium">
          <Plus size={16} /> New Template
        </button>
      </div>

      {error && <ErrorBar msg={error} onClose={() => setError('')} />}
      {loading && templates.length === 0 && <p className="text-slate-400 text-sm">Loading...</p>}
      {templates.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
          <FileText size={48} className="opacity-20" />
          <p>No templates yet. Create your first Meta template.</p>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {templates.map(tpl => {
          const sc = STATUS_CONFIG[tpl.meta_status] || STATUS_CONFIG['DRAFT'];
          const Icon = sc.icon;
          const assignedCards = tpl.product_config?.cards?.filter(c => c.title || c.image_id) || [];
          const autoProducts  = tpl.product_config?.auto_products || [];
          return (
            <div key={tpl.id} className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 hover:border-white/20 transition-all">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-semibold font-mono">{tpl.name}</span>
                    <button onClick={() => copyName(tpl.name)} className="text-slate-500 hover:text-slate-300">
                      {copied === tpl.name ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                    </button>
                    <span className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-medium ${sc.bg} ${sc.color}`}>
                      <Icon size={11} /> {sc.label}
                    </span>
                    {tpl.is_carousel && (
                      <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border bg-purple-500/10 border-purple-500/20 text-purple-400">
                        <LayoutGrid size={11} /> Carousel ({tpl.carousel_cards?.length} cards)
                      </span>
                    )}
                    {tpl.auto_product_mode && (
                      <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border bg-orange-500/10 border-orange-500/20 text-orange-400">
                        <Flame size={11} /> Auto-Products
                      </span>
                    )}
                    <span className="text-xs text-slate-500 bg-white/5 px-2 py-0.5 rounded-full">{tpl.category}</span>
                  </div>

                  <p className="text-slate-400 text-sm mt-2 line-clamp-1">
                    {tpl.is_carousel ? `Carousel: ${tpl.carousel_cards?.length || 0} cards — ${tpl.body || tpl.carousel_cards?.[0]?.body || ''}` : tpl.body}
                  </p>

                  {/* Mini product preview strip */}
                  {assignedCards.length > 0 && (
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {assignedCards.slice(0, 5).map((card, i) => (
                        <div key={i} className="flex items-center gap-1.5 bg-white/5 rounded-lg px-2 py-1">
                          {card.image_id
                            ? <img src={`/api/gallery/images/${card.image_id}/preview`} alt="" className="w-5 h-5 object-cover rounded" />
                            : card._hot_image_url
                              ? <img src={card._hot_image_url} alt="" className="w-5 h-5 object-cover rounded" onError={e => e.target.style.display='none'} />
                              : <Image size={12} className="text-slate-500" />
                          }
                          <span className="text-xs text-slate-300 max-w-24 truncate">{card.title || `Card ${i+1}`}</span>
                          {card.price && <span className="text-xs text-green-400">{card.price}</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Auto-refresh info */}
                  {tpl.product_config?.last_auto_refresh && (
                    <p className="text-xs text-orange-400/70 mt-1.5 flex items-center gap-1">
                      <RefreshCw size={10} /> Auto-updated: {new Date(tpl.product_config.last_auto_refresh).toLocaleString()}
                    </p>
                  )}

                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {tpl.product_config && !assignedCards.length && <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle2 size={11} /> Config saved</span>}
                    {tpl.rejected_reason && <span className="text-xs text-red-400">Rejected: {tpl.rejected_reason}</span>}
                    {tpl.meta_error && <span className="text-xs text-red-400 font-mono truncate max-w-xs">{tpl.meta_error}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => handleRefresh(tpl)} disabled={refreshing[tpl.id]}
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white disabled:opacity-50" title="Refresh status from Meta">
                    <RefreshCw size={14} className={refreshing[tpl.id] ? 'animate-spin' : ''} />
                  </button>
                  {tpl.meta_status === 'APPROVED' && (
                    <button onClick={() => openConfig(tpl)}
                      className="flex items-center gap-1.5 text-xs bg-green-600/20 hover:bg-green-600/40 border border-green-600/30 text-green-400 px-3 py-1.5 rounded-lg">
                      <Settings2 size={13} /> Configure
                    </button>
                  )}
                  <button onClick={() => deleteTpl(tpl)} className="p-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-400">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── CREATE VIEW ───────────────────────────────────────────────────────────────
function CreateView({ form, setForm, error, setError, loading, onSubmit, onBack, galleries, galleryImages, loadFolderImages }) {
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const [selFolder, setSelFolder] = useState('');
  const [pickerCard, setPickerCard] = useState(null);
  const [hotProducts, setHotProducts] = useState([]);
  const [hotLoading, setHotLoading] = useState(false);

  async function loadHotProducts() {
    if (hotProducts.length > 0) return;
    setHotLoading(true);
    try {
      const d = await fetch(`${BASE}/hot-products?limit=6`, { headers: CH() }).then(r => r.json());
      setHotProducts(d.products || []);
    } catch (_) {}
    finally { setHotLoading(false); }
  }

  function addVar(field) {
    const vars = extractVars(form[field]);
    const next = vars.length ? Math.max(...vars.map(Number)) + 1 : 1;
    f(field, form[field] + ` {{${next}}}`);
  }

  function addCardVar(idx) {
    const cards = [...form.carousel_cards];
    const vars = extractVars(cards[idx].body);
    const next = vars.length ? Math.max(...vars.map(Number)) + 1 : 1;
    cards[idx] = { ...cards[idx], body: cards[idx].body + ` {{${next}}}` };
    f('carousel_cards', cards);
  }

  function updateCard(idx, key, val) {
    const cards = [...form.carousel_cards];
    cards[idx] = { ...cards[idx], [key]: val };
    f('carousel_cards', cards);
  }

  function setCardSource(idx, source) {
    updateCard(idx, 'source', source);
    if (source === 'auto') loadHotProducts();
  }

  function setCardVarMap(idx, varNum, fieldValue) {
    const cards = [...form.carousel_cards];
    cards[idx] = { ...cards[idx], var_map: { ...(cards[idx].var_map || {}), [varNum]: fieldValue } };
    f('carousel_cards', cards);
  }

  function addCard() {
    if (form.carousel_cards.length >= 10) return;
    f('carousel_cards', [...form.carousel_cards, { ...BLANK_CARD }]);
  }

  function removeCard(idx) {
    if (form.carousel_cards.length <= 2) return;
    f('carousel_cards', form.carousel_cards.filter((_, i) => i !== idx));
  }

  function addCardButton(idx, type) {
    const cards = [...form.carousel_cards];
    const card = { ...cards[idx] };
    if ((card.buttons || []).length >= 2) return;
    card.buttons = [...(card.buttons || []),
      type === 'URL' ? { type: 'URL', text: 'Buy Now', url: 'https://yourstore.com/{{3}}' }
                     : { type: 'QUICK_REPLY', text: 'View More' }];
    cards[idx] = card;
    f('carousel_cards', cards);
  }

  function removeCardButton(cardIdx, btnIdx) {
    const cards = [...form.carousel_cards];
    cards[cardIdx] = { ...cards[cardIdx], buttons: cards[cardIdx].buttons.filter((_, i) => i !== btnIdx) };
    f('carousel_cards', cards);
  }

  function selectCardImage(cardIdx, img) {
    const cards = [...form.carousel_cards];
    cards[cardIdx] = { ...cards[cardIdx], image_id: img.id, header_media_id: img.media_id || '' };
    f('carousel_cards', cards);
    setPickerCard(null);
  }

  function assignHotProduct(cardIdx, hot) {
    const cards = [...form.carousel_cards];
    cards[cardIdx] = { ...cards[cardIdx], source: 'auto', _hot_preview: hot };
    f('carousel_cards', cards);
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-slate-400 hover:text-white"><X size={20} /></button>
        <h1 className="text-white text-xl font-bold">Create Meta Template</h1>
      </div>
      {error && <ErrorBar msg={error} onClose={() => setError('')} />}

      <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 flex flex-col gap-5">

        {/* Name / Category / Language */}
        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-slate-400 text-xs font-medium">Template Name *</label>
            <input value={form.name} onChange={e => f('name', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
              placeholder="product_catalog_v1" className="input text-sm font-mono" />
            <p className="text-slate-600 text-xs">lowercase + underscores only</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-slate-400 text-xs font-medium">Category</label>
            <select value={form.category} onChange={e => f('category', e.target.value)} className="input text-sm">
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-slate-400 text-xs font-medium">Language</label>
            <select value={form.language} onChange={e => f('language', e.target.value)} className="input text-sm">
              {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
        </div>

        {/* Template Type Toggle */}
        <div className="flex flex-col gap-2">
          <label className="text-slate-400 text-xs font-medium">Template Type</label>
          <div className="flex gap-2">
            <button onClick={() => f('is_carousel', false)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm border font-medium transition-all ${!form.is_carousel ? 'bg-green-600/20 border-green-600/40 text-green-400' : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20'}`}>
              <FileText size={15} /> Standard Message
            </button>
            <button onClick={() => f('is_carousel', true)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm border font-medium transition-all ${form.is_carousel ? 'bg-purple-600/20 border-purple-600/40 text-purple-400' : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20'}`}>
              <LayoutGrid size={15} /> Carousel / Catalog
            </button>
          </div>
        </div>

        {/* ── CAROUSEL BUILDER ─────────────────────────────────────────────── */}
        {form.is_carousel && (
          <>
            {/* Auto-product mode toggle */}
            <div className="flex items-center justify-between bg-orange-500/5 border border-orange-500/20 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2">
                <Flame size={15} className="text-orange-400" />
                <div>
                  <p className="text-white text-sm font-medium">Auto-Product Mode</p>
                  <p className="text-slate-500 text-xs">Daily cron auto-fills cards with trending + abandoned products from your store</p>
                </div>
              </div>
              <label className="toggle-switch">
                <input type="checkbox" checked={form.auto_product_mode} onChange={e => f('auto_product_mode', e.target.checked)} />
                <span className="toggle-slider" />
              </label>
            </div>

            {/* Intro body (optional) */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-slate-400 text-xs font-medium">
                  Intro Message <span className="text-slate-600">(optional — shown above carousel)</span>
                </label>
                <button onClick={() => addVar('body')} className="var-btn">+ Var</button>
              </div>
              <input value={form.body} onChange={e => f('body', e.target.value)}
                placeholder="Check out our latest collection! 🛍️" className="input text-sm" />
            </div>

            {/* Cards */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="text-white font-medium text-sm">
                  Carousel Cards <span className="text-slate-500 font-normal text-xs">({form.carousel_cards.length}/10 — min 2)</span>
                </label>
                {form.carousel_cards.length < 10 && (
                  <button onClick={addCard} className="var-btn"><Plus size={12} className="inline mr-1" />Add Card</button>
                )}
              </div>

              {/* Horizontal preview */}
              <CarouselPreview cards={form.carousel_cards} />

              {/* Card editors */}
              <div className="flex flex-col gap-4">
                {form.carousel_cards.map((card, idx) => (
                  <CarouselCardEditor
                    key={idx} card={card} idx={idx}
                    totalCards={form.carousel_cards.length}
                    hotProducts={hotProducts} hotLoading={hotLoading}
                    galleries={galleries} galleryImages={galleryImages}
                    pickerCard={pickerCard}
                    selFolder={selFolder}
                    onSetSelFolder={setSelFolder}
                    loadFolderImages={loadFolderImages}
                    onSetPickerCard={setPickerCard}
                    loadHotProducts={loadHotProducts}
                    onUpdateCard={updateCard}
                    onSetSource={(source) => setCardSource(idx, source)}
                    onSetVarMap={(varNum, val) => setCardVarMap(idx, varNum, val)}
                    onAddVar={() => addCardVar(idx)}
                    onRemoveCard={() => removeCard(idx)}
                    onAddButton={(type) => addCardButton(idx, type)}
                    onRemoveButton={(bi) => removeCardButton(idx, bi)}
                    onUpdateButton={(bi, key, val) => {
                      const cards = [...form.carousel_cards];
                      cards[idx].buttons[bi] = { ...cards[idx].buttons[bi], [key]: val };
                      f('carousel_cards', cards);
                    }}
                    onSelectImage={(img) => selectCardImage(idx, img)}
                    onAssignHotProduct={(hot) => assignHotProduct(idx, hot)}
                  />
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── STANDARD BUILDER ─────────────────────────────────────────────── */}
        {!form.is_carousel && (
          <>
            <div className="flex flex-col gap-2">
              <label className="text-slate-400 text-xs font-medium">Header</label>
              <div className="flex gap-2">
                {['NONE', 'IMAGE', 'TEXT'].map(t => (
                  <button key={t} onClick={() => f('header_type', t)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${form.header_type === t ? 'bg-green-600/20 border-green-600/40 text-green-400' : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20'}`}>
                    {t === 'IMAGE' && <Image size={11} className="inline mr-1" />}
                    {t === 'TEXT'  && <Type  size={11} className="inline mr-1" />}
                    {t}
                  </button>
                ))}
              </div>
              {form.header_type === 'TEXT' && (
                <div className="flex gap-2 items-end">
                  <input value={form.header_text} onChange={e => f('header_text', e.target.value)}
                    placeholder="Header with {{1}}" className="input text-sm flex-1" />
                  <button onClick={() => { const v = extractVars(form.header_text); f('header_text', form.header_text + ` {{${v.length ? Math.max(...v.map(Number)) + 1 : 1}}}`); }} className="var-btn">+ Var</button>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-slate-400 text-xs font-medium">Body * <span className="text-slate-600">use {`{{1}}`} {`{{2}}`} for variables</span></label>
                <button onClick={() => addVar('body')} className="var-btn">+ Add Variable</button>
              </div>
              <textarea value={form.body} onChange={e => f('body', e.target.value)}
                placeholder={"Hi {{1}}! 👋 Check out {{2}} for ₹{{3}}."} rows={4} className="input text-sm resize-none" />
              <p className="text-xs text-slate-600">{form.body.length}/1024</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-slate-400 text-xs font-medium">Footer <span className="text-slate-600">(optional)</span></label>
              <input value={form.footer} onChange={e => f('footer', e.target.value)}
                placeholder="Reply STOP to unsubscribe" className="input text-sm" />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-slate-400 text-xs font-medium">Buttons <span className="text-slate-600">(max 3)</span></label>
                {form.buttons.length < 3 && (
                  <div className="flex gap-1.5">
                    <button onClick={() => f('buttons', [...form.buttons, { type: 'URL', text: 'Shop Now', url: 'https://yourstore.com/' }])} className="var-btn"><Link size={11} className="inline mr-1" />URL</button>
                    <button onClick={() => f('buttons', [...form.buttons, { type: 'QUICK_REPLY', text: 'View' }])} className="var-btn"><Zap size={11} className="inline mr-1" />Quick Reply</button>
                  </div>
                )}
              </div>
              {form.buttons.map((btn, i) => (
                <div key={i} className="flex gap-2 items-center bg-white/5 rounded-xl p-2.5">
                  <span className="text-xs text-slate-500 w-20 shrink-0">{btn.type}</span>
                  <input value={btn.text} onChange={e => { const b = [...form.buttons]; b[i] = { ...b[i], text: e.target.value }; f('buttons', b); }} placeholder="Label" className="input text-xs flex-1" />
                  {btn.type === 'URL' && (
                    <input value={btn.url} onChange={e => { const b = [...form.buttons]; b[i] = { ...b[i], url: e.target.value }; f('buttons', b); }} placeholder="https://..." className="input text-xs flex-1 font-mono" />
                  )}
                  <button onClick={() => f('buttons', form.buttons.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300"><X size={13} /></button>
                </div>
              ))}
            </div>

            <StandardPreview form={form} />
          </>
        )}

        <div className="flex gap-3 pt-2 border-t border-white/10">
          <button onClick={onBack} className="px-5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-sm">Cancel</button>
          <button onClick={onSubmit} disabled={loading}
            className="flex items-center gap-2 px-6 py-2 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-medium">
            <Send size={14} /> {loading ? 'Submitting to Meta...' : 'Submit to Meta for Approval'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CAROUSEL CARD EDITOR ──────────────────────────────────────────────────────
function CarouselCardEditor({
  card, idx, totalCards,
  hotProducts, hotLoading, galleries, galleryImages,
  pickerCard, selFolder,
  onSetSelFolder, loadFolderImages, onSetPickerCard,
  loadHotProducts, onUpdateCard, onSetSource, onSetVarMap,
  onAddVar, onRemoveCard, onAddButton, onRemoveButton,
  onUpdateButton, onSelectImage, onAssignHotProduct,
}) {
  const source = card.source || 'manual';
  const bodyVars = extractVars(card.body);

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
      {/* Card header */}
      <div className="flex items-center justify-between">
        <span className="text-purple-400 text-xs font-semibold flex items-center gap-2">
          <LayoutGrid size={12} /> Card {idx + 1}
        </span>
        {totalCards > 2 && (
          <button onClick={onRemoveCard} className="text-red-400 hover:text-red-300 p-1"><X size={13} /></button>
        )}
      </div>

      {/* Example image picker */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-slate-500 text-xs flex items-center gap-1">
            <ImagePlus size={11} /> Example Image <span className="text-slate-600 ml-1">(sent to Meta for review)</span>
          </label>
          <button
            onClick={() => {
              onSetPickerCard(pickerCard === idx ? null : idx);
              if (pickerCard !== idx && galleries.length > 0) {
                onSetSelFolder(galleries[0].id);
                loadFolderImages(galleries[0].id);
              }
            }}
            className="var-btn flex items-center gap-1">
            <Image size={11} /> {card.image_id ? 'Change' : 'Gallery'}
          </button>
        </div>

        {card.image_id && (
          <div className="flex items-center gap-2">
            <img src={`/api/gallery/images/${card.image_id}/preview`} alt=""
              className="w-16 h-16 object-cover rounded-xl border border-purple-500/30" />
            <p className="text-green-400 text-xs flex items-center gap-1"><CheckCircle2 size={10} /> Image set for Meta</p>
          </div>
        )}

        {pickerCard === idx && (
          <InlineGalleryPicker
            galleries={galleries} galleryImages={galleryImages}
            selectedId={card.image_id} selFolder={selFolder}
            onSelectFolder={id => { onSetSelFolder(id); loadFolderImages(id); }}
            onSelect={onSelectImage}
            accentColor="purple"
          />
        )}
      </div>

      {/* Product Source Tabs */}
      <div className="flex flex-col gap-2">
        <label className="text-slate-500 text-xs font-medium">Product Source</label>
        <div className="flex gap-1 bg-white/5 rounded-xl p-1">
          {[
            { key: 'manual', label: 'Manual', icon: Type },
            { key: 'url',    label: 'URL Scrape', icon: Globe },
            { key: 'auto',   label: 'Auto-detect', icon: Sparkles },
          ].map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => onSetSource(key)}
              className={`flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-lg font-medium transition-all ${source === key ? (key === 'auto' ? 'bg-orange-600/30 text-orange-300 border border-orange-500/30' : 'bg-purple-600/20 text-purple-300 border border-purple-500/20') : 'text-slate-500 hover:text-slate-300'}`}>
              <Icon size={11} /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* URL Scrape mode */}
      {source === 'url' && (
        <ScrapeUrlInput
          initialUrl={card.scrape_url}
          onUrlChange={url => onUpdateCard(idx, 'scrape_url', url)}
          onFill={(s) => {
            if (s.title) onUpdateCard(idx, '_scraped_title', s.title);
            if (s.price) onUpdateCard(idx, '_scraped_price', s.price);
          }}
        />
      )}

      {/* Auto mode */}
      {source === 'auto' && (
        <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-orange-400 text-xs font-medium flex items-center gap-1">
              <Flame size={11} /> Top {idx + 1} trending product from your store
            </p>
            <button onClick={loadHotProducts} className="text-slate-500 hover:text-slate-300">
              <RefreshCw size={12} className={hotLoading ? 'animate-spin' : ''} />
            </button>
          </div>
          {hotLoading && <p className="text-slate-500 text-xs">Analyzing your store data...</p>}
          {!hotLoading && hotProducts.length === 0 && (
            <p className="text-slate-500 text-xs">No product data yet — will use catalog products. Data builds up as visitors browse your store.</p>
          )}
          {hotProducts.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-slate-500 text-xs mb-1">Select which hot product to assign to this card:</p>
              {hotProducts.slice(0, 5).map((hot, hi) => (
                <button key={hi} onClick={() => onAssignHotProduct(hot)}
                  className={`flex items-center gap-2 p-2 rounded-lg text-left transition-all border ${card._hot_preview?.url === hot.url ? 'border-orange-500/50 bg-orange-500/10' : 'border-white/5 bg-white/5 hover:border-orange-500/30'}`}>
                  {hot.image
                    ? <img src={hot.image} alt="" className="w-10 h-10 object-cover rounded-lg shrink-0" onError={e => e.target.style.display='none'} />
                    : <div className="w-10 h-10 bg-white/5 rounded-lg shrink-0 flex items-center justify-center"><Image size={14} className="text-slate-600" /></div>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs truncate">{hot.name}</p>
                    <p className="text-green-400 text-xs">{hot.price}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {hot.views > 0 && <span className="text-slate-500 text-xs flex items-center gap-0.5"><Eye size={9} />{hot.views} views</span>}
                      {hot.carts > 0 && <span className="text-orange-400 text-xs flex items-center gap-0.5"><ShoppingCart size={9} />{hot.carts} abandoned</span>}
                    </div>
                  </div>
                  <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full shrink-0">#{hi + 1}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Body text */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-slate-500 text-xs">Body Text *</label>
          <button onClick={onAddVar} className="var-btn">+ Var</button>
        </div>
        <textarea value={card.body} onChange={e => onUpdateCard(idx, 'body', e.target.value)}
          placeholder={"{{1}}\n₹{{2}}"} rows={3} className="input text-sm resize-none" />
      </div>

      {/* Variable Mapping */}
      {bodyVars.length > 0 && (
        <div className="flex flex-col gap-2 bg-green-500/5 border border-green-500/15 rounded-xl p-3">
          <label className="text-green-400 text-xs font-medium flex items-center gap-1"><Sparkles size={11} /> Variable Mapping</label>
          <p className="text-slate-500 text-xs -mt-1">Tell the system what each variable represents for dynamic sending</p>
          {bodyVars.map(v => (
            <div key={v} className="flex items-center gap-2">
              <span className="text-green-400 font-mono text-xs w-12 shrink-0">{`{{${v}}}`}</span>
              <select
                value={(card.var_map || {})[v] || ''}
                onChange={e => onSetVarMap(v, e.target.value)}
                className="input text-xs flex-1">
                <option value="">— Select meaning —</option>
                {VAR_FIELD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {(card.var_map || {})[v] === 'custom' && (
                <input
                  placeholder="Fixed text"
                  value={(card.var_map || {})[`${v}_custom`] || ''}
                  onChange={e => onSetVarMap(`${v}_custom`, e.target.value)}
                  className="input text-xs flex-1"
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Buttons */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-slate-500 text-xs">Buttons <span className="text-slate-600">(max 2)</span></label>
          {(card.buttons || []).length < 2 && (
            <div className="flex gap-1">
              <button onClick={() => onAddButton('URL')} className="var-btn"><Link size={10} className="inline mr-1" />URL</button>
              <button onClick={() => onAddButton('QUICK_REPLY')} className="var-btn"><Zap size={10} className="inline mr-1" />Reply</button>
            </div>
          )}
        </div>
        {(card.buttons || []).map((btn, bi) => (
          <div key={bi} className="flex gap-2 items-center">
            <span className="text-xs text-slate-500 w-14 shrink-0">{btn.type === 'URL' ? 'URL' : 'Reply'}</span>
            <input value={btn.text} onChange={e => onUpdateButton(bi, 'text', e.target.value)} placeholder="Button label" className="input text-xs flex-1" />
            {btn.type === 'URL' && (
              <input value={btn.url} onChange={e => onUpdateButton(bi, 'url', e.target.value)} placeholder="https://... or {{3}}" className="input text-xs flex-1 font-mono" />
            )}
            <button onClick={() => onRemoveButton(bi)} className="text-red-400 hover:text-red-300"><X size={13} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── CONFIG VIEW ───────────────────────────────────────────────────────────────
function ConfigView({ tpl, config, setConfig, galleries, galleryImages, loadFolderImages, error, loading, onSave, onBack }) {
  const set = (k, v) => setConfig(p => ({ ...p, [k]: v }));
  const [selFolder, setSelFolder]     = useState('');
  const [activeCard, setActiveCard]   = useState(0);
  const [hotProducts, setHotProducts] = useState([]);
  const [hotLoading, setHotLoading]   = useState(false);
  const [autoRefreshing, setAutoRefreshing] = useState(false);

  const isCarousel = tpl.is_carousel;

  useEffect(() => {
    if (isCarousel) loadHotProducts();
  }, []);

  async function loadHotProducts() {
    setHotLoading(true);
    try {
      const d = await fetch(`${BASE}/hot-products?limit=6`, { headers: CH() }).then(r => r.json());
      setHotProducts(d.products || []);
    } catch (_) {}
    finally { setHotLoading(false); }
  }

  async function triggerAutoRefresh() {
    setAutoRefreshing(true);
    try {
      const d = await api(`/${tpl.id}/refresh-auto`, { method: 'POST' });
      setConfig(d.template.product_config || config);
      setHotProducts(d.hot_products || []);
    } catch (e) { console.error(e); }
    finally { setAutoRefreshing(false); }
  }

  function setCardField(idx, key, val) {
    const cards = [...(config.cards || [])];
    cards[idx] = { ...cards[idx], [key]: val };
    set('cards', cards);
  }

  function assignHotProductToCard(cardIdx, hot) {
    const cards = [...(config.cards || [])];
    cards[cardIdx] = {
      ...cards[cardIdx],
      title: hot.name,
      price: hot.price,
      link:  hot.url,
      _hot_image_url: hot.image,
      _hot_score: hot.score,
    };
    set('cards', cards);
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-slate-400 hover:text-white"><X size={20} /></button>
        <div>
          <h1 className="text-white text-xl font-bold">Configure Products</h1>
          <p className="text-slate-400 text-sm font-mono">{tpl.name} {isCarousel && <span className="text-purple-400">· Carousel</span>}</p>
        </div>
      </div>
      {error && <ErrorBar msg={error} />}

      <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 flex flex-col gap-6">

        {/* ── CAROUSEL CONFIG ──────────────────────────────────────────────── */}
        {isCarousel && (
          <>
            {/* Carousel preview */}
            <div>
              <label className="text-white font-medium text-sm mb-3 block">Carousel Preview</label>
              <CarouselConfigPreview cards={config.cards || []} />
            </div>

            {/* Hot products panel */}
            <div className="bg-orange-500/5 border border-orange-500/20 rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Flame size={15} className="text-orange-400" />
                  <div>
                    <p className="text-white text-sm font-medium">Hot Products (Trending + Abandoned)</p>
                    <p className="text-slate-500 text-xs">Click any product to assign it to the active card</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {tpl.auto_product_mode && (
                    <button onClick={triggerAutoRefresh} disabled={autoRefreshing}
                      className="flex items-center gap-1.5 text-xs bg-orange-600/20 hover:bg-orange-600/40 border border-orange-500/30 text-orange-400 px-3 py-1.5 rounded-lg disabled:opacity-50">
                      <RefreshCw size={12} className={autoRefreshing ? 'animate-spin' : ''} />
                      {autoRefreshing ? 'Refreshing...' : 'Auto-refresh now'}
                    </button>
                  )}
                  <button onClick={loadHotProducts} disabled={hotLoading} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400">
                    <RefreshCw size={13} className={hotLoading ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>

              {hotLoading && <p className="text-slate-500 text-xs">Analyzing store data...</p>}
              {!hotLoading && hotProducts.length === 0 && (
                <p className="text-slate-500 text-xs">No data yet. Products appear here as visitors browse and abandon carts on your store.</p>
              )}
              {hotProducts.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {hotProducts.map((hot, i) => (
                    <button key={i} onClick={() => assignHotProductToCard(activeCard, hot)}
                      className="shrink-0 w-36 bg-white/5 hover:bg-orange-500/10 border border-white/10 hover:border-orange-500/30 rounded-xl overflow-hidden transition-all text-left">
                      <div className="w-full h-20 overflow-hidden bg-white/5">
                        {hot.image
                          ? <img src={hot.image} alt="" className="w-full h-full object-cover" onError={e => e.target.style.display='none'} />
                          : <div className="w-full h-full flex items-center justify-center"><Image size={16} className="text-slate-600" /></div>
                        }
                      </div>
                      <div className="p-2">
                        <p className="text-white text-xs truncate font-medium">{hot.name}</p>
                        {hot.price && <p className="text-green-400 text-xs">{hot.price}</p>}
                        <div className="flex items-center gap-1 mt-1">
                          {hot.carts > 0 && <span className="text-orange-400 text-xs flex items-center gap-0.5"><ShoppingCart size={8}/>{hot.carts}</span>}
                          {hot.views > 0 && <span className="text-slate-500 text-xs flex items-center gap-0.5"><Eye size={8}/>{hot.views}</span>}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {config.cards?.[activeCard] && (
                <p className="text-slate-500 text-xs">Clicking assigns to Card {activeCard + 1}. Switch card tabs below to assign others.</p>
              )}
            </div>

            {/* Card tabs */}
            <div>
              <div className="flex gap-2 flex-wrap mb-4">
                {(config.cards || []).map((c, i) => (
                  <button key={i} onClick={() => setActiveCard(i)}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium ${activeCard === i ? 'bg-purple-600/20 border-purple-600/40 text-purple-400' : 'bg-white/5 border-white/10 text-slate-400'}`}>
                    Card {i + 1} {c.image_id || c.title ? '✓' : ''}
                  </button>
                ))}
              </div>

              {(config.cards || []).map((card, i) => i !== activeCard ? null : (
                <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <p className="text-purple-400 text-xs font-semibold">Card {i + 1} of {config.cards.length}</p>
                    {card._hot_score !== undefined && (
                      <span className="text-xs text-orange-400 flex items-center gap-1">
                        <Flame size={10} /> Hot score: {card._hot_score}
                      </span>
                    )}
                  </div>

                  {/* URL scrape */}
                  <ScrapeUrlInput onFill={(s) => {
                    if (s.title) setCardField(i, 'title', s.title);
                    if (s.price) setCardField(i, 'price', s.price);
                  }} />

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-slate-500 text-xs">Product Title</label>
                      <input value={card.title || ''} onChange={e => setCardField(i, 'title', e.target.value)}
                        placeholder="Blue Cotton Kurti" className="input text-sm" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-slate-500 text-xs">Price</label>
                      <input value={card.price || ''} onChange={e => setCardField(i, 'price', e.target.value)}
                        placeholder="₹799" className="input text-sm" />
                    </div>
                    <div className="col-span-2 flex flex-col gap-1.5">
                      <label className="text-slate-500 text-xs">Product Link</label>
                      <input value={card.link || ''} onChange={e => setCardField(i, 'link', e.target.value)}
                        placeholder="https://yourstore.com/product/..." className="input text-sm font-mono" />
                    </div>
                  </div>

                  {/* Hot product image preview */}
                  {!card.image_id && card._hot_image_url && (
                    <div className="flex items-center gap-3 bg-orange-500/5 border border-orange-500/20 rounded-xl p-3">
                      <img src={card._hot_image_url} alt="" className="w-14 h-14 object-cover rounded-lg"
                        onError={e => e.target.parentElement.style.display='none'} />
                      <div>
                        <p className="text-orange-400 text-xs font-medium">Auto-detected image URL</p>
                        <p className="text-slate-500 text-xs">Upload to Gallery and select below to use as WhatsApp card image</p>
                      </div>
                    </div>
                  )}

                  {/* Gallery image picker */}
                  <div className="flex flex-col gap-2">
                    <label className="text-slate-500 text-xs">Card Image <span className="text-slate-600">(from Gallery)</span></label>
                    <GalleryPicker
                      galleries={galleries} galleryImages={galleryImages}
                      selectedId={card.image_id} selFolder={selFolder}
                      onSelectFolder={id => { setSelFolder(id); loadFolderImages(id); }}
                      onSelect={img => { setCardField(i, 'image_id', img.id); setCardField(i, 'header_media_id', img.media_id || ''); }}
                    />
                    {card.image_id && (
                      <img src={`/api/gallery/images/${card.image_id}/preview`} alt=""
                        className="w-28 h-28 object-cover rounded-xl border border-white/10" />
                    )}
                  </div>

                  <div className="flex gap-2 pt-2">
                    {i > 0 && <button onClick={() => setActiveCard(i - 1)} className="var-btn flex items-center gap-1"><ChevronLeft size={12} />Prev</button>}
                    {i < (config.cards.length - 1) && <button onClick={() => setActiveCard(i + 1)} className="var-btn flex items-center gap-1">Next<ChevronRight size={12} /></button>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── STANDARD CONFIG ──────────────────────────────────────────────── */}
        {!isCarousel && (
          <>
            {tpl.header_type === 'IMAGE' && (
              <div className="flex flex-col gap-3">
                <label className="text-white font-medium text-sm">Header Image</label>
                <GalleryPicker galleries={galleries} galleryImages={galleryImages} selectedId={config.header_image_id}
                  selFolder={selFolder} onSelectFolder={id => { setSelFolder(id); loadFolderImages(id); }}
                  onSelect={img => set('header_image_id', img.id)} />
                {config.header_image_id && <img src={`/api/gallery/images/${config.header_image_id}/preview`} alt="" className="w-32 h-32 object-cover rounded-xl border border-white/10" />}
              </div>
            )}
            {extractVars(tpl.body).length > 0 && (
              <div className="flex flex-col gap-3">
                <label className="text-white font-medium text-sm">Variable Mapping</label>
                {extractVars(tpl.body).map(v => (
                  <div key={v} className="flex items-center gap-3 bg-white/5 rounded-xl p-3">
                    <span className="text-green-400 font-mono text-sm w-12 shrink-0">{`{{${v}}}`}</span>
                    <select value={(config.var_map || {})[v] || ''} className="input text-sm flex-1"
                      onChange={e => set('var_map', { ...(config.var_map || {}), [v]: e.target.value })}>
                      <option value="">— Select —</option>
                      {VAR_FIELD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {(config.var_map || {})[v] === 'custom' && (
                      <input placeholder="Fixed value" className="input text-sm flex-1"
                        value={(config.custom_values || {})[v] || ''}
                        onChange={e => set('custom_values', { ...(config.custom_values || {}), [v]: e.target.value })} />
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="text-white font-medium text-sm">Products</label>
                <button onClick={() => set('products', [...(config.products || []), { title: '', price: '', link: '', image_id: '' }])} className="var-btn"><Plus size={12} className="inline mr-1" />Add</button>
              </div>
              {(config.products || []).map((prod, i) => (
                <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-xs">Product {i + 1}</span>
                    {(config.products || []).length > 1 && <button onClick={() => set('products', config.products.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300"><X size={13} /></button>}
                  </div>
                  <ScrapeUrlInput onFill={(s) => {
                    const a = [...config.products];
                    if (s.title) a[i] = { ...a[i], title: s.title };
                    if (s.price) a[i] = { ...a[i], price: s.price };
                    set('products', a);
                  }} />
                  <div className="grid grid-cols-2 gap-3">
                    <input value={prod.title} onChange={e => { const a = [...config.products]; a[i] = { ...a[i], title: e.target.value }; set('products', a); }} placeholder="Title" className="input text-sm" />
                    <input value={prod.price} onChange={e => { const a = [...config.products]; a[i] = { ...a[i], price: e.target.value }; set('products', a); }} placeholder="₹799" className="input text-sm" />
                    <div className="col-span-2"><input value={prod.link} onChange={e => { const a = [...config.products]; a[i] = { ...a[i], link: e.target.value }; set('products', a); }} placeholder="https://..." className="input text-sm font-mono" /></div>
                    <div className="col-span-2 flex flex-col gap-2">
                      <GalleryPicker galleries={galleries} galleryImages={galleryImages} selectedId={prod.image_id}
                        selFolder={selFolder} onSelectFolder={id => { setSelFolder(id); loadFolderImages(id); }}
                        onSelect={img => { const a = [...config.products]; a[i] = { ...a[i], image_id: img.id }; set('products', a); }} />
                      {prod.image_id && <img src={`/api/gallery/images/${prod.image_id}/preview`} alt="" className="w-20 h-20 object-cover rounded-xl border border-white/10" />}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="flex gap-3 pt-2 border-t border-white/10">
          <button onClick={onBack} className="px-5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-sm">Cancel</button>
          <button onClick={onSave} disabled={loading}
            className="flex items-center gap-2 px-6 py-2 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-medium">
            <CheckCircle2 size={14} /> {loading ? 'Saving...' : 'Save Config'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Auto-scrape URL input ─────────────────────────────────────────────────────
function ScrapeUrlInput({ onFill, initialUrl, onUrlChange }) {
  const [url, setUrl]         = useState(initialUrl || '');
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);
  const [err, setErr]         = useState('');

  async function handleFetch() {
    if (!url.trim()) return;
    setLoading(true); setErr(''); setResult(null);
    try {
      const res = await fetch(`${BASE}/scrape-product`, {
        method: 'POST',
        headers: { ...CH(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch');
      setResult(data);
      onFill(data);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 flex flex-col gap-2">
      <label className="text-blue-400 text-xs font-semibold flex items-center gap-1">
        <Globe size={11} /> Auto-fill from Product URL
        <span className="text-slate-500 font-normal ml-1">(Shopify, WooCommerce, any site)</span>
      </label>
      <div className="flex gap-2">
        <input
          value={url}
          onChange={e => { setUrl(e.target.value); onUrlChange?.(e.target.value); }}
          onKeyDown={e => e.key === 'Enter' && handleFetch()}
          placeholder="https://yourstore.myshopify.com/products/product-name"
          className="input text-xs font-mono flex-1"
        />
        <button onClick={handleFetch} disabled={loading || !url.trim()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/30 text-blue-400 text-xs font-medium disabled:opacity-50 shrink-0">
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Globe size={12} />}
          {loading ? 'Fetching…' : 'Fetch'}
        </button>
      </div>
      {err && <p className="text-red-400 text-xs">{err}</p>}
      {result && (
        <div className="flex items-start gap-3 mt-1 bg-blue-500/10 rounded-lg p-2">
          {result.image_url && (
            <img src={result.image_url} alt="" className="w-14 h-14 object-cover rounded-lg shrink-0"
              onError={e => e.target.style.display = 'none'} />
          )}
          <div className="flex-1 min-w-0">
            {result.title && <p className="text-white text-xs font-medium truncate">{result.title}</p>}
            {result.price && <p className="text-green-400 text-xs">{result.price}</p>}
            {result.description && <p className="text-slate-500 text-xs mt-0.5 line-clamp-2">{result.description}</p>}
            <p className="text-blue-400 text-xs mt-1 flex items-center gap-1"><CheckCircle2 size={10} /> Title &amp; price filled in fields above</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Inline Gallery Picker ─────────────────────────────────────────────────────
function InlineGalleryPicker({ galleries, galleryImages, selectedId, onSelectFolder, selFolder, onSelect, accentColor = 'green' }) {
  const ac = accentColor === 'purple'
    ? { active: 'bg-purple-600/20 border-purple-600/40 text-purple-400', sel: 'border-purple-500' }
    : { active: 'bg-green-600/20 border-green-600/40 text-green-400',   sel: 'border-green-500' };
  return (
    <div className="bg-[#0a1929] border border-white/10 rounded-xl p-3 flex flex-col gap-3">
      {galleries.length === 0
        ? <p className="text-slate-500 text-xs">No gallery folders. Upload images in Gallery section first.</p>
        : (
          <>
            <div className="flex gap-2 flex-wrap">
              {galleries.map(gf => (
                <button key={gf.id} onClick={() => onSelectFolder(gf.id)}
                  className={`text-xs px-3 py-1.5 rounded-lg border ${selFolder === gf.id ? ac.active : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20'}`}>
                  {gf.name} ({gf.imageCount})
                </button>
              ))}
            </div>
            {galleryImages.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {galleryImages.map(img => (
                  <button key={img.id} onClick={() => onSelect(img)}
                    className={`relative rounded-lg overflow-hidden border-2 transition-all ${selectedId === img.id ? ac.sel : 'border-transparent hover:border-white/30'}`}>
                    <img src={`/api/gallery/images/${img.id}/preview`} alt={img.name} className="w-16 h-16 object-cover" />
                    {selectedId === img.id && (
                      <div className="absolute inset-0 bg-green-500/30 flex items-center justify-center">
                        <Check size={16} className="text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
            {selFolder && galleryImages.length === 0 && <p className="text-slate-500 text-xs">No images in this folder.</p>}
          </>
        )
      }
    </div>
  );
}

// ── Carousel Preview (while building) ────────────────────────────────────────
function CarouselPreview({ cards }) {
  return (
    <div className="bg-[#0a1929] rounded-2xl p-4">
      <p className="text-slate-500 text-xs mb-3">Preview (scroll →)</p>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {cards.map((card, i) => {
          const preview = (card.body || '')
            .replace(/\{\{1\}\}/g, card._scraped_title || 'Blue Kurti')
            .replace(/\{\{2\}\}/g, card._scraped_price || '₹799')
            .replace(/\{\{(\d+)\}\}/g, (_, n) => `[Var${n}]`);
          const hot = card._hot_preview;
          return (
            <div key={i} className="shrink-0 w-44 bg-[#1a2a1a] rounded-2xl overflow-hidden border border-white/10">
              <div className="w-full h-28 overflow-hidden bg-purple-900/20">
                {card.image_id
                  ? <img src={`/api/gallery/images/${card.image_id}/preview`} alt="" className="w-full h-full object-cover" />
                  : hot?.image
                    ? <img src={hot.image} alt="" className="w-full h-full object-cover" onError={e => { e.target.style.display='none'; }} />
                    : <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                        <Image size={18} className="text-purple-400" />
                        <span className="text-purple-400 text-xs">{card.source === 'auto' ? '🔥 Auto' : `Card ${i + 1}`}</span>
                      </div>
                }
              </div>
              <div className="p-2.5">
                <p className="text-white text-xs whitespace-pre-wrap line-clamp-3">{hot ? `${hot.name}\n${hot.price}` : preview || 'Card body...'}</p>
                {(card.buttons || []).map((btn, bi) => (
                  <div key={bi} className="mt-1.5 border-t border-white/10 pt-1.5 text-center text-green-400 text-xs">{btn.text}</div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Carousel Config Preview ───────────────────────────────────────────────────
function CarouselConfigPreview({ cards }) {
  return (
    <div className="bg-[#0a1929] rounded-2xl p-4">
      <div className="flex gap-3 overflow-x-auto pb-2">
        {cards.map((card, i) => (
          <div key={i} className="shrink-0 w-44 bg-[#1a2a1a] rounded-2xl overflow-hidden border border-white/10">
            <div className="w-full h-28 bg-purple-900/20 overflow-hidden">
              {card.image_id
                ? <img src={`/api/gallery/images/${card.image_id}/preview`} alt="" className="w-full h-full object-cover" />
                : card._hot_image_url
                  ? <img src={card._hot_image_url} alt="" className="w-full h-full object-cover" onError={e => e.target.style.display='none'} />
                  : <div className="w-full h-full flex items-center justify-center"><Image size={20} className="text-slate-600" /></div>
              }
            </div>
            <div className="p-2.5">
              <p className="text-white text-xs font-medium truncate">{card.title || `Card ${i + 1}`}</p>
              {card.price && <p className="text-green-400 text-xs">{card.price}</p>}
              {card._hot_carts > 0 && <p className="text-orange-400 text-xs flex items-center gap-0.5 mt-0.5"><ShoppingCart size={9}/>{card._hot_carts} abandoned</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Standard Message Preview ──────────────────────────────────────────────────
function StandardPreview({ form }) {
  const preview = (form.body || '').replace(/\{\{1\}\}/g, 'Priya').replace(/\{\{2\}\}/g, 'Blue Kurti').replace(/\{\{3\}\}/g, '₹799').replace(/\{\{(\d+)\}\}/g, (_, n) => `[Var${n}]`);
  return (
    <div className="flex flex-col gap-2">
      <label className="text-slate-400 text-xs font-medium">Live Preview</label>
      <div className="bg-[#0a1929] rounded-2xl p-4 flex justify-center">
        <div className="w-64 bg-[#1a2a1a] rounded-2xl overflow-hidden">
          {form.header_type === 'IMAGE' && (
            <div className="w-full h-32 bg-green-900/30 flex items-center justify-center gap-2">
              <Image size={20} className="text-green-600" /><span className="text-green-600 text-xs">Image</span>
            </div>
          )}
          {form.header_type === 'TEXT' && form.header_text && (
            <div className="px-3 pt-3 font-bold text-white text-sm">{form.header_text.replace(/\{\{(\d+)\}\}/g, (_, n) => `[Var${n}]`)}</div>
          )}
          <div className="p-3">
            <p className="text-white text-sm whitespace-pre-wrap">{preview || 'Your message...'}</p>
            {form.footer && <p className="text-slate-500 text-xs mt-2">{form.footer}</p>}
            {form.buttons?.map((btn, i) => (
              <div key={i} className="mt-1.5 border-t border-white/10 pt-1.5 text-center text-green-400 text-xs py-1">{btn.text}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Gallery Picker ────────────────────────────────────────────────────────────
function GalleryPicker({ galleries, galleryImages, selectedId, onSelectFolder, selFolder, onSelect }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 flex-wrap">
        {galleries.length === 0 && <p className="text-slate-600 text-xs">No gallery folders. Upload in Gallery section first.</p>}
        {galleries.map(f => (
          <button key={f.id} onClick={() => onSelectFolder(f.id)}
            className={`text-xs px-3 py-1.5 rounded-lg border ${selFolder === f.id ? 'bg-green-600/20 border-green-600/40 text-green-400' : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20'}`}>
            {f.name} ({f.imageCount})
          </button>
        ))}
      </div>
      {galleryImages.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {galleryImages.map(img => (
            <button key={img.id} onClick={() => onSelect(img)}
              className={`relative rounded-xl overflow-hidden border-2 transition-all ${selectedId === img.id ? 'border-green-500' : 'border-transparent hover:border-white/30'}`}>
              <img src={`/api/gallery/images/${img.id}/preview`} alt={img.name} className="w-16 h-16 object-cover" />
              {selectedId === img.id && (
                <div className="absolute inset-0 bg-green-500/30 flex items-center justify-center"><Check size={16} className="text-white" /></div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Error Bar ─────────────────────────────────────────────────────────────────
function ErrorBar({ msg, onClose }) {
  return (
    <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl px-4 py-3 text-sm">
      <AlertCircle size={15} className="shrink-0" />
      <span className="flex-1">{msg}</span>
      {onClose && <button onClick={onClose} className="text-red-400 hover:text-red-300"><X size={14} /></button>}
    </div>
  );
}
