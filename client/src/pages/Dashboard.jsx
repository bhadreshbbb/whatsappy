import React, { useEffect, useState } from "react";
import { Users, ShoppingCart, MessageSquare, TrendingUp, Zap, Eye, RefreshCw, ArrowUpRight } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import { visitorsApi, analyticsApi, campaignsApi } from "../api";

const MOCK_CHART = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(); d.setDate(d.getDate() - (6 - i));
  return { day: d.toLocaleDateString("en", { weekday: "short" }), visitors: Math.floor(Math.random() * 300 + 100), carts: Math.floor(Math.random() * 80 + 20) };
});

function StatCard({ icon: Icon, label, value, sub, color = "green", trend }) {
  const colors = {
    green: "text-green-400 bg-green-400/10",
    blue: "text-blue-400 bg-blue-400/10",
    orange: "text-orange-400 bg-orange-400/10",
    purple: "text-purple-400 bg-purple-400/10",
  };
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors[color]}`}>
          <Icon size={20} />
        </div>
        {trend != null && (
          <span className="text-xs font-semibold text-green-400 flex items-center gap-0.5">
            <ArrowUpRight size={12} />{trend}%
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-white">{value?.toLocaleString() ?? "—"}</p>
      <p className="text-xs text-slate-400 mt-1">{label}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1a2035] border border-white/10 rounded-xl px-3 py-2 text-xs">
      <p className="text-slate-400 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }} className="font-semibold">{p.name}: {p.value}</p>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [s, a, c] = await Promise.all([
        visitorsApi.stats(),
        analyticsApi.overview(7),
        campaignsApi.list(),
      ]);
      setStats(s); setAnalytics(a); setCampaigns(c.slice(0, 4));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);

  const chartData = analytics?.byDay?.length > 0
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
    <div className="space-y-6 max-w-7xl">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Total Visitors" value={stats?.total} sub="All time" color="blue" trend={12} />
        <StatCard icon={Eye} label="Live Right Now" value={stats?.active} sub="Active sessions" color="green" />
        <StatCard icon={ShoppingCart} label="Active Carts" value={stats?.cartEvents} sub={`${stats?.recovered} recovered`} color="orange" trend={8} />
        <StatCard icon={MessageSquare} label="Messages Sent" value={stats?.totalSent} sub="Via WhatsApp" color="purple" trend={23} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-semibold text-white">Visitor & Cart Trends</h2>
              <p className="text-xs text-slate-500">Last 7 days</p>
            </div>
            <button onClick={load} className="text-slate-500 hover:text-white transition-colors">
              <RefreshCw size={14} />
            </button>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="gVisitors" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gCarts" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="visitors" name="Visitors" stroke="#22c55e" fill="url(#gVisitors)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="carts" name="Carts" stroke="#f97316" fill="url(#gCarts)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white mb-1">Recovery Rate</h2>
            <p className="text-xs text-slate-500">Abandoned carts recovered via WhatsApp</p>
          </div>
          <div className="text-center py-6">
            <p className="text-5xl font-bold text-wapp">{recoveryRate}%</p>
            <p className="text-xs text-slate-400 mt-2">{stats?.recovered} / {stats?.cartEvents} carts</p>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Industry avg.</span>
              <span className="text-slate-300">5.2%</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Your rate</span>
              <span className="text-green-400 font-semibold">{recoveryRate}%</span>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden mt-1">
              <div className="h-full bg-wapp rounded-full" style={{ width: `${Math.min(+recoveryRate * 5, 100)}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Active Campaigns</h2>
            <span className="badge bg-wapp/10 text-wapp border border-wapp/20">{campaigns.filter(c => c.is_active).length} running</span>
          </div>
          <div className="space-y-3">
            {campaigns.length === 0 && <p className="text-xs text-slate-500 py-4 text-center">No campaigns yet</p>}
            {campaigns.map(c => (
              <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                <div className={`w-2 h-2 rounded-full shrink-0 ${c.is_active ? "bg-green-500" : "bg-slate-500"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{c.name}</p>
                  <p className="text-xs text-slate-500">{c.total_sent} sent · {c.total_recovered} recovered</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-semibold text-wapp">
                    {c.total_sent > 0 ? ((c.total_recovered / c.total_sent) * 100).toFixed(1) : "0.0"}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Top Cities</h2>
          <div className="space-y-3">
            {(analytics?.topCities || []).slice(0, 6).map((c, i) => {
              const max = analytics?.topCities?.[0]?.cnt || 1;
              return (
                <div key={c.city} className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 w-4">{i + 1}</span>
                  <span className="text-sm text-slate-300 w-24 truncate">{c.city}</span>
                  <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-wapp rounded-full" style={{ width: `${(c.cnt / max) * 100}%` }} />
                  </div>
                  <span className="text-xs text-slate-400 w-8 text-right">{c.cnt}</span>
                </div>
              );
            })}
            {(!analytics?.topCities || analytics.topCities.length === 0) && (
              <p className="text-xs text-slate-500 text-center py-4">Tracking data will appear here</p>
            )}
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-3 mb-3">
          <Zap size={16} className="text-wapp" />
          <h2 className="text-sm font-semibold text-white">Automation Engine</h2>
          <span className="badge bg-green-500/10 text-green-400 border border-green-500/20">● Running</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Check Interval", value: "Every 5 min" },
            { label: "Active Rules", value: `${campaigns.filter(c => c.is_active).length} campaigns` },
            { label: "Phone Contacts", value: `${stats?.withPhone || 0} captured` },
            { label: "Last Recovery", value: "Just now" },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white/[0.02] rounded-xl p-3 border border-white/5">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-sm font-semibold text-white mt-1">{value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
