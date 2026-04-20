import React, { useEffect, useState } from "react";
import { Save, Eye, EyeOff, Copy, CheckCircle, Zap, MessageSquare, Globe, Code, RefreshCw, Settings2 } from "lucide-react";
import { settingsApi } from "../api";

const CH = () => ({ 'x-channel-id': localStorage.getItem('channelId') || 'demo' });

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
  const [syncing, setSyncing] = useState(false);

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

  const syncCatalog = async () => {
    if (!settings.shop_url) return showToast("Enter Shop URL first", "error");
    setSyncing(true);
    try {
      const r = await fetch('/api/settings/sync-catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...CH() },
      }).then(res => res.json());
      if (r.error) throw new Error(r.error);
      showToast(`✓ ${r.products_in_catalog} products synced from ${settings.shop_url}`);
    } catch (e) { showToast(`Sync failed: ${e.message}`, "error"); }
    finally { setSyncing(false); }
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
    const snippet = `<!-- ── WhatsWay Tracker — paste before </body> on every page ── -->
<script>
  window.WhatswayConfig = {
    channelId: "YOUR_CHANNEL_ID",   // copy from this Settings page
    baseUrl:   "${baseUrl}",
  };
</script>
<script src="${baseUrl}/tracker.js"></script>

<!-- ── STEP 2 (only required line after the snippet above) ────────────
     Call identify() once you know the user's phone number.
     Paste this wherever the user submits their phone
     (checkout form, login, WhatsApp widget, etc.):

  WhatsWay.identify({ phone: "+919876543210", name: "Priya Sharma" });

── EVERYTHING ELSE IS AUTO — no extra code needed ──────────────────────

  AUTO on every product page  → product name / price / image captured
  AUTO on home & collection   → product catalog synced
  AUTO on cart page           → cart items captured from DOM
  AUTO on all pages           → city, device, language, engagement tracked

── OPTIONAL — only if auto-capture misses your custom cart ─────────────

  WhatsWay.trackAddToCart({
    products: [{ name: "Kurti", price: 799, url: "https://yourshop.com/products/kurti" }],
    totalAmount: 799,
    // name / price / image are auto-scraped from the URL if you skip them
  });
-->`;
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
    { id: "campaigns",  icon: Settings2,     label: "Campaign & Template", color: "#06b6d4" },
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
            <p className="text-xs" style={{ color: "#64748b" }}>2 lines on your site — everything else is automatic</p>
          </div>

          {/* Steps */}
          <div className="space-y-2">
            {[
              { step: "1", text: "Copy the snippet below", sub: "Paste before <code style='background:rgba(255,255,255,0.08);padding:1px 5px;border-radius:4px'>&lt;/body&gt;</code> on <strong>every page</strong> of your website" },
              { step: "2", text: "Call identify() once", sub: "Only needed when user gives their phone — checkout form, login, WhatsApp widget, etc." },
              { step: "✓", text: "Everything else is automatic", sub: "Products, prices, images, cart, city, device — all captured with zero extra code", green: true },
            ].map(({ step, text, sub, green }) => (
              <div key={step} className="flex items-start gap-3 text-xs">
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5"
                  style={{ background: green ? "rgba(37,211,102,0.15)" : "rgba(59,130,246,0.15)", color: green ? "#25D366" : "#60a5fa" }}>{step}</span>
                <div>
                  <p className="font-medium" style={{ color: "#e2e8f0" }}>{text}</p>
                  <p style={{ color: "#64748b" }} dangerouslySetInnerHTML={{ __html: sub }} />
                </div>
              </div>
            ))}
          </div>

          {/* Main snippet */}
          <div className="relative">
            <div className="rounded-t-xl px-4 py-2 flex items-center gap-2 text-xs font-medium"
              style={{ background: "#0a0f1a", borderBottom: "1px solid rgba(255,255,255,0.06)", color: "#60a5fa" }}>
              <Code size={11}/> Paste before &lt;/body&gt; on every page
            </div>
            <pre className="rounded-b-xl p-4 text-xs leading-relaxed overflow-x-auto font-mono whitespace-pre"
              style={{ background: "#0d1422", border: "1px solid rgba(255,255,255,0.08)", borderTop: "none", color: "#94a3b8" }}>
{`<script>
  window.WhatswayConfig = {
    channelId: `}<span style={{color:"#fbbf24"}}>"YOUR_CHANNEL_ID"</span>{`,
    baseUrl:   `}<span style={{color:"#86efac"}}>"{window.location.origin}"</span>{`,
  };
</script>
<script src=`}<span style={{color:"#86efac"}}>"{window.location.origin}/tracker.js"</span>{`></script>`}
            </pre>
            <button onClick={copySnippet}
              className="absolute top-10 right-3 btn-secondary text-xs py-1.5 px-3 gap-1.5">
              {copiedSnippet ? <><CheckCircle size={12} />Copied!</> : <><Copy size={12} />Copy Full Snippet</>}
            </button>
          </div>

          {/* identify() call */}
          <div>
            <p className="text-xs font-medium mb-2" style={{ color: "#e2e8f0" }}>Step 2 — identify the user (only 1 line needed):</p>
            <pre className="rounded-xl p-4 text-xs leading-relaxed overflow-x-auto font-mono"
              style={{ background: "#0d1422", border: "1px solid rgba(37,211,102,0.2)", color: "#94a3b8" }}>
{`// Call this once when the user gives their phone number:
WhatsWay.identify({ phone: `}<span style={{color:"#fbbf24"}}>"+919876543210"</span>{`, name: `}<span style={{color:"#fbbf24"}}>"Priya Sharma"</span>{` });`}
            </pre>
          </div>

          {/* Auto-capture table */}
          <div className="rounded-xl overflow-hidden text-xs" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="px-4 py-2.5 font-semibold" style={{ background: "rgba(255,255,255,0.04)", color: "#94a3b8" }}>
              What the tracker captures automatically (no code needed)
            </div>
            {[
              { page: "Product page",       captures: "Product name, price, image — from JSON-LD / OpenGraph / DOM" },
              { page: "Cart page",          captures: "Cart items, quantities, prices — from Shopify checkout object or DOM" },
              { page: "Home / Collection",  captures: "Listed products synced to your product catalog" },
              { page: "Every page",         captures: "City, state, country, device, browser, language, engagement score, scroll depth" },
            ].map(({ page, captures }) => (
              <div key={page} className="flex items-start gap-3 px-4 py-2.5 text-xs"
                style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <span className="shrink-0 font-medium w-36" style={{ color: "#60a5fa" }}>{page}</span>
                <span style={{ color: "#64748b" }}>{captures}</span>
              </div>
            ))}
          </div>

          {/* Optional cart override */}
          <div>
            <p className="text-xs mb-2" style={{ color: "#475569" }}>
              Optional — only if auto-capture misses your custom cart (rarely needed on Shopify):
            </p>
            <pre className="rounded-xl p-4 text-xs leading-relaxed overflow-x-auto font-mono"
              style={{ background: "#0d1422", border: "1px solid rgba(255,255,255,0.06)", color: "#64748b" }}>
{`WhatsWay.trackAddToCart({
  products: [{ name: "Kurti", price: 799, url: "https://yourshop.com/products/kurti" }],
  totalAmount: 799,
  // image is auto-scraped from the URL — you don't need to pass it
});`}
            </pre>
          </div>

          {/* Note */}
          <div className="p-4 rounded-xl text-xs" style={{ background: "rgba(37,211,102,0.05)", border: "1px solid rgba(37,211,102,0.15)", color: "#86efac" }}>
            <p className="font-semibold mb-1">Only WhatsApp messages need a phone number</p>
            <p style={{ color: "#4ade80", opacity: 0.7 }}>All tracking (product views, city, device, engagement) works anonymously. WhatsApp messages are only sent after the user calls identify() with their phone.</p>
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
            <label className="label">Shop URL <span style={{color:'#f97316',fontSize:'11px'}}>★ required for Auto-Detect Products</span></label>
            <div className="flex gap-2">
              <input className="input flex-1" placeholder="https://laasyna.com"
                value={settings.shop_url || ""} onChange={e => s("shop_url", e.target.value)} />
              <button onClick={syncCatalog} disabled={syncing || !settings.shop_url}
                title="Sync product catalog from your Shopify store now"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400 hover:bg-orange-500/20 disabled:opacity-40 text-xs font-medium transition-all shrink-0">
                <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
                {syncing ? 'Syncing…' : 'Sync Products'}
              </button>
            </div>
            <p className="text-xs mt-1" style={{ color: "#64748b" }}>Your Shopify store domain — saves all products for Auto-Detect. Syncs automatically when saved.</p>
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

      {/* Campaign & Template Tab */}
      {activeTab === "campaigns" && (
        <div className="card p-6 space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">Campaign & Template Settings</h3>
            <p className="text-xs" style={{ color: "#64748b" }}>Configure campaign targeting and template behavior</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="label">
                Product URL Slug
                <span className="text-xs ml-2 font-normal" style={{ color: "#06b6d4" }}>
                  used by Abandoned Product View campaigns
                </span>
              </label>
              <input
                className="input font-mono"
                placeholder="/products"
                value={settings.product_url_slug || ""}
                onChange={e => s("product_url_slug", e.target.value)}
              />
              <p className="text-xs mt-1.5" style={{ color: "#64748b" }}>
                The URL path segment that identifies product pages on your store. E.g. <code style={{ background: "rgba(6,182,212,0.1)", padding: "1px 5px", borderRadius: "4px", color: "#06b6d4" }}>/products</code> for Shopify.
                Only visitors whose product view URL contains this slug will be targeted by Abandoned Product View campaigns.
              </p>
            </div>

            <div className="p-4 rounded-xl text-xs" style={{ background: "rgba(6,182,212,0.06)", border: "1px solid rgba(6,182,212,0.2)", color: "#67e8f9" }}>
              <p className="font-semibold mb-1.5" style={{ color: "#22d3ee" }}>How Abandoned Product View works</p>
              <ul className="space-y-1" style={{ color: "#94a3b8" }}>
                <li>• Targets visitors with <strong style={{ color: "#67e8f9" }}>product_view</strong> status whose viewed URL matches the slug above</li>
                <li>• First message: sent after <strong style={{ color: "#67e8f9" }}>30 minutes</strong> of inactivity</li>
                <li>• Follow-up: sent after <strong style={{ color: "#67e8f9" }}>24 hours</strong> if no purchase</li>
                <li>• Maximum <strong style={{ color: "#67e8f9" }}>2 follow-ups</strong> per product view</li>
                <li>• Uses a single product WhatsApp template with dynamic product name, price &amp; image</li>
              </ul>
            </div>
          </div>

          <button onClick={save} disabled={saving} className="btn-primary w-full justify-center gap-2">
            <Save size={14} />{saving ? "Saving…" : "Save Campaign Settings"}
          </button>
        </div>
      )}
    </div>
  );
}
