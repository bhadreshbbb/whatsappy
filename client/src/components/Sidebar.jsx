import React from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, Users, Megaphone, FileText,
  ShoppingCart, BookUser, BarChart3, Settings,
  MessageSquare, ChevronLeft, ChevronRight, Zap, Images,
} from "lucide-react";

const NAV = [
  { to: "/dashboard",   icon: LayoutDashboard,  label: "Dashboard" },
  { to: "/chat",        icon: MessageSquare,     label: "Inbox" },
  { to: "/visitors",    icon: Users,             label: "Live Visitors" },
  { to: "/campaigns",   icon: Megaphone,         label: "Campaigns" },
  { to: "/templates",   icon: FileText,          label: "Templates" },
  { to: "/gallery",     icon: Images,            label: "My Gallery" },
  { to: "/cart-events", icon: ShoppingCart,      label: "Cart Events" },
  { to: "/contacts",    icon: BookUser,          label: "Contacts" },
  { to: "/analytics",  icon: BarChart3,          label: "Analytics" },
  { to: "/settings",   icon: Settings,           label: "Settings" },
];

export default function Sidebar({ open, onToggle }) {
  return (
    <aside
      className="flex flex-col border-r border-white/5 bg-[#0d1422] transition-all duration-300 ease-in-out shrink-0"
      style={{ width: open ? 240 : 64 }}
    >
      <div className="h-16 flex items-center px-4 border-b border-white/5 gap-3 overflow-hidden">
        <div className="w-8 h-8 bg-wapp rounded-xl flex items-center justify-center shrink-0">
          <MessageSquare size={16} className="text-white" />
        </div>
        {open && (
          <div className="overflow-hidden">
            <p className="text-sm font-bold text-white whitespace-nowrap">WhatsWay Pro</p>
            <p className="text-xs text-slate-500 whitespace-nowrap">Marketing Automation</p>
          </div>
        )}
      </div>

      <nav className="flex-1 py-4 px-2 flex flex-col gap-1 overflow-hidden">
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `nav-link ${isActive ? "active" : ""} ${!open ? "justify-center" : ""}`
            }
            title={!open ? label : undefined}
          >
            <Icon size={18} className="shrink-0" />
            {open && <span className="whitespace-nowrap text-sm">{label}</span>}
          </NavLink>
        ))}

        {open && (
          <div className="mt-4 mx-1 p-3 bg-wapp/5 rounded-xl border border-wapp/15">
            <div className="flex items-center gap-2 mb-1">
              <Zap size={14} className="text-wapp" />
              <span className="text-xs font-semibold text-wapp">Automation ON</span>
            </div>
            <p className="text-xs text-slate-500">Cron runs every 5 min</p>
          </div>
        )}
      </nav>

      <button
        onClick={onToggle}
        className="h-10 flex items-center justify-center border-t border-white/5 text-slate-500 hover:text-white hover:bg-white/5 transition-colors"
      >
        {open ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
      </button>
    </aside>
  );
}
