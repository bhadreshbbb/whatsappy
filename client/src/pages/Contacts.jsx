import React, { useEffect, useState, useCallback } from "react";
import { RefreshCw, Search, Smartphone, Monitor, Tablet, Phone, Zap, Users, Activity, ShoppingCart, Wifi } from "lucide-react";
import { visitorsApi } from "../api";

const FLAG_MAP = { IN: "🇮🇳", US: "🇺🇸", GB: "🇬🇧", AE: "🇦🇪", AU: "🇦🇺", CA: "🇨🇦", DE: "🇩🇪", SG: "🇸🇬", PK: "🇵🇰" };
const LANG_NAMES = { hi: "Hindi", en: "English", gu: "Gujarati", mr: "Marathi", bn: "Bengali", ta: "Tamil", te: "Telugu", ur: "Urdu", ar: "Arabic" };

const STAT_CARDS = [
  { key: "total",      label: "Total Visitors",   icon: Users,         color: "#3b82f6", glow: "rgba(59,130,246,0.15)" },
  { key: "active",     label: "Active Now",        icon: Activity,      color: "#22c55e", glow: "rgba(34,197,94,0.15)"  },
  { key: "withPhone",  label: "With Phone",        icon: Phone,         color: "#f97316", glow: "rgba(249,115,22,0.15)" },
  { key: "cartEvents", label: "Abandoned Carts",   icon: ShoppingCart,  color: "#ef4444", glow: "rgba(239,68,68,0.15)"  },
];

function DeviceIcon({ type }) {
  if (type === "mobile")  return <Smartphone size={13} style={{ color: "#60a5fa" }} />;
  if (type === "tablet")  return <Tablet     size={13} style={{ color: "#c084fc" }} />;
  return <Monitor size={13} style={{ color: "#94a3b8" }} />;
}

