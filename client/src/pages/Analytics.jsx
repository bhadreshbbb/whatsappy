import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import {
  BarChart2, Globe, Users, Clock, TrendingUp, Smartphone, Monitor, Tablet,
  Flame, Eye, ArrowUpRight, ArrowDownRight, RefreshCw, ChevronDown, ChevronUp,
  MapPin, Zap, Activity, Star, Search, Target, Calendar, Repeat,
  Image, Map, ShoppingBag, DollarSign, Megaphone, BrainCircuit,
  Phone, CheckCircle, TrendingDown, Filter, X, Trophy, LayoutDashboard,
  MousePointer, ShoppingCart, Package, UserCheck,
} from "lucide-react";
import { analyticsApi, visitorsApi } from "../api";

/* ─── helpers ─────────────────────────────────────────────────────────────── */
function timeAgo(iso) {
  if (!iso) return '—';
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return new Date(iso).toLocaleDateString('en', { day: 'numeric', month: 'short' });
}
function shortUrl(u) {
  try { const p = new URL(u); return p.hostname.replace('www.','') + p.pathname.slice(0,30); } catch { return (u||'').slice(0,40); }
}

const COLORS = ["#22c55e","#3b82f6","#f97316","#a855f7","#ec4899","#14b8a6","#f59e0b","#64748b","#ef4444","#06b6d4"];

/* ─── Tooltip ─────────────────────────────────────────────────────────────── */
const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl px-3 py-2 text-xs shadow-2xl"
      style={{ background: "#1a2035", border: "1px solid rgba(255,255,255,0.1)" }}>
      {label && <p className="mb-1 font-medium" style={{ color: "#94a3b8" }}>{label}</p>}
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color || '#fff' }} className="font-semibold">
          {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
        </p>
      ))}
    </div>
  );
};

