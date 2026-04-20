import React, { useState, useEffect, useCallback } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, X, Settings2, ExternalLink } from "lucide-react";
import Sidebar from "./components/Sidebar";
import Header  from "./components/Header";
import Dashboard  from "./pages/Dashboard";
import Visitors   from "./pages/Visitors";
import Campaigns  from "./pages/Campaigns";
import Templates  from "./pages/Templates";
import CartEvents from "./pages/CartEvents";
import Contacts   from "./pages/Contacts";
import Analytics  from "./pages/Analytics";
import Settings   from "./pages/Settings";
import Chat       from "./pages/Chat";
import Gallery    from "./pages/Gallery";

// ── Credential error keywords to intercept globally ──────────────────────────
const CRED_PATTERNS = [
  'whatsapp credentials not configured',
  'credentials not configured',
  'no credentials',
  'phone_number_id',
  'access_token',
  'waba_id',
  'invalid token',
  'token has expired',
  'session invalidated',
  'oauth exception',
  'invalid oauth',
];

function isCredError(msg = '') {
  const lower = msg.toLowerCase();
  return CRED_PATTERNS.some(p => lower.includes(p));
}

// ── Global credential error popup ────────────────────────────────────────────
function CredErrorPopup({ msg, onClose }) {
  const navigate = useNavigate();
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-[#0f1a2e] border border-red-500/30 rounded-2xl shadow-2xl max-w-md w-full p-6 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
            <AlertTriangle size={20} className="text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-semibold text-sm">WhatsApp Credentials Error</h3>
            <p className="text-slate-400 text-xs mt-0.5">Configuration issue detected</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* Error detail */}
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <p className="text-red-300 text-xs font-mono break-words">{msg}</p>
        </div>

        {/* What to check */}
        <div className="flex flex-col gap-1.5">
          <p className="text-slate-400 text-xs font-medium">Check these in Settings:</p>
          {[
            'WhatsApp Phone Number ID',
            'Permanent Access Token',
            'WhatsApp Business Account ID (WABA ID)',
          ].map(f => (
            <div key={f} className="flex items-center gap-2 text-xs text-slate-500">
              <div className="w-1 h-1 rounded-full bg-red-400 shrink-0" />
              {f}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => { onClose(); navigate('/settings'); }}
            className="flex items-center gap-2 flex-1 justify-center px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-all">
            <Settings2 size={14} /> Go to Settings
          </button>
          <button onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-400 text-sm transition-all">
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Patch global fetch to intercept credential errors ─────────────────────────
let _credErrorEmit = null;

function patchFetch() {
  const _origFetch = window.fetch;
  window.fetch = async function(...args) {
    const res = await _origFetch.apply(this, args);
    // Clone so body can be read without consuming the original
    const clone = res.clone();
    try {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json') && !res.ok) {
        const data = await clone.json();
        const errMsg = data?.error || data?.message || '';
        if (errMsg && isCredError(errMsg)) {
          _credErrorEmit?.(errMsg);
        }
      }
    } catch (_) {}
    return res;
  };
}

function PageWrapper({ children }) {
  return <div className="page-enter h-full">{children}</div>;
}

function AppLayout({ sidebarOpen, setSidebarOpen, credError, setCredError }) {
  const location = useLocation();
  const isChat = location.pathname === '/chat';

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#080d17' }}>
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(o => !o)} />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header onMenuToggle={() => setSidebarOpen(o => !o)} />

        <main
          key={location.pathname}
          className={`flex-1 min-w-0 ${isChat ? 'overflow-hidden' : 'overflow-y-auto'}`}
          style={isChat ? {} : { padding: '24px 28px' }}
        >
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard"   element={<PageWrapper><Dashboard/></PageWrapper>} />
            <Route path="/visitors"    element={<PageWrapper><Visitors/></PageWrapper>} />
            <Route path="/campaigns"   element={<PageWrapper><Campaigns/></PageWrapper>} />
            <Route path="/templates"   element={<PageWrapper><Templates/></PageWrapper>} />
            <Route path="/cart-events" element={<PageWrapper><CartEvents/></PageWrapper>} />
            <Route path="/contacts"    element={<PageWrapper><Contacts/></PageWrapper>} />
            <Route path="/analytics"   element={<PageWrapper><Analytics/></PageWrapper>} />
            <Route path="/settings"    element={<PageWrapper><Settings/></PageWrapper>} />
            <Route path="/chat"        element={<Chat/>} />
            <Route path="/gallery"     element={<PageWrapper><Gallery/></PageWrapper>} />
          </Routes>
        </main>
      </div>

      {credError && (
        <CredErrorPopup msg={credError} onClose={() => setCredError(null)} />
      )}
    </div>
  );
}

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [credError, setCredError]     = useState(null);

  useEffect(() => {
    _credErrorEmit = (msg) => setCredError(msg);
    patchFetch();
    return () => { _credErrorEmit = null; };
  }, []);

  return (
    <BrowserRouter>
      <AppLayout
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        credError={credError}
        setCredError={setCredError}
      />
    </BrowserRouter>
  );
}
