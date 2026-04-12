import { useEffect, useState } from "react";
import {
  Plus, Trash2, RefreshCw, CheckCircle2, Clock, XCircle,
  AlertCircle, Settings2, Send, Image, Type, Link,
  Zap, Copy, Check, FileText, X, LayoutGrid, ChevronLeft, ChevronRight,
  Globe, Loader2, ImagePlus
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
  { value: 'en', label: '🇺🇸 English' },
  { value: 'hi', label: '🇮🇳 Hindi' },
  { value: 'gu', label: '🇮🇳 Gujarati' },
  { value: 'ta', label: '🇮🇳 Tamil' },
  { value: 'te', label: '🇮🇳 Telugu' },
  { value: 'mr', label: '🇮🇳 Marathi' },
  { value: 'bn', label: '🇧🇩 Bengali' },
  { value: 'ar', label: '🇦🇪 Arabic' },
];

const STATUS_CONFIG = {
  APPROVED:       { color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20',   icon: CheckCircle2, label: 'Approved' },
  PENDING:        { color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20', icon: Clock,        label: 'Pending Review' },
  REJECTED:       { color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20',       icon: XCircle,      label: 'Rejected' },
  DRAFT:          { color: 'text-slate-400',  bg: 'bg-slate-500/10 border-slate-500/20',   icon: FileText,     label: 'Draft' },
  SUBMIT_ERROR:   { color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20',       icon: AlertCircle,  label: 'Submit Error' },
  NO_CREDENTIALS: { color: 'text-slate-400',  bg: 'bg-slate-500/10 border-slate-500/20',   icon: AlertCircle,  label: 'No Credentials' },
};

const BLANK_CARD = {
  body: '{{1}}\n₹{{2}}',
  buttons: [{ type: 'URL', text: 'Buy Now', url: 'https://yourstore.com/{{3}}' }],
  image_id: '',
  header_media_id: '',
};

const BLANK_TPL = {
  name: '', category: 'MARKETING', language: 'en',
  is_carousel: false,
  header_type: 'NONE', header_text: '',
  body: '', footer: '', buttons: [], variable_labels: [],
  carousel_cards: [{ ...BLANK_CARD }, { ...BLANK_CARD }, { ...BLANK_CARD }],
};

function extractVars(text) {
  return [...new Set([...(text || '').matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1]))];
}

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
          image_id: c.image_id || '',
          header_media_id: c.header_media_id || '',
          title: '', price: '', link: '',
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
    setView('create');
    setError('');
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
                    <span className="text-xs text-slate-500 bg-white/5 px-2 py-0.5 rounded-full">{tpl.category}</span>
                    <span className="text-xs text-slate-500 bg-white/5 px-2 py-0.5 rounded-full">{tpl.language}</span>
                  </div>
                  <p className="text-slate-400 text-sm mt-2 line-clamp-2">
                    {tpl.is_carousel
                      ? `Carousel: ${tpl.carousel_cards?.length || 0} cards — ${tpl.body || tpl.carousel_cards?.[0]?.body || ''}`
                      : tpl.body}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {tpl.buttons?.length > 0 && <span className="text-xs text-slate-500">{tpl.buttons.length} button{tpl.buttons.length > 1 ? 's' : ''}</span>}
                    {tpl.product_config && <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle2 size={11} /> Product config set</span>}
                    {tpl.rejected_reason && <span className="text-xs text-red-400">Rejected: {tpl.rejected_reason}</span>}
                  </div>
                  {tpl.meta_error && <p className="text-xs text-red-400 mt-1 font-mono truncate">{tpl.meta_error}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => handleRefresh(tpl)} disabled={refreshing[tpl.id]}
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white disabled:opacity-50" title="Refresh from Meta">
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
  const [pickerCard, setPickerCard] = useState(null); // index of card whose picker is open

  function addVar(field) {
    const vars = extractVars(form[field]);
    const next = vars.length ? Math.max(...vars.map(Number)) + 1 : 1;
    f(field, form[field] + ` {{${next}}}`);
  }

  function addCardVar(idx, field) {
    const cards = [...form.carousel_cards];
    const vars = extractVars(cards[idx][field]);
    const next = vars.length ? Math.max(...vars.map(Number)) + 1 : 1;
    cards[idx] = { ...cards[idx], [field]: cards[idx][field] + ` {{${next}}}` };
    f('carousel_cards', cards);
  }

  function updateCard(idx, key, val) {
    const cards = [...form.carousel_cards];
    cards[idx] = { ...cards[idx], [key]: val };
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
    updateCard(cardIdx, 'image_id', img.id);
    updateCard(cardIdx, 'header_media_id', img.media_id || '');
    setPickerCard(null);
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
            <p className="text-slate-600 text-xs">lowercase + underscores</p>
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
                  Carousel Cards <span className="text-slate-500 font-normal text-xs">({form.carousel_cards.length}/10 cards — min 2)</span>
                </label>
                {form.carousel_cards.length < 10 && (
                  <button onClick={addCard} className="var-btn"><Plus size={12} className="inline mr-1" />Add Card</button>
                )}
              </div>

              {/* Horizontal scroll preview */}
              <CarouselPreview cards={form.carousel_cards} />

              {/* Card editors */}
              <div className="flex flex-col gap-4">
                {form.carousel_cards.map((card, idx) => (
                  <div key={idx} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-purple-400 text-xs font-semibold flex items-center gap-2">
                        <LayoutGrid size={12} /> Card {idx + 1}
                      </span>
                      {form.carousel_cards.length > 2 && (
                        <button onClick={() => removeCard(idx)} className="text-red-400 hover:text-red-300"><X size={13} /></button>
                      )}
                    </div>

                    {/* Example image for Meta submission */}
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <label className="text-slate-500 text-xs flex items-center gap-1">
                          <ImagePlus size={11} /> Example Image
                          <span className="text-slate-600 ml-1">(sent to Meta for approval review)</span>
                        </label>
                        <button
                          onClick={() => {
                            setPickerCard(pickerCard === idx ? null : idx);
                            if (pickerCard !== idx && galleries.length > 0) {
                              setSelFolder(galleries[0].id);
                              loadFolderImages(galleries[0].id);
                            }
                          }}
                          className="var-btn flex items-center gap-1"
                        >
                          <Image size={11} /> {card.image_id ? 'Change Image' : 'Select from Gallery'}
                        </button>
                      </div>

                      {/* Image preview */}
                      {card.image_id && (
                        <div className="flex items-center gap-3">
                          <img src={`/api/gallery/images/${card.image_id}/preview`} alt=""
                            className="w-20 h-20 object-cover rounded-xl border border-purple-500/30" />
                          <div className="text-xs text-slate-400">
                            <p className="text-green-400 flex items-center gap-1"><CheckCircle2 size={11} /> Image selected</p>
                            {card.header_media_id && <p className="text-slate-600 font-mono mt-1">media_id: {card.header_media_id.substring(0, 16)}…</p>}
                          </div>
                        </div>
                      )}

                      {/* Inline gallery picker */}
                      {pickerCard === idx && (
                        <div className="bg-[#0a1929] border border-white/10 rounded-xl p-3 flex flex-col gap-3">
                          {galleries.length === 0
                            ? <p className="text-slate-500 text-xs">No gallery folders yet. Upload images in the Gallery section first.</p>
                            : (
                              <>
                                <div className="flex gap-2 flex-wrap">
                                  {galleries.map(gf => (
                                    <button key={gf.id}
                                      onClick={() => { setSelFolder(gf.id); loadFolderImages(gf.id); }}
                                      className={`text-xs px-3 py-1.5 rounded-lg border ${selFolder === gf.id ? 'bg-purple-600/20 border-purple-600/40 text-purple-400' : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20'}`}>
                                      {gf.name} ({gf.imageCount})
                                    </button>
                                  ))}
                                </div>
                                {galleryImages.length > 0 && (
                                  <div className="flex gap-2 flex-wrap">
                                    {galleryImages.map(img => (
                                      <button key={img.id} onClick={() => selectCardImage(idx, img)}
                                        className={`relative rounded-lg overflow-hidden border-2 transition-all ${card.image_id === img.id ? 'border-purple-500' : 'border-transparent hover:border-white/30'}`}>
                                        <img src={`/api/gallery/images/${img.id}/preview`} alt={img.name}
                                          className="w-16 h-16 object-cover" />
                                        {card.image_id === img.id && (
                                          <div className="absolute inset-0 bg-purple-500/30 flex items-center justify-center">
                                            <Check size={16} className="text-white" />
                                          </div>
                                        )}
                                      </button>
                                    ))}
                                  </div>
                                )}
                                {selFolder && galleryImages.length === 0 && (
                                  <p className="text-slate-500 text-xs">No images in this folder.</p>
                                )}
                              </>
                            )
                          }
                        </div>
                      )}
                    </div>

                    {/* Card body */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-slate-500 text-xs">
                          Body Text * <span className="text-slate-600">use {`{{1}}`} {`{{2}}`} for variables</span>
                        </label>
                        <button onClick={() => addCardVar(idx, 'body')} className="var-btn">+ Var</button>
                      </div>
                      <textarea value={card.body} onChange={e => updateCard(idx, 'body', e.target.value)}
                        placeholder={"{{1}}\n₹{{2}}"} rows={3} className="input text-sm resize-none" />
                      <p className="text-slate-600 text-xs">e.g. {`{{1}}`} = product name, {`{{2}}`} = price</p>
                    </div>

                    {/* Card buttons */}
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <label className="text-slate-500 text-xs">Buttons <span className="text-slate-600">(max 2)</span></label>
                        {(card.buttons || []).length < 2 && (
                          <div className="flex gap-1">
                            <button onClick={() => addCardButton(idx, 'URL')} className="var-btn"><Link size={10} className="inline mr-1" />URL</button>
                            <button onClick={() => addCardButton(idx, 'QUICK_REPLY')} className="var-btn"><Zap size={10} className="inline mr-1" />Reply</button>
                          </div>
                        )}
                      </div>
                      {(card.buttons || []).map((btn, bi) => (
                        <div key={bi} className="flex gap-2 items-center">
                          <span className="text-xs text-slate-500 w-16 shrink-0">{btn.type === 'URL' ? 'URL' : 'Reply'}</span>
                          <input value={btn.text} onChange={e => {
                            const cards = [...form.carousel_cards];
                            cards[idx].buttons[bi] = { ...btn, text: e.target.value };
                            f('carousel_cards', cards);
                          }} placeholder="Button label" className="input text-xs flex-1" />
                          {btn.type === 'URL' && (
                            <input value={btn.url} onChange={e => {
                              const cards = [...form.carousel_cards];
                              cards[idx].buttons[bi] = { ...btn, url: e.target.value };
                              f('carousel_cards', cards);
                            }} placeholder="https://... or use {{3}}" className="input text-xs flex-1 font-mono" />
                          )}
                          <button onClick={() => removeCardButton(idx, bi)} className="text-red-400 hover:text-red-300"><X size={13} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── STANDARD BUILDER ─────────────────────────────────────────────── */}
        {!form.is_carousel && (
          <>
            {/* Header */}
            <div className="flex flex-col gap-2">
              <label className="text-slate-400 text-xs font-medium">Header</label>
              <div className="flex gap-2">
                {['NONE', 'IMAGE', 'TEXT'].map(t => (
                  <button key={t} onClick={() => f('header_type', t)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${form.header_type === t ? 'bg-green-600/20 border-green-600/40 text-green-400' : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20'}`}>
                    {t === 'IMAGE' && <Image size={11} className="inline mr-1" />}
                    {t === 'TEXT' && <Type size={11} className="inline mr-1" />}
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
              {form.header_type === 'IMAGE' && (
                <p className="text-xs text-slate-500 bg-white/5 px-3 py-2 rounded-lg">Select image from Gallery after approval.</p>
              )}
            </div>

            {/* Body */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-slate-400 text-xs font-medium">Body * <span className="text-slate-600">use {`{{1}}`} {`{{2}}`} for variables</span></label>
                <button onClick={() => addVar('body')} className="var-btn">+ Add Variable</button>
              </div>
              <textarea value={form.body} onChange={e => f('body', e.target.value)}
                placeholder={"Hi {{1}}! 👋 Check out {{2}} for ₹{{3}}."} rows={4} className="input text-sm resize-none" />
              <p className="text-xs text-slate-600">{form.body.length}/1024</p>
            </div>

            {/* Footer */}
            <div className="flex flex-col gap-1.5">
              <label className="text-slate-400 text-xs font-medium">Footer <span className="text-slate-600">(optional)</span></label>
              <input value={form.footer} onChange={e => f('footer', e.target.value)}
                placeholder="Reply STOP to unsubscribe" className="input text-sm" />
            </div>

            {/* Buttons */}
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
                  <input value={btn.text} onChange={e => { const b = [...form.buttons]; b[i] = { ...b[i], text: e.target.value }; f('buttons', b); }}
                    placeholder="Label" className="input text-xs flex-1" />
                  {btn.type === 'URL' && (
                    <input value={btn.url} onChange={e => { const b = [...form.buttons]; b[i] = { ...b[i], url: e.target.value }; f('buttons', b); }}
                      placeholder="https://..." className="input text-xs flex-1 font-mono" />
                  )}
                  <button onClick={() => f('buttons', form.buttons.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300"><X size={13} /></button>
                </div>
              ))}
            </div>

            {/* Preview */}
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

// ── CONFIG VIEW ───────────────────────────────────────────────────────────────
function ConfigView({ tpl, config, setConfig, galleries, galleryImages, loadFolderImages, error, loading, onSave, onBack }) {
  const set = (k, v) => setConfig(p => ({ ...p, [k]: v }));
  const [selFolder, setSelFolder] = useState('');
  const [activeCard, setActiveCard] = useState(0);

  const isCarousel = tpl.is_carousel;

  function setCardField(idx, key, val) {
    const cards = [...(config.cards || [])];
    cards[idx] = { ...cards[idx], [key]: val };
    set('cards', cards);
  }

  function applyScraped(idx, scraped) {
    const cards = [...(config.cards || [])];
    if (scraped.title) cards[idx] = { ...cards[idx], title: scraped.title };
    if (scraped.price) cards[idx] = { ...cards[idx], price: scraped.price };
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
            {/* Live carousel preview */}
            <div>
              <label className="text-white font-medium text-sm mb-3 block">Carousel Preview</label>
              <CarouselConfigPreview cards={config.cards || []} />
            </div>

            {/* Card tabs */}
            <div>
              <div className="flex gap-2 flex-wrap mb-4">
                {(config.cards || []).map((_, i) => (
                  <button key={i} onClick={() => setActiveCard(i)}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium ${activeCard === i ? 'bg-purple-600/20 border-purple-600/40 text-purple-400' : 'bg-white/5 border-white/10 text-slate-400'}`}>
                    Card {i + 1} {config.cards[i]?.image_id ? '✓' : ''}
                  </button>
                ))}
              </div>

              {/* Active card editor */}
              {(config.cards || []).map((card, i) => i !== activeCard ? null : (
                <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-4">
                  <p className="text-purple-400 text-xs font-semibold">Card {i + 1} of {config.cards.length}</p>

                  {/* Auto-fill from URL */}
                  <ScrapeUrlInput
                    onFill={(scraped) => {
                      applyScraped(i, scraped);
                      // If scraped image, show note (can't auto-upload to gallery from here)
                    }}
                    externalImageUrl={card._scraped_image_url}
                  />

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

                  {/* Gallery image picker */}
                  <div className="flex flex-col gap-2">
                    <label className="text-slate-500 text-xs">Card Image <span className="text-slate-600">(from Gallery)</span></label>
                    <GalleryPicker
                      galleries={galleries} galleryImages={galleryImages}
                      selectedId={card.image_id} selFolder={selFolder}
                      onSelectFolder={id => { setSelFolder(id); loadFolderImages(id); }}
                      onSelect={img => {
                        setCardField(i, 'image_id', img.id);
                        setCardField(i, 'header_media_id', img.media_id || '');
                      }}
                    />
                    {card.image_id && (
                      <img src={`/api/gallery/images/${card.image_id}/preview`} alt=""
                        className="w-28 h-28 object-cover rounded-xl border border-white/10" />
                    )}
                  </div>

                  {/* Navigation */}
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
                      <optgroup label="Customer"><option value="customer_name">Customer Name</option></optgroup>
                      <optgroup label="Product"><option value="product_title">Product Title</option><option value="product_price">Product Price</option><option value="product_link">Product Link</option></optgroup>
                      <optgroup label="Cart"><option value="cart_total">Cart Total</option><option value="cart_link">Cart Link</option></optgroup>
                      <optgroup label="Fixed"><option value="custom">Custom Text</option></optgroup>
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
                    {(config.products || []).length > 1 && <button onClick={() => set('products', (config.products || []).filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300"><X size={13} /></button>}
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
function ScrapeUrlInput({ onFill }) {
  const [url, setUrl]         = useState('');
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
        <span className="text-slate-500 font-normal ml-1">(Shopify, WooCommerce, or any website)</span>
      </label>
      <div className="flex gap-2">
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
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
            <p className="text-blue-400 text-xs mt-1 flex items-center gap-1">
              <CheckCircle2 size={10} /> Title &amp; price filled in above fields
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Carousel Preview (while building) ────────────────────────────────────────
function CarouselPreview({ cards }) {
  const samples = ['Blue Kurti', '₹799', 'product-link'];
  return (
    <div className="bg-[#0a1929] rounded-2xl p-4">
      <p className="text-slate-500 text-xs mb-3">Preview (scroll →)</p>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {cards.map((card, i) => {
          const preview = (card.body || '').replace(/\{\{1\}\}/g, 'Blue Kurti').replace(/\{\{2\}\}/g, '₹799').replace(/\{\{(\d+)\}\}/g, (_, n) => samples[n - 1] || `[${n}]`);
          return (
            <div key={i} className="shrink-0 w-44 bg-[#1a2a1a] rounded-2xl overflow-hidden border border-white/10">
              <div className="w-full h-28 overflow-hidden bg-purple-900/30">
                {card.image_id
                  ? <img src={`/api/gallery/images/${card.image_id}/preview`} alt="" className="w-full h-full object-cover" />
                  : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                      <Image size={18} className="text-purple-400" />
                      <span className="text-purple-400 text-xs">Card {i + 1}</span>
                    </div>
                  )
                }
              </div>
              <div className="p-2.5">
                <p className="text-white text-xs whitespace-pre-wrap">{preview || 'Card body...'}</p>
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

// ── Carousel Config Preview (with real images) ────────────────────────────────
function CarouselConfigPreview({ cards }) {
  return (
    <div className="bg-[#0a1929] rounded-2xl p-4">
      <div className="flex gap-3 overflow-x-auto pb-2">
        {cards.map((card, i) => (
          <div key={i} className="shrink-0 w-44 bg-[#1a2a1a] rounded-2xl overflow-hidden border border-white/10">
            <div className="w-full h-28 bg-purple-900/20 overflow-hidden">
              {card.image_id
                ? <img src={`/api/gallery/images/${card.image_id}/preview`} alt="" className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center"><Image size={20} className="text-slate-600" /></div>
              }
            </div>
            <div className="p-2.5">
              <p className="text-white text-xs font-medium truncate">{card.title || `Product ${i + 1}`}</p>
              {card.price && <p className="text-green-400 text-xs">{card.price}</p>}
              {card.link && <p className="text-slate-500 text-xs truncate">{card.link}</p>}
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
        {galleries.length === 0 && (
          <p className="text-slate-600 text-xs">No gallery folders. Upload images in Gallery section first.</p>
        )}
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
                <div className="absolute inset-0 bg-green-500/30 flex items-center justify-center">
                  <Check size={16} className="text-white" />
                </div>
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
