import React, { useEffect, useState } from "react";
import { Search, Phone, RefreshCw } from "lucide-react";
import { contactsApi } from "../api";

function timeAgo(ts) {
  const d = Date.now() - new Date(ts).getTime();
  if (d < 86400000) return `${Math.floor(d/3600000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

const LANG = {hi:"Hindi",en:"English",gu:"Gujarati",mr:"Marathi",bn:"Bengali",ta:"Tamil",te:"Telugu",ur:"Urdu",ar:"Arabic"};
const FLAG = {IN:"🇮🇳",US:"🇺🇸",GB:"🇬🇧",AE:"🇦🇪"};

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
      const res = await contactsApi.list({ page, limit:50, search, language:filterLang });
      setContacts(res.contacts||[]); setTotal(res.total||0);
    } finally { setLoading(false); }
  };

  useEffect(()=>{ load(); }, [page, search, filterLang]);

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Contacts</h2>
          <p className="text-xs text-slate-500 mt-0.5">{total.toLocaleString()} contacts with phone numbers captured</p>
        </div>
        <button onClick={load} className="btn-secondary"><RefreshCw size={14}/> Refresh</button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/>
          <input className="input pl-8" placeholder="Search name or phone…" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/>
        </div>
        <select className="input w-auto" value={filterLang} onChange={e=>{setFilterLang(e.target.value);setPage(1);}}>
          <option value="">All Languages</option>
          {Object.entries(LANG).map(([k,v])=><option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Status</th><th>Contact</th><th>Phone</th><th>Location</th><th>Language</th><th>Last Active</th></tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="text-center py-8 text-slate-500">Loading…</td></tr>}
              {!loading && contacts.length===0 && (
                <tr><td colSpan={6} className="text-center py-12">
                  <Phone size={24} className="text-slate-600 mx-auto mb-2"/>
                  <p className="text-slate-500 text-sm">No contacts yet. Contacts are captured automatically when visitors provide their phone number.</p>
                </td></tr>
              )}
              {contacts.map(c=>(
                <tr key={c.id} className="table-row">
                  <td>
                    <span className={`badge text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${
                      c.status === 'purchased' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 
                      c.status === 'abandoned_cart' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' : 
                      'bg-blue-500/10 text-blue-400 border-blue-500/20'
                    }`}>
                      {c.status?.replace('_',' ') || 'Active'}
                    </span>
                  </td>
                  <td>
                    <p className="text-white font-medium text-sm">{c.name||"—"}</p>
                    <p className="text-xs text-slate-500">{c.email||""}</p>
                  </td>
                  <td><span className="text-green-400 font-medium text-sm font-mono">{c.phone}</span></td>
                  <td>
                    <span>{FLAG[c.country_code]||"🌐"}</span>
                    <span className="text-slate-300 text-sm ml-1.5">{c.city||"—"}, {c.country||"—"}</span>
                  </td>
                  <td>
                    <span className="badge bg-white/5 text-slate-300 border border-white/10 text-xs">{LANG[c.language]||c.language||"—"}</span>
                  </td>
                  <td><span className="text-xs text-slate-400">{timeAgo(c.last_active_at)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {total>50 && (
          <div className="px-5 py-4 border-t border-white/5 flex justify-between">
            <span className="text-xs text-slate-500">Page {page} of {Math.ceil(total/50)}</span>
            <div className="flex gap-2">
              <button disabled={page===1} onClick={()=>setPage(p=>p-1)} className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-40">Prev</button>
              <button disabled={page*50>=total} onClick={()=>setPage(p=>p+1)} className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
