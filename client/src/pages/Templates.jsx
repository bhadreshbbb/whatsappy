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
  // Enhanced fields for dynamic product data & Meta approval
  fetched_images: [],          // [{url, alt}] from URL scrape (multiple images)
  selected_fetch_image: '',    // currently selected fetched image URL
  product_data: { title: '', price: '', link: '', image_url: '' },
  example_values: {},          // { varNum: exValue } sent to Meta as example
};
const BLANK_TPL = {
  name: '', category: 'MARKETING', language: 'en',
  is_carousel: true, auto_product_mode: false,   // always carousel for product recommendation
  header_type: 'NONE', header_text: '',
  body: '', footer: '', buttons: [], variable_labels: {},
  carousel_cards: [{ ...BLANK_CARD }, { ...BLANK_CARD }],
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
  const [sendPayloadModal, setSendPayloadModal] = useState(null); // { payload, api_url, curl_command, ... }

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

    // ── Console: log what we're about to submit ──────────────────────────────
    const channelId = localStorage.getItem('channelId') || 'demo';
    console.group('%c📤 SUBMITTING META TEMPLATE', 'color:#22c55e;font-weight:bold;font-size:13px');
    console.log('%cPOST /api/meta-templates', 'color:#86efac;font-weight:bold');
    console.log('Headers:', { 'x-channel-id': channelId, 'Content-Type': 'application/json' });
    console.log('Form data (will be processed by server):', form);
    console.log(`Cards: ${form.carousel_cards?.length || 0} · Auto-mode: ${form.auto_product_mode}`);
    console.groupEnd();

    try {
      const d = await api('/', { method: 'POST', body: JSON.stringify(form) });
      console.group('%c✅ META TEMPLATE SUBMISSION RESULT', 'color:#22c55e;font-weight:bold');
      console.log('Status:', d.template?.meta_status);
      console.log('Template ID:', d.template?.id);
      console.log('Meta Template ID:', d.template?.meta_template_id);
      if (d.template?.meta_error) console.error('Meta error:', d.template.meta_error);
      console.groupEnd();
      setTemplates(prev => [d.template, ...prev]);
      setLastCreated(d.template);
      setView('success');
    } catch (e) {
      console.error('[MetaTemplate] Submit failed:', e.message);
      setError(e.message);
    }
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

  async function checkSendPayload(tpl) {
    try {
      const d = await fetch(`${BASE}/${tpl.id}/send-payload`, { headers: CH() }).then(r => r.json());
      setSendPayloadModal({ ...d, tplName: tpl.name });

      // ── Console: full /messages API call details ────────────────────────────
      console.group('%c📨 WHATSAPP SEND MESSAGE PAYLOAD', 'color:#f97316;font-weight:bold;font-size:13px');
      console.log(`%c${d.method} ${d.api_url}`, 'color:#fdba74;font-weight:bold');
      console.log('Authorization:', d.auth_header || 'Bearer <YOUR_WHATSAPP_TOKEN>');
      console.log('Content-Type:', 'application/json');
      console.log('%cFull Payload:', 'color:#fb923c;font-weight:bold');
      console.log(JSON.stringify(d.payload, null, 2));
      if (d.products?.length > 0) {
        console.log('%cCurrent Products in Message:', 'color:#fb923c');
        d.products.forEach((p, i) => console.log(`  Card ${i + 1}:`, p));
      }
      if (d.last_refresh) console.log('Last Product Refresh:', d.last_refresh);
      if (d.next_refresh) console.log('Next 6h Refresh:', d.next_refresh);
      if (d.curl_command) {
        console.log('%c\n── CURL ──────────────────────────────────────', 'color:#64748b');
        console.log(d.curl_command);
      }
      console.groupEnd();
    } catch (e) {
      console.error('[MetaTemplate] Failed to fetch send payload:', e.message);
      setError(e.message);
    }
  }

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
                <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                  <button onClick={() => setPreviewTpl(tpl)} title="Preview WhatsApp message"
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all border border-white/5 hover:border-white/15">
                    <Phone size={12} /> Preview
                  </button>
                  {tpl.meta_status === 'APPROVED' && (
                    <button onClick={() => checkSendPayload(tpl)} title="View /messages API payload"
                      className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 text-orange-400 transition-all">
                      <Send size={12} /> Send Payload
                    </button>
                  )}
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
      {/* Send Payload Modal */}
      {sendPayloadModal && <SendPayloadModal data={sendPayloadModal} onClose={() => setSendPayloadModal(null)} />}
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
  const [selFolder, setSelFolder]         = useState('');
  const [pickerCard, setPickerCard]       = useState(null);
  const [hotProducts, setHotProducts]     = useState([]);
  const [hotLoading, setHotLoading]       = useState(false);
  const [showPreview, setShowPreview]     = useState(true);
  const [payloadModal, setPayloadModal]   = useState(null);   // null | { payload, curl }
  const [payloadLoading, setPayloadLoading] = useState(false);

  async function loadHotProducts() {
    if (hotLoading) return;
    setHotLoading(true);
    try {
      const d = await fetch(`${BASE}/hot-products?limit=10`, { headers: CH() }).then(r=>r.json());
      setHotProducts(d.products || []);
      return d.products || [];
    }
    catch (_) { return []; }
    finally { setHotLoading(false); }
  }

  // Build a card pre-filled from a hot product
  function hotToCard(hot) {
    let slug = hot.url || '';
    try { slug = new URL(hot.url).pathname.split('/').filter(Boolean).pop() || slug; } catch(_) {}
    return {
      ...BLANK_CARD,
      source: 'auto',
      product_data: { title: hot.name||'', price: hot.price||'', link: hot.url||'', image_url: hot.image||'' },
      selected_fetch_image: hot.image || '',
      fetched_images: hot.image ? [{ url: hot.image, alt: hot.name||'' }] : [],
      var_map: { '1': 'product_title', '2': 'product_price', '3': 'product_link' },
      example_values: { '1': hot.name||'Product Name', '2': hot.price||'₹799', '3': slug||'product' },
      _hot_preview: hot,
    };
  }

  // When Auto-Product Mode is toggled ON: immediately fetch & fill all cards from hot products
  async function toggleAutoMode(checked) {
    f('auto_product_mode', checked);
    if (!checked) return;
    setHotLoading(true);
    try {
      const d = await fetch(`${BASE}/hot-products?limit=10`, { headers: CH() }).then(r=>r.json());
      const hots = d.products || [];
      setHotProducts(hots);
      if (hots.length === 0) return;
      const newCards = hots.slice(0, 10).map(hot => hotToCard(hot));
      while (newCards.length < 2) newCards.push({ ...BLANK_CARD, source: 'auto' });
      f('carousel_cards', newCards);
    } catch(_) {} finally { setHotLoading(false); }
  }

  async function checkPayload() {
    setPayloadLoading(true);
    try {
      const d = await api('/preview-payload', { method: 'POST', body: JSON.stringify(form) });
      setPayloadModal(d);

      // ── Console: full API call details ──────────────────────────────────────
      console.group('%c📋 META TEMPLATE CREATION PAYLOAD', 'color:#3b82f6;font-weight:bold;font-size:13px');
      console.log(`%c${d.method} ${d.meta_api_url}`, 'color:#93c5fd;font-weight:bold');
      console.log('Authorization:', d.auth_header || 'Bearer <YOUR_WHATSAPP_TOKEN>');
      console.log('Content-Type:', 'application/json');
      console.log('%cFull Payload:', 'color:#a5b4fc;font-weight:bold');
      console.log(JSON.stringify(d.payload, null, 2));
      if (d.notes?.cards_count !== 'N/A (standard template)') {
        console.log(`Carousel Cards: ${d.notes?.cards_count} · Language: ${d.notes?.language_sent}`);
      }
      if (d.curl_command) {
        console.log('%c\n── CURL ──────────────────────────────────────', 'color:#64748b');
        console.log(d.curl_command);
      }
      console.groupEnd();
    } catch (e) { setError(e.message); }
    finally { setPayloadLoading(false); }
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
  // setCardVarMap — also auto-syncs example_values from product_data
  function setCardVarMap(idx, varNum, val) {
    const cards = [...form.carousel_cards];
    const card  = cards[idx];
    const pd    = card.product_data || {};
    const fieldToValue = {
      product_title: pd.title  || '',
      product_price: pd.price  || '',
      product_link:  pd.link   || '',
      customer_name: 'Customer',
      cart_total:    pd.cart_total || '',
      cart_link:     pd.link   || '',
    };
    const autoEx = fieldToValue[val] || '';
    cards[idx] = {
      ...card,
      var_map: { ...(card.var_map || {}), [varNum]: val },
      example_values: { ...(card.example_values || {}), [varNum]: autoEx || (card.example_values || {})[varNum] || '' },
    };
    f('carousel_cards', cards);
  }
  // setExampleValue — manual edit of a single example value
  function setExampleValue(idx, varNum, val) {
    const cards = [...form.carousel_cards];
    cards[idx] = { ...cards[idx], example_values: { ...(cards[idx].example_values || {}), [varNum]: val } };
    f('carousel_cards', cards);
  }
  // updateProductData — patch product_data fields and keep example_values in sync
  function updateProductData(idx, patch) {
    const cards  = [...form.carousel_cards];
    const card   = cards[idx];
    const newPd  = { ...(card.product_data || {}), ...patch };
    const varMap = card.var_map || {};
    const exVals = { ...(card.example_values || {}) };
    for (const [vn, field] of Object.entries(varMap)) {
      if (field === 'product_title' && patch.title  !== undefined) exVals[vn] = patch.title;
      if (field === 'product_price' && patch.price  !== undefined) exVals[vn] = patch.price;
      if (field === 'product_link'  && patch.link   !== undefined) exVals[vn] = patch.link;
    }
    const updates = { product_data: newPd, example_values: exVals };
    if (patch.fetched_images        !== undefined) updates.fetched_images       = patch.fetched_images;
    if (patch.selected_fetch_image  !== undefined) updates.selected_fetch_image = patch.selected_fetch_image;
    // auto-set first fetched image as selected if not already set
    if (patch.fetched_images?.length && !card.selected_fetch_image && !card.image_id) {
      updates.selected_fetch_image = patch.fetched_images[0].url;
    }
    cards[idx] = { ...card, ...updates };
    f('carousel_cards', cards);
  }
  function addCard() {
    if (form.carousel_cards.length >= 10) return;
    // In auto mode: add the next hot product as the new card
    if (form.auto_product_mode && hotProducts.length > form.carousel_cards.length) {
      const nextHot = hotProducts[form.carousel_cards.length];
      f('carousel_cards', [...form.carousel_cards, hotToCard(nextHot)]);
    } else {
      f('carousel_cards', [...form.carousel_cards, { ...BLANK_CARD }]);
    }
  }
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
  // assignHotProduct — fills ALL fields (image, title, price, link, example_values)
  function assignHotProduct(idx, hot) {
    const cards  = [...form.carousel_cards];
    const card   = cards[idx];
    const varMap = card.var_map || {};
    const exVals = { ...(card.example_values || {}) };
    for (const [vn, field] of Object.entries(varMap)) {
      if (field === 'product_title') exVals[vn] = hot.name  || '';
      if (field === 'product_price') exVals[vn] = hot.price || '';
      if (field === 'product_link')  exVals[vn] = hot.url   || '';
    }
    const images = hot.image ? [{ url: hot.image, alt: hot.name || '' }] : [];
    cards[idx] = {
      ...card,
      source: 'auto',
      _hot_preview: hot,
      product_data: { title: hot.name||'', price: hot.price||'', link: hot.url||'', image_url: hot.image||'' },
      fetched_images: images,
      selected_fetch_image: card.image_id ? card.selected_fetch_image : (hot.image || card.selected_fetch_image || ''),
      example_values: exVals,
    };
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

          {/* ── CAROUSEL PRODUCT TEMPLATE ─────────────────────────── */}
          {/* Auto-product mode banner */}
          <div className={`rounded-xl px-4 py-3 border transition-all ${form.auto_product_mode ? 'bg-orange-500/10 border-orange-500/30' : 'bg-white/[0.02] border-white/10'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame size={14} className={form.auto_product_mode ? 'text-orange-400' : 'text-slate-500'} />
                <div>
                  <p className="text-white text-sm font-medium">Auto-Product Mode</p>
                  <p className="text-slate-500 text-xs">
                    {form.auto_product_mode
                      ? `Auto-filled ${form.carousel_cards.length} products from tracking data · refreshes every 6h`
                      : 'Fill cards automatically from most-viewed + abandoned-cart products'}
                  </p>
                </div>
              </div>
              <label className="toggle-switch shrink-0">
                <input type="checkbox" checked={form.auto_product_mode} onChange={e => toggleAutoMode(e.target.checked)} />
                <span className="toggle-slider" />
              </label>
            </div>
            {hotLoading && (
              <div className="mt-3 flex items-center gap-2 text-orange-400/70 text-xs">
                <Loader2 size={11} className="animate-spin"/> Fetching trending products…
              </div>
            )}
          </div>

          {/* Intro */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-slate-400 text-xs font-medium">Intro Message <span className="text-slate-600">(optional — appears above carousel)</span></label>
              <button onClick={() => addVar('body')} className="var-btn">+ Var</button>
            </div>
            <input value={form.body} onChange={e => f('body', e.target.value)}
              placeholder="Check out these products picked for you! 🛍️" className="input text-sm" />
          </div>

          {/* Cards header */}
          <div className="flex items-center justify-between">
            <label className="text-white font-medium text-sm">
              Product Cards
              <span className="text-slate-500 font-normal text-xs ml-1">
                ({form.carousel_cards.length}/10 — min 2
                {form.auto_product_mode ? ' · auto-mode' : ''})
              </span>
            </label>
            {form.carousel_cards.length < 10 && (
              <button onClick={addCard} className={`var-btn flex items-center gap-1 ${form.auto_product_mode ? 'text-orange-300 border-orange-500/30' : ''}`}>
                <Plus size={11} />
                {form.auto_product_mode ? 'Add Next Hot Product' : 'Add Card'}
              </button>
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
                onSetExampleValue={(vn, val) => setExampleValue(idx, vn, val)}
                onUpdateProductData={(patch) => updateProductData(idx, patch)}
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

          <div className="flex gap-3 pt-2 border-t border-white/10 flex-wrap">
            <button onClick={onBack} className="px-5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-sm transition-all">Cancel</button>
            <button onClick={checkPayload} disabled={payloadLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-700/60 hover:bg-slate-700 border border-white/10 text-slate-300 text-sm transition-all disabled:opacity-50">
              {payloadLoading ? <Loader2 size={13} className="animate-spin"/> : <FileText size={13}/>}
              {payloadLoading ? 'Building…' : 'Check Payload'}
            </button>
            <button onClick={onSubmit} disabled={loading}
              className="flex items-center gap-2 px-6 py-2 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-medium transition-all ml-auto">
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

      {/* Payload inspector modal */}
      {payloadModal && <PayloadModal data={payloadModal} onClose={() => setPayloadModal(null)} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CAROUSEL CARD EDITOR — Enhanced: multi-image fetch, editable product data, dynamic vars + Meta examples
function CarouselCardEditor({ card, idx, totalCards, hotProducts, hotLoading, galleries, galleryImages, pickerCard, selFolder, onSetSelFolder, loadFolderImages, onSetPickerCard, loadHotProducts, onUpdateCard, onSetSource, onSetVarMap, onSetExampleValue, onUpdateProductData, onAddVar, onRemoveCard, onAddButton, onRemoveButton, onUpdateButton, onSelectImage, onAssignHotProduct }) {
  const source      = card.source || 'manual';
  const bodyVars    = extractVars(card.body);
  const productData = card.product_data || {};
  const fetchedImgs = card.fetched_images || [];
  const selFetchImg = card.selected_fetch_image || '';
  const exVals      = card.example_values || {};

  // Best available preview image: gallery > selected fetched > product image_url
  const previewSrc = card.image_id
    ? `/api/gallery/images/${card.image_id}/preview`
    : selFetchImg || productData.image_url || '';

  const allExamplesFilled = bodyVars.length > 0 && bodyVars.every(v => exVals[v]?.trim());

  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-2xl overflow-hidden">
      {/* ── Title bar ── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-white/[0.02] border-b border-white/5">
        <span className="text-purple-400 text-xs font-semibold flex items-center gap-1.5">
          <LayoutGrid size={11} /> Card {idx + 1}
          {card.image_id    && <span className="text-green-400 flex items-center gap-0.5"><Check size={10}/>Gallery ✓</span>}
          {!card.image_id && previewSrc && <span className="text-blue-400 flex items-center gap-0.5"><Image size={10}/>Image ✓</span>}
          {allExamplesFilled && <span className="text-green-400 flex items-center gap-0.5"><Sparkles size={10}/>Examples ✓</span>}
          {bodyVars.length > 0 && !allExamplesFilled && <span className="text-yellow-400/70 flex items-center gap-0.5"><AlertCircle size={10}/>Needs Examples</span>}
        </span>
        {totalCards > 2 && (
          <button onClick={onRemoveCard} className="p-1 text-slate-600 hover:text-red-400 rounded transition-colors"><X size={13} /></button>
        )}
      </div>

      <div className="p-4 flex flex-col gap-4">

        {/* ── IMAGE PREVIEW + SELECTION ─────────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          {/* Large preview */}
          <div className="w-full h-40 rounded-xl overflow-hidden border border-white/10 bg-white/5 relative flex items-center justify-center group">
            {previewSrc
              ? <>
                  <img src={previewSrc} alt="" className="w-full h-full object-cover" onError={e=>{e.target.style.display='none';}} />
                  <div className="absolute top-2 right-2">
                    {card.image_id
                      ? <span className="text-[10px] bg-green-600/90 text-white px-2 py-0.5 rounded-full font-medium">Gallery</span>
                      : <span className="text-[10px] bg-blue-600/90 text-white px-2 py-0.5 rounded-full font-medium">Auto-fetched</span>
                    }
                  </div>
                </>
              : <div className="flex flex-col items-center gap-2 text-slate-600">
                  <ImagePlus size={28} />
                  <span className="text-xs">No image yet</span>
                  <span className="text-[11px] text-slate-700">Fetch URL or pick from Gallery</span>
                </div>
            }
          </div>

          {/* Fetched images strip — click to select */}
          {fetchedImgs.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-slate-500 text-[11px] flex items-center gap-1">
                <Image size={10}/> {fetchedImgs.length} image{fetchedImgs.length > 1 ? 's' : ''} fetched — click to use:
              </p>
              <div className="flex gap-2 flex-wrap">
                {fetchedImgs.map((img, fi) => (
                  <button key={fi} onClick={() => onUpdateCard('selected_fetch_image', img.url)}
                    title={img.alt || `Image ${fi+1}`}
                    className={`relative w-14 h-14 rounded-lg overflow-hidden border-2 transition-all shrink-0 ${
                      selFetchImg === img.url ? 'border-blue-500 scale-105' : 'border-transparent hover:border-white/30'
                    }`}>
                    <img src={img.url} alt={img.alt||''} className="w-full h-full object-cover"
                      onError={e=>{e.target.parentElement.style.display='none';}} />
                    {selFetchImg === img.url && (
                      <div className="absolute inset-0 bg-blue-500/30 flex items-center justify-center">
                        <Check size={12} className="text-white"/>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Gallery picker toggle + clear */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => { onSetPickerCard(pickerCard===idx?null:idx); if(pickerCard!==idx&&galleries.length>0){onSetSelFolder(galleries[0].id);loadFolderImages(galleries[0].id);} }}
              className="var-btn flex items-center gap-1">
              <Image size={11} /> {card.image_id ? 'Change Gallery Image' : 'Pick from Gallery'}
            </button>
            {previewSrc && (
              <button
                onClick={() => { onUpdateCard('image_id',''); onUpdateCard('header_media_id',''); onUpdateCard('selected_fetch_image',''); }}
                className="var-btn" style={{color:'rgba(248,113,113,0.8)'}}>Clear Image</button>
            )}
          </div>

          {/* Inline gallery picker */}
          {pickerCard === idx && (
            <InlineGalleryPicker galleries={galleries} galleryImages={galleryImages}
              selectedId={card.image_id} selFolder={selFolder}
              onSelectFolder={id=>{onSetSelFolder(id);loadFolderImages(id);}}
              onSelect={onSelectImage} accentColor="purple" />
          )}
        </div>

        {/* ── SOURCE TABS ─────────────────────────────────────────────────── */}
        <div className="flex bg-white/5 rounded-lg p-0.5 gap-0.5">
          {[
            {k:'manual', l:'Manual',      I:Type,     c:'purple'},
            {k:'url',    l:'URL Fetch',   I:Globe,    c:'blue'},
            {k:'auto',   l:'Auto-detect', I:Sparkles, c:'orange'},
          ].map(({k,l,I,c}) => (
            <button key={k} onClick={() => onSetSource(k)}
              className={`flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-md font-medium transition-all ${
                source===k
                  ? c==='orange' ? 'bg-orange-600/30 text-orange-300'
                  : c==='blue'   ? 'bg-blue-600/30 text-blue-300'
                  :                'bg-purple-600/20 text-purple-300'
                : 'text-slate-500 hover:text-slate-300'
              }`}>
              <I size={10}/> {l}
            </button>
          ))}
        </div>

        {/* ── URL FETCH MODE ──────────────────────────────────────────────── */}
        {source === 'url' && (
          <CardScrapeInput
            initialUrl={card.scrape_url}
            onUrlChange={url => onUpdateCard('scrape_url', url)}
            onFill={(data) => onUpdateProductData({
              title:               data.title      || '',
              price:               data.price      || '',
              link:                card.scrape_url || '',
              image_url:           data.images?.[0]?.url || data.image_url || '',
              fetched_images:      data.images || (data.image_url ? [{ url: data.image_url, alt: data.title||'' }] : []),
              selected_fetch_image: data.images?.[0]?.url || data.image_url || '',
            })}
          />
        )}

        {/* ── AUTO-DETECT MODE ────────────────────────────────────────────── */}
        {source === 'auto' && (
          <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-orange-400 text-xs font-medium flex items-center gap-1">
                <Flame size={11}/> Trending + abandoned — click to auto-fill all fields
              </p>
              <button onClick={loadHotProducts} className="text-slate-500 hover:text-slate-300">
                <RefreshCw size={11} className={hotLoading?'animate-spin':''}/>
              </button>
            </div>
            {hotLoading && <div className="skeleton h-10 rounded-lg" />}
            {!hotLoading && hotProducts.length === 0 && (
              <p className="text-slate-500 text-xs">No data yet — builds as visitors browse. Falls back to product catalog.</p>
            )}
            {hotProducts.length > 0 && (
              <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto">
                {hotProducts.slice(0,8).map((hp,hi) => {
                  const isSel = productData.title === hp.name && productData.link === hp.url;
                  return (
                    <button key={hi} onClick={() => onAssignHotProduct(hp)}
                      className={`flex items-center gap-2 p-2 rounded-lg text-left transition-all border ${
                        isSel ? 'border-orange-500/50 bg-orange-500/10' : 'border-white/5 bg-white/5 hover:border-orange-500/25 hover:bg-orange-500/5'
                      }`}>
                      {hp.image
                        ? <img src={hp.image} alt="" className="w-10 h-10 object-cover rounded-lg shrink-0" onError={e=>e.target.style.display='none'} />
                        : <div className="w-10 h-10 bg-white/5 rounded-lg shrink-0 flex items-center justify-center"><Image size={14} className="text-slate-600"/></div>
                      }
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-xs truncate font-medium">{hp.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {hp.price && <span className="text-green-400 text-xs">{hp.price}</span>}
                          {hp.carts > 0 && <span className="text-orange-400 text-xs flex items-center gap-0.5"><ShoppingCart size={8}/>{hp.carts}</span>}
                          {hp.views > 0 && <span className="text-slate-500 text-xs flex items-center gap-0.5"><Eye size={8}/>{hp.views}</span>}
                        </div>
                      </div>
                      {isSel && <Check size={13} className="text-orange-400 shrink-0"/>}
                      <span className="text-xs text-slate-600 shrink-0">#{hi+1}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── EDITABLE PRODUCT DATA — always visible, pre-filled from source ── */}
        <div className="bg-white/[0.02] border border-white/[0.07] rounded-xl p-3 flex flex-col gap-3">
          <p className="text-slate-400 text-xs font-medium flex items-center gap-1.5">
            <Type size={11}/> Product Details
            <span className="text-slate-600 font-normal text-[11px]">editable · auto-filled from URL/auto-detect</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-slate-500 text-[11px]">Title</label>
              <input value={productData.title||''} onChange={e => onUpdateProductData({ title: e.target.value })}
                placeholder="e.g. Blue Cotton Kurti" className="input text-xs" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-slate-500 text-[11px]">Price</label>
              <input value={productData.price||''} onChange={e => onUpdateProductData({ price: e.target.value })}
                placeholder="e.g. ₹799" className="input text-xs" />
            </div>
            <div className="col-span-2 flex flex-col gap-1">
              <label className="text-slate-500 text-[11px]">Product Link</label>
              <input value={productData.link||''} onChange={e => onUpdateProductData({ link: e.target.value })}
                placeholder="https://yourstore.com/product" className="input text-xs font-mono" />
            </div>
          </div>
        </div>

        {/* ── BODY TEXT ───────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-slate-500 text-xs">Body Text * <span className="text-slate-600">use {`{{1}}`} {`{{2}}`} etc.</span></label>
            <button onClick={onAddVar} className="var-btn">+ Add Var</button>
          </div>
          <textarea value={card.body} onChange={e => onUpdateCard('body', e.target.value)}
            placeholder={"{{1}}\n₹{{2}}"} rows={3} className="input text-sm resize-none" />
          <p className="text-slate-600 text-[11px]">Variables are replaced with live product data when sending. Example values below are shown to Meta for approval.</p>
        </div>

        {/* ── VARIABLE MAPPING + EXAMPLE VALUES ──────────────────────────── */}
        {bodyVars.length > 0 && (
          <div className="bg-green-500/5 border border-green-500/15 rounded-xl p-3 flex flex-col gap-2.5">
            <p className="text-green-400 text-xs font-medium flex items-center gap-1">
              <Sparkles size={11}/> Variable Mapping
              <span className="text-slate-500 font-normal ml-1 text-[11px]">— example values required for Meta approval</span>
            </p>
            {bodyVars.map(v => {
              const mapped = (card.var_map||{})[v] || '';
              const exVal  = exVals[v] || '';
              return (
                <div key={v} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-green-400 font-mono text-xs w-10 shrink-0">{`{{${v}}}`}</span>
                    <select value={mapped} onChange={e => onSetVarMap(v, e.target.value)} className="input text-xs flex-1">
                      <option value="">— maps to what? —</option>
                      {VAR_FIELD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 ml-10">
                    <div className="flex-1 relative">
                      <input
                        value={exVal}
                        onChange={e => onSetExampleValue(v, e.target.value)}
                        placeholder={mapped ? `Example for Meta (e.g. ${mapped==='product_title'?'Blue Kurti':mapped==='product_price'?'₹799':'https://...'})` : 'Enter example value…'}
                        className={`input text-xs w-full pr-6 ${
                          exVal ? 'border-green-500/40' : 'border-yellow-500/30'
                        }`}
                      />
                      {exVal
                        ? <Check size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-green-400"/>
                        : <AlertCircle size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-yellow-400/70"/>
                      }
                    </div>
                    {mapped === 'custom' && (
                      <input placeholder="Fixed text" value={(card.var_map||{})[`${v}_custom`]||''}
                        onChange={e=>onSetVarMap(`${v}_custom`,e.target.value)} className="input text-xs flex-1" />
                    )}
                  </div>
                </div>
              );
            })}
            {bodyVars.some(v => !exVals[v]?.trim()) && (
              <p className="text-yellow-400/70 text-[11px] flex items-center gap-1 mt-1">
                <AlertCircle size={10}/> Fill all example values — Meta may reject without them
              </p>
            )}
          </div>
        )}

        {/* ── BUTTONS ─────────────────────────────────────────────────────── */}
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
// CARD SCRAPE INPUT — URL fetch for carousel cards, returns multiple images
function CardScrapeInput({ onFill, initialUrl, onUrlChange }) {
  const [url, setUrl]         = useState(initialUrl || '');
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);
  const [err, setErr]         = useState('');

  async function handleFetch() {
    if (!url.trim()) return;
    setLoading(true); setErr(''); setResult(null);
    try {
      const res  = await fetch(`${BASE}/scrape-product`, {
        method: 'POST',
        headers: { ...CH(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch product');
      setResult(data);
      onFill(data);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 flex flex-col gap-2">
      <label className="text-blue-400 text-xs font-semibold flex items-center gap-1">
        <Globe size={11}/> Auto-fill from Product URL
        <span className="text-slate-500 font-normal ml-1">(Shopify / any store)</span>
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
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/30 text-blue-400 text-xs font-medium disabled:opacity-50 shrink-0 transition-all">
          {loading ? <Loader2 size={11} className="animate-spin"/> : <Globe size={11}/>}
          {loading ? 'Fetching…' : 'Fetch'}
        </button>
      </div>
      {err && <p className="text-red-400 text-xs">{err}</p>}
      {result && (
        <div className="flex items-start gap-2 bg-blue-500/10 rounded-lg p-2">
          {result.image_url && <img src={result.image_url} alt="" className="w-12 h-12 object-cover rounded-lg shrink-0" onError={e=>e.target.style.display='none'} />}
          <div className="flex-1 min-w-0">
            {result.title && <p className="text-white text-xs font-medium truncate">{result.title}</p>}
            {result.price && <p className="text-green-400 text-xs">{result.price}</p>}
            <div className="flex items-center gap-2 mt-1">
              {result.images?.length > 1 && (
                <span className="text-blue-400 text-xs flex items-center gap-1">
                  <Image size={9}/> {result.images.length} images — select above
                </span>
              )}
              <span className="text-blue-400 text-xs flex items-center gap-1">
                <CheckCircle2 size={9}/> Fields auto-filled
              </span>
            </div>
          </div>
        </div>
      )}
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
    const text = resolveText(card.body, vm, pc.title ? pc : (card.product_data || {}), sampleProduct);
    // Image priority: configured gallery > fetched auto image > product_data image > legacy fallbacks
    const imageUrl = pc.image_id
      ? `/api/gallery/images/${pc.image_id}/preview`
      : card.selected_fetch_image || card.product_data?.image_url
        || pc._hot_image_url || card._hot_preview?.image || null;
    return { text, imageUrl, buttons: card.buttons || [], title: pc.title || card.product_data?.title || sampleProduct?.title, price: pc.price || card.product_data?.price || sampleProduct?.price };
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
// PAYLOAD MODAL — shows the exact JSON that will be sent to Meta Graph API
function PayloadModal({ data, onClose }) {
  const [copied, setCopied] = useState(false);
  const jsonStr = JSON.stringify(data.payload, null, 2);

  function copyJson() {
    navigator.clipboard.writeText(jsonStr);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }

  // Check for potential issues
  const cards = data.payload?.components?.find(c => c.type === 'CAROUSEL')?.cards || [];
  const missingImages = cards.filter(c => !c.components?.find(h => h.type === 'HEADER')?.example?.header_handle?.[0]);
  const missingBody   = cards.filter(c => !c.components?.find(b => b.type === 'BODY')?.text);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <FileText size={15} className="text-blue-400"/>
            <span className="text-white font-semibold text-sm">Meta API Payload Inspector</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20">
              {data.meta_api_url?.includes('v') ? data.meta_api_url.match(/v[\d.]+/)?.[0] : 'v25.0'}
            </span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all"><X size={15}/></button>
        </div>

        {/* Warnings */}
        {(missingImages.length > 0 || missingBody.length > 0) && (
          <div className="px-5 py-3 border-b border-white/5 bg-yellow-500/5 flex flex-col gap-1.5">
            <p className="text-yellow-400 text-xs font-semibold flex items-center gap-1"><AlertCircle size={11}/> Potential Issues</p>
            {missingImages.length > 0 && (
              <p className="text-yellow-400/80 text-xs">
                {missingImages.length} card{missingImages.length > 1 ? 's' : ''} missing <code className="bg-black/30 px-1 rounded">header_handle</code> — upload images to Gallery first, or template may be rejected.
              </p>
            )}
            {missingBody.length > 0 && (
              <p className="text-red-400/80 text-xs">{missingBody.length} card{missingBody.length > 1 ? 's' : ''} missing body text.</p>
            )}
          </div>
        )}

        {/* Info bar */}
        <div className="px-5 py-2.5 border-b border-white/5 bg-white/[0.02] flex items-center gap-3 flex-wrap text-xs text-slate-400">
          <span className="font-mono text-blue-300">{data.method} {data.meta_api_url}</span>
          {data.notes?.cards_count !== 'N/A (standard template)' && (
            <span className="text-purple-400">{data.notes?.cards_count} carousel cards</span>
          )}
          <span className="text-slate-500">lang: {data.notes?.language_sent}</span>
        </div>

        {/* JSON */}
        <div className="flex-1 overflow-y-auto p-5">
          <pre className="text-xs font-mono text-slate-300 leading-relaxed whitespace-pre-wrap break-all">
            {jsonStr}
          </pre>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/10 flex items-center justify-between gap-3">
          <p className="text-slate-500 text-xs">This exact JSON will be POSTed to Meta when you click "Submit to Meta"</p>
          <button onClick={copyJson}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 text-blue-400 text-xs font-medium transition-all">
            {copied ? <Check size={12}/> : <Copy size={12}/>}
            {copied ? 'Copied!' : 'Copy JSON'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SEND PAYLOAD MODAL — shows the /messages API payload for campaign sending
function SendPayloadModal({ data, onClose }) {
  const [copied, setCopied]       = useState(false);
  const [tab, setTab]             = useState('payload');   // 'payload' | 'curl' | 'products'
  const payloadStr = JSON.stringify(data.payload, null, 2);
  const hasProducts = (data.products || []).filter(p => p.title).length > 0;

  function copyContent() {
    const text = tab === 'curl' ? (data.curl_command || '') : tab === 'products' ? JSON.stringify(data.products, null, 2) : payloadStr;
    navigator.clipboard.writeText(text);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }

  const cards = data.payload?.template?.components?.find(c => c.type === 'carousel')?.cards || [];
  const missingImages = cards.filter(c => !c.components?.find(h => h.type === 'header')?.parameters?.[0]?.image?.id &&
    !c.components?.find(h => h.type === 'header')?.parameters?.[0]?.image?.link);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <Send size={15} className="text-orange-400"/>
            <span className="text-white font-semibold text-sm">WhatsApp /messages Send Payload</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/20 font-mono">v25.0</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all"><X size={15}/></button>
        </div>

        {/* API info bar */}
        <div className="px-5 py-2.5 border-b border-white/5 bg-white/[0.02] flex flex-col gap-1 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-orange-300 font-bold">{data.method || 'POST'} {data.api_url}</span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Authorization: <span className="text-slate-300 font-mono">{data.auth_header || 'Bearer <YOUR_TOKEN>'}</span></span>
            <span>Content-Type: <span className="text-slate-300">application/json</span></span>
          </div>
          {data.last_refresh && (
            <div className="flex items-center gap-3 text-slate-500">
              <span className="flex items-center gap-1"><RefreshCw size={9}/> Last refresh: {new Date(data.last_refresh).toLocaleString()}</span>
              {data.next_refresh && <span>· Next: {new Date(data.next_refresh).toLocaleString()}</span>}
            </div>
          )}
        </div>

        {/* Warnings */}
        {missingImages.length > 0 && (
          <div className="px-5 py-2.5 border-b border-white/5 bg-yellow-500/5">
            <p className="text-yellow-400 text-xs flex items-center gap-1">
              <AlertCircle size={11}/>
              {missingImages.length} card{missingImages.length > 1 ? 's' : ''} missing image id/link — run a 6h refresh or assign gallery images to set header_media_id.
            </p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-3 border-b border-white/5">
          {[
            { id: 'payload', label: 'JSON Payload', icon: FileText },
            { id: 'curl',    label: 'cURL Command', icon: Copy },
            ...(hasProducts ? [{ id: 'products', label: `Products (${data.products?.filter(p=>p.title).length})`, icon: ShoppingCart }] : []),
          ].map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-t-lg border border-b-0 font-medium transition-all ${
                tab === id ? 'bg-[#111827] border-white/10 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}>
              <Icon size={11}/> {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'payload' && (
            <pre className="text-xs font-mono text-slate-300 leading-relaxed whitespace-pre-wrap break-all">
              {payloadStr}
            </pre>
          )}
          {tab === 'curl' && (
            <div className="flex flex-col gap-3">
              <p className="text-slate-500 text-xs">Replace <code className="bg-white/5 px-1 rounded">{'{{RECIPIENT_PHONE}}'}</code> with the actual phone number (e.g. <code className="bg-white/5 px-1 rounded">+919876543210</code>) before sending.</p>
              <pre className="text-xs font-mono text-green-300 leading-relaxed whitespace-pre-wrap break-all bg-black/30 rounded-xl p-4 border border-white/5">
                {data.curl_command || 'No curl command available — credentials may not be configured.'}
              </pre>
            </div>
          )}
          {tab === 'products' && (
            <div className="flex flex-col gap-3">
              <p className="text-slate-500 text-xs">These are the products currently in each carousel card. Auto-refreshed every 6 hours from trending + abandoned cart data.</p>
              <div className="flex flex-col gap-2">
                {(data.products || []).filter(p => p.title).map((p, i) => (
                  <div key={i} className="flex items-center gap-3 bg-white/[0.03] border border-white/5 rounded-xl p-3">
                    {p.image
                      ? <img src={p.image} alt="" className="w-12 h-12 object-cover rounded-lg shrink-0" onError={e=>e.target.style.display='none'}/>
                      : <div className="w-12 h-12 bg-white/5 rounded-lg shrink-0 flex items-center justify-center"><Image size={16} className="text-slate-600"/></div>
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">Card {i + 1}: {p.title}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        {p.price && <span className="text-green-400 text-xs">{p.price}</span>}
                        {p.link  && <span className="text-slate-500 text-xs font-mono truncate max-w-[200px]">{p.link}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/10 flex items-center justify-between gap-3">
          <p className="text-slate-500 text-xs">
            This payload is sent per-recipient — replace <code className="bg-white/5 px-1 rounded">{'{{RECIPIENT_PHONE}}'}</code> with each phone number.
          </p>
          <button onClick={copyContent}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600/20 hover:bg-orange-600/40 border border-orange-500/30 text-orange-400 text-xs font-medium transition-all shrink-0">
            {copied ? <Check size={12}/> : <Copy size={12}/>}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
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
