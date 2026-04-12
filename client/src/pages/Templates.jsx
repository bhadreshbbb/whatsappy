import { useEffect, useState } from "react";
import {
  Plus, Trash2, RefreshCw, CheckCircle2, Clock, XCircle,
  AlertCircle, Settings2, Send, Image, Type, Link,
  Zap, Copy, Check, FileText, X, LayoutGrid, ChevronLeft, ChevronRight,
  Globe, Loader2, ImagePlus, ShoppingCart, Flame, Eye, Sparkles,
  Phone, MessageSquare, ExternalLink
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
  { value: 'te', label: '🇮🇳 Telugu'  }, { value: 'mr', label: '🇮🇳 Marathi' },
  { value: 'bn', label: '🇧🇩 Bengali' }, { value: 'ar', label: '🇦🇪 Arabic'  },
];
const VAR_FIELD_OPTIONS = [
  { value: 'product_title', label: 'Product Title'  },
  { value: 'product_price', label: 'Product Price'  },
  { value: 'product_link',  label: 'Product Link'   },
  { value: 'customer_name', label: 'Customer Name'  },
  { value: 'cart_total',    label: 'Cart Total'     },
  { value: 'cart_link',     label: 'Cart Link'      },
  { value: 'custom',        label: 'Custom Fixed Text' },
];
const STATUS_CFG = {
  APPROVED:       { color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20',   icon: CheckCircle2, label: 'Approved'       },
  PENDING:        { color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20', icon: Clock,        label: 'Pending Review' },
  REJECTED:       { color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20',       icon: XCircle,      label: 'Rejected'       },
  DRAFT:          { color: 'text-slate-400',  bg: 'bg-slate-500/10 border-slate-500/20',   icon: FileText,     label: 'Draft'          },
  SUBMIT_ERROR:   { color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20',       icon: AlertCircle,  label: 'Submit Error'   },
  NO_CREDENTIALS: { color: 'text-slate-400',  bg: 'bg-slate-500/10 border-slate-500/20',   icon: AlertCircle,  label: 'No Credentials' },
};

const BLANK_CARD = {
  body: '{{1}}\n₹{{2}}',
  buttons: [{ type: 'URL', text: 'Buy Now', url: 'https://yourstore.com/{{3}}' }],
  image_id: '', header_media_id: '',
  source: 'manual', scrape_url: '',
  var_map: { '1': 'product_title', '2': 'product_price', '3': 'product_link' },
};
const BLANK_TPL = {
  name: '', category: 'MARKETING', language: 'en',
  is_carousel: false, auto_product_mode: false,
  header_type: 'NONE', header_text: '',
  body: '', footer: '', buttons: [], variable_labels: [],
  carousel_cards: [{ ...BLANK_CARD }, { ...BLANK_CARD }, { ...BLANK_CARD }],
};

// ─────────────────────────────────────────────────────────────────────────────
// Utility: extract {{N}} variable numbers from text, sorted
function extractVars(text) {
  return [...new Set([...(text || '').matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1]))].sort((a,b) => +a - +b);
}

// Utility: substitute variables in text using varMap + productData
function resolveText(bodyText, varMap, productData, sampleData) {
  const lookup = {
    product_title: productData?.title || sampleData?.title || 'Product Name',
    product_price: productData?.price || sampleData?.price || '₹999',
    product_link:  productData?.link  || sampleData?.link  || 'https://store.com/product',
    customer_name: 'Priya',
    cart_total:    '₹1,499',
    cart_link:     'https://store.com/cart',
  };
  let text = bodyText || '';
  for (const [varNum, field] of Object.entries(varMap || {})) {
    const val = field === 'custom'
      ? (varMap[`${varNum}_custom`] || `{{${varNum}}}`)
      : (lookup[field] || `{{${varNum}}}`);
    text = text.replace(new RegExp(`\\{\\{${varNum}\\}\\}`, 'g'), val);
  }
  // remaining unresolved vars → placeholder
  text = text.replace(/\{\{(\d+)\}\}/g, (_, n) => `[Var${n}]`);
  return text;
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT COMPONENT
export default function Templates() {
  const [templates, setTemplates]         = useState([]);
  const [view, setView]                   = useState('list');   // 'list'|'create'|'config'|'success'
  const [form, setForm]                   = useState(BLANK_TPL);
  const [selected, setSelected]           = useState(null);
  const [lastCreated, setLastCreated]     = useState(null);
  const [loading, setLoading]             = useState(false);
  const [refreshing, setRefreshing]       = useState({});
  const [error, setError]                 = useState('');
  const [copied, setCopied]               = useState(null);
  const [galleries, setGalleries]         = useState([]);
  const [galleryImages, setGalleryImages] = useState([]);
  const [productConfig, setProductConfig] = useState({});
  const [previewTpl, setPreviewTpl]       = useState(null);   // template to preview in modal

  useEffect(() => { loadTemplates(); }, []);

  async function loadTemplates() {
    setLoading(true);
    try { const d = await api('/'); setTemplates(d.templates); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  async function loadGallery() {
    try { const d = await fetch(`${GALLERY_API}/folders`, { headers: CH() }).then(r => r.json()); setGalleries(d.folders || []); }
    catch (_) {}
  }
  async function loadFolderImages(folderId) {
    try { const d = await fetch(`${GALLERY_API}/folders/${folderId}/images`, { headers: CH() }).then(r => r.json()); setGalleryImages(d.images || []); }
    catch (_) {}
  }

  async function submitTemplate() {
    setError('');
    if (!form.name.trim()) return setError('Template name is required');
    if (form.is_carousel) {
      if (form.carousel_cards.length < 2) return setError('Carousel needs at least 2 cards');
      if (form.carousel_cards.some(c => !c.body.trim())) return setError('All carousel cards need body text');
    } else if (!form.body.trim()) return setError('Body text is required');
    setLoading(true);
    try {
      const d = await api('/', { method: 'POST', body: JSON.stringify(form) });
      setTemplates(prev => [d.template, ...prev]);
      setLastCreated(d.template);
      setView('success');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function handleRefresh(tpl) {
    setRefreshing(r => ({ ...r, [tpl.id]: true }));
    try { const d = await api(`/${tpl.id}/refresh`); setTemplates(prev => prev.map(t => t.id === tpl.id ? d.template : t)); }
    catch (e) { setError(e.message); }
    finally { setRefreshing(r => ({ ...r, [tpl.id]: false })); }
  }
  async function deleteTpl(tpl) {
    if (!confirm(`Delete template "${tpl.name}"?`)) return;
    try { await api(`/${tpl.id}`, { method: 'DELETE' }); setTemplates(prev => prev.filter(t => t.id !== tpl.id)); }
    catch (e) { setError(e.message); }
  }
  async function saveConfig() {
    setLoading(true);
    try {
      const d = await api(`/${selected.id}/product-config`, { method: 'PUT', body: JSON.stringify(productConfig) });
      setTemplates(prev => prev.map(t => t.id === selected.id ? d.template : t));
      setPreviewTpl(d.template);
      setView('list');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  function openConfig(tpl) {
    setSelected(tpl);
    setProductConfig(tpl.product_config || (tpl.is_carousel
      ? { cards: tpl.carousel_cards.map(c => ({ image_id: c.image_id||'', header_media_id: c.header_media_id||'', source: c.source||'manual', title:'', price:'', link:'' })) }
      : { header_image_id:'', products:[{ title:'', price:'', link:'', image_id:'' }], var_map: extractVars(tpl.body).reduce((a,v) => ({...a,[v]:''}),{}), custom_values:{} }
    ));
    loadGallery();
    setView('config');
  }
  function openCreate() { setView('create'); setError(''); setForm(BLANK_TPL); loadGallery(); }
  function copyName(name) { navigator.clipboard.writeText(name); setCopied(name); setTimeout(()=>setCopied(null),1500); }

  // ── SUCCESS VIEW ─────────────────────────────────────────────────────────
  if (view === 'success' && lastCreated) return (
    <SuccessView tpl={lastCreated}
      onPreview={() => setPreviewTpl(lastCreated)}
      onDone={() => { setView('list'); setLastCreated(null); }}
      onConfigure={() => { openConfig(lastCreated); setLastCreated(null); }}
    />
  );

  if (view === 'create') return (
    <CreateView form={form} setForm={setForm} error={error} setError={setError}
      loading={loading} onSubmit={submitTemplate} onBack={() => { setView('list'); setError(''); }}
      galleries={galleries} galleryImages={galleryImages} loadFolderImages={loadFolderImages} />
  );
  if (view === 'config') return (
    <ConfigView tpl={selected} config={productConfig} setConfig={setProductConfig}
      galleries={galleries} galleryImages={galleryImages} loadFolderImages={loadFolderImages}
      error={error} loading={loading} onSave={saveConfig}
      onBack={() => { setView('list'); setError(''); }} />
  );

  // ── LIST VIEW ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-white text-xl font-bold">Meta Templates</h1>
          <p className="text-slate-400 text-sm mt-0.5">Create, submit for approval, assign products, send campaigns</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-all">
          <Plus size={16} /> New Template
        </button>
      </div>

      {error && <ErrorBar msg={error} onClose={() => setError('')} />}
      {loading && templates.length === 0 && (
        <div className="flex flex-col gap-3">{[...Array(3)].map((_,i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}</div>
      )}
      {!loading && templates.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-slate-500 gap-4">
          <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center">
            <MessageSquare size={32} className="opacity-30" />
          </div>
          <div className="text-center">
            <p className="font-medium text-slate-400">No templates yet</p>
            <p className="text-sm mt-1">Create your first Meta template to send personalized product messages</p>
          </div>
          <button onClick={openCreate} className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-all">
            <Plus size={15} /> Create Template
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {templates.map(tpl => {
          const sc = STATUS_CFG[tpl.meta_status] || STATUS_CFG['DRAFT'];
          const Icon = sc.icon;
          const configCards = tpl.product_config?.cards?.filter(c => c.title || c.image_id) || [];
          return (
            <div key={tpl.id} className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 hover:border-white/15 transition-all group">
              <div className="flex items-start gap-4">
                {/* Left: info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-semibold font-mono text-sm">{tpl.name}</span>
                    <button onClick={() => copyName(tpl.name)} className="text-slate-600 hover:text-slate-300 transition-colors" title="Copy name">
                      {copied === tpl.name ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                    </button>
                    <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${sc.bg} ${sc.color}`}>
                      <Icon size={10} /> {sc.label}
                    </span>
                    {tpl.is_carousel && (
                      <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border bg-purple-500/10 border-purple-500/20 text-purple-400">
                        <LayoutGrid size={10} /> {tpl.carousel_cards?.length} cards
                      </span>
                    )}
                    {tpl.auto_product_mode && (
                      <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border bg-orange-500/10 border-orange-500/20 text-orange-400">
                        <Flame size={10} /> Auto
                      </span>
                    )}
                    <span className="text-xs text-slate-600 uppercase tracking-wide">{tpl.language}</span>
                  </div>

                  <p className="text-slate-400 text-xs mt-1.5 line-clamp-1">
                    {tpl.is_carousel ? tpl.carousel_cards?.[0]?.body?.replace(/\{\{(\d+)\}\}/g,'[…]') || 'Carousel template' : tpl.body?.replace(/\{\{(\d+)\}\}/g,'[…]')}
                  </p>

                  {/* Product preview strip */}
                  {configCards.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {configCards.slice(0, 4).map((c, i) => (
                        <div key={i} className="flex items-center gap-1.5 bg-white/[0.04] border border-white/5 rounded-lg px-2 py-1">
                          {c.image_id
                            ? <img src={`/api/gallery/images/${c.image_id}/preview`} alt="" className="w-4 h-4 object-cover rounded" />
                            : <Image size={10} className="text-slate-600" />
                          }
                          <span className="text-xs text-slate-300 max-w-[80px] truncate">{c.title}</span>
                          {c.price && <span className="text-xs text-green-400/80">{c.price}</span>}
                        </div>
                      ))}
                      {configCards.length > 4 && <span className="text-xs text-slate-600">+{configCards.length - 4} more</span>}
                    </div>
                  )}
                  {tpl.product_config?.last_auto_refresh && (
                    <p className="text-xs text-orange-400/60 mt-1 flex items-center gap-1">
                      <RefreshCw size={9} /> Auto-updated {new Date(tpl.product_config.last_auto_refresh).toLocaleString()}
                    </p>
                  )}
                  {tpl.meta_error && <p className="text-xs text-red-400 mt-1 font-mono line-clamp-1">{tpl.meta_error}</p>}
                  {tpl.rejected_reason && <p className="text-xs text-red-400 mt-1">Rejected: {tpl.rejected_reason}</p>}
                </div>

                {/* Right: actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => setPreviewTpl(tpl)} title="Preview message"
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all border border-white/5 hover:border-white/15">
                    <Phone size={12} /> Preview
                  </button>
                  <button onClick={() => handleRefresh(tpl)} disabled={refreshing[tpl.id]} title="Refresh status from Meta"
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white disabled:opacity-40 transition-all">
                    <RefreshCw size={13} className={refreshing[tpl.id] ? 'animate-spin' : ''} />
                  </button>
                  {tpl.meta_status === 'APPROVED' && (
                    <button onClick={() => openConfig(tpl)}
                      className="flex items-center gap-1 text-xs bg-green-600/20 hover:bg-green-600/40 border border-green-600/30 text-green-400 px-2.5 py-1.5 rounded-lg transition-all">
                      <Settings2 size={12} /> Configure
                    </button>
                  )}
                  <button onClick={() => deleteTpl(tpl)} className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-all">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Preview Modal */}
      {previewTpl && <WaPreviewModal tpl={previewTpl} onClose={() => setPreviewTpl(null)} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUCCESS VIEW — shown after template created
function SuccessView({ tpl, onPreview, onDone, onConfigure }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-6 max-w-lg mx-auto text-center">
      <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
        <CheckCircle2 size={32} className="text-green-400" />
      </div>
      <div>
        <h2 className="text-white text-xl font-bold">Template Submitted!</h2>
        <p className="text-slate-400 text-sm mt-2">
          <span className="font-mono text-white">{tpl.name}</span> has been submitted to Meta for review.
          Approval usually takes a few minutes to 24 hours.
        </p>
      </div>

      <div className={`w-full rounded-2xl border p-4 text-sm flex items-center gap-3 ${
        tpl.meta_status === 'APPROVED' ? 'bg-green-500/10 border-green-500/20 text-green-400' :
        tpl.meta_status === 'PENDING'  ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400' :
        tpl.meta_status === 'SUBMIT_ERROR' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
        'bg-slate-500/10 border-slate-500/20 text-slate-400'
      }`}>
        <AlertCircle size={16} className="shrink-0" />
        <span>Status: <strong>{tpl.meta_status}</strong> {tpl.meta_error && `— ${tpl.meta_error}`}</span>
      </div>

      <div className="flex gap-3 flex-wrap justify-center">
        <button onClick={onPreview} className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 text-sm transition-all">
          <Phone size={15} /> Preview Message
        </button>
        {tpl.meta_status === 'APPROVED' && (
          <button onClick={onConfigure} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-all">
            <Settings2 size={15} /> Configure Products
          </button>
        )}
        <button onClick={onDone} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 text-sm transition-all">
          Back to List
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE VIEW
function CreateView({ form, setForm, error, setError, loading, onSubmit, onBack, galleries, galleryImages, loadFolderImages }) {
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const [selFolder, setSelFolder]     = useState('');
  const [pickerCard, setPickerCard]   = useState(null);
  const [hotProducts, setHotProducts] = useState([]);
  const [hotLoading, setHotLoading]   = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  async function loadHotProducts() {
    if (hotLoading) return;
    setHotLoading(true);
    try { const d = await fetch(`${BASE}/hot-products?limit=8`, { headers: CH() }).then(r=>r.json()); setHotProducts(d.products || []); }
    catch (_) {} finally { setHotLoading(false); }
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
  function setCardSource(idx, src) {
    updateCard(idx, 'source', src);
    if (src === 'auto') loadHotProducts();
  }
  function setCardVarMap(idx, varNum, val) {
    const cards = [...form.carousel_cards];
    cards[idx] = { ...cards[idx], var_map: { ...(cards[idx].var_map||{}), [varNum]: val } };
    f('carousel_cards', cards);
  }
  function addCard()  { if (form.carousel_cards.length < 10) f('carousel_cards', [...form.carousel_cards, { ...BLANK_CARD }]); }
  function removeCard(idx) { if (form.carousel_cards.length > 2) f('carousel_cards', form.carousel_cards.filter((_,i)=>i!==idx)); }
  function addCardButton(idx, type) {
    const cards = [...form.carousel_cards];
    const card = { ...cards[idx] };
    if ((card.buttons||[]).length >= 2) return;
    card.buttons = [...(card.buttons||[]), type==='URL' ? { type:'URL', text:'Buy Now', url:'https://yourstore.com/{{3}}' } : { type:'QUICK_REPLY', text:'View More' }];
    cards[idx] = card; f('carousel_cards', cards);
  }
  function removeCardButton(ci, bi) {
    const cards = [...form.carousel_cards];
    cards[ci] = { ...cards[ci], buttons: cards[ci].buttons.filter((_,i)=>i!==bi) };
    f('carousel_cards', cards);
  }
  function selectCardImage(idx, img) {
    const cards = [...form.carousel_cards];
    cards[idx] = { ...cards[idx], image_id: img.id, header_media_id: img.media_id||'' };
    f('carousel_cards', cards);
    setPickerCard(null);
  }
  function assignHotProduct(idx, hot) {
    const cards = [...form.carousel_cards];
    cards[idx] = { ...cards[idx], source: 'auto', _hot_preview: hot };
    f('carousel_cards', cards);
  }

  return (
    <div className="flex flex-col gap-5 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all"><X size={18} /></button>
          <h1 className="text-white text-xl font-bold">Create Meta Template</h1>
        </div>
        {form.is_carousel && (
          <button onClick={() => setShowPreview(p => !p)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all ${showPreview ? 'bg-purple-600/20 border-purple-500/30 text-purple-400' : 'bg-white/5 border-white/10 text-slate-400'}`}>
            <Phone size={12} /> {showPreview ? 'Hide' : 'Show'} Preview
          </button>
        )}
      </div>

      {error && <ErrorBar msg={error} onClose={() => setError('')} />}

      <div className={`grid gap-6 ${form.is_carousel && showPreview ? 'lg:grid-cols-[1fr_380px]' : ''}`}>
        {/* ── LEFT: FORM ───────────────────────────────────────────────── */}
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 flex flex-col gap-5">
          {/* Name / Category / Language */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-slate-400 text-xs font-medium">Template Name *</label>
              <input value={form.name} onChange={e => f('name', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,'_'))}
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

          {/* Type toggle */}
          <div className="flex gap-2">
            <button onClick={() => f('is_carousel', false)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm border font-medium transition-all ${!form.is_carousel ? 'bg-green-600/20 border-green-600/40 text-green-400' : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20'}`}>
              <FileText size={15} /> Standard
            </button>
            <button onClick={() => f('is_carousel', true)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm border font-medium transition-all ${form.is_carousel ? 'bg-purple-600/20 border-purple-600/40 text-purple-400' : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20'}`}>
              <LayoutGrid size={15} /> Carousel / Catalog
            </button>
          </div>

          {/* ── CAROUSEL ─────────────────────────────────────────── */}
          {form.is_carousel && (
            <>
              {/* Auto-product toggle */}
              <div className="flex items-center justify-between bg-orange-500/5 border border-orange-500/20 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <Flame size={14} className="text-orange-400 shrink-0" />
                  <div>
                    <p className="text-white text-sm font-medium">Auto-Product Mode</p>
                    <p className="text-slate-500 text-xs">Daily cron auto-fills cards with trending + abandoned products</p>
                  </div>
                </div>
                <label className="toggle-switch shrink-0">
                  <input type="checkbox" checked={form.auto_product_mode} onChange={e => f('auto_product_mode', e.target.checked)} />
                  <span className="toggle-slider" />
                </label>
              </div>

              {/* Intro */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-slate-400 text-xs font-medium">Intro Message <span className="text-slate-600">(optional)</span></label>
                  <button onClick={() => addVar('body')} className="var-btn">+ Var</button>
                </div>
                <input value={form.body} onChange={e => f('body', e.target.value)}
                  placeholder="Check out our latest collection! 🛍️" className="input text-sm" />
              </div>

              {/* Cards header */}
              <div className="flex items-center justify-between">
                <label className="text-white font-medium text-sm">
                  Cards <span className="text-slate-500 font-normal text-xs">({form.carousel_cards.length}/10 — min 2)</span>
                </label>
                {form.carousel_cards.length < 10 && (
                  <button onClick={addCard} className="var-btn"><Plus size={11} className="inline mr-1" />Add Card</button>
                )}
              </div>

              <div className="flex flex-col gap-4">
                {form.carousel_cards.map((card, idx) => (
                  <CarouselCardEditor key={idx} card={card} idx={idx} totalCards={form.carousel_cards.length}
                    hotProducts={hotProducts} hotLoading={hotLoading}
                    galleries={galleries} galleryImages={galleryImages}
                    pickerCard={pickerCard} selFolder={selFolder}
                    onSetSelFolder={setSelFolder}
                    loadFolderImages={loadFolderImages}
                    onSetPickerCard={setPickerCard}
                    loadHotProducts={loadHotProducts}
                    onUpdateCard={(k,v) => updateCard(idx, k, v)}
                    onSetSource={(s) => setCardSource(idx, s)}
                    onSetVarMap={(vn, val) => setCardVarMap(idx, vn, val)}
                    onAddVar={() => addCardVar(idx)}
                    onRemoveCard={() => removeCard(idx)}
                    onAddButton={(t) => addCardButton(idx, t)}
                    onRemoveButton={(bi) => removeCardButton(idx, bi)}
                    onUpdateButton={(bi, k, v) => { const cs=[...form.carousel_cards]; cs[idx].buttons[bi]={...cs[idx].buttons[bi],[k]:v}; f('carousel_cards',cs); }}
                    onSelectImage={(img) => selectCardImage(idx, img)}
                    onAssignHotProduct={(hot) => assignHotProduct(idx, hot)}
                  />
                ))}
              </div>
            </>
          )}

          {/* ── STANDARD ─────────────────────────────────────────── */}
          {!form.is_carousel && (
            <>
              <div className="flex flex-col gap-2">
                <label className="text-slate-400 text-xs font-medium">Header</label>
                <div className="flex gap-2">
                  {['NONE','IMAGE','TEXT'].map(t => (
                    <button key={t} onClick={() => f('header_type',t)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${form.header_type===t ? 'bg-green-600/20 border-green-600/40 text-green-400' : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20'}`}>
                      {t==='IMAGE' && <Image size={11} className="inline mr-1" />}
                      {t==='TEXT'  && <Type  size={11} className="inline mr-1" />}
                      {t}
                    </button>
                  ))}
                </div>
                {form.header_type === 'TEXT' && (
                  <div className="flex gap-2">
                    <input value={form.header_text} onChange={e => f('header_text',e.target.value)} placeholder="Bold header text" className="input text-sm flex-1" />
                    <button onClick={() => { const v=extractVars(form.header_text); f('header_text', form.header_text+` {{${v.length?Math.max(...v.map(Number))+1:1}}}`); }} className="var-btn">+ Var</button>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-slate-400 text-xs font-medium">Body * <span className="text-slate-600">use {`{{1}}`} {`{{2}}`}</span></label>
                  <button onClick={() => addVar('body')} className="var-btn">+ Add Variable</button>
                </div>
                <textarea value={form.body} onChange={e => f('body',e.target.value)}
                  placeholder={"Hi {{1}}! 👋 Check out {{2}} for ₹{{3}}."} rows={4} className="input text-sm resize-none" />
                <p className="text-xs text-slate-600">{form.body.length}/1024</p>
              </div>

              {/* Variable mapping for standard */}
              {extractVars(form.body).length > 0 && (
                <VarMappingPanel vars={extractVars(form.body)} varMap={form.variable_labels || {}}
                  onChange={(v, val) => f('variable_labels', { ...(form.variable_labels||{}), [v]: val })} />
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-slate-400 text-xs font-medium">Footer <span className="text-slate-600">(optional)</span></label>
                <input value={form.footer} onChange={e => f('footer',e.target.value)} placeholder="Reply STOP to unsubscribe" className="input text-sm" />
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-slate-400 text-xs font-medium">Buttons <span className="text-slate-600">(max 3)</span></label>
                  {form.buttons.length < 3 && (
                    <div className="flex gap-1.5">
                      <button onClick={() => f('buttons',[...form.buttons,{type:'URL',text:'Shop Now',url:'https://yourstore.com/'}])} className="var-btn"><Link size={11} className="inline mr-1"/>URL</button>
                      <button onClick={() => f('buttons',[...form.buttons,{type:'QUICK_REPLY',text:'View'}])} className="var-btn"><Zap size={11} className="inline mr-1"/>Reply</button>
                    </div>
                  )}
                </div>
                {form.buttons.map((btn,i) => (
                  <div key={i} className="flex gap-2 items-center bg-white/5 rounded-xl p-2.5">
                    <span className="text-xs text-slate-500 w-20 shrink-0">{btn.type}</span>
                    <input value={btn.text} onChange={e => { const b=[...form.buttons]; b[i]={...b[i],text:e.target.value}; f('buttons',b); }} placeholder="Label" className="input text-xs flex-1" />
                    {btn.type==='URL' && <input value={btn.url} onChange={e => { const b=[...form.buttons]; b[i]={...b[i],url:e.target.value}; f('buttons',b); }} placeholder="https://..." className="input text-xs flex-1 font-mono" />}
                    <button onClick={() => f('buttons',form.buttons.filter((_,j)=>j!==i))} className="text-red-400 hover:text-red-300"><X size={13} /></button>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="flex gap-3 pt-2 border-t border-white/10">
            <button onClick={onBack} className="px-5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-sm transition-all">Cancel</button>
            <button onClick={onSubmit} disabled={loading}
              className="flex items-center gap-2 px-6 py-2 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-medium transition-all">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {loading ? 'Submitting…' : 'Submit to Meta'}
            </button>
          </div>
        </div>

        {/* ── RIGHT: LIVE WA PREVIEW (carousel only) ──────────────── */}
        {form.is_carousel && showPreview && (
          <div className="hidden lg:flex flex-col gap-3 sticky top-4 self-start">
            <p className="text-slate-400 text-xs font-medium flex items-center gap-2">
              <Phone size={12} /> Live WhatsApp Preview
            </p>
            <WaCarouselPreview
              introText={form.body}
              cards={form.carousel_cards}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CAROUSEL CARD EDITOR
function CarouselCardEditor({ card, idx, totalCards, hotProducts, hotLoading, galleries, galleryImages, pickerCard, selFolder, onSetSelFolder, loadFolderImages, onSetPickerCard, loadHotProducts, onUpdateCard, onSetSource, onSetVarMap, onAddVar, onRemoveCard, onAddButton, onRemoveButton, onUpdateButton, onSelectImage, onAssignHotProduct }) {
  const source = card.source || 'manual';
  const bodyVars = extractVars(card.body);
  const hot = card._hot_preview;

  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-2xl overflow-hidden">
      {/* Card title bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-white/[0.02] border-b border-white/5">
        <span className="text-purple-400 text-xs font-semibold flex items-center gap-1.5">
          <LayoutGrid size={11} /> Card {idx + 1}
          {hot && <span className="text-orange-400 ml-1 flex items-center gap-0.5"><Flame size={10}/>{hot.name?.substring(0,18)}</span>}
          {card.image_id && <span className="text-green-400 flex items-center gap-0.5"><Check size={10}/>Image</span>}
        </span>
        {totalCards > 2 && (
          <button onClick={onRemoveCard} className="p-1 text-slate-600 hover:text-red-400 rounded transition-colors"><X size={13} /></button>
        )}
      </div>

      <div className="p-4 flex flex-col gap-3">
        {/* Example image */}
        <div className="flex items-center gap-3">
          <div className="w-16 h-16 rounded-xl overflow-hidden border border-white/10 shrink-0 bg-white/5 flex items-center justify-center">
            {card.image_id
              ? <img src={`/api/gallery/images/${card.image_id}/preview`} alt="" className="w-full h-full object-cover" />
              : hot?.image
                ? <img src={hot.image} alt="" className="w-full h-full object-cover" onError={e=>{e.target.style.display='none';}} />
                : <ImagePlus size={18} className="text-slate-600" />
            }
          </div>
          <div className="flex flex-col gap-1.5 flex-1">
            <p className="text-slate-500 text-xs">Example Image <span className="text-slate-600">(for Meta review)</span></p>
            <button
              onClick={() => { onSetPickerCard(pickerCard===idx?null:idx); if(pickerCard!==idx&&galleries.length>0){onSetSelFolder(galleries[0].id);loadFolderImages(galleries[0].id);} }}
              className="var-btn w-fit flex items-center gap-1">
              <Image size={11} /> {card.image_id ? 'Change' : 'Select from Gallery'}
            </button>
          </div>
        </div>

        {/* Inline gallery picker */}
        {pickerCard === idx && (
          <InlineGalleryPicker galleries={galleries} galleryImages={galleryImages}
            selectedId={card.image_id} selFolder={selFolder}
            onSelectFolder={id=>{onSetSelFolder(id);loadFolderImages(id);}}
            onSelect={onSelectImage} accentColor="purple" />
        )}

        {/* Source tabs */}
        <div className="flex bg-white/5 rounded-lg p-0.5 gap-0.5">
          {[{k:'manual',l:'Manual',I:Type},{k:'url',l:'URL Scrape',I:Globe},{k:'auto',l:'Auto-detect',I:Sparkles}].map(({k,l,I}) => (
            <button key={k} onClick={() => onSetSource(k)}
              className={`flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-md font-medium transition-all ${source===k
                ? k==='auto' ? 'bg-orange-600/30 text-orange-300' : 'bg-purple-600/20 text-purple-300'
                : 'text-slate-500 hover:text-slate-300'}`}>
              <I size={10}/> {l}
            </button>
          ))}
        </div>

        {/* URL mode */}
        {source === 'url' && (
          <ScrapeUrlInput initialUrl={card.scrape_url}
            onUrlChange={url=>onUpdateCard('scrape_url',url)}
            onFill={(s) => { if(s.title)onUpdateCard('_scraped_title',s.title); if(s.price)onUpdateCard('_scraped_price',s.price); }} />
        )}

        {/* Auto mode */}
        {source === 'auto' && (
          <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-orange-400 text-xs font-medium flex items-center gap-1"><Flame size={11}/> Top trending products</p>
              <button onClick={loadHotProducts} className="text-slate-500 hover:text-slate-300"><RefreshCw size={11} className={hotLoading?'animate-spin':''}/></button>
            </div>
            {hotLoading && <div className="skeleton h-10 rounded-lg" />}
            {!hotLoading && hotProducts.length === 0 && (
              <p className="text-slate-500 text-xs">No data yet — builds as visitors browse your store. Will fall back to product catalog.</p>
            )}
            {hotProducts.length > 0 && (
              <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                {hotProducts.slice(0,6).map((hp,hi) => (
                  <button key={hi} onClick={() => onAssignHotProduct(hp)}
                    className={`flex items-center gap-2 p-2 rounded-lg text-left transition-all border ${hot?.url===hp.url ? 'border-orange-500/50 bg-orange-500/10' : 'border-white/5 bg-white/5 hover:border-orange-500/25 hover:bg-orange-500/5'}`}>
                    {hp.image
                      ? <img src={hp.image} alt="" className="w-8 h-8 object-cover rounded-lg shrink-0" onError={e=>e.target.style.display='none'} />
                      : <div className="w-8 h-8 bg-white/5 rounded-lg shrink-0 flex items-center justify-center"><Image size={12} className="text-slate-600"/></div>
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs truncate">{hp.name}</p>
                      <div className="flex items-center gap-2">
                        {hp.price && <span className="text-green-400 text-xs">{hp.price}</span>}
                        {hp.carts > 0 && <span className="text-orange-400 text-xs flex items-center gap-0.5"><ShoppingCart size={8}/>{hp.carts}</span>}
                        {hp.views > 0 && <span className="text-slate-500 text-xs flex items-center gap-0.5"><Eye size={8}/>{hp.views}</span>}
                      </div>
                    </div>
                    {hot?.url===hp.url && <Check size={13} className="text-orange-400 shrink-0"/>}
                    <span className="text-xs text-slate-600 shrink-0">#{hi+1}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Body textarea */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-slate-500 text-xs">Body Text *</label>
            <button onClick={onAddVar} className="var-btn">+ Var</button>
          </div>
          <textarea value={card.body} onChange={e => onUpdateCard('body', e.target.value)}
            placeholder={"{{1}}\n₹{{2}}"} rows={3} className="input text-sm resize-none" />
        </div>

        {/* Variable mapping */}
        {bodyVars.length > 0 && (
          <div className="bg-green-500/5 border border-green-500/15 rounded-xl p-3 flex flex-col gap-2">
            <p className="text-green-400 text-xs font-medium flex items-center gap-1"><Sparkles size={11}/> Variable Mapping</p>
            {bodyVars.map(v => (
              <div key={v} className="flex items-center gap-2">
                <span className="text-green-400 font-mono text-xs w-10 shrink-0">{`{{${v}}}`}</span>
                <select value={(card.var_map||{})[v]||''} onChange={e => onSetVarMap(v,e.target.value)} className="input text-xs flex-1">
                  <option value="">— what is this? —</option>
                  {VAR_FIELD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {(card.var_map||{})[v]==='custom' && (
                  <input placeholder="Fixed value" value={(card.var_map||{})[`${v}_custom`]||''} onChange={e=>onSetVarMap(`${v}_custom`,e.target.value)} className="input text-xs flex-1" />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Buttons */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-slate-500 text-xs">Buttons <span className="text-slate-600">(max 2)</span></label>
            {(card.buttons||[]).length < 2 && (
              <div className="flex gap-1">
                <button onClick={() => onAddButton('URL')} className="var-btn"><Link size={10} className="inline mr-0.5"/>URL</button>
                <button onClick={() => onAddButton('QUICK_REPLY')} className="var-btn"><Zap size={10} className="inline mr-0.5"/>Reply</button>
              </div>
            )}
          </div>
          {(card.buttons||[]).map((btn,bi) => (
            <div key={bi} className="flex gap-2 items-center">
              <span className="text-xs text-slate-600 w-12 shrink-0">{btn.type==='URL'?'URL':'Reply'}</span>
              <input value={btn.text} onChange={e => onUpdateButton(bi,'text',e.target.value)} placeholder="Label" className="input text-xs flex-1" />
              {btn.type==='URL' && <input value={btn.url} onChange={e => onUpdateButton(bi,'url',e.target.value)} placeholder="https://..." className="input text-xs flex-1 font-mono" />}
              <button onClick={() => onRemoveButton(bi)} className="text-red-400 hover:text-red-300"><X size={13}/></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VARIABLE MAPPING PANEL (for standard templates)
function VarMappingPanel({ vars, varMap, onChange }) {
  return (
    <div className="bg-green-500/5 border border-green-500/15 rounded-xl p-3 flex flex-col gap-2">
      <p className="text-green-400 text-xs font-medium flex items-center gap-1"><Sparkles size={11}/> Variable Mapping — what does each variable mean?</p>
      {vars.map(v => (
        <div key={v} className="flex items-center gap-2">
          <span className="text-green-400 font-mono text-xs w-12 shrink-0">{`{{${v}}}`}</span>
          <select value={(varMap||{})[v]||''} onChange={e => onChange(v, e.target.value)} className="input text-xs flex-1">
            <option value="">— select —</option>
            {VAR_FIELD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {(varMap||{})[v]==='custom' && (
            <input placeholder="Fixed value" value={(varMap||{})[`${v}_custom`]||''} onChange={e=>onChange(`${v}_custom`,e.target.value)} className="input text-xs flex-1" />
          )}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG VIEW
function ConfigView({ tpl, config, setConfig, galleries, galleryImages, loadFolderImages, error, loading, onSave, onBack }) {
  const set = (k, v) => setConfig(p => ({ ...p, [k]: v }));
  const [selFolder, setSelFolder]           = useState('');
  const [activeCard, setActiveCard]         = useState(0);
  const [hotProducts, setHotProducts]       = useState([]);
  const [hotLoading, setHotLoading]         = useState(false);
  const [autoRefreshing, setAutoRefreshing] = useState(false);

  useEffect(() => { if (tpl.is_carousel) loadHotProducts(); }, []);

  async function loadHotProducts() {
    setHotLoading(true);
    try { const d = await fetch(`${BASE}/hot-products?limit=8`, {headers:CH()}).then(r=>r.json()); setHotProducts(d.products||[]); }
    catch(_){} finally { setHotLoading(false); }
  }
  async function triggerAutoRefresh() {
    setAutoRefreshing(true);
    try {
      const d = await api(`/${tpl.id}/refresh-auto`, {method:'POST'});
      if (d.template?.product_config) setConfig(d.template.product_config);
      setHotProducts(d.hot_products||[]);
    } catch(e){console.error(e);} finally { setAutoRefreshing(false); }
  }
  function setCardField(idx,key,val) {
    const cards=[...(config.cards||[])]; cards[idx]={...cards[idx],[key]:val}; set('cards',cards);
  }
  function assignHot(idx, hot) {
    const cards=[...(config.cards||[])];
    cards[idx]={...cards[idx], title:hot.name, price:hot.price, link:hot.url, _hot_image_url:hot.image, _hot_score:hot.score, _hot_carts:hot.carts, _hot_views:hot.views};
    set('cards',cards);
  }

  const isCarousel = tpl.is_carousel;
  const activeCardData = (config.cards||[])[activeCard] || {};

  return (
    <div className="flex flex-col gap-5 max-w-6xl">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all"><X size={18}/></button>
        <div>
          <h1 className="text-white text-xl font-bold">Configure Products</h1>
          <p className="text-slate-400 text-sm font-mono">{tpl.name} {isCarousel && <span className="text-purple-400">· Carousel · {(config.cards||[]).length} cards</span>}</p>
        </div>
      </div>
      {error && <ErrorBar msg={error} />}

      {isCarousel && (
        <div className={`grid gap-6 lg:grid-cols-[1fr_360px]`}>
          {/* LEFT: editor */}
          <div className="flex flex-col gap-5">
            {/* Hot products panel */}
            <div className="bg-orange-500/5 border border-orange-500/20 rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Flame size={14} className="text-orange-400"/>
                  <div>
                    <p className="text-white text-sm font-medium">Hot Products</p>
                    <p className="text-slate-500 text-xs">Trending + abandoned cart — click any to assign to Card {activeCard+1}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {tpl.auto_product_mode && (
                    <button onClick={triggerAutoRefresh} disabled={autoRefreshing}
                      className="flex items-center gap-1.5 text-xs bg-orange-600/20 hover:bg-orange-600/40 border border-orange-500/30 text-orange-400 px-3 py-1.5 rounded-lg disabled:opacity-50 transition-all">
                      <RefreshCw size={11} className={autoRefreshing?'animate-spin':''}/> Auto-fill now
                    </button>
                  )}
                  <button onClick={loadHotProducts} disabled={hotLoading} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 transition-all">
                    <RefreshCw size={12} className={hotLoading?'animate-spin':''}/>
                  </button>
                </div>
              </div>
              {hotLoading && (
                <div className="flex gap-2">{[...Array(4)].map((_,i)=><div key={i} className="skeleton w-28 h-24 rounded-xl shrink-0"/>)}</div>
              )}
              {!hotLoading && hotProducts.length === 0 && (
                <p className="text-slate-500 text-xs py-2">No tracking data yet. Products will appear as visitors browse and abandon carts. Falls back to your product catalog.</p>
              )}
              {hotProducts.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {hotProducts.map((hot,i) => (
                    <button key={i} onClick={() => assignHot(activeCard, hot)}
                      className={`shrink-0 w-28 rounded-xl overflow-hidden border transition-all text-left ${activeCardData.title===hot.name ? 'border-orange-500/50 bg-orange-500/5' : 'border-white/5 bg-white/[0.03] hover:border-orange-500/30 hover:bg-orange-500/5'}`}>
                      <div className="w-full h-16 overflow-hidden bg-white/5">
                        {hot.image
                          ? <img src={hot.image} alt="" className="w-full h-full object-cover" onError={e=>e.target.style.display='none'}/>
                          : <div className="w-full h-full flex items-center justify-center"><Image size={14} className="text-slate-700"/></div>
                        }
                      </div>
                      <div className="p-1.5">
                        <p className="text-white text-xs truncate font-medium leading-tight">{hot.name}</p>
                        {hot.price && <p className="text-green-400 text-xs">{hot.price}</p>}
                        <div className="flex items-center gap-1 mt-0.5">
                          {hot.carts>0 && <span className="text-orange-400 text-xs flex items-center gap-0.5"><ShoppingCart size={7}/>{hot.carts}</span>}
                          {hot.views>0 && <span className="text-slate-500 text-xs flex items-center gap-0.5"><Eye size={7}/>{hot.views}</span>}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Card tabs */}
            <div className="flex gap-2 flex-wrap">
              {(config.cards||[]).map((c,i) => (
                <button key={i} onClick={() => setActiveCard(i)}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${activeCard===i ? 'bg-purple-600/20 border-purple-600/40 text-purple-400' : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20'}`}>
                  Card {i+1} {(c.image_id||c.title)?' ✓':''}
                </button>
              ))}
            </div>

            {/* Active card editor */}
            {(config.cards||[]).map((card,i) => i!==activeCard ? null : (
              <div key={i} className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <p className="text-purple-400 text-xs font-semibold">Card {i+1} of {config.cards.length}</p>
                  {card._hot_score !== undefined && (
                    <span className="text-xs text-orange-400/80 flex items-center gap-1"><Flame size={9}/> Score {card._hot_score} · {card._hot_carts||0} abandoned</span>
                  )}
                </div>

                <ScrapeUrlInput onFill={(s) => { if(s.title)setCardField(i,'title',s.title); if(s.price)setCardField(i,'price',s.price); }} />

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1"><label className="text-slate-500 text-xs">Product Title</label>
                    <input value={card.title||''} onChange={e=>setCardField(i,'title',e.target.value)} placeholder="Blue Cotton Kurti" className="input text-sm" />
                  </div>
                  <div className="flex flex-col gap-1"><label className="text-slate-500 text-xs">Price</label>
                    <input value={card.price||''} onChange={e=>setCardField(i,'price',e.target.value)} placeholder="₹799" className="input text-sm" />
                  </div>
                  <div className="col-span-2 flex flex-col gap-1"><label className="text-slate-500 text-xs">Product Link</label>
                    <input value={card.link||''} onChange={e=>setCardField(i,'link',e.target.value)} placeholder="https://yourstore.com/..." className="input text-sm font-mono" />
                  </div>
                </div>

                {/* Auto-detected image hint */}
                {!card.image_id && card._hot_image_url && (
                  <div className="flex items-center gap-3 bg-orange-500/5 border border-orange-500/20 rounded-xl p-2.5">
                    <img src={card._hot_image_url} alt="" className="w-12 h-12 object-cover rounded-lg shrink-0" onError={e=>e.target.parentElement.style.display='none'}/>
                    <p className="text-slate-400 text-xs">Auto-detected image from product page. Upload it to <strong className="text-white">Gallery</strong> then select below to use as the card image.</p>
                  </div>
                )}

                {/* Gallery picker */}
                <div className="flex flex-col gap-2">
                  <label className="text-slate-500 text-xs">Card Image <span className="text-slate-600">(from Gallery)</span></label>
                  <GalleryPicker galleries={galleries} galleryImages={galleryImages} selectedId={card.image_id} selFolder={selFolder}
                    onSelectFolder={id=>{setSelFolder(id);loadFolderImages(id);}}
                    onSelect={img=>{setCardField(i,'image_id',img.id);setCardField(i,'header_media_id',img.media_id||'');}} />
                  {card.image_id && <img src={`/api/gallery/images/${card.image_id}/preview`} alt="" className="w-24 h-24 object-cover rounded-xl border border-white/10"/>}
                </div>

                <div className="flex gap-2">
                  {i>0 && <button onClick={()=>setActiveCard(i-1)} className="var-btn flex items-center gap-1"><ChevronLeft size={12}/>Prev</button>}
                  {i<(config.cards.length-1) && <button onClick={()=>setActiveCard(i+1)} className="var-btn flex items-center gap-1">Next<ChevronRight size={12}/></button>}
                </div>
              </div>
            ))}
          </div>

          {/* RIGHT: live preview */}
          <div className="hidden lg:flex flex-col gap-3 sticky top-4 self-start">
            <p className="text-slate-400 text-xs font-medium flex items-center gap-2"><Phone size={12}/> Live Preview</p>
            <WaCarouselPreview
              introText={tpl.body}
              cards={tpl.carousel_cards}
              productCards={config.cards||[]}
            />
          </div>
        </div>
      )}

      {!isCarousel && (
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 flex flex-col gap-5">
          {tpl.header_type==='IMAGE' && (
            <div className="flex flex-col gap-3">
              <label className="text-white font-medium text-sm">Header Image</label>
              <GalleryPicker galleries={galleries} galleryImages={galleryImages} selectedId={config.header_image_id}
                selFolder={selFolder} onSelectFolder={id=>{setSelFolder(id);loadFolderImages(id);}} onSelect={img=>set('header_image_id',img.id)} />
              {config.header_image_id && <img src={`/api/gallery/images/${config.header_image_id}/preview`} alt="" className="w-32 h-32 object-cover rounded-xl border border-white/10"/>}
            </div>
          )}
          {extractVars(tpl.body).length>0 && (
            <VarMappingPanel vars={extractVars(tpl.body)} varMap={config.var_map||{}}
              onChange={(v,val)=>set('var_map',{...(config.var_map||{}),[v]:val})} />
          )}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label className="text-white font-medium text-sm">Products</label>
              <button onClick={()=>set('products',[...(config.products||[]),{title:'',price:'',link:'',image_id:''}])} className="var-btn"><Plus size={11} className="inline mr-1"/>Add</button>
            </div>
            {(config.products||[]).map((prod,i) => (
              <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-xs">Product {i+1}</span>
                  {(config.products||[]).length>1 && <button onClick={()=>set('products',config.products.filter((_,j)=>j!==i))} className="text-red-400 hover:text-red-300"><X size={13}/></button>}
                </div>
                <ScrapeUrlInput onFill={(s) => { const a=[...config.products]; if(s.title)a[i]={...a[i],title:s.title}; if(s.price)a[i]={...a[i],price:s.price}; set('products',a); }} />
                <div className="grid grid-cols-2 gap-3">
                  <input value={prod.title} onChange={e=>{const a=[...config.products];a[i]={...a[i],title:e.target.value};set('products',a);}} placeholder="Title" className="input text-sm"/>
                  <input value={prod.price} onChange={e=>{const a=[...config.products];a[i]={...a[i],price:e.target.value};set('products',a);}} placeholder="₹799" className="input text-sm"/>
                  <div className="col-span-2"><input value={prod.link} onChange={e=>{const a=[...config.products];a[i]={...a[i],link:e.target.value};set('products',a);}} placeholder="https://..." className="input text-sm font-mono"/></div>
                  <div className="col-span-2 flex flex-col gap-2">
                    <GalleryPicker galleries={galleries} galleryImages={galleryImages} selectedId={prod.image_id}
                      selFolder={selFolder} onSelectFolder={id=>{setSelFolder(id);loadFolderImages(id);}}
                      onSelect={img=>{const a=[...config.products];a[i]={...a[i],image_id:img.id};set('products',a);}} />
                    {prod.image_id && <img src={`/api/gallery/images/${prod.image_id}/preview`} alt="" className="w-20 h-20 object-cover rounded-xl border border-white/10"/>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3 pb-2">
        <button onClick={onBack} className="px-5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-sm transition-all">Cancel</button>
        <button onClick={onSave} disabled={loading}
          className="flex items-center gap-2 px-6 py-2 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-medium transition-all">
          {loading ? <Loader2 size={14} className="animate-spin"/> : <CheckCircle2 size={14}/>}
          {loading ? 'Saving…' : 'Save Config'}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WA PREVIEW MODAL — full WhatsApp phone-frame preview
function WaPreviewModal({ tpl, onClose }) {
  const cards = tpl.product_config?.cards || [];
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e=>e.stopPropagation()}>
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Phone size={15} className="text-green-400"/>
            <span className="text-white font-semibold text-sm">WhatsApp Preview</span>
            <span className="font-mono text-slate-400 text-xs">{tpl.name}</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all"><X size={16}/></button>
        </div>

        {/* Phone frame */}
        <div className="flex-1 overflow-y-auto p-6 flex justify-center bg-[#0a0f1a]">
          <div className="w-80">
            {/* Status bar */}
            <div className="bg-[#1f2c34] rounded-t-2xl px-4 py-2 flex items-center gap-2 border-b border-white/5">
              <div className="w-8 h-8 rounded-full bg-green-600/30 flex items-center justify-center shrink-0">
                <MessageSquare size={14} className="text-green-400"/>
              </div>
              <div>
                <p className="text-white text-xs font-semibold">Your Business</p>
                <p className="text-slate-400 text-xs">WhatsApp Business</p>
              </div>
            </div>

            {/* Chat area */}
            <div className="wa-bg-pattern min-h-64 p-3 pb-4 flex flex-col gap-2">
              {tpl.is_carousel
                ? <WaCarouselPreview introText={tpl.body} cards={tpl.carousel_cards} productCards={cards} />
                : <WaStandardBubble tpl={tpl} config={tpl.product_config||{}} />
              }
            </div>
          </div>
        </div>

        {/* Footer note */}
        <div className="px-5 py-3 border-t border-white/10 bg-white/[0.02]">
          <p className="text-slate-500 text-xs text-center">Preview uses sample data. Actual message uses live product values from your config.</p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WA CAROUSEL PREVIEW — shows a realistic WA carousel bubble
function WaCarouselPreview({ introText, cards = [], productCards = [] }) {
  const [activeIdx, setActiveIdx] = useState(0);

  const resolvedCards = cards.map((card, i) => {
    const pc = productCards[i] || {};
    const vm = card.var_map || { '1':'product_title','2':'product_price','3':'product_link' };
    const sampleProduct = pc.title ? null : { title: ['Blue Kurti','Cotton Saree','Ethnic Wear'][i%3], price: [`₹799`,`₹1,299`,`₹599`][i%3], link: 'https://store.com/p' };
    const text = resolveText(card.body, vm, pc, sampleProduct);
    const imageUrl = pc.image_id ? `/api/gallery/images/${pc.image_id}/preview` : (pc._hot_image_url || card._hot_preview?.image || null);
    return { text, imageUrl, buttons: card.buttons || [], title: pc.title || sampleProduct?.title, price: pc.price || sampleProduct?.price };
  });

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {/* Intro bubble */}
      {introText && (
        <div className="wa-bubble max-w-[85%] px-3 py-2 self-start">
          <p className="text-white text-xs whitespace-pre-wrap">{resolvedCards.length > 0 ? introText.replace(/\{\{(\d+)\}\}/g,'[…]') : introText}</p>
          <p className="text-slate-500 text-[10px] mt-1 text-right">09:41 AM ✓✓</p>
        </div>
      )}

      {/* Carousel card area */}
      {cards.length > 0 && (
        <div className="wa-bubble max-w-full p-0 overflow-hidden self-start w-full">
          {/* Current card */}
          <div className="w-full">
            {/* Card image */}
            <div className="w-full h-32 bg-[#2a3942] overflow-hidden">
              {resolvedCards[activeIdx]?.imageUrl
                ? <img src={resolvedCards[activeIdx].imageUrl} alt="" className="w-full h-full object-cover" onError={e=>{e.target.style.display='none';}} />
                : <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-purple-900/20">
                    <Image size={20} className="text-purple-400/50"/>
                    <span className="text-purple-400/50 text-xs">Card {activeIdx+1}</span>
                  </div>
              }
            </div>
            {/* Card body */}
            <div className="px-3 py-2">
              <p className="text-white text-xs whitespace-pre-wrap">{resolvedCards[activeIdx]?.text}</p>
              <p className="text-slate-500 text-[10px] mt-1 text-right">09:41 AM ✓✓</p>
            </div>
            {/* Card buttons */}
            {resolvedCards[activeIdx]?.buttons?.map((btn,bi) => (
              <div key={bi} className="border-t border-white/10 px-3 py-2 flex items-center justify-center gap-1.5">
                {btn.type==='URL' && <ExternalLink size={11} className="text-blue-400"/>}
                <span className="text-blue-400 text-xs font-medium">{btn.text}</span>
              </div>
            ))}
          </div>

          {/* Carousel dot navigation */}
          {cards.length > 1 && (
            <div className="flex items-center justify-between px-3 py-2 bg-black/20">
              <button onClick={()=>setActiveIdx(i=>Math.max(0,i-1))} disabled={activeIdx===0}
                className="p-1 rounded-lg text-slate-400 hover:text-white disabled:opacity-20 transition-colors">
                <ChevronLeft size={14}/>
              </button>
              <div className="flex gap-1.5 items-center">
                {cards.map((_,i) => (
                  <button key={i} onClick={()=>setActiveIdx(i)}
                    className={`rounded-full transition-all ${i===activeIdx ? 'w-4 h-1.5 bg-green-400' : 'w-1.5 h-1.5 bg-slate-600 hover:bg-slate-400'}`} />
                ))}
              </div>
              <button onClick={()=>setActiveIdx(i=>Math.min(cards.length-1,i+1))} disabled={activeIdx===cards.length-1}
                className="p-1 rounded-lg text-slate-400 hover:text-white disabled:opacity-20 transition-colors">
                <ChevronRight size={14}/>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WA STANDARD BUBBLE
function WaStandardBubble({ tpl, config }) {
  const vm = config.var_map || {};
  const pd = (config.products||[])[0] || {};
  const preview = resolveText(tpl.body, vm, pd, { title:'Blue Kurti', price:'₹799', link:'https://store.com' });
  return (
    <div className="wa-bubble max-w-[90%] overflow-hidden self-start w-full">
      {tpl.header_type==='IMAGE' && (
        config.header_image_id
          ? <img src={`/api/gallery/images/${config.header_image_id}/preview`} alt="" className="w-full h-36 object-cover"/>
          : <div className="w-full h-36 bg-green-900/20 flex items-center justify-center gap-2"><Image size={20} className="text-green-600/50"/></div>
      )}
      {tpl.header_type==='TEXT' && tpl.header_text && (
        <div className="px-3 pt-2.5 font-bold text-white text-sm">{tpl.header_text.replace(/\{\{(\d+)\}\}/g,'[…]')}</div>
      )}
      <div className="px-3 py-2">
        <p className="text-white text-xs whitespace-pre-wrap">{preview||'Your message...'}</p>
        {tpl.footer && <p className="text-slate-500 text-[10px] mt-1">{tpl.footer}</p>}
        <p className="text-slate-500 text-[10px] mt-1 text-right">09:41 AM ✓✓</p>
      </div>
      {tpl.buttons?.map((btn,i) => (
        <div key={i} className="border-t border-white/10 px-3 py-2 flex items-center justify-center gap-1.5">
          {btn.type==='URL' && <ExternalLink size={11} className="text-blue-400"/>}
          <span className="text-blue-400 text-xs font-medium">{btn.text}</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SCRAPE URL INPUT
function ScrapeUrlInput({ onFill, initialUrl, onUrlChange }) {
  const [url, setUrl]         = useState(initialUrl||'');
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);
  const [err, setErr]         = useState('');

  async function handleFetch() {
    if (!url.trim()) return;
    setLoading(true); setErr(''); setResult(null);
    try {
      const res = await fetch(`${BASE}/scrape-product`, { method:'POST', headers:{...CH(),'Content-Type':'application/json'}, body:JSON.stringify({url:url.trim()}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error||'Failed');
      setResult(data); onFill(data);
    } catch(e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 flex flex-col gap-2">
      <label className="text-blue-400 text-xs font-semibold flex items-center gap-1">
        <Globe size={11}/> Auto-fill from Product URL
        <span className="text-slate-500 font-normal ml-1">(Shopify / any website)</span>
      </label>
      <div className="flex gap-2">
        <input value={url} onChange={e=>{setUrl(e.target.value);onUrlChange?.(e.target.value);}}
          onKeyDown={e=>e.key==='Enter'&&handleFetch()}
          placeholder="https://yourstore.myshopify.com/products/name"
          className="input text-xs font-mono flex-1" />
        <button onClick={handleFetch} disabled={loading||!url.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/30 text-blue-400 text-xs font-medium disabled:opacity-50 shrink-0 transition-all">
          {loading ? <Loader2 size={11} className="animate-spin"/> : <Globe size={11}/>}
          {loading?'…':'Fetch'}
        </button>
      </div>
      {err && <p className="text-red-400 text-xs">{err}</p>}
      {result && (
        <div className="flex items-start gap-2 bg-blue-500/10 rounded-lg p-2">
          {result.image_url && <img src={result.image_url} alt="" className="w-12 h-12 object-cover rounded-lg shrink-0" onError={e=>e.target.style.display='none'}/>}
          <div className="flex-1 min-w-0">
            {result.title && <p className="text-white text-xs font-medium truncate">{result.title}</p>}
            {result.price && <p className="text-green-400 text-xs">{result.price}</p>}
            <p className="text-blue-400 text-xs mt-1 flex items-center gap-1"><CheckCircle2 size={9}/> Title &amp; price filled</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INLINE GALLERY PICKER
function InlineGalleryPicker({ galleries, galleryImages, selectedId, onSelectFolder, selFolder, onSelect, accentColor='green' }) {
  const ac = accentColor==='purple'
    ? { folder: 'bg-purple-600/20 border-purple-600/40 text-purple-400', sel: 'border-purple-500', overlay:'bg-purple-500/30' }
    : { folder: 'bg-green-600/20 border-green-600/40 text-green-400',   sel: 'border-green-500',  overlay:'bg-green-500/30' };
  return (
    <div className="bg-[#0a1929] border border-white/10 rounded-xl p-3 flex flex-col gap-2">
      {galleries.length===0
        ? <p className="text-slate-500 text-xs">No gallery folders. Upload images in the Gallery section first.</p>
        : <>
          <div className="flex gap-2 flex-wrap">
            {galleries.map(gf => (
              <button key={gf.id} onClick={()=>onSelectFolder(gf.id)}
                className={`text-xs px-2.5 py-1 rounded-lg border ${selFolder===gf.id ? ac.folder : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20'}`}>
                {gf.name} ({gf.imageCount})
              </button>
            ))}
          </div>
          {galleryImages.length>0 && (
            <div className="flex gap-2 flex-wrap">
              {galleryImages.map(img => (
                <button key={img.id} onClick={()=>onSelect(img)}
                  className={`relative rounded-lg overflow-hidden border-2 transition-all ${selectedId===img.id ? ac.sel : 'border-transparent hover:border-white/30'}`}>
                  <img src={`/api/gallery/images/${img.id}/preview`} alt={img.name} className="w-14 h-14 object-cover"/>
                  {selectedId===img.id && <div className={`absolute inset-0 ${ac.overlay} flex items-center justify-center`}><Check size={14} className="text-white"/></div>}
                </button>
              ))}
            </div>
          )}
          {selFolder && galleryImages.length===0 && <p className="text-slate-500 text-xs">No images in this folder.</p>}
        </>
      }
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GALLERY PICKER (simple folder + image grid for config)
function GalleryPicker({ galleries, galleryImages, selectedId, onSelectFolder, selFolder, onSelect }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 flex-wrap">
        {galleries.length===0 && <p className="text-slate-600 text-xs">No gallery folders yet.</p>}
        {galleries.map(f => (
          <button key={f.id} onClick={()=>onSelectFolder(f.id)}
            className={`text-xs px-2.5 py-1 rounded-lg border ${selFolder===f.id ? 'bg-green-600/20 border-green-600/40 text-green-400' : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20'}`}>
            {f.name} ({f.imageCount})
          </button>
        ))}
      </div>
      {galleryImages.length>0 && (
        <div className="flex gap-2 flex-wrap">
          {galleryImages.map(img => (
            <button key={img.id} onClick={()=>onSelect(img)}
              className={`relative rounded-xl overflow-hidden border-2 transition-all ${selectedId===img.id ? 'border-green-500' : 'border-transparent hover:border-white/30'}`}>
              <img src={`/api/gallery/images/${img.id}/preview`} alt={img.name} className="w-14 h-14 object-cover"/>
              {selectedId===img.id && <div className="absolute inset-0 bg-green-500/30 flex items-center justify-center"><Check size={14} className="text-white"/></div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ERROR BAR
function ErrorBar({ msg, onClose }) {
  return (
    <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl px-4 py-3 text-sm">
      <AlertCircle size={14} className="shrink-0"/>
      <span className="flex-1 text-sm">{msg}</span>
      {onClose && <button onClick={onClose} className="text-red-400/70 hover:text-red-300 transition-colors"><X size={14}/></button>}
    </div>
  );
}
