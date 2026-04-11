import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Menu, Bell, RefreshCw } from "lucide-react";
import { visitorsApi } from "../api";

const PAGE_TITLES = {
  "/dashboard": "Dashboard",
  "/visitors": "Live Visitors",
  "/campaigns": "Campaigns",
  "/templates": "Templates",
  "/cart-events": "Cart Events",
  "/contacts": "Contacts",
  "/analytics": "Analytics",
  "/settings": "Settings",
};

export default function Header({ onMenuToggle }) {
  const location = useLocation();
  const [stats, setStats] = useState(null);
  const title = PAGE_TITLES[location.pathname] || "WhatsWay Pro";

  useEffect(() => {
    const load = () => visitorsApi.stats().then(setStats).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="h-16 border-b border-white/5 bg-[#0d1422] flex items-center px-6 gap-4 shrink-0">
      <button
        onClick={onMenuToggle}
        className="text-slate-400 hover:text-white transition-colors"
      >
        <Menu size={20} />
      </button>

      <div className="flex-1">
        <h1 className="text-base font-semibold text-white">{title}</h1>
      </div>

      {stats && (
        <div className="hidden md:flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 px-3 py-1.5 rounded-full">
            <span className="w-2 h-2 rounded-full bg-green-500 live-dot" />
            <span className="text-xs font-semibold text-green-400">{stats.active} Live</span>
          </div>
          <div className="flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 rounded-full">
            <span className="text-xs font-semibold text-blue-400">{stats.totalSent} Sent</span>
          </div>
          <div className="flex items-center gap-1.5 bg-orange-500/10 border border-orange-500/20 px-3 py-1.5 rounded-full">
            <span className="text-xs font-semibold text-orange-400">{stats.cartEvents} Carts</span>
          </div>
        </div>
      )}

      <button className="text-slate-400 hover:text-white transition-colors relative">
        <Bell size={18} />
      </button>
    </header>
  );
}
