import React, { useEffect, useState } from "react";
import {
  Plus, Trash2, RefreshCw, CheckCircle2, Clock, XCircle,
  AlertCircle, Settings2, Send, Image, Type, Link,
  MessageSquare, Zap, Copy, Check, FileText, X
} from "lucide-react";

const BASE = `/api/meta-templates`;
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
  { value: 'MARKETING',      label: 'Marketing' },
  { value: 'UTILITY',        label: 'Utility' },
  { value: 'AUTHENTICATION', label: 'Authentication' },
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

const BLANK_TPL = {
  name: '', category: 'MARKETING', language: 'en',
  header_type: 'NONE', header_text: '',
  body: '', footer: '', buttons: [], variable_labels: [],
};

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
    if (!form.body.trim()) return setError('Body text is required');
    setLoading(true);
    try {
      const d = await api('/', { method: 'POST', body: JSON.stringify(form) });
      setTemplates(prev => [d.template, ...prev]);
      setView('list'); setForm(BLANK_TPL);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function handleRefreshStatus(tpl) {
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

  async function saveProductConfig() {
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
    const vars = extractVars(tpl.body);
    setProductConfig(tpl.product_config || {
      header_image_id: '',
      products: [{ title: '', price: '', link: '', image_id: '' }],
      var_map: vars.reduce((a, v) => ({ ...a, [v]: '' }), {}),
      custom_values: {},
    });
    loadGallery();
    setView('config');
  }

  function extractVars(text) {
    return [...new Set([...(text || '').matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1]))];
  }

  function addVar(field) {
    const vars = extractVars(form[field]);
    const next = vars.length ? Math.max(...vars.map(Number)) + 1 : 1;
    setForm(f => ({ ...f, [field]: f[field] + ` {{${next}}}` }));
  }

  function addButton(type) {
    setForm(f => ({
      ...f,
      buttons: [...f.buttons,
        type === 'URL'          ? { type: 'URL', text: 'Shop Now', url: 'https://yourstore.com/{{1}}' }
        : type === 'QUICK_REPLY' ? { type: 'QUICK_REPLY', text: 'View Product' }
        :                          { type: 'PHONE_NUMBER', text: 'Call Us', phone_number: '+91XXXXXXXXXX' }
      ],
    }));
  }

  function copyName(name) {
    navigator.clipboard.writeText(name);
    setCopied(name); setTimeout(() => setCopied(null), 1500);
  }

  if (view === 'create') return <CreateView form={form} setForm={setForm} error={error} setError={setError}
    loading={loading} onSubmit={submitTemplate} onBack={() => { setView('list'); setError(''); }}
    extractVars={extractVars} addVar={addVar} addButton={addButton} />;

  if (view === 'config') return <ConfigView tpl={selected} config={productConfig} setConfig={setProductConfig}
    galleries={galleries} galleryImages={galleryImages} loadFolderImages={loadFolderImages}
    error={error} loading={loading} onSave={saveProductConfig}
    onBack={() => { setView('list'); setError(''); }} extractVars={extractVars} />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white text-xl font-bold">Meta Templates</h1>
          <p className="text-slate-400 text-sm mt-0.5">Create, submit for approval, then configure product data</p>
        </div>
        <button onClick={() => { setView('create'); setError(''); }}
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
          <p className="text-xs text-center max-w-sm">Templates need Meta approval before you can send campaigns. Usually takes a few minutes to a few hours.</p>
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
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-white font-semibold font-mono">{tpl.name}</span>
                    <button onClick={() => copyName(tpl.name)} className="text-slate-500 hover:text-slate-300" title="Copy name">
                      {copied === tpl.name ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                    </button>
                    <span className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-medium ${sc.bg} ${sc.color}`}>
                      <Icon size={11} /> {sc.label}
                    </span>
                    <span className="text-xs text-slate-500 bg-white/5 px-2 py-0.5 rounded-full">{tpl.category}</span>
                    <span className="text-xs text-slate-500 bg-white/5 px-2 py-0.5 rounded-full">{tpl.language}</span>
                  </div>
                  <p className="text-slate-400 text-sm mt-2 line-clamp-2">{tpl.body}</p>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    {tpl.header_type !== 'NONE' && (
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        {tpl.header_type === 'IMAGE' ? <Image size={11} /> : <Type size={11} />} {tpl.header_type} Header
                      </span>
                    )}
                    {tpl.footer && <span className="text-xs text-slate-500">Footer</span>}
                    {tpl.buttons?.length > 0 && <span className="text-xs text-slate-500">{tpl.buttons.length} Button{tpl.buttons.length > 1 ? 's' : ''}</span>}
                    {tpl.product_config && <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle2 size={11} /> Product config set</span>}
                  </div>
                  {tpl.rejected_reason && <p className="text-xs text-red-400 mt-2">Rejection: {tpl.rejected_reason}</p>}
                  {tpl.meta_error && <p className="text-xs text-red-400 mt-2 font-mono text-ellipsis overflow-hidden">{tpl.meta_error}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => handleRefreshStatus(tpl)} disabled={refreshing[tpl.id]}
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white disabled:opacity-50" title="Refresh status from Meta">
                    <RefreshCw size={14} className={refreshing[tpl.id] ? 'animate-spin' : ''} />
                  </button>
                  {tpl.meta_status === 'APPROVED' && (
                    <button onClick={() => openConfig(tpl)}
                      className="flex items-center gap-1.5 text-xs bg-green-600/20 hover:bg-green-600/40 border border-green-600/30 text-green-400 px-3 py-1.5 rounded-lg">
                      <Settings2 size={13} /> Configure Products
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

function CreateView({ form, setForm, error, setError, loading, onSubmit, onBack, extractVars, addVar, addButton }) {
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const bodyVars   = extractVars(form.body);
  const headerVars = extractVars(form.header_text);

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-slate-400 hover:text-white"><X size={20} /></button>
        <h1 className="text-white text-xl font-bold">Create Meta Template</h1>
      </div>
      {error && <ErrorBar msg={error} onClose={() => setError('')} />}

      <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 flex flex-col gap-5">
        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-slate-400 text-xs font-medium">Template Name *</label>
            <input value={form.name} onChange={e => f('name', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
              placeholder="product_promo_v1" className="input text-sm font-mono" />
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

        <div className="flex flex-col gap-2">
          <label className="text-slate-400 text-xs font-medium">Header Type</label>
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
              <textarea value={form.header_text} onChange={e => f('header_text', e.target.value)}
                placeholder="Header text with {{1}} variables" rows={2} className="input text-sm flex-1 resize-none" />
              <button onClick={() => addVar('header_text')} className="var-btn">+ Var</button>
            </div>
          )}
          {form.header_type === 'IMAGE' && (
            <p className="text-xs text-slate-500 bg-white/5 px-3 py-2 rounded-lg">
              Image header — select from Gallery after approval in the Configure Products step.
            </p>
          )}
          {headerVars.length > 0 && <VarLabels vars={headerVars} labels={form.variable_labels} onChange={v => f('variable_labels', v)} prefix="Header" />}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-slate-400 text-xs font-medium">
              Body Text * <span className="text-slate-600">— use {`{{1}}`} {`{{2}}`} {`{{3}}`} for variables</span>
            </label>
            <button onClick={() => addVar('body')} className="var-btn">+ Add Variable</button>
          </div>
          <textarea value={form.body} onChange={e => f('body', e.target.value)}
            placeholder={"Hi {{1}}! 👋 Check out {{2}} for just ₹{{3}}.\n\nLimited time offer — tap below to shop!"} rows={5}
            className="input text-sm resize-none" />
          <p className="text-xs text-slate-600">{form.body.length}/1024</p>
          {bodyVars.length > 0 && <VarLabels vars={bodyVars} labels={form.variable_labels} onChange={v => f('variable_labels', v)} prefix="Body" />}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-slate-400 text-xs font-medium">Footer <span className="text-slate-600">(optional)</span></label>
          <input value={form.footer} onChange={e => f('footer', e.target.value)}
            placeholder="Reply STOP to unsubscribe" className="input text-sm" />
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <label className="text-slate-400 text-xs font-medium">Buttons <span className="text-slate-600">(max 3)</span></label>
            {form.buttons.length < 3 && (
              <div className="flex gap-1.5">
                <button onClick={() => addButton('URL')} className="var-btn"><Link size={11} className="inline mr-1" />URL</button>
                <button onClick={() => addButton('QUICK_REPLY')} className="var-btn"><Zap size={11} className="inline mr-1" />Quick Reply</button>
                <button onClick={() => addButton('PHONE_NUMBER')} className="var-btn"><MessageSquare size={11} className="inline mr-1" />Phone</button>
              </div>
            )}
          </div>
          {form.buttons.map((btn, i) => (
            <div key={i} className="flex gap-2 items-center bg-white/5 rounded-xl p-3">
              <span className="text-xs text-slate-500 w-24 shrink-0">{btn.type}</span>
              <input value={btn.text} onChange={e => { const b = [...form.buttons]; b[i] = { ...b[i], text: e.target.value }; f('buttons', b); }}
                placeholder="Button label" className="input text-xs flex-1" />
              {btn.type === 'URL' && (
                <input value={btn.url} onChange={e => { const b = [...form.buttons]; b[i] = { ...b[i], url: e.target.value }; f('buttons', b); }}
                  placeholder="https://..." className="input text-xs flex-1 font-mono" />
              )}
              {btn.type === 'PHONE_NUMBER' && (
                <input value={btn.phone_number || ''} onChange={e => { const b = [...form.buttons]; b[i] = { ...b[i], phone_number: e.target.value }; f('buttons', b); }}
                  placeholder="+91XXXXXXXXXX" className="input text-xs flex-1 font-mono" />
              )}
              <button onClick={() => f('buttons', form.buttons.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300"><X size={14} /></button>
            </div>
          ))}
        </div>

        <WhatsAppPreview form={form} />

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

function ConfigView({ tpl, config, setConfig, galleries, galleryImages, loadFolderImages, error, loading, onSave, onBack, extractVars }) {
  const vars = extractVars(tpl.body);
  const set  = (k, v) => setConfig(p => ({ ...p, [k]: v }));
  const setProduct = (i, k, v) => setConfig(p => {
    const arr = [...(p.products || [])]; arr[i] = { ...arr[i], [k]: v };
    return { ...p, products: arr };
  });
  const [selFolder, setSelFolder] = useState('');

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-slate-400 hover:text-white"><X size={20} /></button>
        <div>
          <h1 className="text-white text-xl font-bold">Configure Products</h1>
          <p className="text-slate-400 text-sm font-mono">{tpl.name}</p>
        </div>
      </div>
      {error && <ErrorBar msg={error} />}

      <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 flex flex-col gap-6">

        {tpl.header_type === 'IMAGE' && (
          <div className="flex flex-col gap-3">
            <label className="text-white font-medium text-sm">Header Image <span className="text-slate-400 font-normal">(select from Gallery)</span></label>
            <GalleryPicker galleries={galleries} galleryImages={galleryImages} selectedId={config.header_image_id}
              selFolder={selFolder} onSelectFolder={id => { setSelFolder(id); loadFolderImages(id); }}
              onSelect={img => set('header_image_id', img.id)} />
            {config.header_image_id && (
              <img src={`/api/gallery/images/${config.header_image_id}/preview`} alt=""
                className="w-32 h-32 object-cover rounded-xl border border-white/10" />
            )}
          </div>
        )}

        {vars.length > 0 && (
          <div className="flex flex-col gap-3">
            <label className="text-white font-medium text-sm">Variable Mapping</label>
            <p className="text-slate-500 text-xs">Map each {`{{N}}`} to the data that should replace it when sending</p>
            {vars.map(v => (
              <div key={v} className="flex items-center gap-3 bg-white/5 rounded-xl p-3">
                <span className="text-green-400 font-mono text-sm w-12 shrink-0">{`{{${v}}}`}</span>
                <select value={(config.var_map || {})[v] || ''} className="input text-sm flex-1"
                  onChange={e => set('var_map', { ...(config.var_map || {}), [v]: e.target.value })}>
                  <option value="">— Select field —</option>
                  <optgroup label="Customer"><option value="customer_name">Customer Name</option><option value="phone">Phone</option></optgroup>
                  <optgroup label="Product"><option value="product_title">Product Title</option><option value="product_price">Product Price</option><option value="product_link">Product Link</option></optgroup>
                  <optgroup label="Cart"><option value="cart_total">Cart Total</option><option value="cart_link">Cart Link</option></optgroup>
                  <optgroup label="Fixed"><option value="custom">Custom Text</option></optgroup>
                </select>
                {(config.var_map || {})[v] === 'custom' && (
                  <input placeholder="Fixed value..." className="input text-sm flex-1"
                    value={(config.custom_values || {})[v] || ''}
                    onChange={e => set('custom_values', { ...(config.custom_values || {}), [v]: e.target.value })} />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <label className="text-white font-medium text-sm">Product List</label>
            <button onClick={() => set('products', [...(config.products || []), { title: '', price: '', link: '', image_id: '' }])}
              className="var-btn"><Plus size={12} className="inline mr-1" />Add Product</button>
          </div>
          {(config.products || []).map((prod, i) => (
            <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-xs font-medium">Product {i + 1}</span>
                {(config.products || []).length > 1 && (
                  <button onClick={() => set('products', (config.products || []).filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300"><X size={13} /></button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-slate-500 text-xs">Title</label>
                  <input value={prod.title} onChange={e => setProduct(i, 'title', e.target.value)} placeholder="Blue Cotton Kurti" className="input text-sm" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-slate-500 text-xs">Price</label>
                  <input value={prod.price} onChange={e => setProduct(i, 'price', e.target.value)} placeholder="₹799" className="input text-sm" />
                </div>
                <div className="col-span-2 flex flex-col gap-1.5">
                  <label className="text-slate-500 text-xs">Product Link</label>
                  <input value={prod.link} onChange={e => setProduct(i, 'link', e.target.value)} placeholder="https://yourstore.com/product/..." className="input text-sm font-mono" />
                </div>
                <div className="col-span-2 flex flex-col gap-2">
                  <label className="text-slate-500 text-xs">Product Image (from Gallery)</label>
                  <GalleryPicker galleries={galleries} galleryImages={galleryImages} selectedId={prod.image_id}
                    selFolder={selFolder} onSelectFolder={id => { setSelFolder(id); loadFolderImages(id); }}
                    onSelect={img => setProduct(i, 'image_id', img.id)} />
                  {prod.image_id && (
                    <img src={`/api/gallery/images/${prod.image_id}/preview`} alt="" className="w-20 h-20 object-cover rounded-xl border border-white/10" />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3 pt-2 border-t border-white/10">
          <button onClick={onBack} className="px-5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-sm">Cancel</button>
          <button onClick={onSave} disabled={loading}
            className="flex items-center gap-2 px-6 py-2 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-medium">
            <CheckCircle2 size={14} /> {loading ? 'Saving...' : 'Save Product Config'}
          </button>
        </div>
      </div>
    </div>
  );
}

function GalleryPicker({ galleries, galleryImages, selectedId, onSelectFolder, selFolder, onSelect }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 flex-wrap">
        {galleries.map(f => (
          <button key={f.id} onClick={() => onSelectFolder(f.id)}
            className={`text-xs px-3 py-1.5 rounded-lg border ${selFolder === f.id ? 'bg-green-600/20 border-green-600/40 text-green-400' : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20'}`}>
            {f.name} ({f.imageCount})
          </button>
        ))}
        {galleries.length === 0 && <p className="text-slate-500 text-xs">No gallery folders — upload images in My Gallery first.</p>}
      </div>
      {galleryImages.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {galleryImages.map(img => (
            <div key={img.id} onClick={() => onSelect(img)}
              className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all ${selectedId === img.id ? 'border-green-500' : 'border-transparent hover:border-white/30'}`}
              style={{ width: 64, height: 64 }}>
              <img src={`/api/gallery/images/${img.id}/preview`} alt={img.filename} className="w-full h-full object-cover" />
              {selectedId === img.id && (
                <div className="absolute inset-0 bg-green-500/30 flex items-center justify-center">
                  <Check size={18} className="text-white" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VarLabels({ vars, labels, onChange, prefix }) {
  return (
    <div className="bg-white/5 rounded-xl p-3 flex flex-col gap-2">
      <p className="text-slate-400 text-xs font-medium">{prefix} Variable Labels <span className="text-slate-600">(your reference only)</span></p>
      {vars.map(v => (
        <div key={v} className="flex items-center gap-2">
          <span className="text-green-400 font-mono text-xs w-10">{`{{${v}}}`}</span>
          <input placeholder={`e.g. customer_name`}
            value={(labels || []).find(l => l.var === v)?.label || ''}
            onChange={e => {
              const next = [...(labels || []).filter(l => l.var !== v)];
              if (e.target.value) next.push({ var: v, label: e.target.value });
              onChange(next);
            }} className="input text-xs flex-1" />
        </div>
      ))}
    </div>
  );
}

function WhatsAppPreview({ form }) {
  const preview = (form.body || '')
    .replace(/\{\{1\}\}/g, 'Priya').replace(/\{\{2\}\}/g, 'Blue Kurti')
    .replace(/\{\{3\}\}/g, '₹799').replace(/\{\{4\}\}/g, 'link')
    .replace(/\{\{(\d+)\}\}/g, (_, n) => `[Var${n}]`);
  return (
    <div className="flex flex-col gap-2">
      <label className="text-slate-400 text-xs font-medium">Live Preview</label>
      <div className="bg-[#0a1929] rounded-2xl p-4 flex justify-center">
        <div className="w-64 bg-[#1a2a1a] rounded-2xl overflow-hidden shadow-xl">
          {form.header_type === 'IMAGE' && (
            <div className="w-full h-32 bg-green-900/30 flex items-center justify-center gap-2">
              <Image size={22} className="text-green-600" />
              <span className="text-green-600 text-xs">Image Header</span>
            </div>
          )}
          {form.header_type === 'TEXT' && form.header_text && (
            <div className="px-3 pt-3 font-bold text-white text-sm">{form.header_text.replace(/\{\{(\d+)\}\}/g, (_, n) => `[Var${n}]`)}</div>
          )}
          <div className="p-3">
            <p className="text-white text-sm whitespace-pre-wrap">{preview || 'Your message will appear here...'}</p>
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

function ErrorBar({ msg, onClose }) {
  return (
    <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-4 py-3 rounded-xl">
      <AlertCircle size={14} /> {msg}
      {onClose && <button onClick={onClose} className="ml-auto"><X size={12} /></button>}
    </div>
  );
}
