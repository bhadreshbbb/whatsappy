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

  const showToast = (msg, type="success") => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); };

  useEffect(()=>{
    settingsApi.get().then(s=>{ setSettings(s); setLoading(false); }).catch(()=>setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...settings };
      delete payload.whatsapp_token_masked;
      await settingsApi.save(payload);
      showToast("Settings saved!");
    } catch(e) { showToast("Save failed","error"); }
    finally { setSaving(false); }
  };

  const testWA = async () => {
    if (!testPhone) return showToast("Enter a phone number","error");
    setTesting(true);
    try {
      const r = await settingsApi.testWhatsApp(testPhone);
      if (r.success) showToast(r.simulated ? "Simulated! (Add API token to send real messages)" : "Message sent!");
      else showToast(r.error||"Failed","error");
    } catch(e) { showToast("Test failed","error"); }
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
    setTimeout(()=>setCopiedSnippet(false),2000);
  };

  const s = (k,v) => setSettings(p=>({...p,[k]:v}));

  if (loading) return <div className="skeleton h-64 rounded-2xl max-w-2xl"/>;

  const TABS = [
    { id:"whatsapp", icon:MessageSquare, label:"WhatsApp API" },
    { id:"automation", icon:Zap, label:"Automation" },
    { id:"tracker", icon:Code, label:"Tracker Setup" },
    { id:"general", icon:Globe, label:"General" },
  ];

  return (
    <div className="space-y-5 max-w-3xl">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-xl border ${toast.type==="error"?"bg-red-500/10 border-red-500/30 text-red-400":"bg-green-500/10 border-green-500/30 text-green-400"}`}>
          {toast.msg}
        </div>
      )}

      <div>
        <h2 className="text-lg font-bold text-white">Settings</h2>
        <p className="text-xs text-slate-500 mt-0.5">Configure WhatsApp API, automation, and tracking</p>
      </div>

      <div className="flex gap-1 bg-white/[0.02] p-1 rounded-xl border border-white/5">
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-all ${activeTab===t.id?"bg-[#1a2035] text-white shadow border border-white/10":"text-slate-400 hover:text-white"}`}>
            <t.icon size={13}/>{t.label}
          </button>
        ))}
      </div>

      {activeTab==="whatsapp" && (
        <div className="card p-6 space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">WhatsApp Business API</h3>
            <p className="text-xs text-slate-500">Configure your Meta WhatsApp Business API credentials</p>
          </div>

          <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl text-xs text-blue-300">
            <p className="font-semibold mb-1">How to get credentials:</p>
            <p>1. Go to <a href="https://developers.facebook.com" target="_blank" rel="noopener" className="underline">developers.facebook.com</a></p>
            <p>2. Create a Meta App → Add WhatsApp product</p>
            <p>3. Copy Phone Number ID, Business Account ID, and generate a permanent token</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="label">WhatsApp Phone Number ID</label>
              <input className="input font-mono" placeholder="e.g. 123456789012345" value={settings.whatsapp_phone_id||""} onChange={e=>s("whatsapp_phone_id",e.target.value)}/>
            </div>
            <div>
              <label className="label">Business Account ID</label>
              <input className="input font-mono" placeholder="e.g. 987654321098765" value={settings.whatsapp_business_id||""} onChange={e=>s("whatsapp_business_id",e.target.value)}/>
            </div>
            <div>
              <label className="label">Permanent Access Token</label>
              <div className="relative">
                <input className="input font-mono pr-10" type={showToken?"text":"password"} placeholder="EAAxxxxxxx..." value={settings.whatsapp_token||""} onChange={e=>s("whatsapp_token",e.target.value)}/>
                <button onClick={()=>setShowToken(t=>!t)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                  {showToken?<EyeOff size={14}/>:<Eye size={14}/>}
                </button>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-white/5">
            <label className="label">Test WhatsApp</label>
            <div className="flex gap-2">
              <input className="input flex-1 font-mono" placeholder="Phone: 919876543210 (with country code)" value={testPhone} onChange={e=>setTestPhone(e.target.value)}/>
              <button onClick={testWA} disabled={testing} className="btn-primary whitespace-nowrap">
                {testing?"Sending…":"Send Test"}
              </button>
            </div>
          </div>

          <button onClick={save} disabled={saving} className="btn-primary w-full justify-center">
            <Save size={14}/>{saving?"Saving…":"Save WhatsApp Settings"}
          </button>
        </div>
      )}

      {activeTab==="automation" && (
        <div className="card p-6 space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">Automation Engine</h3>
            <p className="text-xs text-slate-500">Control automated campaign triggers</p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-white/[0.02] rounded-xl border border-white/5">
              <div>
                <p className="text-sm font-medium text-white">Automation Engine</p>
                <p className="text-xs text-slate-500">Run cron jobs every 5 minutes to check and send campaigns</p>
              </div>
              <label className="toggle-switch cursor-pointer">
                <input type="checkbox" checked={settings.automation_enabled==="true"} onChange={e=>s("automation_enabled",e.target.checked?"true":"false")}/>
                <span className="toggle-slider"/>
              </label>
            </div>

            <div className="flex items-center justify-between p-4 bg-white/[0.02] rounded-xl border border-white/5">
              <div>
                <p className="text-sm font-medium text-white">Visitor Tracking</p>
                <p className="text-xs text-slate-500">Track IP, location, device from website visitors</p>
              </div>
              <label className="toggle-switch cursor-pointer">
                <input type="checkbox" checked={settings.tracking_enabled==="true"} onChange={e=>s("tracking_enabled",e.target.checked?"true":"false")}/>
                <span className="toggle-slider"/>
              </label>
            </div>
          </div>

          <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full bg-green-500 live-dot"/>
              <span className="text-xs font-semibold text-green-400">Automation Status: Active</span>
            </div>
            <p className="text-xs text-slate-400">Cron runs every 5 minutes · Visitor timeout: 5 min · Message window: 30 min</p>
          </div>

          <button onClick={save} disabled={saving} className="btn-primary w-full justify-center">
            <Save size={14}/>{saving?"Saving…":"Save Automation Settings"}
          </button>
        </div>
      )}

      {activeTab==="tracker" && (
        <div className="card p-6 space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">Website Tracker Setup</h3>
            <p className="text-xs text-slate-500">Install this snippet on your e-commerce website to start tracking</p>
          </div>

          <div className="space-y-3">
            {["1. Copy the snippet below","2. Paste into your website's &lt;head&gt; tag","3. Call WhatsWay.identify() when user provides phone number","4. Call trackAddToCart() when user adds items to cart"].map((s,i)=>(
              <div key={i} className="flex items-start gap-3 text-xs text-slate-400">
                <span className="w-5 h-5 rounded-full bg-wapp/20 text-wapp text-[10px] flex items-center justify-center shrink-0 mt-0.5">{i+1}</span>
                <span dangerouslySetInnerHTML={{__html:s}}/>
              </div>
            ))}
          </div>

          <div className="relative">
            <pre className="bg-[#0d1422] border border-white/10 rounded-xl p-4 text-xs text-slate-300 overflow-x-auto font-mono leading-relaxed whitespace-pre-wrap">
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
            <button onClick={copySnippet} className="absolute top-3 right-3 btn-secondary text-xs py-1.5 px-3 gap-1">
              {copiedSnippet?<><CheckCircle size={12}/>Copied!</>:<><Copy size={12}/>Copy</>}
            </button>
          </div>

          <div className="p-4 bg-orange-500/5 border border-orange-500/20 rounded-xl text-xs text-orange-300">
            <p className="font-semibold mb-1">⚠️ Important</p>
            <p>The tracker automatically captures IP address, city, state, language, device type, and browser. It only sends WhatsApp messages to users who provide their phone number.</p>
          </div>
        </div>
      )}

      {activeTab==="general" && (
        <div className="card p-6 space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">General Settings</h3>
          </div>
          <div>
            <label className="label">Shop URL</label>
            <input className="input" placeholder="https://yourshop.com" value={settings.shop_url||""} onChange={e=>s("shop_url",e.target.value)}/>
            <p className="text-xs text-slate-600 mt-1">Used as fallback for cart_url variable in templates</p>
          </div>
          <div>
            <label className="label">WhatsApp API Base URL</label>
            <input className="input font-mono" value={settings.whatsapp_api_url||"https://graph.facebook.com/v19.0"} onChange={e=>s("whatsapp_api_url",e.target.value)}/>
          </div>
          <button onClick={save} disabled={saving} className="btn-primary w-full justify-center">
            <Save size={14}/>{saving?"Saving…":"Save General Settings"}
          </button>
        </div>
      )}
    </div>
  );
}