/* ─── Stat card ───────────────────────────────────────────────────────────── */
const StatCard = ({ label, value, sub, color = "blue", icon: Icon, trend }) => {
  const palette = {
    blue:   { text: "#60a5fa", bg: "rgba(59,130,246,0.1)",  border: "rgba(59,130,246,0.2)",  glow: "rgba(59,130,246,0.15)"  },
    green:  { text: "#4ade80", bg: "rgba(34,197,94,0.1)",   border: "rgba(34,197,94,0.2)",   glow: "rgba(34,197,94,0.15)"   },
    orange: { text: "#fb923c", bg: "rgba(249,115,22,0.1)",  border: "rgba(249,115,22,0.2)",  glow: "rgba(249,115,22,0.15)"  },
    purple: { text: "#c084fc", bg: "rgba(168,85,247,0.1)",  border: "rgba(168,85,247,0.2)",  glow: "rgba(168,85,247,0.15)"  },
    pink:   { text: "#f472b6", bg: "rgba(236,72,153,0.1)",  border: "rgba(236,72,153,0.2)",  glow: "rgba(236,72,153,0.15)"  },
  };
  const p = palette[color] || palette.blue;
  return (
    <div className="card p-4 relative overflow-hidden group"
      style={{ transition: "transform 0.2s, box-shadow 0.2s" }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 8px 32px ${p.glow}`; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}>
      <div className="absolute inset-x-0 bottom-0 h-0.5 rounded-b"
        style={{ background: `linear-gradient(90deg, transparent, ${p.text}, transparent)` }} />
      <div className="flex items-center justify-between mb-2">
        {Icon && (
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: p.bg, border: `1px solid ${p.border}` }}>
            <Icon size={14} style={{ color: p.text }} />
          </div>
        )}
        {trend !== undefined && (
          <span className="text-xs font-semibold flex items-center gap-0.5"
            style={{ color: trend >= 0 ? "#4ade80" : "#f87171" }}>
            {trend >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-white tabular-nums">{value ?? '…'}</p>
      <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>{label}</p>
      {sub && <p className="text-xs mt-0.5" style={{ color: "#334155" }}>{sub}</p>}
    </div>
  );
};

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

/* ─── Performance badge ───────────────────────────────────────────────────── */
const PerfBadge = ({ label, color }) => {
  const styles = {
    top:      { bg: "rgba(34,197,94,0.12)",   border: "rgba(34,197,94,0.3)",   text: "#4ade80"  },
    trending: { bg: "rgba(59,130,246,0.12)",  border: "rgba(59,130,246,0.3)",  text: "#60a5fa"  },
    hot:      { bg: "rgba(239,68,68,0.12)",   border: "rgba(239,68,68,0.3)",   text: "#f87171"  },
    good:     { bg: "rgba(168,85,247,0.12)",  border: "rgba(168,85,247,0.3)",  text: "#c084fc"  },
    warn:     { bg: "rgba(249,115,22,0.12)",  border: "rgba(249,115,22,0.3)",  text: "#fb923c"  },
  };
  const s = styles[color] || styles.good;
  return (
    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide"
      style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.text }}>
      {label}
    </span>
  );
};

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
const fmt = s =>
  s >= 3600 ? `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`
: s >= 60   ? `${Math.floor(s/60)}m ${s%60}s`
:              `${s}s`;

const cleanUrl = url => {
  if (!url) return '—';
  try { return decodeURIComponent(url).replace(/^https?:\/\/[^/]+/, '') || '/'; } catch { return url; }
};

/* ─── Filter bar component ────────────────────────────────────────────────── */
function FilterBar({ children }) {
  return (
    <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl"
      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
      <Filter size={12} style={{ color: "#475569" }} />
      {children}
    </div>
  );
}

function SearchInput({ value, onChange, placeholder }) {
  return (
    <div className="relative flex-1 min-w-[180px]">
      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#475569" }} />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || "Search…"}
        className="input pl-7 py-1.5 text-xs w-full" />
      {value && (
        <button onClick={() => onChange('')} className="absolute right-2.5 top-1/2 -translate-y-1/2"
          style={{ color: "#475569" }}>
          <X size={11} />
        </button>
      )}
    </div>
  );
}

function FilterSelect({ value, onChange, children }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="input text-xs py-1.5 w-auto">
      {children}
    </select>
  );
}

/* ─── Sort header helper ──────────────────────────────────────────────────── */
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
        {active ? (sortDir === 'desc' ? <ChevronDown size={11}/> : <ChevronUp size={11}/>) : <ChevronDown size={11} style={{ opacity: 0.25 }}/>}
      </span>
    </th>
  );
}

/* ─── Mini bar ────────────────────────────────────────────────────────────── */
function MiniBar({ pct, color = "#3b82f6", width = 60 }) {
  return (
    <div className="flex items-center gap-1.5">
      <div style={{ width, height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: color, borderRadius: 99 }} />
      </div>
      <span className="text-xs font-mono" style={{ color: "#94a3b8" }}>{pct}%</span>
    </div>
  );
}

/* ─── Tab definitions ────────────────────────────────────────────────────── */
const TABS = [
  { id: 'dash',       label: 'Command Center', icon: LayoutDashboard },
  { id: 'brand',      label: 'Brand Intel ✦', icon: BrainCircuit },
  { id: 'overview',   label: 'Overview',      icon: BarChart2    },
  { id: 'pages',      label: 'Pages',         icon: Eye          },
  { id: 'users',      label: 'Users',         icon: Users        },
  { id: 'repeat',     label: 'Repeat Customers', icon: Repeat    },
  { id: 'cities',     label: 'Cities',        icon: MapPin       },
  { id: 'devices',    label: 'Devices',       icon: Smartphone   },
  { id: 'engagement', label: 'Engagement',    icon: Activity     },
];

/* ─── UserProfile ─────────────────────────────────────────────────────────── */
const EVENT_META = {
  page_view:           { icon: Globe,         color: "#60a5fa", label: "Page View"          },
  product_view:        { icon: Package,       color: "#a855f7", label: "Product Viewed"     },
  add_to_cart:         { icon: ShoppingCart,  color: "#fb923c", label: "Added to Cart"      },
  checkout_started:    { icon: MousePointer,  color: "#f59e0b", label: "Checkout Started"   },
  checkout_completed:  { icon: CheckCircle,   color: "#4ade80", label: "Checkout Completed" },
  purchase:            { icon: Trophy,        color: "#4ade80", label: "Purchase"           },
  campaign_send:       { icon: Megaphone,     color: "#c084fc", label: "Campaign Sent"      },
  search:              { icon: Search,        color: "#38bdf8", label: "Search"             },
};

function EventCard({ event }) {
  const meta = EVENT_META[event.type] || { icon: Zap, color: "#64748b", label: event.type };
  const Icon = meta.icon;

  return (
    <div className="flex gap-3 group">
      {/* Timeline dot */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div className="w-8 h-8 rounded-full flex items-center justify-center z-10"
          style={{ background: `${meta.color}18`, border: `2px solid ${meta.color}40` }}>
          <Icon size={13} style={{ color: meta.color }} />
        </div>
        <div className="flex-1 w-px mt-1" style={{ background: "rgba(255,255,255,0.06)" }} />
      </div>

      {/* Card */}
      <div className="flex-1 mb-4 rounded-xl overflow-hidden"
        style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)" }}>
          <span className="text-xs font-semibold" style={{ color: meta.color }}>{meta.label}</span>
          <span className="text-[10px]" style={{ color: "#475569" }}>
            {event.time ? new Date(event.time).toLocaleString('en', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }) : '—'}
          </span>
        </div>

        {/* Body */}
        <div className="px-3 py-2.5">
          {/* page_view */}
          {event.type === 'page_view' && (
            <div className="space-y-1">
              <p className="text-xs text-white font-medium">{event.title || shortUrl(event.url)}</p>
              {event.url && (
                <a href={event.url} target="_blank" rel="noreferrer"
                  className="text-[10px] font-mono break-all hover:underline" style={{ color: "#3b82f6" }}>{event.url}</a>
              )}
              <div className="flex gap-3 mt-1.5 flex-wrap">
                {event.duration_sec > 0  && <span className="text-[10px]" style={{ color: "#64748b" }}>⏱ {fmt(event.duration_sec)}</span>}
                {event.max_scroll_pct > 0 && <span className="text-[10px]" style={{ color: "#64748b" }}>📜 {event.max_scroll_pct}% scroll</span>}
                {event.engagement_score > 0 && <span className="text-[10px]" style={{ color: "#64748b" }}>⚡ {event.engagement_score} score</span>}
                {event.referrer && <span className="text-[10px] truncate" style={{ color: "#64748b" }}>↩ {shortUrl(event.referrer)}</span>}
              </div>
            </div>
          )}

          {/* product_view / add_to_cart */}
          {(event.type === 'product_view' || event.type === 'add_to_cart' || event.type === 'checkout_started') && (
            <div className="flex gap-3">
              {event.product_image && (
                <img src={event.product_image} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                  style={{ border: "1px solid rgba(255,255,255,0.08)" }} onError={e => e.target.style.display='none'} />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs text-white font-semibold leading-tight">{event.product_name || '—'}</p>
                {event.product_price && <p className="text-sm font-bold mt-0.5" style={{ color: "#4ade80" }}>{event.product_price}</p>}
                {event.total_amount > 0 && <p className="text-xs mt-0.5" style={{ color: "#94a3b8" }}>Cart total: ₹{event.total_amount}</p>}
                {event.product_url && (
                  <a href={event.product_url} target="_blank" rel="noreferrer"
                    className="text-[10px] font-mono mt-1 block hover:underline truncate" style={{ color: "#3b82f6" }}>{event.product_url}</a>
                )}
                {event.cart_url && (
                  <a href={event.cart_url} target="_blank" rel="noreferrer"
                    className="text-[10px] mt-0.5 flex items-center gap-1 hover:underline" style={{ color: "#60a5fa" }}>🛒 View Cart</a>
                )}
              </div>
            </div>
          )}

          {/* checkout_completed / purchase */}
          {(event.type === 'purchase' || event.type === 'checkout_completed') && (
            <div>
              {event.order_id && <p className="text-xs font-mono text-white">Order #{event.order_id}</p>}
              {event.total_amount > 0 && <p className="text-lg font-bold" style={{ color: "#4ade80" }}>₹{Number(event.total_amount).toLocaleString()}</p>}
              {event.products?.length > 0 && (
                <div className="mt-2 flex gap-2 flex-wrap">
                  {event.products.slice(0, 4).map((p, i) => (
                    <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
                      style={{ background: "rgba(74,222,128,0.07)", border: "1px solid rgba(74,222,128,0.15)" }}>
                      {p.image && <img src={p.image} alt="" className="w-5 h-5 rounded object-cover" onError={e => e.target.style.display='none'} />}
                      <span className="text-[10px] text-white">{p.name || p.title || '—'}</span>
                      {p.price && <span className="text-[10px]" style={{ color: "#4ade80" }}>{p.price}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* campaign_send */}
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
              {event.cards_sent?.length > 0 && (
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                  {event.cards_sent.map((c, i) => (
                    <div key={i} className="flex-shrink-0 p-2 rounded-lg text-center"
                      style={{ background: "rgba(168,85,247,0.07)", border: "1px solid rgba(168,85,247,0.15)", minWidth: 80 }}>
                      {c.image && <img src={c.image} alt="" className="w-12 h-12 rounded object-cover mx-auto mb-1" onError={e => e.target.style.display='none'} />}
                      <p className="text-[9px] text-white font-medium leading-tight">{c.title || '—'}</p>
                      {c.price && <p className="text-[9px]" style={{ color: "#4ade80" }}>{c.price}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* search */}
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

function UserProfile({ contact: c, activity, loading, onBack }) {
  const allSessions = activity?.allSessions || [];
  const timeline = activity?.timeline || [];

  const ss =
    c.status === 'purchased'          ? { color: "#4ade80", label: "Purchased"         } :
    c.status === 'abandoned_cart'     ? { color: "#fb923c", label: "Abandoned Cart"    } :
    c.status === 'abandoned_checkout' ? { color: "#f87171", label: "Checkout Abandoned"} :
    c.status === 'product_view'       ? { color: "#60a5fa", label: "Product View"      } :
                                        { color: "#94a3b8", label: "Active"            };

  return (
    <div className="space-y-5">
      {/* Back */}
      <button onClick={onBack} className="flex items-center gap-2 text-xs font-semibold transition-colors"
        style={{ color: "#64748b" }}
        onMouseEnter={e => e.currentTarget.style.color = "#e2e8f0"}
        onMouseLeave={e => e.currentTarget.style.color = "#64748b"}>
        ← Back to Users
      </button>

      {/* Profile header */}
      <div className="card p-5">
        <div className="flex items-start gap-4 flex-wrap">
          {/* Avatar */}
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

        {/* Session dots */}
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
                    Visit {allSessions.length - i} · {s.status?.replace(/_/g,' ') || 'active'} ·{' '}
                    {s.visited_at ? new Date(s.visited_at).toLocaleDateString('en', { day:'numeric', month:'short' }) : '?'}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-white mb-5 flex items-center gap-2">
          <Activity size={14} style={{ color: "#60a5fa" }} />
          Full Activity Timeline
          <span className="text-xs font-normal ml-auto" style={{ color: "#475569" }}>{timeline.length} events</span>
        </h3>
        {loading ? (
          <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-20 rounded-xl" />)}</div>
        ) : timeline.length === 0 ? (
          <p className="text-center py-8 text-sm" style={{ color: "#475569" }}>No activity recorded yet.</p>
        ) : (
          <div>
            {timeline.map((ev, i) => <EventCard key={i} event={ev} />)}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function Analytics() {
  const [tab,        setTab]        = useState('dash');
  const [days,       setDays]       = useState(30);
  const [loading,    setLoading]    = useState(true);
  const [overview,   setOverview]   = useState(null);
  const [pages,      setPages]      = useState(null);
  const [contacts,   setContacts]   = useState(null);
  const [cities,     setCities]     = useState(null);
  const [devices,    setDevices]    = useState(null);
  const [brand,      setBrand]      = useState(null);
  const [engagement, setEngagement] = useState(null);
  const [repeatVis,  setRepeatVis]  = useState(null);
  const [repeatLoading, setRepeatLoading] = useState(false);

  // Users tab
  const [userDetail,         setUserDetail]         = useState(null);
  const [userActivity,       setUserActivity]       = useState(null);
  const [userActivityLoading,setUserActivityLoading]= useState(false);
  const [ctRepeat,   setCtRepeat]  = useState('');
  const [ctAnon,     setCtAnon]    = useState('');
  const [ctLang,     setCtLang]    = useState('');
  const [ctSegment,  setCtSegment] = useState('all');

  // Repeat tab filters
  const [rpFilter, setRpFilter] = useState('all');   // 'all' | 'purchased' | 'not_purchased'
  const [rpSearch, setRpSearch] = useState('');

  // Global filters
  const [search,       setSearch]       = useState('');
  const [sortBy,       setSortBy]       = useState('');
  const [sortDir,      setSortDir]      = useState('desc');

  // Per-tab filters
  const [pageSearch,   setPageSearch]   = useState('');
  const [pageSortBy,   setPageSortBy]   = useState('views');
  const [pageSortDir,  setPageSortDir]  = useState('desc');
  const [pageMinViews, setPageMinViews] = useState('');

  const [citySearch,   setCitySearch]   = useState('');
  const [cityState,    setCityState]    = useState('');
  const [citySortBy,   setCitySortBy]   = useState('visitors');
  const [citySortDir,  setCitySortDir]  = useState('desc');

  const [ctSearch,     setCtSearch]     = useState('');
  const [ctStatus,     setCtStatus]     = useState('all');
  const [ctCity,       setCtCity]       = useState('');
  const [ctDevice,     setCtDevice]     = useState('');
  const [ctMinScore,   setCtMinScore]   = useState('');
  const [ctSortBy,     setCtSortBy]     = useState('power_score');
  const [ctSortDir,    setCtSortDir]    = useState('desc');

  // Command Center unified filters
  const [dashSearch,  setDashSearch]  = useState('');
  const [dashCity,    setDashCity]    = useState('');
  const [dashStatus,  setDashStatus]  = useState('all');
  const [dashDevice,  setDashDevice]  = useState('');
  const [dashScore,   setDashScore]   = useState('');
  const [dashSortBy,  setDashSortBy]  = useState('power_score');
  const [dashSortDir, setDashSortDir] = useState('desc');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, pg, ct, ci, dv, en, br] = await Promise.all([
        analyticsApi.overview(days),
        analyticsApi.pages(days),
        analyticsApi.contacts(days, 200),
        analyticsApi.cities(days),
        analyticsApi.devices(days),
        analyticsApi.engagement(days),
        analyticsApi.brand(days),
      ]);
      setOverview(ov); setPages(pg); setContacts(ct);
      setCities(ci); setDevices(dv); setEngagement(en); setBrand(br);
    } catch (_) {}
    setLoading(false);
  }, [days]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (tab !== 'repeat' || repeatVis !== null) return;
    setRepeatLoading(true);
    analyticsApi.repeatVisitors().then(d => { setRepeatVis(d); setRepeatLoading(false); }).catch(() => setRepeatLoading(false));
  }, [tab, repeatVis]);

  const openUserDetail = useCallback(async (contact) => {
    // If called from Repeat tab, look up full contact record by phone
    let resolved = contact;
    if (!resolved.id && !resolved.visitor_id && resolved.phone) {
      const found = (contacts?.contacts || []).find(c => c.phone === resolved.phone);
      if (found) resolved = found;
    }
    setUserDetail(resolved);
    setTab('users');
    setUserActivity(null);
    setUserActivityLoading(true);
    try {
      const data = await visitorsApi.getActivity(resolved.id || resolved.visitor_id);
      setUserActivity(data);
    } catch (_) {}
    setUserActivityLoading(false);
  }, [contacts]);

  const toggleSort = (col, cur, dir, setCol, setDir) => {
    if (cur === col) setDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setCol(col); setDir('desc'); }
  };

  const chartData = (overview?.byDay || []).map((d, i) => ({
    day: new Date(d.day).toLocaleDateString('en', { weekday: 'short', day: 'numeric' }),
    visitors: d.visitors,
    carts: overview?.cartByDay?.[i]?.carts || 0,
  }));

  /* ─── Filtered & sorted pages ─── */
  const filteredPages = useMemo(() => {
    let arr = [...(pages?.pages || [])];
    if (pageSearch) arr = arr.filter(p =>
      (p.url || '').toLowerCase().includes(pageSearch.toLowerCase()) ||
      (p.title || '').toLowerCase().includes(pageSearch.toLowerCase())
    );
    if (pageMinViews) arr = arr.filter(p => p.views >= +pageMinViews);
    arr.sort((a, b) => {
      const va = a[pageSortBy] ?? 0, vb = b[pageSortBy] ?? 0;
      return pageSortDir === 'desc' ? vb - va : va - vb;
    });
    return arr;
  }, [pages, pageSearch, pageMinViews, pageSortBy, pageSortDir]);

  /* ─── Top pages for chart ─── */
  const topPagesChart = useMemo(() =>
    (pages?.pages || []).slice(0, 10).map(p => ({
      name: cleanUrl(p.url).slice(0, 25) || '/',
      views: p.views,
      unique: p.unique_visitors,
    })), [pages]);

  /* ─── Filtered & sorted cities ─── */
  const filteredCities = useMemo(() => {
    let arr = [...(cities?.cities || [])];
    if (citySearch) arr = arr.filter(c =>
      (c.city || '').toLowerCase().includes(citySearch.toLowerCase()) ||
      (c.state || '').toLowerCase().includes(citySearch.toLowerCase())
    );
    if (cityState) arr = arr.filter(c => (c.state || '') === cityState);
    arr.sort((a, b) => {
      const va = a[citySortBy] ?? 0, vb = b[citySortBy] ?? 0;
      return citySortDir === 'desc' ? vb - va : va - vb;
    });
    return arr;
  }, [cities, citySearch, cityState, citySortBy, citySortDir]);

  const allStates = useMemo(() =>
    [...new Set((cities?.cities || []).map(c => c.state).filter(Boolean))].sort(), [cities]);

  /* ─── Segment definitions (for Users tab) ─── */
  const allUsers = contacts?.contacts || [];
  const USER_SEGMENTS = useMemo(() => [
    { id: 'all',       label: 'All Users',         icon: Users,        color: "#60a5fa", desc: "Every tracked visitor",            filterFn: () => true },
    { id: 'hot',       label: 'Hot Users',          icon: Flame,        color: "#f87171", desc: "Power score ≥ 80",                filterFn: c => (c.power_score || 0) >= 80 },
    { id: 'active',    label: 'Active',             icon: Activity,     color: "#4ade80", desc: "Currently browsing your store",   filterFn: c => c.status === 'active' },
    { id: 'product',   label: 'Product Viewed',     icon: Package,      color: "#a855f7", desc: "Viewed at least one product",     filterFn: c => c.status === 'product_view' },
    { id: 'cart',      label: 'Cart Abandoned',     icon: ShoppingCart, color: "#fb923c", desc: "Added to cart but didn't buy",    filterFn: c => c.status === 'abandoned_cart' },
    { id: 'checkout',  label: 'Checkout Dropped',   icon: MousePointer, color: "#f59e0b", desc: "Started checkout, didn't finish", filterFn: c => c.status === 'abandoned_checkout' },
    { id: 'purchased', label: 'Purchasers',         icon: Trophy,       color: "#22c55e", desc: "Completed a purchase",           filterFn: c => c.status === 'purchased' },
    { id: 'repeat',    label: 'Repeat Customers',   icon: Repeat,       color: "#c084fc", desc: "Returned more than once",        filterFn: c => !!c.is_repeat },
    { id: 'identified',label: 'Identified',         icon: CheckCircle,  color: "#38bdf8", desc: "Has phone number",               filterFn: c => !!c.phone },
    { id: 'anonymous', label: 'Anonymous',          icon: UserCheck,    color: "#64748b", desc: "No phone captured yet",          filterFn: c => !c.phone },
    { id: 'mobile',    label: 'Mobile',             icon: Smartphone,   color: "#06b6d4", desc: "Visiting on mobile device",      filterFn: c => c.device === 'mobile' },
  ], []);

  /* ─── Filtered & sorted contacts ─── */
  const filteredContacts = useMemo(() => {
    const seg = USER_SEGMENTS.find(s => s.id === ctSegment);
    let arr = [...allUsers];
    if (seg && ctSegment !== 'all') arr = arr.filter(seg.filterFn);
    if (ctSearch) arr = arr.filter(c =>
      (c.phone || '').includes(ctSearch) ||
      (c.name || '').toLowerCase().includes(ctSearch.toLowerCase()) ||
      (c.city || '').toLowerCase().includes(ctSearch.toLowerCase()) ||
      (c.language || '').toLowerCase().includes(ctSearch.toLowerCase())
    );
    if (ctStatus !== 'all') arr = arr.filter(c => c.status === ctStatus);
    if (ctCity) arr = arr.filter(c => (c.city || '').toLowerCase().includes(ctCity.toLowerCase()));
    if (ctDevice) arr = arr.filter(c => c.device === ctDevice);
    if (ctMinScore) arr = arr.filter(c => c.power_score >= +ctMinScore);
    if (ctRepeat === 'yes') arr = arr.filter(c => c.is_repeat);
    if (ctRepeat === 'no')  arr = arr.filter(c => !c.is_repeat);
    if (ctAnon === 'yes') arr = arr.filter(c => !c.phone);
    if (ctAnon === 'no')  arr = arr.filter(c => !!c.phone);
    if (ctLang) arr = arr.filter(c => (c.language || '').toLowerCase().startsWith(ctLang.toLowerCase()));
    arr.sort((a, b) => {
      const va = a[ctSortBy] ?? 0, vb = b[ctSortBy] ?? 0;
      return ctSortDir === 'desc' ? vb - va : va - vb;
    });
    return arr;
  }, [allUsers, ctSegment, ctSearch, ctStatus, ctCity, ctDevice, ctMinScore, ctRepeat, ctAnon, ctLang, ctSortBy, ctSortDir, USER_SEGMENTS]);

  const ctHot   = (contacts?.contacts || []).filter(c => c.power_score >= 80).length;
  const ctCarts = (contacts?.contacts || []).filter(c => c.cart_events > 0).length;
  const ctAvg   = contacts?.contacts?.length
    ? Math.round(contacts.contacts.reduce((s, c) => s + c.power_score, 0) / contacts.contacts.length)
    : 0;

  /* ─── Command Center (unified) ─── */
  const allDashCities = useMemo(() =>
    [...new Set((contacts?.contacts || []).map(c => c.city).filter(Boolean))].sort(),
    [contacts]);

  const filteredDash = useMemo(() => {
    let arr = [...(contacts?.contacts || [])];
    if (dashSearch) arr = arr.filter(c =>
      (c.phone || '').includes(dashSearch) ||
      (c.name  || '').toLowerCase().includes(dashSearch.toLowerCase()) ||
      (c.city  || '').toLowerCase().includes(dashSearch.toLowerCase())
    );
    if (dashStatus !== 'all') arr = arr.filter(c => c.status === dashStatus);
    if (dashCity)   arr = arr.filter(c => (c.city   || '').toLowerCase().includes(dashCity.toLowerCase()));
    if (dashDevice) arr = arr.filter(c => c.device === dashDevice);
    if (dashScore)  arr = arr.filter(c => c.power_score >= +dashScore);
    arr.sort((a, b) => {
      const va = a[dashSortBy] ?? 0, vb = b[dashSortBy] ?? 0;
      if (typeof va === 'string') return dashSortDir === 'desc' ? String(vb).localeCompare(String(va)) : String(va).localeCompare(String(vb));
      return dashSortDir === 'desc' ? vb - va : va - vb;
    });
    return arr;
  }, [contacts, dashSearch, dashStatus, dashCity, dashDevice, dashScore, dashSortBy, dashSortDir]);

  const dashKpi = useMemo(() => ({
    total:     filteredDash.length,
    carts:     filteredDash.filter(c => c.cart_events > 0).length,
    abandoned: filteredDash.filter(c => c.status === 'abandoned_cart').length,
    active:    filteredDash.filter(c => c.status === 'active').length,
    purchased: filteredDash.filter(c => c.status === 'purchased').length,
    hot:       filteredDash.filter(c => c.power_score >= 80).length,
  }), [filteredDash]);

  const dashStatusChart = useMemo(() => {
    const labels = { active: 'Active', product_view: 'Product View', abandoned_cart: 'Abandoned Cart', purchased: 'Purchased' };
    const map = {};
    filteredDash.forEach(c => { const s = c.status || 'active'; map[s] = (map[s] || 0) + 1; });
    return Object.entries(map).map(([k, v]) => ({ name: labels[k] || k, value: v }));
  }, [filteredDash]);

  const dashCityChart = useMemo(() => {
    const map = {};
    filteredDash.forEach(c => { if (c.city) map[c.city] = (map[c.city] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, visitors]) => ({ name, visitors }));
  }, [filteredDash]);

  const dashDeviceChart = useMemo(() => {
    const map = {};
    filteredDash.forEach(c => { const d = c.device || 'unknown'; map[d] = (map[d] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
  }, [filteredDash]);

  const dashPageChart = useMemo(() =>
    (pages?.pages || []).slice(0, 10).map(p => ({
      name: cleanUrl(p.url).slice(0, 22) || '/',
      views: p.views,
      unique: p.unique_visitors,
    })), [pages]);

  /* ═══ RENDER ══════════════════════════════════════════════════════════════ */
  return (
    <div className="space-y-5 max-w-7xl">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Analytics</h2>
          <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>Deep visitor behaviour, engagement & contact intelligence</p>
        </div>
        <div className="flex items-center gap-2">
          {[7,14,30,60].map(d => (
            <button key={d} onClick={() => setDays(d)}
              className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
              style={days === d
                ? { background: "rgba(37,211,102,0.1)", border: "1px solid rgba(37,211,102,0.4)", color: "#fff" }
                : { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", color: "#64748b" }}>
              {d}d
            </button>
          ))}
          <button onClick={load}
            className="p-2 rounded-xl transition-all"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", color: "#64748b" }}
            onMouseEnter={e => e.currentTarget.style.color = "#e2e8f0"}
            onMouseLeave={e => e.currentTarget.style.color = "#64748b"}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Top KPIs ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Visitors"      value={loading ? '…' : (overview?.visitors || 0).toLocaleString()}      icon={Users}       color="blue"   />
        <StatCard label="Cart Events"   value={loading ? '…' : (overview?.cartEvents || 0).toLocaleString()}    icon={TrendingUp}  color="orange" />
        <StatCard label="Recovered"     value={loading ? '…' : (overview?.recovered || 0).toLocaleString()}     icon={Zap}         color="green"  />
        <StatCard label="Messages Sent" value={loading ? '…' : (overview?.messagesSent || 0).toLocaleString()}  icon={Activity}    color="purple" />
      </div>

      {/* ── Tab bar ── */}
      <div className="flex gap-1 p-1 rounded-xl flex-wrap"
        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex items-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-all"
            style={tab === t.id
              ? { background: "#1a2035", color: "#fff", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }
              : { color: "#64748b", border: "1px solid transparent" }}
            onMouseEnter={e => { if (tab !== t.id) e.currentTarget.style.color = "#e2e8f0"; }}
            onMouseLeave={e => { if (tab !== t.id) e.currentTarget.style.color = "#64748b"; }}>
            <t.icon size={12} />{t.label}
          </button>
        ))}
      </div>

      {/* ════════════════════ OVERVIEW ════════════════════ */}
      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Visitor & Cart Trends</h3>
            {loading ? <div className="skeleton h-52 rounded-xl" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="gV" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0}   />
                    </linearGradient>
                    <linearGradient id="gC" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#f97316" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0}   />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<Tip />} />
                  <Area type="monotone" dataKey="visitors" name="Visitors" stroke="#22c55e" fill="url(#gV)" strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="carts"    name="Carts"    stroke="#f97316" fill="url(#gC)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Campaign Performance</h3>
              {loading ? <div className="skeleton h-40 rounded-xl" /> : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={overview?.campaignPerf || []} barSize={28}>
                    <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<Tip />} />
                    <Bar dataKey="total_sent"      name="Sent"      fill="#3b82f6" radius={[4,4,0,0]} />
                    <Bar dataKey="total_recovered" name="Recovered" fill="#22c55e" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Top Cities</h3>
              {loading ? <div className="skeleton h-40 rounded-xl" /> : (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width={120} height={120}>
                    <PieChart>
                      <Pie data={(overview?.topCities || []).map(c => ({ name: c.city, value: c.cnt }))}
                        dataKey="value" cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={2}>
                        {(overview?.topCities || []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-1.5">
                    {(overview?.topCities || []).slice(0, 6).map((c, i) => (
                      <div key={c.city} className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="text-xs flex-1 truncate" style={{ color: "#cbd5e1" }}>{c.city}</span>
                        <span className="text-xs font-mono" style={{ color: "#64748b" }}>{c.cnt}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════ PAGES ════════════════════ */}
      {tab === 'pages' && (
        <div className="space-y-4">
          {/* Top pages bar chart */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Trophy size={14} style={{ color: "#f59e0b" }} /> Top Pages by Traffic
              </h3>
              <span className="text-xs" style={{ color: "#64748b" }}>{pages?.total_views || 0} total views</span>
            </div>
            {loading ? <div className="skeleton h-44 rounded-xl" /> : topPagesChart.length === 0 ? (
              <p className="text-sm text-center py-10" style={{ color: "#475569" }}>No page view data yet. Install tracker.js.</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={topPagesChart} layout="vertical" barSize={14} margin={{ left: 10 }}>
                  <XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<Tip />} />
                  <Bar dataKey="views"  name="Views"   fill="#3b82f6" radius={[0,4,4,0]} />
                  <Bar dataKey="unique" name="Unique"  fill="#22c55e" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Filters */}
          <FilterBar>
            <SearchInput value={pageSearch} onChange={setPageSearch} placeholder="Search page URL or title…" />
            <FilterSelect value={pageMinViews} onChange={setPageMinViews}>
              <option value="">All Traffic</option>
              <option value="5">5+ views</option>
              <option value="10">10+ views</option>
              <option value="50">50+ views</option>
              <option value="100">100+ views</option>
            </FilterSelect>
            <span className="text-xs ml-auto" style={{ color: "#475569" }}>{filteredPages.length} pages</span>
          </FilterBar>

          {/* Table */}
          <div className="card">
            {loading ? <div className="skeleton h-64 rounded-xl m-5" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      <th className="text-left py-3 px-4 font-medium" style={{ color: "#64748b" }}>Page</th>
                      {[
                        { label: 'Views',      col: 'views'            },
                        { label: 'Unique',     col: 'unique_visitors'  },
                        { label: 'Avg Time',   col: 'avg_duration_sec' },
                        { label: 'Scroll',     col: 'avg_scroll_pct'   },
                        { label: 'Engagement', col: 'avg_engagement'   },
                        { label: 'Bounce',     col: 'bounce_rate'      },
                        { label: 'Exit %',     col: 'exit_rate'        },
                      ].map(c => (
                        <SortTh key={c.col} col={c.col} label={c.label}
                          sortBy={pageSortBy} sortDir={pageSortDir}
                          onSort={col => toggleSort(col, pageSortBy, pageSortDir, setPageSortBy, setPageSortDir)} />
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPages.length === 0 && (
                      <tr><td colSpan={8} className="text-center py-12" style={{ color: "#475569" }}>
                        No pages match your filters.
                      </td></tr>
                    )}
                    {filteredPages.map((p, i) => {
                      const isTop = i < 3;
                      const isHighEngage = p.avg_engagement >= 60;
                      const isHighBounce = p.bounce_rate > 70;
                      return (
                        <tr key={i} className="transition-colors"
                          style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}
                          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
                          onMouseLeave={e => e.currentTarget.style.background = ""}>
                          <td className="py-3 px-4">
                            <div className="flex items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                                  <span className="font-medium text-white truncate max-w-[220px]" title={p.url}>
                                    {p.title || cleanUrl(p.url)}
                                  </span>
                                  {isTop && <PerfBadge label={i === 0 ? "🏆 #1" : `#${i+1}`} color="top" />}
                                  {isHighEngage && <PerfBadge label="High Engage" color="good" />}
                                </div>
                                <p className="text-[10px] truncate max-w-[260px]" style={{ color: "#475569" }}
                                  title={p.url}>{cleanUrl(p.url)}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-mono font-semibold text-white">{p.views}</span>
                          </td>
                          <td className="py-3 px-4 font-mono" style={{ color: "#94a3b8" }}>{p.unique_visitors}</td>
                          <td className="py-3 px-4 font-mono" style={{ color: "#94a3b8" }}>{fmt(p.avg_duration_sec)}</td>
                          <td className="py-3 px-4">
                            <MiniBar pct={p.avg_scroll_pct} color="#3b82f6" />
                          </td>
                          <td className="py-3 px-4"><ScoreBadge score={p.avg_engagement} /></td>
                          <td className="py-3 px-4">
                            <span className="font-mono text-xs" style={{ color: isHighBounce ? "#f87171" : "#94a3b8" }}>
                              {p.bounce_rate}%
                            </span>
                            {isHighBounce && <span className="ml-1 text-[9px]" style={{ color: "#f87171" }}>↑</span>}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs" style={{ color: "#94a3b8" }}>{p.exit_rate}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════ USERS ════════════════════ */}
      {tab === 'users' && !userDetail && (
        <div className="space-y-4">

          {/* ── Segment Selector (Mixpanel / CleverTap style) ── */}
          <div className="overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            <div className="flex gap-3 min-w-max">
              {USER_SEGMENTS.map(seg => {
                const cnt   = allUsers.filter(seg.filterFn).length;
                const total = allUsers.length || 1;
                const pct   = Math.round((cnt / total) * 100);
                const isActive = ctSegment === seg.id;
                const Icon = seg.icon;
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
                    {/* progress bar */}
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

          {/* ── Funnel strip ── */}
          {!loading && allUsers.length > 0 && (() => {
            const steps = [
              { label: 'Active',         cnt: allUsers.filter(c => c.status === 'active').length,             color: "#4ade80" },
              { label: 'Product View',   cnt: allUsers.filter(c => c.status === 'product_view').length,       color: "#a855f7" },
              { label: 'Cart',           cnt: allUsers.filter(c => c.status === 'abandoned_cart').length,     color: "#fb923c" },
              { label: 'Checkout',       cnt: allUsers.filter(c => c.status === 'abandoned_checkout').length, color: "#f59e0b" },
              { label: 'Purchased',      cnt: allUsers.filter(c => c.status === 'purchased').length,          color: "#22c55e" },
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
                    const pct = Math.round((s.cnt / allUsers.length) * 100);
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
                            ↓ {Math.round((1 - s.cnt / Math.max(steps[i-1].cnt, 1)) * 100)}% drop
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* ── Filters ── */}
          <div className="card p-3">
            <div className="flex flex-wrap gap-2 items-center">
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
              {(ctSearch || ctStatus !== 'all' || ctDevice || ctMinScore || ctRepeat || ctAnon || ctLang || ctCity || ctSegment !== 'all') && (
                <button onClick={() => { setCtSearch(''); setCtStatus('all'); setCtDevice(''); setCtMinScore(''); setCtRepeat(''); setCtAnon(''); setCtLang(''); setCtCity(''); setCtSegment('all'); }}
                  className="text-[10px] px-2 py-1 rounded-lg flex items-center gap-1"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                  <X size={9} /> Reset
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="card">
            {loading ? <div className="skeleton h-64 rounded-xl m-5" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      {[
                        { label: 'User',       col: 'name'             },
                        { label: 'Power',      col: 'power_score'      },
                        { label: 'Engage',     col: 'engagement_score' },
                        { label: 'Pages',      col: 'page_views'       },
                        { label: 'Time',       col: 'total_time_sec'   },
                        { label: 'Carts',      col: 'cart_events'      },
                        { label: 'Status',     col: 'status'           },
                        { label: 'City',       col: 'city'             },
                        { label: 'Device',     col: 'device'           },
                        { label: 'Last Seen',  col: 'last_seen'        },
                        { label: '',           col: ''                 },
                      ].map(c => c.col
                        ? <SortTh key={c.col} col={c.col} label={c.label} sortBy={ctSortBy} sortDir={ctSortDir}
                            onSort={col => toggleSort(col, ctSortBy, ctSortDir, setCtSortBy, setCtSortDir)} />
                        : <th key="action" className="py-3 px-3" />
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredContacts.length === 0 && (
                      <tr><td colSpan={11} className="text-center py-12" style={{ color: "#475569" }}>No users match your filters.</td></tr>
                    )}
                    {filteredContacts.slice(0, 200).map((c, i) => {
                      const ss =
                        c.status === 'purchased'           ? { bg: "rgba(34,197,94,0.1)",   border: "rgba(34,197,94,0.25)",   color: "#4ade80"  } :
                        c.status === 'abandoned_cart'      ? { bg: "rgba(249,115,22,0.1)",  border: "rgba(249,115,22,0.25)",  color: "#fb923c"  } :
                        c.status === 'abandoned_checkout'  ? { bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.25)",   color: "#f87171"  } :
                        c.status === 'product_view'        ? { bg: "rgba(59,130,246,0.1)",  border: "rgba(59,130,246,0.25)",  color: "#60a5fa"  } :
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
                          <td className="py-3 px-3 font-mono" style={{ color: "#94a3b8" }}>{fmt(c.total_time_sec)}</td>
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
                              onMouseEnter={e => { e.currentTarget.style.background = "rgba(59,130,246,0.2)"; }}
                              onMouseLeave={e => { e.currentTarget.style.background = "rgba(59,130,246,0.1)"; }}>
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
      )}

      {/* ════════════════════ USER PROFILE ════════════════════ */}
      {tab === 'users' && userDetail && (
        <UserProfile
          contact={userDetail}
          activity={userActivity}
          loading={userActivityLoading}
          onBack={() => { setUserDetail(null); setUserActivity(null); }}
        />
      )}

      {/* ════════════════════ REPEAT CUSTOMERS ════════════════════ */}
      {tab === 'repeat' && (() => {
        const purchased    = (repeatVis || []).filter(r => r.purchase_count > 0);
        const notPurchased = (repeatVis || []).filter(r => r.purchase_count === 0);
        const totalRev     = (repeatVis || []).reduce((s, r) => s + r.total_spent, 0);
        const avgVisits    = repeatVis?.length ? ((repeatVis || []).reduce((s, r) => s + r.visit_count, 0) / repeatVis.length).toFixed(1) : 0;

        const base = rpFilter === 'purchased' ? purchased : rpFilter === 'not_purchased' ? notPurchased : (repeatVis || []);
        const filteredRepeat = rpSearch
          ? base.filter(r =>
              (r.name || '').toLowerCase().includes(rpSearch.toLowerCase()) ||
              (r.phone || '').includes(rpSearch) ||
              (r.city || '').toLowerCase().includes(rpSearch.toLowerCase())
            )
          : base;

        const tier = v => v >= 7 ? { label: 'Gold', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' }
                         : v >= 4 ? { label: 'Silver', color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' }
                                  : { label: 'Bronze', color: '#fb923c', bg: 'rgba(251,146,60,0.1)' };

        const statusColor = s =>
          s === 'purchased'          ? '#4ade80' :
          s === 'abandoned_cart'     ? '#fb923c' :
          s === 'abandoned_checkout' ? '#f59e0b' :
          s === 'product_view'       ? '#60a5fa' : '#94a3b8';

        return (
          <div className="space-y-5">
            {/* ── KPI row ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Repeat Customers',  value: repeatVis?.length ?? '…',                                           icon: Repeat,      color: 'purple' },
                { label: 'Avg. Visits',        value: repeatVis ? `${avgVisits}×` : '…',                                 icon: TrendingUp,  color: 'blue'   },
                { label: 'Converted (bought)', value: `${purchased.length} / ${repeatVis?.length || 0}`,                 icon: Trophy,      color: 'green'  },
                { label: 'Total Revenue',      value: repeatVis ? `₹${totalRev.toLocaleString()}` : '…',                 icon: DollarSign,  color: 'orange' },
              ].map(k => <StatCard key={k.label} {...k} />)}
            </div>

            {/* ── Segment toggle + Search ── */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Filter pills */}
              <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                {[
                  { id: 'all',           label: `All  (${(repeatVis||[]).length})`,         color: '#c084fc' },
                  { id: 'purchased',     label: `✅ Purchased  (${purchased.length})`,      color: '#4ade80' },
                  { id: 'not_purchased', label: `⏳ Not Yet  (${notPurchased.length})`,     color: '#fb923c' },
                ].map(f => (
                  <button key={f.id} onClick={() => setRpFilter(f.id)}
                    className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all"
                    style={rpFilter === f.id
                      ? { background: `${f.color}18`, border: `1px solid ${f.color}50`, color: f.color }
                      : { color: '#475569', border: '1px solid transparent' }}>
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="relative flex-1 min-w-48">
                <Search size={12} style={{ color: '#475569', position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                <input value={rpSearch} onChange={e => setRpSearch(e.target.value)}
                  placeholder="Search name, phone, city…"
                  className="w-full pl-8 pr-3 py-2 rounded-xl text-xs"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', outline: 'none' }} />
              </div>

              <span className="text-xs ml-auto" style={{ color: '#475569' }}>
                <span className="text-white font-semibold">{filteredRepeat.length}</span> customers
              </span>
            </div>

            {/* ── Cards ── */}
            {repeatLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[...Array(6)].map((_, i) => <div key={i} className="skeleton h-48 rounded-2xl" />)}
              </div>
            ) : !filteredRepeat.length ? (
              <div className="card py-16 text-center">
                <Repeat size={32} className="mx-auto mb-3 opacity-20" style={{ color: '#c084fc' }} />
                <p className="text-sm font-semibold text-white">No repeat customers yet</p>
                <p className="text-xs mt-1" style={{ color: '#475569' }}>
                  {rpFilter !== 'all' || rpSearch ? 'Try adjusting your filters.' : 'They appear once a user returns with the same phone number.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredRepeat.map((r, i) => {
                  const t = tier(r.visit_count);
                  const hasPurchased = r.purchase_count > 0;
                  return (
                    <div key={i} className="rounded-2xl overflow-hidden transition-all"
                      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}
                      onMouseEnter={e => { e.currentTarget.style.border = '1px solid rgba(168,85,247,0.25)'; e.currentTarget.style.boxShadow = '0 0 24px rgba(168,85,247,0.08)'; }}
                      onMouseLeave={e => { e.currentTarget.style.border = '1px solid rgba(255,255,255,0.07)'; e.currentTarget.style.boxShadow = ''; }}>

                      {/* Card header */}
                      <div className="flex items-center gap-3 px-4 pt-4 pb-3"
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        {/* Avatar */}
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-base font-bold flex-shrink-0"
                          style={{ background: 'rgba(168,85,247,0.15)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.25)' }}>
                          {(r.name || r.phone || '?')[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-white truncate">{r.name || 'Unknown'}</p>
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide flex-shrink-0"
                              style={{ background: t.bg, color: t.color, border: `1px solid ${t.color}40` }}>
                              {t.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {r.phone && <span className="text-[10px] font-mono" style={{ color: '#4ade80' }}>{r.phone}</span>}
                            {r.city  && <span className="text-[10px]" style={{ color: '#64748b' }}>📍 {r.city}</span>}
                            {r.language && <span className="text-[10px]" style={{ color: '#64748b' }}>🌐 {r.language}</span>}
                          </div>
                        </div>
                        {/* Purchase badge */}
                        <span className="text-[10px] px-2 py-1 rounded-xl font-bold flex-shrink-0"
                          style={hasPurchased
                            ? { background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)', color: '#4ade80' }
                            : { background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.2)', color: '#fb923c' }}>
                          {hasPurchased ? '✅ Purchased' : '⏳ Not Yet'}
                        </span>
                      </div>

                      {/* Stats row */}
                      <div className="grid grid-cols-4 divide-x px-0"
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', '--tw-divide-opacity': 1, borderColor: 'rgba(255,255,255,0.05)' }}>
                        {[
                          { label: 'Visits',    value: `${r.visit_count}×`,                                                    color: '#c084fc' },
                          { label: 'Purchases', value: r.purchase_count > 0 ? `${r.purchase_count}×` : '—',                    color: r.purchase_count > 0 ? '#4ade80' : '#475569' },
                          { label: 'Revenue',   value: r.total_spent > 0 ? `₹${r.total_spent.toLocaleString()}` : '—',         color: r.total_spent > 0 ? '#fb923c' : '#475569' },
                          { label: 'Last Seen', value: r.last_visit_at ? new Date(r.last_visit_at).toLocaleDateString('en', { day: 'numeric', month: 'short' }) : '—', color: '#64748b' },
                        ].map(s => (
                          <div key={s.label} className="py-2.5 text-center">
                            <p className="text-sm font-bold" style={{ color: s.color }}>{s.value}</p>
                            <p className="text-[9px] uppercase tracking-wide mt-0.5" style={{ color: '#475569' }}>{s.label}</p>
                          </div>
                        ))}
                      </div>

                      {/* Journey pipeline */}
                      <div className="px-4 py-3">
                        <p className="text-[9px] uppercase tracking-widest font-semibold mb-2" style={{ color: '#334155' }}>Journey across visits</p>
                        <div className="flex items-center gap-1 flex-wrap">
                          {(r.status_journey || []).map((s, j) => {
                            const c = statusColor(s);
                            return (
                              <React.Fragment key={j}>
                                <span className="text-[9px] px-2 py-0.5 rounded-full font-semibold"
                                  style={{ background: `${c}15`, border: `1px solid ${c}35`, color: c }}>
                                  {s.replace(/_/g, ' ')}
                                </span>
                                {j < r.status_journey.length - 1 && (
                                  <span style={{ color: '#334155', fontSize: 9 }}>→</span>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </div>

                        {/* First / Last visit dates */}
                        <div className="flex items-center justify-between mt-3">
                          <div className="text-[9px]" style={{ color: '#334155' }}>
                            First visit: <span style={{ color: '#64748b' }}>
                              {r.first_visit_at ? new Date(r.first_visit_at).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                            </span>
                          </div>
                          {r.last_purchase_at && (
                            <div className="text-[9px]" style={{ color: '#334155' }}>
                              Last purchase: <span style={{ color: '#4ade80' }}>
                                {new Date(r.last_purchase_at).toLocaleDateString('en', { day: 'numeric', month: 'short' })}
                              </span>
                            </div>
                          )}
                          <button onClick={() => openUserDetail(r)}
                            className="text-[10px] px-2.5 py-1 rounded-lg font-semibold transition-all"
                            style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.25)', color: '#c084fc' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.2)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.1)'; }}>
                            View Profile →
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {tab === 'cities' && (
        <div className="space-y-4">
          {/* Top cities chart */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Globe size={14} style={{ color: "#3b82f6" }} /> City Traffic Distribution
            </h3>
            {loading ? <div className="skeleton h-40 rounded-xl" /> : (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={(cities?.cities || []).slice(0, 12).map(c => ({ name: c.city, visitors: c.visitors, carts: c.carts }))} barSize={18}>
                  <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<Tip />} />
                  <Bar dataKey="visitors" name="Visitors" fill="#3b82f6" radius={[3,3,0,0]} />
                  <Bar dataKey="carts"    name="Carts"    fill="#f97316" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Filters */}
          <FilterBar>
            <SearchInput value={citySearch} onChange={setCitySearch} placeholder="Search city or state…" />
            {allStates.length > 0 && (
              <FilterSelect value={cityState} onChange={setCityState}>
                <option value="">All States</option>
                {allStates.map(s => <option key={s} value={s}>{s}</option>)}
              </FilterSelect>
            )}
            <span className="text-xs ml-auto" style={{ color: "#475569" }}>{filteredCities.length} cities</span>
          </FilterBar>

          {/* Table */}
          <div className="card">
            {loading ? <div className="skeleton h-64 rounded-xl m-5" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      <th className="text-left py-3 px-4 font-medium" style={{ color: "#64748b" }}>#</th>
                      {[
                        { label: 'City',        col: 'city'            },
                        { label: 'State',        col: 'state'           },
                        { label: 'Visitors',     col: 'visitors'        },
                        { label: 'Identified',   col: 'with_phone'      },
                        { label: 'Carts',        col: 'carts'           },
                        { label: 'Purchases',    col: 'purchases'       },
                        { label: 'Engagement',   col: 'avg_engagement'  },
                        { label: 'Conv %',       col: 'conversion_rate' },
                      ].map(c => (
                        <SortTh key={c.col} col={c.col} label={c.label}
                          sortBy={citySortBy} sortDir={citySortDir}
                          onSort={col => toggleSort(col, citySortBy, citySortDir, setCitySortBy, setCitySortDir)} />
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCities.length === 0 && (
                      <tr><td colSpan={9} className="text-center py-12" style={{ color: "#475569" }}>No city data yet.</td></tr>
                    )}
                    {filteredCities.map((c, i) => {
                      const identPct = c.visitors ? Math.round(c.with_phone / c.visitors * 100) : 0;
                      const isTopCity = i < 3;
                      return (
                        <tr key={i} className="transition-colors"
                          style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}
                          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
                          onMouseLeave={e => e.currentTarget.style.background = ""}>
                          <td className="py-3 px-4 text-xs font-mono" style={{ color: "#475569" }}>{i + 1}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-white">{c.city}</span>
                              {isTopCity && <PerfBadge label={i === 0 ? "🏆 Top" : "Top"} color="top" />}
                              {c.conversion_rate >= 5 && <PerfBadge label="High Conv" color="good" />}
                            </div>
                          </td>
                          <td className="py-3 px-4" style={{ color: "#94a3b8" }}>{c.state || '—'}</td>
                          <td className="py-3 px-4 font-mono font-semibold text-white">{c.visitors}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1">
                              <span className="font-mono" style={{ color: "#4ade80" }}>{c.with_phone}</span>
                              <span className="text-[10px]" style={{ color: "#475569" }}>({identPct}%)</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono" style={{ color: "#fb923c" }}>{c.carts}</td>
                          <td className="py-3 px-4 font-mono" style={{ color: "#4ade80" }}>{c.purchases}</td>
                          <td className="py-3 px-4"><ScoreBadge score={c.avg_engagement} /></td>
                          <td className="py-3 px-4">
                            <span className="font-mono text-xs font-semibold"
                              style={{ color: c.conversion_rate >= 5 ? "#4ade80" : c.conversion_rate >= 2 ? "#fb923c" : "#64748b" }}>
                              {c.conversion_rate}%
                            </span>
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
      )}

      {/* ════════════════════ DEVICES ════════════════════ */}
      {tab === 'devices' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {loading ? Array(4).fill(0).map((_, i) => <div key={i} className="skeleton h-52 rounded-2xl" />) : [
              { title: 'Device Type', data: devices?.devices   || [] },
              { title: 'Browser',     data: devices?.browsers  || [] },
              { title: 'OS Platform', data: devices?.os        || [] },
              { title: 'Language',    data: devices?.languages || [] },
            ].map(({ title, data }) => (
              <div key={title} className="card p-5">
                <h3 className="text-sm font-semibold text-white mb-4">{title}</h3>
                {data.length === 0 ? (
                  <p className="text-xs text-center py-8" style={{ color: "#475569" }}>No data yet</p>
                ) : (
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width={110} height={110}>
                      <PieChart>
                        <Pie data={data} dataKey="value" cx="50%" cy="50%" innerRadius={28} outerRadius={52} paddingAngle={2}>
                          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex-1 space-y-2.5">
                      {data.slice(0, 6).map((d, i) => {
                        const total = data.reduce((s, x) => s + x.value, 0);
                        const pct = total ? Math.round(d.value / total * 100) : 0;
                        return (
                          <div key={d.name}>
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                                <span className="text-xs" style={{ color: "#cbd5e1" }}>{d.name}</span>
                              </div>
                              <span className="text-xs font-mono font-semibold" style={{ color: "#94a3b8" }}>{pct}%</span>
                            </div>
                            <div className="h-1.5 rounded-full overflow-hidden ml-3.5" style={{ background: "rgba(255,255,255,0.05)" }}>
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ════════════════════ ENGAGEMENT ════════════════════ */}
      {tab === 'engagement' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Avg Time on Page"  value={loading ? '…' : fmt(engagement?.avgDuration || 0)}              icon={Clock}        color="blue"   />
            <StatCard label="Avg Scroll Depth"  value={loading ? '…' : `${engagement?.avgScroll || 0}%`}               icon={MousePointer} color="purple" />
            <StatCard label="Avg Engagement"    value={loading ? '…' : (engagement?.avgEngage || 0)}                   icon={Activity}     color="orange" />
            <StatCard label="Total Page Views"  value={loading ? '…' : (engagement?.totalViews || 0).toLocaleString()} icon={Eye}          color="green"  />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Scroll Depth Distribution</h3>
              {loading ? <div className="skeleton h-40 rounded-xl" /> : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={engagement?.scrollBuckets || []} barSize={32}>
                    <XAxis dataKey="range" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<Tip />} />
                    <Bar dataKey="count" name="Sessions" fill="#3b82f6" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Engagement Score Distribution</h3>
              {loading ? <div className="skeleton h-40 rounded-xl" /> : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={engagement?.engDistribution || []} barSize={32}>
                    <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<Tip />} />
                    <Bar dataKey="count" name="Users" radius={[4,4,0,0]}>
                      {(engagement?.engDistribution || []).map((_, i) => (
                        <Cell key={i} fill={['#64748b','#3b82f6','#f59e0b','#f97316','#ef4444'][i] || '#3b82f6'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Time on Page</h3>
              {loading ? <div className="skeleton h-40 rounded-xl" /> : (
                <div className="space-y-3 pt-2">
                  {(engagement?.durationBuckets || []).map((b, i) => {
                    const total = (engagement?.durationBuckets || []).reduce((s, x) => s + x.count, 0);
                    const pct = total ? Math.round(b.count / total * 100) : 0;
                    const colors = ['#ef4444','#f97316','#f59e0b','#22c55e','#3b82f6'];
                    return (
                      <div key={b.label}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span style={{ color: "#cbd5e1" }}>{b.label}</span>
                          <span className="font-mono" style={{ color: "#64748b" }}>{b.count} ({pct}%)</span>
                        </div>
                        <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: colors[i] || '#3b82f6' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════ COMMAND CENTER ════════════════════ */}
      {tab === 'dash' && (
        <div className="space-y-4">

          {/* ── Unified filter bar ── */}
          <div className="p-4 rounded-2xl space-y-3"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-2 flex-wrap">
              <Filter size={13} style={{ color: "#475569" }} />
              <span className="text-xs font-semibold" style={{ color: "#64748b" }}>FILTER — all charts & list update live</span>
              {(dashCity || dashStatus !== 'all' || dashDevice || dashScore || dashSearch) && (
                <button onClick={() => { setDashCity(''); setDashStatus('all'); setDashDevice(''); setDashScore(''); setDashSearch(''); }}
                  className="ml-auto flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors"
                  style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
                  <X size={10} /> Clear all
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <SearchInput value={dashSearch} onChange={setDashSearch} placeholder="Search name, phone, city…" />
              <FilterSelect value={dashStatus} onChange={setDashStatus}>
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="product_view">Product View</option>
                <option value="abandoned_cart">Abandoned Cart</option>
                <option value="purchased">Purchased</option>
              </FilterSelect>
              <FilterSelect value={dashDevice} onChange={setDashDevice}>
                <option value="">All Devices</option>
                <option value="mobile">Mobile</option>
                <option value="desktop">Desktop</option>
                <option value="tablet">Tablet</option>
              </FilterSelect>
              <FilterSelect value={dashScore} onChange={setDashScore}>
                <option value="">Any Score</option>
                <option value="80">Hot (80+)</option>
                <option value="60">High (60+)</option>
                <option value="40">Medium (40+)</option>
              </FilterSelect>
              {allDashCities.length > 0 && (
                <FilterSelect value={dashCity} onChange={setDashCity}>
                  <option value="">All Cities</option>
                  {allDashCities.map(c => <option key={c} value={c}>{c}</option>)}
                </FilterSelect>
              )}
            </div>
            {/* Active filter chips */}
            {(dashCity || dashStatus !== 'all' || dashDevice || dashScore) && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {dashStatus !== 'all' && (
                  <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)", color: "#60a5fa" }}>
                    Status: {dashStatus.replace('_', ' ')}
                    <button onClick={() => setDashStatus('all')}><X size={9} /></button>
                  </span>
                )}
                {dashCity && (
                  <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.25)", color: "#c084fc" }}>
                    City: {dashCity}
                    <button onClick={() => setDashCity('')}><X size={9} /></button>
                  </span>
                )}
                {dashDevice && (
                  <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(20,184,166,0.12)", border: "1px solid rgba(20,184,166,0.25)", color: "#2dd4bf" }}>
                    Device: {dashDevice}
                    <button onClick={() => setDashDevice('')}><X size={9} /></button>
                  </span>
                )}
                {dashScore && (
                  <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(249,115,22,0.12)", border: "1px solid rgba(249,115,22,0.25)", color: "#fb923c" }}>
                    Score ≥{dashScore}
                    <button onClick={() => setDashScore('')}><X size={9} /></button>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ── KPI Row ── */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {[
              { label: 'Contacts',      value: dashKpi.total,     icon: Users,        color: 'blue'   },
              { label: 'Add to Cart',   value: dashKpi.carts,     icon: ShoppingCart, color: 'orange' },
              { label: 'Abandoned',     value: dashKpi.abandoned, icon: Package,      color: 'pink'   },
              { label: 'Active',        value: dashKpi.active,    icon: UserCheck,    color: 'green'  },
              { label: 'Purchased',     value: dashKpi.purchased, icon: CheckCircle,  color: 'purple' },
              { label: 'Hot (80+)',     value: dashKpi.hot,       icon: Flame,        color: 'orange' },
            ].map(k => (
              <StatCard key={k.label} label={k.label} value={loading ? '…' : k.value} icon={k.icon} color={k.color} />
            ))}
          </div>

          {/* ── Charts row ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Status Breakdown */}
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <Activity size={13} style={{ color: "#a855f7" }} /> Status Breakdown
              </h3>
              {loading ? <div className="skeleton h-44 rounded-xl" /> : dashStatusChart.length === 0 ? (
                <p className="text-xs text-center py-10" style={{ color: "#475569" }}>No data</p>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <ResponsiveContainer width="100%" height={140}>
                    <PieChart>
                      <Pie data={dashStatusChart} dataKey="value" cx="50%" cy="50%"
                        innerRadius={38} outerRadius={62} paddingAngle={3}>
                        {dashStatusChart.map((_, i) => <Cell key={i} fill={["#60a5fa","#3b82f6","#fb923c","#4ade80"][i % 4]} />)}
                      </Pie>
                      <Tooltip content={<Tip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="w-full space-y-1.5">
                    {dashStatusChart.map((d, i) => {
                      const total = dashStatusChart.reduce((s, x) => s + x.value, 0);
                      const pct = total ? Math.round(d.value / total * 100) : 0;
                      const cls = ["#60a5fa","#3b82f6","#fb923c","#4ade80"][i % 4];
                      return (
                        <div key={d.name} className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: cls }} />
                          <span className="text-xs flex-1 truncate" style={{ color: "#cbd5e1" }}>{d.name}</span>
                          <span className="text-xs font-mono font-semibold" style={{ color: cls }}>{d.value}</span>
                          <span className="text-[10px] font-mono" style={{ color: "#475569" }}>{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* City Distribution */}
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <MapPin size={13} style={{ color: "#22c55e" }} /> Visitors by City
                {dashCityChart.length > 0 && (
                  <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded"
                    style={{ background: "rgba(34,197,94,0.1)", color: "#4ade80" }}>
                    {dashCityChart.length} cities
                  </span>
                )}
              </h3>
              {loading ? <div className="skeleton h-44 rounded-xl" /> : dashCityChart.length === 0 ? (
                <p className="text-xs text-center py-10" style={{ color: "#475569" }}>No city data</p>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={dashCityChart} layout="vertical" barSize={12} margin={{ left: 0, right: 8 }}>
                    <XAxis type="number" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={90} tick={{ fill: '#94a3b8', fontSize: 9 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<Tip />} />
                    <Bar dataKey="visitors" name="Contacts" radius={[0, 4, 4, 0]}>
                      {dashCityChart.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Device Distribution */}
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <Smartphone size={13} style={{ color: "#3b82f6" }} /> Devices
              </h3>
              {loading ? <div className="skeleton h-44 rounded-xl" /> : dashDeviceChart.length === 0 ? (
                <p className="text-xs text-center py-10" style={{ color: "#475569" }}>No data</p>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <ResponsiveContainer width="100%" height={130}>
                    <PieChart>
                      <Pie data={dashDeviceChart} dataKey="value" cx="50%" cy="50%"
                        innerRadius={32} outerRadius={58} paddingAngle={3}>
                        {dashDeviceChart.map((_, i) => <Cell key={i} fill={["#3b82f6","#22c55e","#a855f7"][i % 3]} />)}
                      </Pie>
                      <Tooltip content={<Tip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="w-full space-y-2">
                    {dashDeviceChart.map((d, i) => {
                      const total = dashDeviceChart.reduce((s, x) => s + x.value, 0);
                      const pct = total ? Math.round(d.value / total * 100) : 0;
                      const col = ["#3b82f6","#22c55e","#a855f7"][i % 3];
                      const Icon = d.name === 'mobile' ? Smartphone : d.name === 'desktop' ? Monitor : TrendingUp;
                      return (
                        <div key={d.name} className="flex items-center gap-2">
                          <Icon size={11} style={{ color: col }} />
                          <span className="text-xs flex-1 capitalize" style={{ color: "#cbd5e1" }}>{d.name}</span>
                          <span className="text-xs font-mono font-semibold" style={{ color: col }}>{d.value}</span>
                          <span className="text-[10px] font-mono" style={{ color: "#475569" }}>{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Page Traffic chart (always full data, not contact-filtered) ── */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Eye size={13} style={{ color: "#f59e0b" }} /> Page Traffic — Visitors per Page
              </h3>
              <span className="text-[10px] px-2 py-1 rounded-lg"
                style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.15)", color: "#fbbf24" }}>
                {pages?.total_views || 0} total views
              </span>
            </div>
            {loading ? <div className="skeleton h-52 rounded-xl" /> : dashPageChart.length === 0 ? (
              <p className="text-sm text-center py-12" style={{ color: "#475569" }}>No page data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={dashPageChart} layout="vertical" barSize={14} margin={{ left: 10, right: 16 }}>
                  <XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={130} tick={{ fill: '#94a3b8', fontSize: 9 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<Tip />} />
                  <Bar dataKey="views"  name="Views"  fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="unique" name="Unique" fill="#22c55e" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* ── Contact list (filtered) ── */}
          <div className="card">
            <div className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Users size={13} style={{ color: "#60a5fa" }} /> Contact List
              </h3>
              <div className="flex items-center gap-3">
                <span className="text-xs" style={{ color: "#475569" }}>{filteredDash.length} contacts</span>
                <FilterSelect value={`${dashSortBy}|${dashSortDir}`} onChange={v => {
                  const [col, dir] = v.split('|');
                  setDashSortBy(col); setDashSortDir(dir);
                }}>
                  <option value="power_score|desc">Sort: Power ↓</option>
                  <option value="power_score|asc">Sort: Power ↑</option>
                  <option value="last_seen|desc">Sort: Recent</option>
                  <option value="cart_events|desc">Sort: Most Carts</option>
                  <option value="page_views|desc">Sort: Most Pages</option>
                  <option value="total_time_sec|desc">Sort: Most Time</option>
                </FilterSelect>
              </div>
            </div>
            {loading ? <div className="skeleton h-64 rounded-xl m-5" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      {[
                        'Contact', 'Power', 'Status', 'City', 'Device',
                        'Pages', 'Carts', 'Time', 'Scroll', 'Engage', 'Last Seen',
                      ].map(h => (
                        <th key={h} className="text-left py-2.5 px-3 font-medium whitespace-nowrap"
                          style={{ color: "#64748b" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDash.length === 0 && (
                      <tr><td colSpan={11} className="text-center py-14" style={{ color: "#475569" }}>
                        No contacts match your filters.
                      </td></tr>
                    )}
                    {filteredDash.slice(0, 200).map((c, i) => {
                      const ss =
                        c.status === 'purchased'      ? { bg: "rgba(34,197,94,0.1)",   border: "rgba(34,197,94,0.25)",   color: "#4ade80"  } :
                        c.status === 'abandoned_cart' ? { bg: "rgba(249,115,22,0.1)",  border: "rgba(249,115,22,0.25)",  color: "#fb923c"  } :
                        c.status === 'product_view'   ? { bg: "rgba(59,130,246,0.1)",  border: "rgba(59,130,246,0.25)",  color: "#60a5fa"  } :
                                                        { bg: "rgba(100,116,139,0.1)", border: "rgba(100,116,139,0.25)", color: "#94a3b8"  };
                      return (
                        <tr key={i} className="transition-colors"
                          style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}
                          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.025)"}
                          onMouseLeave={e => e.currentTarget.style.background = ""}>
                          <td className="py-2.5 px-3">
                            <p className="font-medium text-white leading-tight">{c.name || '—'}</p>
                            <p className="font-mono text-[10px] mt-0.5" style={{ color: "#4ade80" }}>{c.phone}</p>
                          </td>
                          <td className="py-2.5 px-3"><ScoreBadge score={c.power_score} /></td>
                          <td className="py-2.5 px-3">
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap"
                              style={{ background: ss.bg, border: `1px solid ${ss.border}`, color: ss.color }}>
                              {(c.status || 'active').replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <button className="text-xs transition-colors" style={{ color: "#94a3b8" }}
                              onClick={() => setDashCity(c.city || '')}
                              onMouseEnter={e => e.currentTarget.style.color = "#c084fc"}
                              onMouseLeave={e => e.currentTarget.style.color = "#94a3b8"}
                              title="Filter by city">
                              {c.city || '—'}
                            </button>
                          </td>
                          <td className="py-2.5 px-3 text-xs capitalize" style={{ color: "#64748b" }}>{c.device || '—'}</td>
                          <td className="py-2.5 px-3 font-mono text-center text-white">{c.page_views}</td>
                          <td className="py-2.5 px-3 font-mono text-center"
                            style={{ color: c.cart_events > 0 ? "#fb923c" : "#64748b" }}>{c.cart_events}</td>
                          <td className="py-2.5 px-3 font-mono text-xs" style={{ color: "#94a3b8" }}>{fmt(c.total_time_sec)}</td>
                          <td className="py-2.5 px-3">
                            <MiniBar pct={c.avg_scroll_pct} color="#3b82f6" width={44} />
                          </td>
                          <td className="py-2.5 px-3">
                            <MiniBar pct={c.engagement_score} color="#a855f7" width={44} />
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap text-xs" style={{ color: "#64748b" }}>
                            {c.last_seen ? new Date(c.last_seen).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : '—'}
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
      )}

      {/* ════════════════════ BRAND INTEL ════════════════════ */}
      {tab === 'brand' && (
        <div className="space-y-5">
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Total Visitors',     value: (brand?.summary?.totalVisitors || 0).toLocaleString(),  icon: Users,       color: 'blue'   },
              { label: 'Identified (Phone)', value: (brand?.summary?.withPhone || 0).toLocaleString(),       icon: Target,      color: 'green'  },
              { label: 'Cart Abandoners',    value: (brand?.summary?.cartAbandon || 0).toLocaleString(),     icon: ShoppingBag, color: 'orange' },
              { label: 'Avg Order Value',    value: brand?.summary?.avgOrderValue ? `₹${brand.summary.avgOrderValue.toLocaleString()}` : '—', icon: DollarSign, color: 'purple' },
            ].map(s => (
              <StatCard key={s.label} label={s.label} value={loading ? '…' : s.value} icon={s.icon} color={s.color} />
            ))}
          </div>

          {/* Revenue Intelligence */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { label: 'Recovered Revenue',       value: `₹${(brand?.summary?.totalRevenue || 0).toLocaleString()}`,    sub: `from ${brand?.summary?.purchased || 0} purchases`,               color: "#4ade80",  border: "rgba(34,197,94,0.2)"   },
              { label: 'Potential Revenue (Carts)',value: `₹${(brand?.summary?.potentialRevenue || 0).toLocaleString()}`, sub: `${brand?.summary?.cartAbandon || 0} carts × avg order value`, color: "#fb923c",  border: "rgba(249,115,22,0.2)"  },
              { label: 'Return Visitor Rate',      value: `${brand?.summary?.returnRate || 0}%`,                          sub: `${brand?.summary?.returningVisitors || 0} returning / ${brand?.summary?.newVisitors || 0} new`, color: "#60a5fa", border: "rgba(59,130,246,0.2)" },
            ].map(r => (
              <div key={r.label} className="card p-4" style={{ borderColor: r.border }}>
                <p className="text-xs mb-1" style={{ color: "#64748b" }}>{r.label}</p>
                <p className="text-2xl font-bold" style={{ color: r.color }}>{loading ? '…' : r.value}</p>
                <p className="text-xs mt-1" style={{ color: "#334155" }}>{r.sub}</p>
              </div>
            ))}
          </div>

          {/* Heatmap + Best Days */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Clock size={14} style={{ color: "#60a5fa" }} /> Peak Activity Heatmap
                </h3>
                <span className="text-xs" style={{ color: "#475569" }}>Hour × Day</span>
              </div>
              {loading ? <div className="skeleton h-48 rounded-xl" /> : (
                <div className="overflow-x-auto">
                  <div className="min-w-[500px]">
                    <div className="grid grid-cols-8 gap-0.5 mb-1">
                      <div />
                      {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                        <div key={d} className="text-center text-[10px] font-medium" style={{ color: "#64748b" }}>{d}</div>
                      ))}
                    </div>
                    {(brand?.heatmapRows || []).filter((_, i) => i % 2 === 0).map(row => {
                      const maxCount = Math.max(...(brand?.heatmapRows || []).map(r => r.total), 1);
                      return (
                        <div key={row.hourNum} className="grid grid-cols-8 gap-0.5 mb-0.5">
                          <div className="text-[9px] text-right pr-1.5 flex items-center justify-end" style={{ color: "#475569" }}>{row.hour}</div>
                          {row.days.map(({ day, count }) => {
                            const intensity = maxCount > 0 ? count / maxCount : 0;
                            const bg = intensity === 0 ? 'rgba(255,255,255,0.02)'
                              : intensity < 0.25 ? 'rgba(59,130,246,0.2)'
                              : intensity < 0.5  ? 'rgba(59,130,246,0.4)'
                              : intensity < 0.75 ? 'rgba(249,115,22,0.6)'
                              :                    'rgba(239,68,68,0.8)';
                            return (
                              <div key={day} title={`${day} ${row.hour}: ${count} events`}
                                className="h-5 rounded-sm transition-all cursor-default"
                                style={{ background: bg }} />
                            );
                          })}
                        </div>
                      );
                    })}
                    <div className="flex items-center gap-2 mt-3 justify-end">
                      {[['rgba(255,255,255,0.02)','None'],['rgba(59,130,246,0.2)','Low'],['rgba(59,130,246,0.4)','Med'],['rgba(249,115,22,0.6)','High'],['rgba(239,68,68,0.8)','Peak']].map(([bg, lbl]) => (
                        <div key={lbl} className="flex items-center gap-1">
                          <div className="w-3 h-3 rounded-sm" style={{ background: bg }} />
                          <span className="text-[9px]" style={{ color: "#475569" }}>{lbl}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <Calendar size={14} style={{ color: "#c084fc" }} /> Best Days
              </h3>
              {loading ? <div className="skeleton h-48 rounded-xl" /> : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={brand?.dayOfWeekData || []} barSize={20}>
                    <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<Tip />} />
                    <Bar dataKey="visitors" name="Visitors" fill="#3b82f6" radius={[3,3,0,0]} />
                    <Bar dataKey="carts"    name="Carts"    fill="#f97316" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Funnel */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-white mb-5 flex items-center gap-2">
              <TrendingUp size={14} style={{ color: "#4ade80" }} /> Conversion Funnel
            </h3>
            {loading ? <div className="skeleton h-24 rounded-xl" /> : (
              <div className="flex items-end gap-1 overflow-x-auto pb-2">
                {(brand?.funnel || []).map((s, i) => {
                  const maxCount = brand.funnel[0]?.count || 1;
                  const heightPct = Math.max((s.count / maxCount) * 100, 4);
                  return (
                    <div key={s.stage} className="flex-1 min-w-[80px] flex flex-col items-center gap-2">
                      <span className="text-xs font-bold text-white">{s.count.toLocaleString()}</span>
                      <div className="w-full rounded-t-lg" style={{ height: `${heightPct * 1.2}px`, background: s.color, opacity: 0.85, minHeight: 8 }} />
                      <div className="text-center">
                        <p className="text-[11px] font-medium" style={{ color: "#cbd5e1" }}>{s.stage}</p>
                        <p className="text-[10px]" style={{ color: "#64748b" }}>{s.conv_pct}% of visitors</p>
                        {i > 0 && s.drop_pct > 0 && <p className="text-[9px] mt-0.5" style={{ color: "#f87171" }}>↓ {s.drop_pct}% drop</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Audience Segments */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Users size={14} style={{ color: "#60a5fa" }} /> Meta-Ready Audience Segments
            </h3>
            {loading ? <div className="skeleton h-48 rounded-xl" /> : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(brand?.segments || []).map(seg => (
                  <div key={seg.name} className="p-4 rounded-xl space-y-2"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: seg.color }} />
                        <p className="text-sm font-semibold text-white">{seg.name}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] px-2 py-0.5 rounded-full border font-medium"
                          style={seg.heat === 'Hot' ? { color: "#f87171", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" } :
                            seg.heat === 'Warm' ? { color: "#fb923c", background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.2)" } :
                            { color: "#94a3b8", background: "rgba(100,116,139,0.1)", border: "1px solid rgba(100,116,139,0.2)" }}>
                          {seg.heat}
                        </span>
                        <span className="text-lg font-bold text-white">{seg.size.toLocaleString()}</span>
                      </div>
                    </div>
                    <p className="text-xs" style={{ color: "#94a3b8" }}>{seg.description}</p>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="text-[10px]">
                        <p style={{ color: "#475569" }}>Meta Objective</p>
                        <p className="font-medium mt-0.5" style={{ color: "#60a5fa" }}>{seg.meta_objective}</p>
                      </div>
                      <div className="text-[10px]">
                        <p style={{ color: "#475569" }}>Est. ROAS</p>
                        <p className="font-medium mt-0.5" style={{ color: "#4ade80" }}>{seg.roas_potential}</p>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-white/5">
                      <p className="text-[10px]" style={{ color: "#475569" }}>Audience</p>
                      <p className="text-[10px] mt-0.5" style={{ color: "#cbd5e1" }}>{seg.meta_audience}</p>
                    </div>
                    <div className="p-2 rounded-lg" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.1)" }}>
                      <p className="text-[10px]" style={{ color: "#fcd34d" }}>💡 {seg.ad_copy_hint}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Hot Products */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Flame size={14} style={{ color: "#fb923c" }} /> Hot Products — Best for Ad Creatives
            </h3>
            {loading ? <div className="skeleton h-40 rounded-xl" /> : (brand?.topProducts || []).length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: "#475569" }}>
                No product view data yet. Implement <code className="text-blue-400">WhatsWay.trackProductView()</code> on your product pages.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      {['#','Product','Views','Unique','Carts','Cart Rate','Hot Score','Revenue'].map(h => (
                        <th key={h} className="text-left py-2 px-3 font-medium" style={{ color: "#64748b" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(brand?.topProducts || []).map((p, i) => (
                      <tr key={i} className="transition-colors" style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
                        onMouseLeave={e => e.currentTarget.style.background = ""}>
                        <td className="py-2.5 px-3 font-mono" style={{ color: "#64748b" }}>{i + 1}</td>
                        <td className="py-2.5 px-3">
                          <p className="text-white font-medium truncate max-w-[200px]" title={p.name}>{p.name}</p>
                          {p.price && <p className="text-[10px] mt-0.5" style={{ color: "#475569" }}>{p.price}</p>}
                        </td>
                        <td className="py-2.5 px-3 font-mono" style={{ color: "#cbd5e1" }}>{p.views}</td>
                        <td className="py-2.5 px-3 font-mono" style={{ color: "#94a3b8" }}>{p.sessions}</td>
                        <td className="py-2.5 px-3 font-mono" style={{ color: "#fb923c" }}>{p.carts}</td>
                        <td className="py-2.5 px-3"><MiniBar pct={Math.min(p.cart_rate, 100)} color="#f97316" /></td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                            style={p.hot_score >= 20
                              ? { background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }
                              : p.hot_score >= 10
                              ? { background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.2)", color: "#fb923c" }
                              : { background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", color: "#60a5fa" }}>
                            {p.hot_score >= 20 ? '🔥' : ''}{p.hot_score}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono" style={{ color: "#4ade80" }}>₹{p.revenue.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Meta Ad Recommendations */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Megaphone size={14} style={{ color: "#f472b6" }} /> Meta Ads Recommendations
            </h3>
            {loading ? <div className="skeleton h-48 rounded-xl" /> : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(brand?.adRecommendations || []).map((r, i) => {
                  const IconMap = { clock: Clock, calendar: Calendar, target: Target, map: Map, users: Users, image: Image, mobile: Smartphone, repeat: Repeat };
                  const Ico = IconMap[r.icon] || Zap;
                  const isHigh = r.priority === 'HIGH', isMed = r.priority === 'MEDIUM';
                  return (
                    <div key={i} className="p-4 rounded-xl space-y-2"
                      style={isHigh ? { background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)" }
                        : isMed  ? { background: "rgba(249,115,22,0.05)", border: "1px solid rgba(249,115,22,0.2)" }
                        :          { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Ico size={13} style={{ color: isHigh ? "#f87171" : isMed ? "#fb923c" : "#94a3b8" }} />
                          <p className="text-xs font-semibold text-white">{r.title}</p>
                        </div>
                        <span className="text-[9px] px-2 py-0.5 rounded-full border font-bold"
                          style={isHigh ? { color: "#f87171", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }
                            : isMed ? { color: "#fb923c", background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.3)" }
                            : { color: "#94a3b8", background: "rgba(100,116,139,0.1)", border: "1px solid rgba(100,116,139,0.3)" }}>
                          {r.priority}
                        </span>
                      </div>
                      <p className="text-xs italic" style={{ color: "#94a3b8" }}>"{r.insight}"</p>
                      <div className="p-2.5 rounded-lg" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                        <p className="text-xs" style={{ color: "#e2e8f0" }}>→ {r.action}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Peak Hours */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Clock size={14} style={{ color: "#60a5fa" }} /> Top 5 Peak Hours for Ad Scheduling
            </h3>
            {loading ? <div className="skeleton h-24 rounded-xl" /> : (
              <div className="space-y-2">
                {(brand?.peakHours || []).map((h, i) => {
                  const rankStyles = [
                    { bg: "rgba(239,68,68,0.15)",   border: "rgba(239,68,68,0.3)",   color: "#f87171"  },
                    { bg: "rgba(249,115,22,0.15)",  border: "rgba(249,115,22,0.3)",  color: "#fb923c"  },
                    { bg: "rgba(245,158,11,0.15)",  border: "rgba(245,158,11,0.3)",  color: "#fbbf24"  },
                    { bg: "rgba(59,130,246,0.15)",  border: "rgba(59,130,246,0.3)",  color: "#60a5fa"  },
                    { bg: "rgba(59,130,246,0.1)",   border: "rgba(59,130,246,0.2)",  color: "#60a5fa"  },
                  ];
                  const rs = rankStyles[i] || rankStyles[4];
                  return (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl"
                      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold"
                        style={{ background: rs.bg, border: `1px solid ${rs.border}`, color: rs.color }}>
                        {h.label}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-medium text-white">{h.recommendation}</p>
                          <span className="text-xs font-mono" style={{ color: "#64748b" }}>{h.count} events</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                          <div className="h-full rounded-full" style={{ background: rs.color, opacity: 0.7,
                            width: `${brand?.peakHours?.[0]?.count > 0 ? (h.count / brand.peakHours[0].count) * 100 : 0}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
                {(brand?.peakHours || []).length === 0 && (
                  <p className="text-sm text-center py-8" style={{ color: "#475569" }}>
                    No activity data yet. Install tracker.js to start collecting data.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
