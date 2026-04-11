import React, { useEffect, useState } from "react";
import { RefreshCw, ShoppingCart, CheckCircle, Package } from "lucide-react";
import { cartApi } from "../api";

function timeAgo(ts) {
  const d = Date.now() - new Date(ts).getTime();
  if (d < 60000) return "just now";
  if (d < 3600000) return `${Math.floor(d/60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d/3600000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

const FLAG = {IN:"🇮🇳",US:"🇺🇸",GB:"🇬🇧",AE:"🇦🇪",AU:"🇦🇺"};
const LANG = {hi:"Hindi",en:"English",gu:"Gujarati",mr:"Marathi",bn:"Bengali",ta:"Tamil",te:"Telugu"};

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
      setEvents(res.events||[]); setTotal(res.total||0);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [status, page]);

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Cart Events</h2>
          <p className="text-xs text-slate-500 mt-0.5">Track abandoned carts and recovery status</p>
        </div>
        <button onClick={load} className="btn-secondary"><RefreshCw size={14} /> Refresh</button>
      </div>

      <div className="flex gap-2">
        {["active","purchased","all"].map(s=>(
          <button key={s} onClick={()=>{setStatus(s);setPage(1);}}
            className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all capitalize ${status===s?"bg-wapp/10 border-wapp/40 text-white":"bg-white/[0.02] border-white/5 text-slate-400 hover:border-white/20"}`}>
            {s==="active"?"🛒 Abandoned":s==="purchased"?"✅ Purchased":"All"}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="px-5 py-4 border-b border-white/5">
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
              {loading && <tr><td colSpan={7} className="text-center py-8 text-slate-500">Loading…</td></tr>}
              {!loading && events.length===0 && <tr><td colSpan={7} className="text-center py-12 text-slate-500">No cart events yet</td></tr>}
              {events.map(e=>{
                const products = JSON.parse(e.products||"[]");
                const first = products[0]||{};
                return (
                  <tr key={e.id} className="table-row">
                    <td>
                      <p className="text-white font-medium text-sm">{e.name||<span className="text-slate-500">Anonymous</span>}</p>
                      <p className="text-xs text-green-400">{e.phone||<span className="text-slate-600">No phone</span>}</p>
                    </td>
                    <td>
                      <p className="text-slate-300 text-sm">{first.name||"—"}</p>
                      {products.length>1 && <p className="text-xs text-slate-500">+{products.length-1} more</p>}
                    </td>
                    <td>
                      <span className="text-wapp font-semibold text-sm">₹{e.total_amount||"—"}</span>
                    </td>
                    <td>
                      <span>{FLAG[e.country]||"🌐"}</span>
                      <span className="text-slate-300 text-sm ml-1.5">{e.city||"—"}</span>
                    </td>
                    <td>
                      <span className="badge bg-white/5 text-slate-300 border border-white/10 text-xs">
                        {LANG[e.language]||e.language||"—"}
                      </span>
                    </td>
                    <td>
                      {e.recovered ? (
                        <span className="badge bg-green-500/10 text-green-400 border border-green-500/20">✓ Recovered</span>
                      ) : e.status==="purchased" ? (
                        <span className="badge bg-blue-500/10 text-blue-400 border border-blue-500/20">Purchased</span>
                      ) : (
                        <span className="badge bg-orange-500/10 text-orange-400 border border-orange-500/20">Abandoned</span>
                      )}
                    </td>
                    <td><p className="text-xs text-slate-400">{timeAgo(e.created_at)}</p></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {total>50 && (
          <div className="px-5 py-4 border-t border-white/5 flex justify-between items-center">
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
