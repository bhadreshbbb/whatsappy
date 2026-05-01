import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  Users, Flame, Activity, Package, ShoppingCart, MousePointer, Repeat,
  CheckCircle, UserCheck, Smartphone, Monitor, Tablet,
  Filter, X, ChevronDown, ChevronUp, Search, TrendingDown,
  Globe, Megaphone, Trophy, Zap, Phone, RefreshCw,
} from "lucide-react";
import { analyticsApi, visitorsApi } from "../api";

/* ─── helpers ─────────────────────────────────────────────────────────────── */
function timeAgo(iso) {
  if (!iso) return '—';
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString('en', { day: 'numeric', month: 'short' });
}

function shortUrl(u) {
  try { const p = new URL(u); return p.hostname.replace('www.', '') + p.pathname.slice(0, 30); }
  catch { return (u || '').slice(0, 40); }
}

const fmt = s =>
  s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
: s >= 60   ? `${Math.floor(s / 60)}m ${s % 60}s`
:              `${s}s`;

/* ─── Score badge ─────────────────────────────────────────────────────────── */
const ScoreBadge = ({ score }) => {
  const cfg =
    score >= 80 ? { label: 'Hot',    color: "#f87171", bg: "rgba(239,68,68,0.1)",    border: "rgba(239,68,68,0.3)"    } :
    score >= 60 ? { label: 'High',   color: "#fb923c", bg: "rgba(249,115,22,0.1)",   border: "rgba(249,115,22,0.3)"   } :
    score >= 40 ? { label: 'Medium', color: "#fbbf24", bg: "rgba(245,158,11,0.1)",   border: "rgba(245,158,11,0.3)"   } :
    score >= 20 ? { label: 'Low',    color: "#60a5fa", bg: "rgba(59,130,246,0.1)",   border: "rgba(59,130,246,0.3)"   } :
                  { label: 'Cold',   color: "#64748b", bg: "rgba(100,116,139,0.1)",  border: "rgba(100,116,139,0.3)"  };
  return (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color }}>
      {score >= 60 && <Flame size={8} />}{score} {cfg.label}
    </span>
  );
};

