import React, { useState } from "react";
import {
  Globe, Eye, ShoppingCart, Package, Star, MessageSquare,
  CheckCircle, ArrowDown, ArrowRight, Zap, Clock, Users,
  TrendingUp, Gift, Home, Phone, Bell, Activity, Shield,
  RefreshCw, ChevronRight, Info, ShoppingBag,
} from "lucide-react";

// ─── Design tokens ────────────────────────────────────────────────────────────
const FLOWS = {
  visit:    { label: "Website Visit",       color: "#a855f7", bg: "rgba(168,85,247,0.12)", border: "rgba(168,85,247,0.35)", badge: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
  product:  { label: "Product View",        color: "#3b82f6", bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.35)", badge: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  cart:     { label: "Abandoned Cart",      color: "#f97316", bg: "rgba(249,115,22,0.12)", border: "rgba(249,115,22,0.35)", badge: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
  upsell:   { label: "Post-Cart Upsell",    color: "#ec4899", bg: "rgba(236,72,153,0.12)", border: "rgba(236,72,153,0.35)", badge: "bg-pink-500/20 text-pink-300 border-pink-500/30" },
  purchase: { label: "Post-Purchase",       color: "#22c55e", bg: "rgba(34,197,94,0.12)",  border: "rgba(34,197,94,0.35)",  badge: "bg-green-500/20 text-green-300 border-green-500/30" },
};

// ─── Reusable primitives ──────────────────────────────────────────────────────
function Arrow({ dir = "down", color = "#475569", size = 24 }) {
  if (dir === "right")
    return (
      <div className="flex items-center justify-center" style={{ color }}>
        <ArrowRight size={size} strokeWidth={2} />
      </div>
    );
  return (
    <div className="flex items-center justify-center py-1" style={{ color }}>
      <ArrowDown size={size} strokeWidth={2} />
    </div>
  );
}

function MsgBadge({ n, color }) {
  return (
    <span
      className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-black"
      style={{ background: color + "30", color, border: `1px solid ${color}50` }}
    >
      {n}
    </span>
  );
}

function StepBubble({ icon: Icon, label, sub, flow, pulse = false }) {
  const f = FLOWS[flow];
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-2xl border backdrop-blur-sm"
      style={{ background: f.bg, borderColor: f.border, boxShadow: `0 0 20px ${f.color}15` }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 relative"
        style={{ background: f.color + "25", border: `1.5px solid ${f.color}50` }}
      >
        <Icon size={18} style={{ color: f.color }} />
        {pulse && (
          <span
            className="absolute -top-1 -right-1 w-3 h-3 rounded-full animate-ping"
            style={{ background: f.color }}
          />
        )}
      </div>
      <div>
        <p className="text-sm font-bold text-white leading-tight">{label}</p>
        {sub && <p className="text-[10px] mt-0.5" style={{ color: f.color + "cc" }}>{sub}</p>}
      </div>
    </div>
  );
}

function MsgSequence({ flow, messages, gap, maxMsgs }) {
  const f = FLOWS[flow];
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {messages.map((txt, i) => (
        <React.Fragment key={i}>
          <div
            className="flex flex-col items-center gap-1"
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-black relative"
              style={{ background: f.color + "25", border: `1.5px solid ${f.color}60`, color: f.color }}
            >
              {i + 1}
              <MessageSquare size={8} className="absolute -bottom-0.5 -right-0.5" style={{ color: f.color }} />
            </div>
            <span className="text-[8px] text-slate-500 text-center w-14 leading-tight">{txt}</span>
          </div>
          {i < messages.length - 1 && (
            <div className="flex flex-col items-center gap-0.5 mb-4">
              <ArrowRight size={12} style={{ color: f.color + "80" }} />
              <span className="text-[8px]" style={{ color: f.color + "80" }}>{gap}</span>
            </div>
          )}
        </React.Fragment>
      ))}
      <div className="ml-2 flex flex-col items-center gap-1 mb-4">
        <span className="text-[8px] text-slate-500">max</span>
        <span className="text-xs font-black" style={{ color: f.color }}>{maxMsgs}</span>
        <span className="text-[8px] text-slate-500">msgs</span>
      </div>
    </div>
  );
}

