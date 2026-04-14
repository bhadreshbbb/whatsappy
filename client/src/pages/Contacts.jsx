import React, { useEffect, useState } from "react";
import { Search, Phone, RefreshCw, BookUser, MapPin } from "lucide-react";
import { contactsApi } from "../api";

function timeAgo(ts) {
  const d = Date.now() - new Date(ts).getTime();
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

const LANG = { hi: "Hindi", en: "English", gu: "Gujarati", mr: "Marathi", bn: "Bengali", ta: "Tamil", te: "Telugu", ur: "Urdu", ar: "Arabic" };
const FLAG = { IN: "🇮🇳", US: "🇺🇸", GB: "🇬🇧", AE: "🇦🇪" };

const STATUS_STYLE = {
  purchased:      { bg: "rgba(34,197,94,0.1)",   border: "rgba(34,197,94,0.25)",   color: "#4ade80" },
  abandoned_cart: { bg: "rgba(249,115,22,0.1)",  border: "rgba(249,115,22,0.25)",  color: "#fb923c" },
  default:        { bg: "rgba(59,130,246,0.1)",  border: "rgba(59,130,246,0.25)",  color: "#60a5fa" },
};

export default function Contacts() {
  const [contacts, setContacts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterLang, setFilterLang] = useState("");
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    try {
      const res = await contactsApi.list({ page, limit: 50, search, language: filterLang });
      setContacts(res.contacts || []);
      setTotal(res.total || 0);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [page, search, filterLang]);

  return (
    <div className="space-y-5 max-w-5xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Contacts</h2>
          <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>{total.toLocaleString()} contacts with phone numbers captured</p>
        </div>
        <button onClick={load} className="btn-secondary gap-1.5">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {/* Search & filter */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#475569" }} />
          <input className="input pl-8" placeholder="Search name or phone…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className="input w-44" value={filterLang} onChange={e => { setFilterLang(e.target.value); setPage(1); }}>
          <option value="">All Languages</option>
          {Object.entries(LANG).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Contact</th>
                <th>Phone</th>
                <th>Location</th>
                <th>Language</th>
                <th>Last Active</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="text-center py-10">
                  <RefreshCw size={18} className="animate-spin mx-auto mb-2" style={{ color: "#475569" }} />
                  <p className="text-sm" style={{ color: "#475569" }}>Loading contacts…</p>
                </td></tr>
              )}
              {!loading && contacts.length === 0 && (
                <tr><td colSpan={6} className="text-center py-14">
                  <BookUser size={32} className="mx-auto mb-3" style={{ color: "#1e293b" }} />
                  <p className="text-sm font-medium text-white mb-1">No contacts yet</p>
                  <p className="text-xs" style={{ color: "#475569" }}>Contacts are captured when visitors provide their phone number</p>
                </td></tr>
              )}
              {contacts.map(c => {
                const ss = STATUS_STYLE[c.status] || STATUS_STYLE.default;
                return (
                  <tr key={c.id} className="table-row">
                    <td>
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                        style={{ background: ss.bg, border: `1px solid ${ss.border}`, color: ss.color }}>
                        {(c.status || "active").replace("_", " ")}
                      </span>
                    </td>
                    <td>
                      <p className="text-white font-medium text-sm">{c.name || "—"}</p>
                      {c.email && <p className="text-xs mt-0.5" style={{ color: "#475569" }}>{c.email}</p>}
                    </td>
                    <td>
                      <span className="text-sm font-medium font-mono" style={{ color: "#4ade80" }}>{c.phone}</span>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <span>{FLAG[c.country_code] || "🌐"}</span>
                        <div>
                          <p className="text-sm" style={{ color: "#cbd5e1" }}>{c.city || "—"}</p>
                          <p className="text-xs" style={{ color: "#475569" }}>{c.country || "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#94a3b8" }}>
                        {LANG[c.language] || c.language || "—"}
                      </span>
                    </td>
                    <td>
                      <span className="text-xs" style={{ color: "#64748b" }}>{timeAgo(c.last_active_at)}</span>
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