/* ─── Mini bar ────────────────────────────────────────────────────────────── */
function MiniBar({ pct, color = "#3b82f6", width = 60 }) {
  return (
    <div className="flex items-center gap-1.5">
      <div style={{ width, height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(pct || 0, 100)}%`, height: "100%", background: color, borderRadius: 99 }} />
      </div>
      <span className="text-xs font-mono" style={{ color: "#94a3b8" }}>{pct || 0}%</span>
    </div>
  );
}

/* ─── Sort header ─────────────────────────────────────────────────────────── */
function SortTh({ col, label, sortBy, sortDir, onSort }) {
  const active = sortBy === col;
  return (
    <th onClick={() => onSort(col)}
      className="text-left py-2.5 px-3 font-medium cursor-pointer select-none whitespace-nowrap transition-colors"
      style={{ color: active ? "#e2e8f0" : "#64748b" }}
      onMouseEnter={e => e.currentTarget.style.color = "#e2e8f0"}
      onMouseLeave={e => e.currentTarget.style.color = active ? "#e2e8f0" : "#64748b"}>
      <span className="flex items-center gap-1">
        {label}
        {active ? (sortDir === 'desc' ? <ChevronDown size={11} /> : <ChevronUp size={11} />) : <ChevronDown size={11} style={{ opacity: 0.25 }} />}
      </span>
    </th>
  );
}

/* ─── Filter helpers ──────────────────────────────────────────────────────── */
function SearchInput({ value, onChange, placeholder }) {
  return (
    <div className="relative flex-1 min-w-[180px]">
      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#475569" }} />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || "Search…"}
        className="input pl-7 py-1.5 text-xs w-full" />
      {value && (
        <button onClick={() => onChange('')} className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: "#475569" }}>
          <X size={11} />
        </button>
      )}
    </div>
  );
}

function FilterSelect({ value, onChange, children }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className="input text-xs py-1.5 w-auto">
      {children}
    </select>
  );
}

/* ─── Event timeline card ─────────────────────────────────────────────────── */
const EVENT_META = {
  page_view:          { icon: Globe,        color: "#60a5fa", label: "Page View"          },
  product_view:       { icon: Package,      color: "#a855f7", label: "Product Viewed"     },
  add_to_cart:        { icon: ShoppingCart, color: "#fb923c", label: "Added to Cart"      },
  checkout_started:   { icon: MousePointer, color: "#f59e0b", label: "Checkout Started"   },
  checkout_completed: { icon: CheckCircle,  color: "#4ade80", label: "Checkout Completed" },
  purchase:           { icon: Trophy,       color: "#4ade80", label: "Purchase"           },
  campaign_send:      { icon: Megaphone,    color: "#c084fc", label: "Campaign Sent"      },
  search:             { icon: Search,       color: "#38bdf8", label: "Search"             },
};

function EventCard({ event }) {
  const meta = EVENT_META[event.type] || { icon: Zap, color: "#64748b", label: event.type };
  const Icon = meta.icon;
  return (
    <div className="flex gap-3 group">
      <div className="flex flex-col items-center flex-shrink-0">
        <div className="w-8 h-8 rounded-full flex items-center justify-center z-10"
          style={{ background: `${meta.color}18`, border: `2px solid ${meta.color}40` }}>
          <Icon size={13} style={{ color: meta.color }} />
        </div>
        <div className="flex-1 w-px mt-1" style={{ background: "rgba(255,255,255,0.06)" }} />
      </div>
      <div className="flex-1 mb-4 rounded-xl overflow-hidden"
        style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}>
        <div className="flex items-center justify-between px-3 py-2"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)" }}>
          <span className="text-xs font-semibold" style={{ color: meta.color }}>{meta.label}</span>
          <span className="text-[10px]" style={{ color: "#475569" }}>
            {event.time ? new Date(event.time).toLocaleString('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
          </span>
        </div>
        <div className="px-3 py-2.5">
          {event.type === 'page_view' && (
            <div className="space-y-1">
              <p className="text-xs text-white font-medium">{event.title || shortUrl(event.url)}</p>
              {event.url && <a href={event.url} target="_blank" rel="noreferrer" className="text-[10px] font-mono break-all hover:underline" style={{ color: "#3b82f6" }}>{event.url}</a>}
              <div className="flex gap-3 mt-1.5 flex-wrap">
                {event.duration_sec > 0   && <span className="text-[10px]" style={{ color: "#64748b" }}>⏱ {fmt(event.duration_sec)}</span>}
                {event.max_scroll_pct > 0 && <span className="text-[10px]" style={{ color: "#64748b" }}>📜 {event.max_scroll_pct}% scroll</span>}
                {event.engagement_score > 0 && <span className="text-[10px]" style={{ color: "#64748b" }}>⚡ {event.engagement_score} score</span>}
              </div>
            </div>
          )}
          {(event.type === 'product_view' || event.type === 'add_to_cart' || event.type === 'checkout_started') && (
            <div className="space-y-2">
              <div className="flex gap-3">
                {event.product_image && (
                  <img src={event.product_image} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                    style={{ border: "1px solid rgba(255,255,255,0.08)" }} onError={e => e.target.style.display = 'none'} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-white font-semibold leading-tight">{event.product_name || '—'}</p>
                  {event.product_price && <p className="text-sm font-bold mt-0.5" style={{ color: "#4ade80" }}>{event.product_price}</p>}
                  {event.total_amount > 0 && <p className="text-xs mt-0.5" style={{ color: "#94a3b8" }}>Cart total: ₹{event.total_amount}</p>}
                  {event.product_url && <a href={event.product_url} target="_blank" rel="noreferrer" className="text-[10px] font-mono mt-1 block hover:underline truncate" style={{ color: "#3b82f6" }}>{event.product_url}</a>}
                </div>
              </div>
              {event.type !== 'product_view' && event.products?.length > 1 && (
                <div className="mt-1 space-y-1">
                  <p className="text-[9px] uppercase tracking-wide" style={{ color: "#475569" }}>All {event.products.length} cart items</p>
                  {event.products.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
                      style={{ background: "rgba(251,146,60,0.06)", border: "1px solid rgba(251,146,60,0.12)" }}>
                      {p.product_image && <img src={p.product_image} alt="" className="w-7 h-7 rounded object-cover flex-shrink-0" onError={e => e.target.style.display = 'none'} />}
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] text-white font-medium truncate">{p.product_name || '—'}</p>
                        {p.product_price && <span className="text-[9px]" style={{ color: "#4ade80" }}>{p.product_price}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {(event.type === 'purchase' || event.type === 'checkout_completed') && (
            <div>
              {event.order_id && <p className="text-xs font-mono text-white">Order #{event.order_id}</p>}
              {event.total_amount > 0 && <p className="text-lg font-bold" style={{ color: "#4ade80" }}>₹{Number(event.total_amount).toLocaleString()}</p>}
              {event.products?.length > 0 && (
                <div className="mt-2 flex gap-2 flex-wrap">
                  {event.products.slice(0, 4).map((p, i) => (
                    <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
                      style={{ background: "rgba(74,222,128,0.07)", border: "1px solid rgba(74,222,128,0.15)" }}>
                      {p.image && <img src={p.image} alt="" className="w-5 h-5 rounded object-cover" onError={e => e.target.style.display = 'none'} />}
                      <span className="text-[10px] text-white">{p.name || p.title || '—'}</span>
                      {p.price && <span className="text-[10px]" style={{ color: "#4ade80" }}>{p.price}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {event.type === 'campaign_send' && (
            <div>
              {event.campaign_name && <p className="text-xs text-white font-medium">{event.campaign_name}</p>}
              {event.template_name  && <p className="text-[10px] mt-0.5" style={{ color: "#94a3b8" }}>Template: {event.template_name}</p>}
              <span className="inline-block mt-1.5 text-[9px] px-1.5 py-0.5 rounded font-bold"
                style={{ background: event.status === 'sent' ? "rgba(74,222,128,0.1)" : "rgba(239,68,68,0.1)",
                         color: event.status === 'sent' ? "#4ade80" : "#f87171",
                         border: `1px solid ${event.status === 'sent' ? "rgba(74,222,128,0.2)" : "rgba(239,68,68,0.2)"}` }}>
                {event.status?.toUpperCase()}
              </span>
            </div>
          )}
          {event.type === 'search' && (
            <p className="text-xs">
              <span className="text-white font-medium">"{event.query}"</span>
              {event.results_count != null && <span className="text-slate-500 ml-2">{event.results_count} results</span>}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── User Profile detail view ────────────────────────────────────────────── */
function UserProfile({ contact: c, activity, loading, onBack }) {
  const allSessions = activity?.allSessions || [];
  const timeline    = activity?.timeline    || [];
  const ss =
    c.status === 'purchased'          ? { color: "#4ade80", label: "Purchased"          } :
    c.status === 'abandoned_cart'     ? { color: "#fb923c", label: "Abandoned Cart"     } :
    c.status === 'abandoned_checkout' ? { color: "#f87171", label: "Checkout Abandoned" } :
    c.status === 'product_view'       ? { color: "#60a5fa", label: "Product View"       } :
                                        { color: "#94a3b8", label: "Active"             };
  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-2 text-xs font-semibold transition-colors"
        style={{ color: "#64748b" }}
        onMouseEnter={e => e.currentTarget.style.color = "#e2e8f0"}
        onMouseLeave={e => e.currentTarget.style.color = "#64748b"}>
        ← Back to Contacts
      </button>
      <div className="card p-5">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold flex-shrink-0"
            style={{ background: c.phone ? "rgba(59,130,246,0.15)" : "rgba(100,116,139,0.15)", color: c.phone ? "#60a5fa" : "#94a3b8" }}>
            {(c.name || c.phone || '?')[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-white">{c.name || 'Anonymous User'}</h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                style={{ background: `${ss.color}18`, border: `1px solid ${ss.color}40`, color: ss.color }}>
                {ss.label}
              </span>
              {c.is_repeat && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                  style={{ background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.3)", color: "#c084fc" }}>
                  🔁 Repeat Customer
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
              {c.phone    && <span className="text-xs font-mono" style={{ color: "#4ade80" }}>📞 {c.phone}</span>}
              {c.city     && <span className="text-xs" style={{ color: "#94a3b8" }}>📍 {c.city}{c.state ? `, ${c.state}` : ''}</span>}
              {c.language && <span className="text-xs" style={{ color: "#94a3b8" }}>🌐 {c.language}</span>}
              {c.device   && <span className="text-xs" style={{ color: "#94a3b8" }}>{c.device === 'mobile' ? '📱' : c.device === 'desktop' ? '🖥' : '📲'} {c.device}</span>}
            </div>
          </div>
          <div className="flex gap-6 text-center">
            <div><p className="text-lg font-bold text-white">{c.page_views || 0}</p><p className="text-[10px]" style={{ color: "#64748b" }}>Page Views</p></div>
            <div><p className="text-lg font-bold" style={{ color: "#fb923c" }}>{c.cart_events || 0}</p><p className="text-[10px]" style={{ color: "#64748b" }}>Carts</p></div>
            <div><p className="text-lg font-bold" style={{ color: "#4ade80" }}>{allSessions.length}</p><p className="text-[10px]" style={{ color: "#64748b" }}>Visits</p></div>
            <div><ScoreBadge score={c.power_score} /><p className="text-[10px] mt-1" style={{ color: "#64748b" }}>Power</p></div>
          </div>
        </div>
        {allSessions.length > 1 && (
          <div className="mt-4 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: "#475569" }}>
              Visit History — {allSessions.length} sessions
            </p>
            <div className="flex gap-2 flex-wrap">
              {allSessions.map((s, i) => {
                const sc = s.status === 'purchased' ? "#4ade80" : s.status === 'abandoned_cart' ? "#fb923c" : s.status === 'product_view' ? "#60a5fa" : "#94a3b8";
                return (
                  <div key={i} className="text-[9px] px-2 py-1 rounded-lg"
                    style={{ background: `${sc}12`, border: `1px solid ${sc}30`, color: sc }}>
                    Visit {allSessions.length - i} · {s.status?.replace(/_/g, ' ') || 'active'} ·{' '}
                    {s.visited_at ? new Date(s.visited_at).toLocaleDateString('en', { day: 'numeric', month: 'short' }) : '?'}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-white mb-5 flex items-center gap-2">
          <Activity size={14} style={{ color: "#60a5fa" }} />
          Full Activity Timeline
          <span className="text-xs font-normal ml-auto" style={{ color: "#475569" }}>{timeline.length} events</span>
        </h3>
        {loading ? (
          <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-20 rounded-xl" />)}</div>
        ) : timeline.length === 0 ? (
          <div className="text-center py-10">
            <Activity size={28} className="mx-auto mb-3 opacity-20" style={{ color: '#60a5fa' }} />
            <p className="text-sm font-semibold text-white">No events tracked yet</p>
            <p className="text-xs mt-1" style={{ color: '#475569' }}>Activity appears here once the user browses your store.</p>
          </div>
        ) : (
          <div>{timeline.map((ev, i) => <EventCard key={i} event={ev} />)}</div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function Contacts() {
  const [contacts,   setContacts]   = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [userDetail, setUserDetail] = useState(null);
  const [userActivity,       setUserActivity]       = useState(null);
  const [userActivityLoading,setUserActivityLoading]= useState(false);

  // Segment + filter state
  const [ctSegment,  setCtSegment]  = useState('all');
  const [ctSearch,   setCtSearch]   = useState('');
  const [ctStatus,   setCtStatus]   = useState('all');
  const [ctCity,     setCtCity]     = useState('');
  const [ctDevice,   setCtDevice]   = useState('');
  const [ctMinScore, setCtMinScore] = useState('');
  const [ctRepeat,   setCtRepeat]   = useState('');
  const [ctAnon,     setCtAnon]     = useState('');
  const [ctLang,     setCtLang]     = useState('');
  const [ctSortBy,   setCtSortBy]   = useState('power_score');
  const [ctSortDir,  setCtSortDir]  = useState('desc');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ct = await analyticsApi.contacts(365, 5000);
      setContacts(ct);
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openUserDetail = useCallback(async (contact) => {
    let resolved = contact;
    if (!resolved.id && resolved.phone) {
      const found = (contacts?.contacts || []).find(c => c.phone === resolved.phone);
      if (found) resolved = { ...found, ...contact, id: found.id, session_id: found.session_id };
    }
    setUserDetail(resolved);
    setUserActivity(null);
    setUserActivityLoading(true);
    try {
      const data = await visitorsApi.getActivity(resolved.id || 0, resolved.phone);
      setUserActivity(data);
    } catch (_) {}
    finally { setUserActivityLoading(false); }
  }, [contacts]);

  const toggleSort = (col) => {
    if (ctSortBy === col) setCtSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setCtSortBy(col); setCtSortDir('desc'); }
  };

  const allUsers = contacts?.contacts || [];

  const USER_SEGMENTS = useMemo(() => [
    { id: 'all',        label: 'All Users',        icon: Users,        color: "#60a5fa", desc: "Every tracked visitor",           filterFn: () => true },
    { id: 'hot',        label: 'Hot Users',         icon: Flame,        color: "#f87171", desc: "Power score ≥ 80",               filterFn: c => (c.power_score || 0) >= 80 },
    { id: 'active',     label: 'Active',            icon: Activity,     color: "#4ade80", desc: "Currently browsing your store",  filterFn: c => c.status === 'active' },
    { id: 'product',    label: 'Product Viewed',    icon: Package,      color: "#a855f7", desc: "Viewed at least one product",    filterFn: c => c.status === 'product_view' },
    { id: 'cart',       label: 'Cart Abandoned',    icon: ShoppingCart, color: "#fb923c", desc: "Added to cart but didn't buy",   filterFn: c => c.status === 'abandoned_cart' },
    { id: 'checkout',   label: 'Checkout Dropped',  icon: MousePointer, color: "#f59e0b", desc: "Started checkout, didn't finish",filterFn: c => c.status === 'abandoned_checkout' },
    { id: 'purchased',  label: 'Purchasers',        icon: Trophy,       color: "#22c55e", desc: "Completed a purchase",          filterFn: c => c.status === 'purchased' },
    { id: 'repeat',     label: 'Repeat Customers',  icon: Repeat,       color: "#c084fc", desc: "Returned more than once",       filterFn: c => !!c.is_repeat },
    { id: 'identified', label: 'Identified',        icon: CheckCircle,  color: "#38bdf8", desc: "Has phone number",              filterFn: c => !!c.phone },
    { id: 'anonymous',  label: 'Anonymous',         icon: UserCheck,    color: "#64748b", desc: "No phone captured yet",         filterFn: c => !c.phone },
    { id: 'mobile',     label: 'Mobile',            icon: Smartphone,   color: "#06b6d4", desc: "Visiting on mobile device",     filterFn: c => c.device === 'mobile' },
  ], []);

  const filteredContacts = useMemo(() => {
    const seg = USER_SEGMENTS.find(s => s.id === ctSegment);
    let arr = [...allUsers];
    if (seg && ctSegment !== 'all') arr = arr.filter(seg.filterFn);
    if (ctSearch)          arr = arr.filter(c =>
      (c.phone || '').includes(ctSearch) ||
      (c.name  || '').toLowerCase().includes(ctSearch.toLowerCase()) ||
      (c.city  || '').toLowerCase().includes(ctSearch.toLowerCase()) ||
      (c.language || '').toLowerCase().includes(ctSearch.toLowerCase())
    );
    if (ctStatus !== 'all') arr = arr.filter(c => c.status === ctStatus);
    if (ctCity)     arr = arr.filter(c => (c.city || '').toLowerCase().includes(ctCity.toLowerCase()));
    if (ctDevice)   arr = arr.filter(c => c.device === ctDevice);
    if (ctMinScore) arr = arr.filter(c => (c.power_score || 0) >= +ctMinScore);
    if (ctRepeat === 'yes') arr = arr.filter(c =>  c.is_repeat);
    if (ctRepeat === 'no')  arr = arr.filter(c => !c.is_repeat);
    if (ctAnon === 'yes')   arr = arr.filter(c => !c.phone);
    if (ctAnon === 'no')    arr = arr.filter(c =>  !!c.phone);
    if (ctLang) arr = arr.filter(c => (c.language || '').toLowerCase().startsWith(ctLang.toLowerCase()));
    arr.sort((a, b) => {
      const va = a[ctSortBy] ?? 0, vb = b[ctSortBy] ?? 0;
      return ctSortDir === 'desc' ? vb - va : va - vb;
    });
    return arr;
  }, [allUsers, ctSegment, ctSearch, ctStatus, ctCity, ctDevice, ctMinScore, ctRepeat, ctAnon, ctLang, ctSortBy, ctSortDir, USER_SEGMENTS]);

  const resetFilters = () => {
    setCtSearch(''); setCtStatus('all'); setCtDevice(''); setCtMinScore('');
    setCtRepeat(''); setCtAnon(''); setCtLang(''); setCtCity(''); setCtSegment('all');
  };
  const hasFilters = ctSearch || ctStatus !== 'all' || ctDevice || ctMinScore || ctRepeat || ctAnon || ctLang || ctCity || ctSegment !== 'all';

  if (userDetail) {
    return (
      <div className="max-w-5xl">
        <UserProfile
          contact={userDetail}
          activity={userActivity}
          loading={userActivityLoading}
          onBack={() => { setUserDetail(null); setUserActivity(null); }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-7xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Contacts</h2>
          <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
            {loading ? 'Loading…' : `${allUsers.length.toLocaleString()} contacts tracked`}
          </p>
        </div>
        <button onClick={load} className="btn-secondary gap-1.5">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {/* Segment pills */}
      <div className="overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        <div className="flex gap-3 min-w-max">
          {USER_SEGMENTS.map(seg => {
            const cnt     = allUsers.filter(seg.filterFn).length;
            const total   = allUsers.length || 1;
            const pct     = Math.round((cnt / total) * 100);
            const isActive = ctSegment === seg.id;
            const Icon    = seg.icon;
            return (
              <button key={seg.id} onClick={() => setCtSegment(seg.id)}
                className="flex-shrink-0 text-left rounded-2xl p-4 transition-all"
                style={{
                  minWidth: 140,
                  background: isActive ? `${seg.color}14` : "rgba(255,255,255,0.02)",
                  border: `1.5px solid ${isActive ? seg.color : "rgba(255,255,255,0.07)"}`,
                  boxShadow: isActive ? `0 0 20px ${seg.color}20` : "none",
                  transform: isActive ? "translateY(-2px)" : "none",
                }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ background: `${seg.color}18`, border: `1px solid ${seg.color}35` }}>
                    <Icon size={13} style={{ color: seg.color }} />
                  </div>
                  {isActive && (
                    <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide"
                      style={{ background: `${seg.color}20`, color: seg.color }}>Active</span>
                  )}
                </div>
                <p className="text-xl font-bold text-white tabular-nums">{loading ? '…' : cnt.toLocaleString()}</p>
                <p className="text-[11px] font-semibold mt-0.5" style={{ color: isActive ? seg.color : "#94a3b8" }}>{seg.label}</p>
                <p className="text-[10px] mt-0.5" style={{ color: "#475569" }}>{seg.desc}</p>
                <div className="mt-2.5 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${seg.color}80, ${seg.color})` }} />
                </div>
                <p className="text-[9px] mt-0.5 font-mono" style={{ color: "#475569" }}>{pct}% of total</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Funnel */}
      {!loading && allUsers.length > 0 && (() => {
        const steps = [
          { label: 'Active',       cnt: allUsers.filter(c => c.status === 'active').length,             color: "#4ade80" },
          { label: 'Product View', cnt: allUsers.filter(c => c.status === 'product_view').length,       color: "#a855f7" },
          { label: 'Cart',         cnt: allUsers.filter(c => c.status === 'abandoned_cart').length,     color: "#fb923c" },
          { label: 'Checkout',     cnt: allUsers.filter(c => c.status === 'abandoned_checkout').length, color: "#f59e0b" },
          { label: 'Purchased',    cnt: allUsers.filter(c => c.status === 'purchased').length,          color: "#22c55e" },
        ];
        const max = Math.max(...steps.map(s => s.cnt), 1);
        return (
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-white flex items-center gap-1.5">
                <TrendingDown size={12} style={{ color: "#fb923c" }} /> User Journey Funnel
              </h4>
              <span className="text-[10px]" style={{ color: "#475569" }}>{allUsers.length} total users</span>
            </div>
            <div className="flex items-end gap-2">
              {steps.map((s, i) => {
                const pct  = Math.round((s.cnt / allUsers.length) * 100);
                const barH = Math.max(Math.round((s.cnt / max) * 64), 4);
                return (
                  <button key={s.label} onClick={() => { setCtSegment('all'); setCtStatus(
                    s.label === 'Active' ? 'active' : s.label === 'Product View' ? 'product_view' :
                    s.label === 'Cart' ? 'abandoned_cart' : s.label === 'Checkout' ? 'abandoned_checkout' : 'purchased'
                  ); }}
                    className="flex-1 flex flex-col items-center gap-1 group">
                    <span className="text-xs font-bold tabular-nums text-white">{s.cnt}</span>
                    <div className="w-full rounded-t-lg transition-all group-hover:opacity-80"
                      style={{ height: barH, background: `linear-gradient(180deg, ${s.color}, ${s.color}70)` }} />
                    <span className="text-[9px] text-center leading-tight" style={{ color: "#64748b" }}>{s.label}</span>
                    <span className="text-[9px] font-bold" style={{ color: s.color }}>{pct}%</span>
                    {i > 0 && (
                      <span className="text-[8px]" style={{ color: "#ef4444" }}>
                        ↓ {Math.round((1 - s.cnt / Math.max(steps[i - 1].cnt, 1)) * 100)}% drop
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Filters */}
      <div className="card p-3">
        <div className="flex flex-wrap gap-2 items-center">
          <Filter size={12} style={{ color: "#475569" }} />
          <SearchInput value={ctSearch} onChange={setCtSearch} placeholder="Name, phone, city, language…" />
          <FilterSelect value={ctStatus} onChange={setCtStatus}>
            <option value="all">All Status</option>
            <option value="active">🟢 Active</option>
            <option value="product_view">🔵 Product View</option>
            <option value="abandoned_cart">🟠 Abandoned Cart</option>
            <option value="abandoned_checkout">🔴 Checkout Dropped</option>
            <option value="purchased">✅ Purchased</option>
            <option value="followup_complete">📬 Followup Complete</option>
          </FilterSelect>
          <FilterSelect value={ctDevice} onChange={setCtDevice}>
            <option value="">All Devices</option>
            <option value="mobile">📱 Mobile</option>
            <option value="desktop">🖥 Desktop</option>
            <option value="tablet">📲 Tablet</option>
          </FilterSelect>
          <FilterSelect value={ctMinScore} onChange={setCtMinScore}>
            <option value="">Any Score</option>
            <option value="80">🔥 Hot (80+)</option>
            <option value="60">High (60+)</option>
            <option value="40">Medium (40+)</option>
            <option value="20">Low (20+)</option>
          </FilterSelect>
          <FilterSelect value={ctRepeat} onChange={setCtRepeat}>
            <option value="">All Customers</option>
            <option value="yes">🔁 Repeat only</option>
            <option value="no">🆕 First-time only</option>
          </FilterSelect>
          <FilterSelect value={ctAnon} onChange={setCtAnon}>
            <option value="">Anon + Identified</option>
            <option value="no">✅ Has phone</option>
            <option value="yes">👤 Anonymous</option>
          </FilterSelect>
          <FilterSelect value={ctLang} onChange={setCtLang}>
            <option value="">All Languages</option>
            <option value="en">🇬🇧 English</option>
            <option value="hi">🇮🇳 Hindi</option>
            <option value="gu">Gujarati</option>
            <option value="ta">Tamil</option>
            <option value="te">Telugu</option>
            <option value="mr">Marathi</option>
            <option value="bn">Bengali</option>
          </FilterSelect>
          {ctCity && (
            <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg"
              style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", color: "#60a5fa" }}>
              📍 {ctCity} <button onClick={() => setCtCity('')}><X size={10} /></button>
            </span>
          )}
          <span className="text-xs ml-auto font-semibold" style={{ color: "#64748b" }}>
            <span className="text-white">{filteredContacts.length}</span> / {allUsers.length} users
          </span>
          {hasFilters && (
            <button onClick={resetFilters}
              className="text-[10px] px-2 py-1 rounded-lg flex items-center gap-1"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
              <X size={9} /> Reset
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card">
        {loading ? (
          <div className="skeleton h-64 rounded-xl m-5" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  {[
                    { label: 'User',      col: 'name'             },
                    { label: 'Power',     col: 'power_score'      },
                    { label: 'Engage',    col: 'engagement_score' },
                    { label: 'Pages',     col: 'page_views'       },
                    { label: 'Time',      col: 'total_time_sec'   },
                    { label: 'Carts',     col: 'cart_events'      },
                    { label: 'Status',    col: 'status'           },
                    { label: 'City',      col: 'city'             },
                    { label: 'Device',    col: 'device'           },
                    { label: 'Last Seen', col: 'last_seen'        },
                    { label: '',          col: ''                 },
                  ].map(c => c.col
                    ? <SortTh key={c.col} col={c.col} label={c.label} sortBy={ctSortBy} sortDir={ctSortDir} onSort={toggleSort} />
                    : <th key="action" className="py-3 px-3" />
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredContacts.length === 0 && (
                  <tr><td colSpan={11} className="text-center py-12" style={{ color: "#475569" }}>No contacts match your filters.</td></tr>
                )}
                {filteredContacts.slice(0, 500).map((c, i) => {
                  const ss =
                    c.status === 'purchased'          ? { bg: "rgba(34,197,94,0.1)",   border: "rgba(34,197,94,0.25)",   color: "#4ade80"  } :
                    c.status === 'abandoned_cart'     ? { bg: "rgba(249,115,22,0.1)",  border: "rgba(249,115,22,0.25)",  color: "#fb923c"  } :
                    c.status === 'abandoned_checkout' ? { bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.25)",   color: "#f87171"  } :
                    c.status === 'product_view'       ? { bg: "rgba(59,130,246,0.1)",  border: "rgba(59,130,246,0.25)",  color: "#60a5fa"  } :
                                                        { bg: "rgba(100,116,139,0.1)", border: "rgba(100,116,139,0.25)", color: "#94a3b8"  };
                  return (
                    <tr key={i} className="transition-colors cursor-pointer"
                      style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
                      onMouseLeave={e => e.currentTarget.style.background = ""}>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                            style={{ background: c.phone ? "rgba(59,130,246,0.15)" : "rgba(100,116,139,0.15)", color: c.phone ? "#60a5fa" : "#94a3b8" }}>
                            {(c.name || c.phone || '?')[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-white">{c.name || <span style={{ color: "#475569" }}>Anonymous</span>}</p>
                            <p className="font-mono text-[10px] mt-0.5" style={{ color: c.phone ? "#4ade80" : "#475569" }}>
                              {c.phone || 'No phone'}
                              {c.is_repeat && <span className="ml-1 px-1 rounded text-[8px] font-bold" style={{ background: "rgba(168,85,247,0.15)", color: "#c084fc" }}>🔁</span>}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3"><ScoreBadge score={c.power_score} /></td>
                      <td className="py-3 px-3"><MiniBar pct={c.engagement_score} color="#a855f7" width={48} /></td>
                      <td className="py-3 px-3 font-mono text-center text-white">{c.page_views}</td>
                      <td className="py-3 px-3 font-mono" style={{ color: "#94a3b8" }}>{fmt(c.total_time_sec || 0)}</td>
                      <td className="py-3 px-3 font-mono text-center" style={{ color: c.cart_events > 0 ? "#fb923c" : "#64748b" }}>{c.cart_events || 0}</td>
                      <td className="py-3 px-3">
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                          style={{ background: ss.bg, border: `1px solid ${ss.border}`, color: ss.color }}>
                          {(c.status || 'active').replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <button onClick={() => setCtCity(c.city || '')} className="text-xs transition-colors" style={{ color: "#94a3b8" }}
                          onMouseEnter={e => e.currentTarget.style.color = "#60a5fa"}
                          onMouseLeave={e => e.currentTarget.style.color = "#94a3b8"}>
                          {c.city || '—'}
                        </button>
                      </td>
                      <td className="py-3 px-3 text-xs" style={{ color: "#64748b" }}>
                        {c.device === 'mobile' ? '📱' : c.device === 'desktop' ? '🖥' : c.device === 'tablet' ? '📲' : ''} {c.device || '—'}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap text-xs" style={{ color: "#64748b" }}>
                        {c.last_seen ? timeAgo(c.last_seen) : '—'}
                      </td>
                      <td className="py-3 px-3">
                        <button onClick={() => openUserDetail(c)}
                          className="text-[10px] px-2.5 py-1 rounded-lg font-semibold transition-all"
                          style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", color: "#60a5fa" }}
                          onMouseEnter={e => e.currentTarget.style.background = "rgba(59,130,246,0.2)"}
                          onMouseLeave={e => e.currentTarget.style.background = "rgba(59,130,246,0.1)"}>
                          View →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
