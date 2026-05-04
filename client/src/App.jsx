import React, { useState, useEffect, useCallback } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, X, Settings2, ExternalLink, MessageSquare } from "lucide-react";
import { io } from 'socket.io-client';
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
import Login      from "./pages/Login";
import Signup     from "./pages/Signup";

function isAuthenticated() {
  return !!localStorage.getItem('authToken');
}

function ProtectedRoute({ children }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

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
  const navigate = useNavigate();
  const [inboundNotif, setInboundNotif] = useState(null);
  const notifTimer = React.useRef(null);

  React.useEffect(() => {
    const _cid = localStorage.getItem('channelId');
    const CHANNEL_ID = (_cid && _cid !== 'undefined' && _cid !== 'null') ? _cid : '';
    const BASE = import.meta.env.VITE_API_URL || '';
    const s = io(BASE || 'http://localhost:3005', {
      query: { channelId: CHANNEL_ID },
      transports: ['websocket', 'polling'],
    });
    s.on('new_message', ({ message, conversation }) => {
      if (message?.direction !== 'in') return;
      setInboundNotif({
        name: conversation?.name || message.phone,
        phone: message.phone,
        text: message.text || '',
      });
      clearTimeout(notifTimer.current);
      notifTimer.current = setTimeout(() => setInboundNotif(null), 5000);
    });
    return () => { s.disconnect(); clearTimeout(notifTimer.current); };
  }, []);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#080d17' }}>
      <style>{`@keyframes shrink { from { width: 100%; } to { width: 0%; } }`}</style>
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
            <Route path="*"            element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>

      {credError && (
        <CredErrorPopup msg={credError} onClose={() => setCredError(null)} />
      )}

      {/* Inbound WhatsApp reply notification */}
      {inboundNotif && (
        <div className="fixed bottom-6 right-6 z-[9999] w-72 rounded-2xl shadow-2xl overflow-hidden"
          style={{ background: '#0f1f35', border: '1px solid rgba(99,102,241,0.3)' }}>
          <div className="px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(99,102,241,0.2)' }}>
                  <MessageSquare size={13} style={{ color: '#818cf8' }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-white truncate">💬 {inboundNotif.name}</p>
                  <p className="text-[9px] truncate" style={{ color: '#94a3b8' }}>"{inboundNotif.text.slice(0, 55)}{inboundNotif.text.length > 55 ? '…' : ''}"</p>
                </div>
              </div>
              <button onClick={() => setInboundNotif(null)} style={{ color: '#475569', flexShrink: 0 }}>
                <X size={13} />
              </button>
            </div>
            <button
              onClick={() => { setInboundNotif(null); navigate('/chat'); }}
              className="mt-2 w-full py-1.5 rounded-lg text-[9px] font-semibold transition-all"
              style={{ background: 'rgba(99,102,241,0.2)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}>
              View in Chat →
            </button>
          </div>
          {/* Auto-dismiss progress bar */}
          <div style={{ height: 2, background: 'rgba(99,102,241,0.15)' }}>
            <div style={{ height: '100%', background: '#818cf8', animation: 'shrink 5s linear forwards' }} />
          </div>
        </div>
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
      <Routes>
        {/* Public auth routes */}
        <Route path="/login"  element={isAuthenticated() ? <Navigate to="/dashboard" replace /> : <Login />} />
        <Route path="/signup" element={isAuthenticated() ? <Navigate to="/dashboard" replace /> : <Signup />} />

        {/* All other routes are protected */}
        <Route path="*" element={
          <ProtectedRoute>
            <AppLayout
              sidebarOpen={sidebarOpen}
              setSidebarOpen={setSidebarOpen}
              credError={credError}
              setCredError={setCredError}
            />
          </ProtectedRoute>
        } />
      </Routes>
    </BrowserRouter>
  );
}
