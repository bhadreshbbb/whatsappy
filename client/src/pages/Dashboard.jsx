import React, { useEffect, useState } from "react";
import {
  Users, ShoppingCart, MessageSquare, TrendingUp,
  Zap, Eye, RefreshCw, ArrowUpRight, Activity,
  ShoppingBag, CheckCircle2, Globe,
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { visitorsApi, analyticsApi, campaignsApi } from "../api";

const MOCK_CHART = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(); d.setDate(d.getDate() - (6 - i));
  return {
    day: d.toLocaleDateString("en", { weekday: "short" }),
    visitors: Math.floor(Math.random() * 200 + 60),
    carts: Math.floor(Math.random() * 60 + 10),
  };
});

const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#131d2e',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12,
      padding: '8px 14px',
      fontSize: 12,
      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    }}>
      <p style={{ color: '#64748b', marginBottom: 4 }}>{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color, fontWeight: 600 }}>{p.name}: {p.value}</p>
      ))}
    </div>
  );
};

function StatCard({ icon: Icon, label, value, sub, color, accent }) {
  const palettes = {
    green:  { icon: 'rgba(34,197,94,0.12)',  iconColor: '#4ade80', accent: '#22c55e', glow: 'rgba(34,197,94,0.1)' },
    blue:   { icon: 'rgba(59,130,246,0.12)', iconColor: '#60a5fa', accent: '#3b82f6', glow: 'rgba(59,130,246,0.1)' },
    orange: { icon: 'rgba(249,115,22,0.12)', iconColor: '#fb923c', accent: '#f97316', glow: 'rgba(249,115,22,0.1)' },
    purple: { icon: 'rgba(168,85,247,0.12)', iconColor: '#c084fc', accent: '#a855f7', glow: 'rgba(168,85,247,0.1)' },
    cyan:   { icon: 'rgba(6,182,212,0.12)',  iconColor: '#22d3ee', accent: '#06b6d4', glow: 'rgba(6,182,212,0.1)' },
  };
  const p = palettes[color] || palettes.green;

  return (
    <div className="card p-5 relative overflow-hidden group"
      style={{ transition: 'transform 0.2s, box-shadow 0.2s' }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = `0 8px 32px ${p.glow}, 0 2px 20px rgba(0,0,0,0.4)`;
        e.currentTarget.style.borderColor = `${p.accent}22`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = '';
        e.currentTarget.style.boxShadow = '';
        e.currentTarget.style.borderColor = '';
      }}>
      {/* Background glow blob */}
      <div className="absolute top-0 right-0 w-24 h-24 rounded-full pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{ background: `radial-gradient(circle, ${p.glow} 0%, transparent 70%)`, transform: 'translate(30%, -30%)' }}/>

      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: p.icon }}>
          <Icon size={19} style={{ color: p.iconColor }}/>
        </div>
        {accent && (
          <span className="text-xs font-semibold flex items-center gap-0.5" style={{ color: '#4ade80' }}>
            <ArrowUpRight size={11}/>{accent}
          </span>
        )}
      </div>

      <p className="text-2xl font-bold text-white number-reveal stat-value">{value?.toLocaleString() ?? '—'}</p>
      <p className="text-xs mt-1" style={{ color: '#64748b' }}>{label}</p>
      {sub && <p className="text-xs mt-0.5" style={{ color: '#475569' }}>{sub}</p>}

      {/* Bottom accent line */}
      <div className="absolute bottom-0 left-0 h-0.5 w-0 group-hover:w-full transition-all duration-500 rounded"
        style={{ background: `linear-gradient(90deg, ${p.accent}, transparent)` }}/>
    </div>
  );
}