function FlowCard({ flow, icon: Icon, title, trigger, messages, gap, maxMsgs, outcome, outcomeColor, content }) {
  const [open, setOpen] = useState(false);
  const f = FLOWS[flow];
  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ background: f.bg, borderColor: f.border, boxShadow: `0 4px 30px ${f.color}15` }}
    >
      {/* Header */}
      <div
        className="px-5 py-4 flex items-center gap-3 cursor-pointer"
        onClick={() => setOpen(o => !o)}
        style={{ borderBottom: open ? `1px solid ${f.border}` : 'none' }}
      >
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: f.color + "30", border: `1.5px solid ${f.color}60` }}
        >
          <Icon size={20} style={{ color: f.color }} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-black text-white">{title}</p>
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${f.badge}`}>
              FLOW
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">Trigger: {trigger}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-center">
            <p className="text-lg font-black" style={{ color: f.color }}>{maxMsgs}</p>
            <p className="text-[8px] text-slate-500 uppercase tracking-wide">msgs max</p>
          </div>
          <ChevronRight
            size={16} className="text-slate-500 transition-transform duration-200"
            style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
          />
        </div>
      </div>

      {/* Expanded body */}
      {open && (
        <div className="px-5 py-4 space-y-4">
          {/* Message sequence */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-3">Message Sequence</p>
            <MsgSequence flow={flow} messages={messages} gap={gap} maxMsgs={maxMsgs} />
          </div>

          {/* Content */}
          <div className="p-3 rounded-xl" style={{ background: f.color + "10", border: `1px solid ${f.color}20` }}>
            <p className="text-[10px] uppercase tracking-widest mb-1 font-bold" style={{ color: f.color }}>Message Content</p>
            <p className="text-xs text-slate-300">{content}</p>
          </div>

          {/* Outcome */}
          <div className="flex items-center gap-2 p-3 rounded-xl bg-black/20 border border-white/5">
            <CheckCircle size={14} style={{ color: outcomeColor }} />
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">After {maxMsgs} messages</p>
              <p className="text-xs font-bold" style={{ color: outcomeColor }}>{outcome}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusPill({ label, color, icon: Icon }) {
  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-bold"
      style={{ background: color + "15", borderColor: color + "40", color }}
    >
      <Icon size={11} />
      {label}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function FlowDiagram() {
  const [activeTab, setActiveTab] = useState("journey");

  return (
    <div className="space-y-6 pb-10">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Activity size={22} className="text-wapp" />
            User Journey & Automation Flows
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Full diagram — from first website visit to last WhatsApp message
          </p>
        </div>
        <div className="flex gap-1 p-1 bg-white/5 rounded-xl border border-white/10">
          {[["journey","Journey Map"],["flows","All Flows"],["limits","Message Limits"]].map(([id,label]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all
                ${activeTab===id ? "bg-wapp text-white shadow" : "text-slate-400 hover:text-white"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════ TAB: Journey Map */}
      {activeTab === "journey" && (
        <div className="space-y-4">

          {/* STEP 1 — Visit */}
          <div className="relative">
            <div className="absolute left-6 top-0 bottom-0 w-px bg-gradient-to-b from-purple-500/60 to-blue-500/60" style={{zIndex:0}}/>
            <div className="relative z-10 space-y-2 pl-16">
              <div className="absolute left-0 top-2 w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg shadow-purple-500/30">
                <Globe size={22} className="text-white"/>
              </div>
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Step 1</p>
              <h3 className="text-lg font-black text-white">User visits your website</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { icon: Globe,       label: "Page URL tracked",       color: "#a855f7" },
                  { icon: Home,        label: "City / Country via IP",   color: "#3b82f6" },
                  { icon: Phone,       label: "Device detected",         color: "#06b6d4" },
                  { icon: Activity,    label: "Session ID created",      color: "#22c55e" },
                ].map(({ icon: Icon, label, color }) => (
                  <div key={label} className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <Icon size={14} style={{ color }} />
                    <span className="text-xs text-slate-300">{label}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-slate-500">Status set to</span>
                <StatusPill label="active" color="#a855f7" icon={Activity}/>
              </div>
            </div>
          </div>

          <Arrow dir="down" color="#475569" />

          {/* STEP 2 — Phone */}
          <div className="relative">
            <div className="absolute left-6 top-0 bottom-0 w-px bg-gradient-to-b from-blue-500/60 to-orange-500/60" style={{zIndex:0}}/>
            <div className="relative z-10 space-y-2 pl-16">
              <div className="absolute left-0 top-2 w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/30">
                <Phone size={22} className="text-white"/>
              </div>
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Step 2 — Critical Gate</p>
              <h3 className="text-lg font-black text-white">User gives phone number</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                  <div className="flex items-center gap-2 mb-1"><CheckCircle size={13} className="text-green-400"/><span className="text-xs font-bold text-green-400">Phone given ✓</span></div>
                  <p className="text-[10px] text-slate-400">Session linked to phone. Automation can now send WhatsApp messages.</p>
                </div>
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                  <div className="flex items-center gap-2 mb-1"><Shield size={13} className="text-red-400"/><span className="text-xs font-bold text-red-400">No phone = No messages</span></div>
                  <p className="text-[10px] text-slate-400">Anonymous visitors are tracked but never receive any WhatsApp messages.</p>
                </div>
              </div>
            </div>
          </div>

          <Arrow dir="down" color="#475569" />

          {/* STEP 3 — Action branches */}
          <div className="space-y-2 pl-0">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold text-center">Step 3 — What the user does next</p>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {[
                { icon: Home,        label: "Browses home / listing",     sub: "No product viewed",       flow: "visit",    status: "active" },
                { icon: Eye,         label: "Views a product",            sub: "Doesn't add to cart",     flow: "product",  status: "product_view" },
                { icon: ShoppingCart,label: "Adds to cart",               sub: "Leaves without buying",   flow: "cart",     status: "abandoned_cart" },
                { icon: ShoppingBag, label: "Starts checkout",            sub: "Abandons at payment",     flow: "cart",     status: "abandoned_cart" },
                { icon: CheckCircle, label: "Completes purchase",         sub: "Successful order",        flow: "purchase", status: "purchased" },
              ].map(({ icon: Icon, label, sub, flow, status }) => {
                const f = FLOWS[flow];
                return (
                  <div key={label} className="rounded-2xl border p-3 flex flex-col gap-2"
                    style={{ background: f.bg, borderColor: f.border }}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center mx-auto"
                      style={{ background: f.color+"25", border:`1.5px solid ${f.color}50` }}>
                      <Icon size={16} style={{ color: f.color }}/>
                    </div>
                    <p className="text-xs font-bold text-white text-center leading-tight">{label}</p>
                    <p className="text-[9px] text-slate-400 text-center">{sub}</p>
                    <div className="mt-auto flex justify-center">
                      <span className="text-[8px] font-bold px-2 py-0.5 rounded-full border"
                        style={{ color: f.color, borderColor: f.color+"40", background: f.color+"15" }}>
                        status: {status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <Arrow dir="down" color="#475569" />

          {/* STEP 4 — Automation engine */}
          <div className="p-4 rounded-2xl border border-wapp/30 bg-wapp/5 flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-wapp/20 flex items-center justify-center shrink-0 border border-wapp/30">
              <Zap size={26} className="text-wapp"/>
            </div>
            <div className="flex-1">
              <p className="font-black text-white text-base">Automation Engine</p>
              <p className="text-xs text-slate-400 mt-0.5">Runs every <span className="text-wapp font-bold">60 seconds</span>. Finds users whose event is older than the campaign's delay setting, and haven't received this stage yet.</p>
            </div>
            <div className="flex flex-col items-center gap-1 shrink-0">
              <RefreshCw size={20} className="text-wapp animate-spin" style={{animationDuration:'3s'}}/>
              <span className="text-[9px] text-wapp font-bold">LIVE</span>
            </div>
          </div>

          <Arrow dir="down" color="#25D366" />

          {/* STEP 5 — WhatsApp sends */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { icon: MessageSquare, label: "WhatsApp message sent",    sub: "Real Meta Cloud API call",   color: "#25D366" },
              { icon: Activity,      label: "Saved to Chat Inbox",      sub: "Visible in Inbox page",      color: "#3b82f6" },
              { icon: Bell,          label: "Live Socket update",       sub: "UI updates instantly",       color: "#a855f7" },
            ].map(({ icon: Icon, label, sub, color }) => (
              <div key={label} className="flex items-center gap-3 p-3 rounded-xl border"
                style={{ background: color+"10", borderColor: color+"30" }}>
                <Icon size={18} style={{ color }}/>
                <div>
                  <p className="text-xs font-bold text-white">{label}</p>
                  <p className="text-[10px] text-slate-400">{sub}</p>
                </div>
              </div>
            ))}
          </div>

          <Arrow dir="down" color="#475569" />

          {/* STEP 6 — Follow-ups */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-3">Step 6 — Follow-up sequence (per flow)</p>
            <div className="flex items-center gap-2 flex-wrap">
              {["MSG 1","24h","MSG 2","24h","MSG 3","24h","MSG 4","→ status upgrade"].map((item, i) => (
                <React.Fragment key={i}>
                  {item.includes("MSG") ? (
                    <div className="px-3 py-1.5 rounded-xl bg-wapp/10 border border-wapp/30 text-xs font-bold text-wapp">{item}</div>
                  ) : item.includes("status") ? (
                    <div className="px-3 py-1.5 rounded-xl bg-orange-500/10 border border-orange-500/30 text-xs font-bold text-orange-400">{item}</div>
                  ) : (
                    <div className="flex flex-col items-center gap-0.5">
                      <ArrowRight size={12} className="text-slate-600"/>
                      <span className="text-[9px] text-slate-600">{item}</span>
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          <Arrow dir="down" color="#475569" />

          {/* STEP 7 — Reply */}
          <div className="p-4 rounded-2xl border border-blue-500/25 bg-blue-500/5 flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0 border border-blue-500/30">
              <MessageSquare size={20} className="text-blue-400"/>
            </div>
            <div>
              <p className="font-black text-white text-sm">User replies on WhatsApp</p>
              <p className="text-xs text-slate-400 mt-1">
                Meta sends webhook → saved as incoming message → Chat Inbox badge increments →
                Socket.io pushes to your browser live → you can reply directly from Inbox page.
              </p>
              <div className="flex gap-2 mt-2 flex-wrap">
                {["Replied ✓","Has Seen ✓","Online 🟢"].map(b => (
                  <span key={b} className="text-[9px] px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 font-bold">{b}</span>
                ))}
                <span className="text-[9px] text-slate-500">badges appear in Inbox filters</span>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ══════════════════════════════════════════════════════ TAB: All Flows */}
      {activeTab === "flows" && (
        <div className="space-y-4">

          {/* Status ladder */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-4 flex items-center gap-2">
              <TrendingUp size={12}/> Status Ladder — Users only move UP, never back down
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              {[
                { s:"active",                  f:"visit",    label:"active" },
                { s:"→",                       f:null },
                { s:"product_view",            f:"product",  label:"product_view" },
                { s:"→",                       f:null },
                { s:"abandoned_cart",          f:"cart",     label:"abandoned_cart" },
                { s:"→",                       f:null },
                { s:"cart_followup_complete",  f:"upsell",   label:"cart_followup_complete" },
                { s:"→",                       f:null },
                { s:"purchased",               f:"purchase", label:"purchased" },
              ].map((item, i) => {
                if (!item.f) return <ArrowRight key={i} size={16} className="text-slate-600 shrink-0"/>;
                const f = FLOWS[item.f];
                return (
                  <div key={i} className="px-3 py-2 rounded-xl border text-[10px] font-bold"
                    style={{ color: f.color, borderColor: f.color+"40", background: f.color+"12" }}>
                    {item.label}
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-600 mt-3">⚠ Status Guard: if a user has purchased, no cart recovery messages will be sent. The correct flow picks them up automatically.</p>
          </div>

          {/* 5 Flow cards */}
          <FlowCard
            flow="visit" icon={Home}
            title="FLOW 1 — Website Visit Follow-up"
            trigger="User only browsed home/listing pages — no product viewed"
            messages={["Hi! Check our trending products 🔥","Still looking? Here's what's popular","Don't miss out — top picks for you","Last chance — special picks selected"]}
            gap="24h" maxMsgs={4}
            content="Product recommendations pulled from your store catalog. Uses geo-detected language per user."
            outcome="Status → hot_user (re-engagement targeting begins)"
            outcomeColor="#a855f7"
          />

          <FlowCard
            flow="product" icon={Eye}
            title="FLOW 2 — Product View Follow-up"
            trigger="User viewed a specific product page but did NOT add to cart"
            messages={["You were looking at {{product_name}} 👀","Still interested? Only a few left!","{{product_name}} is waiting for you 🛍","Final reminder — grab it before it's gone"]}
            gap="24h" maxMsgs={4}
            content="Uses the exact product the user viewed — name, price, image, direct product link."
            outcome="Status → hot_user"
            outcomeColor="#3b82f6"
          />

          <FlowCard
            flow="cart" icon={ShoppingCart}
            title="FLOW 3 — Abandoned Cart Recovery"
            trigger="User added product to cart OR started checkout but didn't complete purchase"
            messages={["Your cart is waiting! 🛒 Complete order","Still there! {{product_name}} in your cart","⏰ Cart expiring soon — buy now","🔥 Final reminder — complete your order"]}
            gap="24h" maxMsgs={4}
            content="Cart product image, product name, total amount, and direct checkout recovery link."
            outcome="If NO purchase → status = cart_followup_complete (FLOW 4 begins)"
            outcomeColor="#f97316"
          />

          <FlowCard
            flow="upsell" icon={Gift}
            title="FLOW 4 — Post-Cart Upsell"
            trigger="User received all 4 cart reminders and STILL didn't buy"
            messages={["Check this out — we think you'll love it 💎","Our bestsellers are almost sold out!","Special offer just for you 🎁","Final recommendation — last chance price"]}
            gap="48h" maxMsgs={4}
            content="AI picks related products from your catalog. Keeps user engaged with fresh recommendations."
            outcome="Stops after 4 messages or when user purchases"
            outcomeColor="#ec4899"
          />

          <FlowCard
            flow="purchase" icon={Star}
            title="FLOW 5 — Post-Purchase Upsell"
            trigger="User completed a purchase (status = purchased)"
            messages={["Thank you! You might also love these 🌟"]}
            gap="—" maxMsgs={1}
            content="AI generates a recommendation based on what the customer bought. Highly personalized."
            outcome="1 message sent after the campaign's delay_hours"
            outcomeColor="#22c55e"
          />

        </div>
      )}

      {/* ══════════════════════════════════════════════════════ TAB: Message Limits */}
      {activeTab === "limits" && (
        <div className="space-y-5">

          {/* Scenario cards */}
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Total messages per user scenario</p>

          {[
            {
              label: "Worst case — browses, views product, adds cart, never buys",
              emoji: "😴",
              color: "#f97316",
              rows: [
                { flow:"visit",   name:"Website Visit",    msgs:4, days:"~3 days",  gap:"24h" },
                { flow:"product", name:"Product View",     msgs:4, days:"~3 days",  gap:"24h" },
                { flow:"cart",    name:"Cart Recovery",    msgs:4, days:"~3 days",  gap:"24h" },
                { flow:"upsell",  name:"Post-Cart Upsell", msgs:4, days:"~6 days",  gap:"48h" },
              ],
              total: 16,
              duration: "~15 days",
            },
            {
              label: "Normal — adds cart, buys after 2 reminders",
              emoji: "🛍",
              color: "#22c55e",
              rows: [
                { flow:"cart",    name:"Cart Recovery",    msgs:2, days:"~1 day",   gap:"24h" },
                { flow:"purchase",name:"Post-Purchase",    msgs:1, days:"24h later", gap:"—" },
              ],
              total: 3,
              duration: "~2 days",
            },
            {
              label: "Best case — visits, buys immediately",
              emoji: "⚡",
              color: "#3b82f6",
              rows: [
                { flow:"purchase",name:"Post-Purchase",    msgs:1, days:"24h later", gap:"—" },
              ],
              total: 1,
              duration: "24 hours",
            },
            {
              label: "Only browses home, never gives phone",
              emoji: "👻",
              color: "#475569",
              rows: [],
              total: 0,
              duration: "—",
            },
          ].map(({ label, emoji, color, rows, total, duration }) => (
            <div key={label} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
              <div className="px-5 py-3 border-b border-white/[0.05] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{emoji}</span>
                  <p className="text-sm font-bold text-white">{label}</p>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-center">
                    <p className="text-lg font-black" style={{ color }}>{total}</p>
                    <p className="text-[8px] text-slate-500 uppercase">msgs</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-bold text-slate-300">{duration}</p>
                    <p className="text-[8px] text-slate-500 uppercase">total</p>
                  </div>
                </div>
              </div>
              {rows.length > 0 && (
                <div className="px-5 py-3 space-y-2">
                  {rows.map(({ flow, name, msgs, days, gap }) => {
                    const f = FLOWS[flow];
                    return (
                      <div key={name} className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: f.color }}/>
                        <span className="text-xs text-slate-300 w-36 shrink-0">{name}</span>
                        <div className="flex gap-1 flex-1">
                          {Array.from({ length: msgs }).map((_, i) => (
                            <MsgBadge key={i} n={i+1} color={f.color}/>
                          ))}
                        </div>
                        <span className="text-[10px] text-slate-500 shrink-0">{gap} apart</span>
                        <span className="text-[10px] font-bold shrink-0" style={{ color: f.color }}>{days}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {rows.length === 0 && (
                <div className="px-5 py-3 text-xs text-slate-600 italic">No WhatsApp messages sent — phone number was never collected.</div>
              )}
            </div>
          ))}

          {/* Timing table */}
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
            <div className="px-5 py-3 border-b border-white/[0.05]">
              <p className="text-sm font-bold text-white flex items-center gap-2"><Clock size={14} className="text-wapp"/> Timing Reference</p>
            </div>
            <div className="p-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-widest text-slate-500">
                    <th className="text-left pb-3">Flow</th>
                    <th className="text-left pb-3">First msg delay</th>
                    <th className="text-left pb-3">Between msgs</th>
                    <th className="text-left pb-3">Max msgs</th>
                    <th className="text-left pb-3">Total span</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {[
                    { flow:"visit",    name:"Website Visit",      first:"Your campaign setting", between:"24 hours", max:4, span:"~3 days" },
                    { flow:"product",  name:"Product View",       first:"Your campaign setting", between:"24 hours", max:4, span:"~3 days" },
                    { flow:"cart",     name:"Abandoned Cart",     first:"Your campaign setting", between:"24 hours", max:4, span:"~3 days" },
                    { flow:"upsell",   name:"Post-Cart Upsell",   first:"Automatic after Flow 3",between:"48 hours", max:4, span:"~6 days" },
                    { flow:"purchase", name:"Post-Purchase",      first:"Your campaign setting", between:"—",        max:1, span:"Once" },
                  ].map(({ flow, name, first, between, max, span }) => {
                    const f = FLOWS[flow];
                    return (
                      <tr key={name} className="text-slate-300">
                        <td className="py-2.5 flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ background: f.color }}/>
                          {name}
                        </td>
                        <td className="py-2.5 text-slate-400">{first}</td>
                        <td className="py-2.5 font-bold" style={{ color: f.color }}>{between}</td>
                        <td className="py-2.5 text-center"><MsgBadge n={max} color={f.color}/></td>
                        <td className="py-2.5 text-slate-400">{span}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Engine note */}
          <div className="p-4 rounded-2xl border border-wapp/20 bg-wapp/5 flex gap-3">
            <Info size={16} className="text-wapp shrink-0 mt-0.5"/>
            <div className="space-y-1 text-xs text-slate-400">
              <p><span className="text-white font-bold">Automation checks every 60 seconds.</span> It does NOT send exactly at the delay time — it sends on the first check AFTER the delay has passed.</p>
              <p>Example: Campaign delay = 1 hour. User abandons cart at 10:00 AM. Engine checks at 10:01, 10:02… first check after 11:00 AM = message sent.</p>
              <p>Maximum delay before first message ≈ <span className="text-wapp font-bold">your_delay + 1 minute.</span></p>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
