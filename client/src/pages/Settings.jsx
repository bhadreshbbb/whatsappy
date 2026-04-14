import React, { useEffect, useState } from "react";
import { Save, Eye, EyeOff, Copy, CheckCircle, Zap, MessageSquare, Globe, Code } from "lucide-react";
import { settingsApi } from "../api";

export default function Settings() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [showToken, setShowToken] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testing, setTesting] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [activeTab, setActiveTab] = useState("whatsapp");

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    settingsApi.get().then(s => { setSettings(s); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...settings };
      delete payload.whatsapp_token_masked;
      await settingsApi.save(payload);
      showToast("Settings saved!");
    } catch (e) { showToast("Save failed", "error"); }
    finally { setSaving(false); }
  };

  const testWA = async () => {
    if (!testPhone) return showToast("Enter a phone number", "error");
    setTesting(true);
    try {
      const r = await settingsApi.testWhatsApp(testPhone);
      if (r.success) showToast(r.simulated ? "Simulated! (Add API token to send real messages)" : "Message sent!");
      else showToast(r.error || "Failed", "error");
    } catch (e) { showToast("Test failed", "error"); }
    finally { setTesting(false); }
  };

  const copySnippet = () => {
    const baseUrl = window.location.origin;
    const snippet = `<!-- WhatsWay Pro Tracker -->
<script>
  window.WhatswayConfig = {
    apiKey: "YOUR_API_KEY",
    baseUrl: "${baseUrl}",
  };
</script>
<script src="${baseUrl}/tracker.js" async></script>

<!-- Identify user after they provide phone number -->
<script>
  // Call after user logs in / fills phone number form:
  // WhatsWay.identify({ phone: "919876543210", name: "Customer Name" });

  // Call when user adds to cart:
  // WhatsWay.trackAddToCart({
  //   cartId: "cart_123",
  //   products: [{ name: "Product Name", price: 999, image: "https://...", url: "https://yourshop.com/cart" }],
  //   totalAmount: 999,
  // });
</script>`;
    navigator.clipboard.writeText(snippet);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  const s = (k, v) => setSettings(p => ({ ...p, [k]: v }));

  const TABS = [
    { id: "whatsapp",   icon: MessageSquare, label: "WhatsApp API",   color: "#25D366" },
    { id: "automation", icon: Zap,           label: "Automation",     color: "#f97316" },
    { id: "tracker",    icon: Code,          label: "Tracker Setup",  color: "#3b82f6" },
    { id: "general",    icon: Globe,         label: "General",        color: "#a855f7" },
  ];

  if (loading) return (
    <div className="max-w-3xl space-y-4">
      {[1, 2].map(i => (
        <div key={i} className="skeleton h-20 rounded-2xl" />
      ))}
    </div>
  );

  return (
    <div className="space-y-5 max-w-3xl">

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-2xl"
          style={toast.type === "error"
            ? { background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }
            : { background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", color: "#4ade80" }}>
          {toast.msg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-all"
            style={activeTab === t.id
              ? { background: "#1a2035", color: "#fff", border: "1px solid rgba(255,255,255,0.1)" }
              : { color: "#64748b", border: "1px solid transparent" }}
            onMouseEnter={e => { if (activeTab !== t.id) e.currentTarget.style.color = "#e2e8f0"; }}
            onMouseLeave={e => { if (activeTab !== t.id) e.currentTarget.style.color = "#64748b"; }}>
            <t.icon size={13} style={{ color: activeTab === t.id ? t.color : "inherit" }} />
            {t.label}
          </button>
        ))}
      </div>

      {/* WhatsApp Tab */}
      {activeTab === "whatsapp" && (
        <div className="card p-6 space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">WhatsApp Business API</h3>
            <p className="text-xs" style={{ color: "#64748b" }}>Configure your Meta WhatsApp Business API credentials</p>
          </div>

          <div className="p-4 rounded-xl text-xs" style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)", color: "#93c5fd" }}>
            <p className="font-semibold mb-2" style={{ color: "#60a5fa" }}>How to get credentials:</p>
            <p className="mb-1">1. Go to <a href="https://developers.facebook.com" target="_blank" rel="noopener" className="underline" style={{ color: "#60a5fa" }}>developers.facebook.com</a></p>
            <p className="mb-1">2. Create a Meta App → Add WhatsApp product</p>
            <p>3. Copy Phone Number ID, Business Account ID, and generate a permanent token</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="label">WhatsApp Phone Number ID</label>
              <input className="input font-mono" placeholder="e.g. 123456789012345"
                value={settings.whatsapp_phone_id || ""}
                onChange={e => s("whatsapp_phone_id", e.target.value)} />
            </div>
            <div>
              <label className="label">Business Account ID (WABA ID)</label>
              <input className="input font-mono" placeholder="e.g. 987654321098765"
                value={settings.whatsapp_business_id || ""}
                onChange={e => s("whatsapp_business_id", e.target.value)} />
            </div>
            <div>
              <label className="label">
                App ID <span className="text-xs ml-1 font-normal" style={{ color: "#475569" }}>(required for template image upload)</span>
              </label>
              <input className="input font-mono" placeholder="e.g. 123456789"
                value={settings.whatsapp_app_id || ""}
                onChange={e => s("whatsapp_app_id", e.target.value)} />
              <p className="text-xs mt-1" style={{ color: "#334155" }}>Find it at developers.facebook.com → your app → App ID</p>
            </div>
            <div>
              <label className="label">Permanent Access Token</label>
              <div className="relative">
                <input className="input font-mono pr-10" type={showToken ? "text" : "password"}
                  placeholder="EAAxxxxxxx…"
                  value={settings.whatsapp_token || ""}
                  onChange={e => s("whatsapp_token", e.target.value)} />
                <button onClick={() => setShowToken(t => !t)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: "#475569" }}
                  onMouseEnter={e => e.currentTarget.style.color = "#e2e8f0"}
                  onMouseLeave={e => e.currentTarget.style.color = "#475569"}>
                  {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          </div>

          <div className="pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            <label className="label">Test WhatsApp Connection</label>
            <div className="flex gap-2">
              <input className="input flex-1 font-mono" placeholder="Phone: 919876543210 (with country code)"
                value={testPhone} onChange={e => setTestPhone(e.target.value)} />
              <button onClick={testWA} disabled={testing} className="btn-primary whitespace-nowrap">
                {testing ? "Sending…" : "Send Test"}
              </button>
            </div>
          </div>

          <button onClick={save} disabled={saving} className="btn-primary w-full justify-center gap-2">
            <Save size={14} />{saving ? "Saving…" : "Save WhatsApp Settings"}
          </button>
        </div>
      )}

      {/* Automation Tab */}
      {activeTab === "automation" && (
        <div className="card p-6 space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">Automation Engine</h3>
            <p className="text-xs" style={{ color: "#64748b" }}>Control automated campaign triggers</p>
          </div>

          <div className="space-y-3">
            {[
              { key: "automation_enabled", title: "Automation Engine", desc: "Run cron jobs every 5 minutes to check and send campaigns" },
              { key: "tracking_enabled",   title: "Visitor Tracking",  desc: "Track IP, location, device from website visitors" },
            ].map(item => (
              <div key={item.key} className="flex items-center justify-between p-4 rounded-xl"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div>
                  <p className="text-sm font-medium text-white">{item.title}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>{item.desc}</p>
                </div>
                <label className="toggle-switch cursor-pointer">
                  <input type="checkbox" checked={settings[item.key] === "true"}
                    onChange={e => s(item.key, e.target.checked ? "true" : "false")} />
                  <span className="toggle-slider" />
                </label>
              </div>
            ))}
          </div>

          <div className="p-4 rounded-xl" style={{ background: "rgba(37,211,102,0.06)", border: "1px solid rgba(37,211,102,0.2)" }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full live-dot" style={{ background: "#25D366" }} />
              <span className="text-xs font-semibold" style={{ color: "#4ade80" }}>Automation Status: Active</span>
            </div>
            <p className="text-xs" style={{ color: "#64748b" }}>Cron runs every 5 minutes · Visitor timeout: 5 min · Message window: 30 min</p>
          </div>

          <button onClick={save} disabled={saving} className="btn-primary w-full justify-center gap-2">
            <Save size={14} />{saving ? "Saving…" : "Save Automation Settings"}
          </button>
        </div>
      )}

      {/* Tracker Tab */}
      {activeTab === "tracker" && (
        <div className="card p-6 space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">Website Tracker Setup</h3>
            <p className="text-xs" style={{ color: "#64748b" }}>Install this snippet on your e-commerce website to start tracking</p>
          </div>

          <div className="space-y-2">
            {[
              "Copy the snippet below",
              "Paste into your website's <head> tag",
              "Call WhatsWay.identify() when user provides phone number",
              "Call trackAddToCart() when user adds items to cart"
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-3 text-xs" style={{ color: "#94a3b8" }}>
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5"
                  style={{ background: "rgba(37,211,102,0.15)", color: "#25D366" }}>{i + 1}</span>
                <span dangerouslySetInnerHTML={{ __html: step }} />
              </div>
            ))}
          </div>

          <div className="relative">
            <pre className="rounded-xl p-4 text-xs leading-relaxed overflow-x-auto font-mono whitespace-pre-wrap"
              style={{ background: "#0d1422", border: "1px solid rgba(255,255,255,0.08)", color: "#94a3b8" }}>
{`<!-- WhatsWay Pro Tracker -->
<script>
  window.WhatswayConfig = {
    apiKey: "YOUR_API_KEY",
    baseUrl: "${window.location.origin}",
  };
</script>
<script src="${window.location.origin}/tracker.js" async></script>

<!-- After user provides phone: -->
<!-- WhatsWay.identify({ phone: "919876543210", name: "Priya" }); -->

<!-- On add to cart: -->
<!-- WhatsWay.trackAddToCart({
  cartId: "cart_123",
  products: [{ name: "Kurti", price: 799, image: "...", url: "..." }],
  totalAmount: 799,
}); -->`}
            </pre>
            <button onClick={copySnippet}
              className="absolute top-3 right-3 btn-secondary text-xs py-1.5 px-3 gap-1.5">
              {copiedSnippet ? <><CheckCircle size={12} />Copied!</> : <><Copy size={12} />Copy</>}
            </button>
          </div>

          <div className="p-4 rounded-xl text-xs" style={{ background: "rgba(249,115,22,0.06)", border: "1px solid rgba(249,115,22,0.2)", color: "#fdba74" }}>
            <p className="font-semibold mb-1" style={{ color: "#fb923c" }}>Important</p>
            <p>The tracker automatically captures IP address, city, state, language, device type, and browser. It only sends WhatsApp messages to users who provide their phone number.</p>
          </div>
        </div>
      )}

      {/* General Tab */}
      {activeTab === "general" && (
        <div className="card p-6 space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">General Settings</h3>
            <p className="text-xs" style={{ color: "#64748b" }}>Shop configuration and API endpoints</p>
          </div>
          <div>
            <label className="label">Shop URL</label>
            <input className="input" placeholder="https://yourshop.com"
              value={settings.shop_url || ""} onChange={e => s("shop_url", e.target.value)} />
            <p className="text-xs mt-1" style={{ color: "#334155" }}>Used as fallback for cart_url variable in templates</p>
          </div>
          <div>
            <label className="label">WhatsApp API Base URL</label>
            <input className="input font-mono"
              value={settings.whatsapp_api_url || "https://graph.facebook.com/v19.0"}
              onChange={e => s("whatsapp_api_url", e.target.value)} />
          </div>
          <button onClick={save} disabled={saving} className="btn-primary w-full justify-center gap-2">
            <Save size={14} />{saving ? "Saving…" : "Save General Settings"}
          </button>
        </div>
      )}
    </div>
  );
}
