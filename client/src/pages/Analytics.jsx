import React, { useEffect, useState } from "react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { analyticsApi } from "../api";

const COLORS = ["#22c55e","#3b82f6","#f97316","#a855f7","#ec4899","#14b8a6","#f59e0b","#64748b"];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1a2035] border border-white/10 rounded-xl px-3 py-2 text-xs">
      <p className="text-slate-400 mb-1">{label}</p>
      {payload.map(p => <p key={p.name} style={{color:p.color}} className="font-semibold">{p.name}: {p.value}</p>)}
    </div>
  );
};

export default function Analytics() {
  const [data, setData] = useState(null);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    setLoading(true);
    analyticsApi.overview(days).then(setData).catch(()=>{}).finally(()=>setLoading(false));
  }, [days]);

  const chartData = (data?.byDay||[]).map((d,i)=>({
    day: new Date(d.day).toLocaleDateString("en",{weekday:"short",month:"short",day:"numeric"}),
    visitors: d.visitors,
    carts: data?.cartByDay?.[i]?.carts||0,
  }));

  const cityData = (data?.topCities||[]).map(c=>({name:c.city,value:c.cnt}));

  return (
    <div className="space-y-5 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Analytics</h2>
          <p className="text-xs text-slate-500 mt-0.5">Performance overview</p>
        </div>
        <div className="flex gap-2">
          {[7,14,30].map(d=>(
            <button key={d} onClick={()=>setDays(d)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${days===d?"bg-wapp/10 border-wapp/40 text-white":"bg-white/[0.02] border-white/5 text-slate-400 hover:border-white/20"}`}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label:"Visitors", value:data?.visitors, color:"blue" },
          { label:"Cart Events", value:data?.cartEvents, color:"orange" },
          { label:"Recovered", value:data?.recovered, color:"green" },
          { label:"Messages Sent", value:data?.messagesSent, color:"purple" },
        ].map(s=>(
          <div key={s.label} className="card p-4">
            <p className="text-2xl font-bold text-white">{loading?"…":(s.value||0).toLocaleString()}</p>
            <p className="text-xs text-slate-400 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Visitor & Cart Trends — Last {days} Days</h3>
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
              <XAxis dataKey="day" tick={{fill:"#64748b",fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:"#64748b",fontSize:10}} axisLine={false} tickLine={false}/>
              <Tooltip content={<CustomTooltip/>}/>
              <Area type="monotone" dataKey="visitors" name="Visitors" stroke="#22c55e" fill="url(#gV)" strokeWidth={2} dot={false}/>
              <Area type="monotone" dataKey="carts" name="Carts" stroke="#f97316" fill="url(#gC)" strokeWidth={2} dot={false}/>
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Campaign Performance</h3>
          {loading ? <div className="skeleton h-40 rounded-xl"/> : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data?.campaignPerf||[]} barSize={28}>
                <XAxis dataKey="name" tick={{fill:"#64748b",fontSize:10}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fill:"#64748b",fontSize:10}} axisLine={false} tickLine={false}/>
                <Tooltip content={<CustomTooltip/>}/>
                <Bar dataKey="total_sent" name="Sent" fill="#3b82f6" radius={[4,4,0,0]}/>
                <Bar dataKey="total_recovered" name="Recovered" fill="#22c55e" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Visitors by City</h3>
          {loading ? <div className="skeleton h-40 rounded-xl"/> : cityData.length===0 ? (
            <p className="text-slate-500 text-sm text-center py-8">No data yet</p>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie data={cityData} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={2}>
                    {cityData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {cityData.slice(0,5).map((c,i)=>(
                  <div key={c.name} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{background:COLORS[i%COLORS.length]}}/>
                    <span className="text-xs text-slate-300 flex-1 truncate">{c.name}</span>
                    <span className="text-xs text-slate-500">{c.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