export default function Dashboard() {
  const [stats,     setStats]     = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true); else setRefreshing(true);
    try {
      const [s, a, c] = await Promise.all([
        visitorsApi.stats(),
        analyticsApi.overview(7),
        campaignsApi.list(),
      ]);
      setStats(s); setAnalytics(a); setCampaigns(c.slice(0, 5));
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 30000);
    return () => clearInterval(t);
  }, []);

  const chartData = analytics?.byDay?.length
    ? analytics.byDay.map((d, i) => ({
        day: new Date(d.day).toLocaleDateString("en", { weekday: "short" }),
        visitors: d.visitors,
        carts: analytics.cartByDay?.[i]?.carts || 0,
      }))
    : MOCK_CHART;

  const recoveryRate = stats?.cartEvents > 0
    ? ((stats.recovered / stats.cartEvents) * 100).toFixed(1)
    : "0.0";

  return (
    <div className="space-y-5 max-w-7xl">

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Eye}          label="Total Visitors"  value={loading ? null : stats?.total}      sub="All time"              color="blue"   accent={12}/>
        <StatCard icon={Activity}     label="Live Right Now"  value={loading ? null : stats?.active}     sub="Active sessions"       color="green"  />
        <StatCard icon={ShoppingCart} label="Active Carts"    value={loading ? null : stats?.cartEvents} sub={`${stats?.recovered||0} recovered`} color="orange" accent={8}/>
        <StatCard icon={MessageSquare}label="Messages Sent"   value={loading ? null : stats?.totalSent}  sub="Via WhatsApp"          color="purple" accent={23}/>
      </div>

      {/* Chart + Recovery */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-semibold text-white">Visitor & Cart Trends</h2>
              <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>Last 7 days</p>
            </div>
            <button onClick={() => load(true)}
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-all"
              style={{ color: '#475569' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#e2e8f0'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#475569'; e.currentTarget.style.background = 'transparent'; }}>
              <RefreshCw size={13} className={refreshing ? 'spin-smooth' : ''}/>
            </button>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="gV" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="gC" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#f97316" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="day" tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false}/>
              <Tooltip content={<ChartTip/>} cursor={{ stroke: 'rgba(255,255,255,0.06)', strokeWidth: 1 }}/>
              <Area type="monotone" dataKey="visitors" name="Visitors" stroke="#22c55e" fill="url(#gV)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#22c55e' }}/>
              <Area type="monotone" dataKey="carts"    name="Carts"    stroke="#f97316" fill="url(#gC)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#f97316' }}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Recovery Rate */}
        <div className="card p-5 flex flex-col">
          <h2 className="text-sm font-semibold text-white">Recovery Rate</h2>
          <p className="text-xs mt-0.5 mb-auto" style={{ color: '#64748b' }}>Abandoned carts recovered</p>
          <div className="text-center py-5">
            <p className="text-5xl font-bold number-reveal stat-value" style={{ color: '#25D366' }}>{recoveryRate}%</p>
            <p className="text-xs mt-2" style={{ color: '#64748b' }}>{stats?.recovered} / {stats?.cartEvents} carts</p>
          </div>
          <div className="space-y-2">
            {[
              { label: 'Industry avg.', value: '5.2%', color: '#64748b' },
              { label: 'Your rate',     value: `${recoveryRate}%`, color: '#4ade80' },
            ].map(r => (
              <div key={r.label} className="flex justify-between text-xs">
                <span style={{ color: '#64748b' }}>{r.label}</span>
                <span style={{ color: r.color, fontWeight: 600 }}>{r.value}</span>
              </div>
            ))}
            <div className="progress-track mt-2">
              <div className="progress-fill" style={{ width: `${Math.min(+recoveryRate * 5, 100)}%` }}/>
            </div>
          </div>
        </div>
      </div>

      {/* Campaigns + Cities */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Active Campaigns</h2>
            <span className="badge text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ background: 'rgba(37,211,102,0.1)', color: '#4ade80', border: '1px solid rgba(37,211,102,0.2)' }}>
              {campaigns.filter(c => c.is_active).length} running
            </span>
          </div>
          <div className="space-y-2">
            {campaigns.length === 0 && (
              <p className="text-xs text-center py-6" style={{ color: '#475569' }}>No campaigns yet</p>
            )}
            {campaigns.map(c => {
              const rate = c.total_sent > 0 ? ((c.total_recovered / c.total_sent) * 100).toFixed(1) : '0.0';
              return (
                <div key={c.id}
                  className="flex items-center gap-3 p-3 rounded-xl transition-all duration-150"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}>
                  <div className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: c.is_active ? '#22c55e' : '#475569', boxShadow: c.is_active ? '0 0 6px #22c55e' : 'none' }}/>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{c.name}</p>
                    <p className="text-xs" style={{ color: '#475569' }}>{c.total_sent} sent · {c.total_recovered} recovered</p>
                  </div>
                  <span className="text-xs font-bold shrink-0" style={{ color: '#25D366' }}>{rate}%</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Top Cities</h2>
          <div className="space-y-3">
            {(analytics?.topCities || []).slice(0, 6).map((c, i) => {
              const max   = analytics?.topCities?.[0]?.cnt || 1;
              const width = (c.cnt / max) * 100;
              const colors = ['#25D366','#3b82f6','#f97316','#a855f7','#ec4899','#f59e0b'];
              return (
                <div key={c.city} className="flex items-center gap-3">
                  <span className="text-xs w-4 text-center shrink-0" style={{ color: '#475569' }}>{i + 1}</span>
                  <span className="text-sm w-24 truncate shrink-0" style={{ color: '#cbd5e1' }}>{c.city}</span>
                  <div className="flex-1 progress-track">
                    <div style={{ width: `${width}%`, background: colors[i % colors.length], height: '100%', borderRadius: 99, transition: 'width 0.8s cubic-bezier(0.22,1,0.36,1)' }}/>
                  </div>
                  <span className="text-xs w-8 text-right shrink-0 font-mono" style={{ color: '#94a3b8' }}>{c.cnt}</span>
                </div>
              );
            })}
            {(!analytics?.topCities || analytics.topCities.length === 0) && (
              <p className="text-xs text-center py-4" style={{ color: '#475569' }}>Tracking data will appear here</p>
            )}
          </div>
        </div>
      </div>

      {/* Funnel status breakdown */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Visitor Funnel</h2>
            <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>Real-time status progression (all time)</p>
          </div>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {[
            { key: 'active',             label: 'Active',              color: '#60a5fa', bg: 'rgba(59,130,246,0.1)',   border: 'rgba(59,130,246,0.2)'   },
            { key: 'product_view',       label: 'Product View',        color: '#a78bfa', bg: 'rgba(139,92,246,0.1)',   border: 'rgba(139,92,246,0.2)'   },
            { key: 'abandoned_cart',     label: 'Abandoned Cart',      color: '#fb923c', bg: 'rgba(249,115,22,0.1)',   border: 'rgba(249,115,22,0.2)'   },
            { key: 'abandoned_checkout', label: 'Abandoned Checkout',  color: '#f87171', bg: 'rgba(239,68,68,0.1)',    border: 'rgba(239,68,68,0.2)'    },
            { key: 'followup_complete',  label: 'Followup Done',       color: '#34d399', bg: 'rgba(52,211,153,0.1)',   border: 'rgba(52,211,153,0.2)'   },
            { key: 'purchased',          label: 'Purchased',           color: '#4ade80', bg: 'rgba(34,197,94,0.1)',    border: 'rgba(34,197,94,0.2)'    },
          ].map(s => (
            <div key={s.key} className="p-3 rounded-xl text-center"
              style={{ background: s.bg, border: `1px solid ${s.border}` }}>
              <p className="text-2xl font-bold" style={{ color: s.color }}>
                {analytics?.funnel?.[s.key] ?? 0}
              </p>
              <p className="text-[10px] mt-1 leading-tight" style={{ color: s.color, opacity: 0.8 }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Automation Engine status */}
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(37,211,102,0.12)' }}>
            <Zap size={15} style={{ color: '#4ade80' }}/>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Automation Engine</h2>
            <p className="text-xs" style={{ color: '#64748b' }}>Universal cron-based WhatsApp flow engine</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
            style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#4ade80' }}>
            <span className="w-1.5 h-1.5 rounded-full live-dot" style={{ background: '#4ade80' }}/>
            Running
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Check Interval',  value: 'Every 5 min',   icon: Activity },
            { label: 'Active Campaigns',value: `${campaigns.filter(c=>c.is_active).length} flows`, icon: Zap },
            { label: 'Phone Contacts',  value: `${stats?.withPhone||0} captured`, icon: Users },
            { label: 'Phones Recovered',value: `${stats?.recovered||0} carts`,    icon: CheckCircle2 },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="p-3 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <Icon size={11} style={{ color: '#64748b' }}/>
                <p className="text-xs" style={{ color: '#64748b' }}>{label}</p>
              </div>
              <p className="text-sm font-semibold text-white">{value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
