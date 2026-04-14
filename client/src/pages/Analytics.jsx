import React, { useEffect, useState, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, RadialBarChart, RadialBar, Legend,
} from "recharts";
import {
  BarChart2, Globe, Users, Clock, TrendingUp, Smartphone, MousePointer,
  Flame, Eye, ArrowUpRight, Filter, RefreshCw, ChevronDown, ChevronUp,
  MapPin, Zap, Activity, Star, Search,
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
  { id: 'overview',    label: 'Overview',       icon: BarChart2  },
  { id: 'pages',       label: 'Pages',          icon: Eye        },
  { id: 'contacts',    label: 'Contact Power',  icon: Flame      },
  { id: 'cities',      label: 'Cities',         icon: MapPin     },
  { id: 'devices',     label: 'Devices',        icon: Smartphone },
  { id: 'engagement',  label: 'Engagement',     icon: Activity   },
];

export default function Analytics() {
  const [tab,        setTab]        = useState('overview');
  const [days,       setDays]       = useState(7);
  const [loading,    setLoading]    = useState(true);
  const [overview,   setOverview]   = useState(null);
  const [pages,      setPages]      = useState(null);
  const [contacts,   setContacts]   = useState(null);
  const [cities,     setCities]     = useState(null);
  const [devices,    setDevices]    = useState(null);
  const [engagement, setEngagement] = useState(null);
  const [search,     setSearch]     = useState('');
  const [sortBy,     setSortBy]     = useState('power_score');
  const [sortDir,    setSortDir]    = useState('desc');
  const [statusFilter, setStatusFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, pg, ct, ci, dv, en] = await Promise.all([
        analyticsApi.overview(days),
        analyticsApi.pages(days),
        analyticsApi.contacts(days, 100),
        analyticsApi.cities(days),
        analyticsApi.devices(days),
        analyticsApi.engagement(days),
      ]);
      setOverview(ov); setPages(pg); setContacts(ct);
      setCities(ci);   setDevices(dv); setEngagement(en);
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
    </div>
  );
}
