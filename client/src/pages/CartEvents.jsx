import React, { useEffect, useState } from "react";
import { RefreshCw, ShoppingCart, CheckCircle, TrendingDown, Package } from "lucide-react";
import { cartApi } from "../api";

function timeAgo(ts) {
  const d = Date.now() - new Date(ts).getTime();
  if (d < 60000) return "just now";
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

const FLAG = { IN: "🇮🇳", US: "🇺🇸", GB: "🇬🇧", AE: "🇦🇪", AU: "🇦🇺" };
const LANG = { hi: "Hindi", en: "English", gu: "Gujarati", mr: "Marathi", bn: "Bengali", ta: "Tamil", te: "Telugu" };

const STATUS_TABS = [
  { id: "active",    label: "Abandoned",  emoji: "🛒", color: "#f97316" },
  { id: "purchased", label: "Purchased",  emoji: "✅", color: "#22c55e" },
  { id: "all",       label: "All Events", emoji: "📋", color: "#64748b" },
];

export default function CartEvents() {
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    try {
      const res = await cartApi.list({ status, limit: 50, page });
      setEvents(res.events || []);
      setTotal(res.total || 0);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [status, page]);

  return (
    <div className="space-y-5 max-w-6xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Cart Events</h2>
          <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>Track abandoned carts and recovery status</p>
        </div>
        <button onClick={load} className="btn-secondary gap-1.5">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex gap-2">
        {STATUS_TABS.map(tab => (
          <button key={tab.id} onClick={() => { setStatus(tab.id); setPage(1); }}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
            style={status === tab.id
              ? { background: `${tab.color}18`, border: `1px solid ${tab.color}50`, color: "#fff" }
              : { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", color: "#64748b" }}>
            {tab.emoji} {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card">
        <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <span className="text-sm font-medium text-white">{total.toLocaleString()} events</span>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Products</th>
                <th>Total</th>
                <th>Location</th>
                <th>Language</th>
                <th>Status</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="text-center py-10">
                  <RefreshCw size={18} className="animate-spin mx-auto mb-2" style={{ color: "#475569" }} />
                  <p className="text-sm" style={{ color: "#475569" }}>Loading events…</p>
                </td></tr>
              )}
              {!loading && events.length === 0 && (
                <tr><td colSpan={7} className="text-center py-14">
                  <ShoppingCart size={32} className="mx-auto mb-3" style={{ color: "#1e293b" }} />
                  <p className="text-sm font-medium text-white mb-1">No cart events yet</p>
                  <p className="text-xs" style={{ color: "#475569" }}>Cart events appear when visitors add items and abandon</p>
                </td></tr>
              )}
              {events.map(e => {
                const products = JSON.parse(e.products || "[]");
                const first = products[0] || {};
                return (
                  <tr key={e.id} className="table-row">
                    <td>
                      <p className="text-white font-medium text-sm">{e.name || <span style={{ color: "#475569" }}>Anonymous</span>}</p>
                      <p className="text-xs mt-0.5" style={{ color: e.phone ? "#4ade80" : "#334155" }}>
                        {e.phone || "No phone"}
                      </p>
                    </td>
                    <td>
                      <p className="text-sm" style={{ color: "#cbd5e1" }}>{first.name || "—"}</p>
                      {products.length > 1 && (
                        <p className="text-xs mt-0.5" style={{ color: "#475569" }}>+{products.length - 1} more</p>
                      )}
                    </td>
                    <td>
                      <span className="text-sm font-semibold" style={{ color: "#25D366" }}>
                        ₹{e.total_amount || "—"}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <span>{FLAG[e.country] || "🌐"}</span>
                        <span className="text-sm" style={{ color: "#cbd5e1" }}>{e.city || "—"}</span>
                      </div>
                    </td>
                    <td>
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#94a3b8" }}>
                        {LANG[e.language] || e.language || "—"}
                      </span>
                    </td>
                    <td>
                      {e.recovered ? (
                        <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", color: "#4ade80" }}>
                          <CheckCircle size={10} /> Recovered
                        </span>
                      ) : e.status === "purchased" ? (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.25)", color: "#60a5fa" }}>
                          Purchased
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.25)", color: "#fb923c" }}>
                          <TrendingDown size={10} /> Abandoned
                        </span>
                      )}
                    </td>
                    <td>
                      <p className="text-xs" style={{ color: "#64748b" }}>{timeAgo(e.created_at)}</p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {total > 50 && (
          <div className="px-5 py-4 flex justify-between items-center" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
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