function StatusBadge({ status }) {
  if (status === "hot_user") return (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tight"
      style={{ background: "rgba(249,115,22,0.15)", border: "1px solid rgba(249,115,22,0.3)", color: "#fb923c", boxShadow: "0 0 10px rgba(249,115,22,0.2)" }}>
      <Zap size={9} fill="currentColor" /> Hot
    </span>
  );
  const isActive = status === "active";
  return (
    <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-tight"
      style={{ color: isActive ? "#4ade80" : "#64748b" }}>
      <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "live-dot" : ""}`}
        style={{ background: isActive ? "#22c55e" : "#334155" }} />
      {status}
    </span>
  );
}

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

export default function Contacts() {
  const [visitors, setVisitors] = useState([]);
  const [stats, setStats] = useState({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [search, setSearch] = useState("");
  const [filterDevice, setFilterDevice] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterHasPhone, setFilterHasPhone] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = { page, limit: 50, search, device: filterDevice, status: filterStatus };
      if (filterHasPhone) params.hasPhone = "true";
      const [res, s] = await Promise.all([visitorsApi.list(params), visitorsApi.stats()]);
      setVisitors(res.data || []);
      setTotal(res.pagination?.total || 0);
      setStats(s);
    } catch (e) {}
    finally { setLoading(false); }
  }, [page, search, filterDevice, filterStatus, filterHasPhone]);

  useEffect(() => {
    load();
    if (!autoRefresh) return;
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load, autoRefresh]);

  return (
    <div className="space-y-5 max-w-7xl">

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {STAT_CARDS.map(({ key, label, icon: Icon, color, glow }) => (
          <div key={key} className="card p-5 relative overflow-hidden group"
            style={{ transition: "transform 0.2s, box-shadow 0.2s" }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 8px 32px ${glow}`; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = ""; }}>
            <div className="absolute inset-x-0 bottom-0 h-0.5 rounded-b" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
            <div className="absolute top-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: `${glow}`, border: `1px solid ${color}22` }}>
              <Icon size={15} style={{ color }} />
            </div>
            <p className="text-2xl font-bold text-white tabular-nums">{(stats[key] || 0).toLocaleString()}</p>
            <p className="text-xs mt-1" style={{ color: "#64748b" }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#475569" }} />
            <input className="input pl-8" placeholder="Search name, phone, city…" value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <select className="input w-36" value={filterDevice} onChange={e => { setFilterDevice(e.target.value); setPage(1); }}>
            <option value="">All Devices</option>
            <option value="mobile">Mobile</option>
            <option value="desktop">Desktop</option>
            <option value="tablet">Tablet</option>
          </select>
          <select className="input w-36" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}>
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <label className="toggle-switch">
              <input type="checkbox" checked={filterHasPhone} onChange={e => setFilterHasPhone(e.target.checked)} />
              <span className="toggle-slider" />
            </label>
            <span className="text-xs" style={{ color: "#94a3b8" }}>Phone only</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <label className="toggle-switch">
              <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
              <span className="toggle-slider" />
            </label>
            <span className="text-xs" style={{ color: "#94a3b8" }}>Live</span>
          </label>
          <button onClick={load} className="btn-secondary gap-1.5">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <h2 className="text-sm font-semibold text-white">
            Contacts <span className="font-normal ml-1" style={{ color: "#475569" }}>({total.toLocaleString()} total)</span>
          </h2>
          {autoRefresh && (
            <span className="flex items-center gap-1.5 text-xs" style={{ color: "#4ade80" }}>
              <Wifi size={11} />
              <span className="w-1.5 h-1.5 rounded-full live-dot" style={{ background: "#22c55e" }} />
              Live updating
            </span>
          )}
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Visitor</th>
                <th>Location</th>
                <th>Device</th>
                <th>Language</th>
                <th>Current Page</th>
                <th>Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="text-center py-10" style={{ color: "#475569" }}>
                  <RefreshCw size={18} className="animate-spin mx-auto mb-2" />
                  <p className="text-sm">Loading contacts…</p>
                </td></tr>
              )}
              {!loading && visitors.length === 0 && (
                <tr><td colSpan={7} className="text-center py-14">
                  <Users size={32} className="mx-auto mb-3" style={{ color: "#1e293b" }} />
                  <p className="text-sm font-medium text-white mb-1">No contacts yet</p>
                  <p className="text-xs" style={{ color: "#475569" }}>Install the tracker script on your website to start tracking</p>
                </td></tr>
              )}
              {visitors.map(v => (
                <tr key={v.id} className="table-row">
                  <td><StatusBadge status={v.status} /></td>
                  <td>
                    <p className="text-white text-sm font-medium leading-tight">{v.name || <span style={{ color: "#475569" }}>Anonymous</span>}</p>
                    {v.phone
                      ? <span className="text-xs flex items-center gap-1 mt-0.5" style={{ color: "#4ade80" }}><Phone size={9} />{v.phone}</span>
                      : <span className="text-xs mt-0.5" style={{ color: "#334155" }}>No phone</span>}
                  </td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <span className="text-base">{FLAG_MAP[v.country_code] || "🌐"}</span>
                      <div>
                        <p className="text-sm" style={{ color: "#cbd5e1" }}>{v.city || "—"}</p>
                        <p className="text-xs" style={{ color: "#475569" }}>{v.state || v.country || "—"}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <DeviceIcon type={v.device_type} />
                      <div>
                        <p className="text-xs" style={{ color: "#cbd5e1" }}>{v.browser || "—"}</p>
                        <p className="text-xs" style={{ color: "#475569" }}>{v.os || "—"}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#94a3b8" }}>
                      {LANG_NAMES[v.language] || v.language || "—"}
                    </span>
                  </td>
                  <td>
                    <p className="text-xs max-w-[160px] truncate" style={{ color: "#64748b" }} title={v.page_url}>
                      {v.page_url ? v.page_url.replace(/^https?:\/\/[^/]+/, "") || "/" : "—"}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "#334155" }}>Views: {v.page_views}</p>
                  </td>
                  <td>
                    <p className="text-xs" style={{ color: "#64748b" }}>{timeAgo(v.visited_at)}</p>
                    <p className="text-xs mt-0.5" style={{ color: "#334155" }}>{new Date(v.created_at).toLocaleDateString()}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {total > 50 && (
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            <span className="text-xs" style={{ color: "#475569" }}>Page {page} of {Math.ceil(total / 50)}</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-30">Prev</button>
              <button disabled={page * 50 >= total} onClick={() => setPage(p => p + 1)} className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-30">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
