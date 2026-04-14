import React, { useEffect, useState } from "react";
import { useLocation, NavLink } from "react-router-dom";
import { Menu, Bell, Activity, ShoppingCart, MessageSquare, Users } from "lucide-react";
import { visitorsApi } from "../api";

const PAGE_META = {
  "/dashboard":   { title: "Dashboard",      sub: "Overview & key metrics" },
  "/visitors":    { title: "Live Visitors",   sub: "Real-time visitor tracking" },
  "/campaigns":   { title: "Campaigns",       sub: "WhatsApp automation flows" },
  "/templates":   { title: "Templates",       sub: "Meta-approved message templates" },
  "/cart-events": { title: "Cart Events",     sub: "Abandoned cart recovery" },
  "/contacts":    { title: "Contacts",        sub: "Identified user database" },
  "/analytics":   { title: "Analytics",       sub: "Deep behaviour intelligence" },
  "/settings":    { title: "Settings",        sub: "WhatsApp API & automation config" },
  "/chat":        { title: "Inbox",           sub: "WhatsApp conversations" },
  "/gallery":     { title: "My Gallery",      sub: "Media assets for templates" },
};

function Chip({ icon: Icon, label, value, color }) {
  const cfg = {
    green:  { bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.2)',  text: '#4ade80' },
    blue:   { bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.2)', text: '#60a5fa' },
    orange: { bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.2)', text: '#fb923c' },
    purple: { bg: 'rgba(168,85,247,0.08)', border: 'rgba(168,85,247,0.2)', text: '#c084fc' },
  }[color] || {};
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.text }}>
      {Icon && <Icon size={11}/>}
      <span>{label && <span className="opacity-60 mr-1">{label}</span>}{value}</span>
    </div>
  );
}

export default function Header({ onMenuToggle }) {
  const location = useLocation();
  const [stats,   setStats]   = useState(null);
  const [notifs,  setNotifs]  = useState(3);
  const meta = PAGE_META[location.pathname] || { title: "WhatsWay Pro", sub: "" };

  useEffect(() => {
    const load = () => visitorsApi.stats().then(setStats).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  return (
    <header
      className="h-14 flex items-center px-5 gap-4 shrink-0"
      style={{
        background: 'rgba(13,20,34,0.95)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.02)',
      }}
    >
      {/* Menu toggle */}
      <button onClick={onMenuToggle}
        className="w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-150"
        style={{ color: '#64748b' }}
        onMouseEnter={e=>{ e.currentTarget.style.color='#e2e8f0'; e.currentTarget.style.background='rgba(255,255,255,0.05)'; }}
        onMouseLeave={e=>{ e.currentTarget.style.color='#64748b'; e.currentTarget.style.background='transparent'; }}>
        <Menu size={18}/>
      </button>

      {/* Page title */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold text-white leading-none">{meta.title}</h1>
          {meta.sub && (
            <span className="hidden md:block text-[11px] text-slate-600 leading-none pt-px">/&nbsp;{meta.sub}</span>
          )}
        </div>
      </div>

      {/* Live stats chips */}
      {stats && (
        <div className="hidden lg:flex items-center gap-2">
          <Chip icon={Activity}      label="Live"    value={stats.active}     color="green"/>
          <Chip icon={MessageSquare} label="Sent"    value={stats.totalSent}  color="blue"/>
          <Chip icon={ShoppingCart}  label="Carts"   value={stats.cartEvents} color="orange"/>
          <Chip icon={Users}         label="Phones"  value={stats.withPhone || 0} color="purple"/>
        </div>
      )}

      {/* Notification bell */}
      <button
        className="relative w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-150"
        style={{ color: '#64748b' }}
        onMouseEnter={e=>{ e.currentTarget.style.color='#e2e8f0'; e.currentTarget.style.background='rgba(255,255,255,0.05)'; }}
        onMouseLeave={e=>{ e.currentTarget.style.color='#64748b'; e.currentTarget.style.background='transparent'; }}>
        <Bell size={17}/>
        {notifs > 0 && <span className="notif-dot"/>}
      </button>
    </header>
  );
}
