import React, { useEffect, useState, useCallback } from "react";
import { RefreshCw, Search, Filter, Smartphone, Monitor, Tablet, MapPin, Globe, Phone, Zap } from "lucide-react";
import { visitorsApi } from "../api";

const FLAG_MAP = { IN: "🇮🇳", US: "🇺🇸", GB: "🇬🇧", AE: "🇦🇪", AU: "🇦🇺", CA: "🇨🇦", DE: "🇩🇪", SG: "🇸🇬", PK: "🇵🇰" };
const LANG_NAMES = { hi: "Hindi", en: "English", gu: "Gujarati", mr: "Marathi", bn: "Bengali", ta: "Tamil", te: "Telugu", ur: "Urdu", ar: "Arabic" };

function DeviceIcon({ type }) {
  if (type === "mobile") return <Smartphone size={13} className="text-blue-400" />;
  if (type === "tablet") return <Tablet size={13} className="text-purple-400" />;
  return <Monitor size={13} className="text-slate-400" />;
}

function StatusDot({ status }) {
  if (status === "hot_user") {
    return (
      <span className="flex items-center gap-1 bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tighter shadow-[0_0_10px_rgba(249,115,22,0.2)]">
        <Zap size={10} fill="currentColor" /> Hot User
      </span>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-block w-2 h-2 rounded-full ${status === "active" ? "bg-green-500 live-dot" : "bg-slate-600"}`} />
      <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">{status}</span>
    </div>
  );
}

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

export default function Visitors() {
  const [visitors, setVisitors] = useState([]);
  const [stats, setStats] = useState({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const [search, setSearch] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [filterDevice, setFilterDevice] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterHasPhone, setFilterHasPhone] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = { page, limit: 50, search, city: filterCity, device: filterDevice, status: filterStatus };
      if (filterHasPhone) params.hasPhone = "true";
      const [res, s] = await Promise.all([visitorsApi.list(params), visitorsApi.stats()]);
      setVisitors(res.data || []);
      setTotal(res.pagination?.total || 0);
      setStats(s);
    } catch (e) {}
    finally { setLoading(false); }
  }, [page, search, filterCity, filterDevice, filterStatus, filterHasPhone]);

  useEffect(() => {
    load();
    if (!autoRefresh) return;
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load, autoRefresh]);

  return (
    <div className="space-y-5 max-w-7xl">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Visitors", value: stats.total || 0, color: "blue" },
          { label: "Active Now", value: stats.active || 0, color: "green" },
          { label: "With Phone", value: stats.withPhone || 0, color: "orange" },
          { label: "Abandoned Carts", value: stats.cartEvents || 0, color: "red" },
        ].map(({ label, value, color }) => (
          <div key={label} className="card p-4">
            <p className="text-xl font-bold text-white">{value.toLocaleString()}</p>
            <p className="text-xs text-slate-400 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input pl-8"
              placeholder="Search name, phone, city…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>

          <select className="input w-auto" value={filterDevice} onChange={e => { setFilterDevice(e.target.value); setPage(1); }}>
            <option value="">All Devices</option>
            <option value="mobile">Mobile</option>
            <option value="desktop">Desktop</option>
            <option value="tablet">Tablet</option>
          </select>

          <select className="input w-auto" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}>
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <label className="toggle-switch">
              <input type="checkbox" checked={filterHasPhone} onChange={e => setFilterHasPhone(e.target.checked)} />
              <span className="toggle-slider" />
            </label>
            <span className="text-xs text-slate-400">Phone only</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <label className="toggle-switch">
              <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
              <span className="toggle-slider" />
            </label>
            <span className="text-xs text-slate-400">Live</span>
          </label>

          <button onClick={load} className="btn-secondary gap-1.5">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      <div className="card">
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">
            Visitors <span className="text-slate-500 font-normal ml-1">({total.toLocaleString()} total)</span>
          </h2>
          {autoRefresh && (
            <span className="flex items-center gap-1.5 text-xs text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 live-dot" />
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
                <th>Page</th>
                <th>Seen</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="text-center py-8 text-slate-500 text-sm">Loading…</td></tr>
              )}
              {!loading && visitors.length === 0 && (
                <tr><td colSpan={7} className="text-center py-12 text-slate-500 text-sm">
                  No visitors found. Make sure the tracker script is installed on your website.
                </td></tr>
              )}
              {visitors.map(v => (
                <tr key={v.id} className="table-row">
                  <td>
                    <div className="flex items-center gap-2">
                      <StatusDot status={v.status} />
                    </div>
                  </td>
                  <td>
                    <div>
                      <p className="text-white text-sm font-medium">{v.name || <span className="text-slate-500">Anonymous</span>}</p>
                      {v.phone && (
                        <span className="text-xs text-green-400 flex items-center gap-1">
                          <Phone size={10} />{v.phone}
                        </span>
                      )}
                      {!v.phone && <span className="text-xs text-slate-600">No phone</span>}
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <span>{FLAG_MAP[v.country_code] || "🌐"}</span>
                      <div>
                        <p className="text-slate-300 text-sm">{v.city || "—"}</p>
                        <p className="text-slate-500 text-xs">{v.state || v.country || "—"}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <DeviceIcon type={v.device_type} />
                      <div>
                        <p className="text-xs text-slate-300">{v.browser || "—"}</p>
                        <p className="text-xs text-slate-500">{v.os || "—"}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="badge bg-white/5 text-slate-300 border border-white/10 text-xs">
                      {LANG_NAMES[v.language] || v.language || "—"}
                    </span>
                  </td>
                  <td>
                    <p className="text-xs text-slate-400 max-w-[160px] truncate" title={v.page_url}>
                      {v.page_url ? v.page_url.replace(/^https?:\/\/[^/]+/, "") || "/" : "—"}
                    </p>
                    <p className="text-xs text-slate-600">Views: {v.page_views}</p>
                  </td>
                  <td>
                    <p className="text-xs text-slate-400">{timeAgo(v.visited_at)}</p>
                    <p className="text-xs text-slate-600">{new Date(v.created_at).toLocaleDateString()}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {total > 50 && (
          <div className="px-5 py-4 border-t border-white/5 flex items-center justify-between">
            <span className="text-xs text-slate-500">Page {page} of {Math.ceil(total / 50)}</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-40">Prev</button>
              <button disabled={page * 50 >= total} onClick={() => setPage(p => p + 1)} className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
