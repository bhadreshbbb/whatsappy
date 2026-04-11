import React, { useEffect, useState, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import {
  Search, Send, Phone, MoreVertical, Circle, Check, CheckCheck,
  MessageSquare, Filter, Image as ImageIcon, Smile, Users,
  Eye, EyeOff, MessageCircle, BellOff, Wifi, WifiOff,
  RefreshCw, ChevronDown, X, Paperclip,
} from "lucide-react";

const BASE = import.meta.env.VITE_API_URL || '';
const CHANNEL_ID = localStorage.getItem('channelId') || 'demo';

// ─── Socket singleton ─────────────────────────────────────────────────────────
let socket = null;
function getSocket() {
  if (!socket) {
    socket = io(BASE || 'http://localhost:3005', {
      query: { channelId: CHANNEL_ID },
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

// ─── API helpers ──────────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const r = await fetch(`${BASE}/api/chat${path}`, {
    headers: { 'Content-Type': 'application/json', 'x-channel-id': CHANNEL_ID, ...opts.headers },
    ...opts,
  });
  return r.json();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs  = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hrs  < 24) return `${hrs}h ago`;
  if (days < 7)  return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function msgTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso) {
  const d = new Date(iso);
  const today = new Date(); today.setHours(0,0,0,0);
  const yd = new Date(today); yd.setDate(yd.getDate() - 1);
  if (d >= today) return 'Today';
  if (d >= yd)    return 'Yesterday';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

function getInitials(name, phone) {
  if (name && name !== phone) return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
  return (phone || '?').slice(-2);
}

function hashColor(str) {
  const colors = ['#25D366','#128C7E','#075E54','#34B7F1','#00BFA5','#E91E63','#9C27B0','#3F51B5','#FF5722','#FF9800'];
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % colors.length;
  return colors[h];
}

// ─── Tick icon ────────────────────────────────────────────────────────────────
function Tick({ status }) {
  if (status === 'sending') return <Circle size={10} className="text-slate-500 animate-pulse"/>;
  if (status === 'sent')    return <Check size={12} className="text-slate-400"/>;
  if (status === 'delivered') return <CheckCheck size={12} className="text-slate-400"/>;
  if (status === 'seen')    return <CheckCheck size={12} className="text-blue-400"/>;
  return null;
}

// ─── FILTER TABS ─────────────────────────────────────────────────────────────
const FILTERS = [
  { id: '',           label: 'All',         icon: Users },
  { id: 'online',     label: 'Online',      icon: Wifi },
  { id: 'replied',    label: 'Replied',     icon: MessageCircle },
  { id: 'not_replied',label: 'No Reply',    icon: BellOff },
  { id: 'seen',       label: 'Seen',        icon: Eye },
  { id: 'not_seen',   label: 'Not Seen',    icon: EyeOff },
];

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ name, phone, size = 40, online = false }) {
  const initials = getInitials(name, phone);
  const color    = hashColor(phone || name || '');
  return (
    <div className="relative shrink-0">
      <div
        className="rounded-full flex items-center justify-center font-bold text-white"
        style={{ width: size, height: size, background: color, fontSize: size * 0.35 }}
      >
        {initials}
      </div>
      {online && (
        <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 border-2 border-[#111827] rounded-full"/>
      )}
    </div>
  );
}

// ─── Conversation row ─────────────────────────────────────────────────────────
function ConvRow({ conv, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left border-b border-white/[0.03]
        ${active ? 'bg-wapp/10 border-l-2 border-l-wapp' : 'hover:bg-white/[0.03]'}`}
    >
      <Avatar name={conv.name} phone={conv.phone} online={conv.is_online}/>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center">
          <span className="text-sm font-semibold text-white truncate">{conv.name || conv.phone}</span>
          <span className="text-[10px] text-slate-500 shrink-0 ml-2">{timeAgo(conv.last_message_at)}</span>
        </div>
        <div className="flex justify-between items-center mt-0.5">
          <p className="text-xs text-slate-500 truncate flex items-center gap-1">
            {conv.last_message_direction === 'out' && <Tick status="delivered"/>}
            {conv.last_message || <span className="italic text-slate-600">No messages yet</span>}
          </p>
          {conv.unread_count > 0 && (
            <span className="ml-2 shrink-0 w-5 h-5 rounded-full bg-wapp text-white text-[10px] font-bold flex items-center justify-center">
              {conv.unread_count > 9 ? '9+' : conv.unread_count}
            </span>
          )}
        </div>
        <div className="flex gap-1 mt-1 flex-wrap">
          {conv.is_online    && <span className="text-[8px] bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded-full border border-green-500/20">Online</span>}
          {conv.has_replied  && <span className="text-[8px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded-full border border-blue-500/20">Replied</span>}
          {conv.has_seen     && <span className="text-[8px] bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded-full border border-purple-500/20">Seen</span>}
        </div>
      </div>
    </button>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg, prevMsg }) {
  const isOut    = msg.direction === 'out';
  const showDate = !prevMsg || formatDate(msg.timestamp) !== formatDate(prevMsg.timestamp);
  const isCampaign = isOut && msg.campaign_name;

  return (
    <>
      {showDate && (
        <div className="flex justify-center my-4">
          <span className="bg-[#1f2c34] text-slate-400 text-[10px] px-3 py-1 rounded-full border border-white/5">
            {formatDate(msg.timestamp)}
          </span>
        </div>
      )}
      <div className={`flex ${isOut ? 'justify-end' : 'justify-start'} mb-1`}>
        <div className="flex flex-col items-end max-w-[72%]">
          {isCampaign && (
            <span className="text-[8px] text-wapp/70 mb-0.5 mr-1">
              📢 {msg.campaign_name}{msg.template_name ? ` · ${msg.template_name}` : ''}
            </span>
          )}
          <div
            className={`relative px-3 py-2 rounded-xl shadow-sm text-[13px] leading-relaxed w-full
              ${isOut
                ? 'bg-[#005c4b] text-white rounded-tr-none'
                : 'bg-[#1f2c34] text-[#e9edef] rounded-tl-none'
              }`}
          >
            {msg.media_url && (
              <img src={msg.media_url} className="rounded-lg max-w-[240px] mb-1.5 object-cover" alt="media"/>
            )}
            <p className="whitespace-pre-wrap break-words">{msg.text}</p>
            <div className={`flex items-center gap-1 mt-0.5 ${isOut ? 'justify-end' : 'justify-start'}`}>
              <span className="text-[9px] text-white/40">{msgTime(msg.timestamp)}</span>
              {isOut && <Tick status={msg.status}/>}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyChat() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-[#0b141a] wa-bg-pattern">
      <div className="w-24 h-24 rounded-3xl bg-wapp/10 flex items-center justify-center mb-6 border border-wapp/20">
        <MessageSquare size={40} className="text-wapp/60"/>
      </div>
      <h3 className="text-xl font-bold text-white mb-2">WhatsApp Inbox</h3>
      <p className="text-slate-500 text-sm text-center max-w-xs">
        Select a conversation on the left to view messages and reply to customers.
      </p>
    </div>
  );
}

// ─── Simulate modal ───────────────────────────────────────────────────────────
function SimulateModal({ conversations, onClose, onSent }) {
  const [phone, setPhone] = useState('');
  const [name, setName]   = useState('');
  const [text, setText]   = useState('');
  const [busy, setBusy]   = useState(false);

  const send = async () => {
    if (!phone || !text) return;
    setBusy(true);
    await api('/simulate', { method: 'POST', body: JSON.stringify({ phone, name, text }) });
    setBusy(false);
    onSent();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#0d1424] border border-white/10 rounded-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-white">Simulate Incoming Message</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={18}/></button>
        </div>
        <div>
          <label className="label">Customer Phone</label>
          <select className="input" value={phone} onChange={e => setPhone(e.target.value)}>
            <option value="">Select or type...</option>
            {conversations.map(c => (
              <option key={c.phone} value={c.phone}>{c.name || c.phone} — {c.phone}</option>
            ))}
          </select>
          <input className="input mt-2" placeholder="Or enter phone..." value={phone} onChange={e => setPhone(e.target.value)}/>
        </div>
        <div>
          <label className="label">Name (optional)</label>
          <input className="input" placeholder="Customer name" value={name} onChange={e => setName(e.target.value)}/>
        </div>
        <div>
          <label className="label">Message</label>
          <textarea className="input min-h-[80px]" placeholder="Type incoming message..." value={text} onChange={e => setText(e.target.value)}/>
        </div>
        <button onClick={send} disabled={busy || !phone || !text} className="btn-primary w-full justify-center">
          {busy ? 'Sending...' : '📩 Simulate Receive'}
        </button>
      </div>
    </div>
  );
}

// ─── Main Chat Component ──────────────────────────────────────────────────────
export default function Chat() {
  const [conversations, setConversations] = useState([]);
  const [activePhone,   setActivePhone]   = useState(null);
  const [messages,      setMessages]      = useState([]);
  const [filter,        setFilter]        = useState('');
  const [search,        setSearch]        = useState('');
  const [inputText,     setInputText]     = useState('');
  const [sending,       setSending]       = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [connected,     setConnected]     = useState(false);
  const [showSimulate,  setShowSimulate]  = useState(false);
  const [sidebarWidth]                    = useState(320);

  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);
  const sock           = useRef(null);

  // Auto scroll
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Load conversations
  const loadConversations = useCallback(async () => {
    const params = new URLSearchParams();
    if (filter) params.set('filter', filter);
    if (search) params.set('search', search);
    const data = await api(`/conversations?${params}`);
    setConversations(Array.isArray(data) ? data : []);
  }, [filter, search]);

  // Load messages for active conversation
  const loadMessages = useCallback(async (phone) => {
    if (!phone) return;
    setLoading(true);
    const data = await api(`/messages/${encodeURIComponent(phone)}`);
    setMessages(Array.isArray(data) ? data : []);
    setLoading(false);
    // Update unread to 0
    setConversations(prev => prev.map(c => c.phone === phone ? { ...c, unread_count: 0 } : c));
    setTimeout(scrollToBottom, 100);
  }, [scrollToBottom]);

  // Socket.io setup
  useEffect(() => {
    const s = getSocket();
    sock.current = s;

    s.on('connect',    () => setConnected(true));
    s.on('disconnect', () => setConnected(false));

    s.on('new_message', ({ message, conversation }) => {
      // Update conversation list
      setConversations(prev => {
        const exists = prev.find(c => c.phone === conversation.phone);
        if (exists) return prev.map(c => c.phone === conversation.phone ? { ...conversation } : c);
        return [conversation, ...prev];
      });
      // If this convo is active, add message
      setActivePhone(active => {
        if (active === message.phone) {
          setMessages(msgs => [...msgs, message]);
          // Mark as seen since it's open
          api(`/messages/${encodeURIComponent(message.phone)}/seen`, { method: 'POST' });
          setTimeout(scrollToBottom, 50);
        }
        return active;
      });
    });

    s.on('message_status', ({ wamid, status, phone }) => {
      // match by wamid OR by local id (for optimistic messages)
      setMessages(msgs => msgs.map(m =>
        (m.wamid && m.wamid === wamid) || m.id === wamid ? { ...m, status } : m
      ));
    });

    s.on('messages_seen', ({ phone }) => {
      setMessages(msgs => msgs.map(m => m.direction === 'out' ? { ...m, status: 'seen' } : m));
    });

    s.on('user_status', ({ phone, is_online }) => {
      setConversations(prev => prev.map(c => c.phone === phone ? { ...c, is_online } : c));
    });

    return () => {
      s.off('new_message');
      s.off('message_status');
      s.off('messages_seen');
      s.off('user_status');
    };
  }, [scrollToBottom]);

  // Load conversations on mount + filter change
  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Load messages when active convo changes
  useEffect(() => { loadMessages(activePhone); }, [activePhone, loadMessages]);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // Send message
  const sendMessage = async () => {
    if (!inputText.trim() || !activePhone || sending) return;
    const text = inputText.trim();
    setInputText('');
    setSending(true);

    // Optimistic add
    const tempMsg = {
      id: `temp_${Date.now()}`,
      phone: activePhone,
      direction: 'out',
      type: 'text',
      text,
      timestamp: new Date().toISOString(),
      status: 'sending',
    };
    setMessages(prev => [...prev, tempMsg]);
    scrollToBottom();

    try {
      const saved = await api(`/messages/${encodeURIComponent(activePhone)}`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      // Replace temp with saved
      setMessages(prev => prev.map(m => m.id === tempMsg.id ? saved : m));
      // Update conversation last message
      setConversations(prev => prev.map(c =>
        c.phone === activePhone
          ? { ...c, last_message: text, last_message_at: saved.timestamp, last_message_direction: 'out' }
          : c
      ));
    } catch (e) {
      setMessages(prev => prev.map(m => m.id === tempMsg.id ? { ...m, status: 'failed' } : m));
    }
    setSending(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const activeConv = conversations.find(c => c.phone === activePhone);

  return (
    <div className="flex h-full -m-6 overflow-hidden rounded-none" style={{ height: 'calc(100vh - 64px)' }}>

      {/* ── Left Sidebar ─────────────────────────────────────────── */}
      <div className="flex flex-col bg-[#111827] border-r border-white/5" style={{ width: sidebarWidth, minWidth: sidebarWidth }}>

        {/* Header */}
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-wapp flex items-center justify-center">
              <MessageSquare size={15} className="text-white"/>
            </div>
            <div>
              <p className="text-sm font-bold text-white">Inbox</p>
              <p className="text-[10px] text-slate-500">{conversations.length} conversations</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} title={connected ? 'Live' : 'Disconnected'}/>
            <button onClick={loadConversations} className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white" title="Refresh">
              <RefreshCw size={14}/>
            </button>
            <button onClick={() => setShowSimulate(true)} className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-wapp" title="Simulate incoming message">
              <MessageCircle size={14}/>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-white/5">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/>
            <input
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-wapp/40"
              placeholder="Search by name or phone…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 px-3 py-2 overflow-x-auto scrollbar-hide border-b border-white/5">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border
                ${filter === f.id
                  ? 'bg-wapp/15 border-wapp/40 text-wapp'
                  : 'border-white/5 text-slate-500 hover:text-slate-300 hover:bg-white/5'
                }`}
            >
              <f.icon size={10}/>
              {f.label}
            </button>
          ))}
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 && (
            <div className="py-16 px-6 text-center">
              <MessageSquare size={32} className="text-slate-700 mx-auto mb-3"/>
              <p className="text-slate-600 text-sm">No conversations yet</p>
              <p className="text-slate-700 text-xs mt-1">
                {filter ? `No users match "${FILTERS.find(f=>f.id===filter)?.label}" filter` : 'Start by receiving a WhatsApp message'}
              </p>
            </div>
          )}
          {conversations.map(conv => (
            <ConvRow
              key={conv.phone}
              conv={conv}
              active={activePhone === conv.phone}
              onClick={() => setActivePhone(conv.phone)}
            />
          ))}
        </div>
      </div>

      {/* ── Right Chat Window ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {!activePhone ? (
          <EmptyChat/>
        ) : (
          <>
            {/* Chat top bar */}
            <div className="flex items-center gap-3 px-5 py-3 bg-[#1f2c34] border-b border-white/5">
              <Avatar name={activeConv?.name} phone={activePhone} size={38} online={activeConv?.is_online}/>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{activeConv?.name || activePhone}</p>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 truncate">{activePhone}</span>
                  {activeConv?.is_online
                    ? <span className="text-[10px] text-green-400 font-medium">● online</span>
                    : activeConv?.last_seen
                      ? <span className="text-[10px] text-slate-500">last seen {timeAgo(activeConv.last_seen)}</span>
                      : null
                  }
                </div>
              </div>
              <div className="flex items-center gap-1">
                {activeConv?.has_replied  && <span className="text-[9px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/20">Replied</span>}
                {activeConv?.has_seen     && <span className="text-[9px] bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded-full border border-purple-500/20">Has Seen</span>}
                <button className="p-2 hover:bg-white/5 rounded-lg text-slate-500 hover:text-white"><MoreVertical size={16}/></button>
              </div>
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto p-4 bg-[#0b141a] wa-bg-pattern space-y-0.5">
              {loading && (
                <div className="flex justify-center pt-8">
                  <div className="w-6 h-6 border-2 border-wapp/40 border-t-wapp rounded-full animate-spin"/>
                </div>
              )}
              {!loading && messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center pt-12">
                  <MessageSquare size={40} className="text-slate-700 mb-3"/>
                  <p className="text-slate-600 text-sm">No messages yet</p>
                  <p className="text-slate-700 text-xs mt-1">Send the first message to this customer</p>
                </div>
              )}
              {messages.map((msg, i) => (
                <MessageBubble key={msg.id} msg={msg} prevMsg={messages[i - 1]}/>
              ))}
              <div ref={messagesEndRef}/>
            </div>

            {/* Input bar */}
            <div className="flex items-end gap-2 px-4 py-3 bg-[#1f2c34] border-t border-white/5">
              <button className="p-2 text-slate-500 hover:text-white rounded-full hover:bg-white/5 shrink-0">
                <Smile size={20}/>
              </button>
              <button className="p-2 text-slate-500 hover:text-white rounded-full hover:bg-white/5 shrink-0">
                <Paperclip size={20}/>
              </button>
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  className="w-full bg-[#2a3942] border border-white/10 rounded-2xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-wapp/50 resize-none max-h-32"
                  placeholder="Type a message…"
                  rows={1}
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  style={{ overflowY: inputText.split('\n').length > 3 ? 'auto' : 'hidden' }}
                />
              </div>
              <button
                onClick={sendMessage}
                disabled={!inputText.trim() || sending}
                className="p-2.5 bg-wapp hover:bg-wapp-dark disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-full shrink-0 transition-all active:scale-95"
              >
                <Send size={18}/>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Simulate modal */}
      {showSimulate && (
        <SimulateModal
          conversations={conversations}
          onClose={() => setShowSimulate(false)}
          onSent={loadConversations}
        />
      )}
    </div>
  );
}
