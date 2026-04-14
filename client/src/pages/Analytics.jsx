import React, { useEffect, useState, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, RadialBarChart, RadialBar, FunnelChart, Funnel, LabelList,
} from "recharts";
import {
  BarChart2, Globe, Users, Clock, TrendingUp, Smartphone, MousePointer,
  Flame, Eye, ArrowUpRight, Filter, RefreshCw, ChevronDown, ChevronUp,
  MapPin, Zap, Activity, Star, Search, Target, Calendar, Repeat,
  Image, Map, ShoppingBag, DollarSign, Megaphone, BrainCircuit,
} from "lucide-react";
import { analyticsApi } from "../api";

const COLORS = ["#22c55e","#3b82f6","#f97316","#a855f7","#ec4899","#14b8a6","#f59e0b","#64748b","#ef4444","#06b6d4"];

const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1a2035] border border-white/10 rounded-xl px-3 py-2 text-xs shadow-xl">
      {label && <p className="text-slate-400 mb-1 font-medium">{label}</p>}
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color || '#fff' }} className="font-semibold">
          {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
        </p>
      ))}
    </div>
  );
};

const StatCard = ({ label, value, sub, color = "blue", icon: Icon, trend }) => {
  const colors = {
    blue:   'text-blue-400 bg-blue-500/10 border-blue-500/20',
    green:  'text-green-400 bg-green-500/10 border-green-500/20',
    orange: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    purple: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    pink:   'text-pink-400 bg-pink-500/10 border-pink-500/20',
  };
  return (
    <div className="card p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        {Icon && <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${colors[color]}`}><Icon size={15}/></div>}
        {trend !== undefined && (
          <span className={`text-xs font-medium flex items-center gap-0.5 ${trend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            <ArrowUpRight size={11} className={trend < 0 ? 'rotate-180' : ''}/>{Math.abs(trend)}%
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-white">{value ?? '…'}</p>
      <p className="text-xs text-slate-400">{label}</p>
      {sub && <p className="text-xs text-slate-600">{sub}</p>}
    </div>
  );
};

const ScoreBadge = ({ score }) => {
  const cfg =
    score >= 80 ? { label: 'Hot',    cls: 'text-red-400    bg-red-500/10    border-red-500/30' } :
    score >= 60 ? { label: 'High',   cls: 'text-orange-400 bg-orange-500/10 border-orange-500/30' } :
    score >= 40 ? { label: 'Medium', cls: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30' } :
    score >= 20 ? { label: 'Low',    cls: 'text-blue-400   bg-blue-500/10   border-blue-500/30' } :
                  { label: 'Cold',   cls: 'text-slate-400  bg-slate-500/10  border-slate-500/30' };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.cls} flex items-center gap-1`}>
      {score >= 60 && <Flame size={9}/>}{score} {cfg.label}
    </span>
  );
};

const fmt = s => s >= 3600 ? `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`
              : s >= 60    ? `${Math.floor(s/60)}m ${s%60}s`
              :              `${s}s`;

const TABS = [
  { id: 'brand',       label: 'Brand Intel ✦',  icon: BrainCircuit },
  { id: 'overview',    label: 'Overview',        icon: BarChart2    },
  { id: 'pages',       label: 'Pages',           icon: Eye          },
  { id: 'contacts',    label: 'Contact Power',   icon: Flame        },
  { id: 'cities',      label: 'Cities',          icon: MapPin       },
  { id: 'devices',     label: 'Devices',         icon: Smartphone   },
  { id: 'engagement',  label: 'Engagement',      icon: Activity     },
];

export default function Analytics() {
  const [tab,        setTab]        = useState('brand');
  const [days,       setDays]       = useState(30);
  const [loading,    setLoading]    = useState(true);
  const [overview,   setOverview]   = useState(null);
  const [pages,      setPages]      = useState(null);
  const [contacts,   setContacts]   = useState(null);
  const [cities,     setCities]     = useState(null);
  const [devices,    setDevices]    = useState(null);
  const [brand,      setBrand]      = useState(null);
  const [engagement, setEngagement] = useState(null);
  const [search,     setSearch]     = useState('');
  const [sortBy,     setSortBy]     = useState('power_score');
  const [sortDir,    setSortDir]    = useState('desc');
  const [statusFilter, setStatusFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, pg, ct, ci, dv, en, br] = await Promise.all([
        analyticsApi.overview(days),
        analyticsApi.pages(days),
        analyticsApi.contacts(days, 100),
        analyticsApi.cities(days),
        analyticsApi.devices(days),
        analyticsApi.engagement(days),
        analyticsApi.brand(days),
      ]);
      setOverview(ov); setPages(pg); setContacts(ct);
      setCities(ci);   setDevices(dv); setEngagement(en); setBrand(br);
    } catch (_) {}
    setLoading(false);
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const chartData = (overview?.byDay || []).map((d, i) => ({
    day: new Date(d.day).toLocaleDateString('en', { weekday: 'short', day: 'numeric' }),
    visitors: d.visitors,
    carts: overview?.cartByDay?.[i]?.carts || 0,
  }));

  // filtered contacts
  const filteredContacts = (contacts?.contacts || [])
    .filter(c =>
      (statusFilter === 'all' || c.status === statusFilter) &&
      (!search || c.phone?.includes(search) || c.name?.toLowerCase().includes(search.toLowerCase()) ||
       c.city?.toLowerCase().includes(search.toLowerCase()))
    )
    .sort((a, b) => {
      const v = (x) => x[sortBy] ?? 0;
      return sortDir === 'desc' ? v(b) - v(a) : v(a) - v(b);
    });

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortBy(col); setSortDir('desc'); }
  };
  const SortIcon = ({ col }) => sortBy === col
    ? (sortDir === 'desc' ? <ChevronDown size={11}/> : <ChevronUp size={11}/>)
    : <ChevronDown size={11} className="opacity-30"/>;

  return (
    <div className="space-y-5 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Analytics</h2>
          <p className="text-xs text-slate-500 mt-0.5">Deep visitor behaviour, engagement & contact intelligence</p>
        </div>
        <div className="flex items-center gap-2">
          {[7,14,30,60].map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${days===d?"bg-wapp/10 border-wapp/40 text-white":"bg-white/[0.02] border-white/5 text-slate-400 hover:border-white/20"}`}>
              {d}d
            </button>
          ))}
          <button onClick={load} className="p-2 rounded-xl bg-white/[0.02] border border-white/5 text-slate-400 hover:text-white transition-all">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''}/>
          </button>
        </div>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Visitors"      value={loading?'…':(overview?.visitors||0).toLocaleString()} icon={Users}       color="blue"  />
        <StatCard label="Cart Events"   value={loading?'…':(overview?.cartEvents||0).toLocaleString()} icon={TrendingUp} color="orange"/>
        <StatCard label="Recovered"     value={loading?'…':(overview?.recovered||0).toLocaleString()} icon={Zap}         color="green" />
        <StatCard label="Messages Sent" value={loading?'…':(overview?.messagesSent||0).toLocaleString()} icon={Activity} color="purple"/>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-white/[0.02] p-1 rounded-xl border border-white/5 flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-all ${tab===t.id?"bg-[#1a2035] text-white shadow border border-white/10":"text-slate-400 hover:text-white"}`}>
            <t.icon size={12}/>{t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Visitor & Cart Trends</h3>
            {loading ? <div className="skeleton h-52 rounded-xl"/> : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="gV" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="gC" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickLine={false}/>
                  <Tooltip content={<Tip/>}/>
                  <Area type="monotone" dataKey="visitors" name="Visitors" stroke="#22c55e" fill="url(#gV)" strokeWidth={2} dot={false}/>
                  <Area type="monotone" dataKey="carts"    name="Carts"    stroke="#f97316" fill="url(#gC)" strokeWidth={2} dot={false}/>
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Campaign Performance</h3>
              {loading ? <div className="skeleton h-40 rounded-xl"/> : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={overview?.campaignPerf||[]} barSize={28}>
                    <XAxis dataKey="name" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickLine={false}/>
                    <Tooltip content={<Tip/>}/>
                    <Bar dataKey="total_sent"      name="Sent"      fill="#3b82f6" radius={[4,4,0,0]}/>
                    <Bar dataKey="total_recovered" name="Recovered" fill="#22c55e" radius={[4,4,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Top Cities</h3>
              {loading ? <div className="skeleton h-40 rounded-xl"/> : (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width={130} height={130}>
                    <PieChart>
                      <Pie data={(overview?.topCities||[]).map(c=>({name:c.city,value:c.cnt}))}
                        dataKey="value" cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={2}>
                        {(overview?.topCities||[]).map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-1.5">
                    {(overview?.topCities||[]).slice(0,6).map((c,i)=>(
                      <div key={c.city} className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{background:COLORS[i%COLORS.length]}}/>
                        <span className="text-xs text-slate-300 flex-1 truncate">{c.city}</span>
                        <span className="text-xs text-slate-500 font-mono">{c.cnt}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── PAGES ── */}
      {tab === 'pages' && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Page Analytics — {pages?.total_views||0} total views</h3>
          </div>
          {loading ? <div className="skeleton h-64 rounded-xl"/> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/5">
                    {[
                      { label: 'Page', key: 'views' },
                      { label: 'Views', key: 'views' },
                      { label: 'Unique', key: 'unique_visitors' },
                      { label: 'Avg Time', key: 'avg_duration_sec' },
                      { label: 'Scroll %', key: 'avg_scroll_pct' },
                      { label: 'Engagement', key: 'avg_engagement' },
                      { label: 'Bounce', key: 'bounce_rate' },
                      { label: 'Exit %', key: 'exit_rate' },
                    ].map(col => (
                      <th key={col.key} onClick={() => toggleSort(col.key)}
                        className="text-left py-2.5 px-3 text-slate-500 font-medium cursor-pointer hover:text-white transition-colors">
                        <span className="flex items-center gap-1">{col.label}<SortIcon col={col.key}/></span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(pages?.pages||[]).slice(0,50).map((p,i) => (
                    <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="py-2.5 px-3 max-w-[260px]">
                        <p className="text-white font-medium truncate" title={p.url}>{p.title || p.url}</p>
                        <p className="text-slate-600 truncate text-[10px]">{p.url}</p>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 font-mono">{p.views}</td>
                      <td className="py-2.5 px-3 text-slate-300 font-mono">{p.unique_visitors}</td>
                      <td className="py-2.5 px-3 text-slate-300 font-mono">{fmt(p.avg_duration_sec)}</td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden w-16">
                            <div className="h-full rounded-full bg-blue-500" style={{width:`${p.avg_scroll_pct}%`}}/>
                          </div>
                          <span className="text-slate-400 font-mono">{p.avg_scroll_pct}%</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3"><ScoreBadge score={p.avg_engagement}/></td>
                      <td className="py-2.5 px-3 text-slate-400 font-mono">{p.bounce_rate}%</td>
                      <td className="py-2.5 px-3 text-slate-400 font-mono">{p.exit_rate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(pages?.pages||[]).length === 0 && (
                <p className="text-slate-500 text-sm text-center py-12">No page view data yet. Install tracker.js to start collecting data.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── CONTACT POWER ── */}
      {tab === 'contacts' && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total Contacts"  value={(contacts?.total||0).toLocaleString()} icon={Users}  color="blue"/>
            <StatCard label="Hot (score≥80)"  value={(contacts?.contacts||[]).filter(c=>c.power_score>=80).length} icon={Flame} color="orange"/>
            <StatCard label="With Cart"       value={(contacts?.contacts||[]).filter(c=>c.cart_events>0).length} icon={TrendingUp} color="purple"/>
            <StatCard label="Avg Power Score" value={
              contacts?.contacts?.length
                ? Math.round(contacts.contacts.reduce((s,c)=>s+c.power_score,0)/contacts.contacts.length)
                : 0
            } icon={Star} color="green"/>
          </div>

          <div className="card p-5 space-y-3">
            {/* Filters */}
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[180px]">
                <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by phone, name, city…"
                  className="input pl-8 py-1.5 text-xs w-full"/>
              </div>
              <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}
                className="input text-xs py-1.5">
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="product_view">Product View</option>
                <option value="abandoned_cart">Abandoned Cart</option>
                <option value="purchased">Purchased</option>
              </select>
              <span className="text-xs text-slate-500">{filteredContacts.length} contacts</span>
            </div>

            {loading ? <div className="skeleton h-64 rounded-xl"/> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/5">
                      {[
                        {label:'Contact',   key:'name'},
                        {label:'Power',     key:'power_score'},
                        {label:'Engage',    key:'engagement_score'},
                        {label:'Scroll',    key:'avg_scroll_pct'},
                        {label:'Time',      key:'total_time_sec'},
                        {label:'Pages',     key:'page_views'},
                        {label:'Carts',     key:'cart_events'},
                        {label:'Status',    key:'status'},
                        {label:'City',      key:'city'},
                        {label:'Device',    key:'device'},
                        {label:'Last Seen', key:'last_seen'},
                      ].map(col=>(
                        <th key={col.key} onClick={()=>toggleSort(col.key)}
                          className="text-left py-2.5 px-3 text-slate-500 font-medium cursor-pointer hover:text-white transition-colors whitespace-nowrap">
                          <span className="flex items-center gap-1">{col.label}<SortIcon col={col.key}/></span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredContacts.slice(0,100).map((c,i)=>(
                      <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                        <td className="py-2.5 px-3">
                          <p className="text-white font-medium">{c.name || '—'}</p>
                          <p className="text-slate-500 font-mono text-[10px]">{c.phone}</p>
                        </td>
                        <td className="py-2.5 px-3"><ScoreBadge score={c.power_score}/></td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1">
                            <div className="w-12 h-1.5 bg-white/5 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-purple-500" style={{width:`${c.engagement_score}%`}}/>
                            </div>
                            <span className="text-slate-400 font-mono">{c.engagement_score}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 font-mono">{c.avg_scroll_pct}%</td>
                        <td className="py-2.5 px-3 text-slate-400 font-mono">{fmt(c.total_time_sec)}</td>
                        <td className="py-2.5 px-3 text-slate-300 font-mono text-center">{c.page_views}</td>
                        <td className="py-2.5 px-3 text-slate-300 font-mono text-center">{c.cart_events}</td>
                        <td className="py-2.5 px-3">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                            c.status==='purchased'       ? 'text-green-400  bg-green-500/10  border-green-500/20'  :
                            c.status==='abandoned_cart'  ? 'text-orange-400 bg-orange-500/10 border-orange-500/20' :
                            c.status==='product_view'    ? 'text-blue-400   bg-blue-500/10   border-blue-500/20'   :
                                                           'text-slate-400  bg-slate-500/10  border-slate-500/20'
                          }`}>{c.status}</span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-400">{c.city||'—'}</td>
                        <td className="py-2.5 px-3 text-slate-400">{c.device||'—'}</td>
                        <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                          {c.last_seen ? new Date(c.last_seen).toLocaleDateString('en',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredContacts.length === 0 && (
                  <p className="text-slate-500 text-sm text-center py-12">No contacts match your filters.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CITIES ── */}
      {tab === 'cities' && (
        <div className="card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">City Intelligence</h3>
          {loading ? <div className="skeleton h-64 rounded-xl"/> : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/5">
                      {['City','State','Visitors','Identified','Carts','Purchases','Avg Engage','Conv%'].map(h=>(
                        <th key={h} className="text-left py-2.5 px-3 text-slate-500 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(cities?.cities||[]).slice(0,50).map((c,i)=>(
                      <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                        <td className="py-2.5 px-3 text-white font-medium">{c.city}</td>
                        <td className="py-2.5 px-3 text-slate-400">{c.state||'—'}</td>
                        <td className="py-2.5 px-3 text-slate-300 font-mono">{c.visitors}</td>
                        <td className="py-2.5 px-3">
                          <span className="text-green-400 font-mono">{c.with_phone}</span>
                          <span className="text-slate-600 text-[10px] ml-1">
                            ({c.visitors?Math.round(c.with_phone/c.visitors*100):0}%)
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-orange-400 font-mono">{c.carts}</td>
                        <td className="py-2.5 px-3 text-green-400 font-mono">{c.purchases}</td>
                        <td className="py-2.5 px-3"><ScoreBadge score={c.avg_engagement}/></td>
                        <td className="py-2.5 px-3 text-slate-300 font-mono">{c.conversion_rate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(cities?.cities||[]).length === 0 && (
                  <p className="text-slate-500 text-sm text-center py-12">No city data yet.</p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── DEVICES ── */}
      {tab === 'devices' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {loading ? Array(4).fill(0).map((_,i)=><div key={i} className="skeleton h-52 rounded-2xl"/>) : [
            { title: 'Device Type',  data: devices?.devices  || [] },
            { title: 'Browser',      data: devices?.browsers || [] },
            { title: 'OS Platform',  data: devices?.os       || [] },
            { title: 'Language',     data: devices?.languages|| [] },
          ].map(({ title, data }) => (
            <div key={title} className="card p-5">
              <h3 className="text-sm font-semibold text-white mb-4">{title}</h3>
              {data.length === 0 ? <p className="text-slate-500 text-xs text-center py-8">No data yet</p> : (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width={120} height={120}>
                    <PieChart>
                      <Pie data={data} dataKey="value" cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={2}>
                        {data.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2">
                    {data.slice(0,6).map((d,i)=>{
                      const total = data.reduce((s,x)=>s+x.value,0);
                      return (
                        <div key={d.name} className="space-y-0.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{background:COLORS[i%COLORS.length]}}/>
                              <span className="text-xs text-slate-300">{d.name}</span>
                            </div>
                            <span className="text-xs text-slate-500 font-mono">{total?Math.round(d.value/total*100):0}%</span>
                          </div>
                          <div className="h-1 bg-white/5 rounded-full overflow-hidden ml-3.5">
                            <div className="h-full rounded-full" style={{width:`${total?d.value/total*100:0}%`,background:COLORS[i%COLORS.length]}}/>
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
      )}

      {/* ── ENGAGEMENT ── */}
      {tab === 'engagement' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Avg Time on Page"  value={loading?'…':fmt(engagement?.avgDuration||0)} icon={Clock}       color="blue"/>
            <StatCard label="Avg Scroll Depth"  value={loading?'…':`${engagement?.avgScroll||0}%`}  icon={MousePointer} color="purple"/>
            <StatCard label="Avg Engagement"    value={loading?'…':(engagement?.avgEngage||0)}       icon={Activity}    color="orange"/>
            <StatCard label="Total Page Views"  value={loading?'…':(engagement?.totalViews||0).toLocaleString()} icon={Eye} color="green"/>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Scroll Depth Distribution</h3>
              {loading ? <div className="skeleton h-40 rounded-xl"/> : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={engagement?.scrollBuckets||[]} barSize={32}>
                    <XAxis dataKey="range" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickLine={false}/>
                    <Tooltip content={<Tip/>}/>
                    <Bar dataKey="count" name="Sessions" fill="#3b82f6" radius={[4,4,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Engagement Score Distribution</h3>
              {loading ? <div className="skeleton h-40 rounded-xl"/> : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={engagement?.engDistribution||[]} barSize={32}>
                    <XAxis dataKey="label" tick={{fill:'#64748b',fontSize:9}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickLine={false}/>
                    <Tooltip content={<Tip/>}/>
                    <Bar dataKey="count" name="Users" radius={[4,4,0,0]}>
                      {(engagement?.engDistribution||[]).map((_,i)=>(
                        <Cell key={i} fill={['#64748b','#3b82f6','#f59e0b','#f97316','#ef4444'][i]||'#3b82f6'}/>
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Time on Page Distribution</h3>
              {loading ? <div className="skeleton h-40 rounded-xl"/> : (
                <div className="space-y-3 pt-2">
                  {(engagement?.durationBuckets||[]).map((b,i)=>{
                    const total = (engagement?.durationBuckets||[]).reduce((s,x)=>s+x.count,0);
                    const pct   = total ? Math.round(b.count/total*100) : 0;
                    return (
                      <div key={b.label} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-300">{b.label}</span>
                          <span className="text-slate-500 font-mono">{b.count} ({pct}%)</span>
                        </div>
                        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{
                            width:`${pct}%`,
                            background: ['#ef4444','#f97316','#f59e0b','#22c55e','#3b82f6'][i]||'#3b82f6'
                          }}/>
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

      {/* ── BRAND INTEL ── */}
      {tab === 'brand' && (
        <div className="space-y-5">
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label:'Total Visitors',     value:(brand?.summary?.totalVisitors||0).toLocaleString(),  icon:Users,       color:'blue'   },
              { label:'Identified (Phone)', value:(brand?.summary?.withPhone||0).toLocaleString(),      icon:Target,      color:'green'  },
              { label:'Cart Abandoners',    value:(brand?.summary?.cartAbandon||0).toLocaleString(),    icon:ShoppingBag, color:'orange' },
              { label:'Avg Order Value',    value:brand?.summary?.avgOrderValue ? `₹${brand.summary.avgOrderValue.toLocaleString()}` : '—', icon:DollarSign, color:'purple' },
            ].map(s => (
              <StatCard key={s.label} label={s.label} value={loading?'…':s.value} icon={s.icon} color={s.color}/>
            ))}
          </div>

          {/* Revenue Intelligence */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="card p-4 border-green-500/20">
              <p className="text-xs text-slate-500 mb-1">Recovered Revenue</p>
              <p className="text-2xl font-bold text-green-400">₹{(brand?.summary?.totalRevenue||0).toLocaleString()}</p>
              <p className="text-xs text-slate-600 mt-1">from {brand?.summary?.purchased||0} purchases</p>
            </div>
            <div className="card p-4 border-orange-500/20">
              <p className="text-xs text-slate-500 mb-1">Potential Revenue (Carts)</p>
              <p className="text-2xl font-bold text-orange-400">₹{(brand?.summary?.potentialRevenue||0).toLocaleString()}</p>
              <p className="text-xs text-slate-600 mt-1">{brand?.summary?.cartAbandon||0} carts × avg order value</p>
            </div>
            <div className="card p-4 border-blue-500/20">
              <p className="text-xs text-slate-500 mb-1">Return Visitor Rate</p>
              <p className="text-2xl font-bold text-blue-400">{brand?.summary?.returnRate||0}%</p>
              <p className="text-xs text-slate-600 mt-1">{brand?.summary?.returningVisitors||0} returning / {brand?.summary?.newVisitors||0} new</p>
            </div>
          </div>

          {/* Peak Hours Heatmap + Day of Week */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Heatmap */}
            <div className="md:col-span-2 card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Clock size={14} className="text-blue-400"/> Peak Activity Heatmap
                </h3>
                <span className="text-xs text-slate-500">Hour × Day — darker = more activity</span>
              </div>
              {loading ? <div className="skeleton h-48 rounded-xl"/> : (
                <div className="overflow-x-auto">
                  <div className="min-w-[500px]">
                    {/* Day headers */}
                    <div className="grid grid-cols-8 gap-0.5 mb-1">
                      <div/>
                      {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>(
                        <div key={d} className="text-center text-[10px] text-slate-500 font-medium">{d}</div>
                      ))}
                    </div>
                    {/* Rows — only show every 2 hours to keep compact */}
                    {(brand?.heatmapRows||[]).filter((_,i)=>i%2===0).map(row => {
                      const maxCount = Math.max(...(brand?.heatmapRows||[]).map(r=>r.total), 1);
                      return (
                        <div key={row.hourNum} className="grid grid-cols-8 gap-0.5 mb-0.5">
                          <div className="text-[9px] text-slate-500 text-right pr-1.5 flex items-center justify-end">{row.hour}</div>
                          {row.days.map(({ day, count }) => {
                            const intensity = maxCount > 0 ? count / maxCount : 0;
                            const bg = intensity === 0 ? 'bg-white/[0.02]'
                              : intensity < 0.25 ? 'bg-blue-500/20'
                              : intensity < 0.5  ? 'bg-blue-500/40'
                              : intensity < 0.75 ? 'bg-orange-500/60'
                              :                    'bg-red-500/80';
                            return (
                              <div key={day} title={`${day} ${row.hour}: ${count} events`}
                                className={`h-5 rounded-sm ${bg} transition-all cursor-default`}/>
                            );
                          })}
                        </div>
                      );
                    })}
                    {/* Legend */}
                    <div className="flex items-center gap-2 mt-3 justify-end">
                      {[['bg-white/[0.02]','None'],['bg-blue-500/20','Low'],['bg-blue-500/40','Med'],['bg-orange-500/60','High'],['bg-red-500/80','Peak']].map(([cls,lbl])=>(
                        <div key={lbl} className="flex items-center gap-1">
                          <div className={`w-3 h-3 rounded-sm ${cls}`}/>
                          <span className="text-[9px] text-slate-500">{lbl}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Day of week chart */}
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <Calendar size={14} className="text-purple-400"/> Best Days
              </h3>
              {loading ? <div className="skeleton h-48 rounded-xl"/> : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={brand?.dayOfWeekData||[]} barSize={20}>
                    <XAxis dataKey="day" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickLine={false}/>
                    <Tooltip content={<Tip/>}/>
                    <Bar dataKey="visitors" name="Visitors" fill="#3b82f6" radius={[3,3,0,0]}/>
                    <Bar dataKey="carts"    name="Carts"    fill="#f97316" radius={[3,3,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Conversion Funnel */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-white mb-5 flex items-center gap-2">
              <TrendingUp size={14} className="text-green-400"/> Conversion Funnel
            </h3>
            {loading ? <div className="skeleton h-24 rounded-xl"/> : (
              <div className="flex items-end gap-1 overflow-x-auto pb-2">
                {(brand?.funnel||[]).map((s, i) => {
                  const maxCount = brand.funnel[0]?.count || 1;
                  const heightPct = Math.max((s.count / maxCount) * 100, 4);
                  return (
                    <div key={s.stage} className="flex-1 min-w-[90px] flex flex-col items-center gap-2">
                      <div className="w-full flex flex-col items-center gap-1">
                        <span className="text-xs font-bold text-white">{s.count.toLocaleString()}</span>
                        <div className="w-full rounded-t-lg transition-all" style={{
                          height: `${heightPct * 1.2}px`,
                          background: s.color,
                          opacity: 0.85,
                          minHeight: '8px',
                        }}/>
                      </div>
                      <div className="text-center">
                        <p className="text-[11px] text-slate-300 font-medium">{s.stage}</p>
                        <p className="text-[10px] text-slate-500">{s.conv_pct}% of visitors</p>
                        {i > 0 && s.drop_pct > 0 && (
                          <p className="text-[9px] text-red-400 mt-0.5">↓ {s.drop_pct}% drop</p>
                        )}
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
              <Users size={14} className="text-blue-400"/> Meta-Ready Audience Segments
            </h3>
            {loading ? <div className="skeleton h-48 rounded-xl"/> : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(brand?.segments||[]).map(seg => (
                  <div key={seg.name} className="p-4 rounded-xl border border-white/5 bg-white/[0.02] space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{background:seg.color}}/>
                        <p className="text-sm font-semibold text-white">{seg.name}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                          seg.heat==='Hot'  ? 'text-red-400 bg-red-500/10 border-red-500/20' :
                          seg.heat==='Warm' ? 'text-orange-400 bg-orange-500/10 border-orange-500/20' :
                                             'text-slate-400 bg-slate-500/10 border-slate-500/20'
                        }`}>{seg.heat}</span>
                        <span className="text-lg font-bold text-white">{seg.size.toLocaleString()}</span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400">{seg.description}</p>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="text-[10px] space-y-0.5">
                        <p className="text-slate-500">Meta Objective</p>
                        <p className="text-blue-400 font-medium">{seg.meta_objective}</p>
                      </div>
                      <div className="text-[10px] space-y-0.5">
                        <p className="text-slate-500">Est. ROAS</p>
                        <p className="text-green-400 font-medium">{seg.roas_potential}</p>
                      </div>
                    </div>
                    <div className="pt-1 border-t border-white/5">
                      <p className="text-[10px] text-slate-500 mb-0.5">Audience</p>
                      <p className="text-[10px] text-slate-300">{seg.meta_audience}</p>
                    </div>
                    <div className="p-2 bg-yellow-500/5 border border-yellow-500/10 rounded-lg">
                      <p className="text-[10px] text-yellow-300">💡 {seg.ad_copy_hint}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top Products for Ads */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Flame size={14} className="text-orange-400"/> Hot Products — Best for Ad Creatives
            </h3>
            {loading ? <div className="skeleton h-40 rounded-xl"/> : (brand?.topProducts||[]).length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-8">No product view data yet. Implement <code className="text-blue-400">WhatsWay.trackProductView()</code> on your product pages.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/5">
                      {['#','Product','Views','Unique','Carts','Cart Rate','Hot Score','Revenue'].map(h=>(
                        <th key={h} className="text-left py-2 px-3 text-slate-500 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(brand?.topProducts||[]).map((p,i)=>(
                      <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                        <td className="py-2.5 px-3 text-slate-500 font-mono">{i+1}</td>
                        <td className="py-2.5 px-3">
                          <p className="text-white font-medium truncate max-w-[200px]" title={p.name}>{p.name}</p>
                          {p.price && <p className="text-slate-500 text-[10px]">{p.price}</p>}
                        </td>
                        <td className="py-2.5 px-3 text-slate-300 font-mono">{p.views}</td>
                        <td className="py-2.5 px-3 text-slate-400 font-mono">{p.sessions}</td>
                        <td className="py-2.5 px-3 text-orange-400 font-mono">{p.carts}</td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <div className="w-12 h-1.5 bg-white/5 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-orange-500" style={{width:`${Math.min(p.cart_rate,100)}%`}}/>
                            </div>
                            <span className="text-slate-300 font-mono">{p.cart_rate}%</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            p.hot_score >= 20 ? 'text-red-400 bg-red-500/10 border-red-500/20' :
                            p.hot_score >= 10 ? 'text-orange-400 bg-orange-500/10 border-orange-500/20' :
                                               'text-blue-400 bg-blue-500/10 border-blue-500/20'
                          }`}>{p.hot_score >= 20 ? '🔥' : ''}{p.hot_score}</span>
                        </td>
                        <td className="py-2.5 px-3 text-green-400 font-mono">₹{p.revenue.toLocaleString()}</td>
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
              <Megaphone size={14} className="text-pink-400"/> Meta Ads Recommendations
            </h3>
            {loading ? <div className="skeleton h-48 rounded-xl"/> : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(brand?.adRecommendations||[]).map((r, i) => {
                  const IconMap = { clock:Clock, calendar:Calendar, target:Target, map:Map, users:Users, image:Image, mobile:Smartphone, repeat:Repeat };
                  const Ico = IconMap[r.icon] || Zap;
                  return (
                    <div key={i} className={`p-4 rounded-xl border space-y-2 ${
                      r.priority==='HIGH'   ? 'border-red-500/20 bg-red-500/5' :
                      r.priority==='MEDIUM' ? 'border-orange-500/20 bg-orange-500/5' :
                                             'border-white/5 bg-white/[0.02]'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Ico size={13} className={
                            r.priority==='HIGH'   ? 'text-red-400' :
                            r.priority==='MEDIUM' ? 'text-orange-400' : 'text-slate-400'
                          }/>
                          <p className="text-xs font-semibold text-white">{r.title}</p>
                        </div>
                        <span className={`text-[9px] px-2 py-0.5 rounded-full border font-bold ${
                          r.priority==='HIGH'   ? 'text-red-400 border-red-500/30 bg-red-500/10' :
                          r.priority==='MEDIUM' ? 'text-orange-400 border-orange-500/30 bg-orange-500/10' :
                                                 'text-slate-400 border-slate-500/30 bg-slate-500/10'
                        }`}>{r.priority}</span>
                      </div>
                      <p className="text-xs text-slate-400 italic">"{r.insight}"</p>
                      <div className="p-2.5 bg-white/[0.03] rounded-lg border border-white/5">
                        <p className="text-xs text-slate-200">→ {r.action}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Peak Hours List */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Clock size={14} className="text-blue-400"/> Top 5 Peak Hours for Ad Scheduling
            </h3>
            {loading ? <div className="skeleton h-24 rounded-xl"/> : (
              <div className="space-y-2">
                {(brand?.peakHours||[]).map((h,i)=>(
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold border ${
                      i===0 ? 'bg-red-500/20 border-red-500/30 text-red-400' :
                      i===1 ? 'bg-orange-500/20 border-orange-500/30 text-orange-400' :
                      i===2 ? 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400' :
                               'bg-blue-500/20 border-blue-500/30 text-blue-400'
                    }`}>
                      {h.label}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-medium text-white">{h.recommendation}</p>
                        <span className="text-xs text-slate-500 font-mono">{h.count} events</span>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-blue-500" style={{
                          width:`${brand?.peakHours?.[0]?.count > 0 ? (h.count/brand.peakHours[0].count)*100 : 0}%`
                        }}/>
                      </div>
                    </div>
                  </div>
                ))}
                {(brand?.peakHours||[]).length === 0 && (
                  <p className="text-slate-500 text-sm text-center py-8">No activity data yet. Install tracker.js to start collecting data.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
