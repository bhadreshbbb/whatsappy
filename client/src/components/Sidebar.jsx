import React from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, Users, Megaphone, FileText,
  ShoppingCart, BookUser, BarChart3, Settings,
  MessageSquare, ChevronLeft, ChevronRight, Zap, ImagePlus,
} from "lucide-react";

const NAV = [
  { to: "/dashboard",   icon: LayoutDashboard, label: "Dashboard",    color: "#25D366" },
  { to: "/chat",        icon: MessageSquare,   label: "Inbox",        color: "#3b82f6" },
  { to: "/visitors",    icon: Users,           label: "Live Visitors",color: "#06b6d4" },
  { to: "/campaigns",   icon: Megaphone,       label: "Campaigns",    color: "#f97316" },
  { to: "/templates",   icon: FileText,        label: "Templates",    color: "#a855f7" },
  { to: "/gallery",     icon: ImagePlus,       label: "My Gallery",   color: "#ec4899" },
  { to: "/cart-events", icon: ShoppingCart,    label: "Cart Events",  color: "#f59e0b" },
  { to: "/contacts",    icon: BookUser,        label: "Contacts",     color: "#22c55e" },
  { to: "/analytics",   icon: BarChart3,       label: "Analytics",    color: "#818cf8" },
  { to: "/settings",    icon: Settings,        label: "Settings",     color: "#64748b" },
];

export default function Sidebar({ open, onToggle }) {
  return (
    <aside
      className="flex flex-col shrink-0 relative z-20"
      style={{
        width: open ? 240 : 68,
        background: 'linear-gradient(180deg, #0c1220 0%, #080d17 100%)',
        borderRight: '1px solid rgba(255,255,255,0.055)',
        transition: 'width 0.3s cubic-bezier(0.4,0,0.2,1)',
        boxShadow: open ? '4px 0 24px rgba(0,0,0,0.3)' : 'none',
      }}
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-4 gap-3 overflow-hidden shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: 'linear-gradient(135deg, #25D366, #128C7E)',
            boxShadow: '0 0 16px rgba(37,211,102,0.35)',
          }}>
          <MessageSquare size={17} className="text-white" />
        </div>
        {open && (
          <div style={{ animation: 'fadeIn 0.2s ease both' }}>
            <p className="text-sm font-bold text-white leading-tight whitespace-nowrap">WhatsWay Pro</p>
            <p className="text-[10px] whitespace-nowrap" style={{ color: '#25D366', opacity: 0.7 }}>Marketing Suite</p>
          </div>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-3 px-2 flex flex-col gap-0.5 overflow-hidden overflow-y-auto">
        {NAV.map(({ to, icon: Icon, label, color }) => (
          <NavLink
            key={to}
            to={to}
            title={!open ? label : undefined}
            className={({ isActive }) =>
              `nav-link group ${isActive ? 'active' : ''} ${!open ? 'justify-center px-0' : ''}`
            }
          >
            {({ isActive }) => (
              <>
                <div className="relative shrink-0 flex items-center justify-center"
                  style={{ width: 22, height: 22 }}>
                  <Icon size={18}
                    style={{
                      color: isActive ? color : undefined,
                      transition: 'color 0.15s',
                    }}
                  />
                </div>
                {open && (
                  <span className="whitespace-nowrap text-sm leading-none"
                    style={{ animation: 'fadeIn 0.15s ease both' }}>
                    {label}
                  </span>
                )}
                {/* Active left bar indicator */}
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r"
                    style={{ background: color, boxShadow: `0 0 8px ${color}` }}/>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Automation status chip */}
      {open && (
        <div className="mx-2 mb-3 px-3 py-2.5 rounded-xl overflow-hidden"
          style={{
            background: 'rgba(37,211,102,0.06)',
            border: '1px solid rgba(37,211,102,0.14)',
            animation: 'fadeIn 0.2s ease both',
          }}>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="w-1.5 h-1.5 rounded-full live-dot" style={{ background: '#25D366' }}/>
            <span className="text-xs font-semibold" style={{ color: '#25D366' }}>Automation Active</span>
          </div>
          <p className="text-[10px]" style={{ color: '#64748b' }}>Cron runs every 5 min</p>
        </div>
      )}

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="h-11 flex items-center justify-center transition-all duration-150 shrink-0"
        style={{
          borderTop: '1px solid rgba(255,255,255,0.05)',
          color: '#475569',
        }}
        onMouseEnter={e => e.currentTarget.style.color = '#e2e8f0'}
        onMouseLeave={e => e.currentTarget.style.color = '#475569'}
      >
        {open
          ? <ChevronLeft size={16}/>
          : <ChevronRight size={16}/>
        }
      </button>
    </aside>
  );
}
