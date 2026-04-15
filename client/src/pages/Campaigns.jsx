import React, { useEffect, useState, useCallback, useMemo } from "react";
import { translateTemplate } from "../translate";
import {
  Plus, Trash2, Play, ChevronDown, ChevronUp, X,
  Zap, Clock, CheckCircle, Globe, MessageSquare, ShoppingCart,
  Eye, TrendingDown, Package, Users, Settings, ToggleLeft, Gift, Layout,
  Filter, Sliders, UserCheck, Search, Target, ChevronRight, AlertCircle,
  Flame, Smartphone, Monitor,
} from "lucide-react";
import { campaignsApi, templatesApi, analyticsApi } from "../api";

// ─── Constants ────────────────────────────────────────────────────────────────

const CAMPAIGN_TYPES = [
  {
    id: "abandoned_cart",
    icon: "🛒",
    label: "Abandoned Cart Recovery",
    description: "Auto-reach users who added to cart but didn't reach checkout.",
    color: "orange",
    autoTarget: true,
    defaultDelay: 1,
    targetSegment: "abandoned_cart",
  },
  {
    id: "abandoned_checkout",
    icon: "💳",
    label: "Checkout Drop-off Recovery",
    description: "Target high-intent users who failed at the payment screen. Offer high discounts.",
    color: "red",
    autoTarget: true,
    defaultDelay: 1,
    targetSegment: "abandoned_checkout",
  },
  {
    id: "product_view",
    icon: "👁",
    label: "Abandoned Product View",
    description: "Retarget visitors who viewed specific products but didn't add to cart.",
    color: "blue",
    autoTarget: true,
    defaultDelay: 2,
    targetSegment: "product_view",
  },
  {
    id: "website_visit",
    icon: "🏠",
    label: "Abandoned Website Visitor",
    description: "Re-engage visitors who browsed the Home/Listing pages without viewing products.",
    color: "purple",
    autoTarget: true,
    defaultDelay: 4,
    targetSegment: "website_visit",
  },
  {
    id: "discount",
    icon: "🎁",
    label: "Discount Offer",
    description: "Send special discount codes only to high-intent abandoned cart users.",
    color: "green",
    autoTarget: true,
    defaultDelay: 0,
    targetSegment: "abandoned_cart",
  },
  {
    id: "post_cart_upsell",
    icon: "♾️",
    label: "Infinite Weekly Recommendations",
    description: "Targets everyone who finished standard follow-ups without buying. Sends new products weekly forever.",
    color: "pink",
    autoTarget: true,
    defaultDelay: 168, // 168 hours = 7 days
    targetSegment: "followup_complete",
  },
  {
    id: "post_purchase",
    icon: "⭐",
    label: "Post-Purchase Upsell",
    description: "Re-engage customers who already bought. Suggest relative products or new arrivals.",
    color: "pink",
    autoTarget: true,
    defaultDelay: 24, // Typically 24 hours after purchase
    targetSegment: "purchased",
  },
];

const LANGUAGES = [
  { code: "hi", flag: "🇮🇳", label: "Hindi" },
  { code: "en", flag: "🇺🇸", label: "English" },
  { code: "gu", flag: "🇮🇳", label: "Gujarati" },
  { code: "mr", flag: "🇮🇳", label: "Marathi" },
  { code: "ta", flag: "🇮🇳", label: "Tamil" },
  { code: "te", flag: "🇮🇳", label: "Telugu" },
  { code: "bn", flag: "🇧🇩", label: "Bengali" },
  { code: "ur", flag: "🇵🇰", label: "Urdu" },
];

const LANG_LABEL = Object.fromEntries(LANGUAGES.map(l => [l.code, l.label]));

const COLOR_MAP = {
  orange: "text-orange-400 bg-orange-400/10 border-orange-400/20",
  blue:   "text-blue-400 bg-blue-400/10 border-blue-400/20",
  purple: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  green:  "text-green-400 bg-green-400/10 border-green-400/20",
};

const PREVIEW_VARS = {
  name: "Priya",
  product_name: "Blue Kurti",
  product_price: "799",
  currency: "INR",
  product_image: "https://picsum.photos/seed/bluekurti/400/300",
  cart_url: "https://shop.example.com/cart?sid=sess_1",
  product_url: "https://shop.example.com/products/blue-kurti",
  total_amount: "1599",
};

function fillVars(text = "") {
  return (text || "").replace(/\{\{(\w+)\}\}/g, (_, k) => PREVIEW_VARS[k] || `[${k}]`);
}

// ─── WhatsApp preview ──────────────────────────────────────────────────
function WAPreview({ template }) {
  if (!template) return (
    <div className="flex flex-col items-center justify-center h-48 text-slate-600 border border-white/5 bg-black/20 rounded-2xl">
      <MessageSquare size={28} className="mb-2" />
      <p className="text-xs">Pick a template to see preview</p>
    </div>
  );

  const isCarousel = template.category === "product_recom";
  const isPoll = template.category === "poll";
  const isFlow = template.category === "flow";

  const cards = template.carousel_cards ? (typeof template.carousel_cards === 'string' ? JSON.parse(template.carousel_cards) : template.carousel_cards) : [];
  const pollOptions = template.poll_options ? (typeof template.poll_options === 'string' ? JSON.parse(template.poll_options) : template.poll_options) : ["Option 1", "Option 2"];

  const CheckIcon = () => (
    <svg width="16" height="11" viewBox="0 0 16 11" fill="none" className="inline ml-1 text-slate-500">
      <path d="M1 5L5 9L15 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M5 5L9 9L19 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" transform="translate(-4, 0)"/>
    </svg>
  );

  const LinkIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="inline mr-2">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
    </svg>
  );

  const FlowIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="inline mr-2">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );

  return (
    <div className="phone-frame scale-75 lg:scale-90 origin-top">
       <div className="phone-notch"></div>
       <div className="h-full wa-bg-pattern bg-[#0b141a] overflow-hidden">
          {/* Header */}
          <div className="bg-[#1f2c34] pt-8 pb-3 px-4 flex items-center gap-3 border-b border-white/5">
             <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-white/50">WA</div>
             <div className="flex-1">
                <h4 className="text-[12px] font-bold text-white leading-none">WhatsApp Marketing</h4>
                <span className="text-[9px] text-wapp/70 flex items-center gap-1.5 mt-1">online</span>
             </div>
          </div>

          <div className="p-4 space-y-3">
             <div className="relative">
                <svg className="absolute -left-2 top-0 text-[#1f2c34]" width="10" height="15">
                  <path fill="currentColor" d="M10 0 L10 15 L0 0 Z" />
                </svg>
                <div className="bg-[#1f2c34] rounded-tr-xl rounded-b-xl overflow-hidden shadow-lg border border-white/5">
                   {template.header_type === "image" && (
                     <div className="h-28 bg-slate-800 relative">
                       <img src={fillVars(template.header_image_url === "{{product_image}}" ? PREVIEW_VARS.product_image : template.header_image_url)} 
                            className="w-full h-full object-cover" alt=""/>
                       {template.personalize_image && (
                         <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[1px]">
                            <span className="text-white font-bold text-xs bg-black/40 px-2 py-1 rounded">Hi {PREVIEW_VARS.name}! 👋</span>
                         </div>
                       )}
                     </div>
                   )}
                   <div className="px-3 py-2.5">
                      <p className="text-[#e9edef] text-[11px] leading-relaxed whitespace-pre-wrap">{fillVars(template.body_text)}</p>
                      {isPoll && (
                        <div className="mt-3 space-y-1.5 font-sans">
                           {pollOptions.map((opt, i) => (
                             <div key={i} className="w-full p-2 rounded-lg border border-white/5 bg-white/5 text-left text-[10px] flex items-center justify-between">
                                <span>{opt}</span>
                                <div className="w-3 h-3 rounded-full border border-white/20"/>
                             </div>
                           ))}
                        </div>
                      )}
                      <div className="text-right mt-1.5 flex items-center justify-end gap-1">
                         <span className="text-[8px] text-slate-500">10:45 AM</span>
                         <CheckIcon/>
                      </div>
                   </div>
                </div>

                {!isCarousel && !isPoll && (
                   <div className="mt-1 space-y-1">
                      {isFlow ? (
                         <div className="bg-[#1f2c34] rounded-lg py-2 text-center border border-white/5 flex items-center justify-center gap-1.5">
                           <FlowIcon/>
                           <span className="text-[#00a9ff] text-[11px] font-bold">{template.flow_name || "Open Flow"}</span>
                         </div>
                      ) : (
                         template.buttons && (typeof template.buttons === 'string' ? JSON.parse(template.buttons) : template.buttons).map((btn, i) => (
                           <div key={i} className="bg-[#1f2c34] rounded-lg py-2 text-center border border-white/5 flex items-center justify-center gap-1.5">
                             {btn.type === 'url' && <LinkIcon/>}
                             <span className="text-[#00a9ff] text-[11px] font-bold">{btn.text}</span>
                           </div>
                         ))
                      )}
                   </div>
                )}
             </div>

             {isCarousel && cards.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                   {cards.map((c, i) => (
                     <div key={i} className="min-w-[160px] bg-[#1f2c34] rounded-xl overflow-hidden border border-white/5 shadow-md">
                        <div className="h-20 bg-slate-800">
                           <img src={fillVars(c.image === "{{product_image}}" ? PREVIEW_VARS.product_image : c.image)} className="w-full h-full object-cover" alt=""/>
                        </div>
                        <p className="p-2 text-center text-[#00a9ff] text-[10px] font-bold border-t border-[#2a3942]"><LinkIcon/> {c.title || "Buy Now"}</p>
                     </div>
                   ))}
                </div>
             )}
          </div>
       </div>
    </div>
  );
}

// ─── Create Campaign Modal ────────────────────────────────────────────────────
function CreateModal({ onClose, onCreated }) {
  const [step, setStep] = useState(1);
  const [type, setType] = useState(null);
  const [language, setLang] = useState("en");
  const [detectedLang, setDetectedLang] = useState(null); // auto-detected from visitor geo data
  const [templateId, setTplId] = useState("");
  const [templateIds, setTplIds] = useState(["", "", "", ""]); // 4-Stage Selectable templates
  const [previewStage, setPreviewStage] = useState(1); // Current stage being previewed
  const [delayHrs, setDelay] = useState(1);
  const [templates, setTemplates] = useState([]);
  const [metaTemplates, setMetaTemplates] = useState([]);   // approved carousel Meta templates
  const [metaTemplateId, setMetaTplId] = useState("");      // selected Meta template id
  const [metaPayloadPreview, setMetaPayloadPreview] = useState(null); // payload preview from /send-payload
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translatedTpl, setTranslatedTpl] = useState(null);
  const [validationErr, setValidationErr] = useState("");

  const CH = () => ({ 'x-channel-id': localStorage.getItem('channelId') || 'demo' });
  const META_LANG_MAP = { en: 'en_US', hi: 'hi', gu: 'gu', ta: 'ta', te: 'te', mr: 'mr', bn: 'bn', ar: 'ar' };

  useEffect(() => {
    templatesApi.list().then(setTemplates);
    // Load approved carousel Meta templates for product recommendation campaigns
    fetch('/api/meta-templates', { headers: CH() })
      .then(r => r.json())
      .then(d => setMetaTemplates((d.templates || []).filter(t => t.is_carousel && t.meta_status === 'APPROVED')))
      .catch(() => {});
    // Auto-detect dominant language from visitor geo analytics
    analyticsApi.topLanguage().then(data => {
      if (data?.topLang) {
        setDetectedLang(data.topLang);
        setLang(data.topLang);
      }
    }).catch(() => {});
  }, []);

  // Fetch send payload preview when Meta template or language changes
  useEffect(() => {
    if (!metaTemplateId) { setMetaPayloadPreview(null); return; }
    const langCode = META_LANG_MAP[language] || language;
    fetch(`/api/meta-templates/${metaTemplateId}/send-payload?lang=${langCode}`, { headers: CH() })
      .then(r => r.json())
      .then(d => setMetaPayloadPreview(d))
      .catch(() => setMetaPayloadPreview(null));
  }, [metaTemplateId, language]);

  const isMultiStage = type?.id === 'abandoned_cart' || type?.id === 'abandoned_checkout' || type?.id === 'product_view';
  const activeTplId = isMultiStage ? templateIds[previewStage - 1] : templateId;
  const baseTpl = templates.find(t => String(t.id) === String(activeTplId));

  // ── Automatic Translation for Preview ──
  useEffect(() => {
    if (!baseTpl || language === "auto" || language === "en") {
      setTranslatedTpl(null);
      return;
    }
    const t = async () => {
      setTranslating(true);
      try {
        const res = await translateTemplate(baseTpl, language);
        setTranslatedTpl(res);
      } catch (e) {
        console.error("Translation failed", e);
      } finally {
        setTranslating(false);
      }
    };
    t();
  }, [language, activeTplId, baseTpl]);

  const handleNextStep = () => {
    setValidationErr("");

    if (step === 1) {
        if (!type) {
            setValidationErr("Please select a Campaign Type to proceed.");
            return;
        }
        setStep(2);
    } else if (step === 2) {
        // If a Meta carousel template is selected, that's sufficient — no regular template needed
        if (metaTemplateId) { setStep(3); return; }

        let errs = [];
        if (isMultiStage) {
            if (!templateIds[0]) errs.push("• Follow-up 1: Please select a template.");
            if (!templateIds[1]) errs.push("• Follow-up 2: Please select a template.");
            if (!templateIds[2]) errs.push("• Follow-up 3: Please select a template.");
            if (!templateIds[3]) errs.push("• Follow-up 4: Please select a template.");
        } else {
            if (!templateId) errs.push("• Message Blueprint: Please select a template.\n  (or select a Meta Carousel Template above)");
        }

        if (errs.length > 0) {
            setValidationErr(errs.join('\n'));
            return;
        }
        setStep(3);
    }
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      await campaignsApi.create({
        name: `${type.label} (${language === 'per_user' ? 'Native Language' : (LANG_LABEL[language] || language.toUpperCase())})`,
        campaign_type: type.id,
        trigger_event: type.id,
        target_segment: type.targetSegment,
        target_language: language,
        template_id: isMultiStage ? templateIds[0] : templateId,
        template_ids: isMultiStage ? templateIds.filter(id => id !== "") : [],
        meta_template_id: metaTemplateId || null,   // linked Meta carousel template
        delay_hours: delayHrs,
        is_active: true,
      });
      onCreated(); onClose();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="bg-[#0d1424] border border-white/10 rounded-3xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-[0_0_50px_rgba(34,197,94,0.1)] overflow-hidden">
        <div className="px-8 py-5 border-b border-white/5 flex justify-between items-center bg-black/20">
           <div>
             <h3 className="font-bold text-white uppercase tracking-wider text-sm flex items-center gap-2">
                <Zap size={14} className="text-green-400"/> Launch Automation Flow
             </h3>
             <p className="text-[10px] text-slate-500 mt-0.5">High-conversion targeting + auto product capture</p>
           </div>
           <button onClick={onClose} className="p-2 border border-white/5 rounded-full hover:bg-white/5 text-slate-500"><X size={18}/></button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-8">
           {/* Progress */}
           <div className="flex justify-between relative px-10">
              <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/5 -translate-y-1/2 z-0"></div>
              {[1,2,3].map(n => (
                <div key={n} className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all border ${step >= n ? 'bg-green-500 text-black border-green-500' : 'bg-[#0d1424] border-white/10 text-slate-500'}`}>{n}</div>
              ))}
           </div>

           {step === 1 && (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {CAMPAIGN_TYPES.map(ct => (
                  <button key={ct.id} onClick={()=>{ setType(ct); setDelay(ct.defaultDelay); setStep(2); }} 
                    className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-blue-500/30 text-left transition-all group">
                     <div className="flex gap-4">
                        <span className="text-3xl grayscale group-hover:grayscale-0 transition-all">{ct.icon}</span>
                        <div>
                           <p className="font-bold text-white text-sm">{ct.label}</p>
                           <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">{ct.description}</p>
                           <span className="inline-block mt-2 text-[9px] bg-green-500/10 text-green-400 px-2 py-0.5 rounded-full border border-green-500/10 font-bold tracking-widest uppercase">Targeting: {ct.targetSegment.replace('_',' ')}</span>
                        </div>
                     </div>
                  </button>
                ))}
             </div>
           )}

           {step === 2 && (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                   <div>
                      <label className="label flex items-center gap-2">
                        Communication Language
                        {detectedLang && language !== 'per_user' && (
                          <span className="text-[9px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-bold tracking-widest uppercase">
                            🌐 Auto-detected: {LANG_LABEL[detectedLang] || detectedLang}
                          </span>
                        )}
                      </label>

                      {/* ── Per-user native language (smart send) ── */}
                      <button
                        onClick={() => setLang('per_user')}
                        className={`w-full mb-3 p-3 rounded-xl border text-left transition-all flex items-start gap-3
                          ${language === 'per_user'
                            ? 'bg-purple-500/10 border-purple-500 text-white'
                            : 'border-white/5 text-slate-400 hover:border-purple-500/30'}`}
                      >
                        <span className="text-xl mt-0.5">🧠</span>
                        <div>
                          <p className="text-[12px] font-bold">Each user's own language</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            Auto-detects every user's native language from their geo data and sends the message translated for each person individually.
                          </p>
                          {language === 'per_user' && (
                            <span className="inline-block mt-1 text-[9px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full border border-purple-500/20 font-bold uppercase tracking-wider">
                              ✓ Smart per-user translation active
                            </span>
                          )}
                        </div>
                      </button>

                      {/* ── Fixed language buttons ── */}
                      <div className="grid grid-cols-2 gap-2">
                         {LANGUAGES.map(l => (
                           <button key={l.code} onClick={()=>setLang(l.code)}
                             className={`p-2 rounded-xl border text-[11px] flex items-center gap-2 transition-all
                               ${language===l.code ? 'bg-green-500/10 border-green-500 text-white' : 'border-white/5 text-slate-500'}
                               ${l.code===detectedLang && language!==l.code ? 'border-blue-500/30 text-blue-400' : ''}`}>
                              <span>{l.flag}</span> {l.label}
                              {l.code===detectedLang && <span className="ml-auto text-[8px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full">Detected</span>}
                           </button>
                         ))}
                      </div>
                   </div>

                   {/* ── Meta Carousel Template (product recommendation) ─────── */}
                   {metaTemplates.length > 0 && (
                     <div className="space-y-2">
                       <label className="label flex items-center gap-2">
                         <span className="text-orange-400">🎠</span> Meta Carousel Template
                         <span className="text-[9px] bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Approved</span>
                       </label>
                       <p className="text-[10px] text-slate-500 -mt-1">Product recommendation — sends real carousel with auto-refreshed products. Language below changes the template language code.</p>
                       <div className="space-y-2">
                         <button
                           onClick={() => setMetaTplId("")}
                           className={`w-full p-2.5 rounded-xl border text-left flex justify-between items-center transition-all text-xs ${!metaTemplateId ? 'bg-slate-700/40 border-white/10 text-slate-400' : 'border-white/5 text-slate-500 hover:border-white/10'}`}>
                           <span>None — use regular template below</span>
                           {!metaTemplateId && <CheckCircle size={12} className="text-slate-400"/>}
                         </button>
                         {metaTemplates.map(t => (
                           <button key={t.id} onClick={() => setMetaTplId(t.id)}
                             className={`w-full p-3 rounded-2xl border text-left flex justify-between items-center transition-all ${metaTemplateId === t.id ? 'bg-orange-500/10 border-orange-500/50 text-white' : 'border-white/5 text-slate-400 hover:border-orange-500/30 hover:bg-orange-500/5'}`}>
                             <div>
                               <p className="text-xs font-bold">{t.name}</p>
                               <div className="flex items-center gap-2 mt-0.5">
                                 <span className="text-[10px] text-orange-400">{t.carousel_cards?.length} cards</span>
                                 {t.auto_product_mode && <span className="text-[10px] text-orange-300">· Auto-products</span>}
                                 <span className="text-[10px] text-slate-500">· {t.language?.toUpperCase()}</span>
                               </div>
                             </div>
                             {metaTemplateId === t.id && <CheckCircle size={14} className="text-orange-400"/>}
                           </button>
                         ))}
                       </div>
                     </div>
                   )}

                   {/* ── Regular templates (hidden when Meta template selected) ─── */}
                   {!metaTemplateId && (
                   (type.id === 'abandoned_cart' || type.id === 'abandoned_checkout' || type.id === 'product_view') ? (
                     <div className="space-y-4">
                        <label className="label">Select 4-Stage Templates</label>
                        {[0,1,2,3].map(stg => (
                           <div key={stg} className="space-y-1">
                              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Follow-up {stg + 1}</p>
                              <select
                                value={templateIds[stg]}
                                onChange={e => {
                                   const newIds = [...templateIds];
                                   newIds[stg] = e.target.value;
                                   setTplIds(newIds);
                                   if (stg === 0) setTplId(e.target.value);
                                }}
                                className="input w-full text-xs"
                              >
                                 <option value="">Select Stage {stg + 1} Template</option>
                                 {templates.map(t => (
                                   <option key={t.id} value={t.id}>{t.name}</option>
                                 ))}
                              </select>
                           </div>
                        ))}
                     </div>
                   ) : (
                     <div>
                        <label className="label">Message Blueprint</label>
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                           {templates.map(t => (
                             <button key={t.id} onClick={()=>setTplId(t.id)} className={`w-full p-3 rounded-2xl border text-left flex justify-between items-center transition-all ${String(templateId)===String(t.id) ? 'bg-blue-500/10 border-blue-500' : 'border-white/5'}`}>
                                <div>
                                   <p className="text-xs font-bold text-white">{t.name}</p>
                                   <p className="text-[10px] text-slate-500">{t.category?.replace('_',' ')}</p>
                                </div>
                                {String(templateId)===String(t.id) && <CheckCircle size={14} className="text-blue-400"/>}
                             </button>
                           ))}
                        </div>
                     </div>
                   ))}
                </div>
                <div className="space-y-4">
                   <label className="label flex items-center justify-between">
                      Device Preview
                      {translating && <span className="text-[10px] text-blue-400 animate-pulse bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">Translating Preview…</span>}
                   </label>

                   {isMultiStage && (
                      <div className="flex bg-white/5 p-1 rounded-xl border border-white/5 mb-4">
                         {[1,2,3,4].map(stg => (
                            <button 
                              key={stg} 
                              onClick={() => setPreviewStage(stg)}
                              className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${previewStage === stg ? 'bg-blue-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                               Stage {stg}
                            </button>
                         ))}
                      </div>
                   )}

                   {/* Meta carousel template preview */}
                   {metaTemplateId && metaPayloadPreview ? (
                     <div className="space-y-2">
                       <div className="p-2 bg-orange-500/5 border border-orange-500/20 rounded-xl text-[10px] text-orange-400 font-mono">
                         POST {metaPayloadPreview.api_url || 'https://graph.facebook.com/v25.0/.../messages'}
                       </div>
                       <div className="flex items-center gap-2 text-[10px] text-slate-500">
                         <span>Lang code: <span className="text-white font-mono">{metaPayloadPreview.payload?.template?.language?.code}</span></span>
                         {metaPayloadPreview.last_refresh && (
                           <span>· Refreshed: {new Date(metaPayloadPreview.last_refresh).toLocaleTimeString()}</span>
                         )}
                       </div>
                       <div className="space-y-1 max-h-52 overflow-y-auto">
                         {(metaPayloadPreview.products || []).filter(p => p.title).map((p, i) => (
                           <div key={i} className="flex items-center gap-2 bg-white/[0.03] border border-white/5 rounded-lg px-2 py-1.5">
                             {p.image && <img src={p.image} alt="" className="w-8 h-8 object-cover rounded shrink-0" onError={e=>e.target.style.display='none'}/>}
                             <div className="flex-1 min-w-0">
                               <p className="text-white text-[11px] font-medium truncate">Card {i+1}: {p.title}</p>
                               {p.price && <p className="text-green-400 text-[10px]">{p.price}</p>}
                             </div>
                           </div>
                         ))}
                         {!(metaPayloadPreview.products || []).some(p => p.title) && (
                           <p className="text-slate-500 text-[10px] py-2 text-center">Products auto-fill every 6h from trending data.</p>
                         )}
                       </div>
                       <div className="bg-black/20 rounded-xl p-2 max-h-40 overflow-y-auto">
                         <pre className="text-[10px] font-mono text-slate-400 whitespace-pre-wrap">{JSON.stringify(metaPayloadPreview.payload, null, 2)}</pre>
                       </div>
                     </div>
                   ) : (
                     <WAPreview template={translatedTpl || baseTpl}/>
                   )}

                   {isMultiStage && !metaTemplateId && (
                      <p className="text-[10px] text-slate-600 text-center uppercase tracking-widest font-bold mt-2">
                         Previewing {previewStage} of 4 stages
                      </p>
                   )}
                </div>
             </div>
           )}


           {step === 3 && (
             <div className="max-w-md mx-auto space-y-8">
                <div className="p-6 bg-white/[0.02] border border-white/5 rounded-3xl text-center">
                   <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2 font-bold text-blue-400">Campaign Summary</p>
                   <h2 className="text-xl font-bold text-white mb-2">{type.label}</h2>
                   <p className="text-xs text-slate-400">System will automatically match {type.targetSegment.replace('_',' ')} users from your tracker.</p>
                </div>
                
                <div>
                   <label className="label">Automation Delay (Hours)</label>
                   <div className="flex items-center gap-6">
                      <input type="range" min="0" max="48" value={delayHrs} onChange={e=>setDelay(e.target.value)} className="flex-1 accent-green-500"/>
                      <span className="text-xl font-bold text-green-400 w-12">{delayHrs}h</span>
                   </div>
                   <p className="text-[10px] text-slate-600 mt-2 italic">Recommendation: {(type.id==='abandoned_cart' || type.id==='abandoned_checkout')?'1 hour':'Instant (0h)'} is best for conversion.</p>
                </div>

                <div className="pt-4 flex gap-4">
                    <button onClick={()=>setStep(2)} className="btn-secondary flex-1">Back</button>
                    <button onClick={handleCreate} disabled={saving} className="btn-primary flex-[2] justify-center text-lg">{saving ? 'Deploying...' : '🚀 Launch Now'}</button>
                </div>
             </div>
           )}
        </div>
        
        {step < 3 && (
            <div className="px-8 py-4 border-t border-white/5 bg-black/20 flex flex-col items-end gap-3">
                {validationErr && (
                   <div className="w-full text-left p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs whitespace-pre-line font-medium shadow-sm">
                      ❌ {validationErr}
                   </div>
                )}
                <div className="flex justify-end gap-3 w-full">
                   <button onClick={onClose} className="btn-secondary">Cancel</button>
                   <button onClick={handleNextStep} className="btn-primary px-8">Next Step →</button>
                </div>
            </div>
        )}
      </div>
    </div>
  );
}

// ─── Custom Campaign Builder ──────────────────────────────────────────────────

const FILTER_FIELDS = [
  { id: 'status',           label: 'Status',           type: 'select',
    options: [
      { value: 'active',         label: 'Active Visitor'   },
      { value: 'product_view',   label: 'Product View'     },
      { value: 'abandoned_cart', label: 'Abandoned Cart'   },
      { value: 'purchased',      label: 'Purchased'        },
    ]
  },
  { id: 'city',             label: 'City',             type: 'text'   },
  { id: 'device',           label: 'Device',           type: 'select',
    options: [
      { value: 'mobile',  label: 'Mobile'  },
      { value: 'desktop', label: 'Desktop' },
      { value: 'tablet',  label: 'Tablet'  },
    ]
  },
  { id: 'language',         label: 'Language',         type: 'select',
    options: LANGUAGES.map(l => ({ value: l.code, label: l.label }))
  },
  { id: 'power_score',      label: 'Power Score',      type: 'number' },
  { id: 'engagement_score', label: 'Engagement Score', type: 'number' },
  { id: 'cart_events',      label: 'Cart Events',      type: 'number' },
  { id: 'page_views',       label: 'Page Views',       type: 'number' },
  { id: 'total_time_sec',   label: 'Time on Site (s)', type: 'number' },
];

const NUMBER_OPS = [
  { value: 'gte', label: '≥ at least' },
  { value: 'lte', label: '≤ at most'  },
  { value: 'eq',  label: '= exactly'  },
];

function applyRules(contacts, rules, logic) {
  const validRules = rules.filter(r => r.value !== '' && r.value !== undefined);
  if (!validRules.length) return contacts;
  return contacts.filter(c => {
    const results = validRules.map(r => {
      const cv = c[r.field];
      if (r.op === 'eq')       return String(cv ?? '').toLowerCase() === String(r.value).toLowerCase();
      if (r.op === 'contains') return String(cv ?? '').toLowerCase().includes(String(r.value).toLowerCase());
      if (r.op === 'gte')      return Number(cv ?? 0) >= Number(r.value);
      if (r.op === 'lte')      return Number(cv ?? 0) <= Number(r.value);
      return true;
    });
    return logic === 'AND' ? results.every(Boolean) : results.some(Boolean);
  });
}

function defaultRule() {
  return { id: Date.now(), field: 'status', op: 'eq', value: 'abandoned_cart' };
}

function RuleRow({ rule, contacts, onUpdate, onRemove, isLast, logic }) {
  const field = FILTER_FIELDS.find(f => f.id === rule.field) || FILTER_FIELDS[0];
  const matchCount = useMemo(() => {
    const c = contacts.filter(ct => {
      const cv = ct[rule.field];
      if (rule.op === 'eq')  return String(cv ?? '').toLowerCase() === String(rule.value).toLowerCase();
      if (rule.op === 'contains') return String(cv ?? '').toLowerCase().includes(String(rule.value).toLowerCase());
      if (rule.op === 'gte') return Number(cv ?? 0) >= Number(rule.value);
      if (rule.op === 'lte') return Number(cv ?? 0) <= Number(rule.value);
      return false;
    });
    return c.length;
  }, [contacts, rule]);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 p-3 rounded-xl"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
        {/* Field */}
        <select value={rule.field}
          onChange={e => {
            const nf = FILTER_FIELDS.find(f => f.id === e.target.value);
            onUpdate({ ...rule, field: e.target.value, op: nf?.type === 'number' ? 'gte' : 'eq', value: '' });
          }}
          className="input text-xs py-1.5 flex-1"
          style={{ minWidth: 130 }}>
          {FILTER_FIELDS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>

        {/* Operator */}
        {field.type === 'number' ? (
          <select value={rule.op} onChange={e => onUpdate({ ...rule, op: e.target.value })}
            className="input text-xs py-1.5" style={{ minWidth: 110 }}>
            {NUMBER_OPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : field.type === 'text' ? (
          <select value={rule.op} onChange={e => onUpdate({ ...rule, op: e.target.value })}
            className="input text-xs py-1.5" style={{ minWidth: 110 }}>
            <option value="eq">= equals</option>
            <option value="contains">contains</option>
          </select>
        ) : (
          <span className="text-xs px-2" style={{ color: "#64748b" }}>is</span>
        )}

        {/* Value */}
        {field.type === 'select' ? (
          <select value={rule.value} onChange={e => onUpdate({ ...rule, value: e.target.value })}
            className="input text-xs py-1.5 flex-1">
            <option value="">Select…</option>
            {field.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : field.type === 'number' ? (
          <input type="number" value={rule.value} onChange={e => onUpdate({ ...rule, value: e.target.value })}
            placeholder="0" className="input text-xs py-1.5 w-20 text-center" />
        ) : (
          <input type="text" value={rule.value} onChange={e => onUpdate({ ...rule, value: e.target.value })}
            placeholder="type…" className="input text-xs py-1.5 flex-1" />
        )}

        {/* Match pill */}
        {rule.value !== '' && (
          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap"
            style={{ background: matchCount > 0 ? "rgba(34,197,94,0.1)" : "rgba(100,116,139,0.1)",
                     color: matchCount > 0 ? "#4ade80" : "#64748b" }}>
            {matchCount}
          </span>
        )}

        <button onClick={onRemove} className="p-1 rounded-lg transition-colors ml-1"
          style={{ color: "#475569" }}
          onMouseEnter={e => e.currentTarget.style.color = "#f87171"}
          onMouseLeave={e => e.currentTarget.style.color = "#475569"}>
          <X size={13} />
        </button>
      </div>
      {/* Logic connector */}
      {!isLast && (
        <div className="flex justify-center my-1">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded"
            style={{ background: logic === 'AND' ? "rgba(59,130,246,0.15)" : "rgba(168,85,247,0.15)",
                     color: logic === 'AND' ? "#60a5fa" : "#c084fc" }}>
            {logic}
          </span>
        </div>
      )}
    </div>
  );
}

function CustomCampaignModal({ onClose, onCreated }) {
  const [step, setStep]           = useState(1);
  const [name, setName]           = useState('');
  const [delayHrs, setDelay]      = useState(0);
  const [templateId, setTplId]    = useState('');
  const [templates, setTemplates] = useState([]);
  const [tplSearch, setTplSearch] = useState('');
  const [logic, setLogic]         = useState('AND');
  const [rules, setRules]         = useState([defaultRule()]);
  const [contacts, setContacts]   = useState([]);
  const [ctLoading, setCtLoading] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [err, setErr]             = useState('');

  useEffect(() => {
    templatesApi.list().then(setTemplates).catch(() => {});
    setCtLoading(true);
    analyticsApi.contacts(60, 1000).then(d => {
      setContacts(d?.contacts || []);
    }).catch(() => {}).finally(() => setCtLoading(false));
  }, []);

  const matched = useMemo(() => applyRules(contacts, rules, logic), [contacts, rules, logic]);

  const activeTpl = templates.find(t => String(t.id) === String(templateId));
  const filteredTpls = useMemo(() =>
    templates.filter(t => !tplSearch ||
      (t.name || '').toLowerCase().includes(tplSearch.toLowerCase())
    ), [templates, tplSearch]);

  const addRule  = () => setRules(r => [...r, defaultRule()]);
  const removeRule = id => setRules(r => r.filter(x => x.id !== id));
  const updateRule = (id, val) => setRules(r => r.map(x => x.id === id ? { ...x, ...val } : x));

  const handleNext = () => {
    setErr('');
    if (step === 1) {
      if (!name.trim()) { setErr('Please enter a campaign name.'); return; }
      if (!templateId)  { setErr('Please select a message template.'); return; }
      setStep(2);
    } else if (step === 2) {
      if (matched.length === 0) { setErr('No contacts match these filters. Adjust your rules.'); return; }
      setStep(3);
    }
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      await campaignsApi.create({
        name: name.trim(),
        campaign_type:  'custom',
        target_segment: 'custom',
        target_language: 'en',
        template_id:  templateId,
        template_ids: [],
        delay_hours:  Number(delayHrs),
        is_active:    true,
        filters: JSON.stringify({ logic, rules: rules.map(({ id: _id, ...r }) => r) }),
      });
      onCreated(); onClose();
    } catch (_) {
      setErr('Failed to create campaign. Please try again.');
    } finally { setSaving(false); }
  };

  const STATUS_COLOR = {
    purchased:      { bg: "rgba(34,197,94,0.1)",   border: "rgba(34,197,94,0.25)",   color: "#4ade80"  },
    abandoned_cart: { bg: "rgba(249,115,22,0.1)",  border: "rgba(249,115,22,0.25)",  color: "#fb923c"  },
    product_view:   { bg: "rgba(59,130,246,0.1)",  border: "rgba(59,130,246,0.25)",  color: "#60a5fa"  },
    active:         { bg: "rgba(100,116,139,0.1)", border: "rgba(100,116,139,0.25)", color: "#94a3b8"  },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="bg-[#0d1424] border border-white/10 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-[0_0_50px_rgba(59,130,246,0.12)] overflow-hidden">

        {/* Header */}
        <div className="px-7 py-5 border-b border-white/5 flex justify-between items-center bg-black/20">
          <div>
            <h3 className="font-bold text-white text-sm flex items-center gap-2 uppercase tracking-wider">
              <Sliders size={14} className="text-blue-400" /> Custom Campaign Builder
            </h3>
            <p className="text-[10px] text-slate-500 mt-0.5">Target specific contacts with advanced audience filters</p>
          </div>
          <button onClick={onClose} className="p-2 border border-white/5 rounded-full hover:bg-white/5 text-slate-500"><X size={18}/></button>
        </div>

        {/* Step indicator */}
        <div className="flex border-b border-white/5">
          {[
            { n: 1, label: 'Setup'    },
            { n: 2, label: 'Audience' },
            { n: 3, label: 'Review'   },
          ].map(s => (
            <div key={s.n} className="flex-1 py-3 flex items-center justify-center gap-2 text-xs font-medium transition-colors"
              style={step === s.n
                ? { color: "#60a5fa", borderBottom: "2px solid #60a5fa" }
                : step > s.n
                ? { color: "#4ade80" }
                : { color: "#475569" }}>
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                style={step > s.n
                  ? { background: "rgba(34,197,94,0.2)", color: "#4ade80" }
                  : step === s.n
                  ? { background: "rgba(59,130,246,0.2)", color: "#60a5fa" }
                  : { background: "rgba(255,255,255,0.05)", color: "#475569" }}>
                {step > s.n ? '✓' : s.n}
              </span>
              {s.label}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-7 py-6">

          {/* ══ STEP 1: Setup ══ */}
          {step === 1 && (
            <div className="space-y-6 max-w-2xl mx-auto">

              <div className="space-y-1.5">
                <label className="label flex items-center gap-1.5">
                  <Target size={12} className="text-blue-400" /> Campaign Name
                </label>
                <input value={name} onChange={e => setName(e.target.value)}
                  placeholder="e.g. Diwali Sale — Mumbai Abandoned Carts"
                  className="input w-full" />
              </div>

              <div className="space-y-1.5">
                <label className="label flex items-center gap-1.5">
                  <Clock size={12} className="text-orange-400" /> Send Delay After Trigger
                </label>
                <div className="flex items-center gap-4 p-4 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <input type="range" min="0" max="72" value={delayHrs}
                    onChange={e => setDelay(e.target.value)} className="flex-1 accent-blue-500" />
                  <div className="text-right">
                    <span className="text-2xl font-bold text-blue-400">{delayHrs}</span>
                    <span className="text-xs text-slate-500 ml-1">hrs</span>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {[0, 1, 2, 6, 12, 24, 48].map(h => (
                    <button key={h} onClick={() => setDelay(h)}
                      className="text-[10px] px-2 py-1 rounded-lg transition-all"
                      style={Number(delayHrs) === h
                        ? { background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa" }
                        : { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", color: "#475569" }}>
                      {h === 0 ? 'Instant' : `${h}h`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="label flex items-center gap-1.5">
                  <MessageSquare size={12} className="text-green-400" /> Message Template
                </label>
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#475569" }} />
                  <input value={tplSearch} onChange={e => setTplSearch(e.target.value)}
                    placeholder="Search templates…" className="input w-full pl-7 text-xs py-1.5" />
                </div>
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                  {filteredTpls.length === 0 && (
                    <p className="text-xs text-center py-4" style={{ color: "#475569" }}>No templates found.</p>
                  )}
                  {filteredTpls.map(t => (
                    <button key={t.id} onClick={() => setTplId(t.id)}
                      className="w-full p-3 rounded-xl border text-left flex items-center justify-between transition-all"
                      style={String(templateId) === String(t.id)
                        ? { background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", color: "#fff" }
                        : { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", color: "#94a3b8" }}
                      onMouseEnter={e => { if (String(templateId) !== String(t.id)) e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
                      onMouseLeave={e => { if (String(templateId) !== String(t.id)) e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; }}>
                      <div>
                        <p className="text-xs font-semibold text-white">{t.name}</p>
                        <p className="text-[10px] mt-0.5" style={{ color: "#475569" }}>{(t.category || '').replace(/_/g, ' ')}</p>
                      </div>
                      {String(templateId) === String(t.id) && <CheckCircle size={13} className="text-green-400 shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══ STEP 2: Audience Builder ══ */}
          {step === 2 && (
            <div className="space-y-5">
              {/* Summary bar */}
              <div className="flex items-center justify-between p-4 rounded-2xl"
                style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)" }}>
                <div className="flex items-center gap-3">
                  <Users size={20} className="text-blue-400" />
                  <div>
                    <p className="text-sm font-bold text-white">
                      {ctLoading ? '…' : matched.length} contacts matched
                    </p>
                    <p className="text-[10px]" style={{ color: "#64748b" }}>
                      out of {contacts.length} total · filters update live
                    </p>
                  </div>
                </div>
                {/* AND / OR toggle */}
                <div className="flex items-center gap-1 p-1 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <span className="text-[10px] text-slate-500 px-1">Logic:</span>
                  {['AND', 'OR'].map(l => (
                    <button key={l} onClick={() => setLogic(l)}
                      className="px-3 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all"
                      style={logic === l
                        ? { background: l === 'AND' ? "rgba(59,130,246,0.3)" : "rgba(168,85,247,0.3)",
                            color: l === 'AND' ? "#60a5fa" : "#c084fc" }
                        : { color: "#475569" }}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Logic help */}
              <p className="text-[10px] px-1" style={{ color: "#475569" }}>
                {logic === 'AND'
                  ? 'AND — contact must match ALL rules below.'
                  : 'OR — contact must match ANY one rule below.'}
              </p>

              {/* Rules */}
              <div className="space-y-1">
                {rules.map((r, i) => (
                  <RuleRow key={r.id} rule={r} contacts={contacts}
                    logic={logic} isLast={i === rules.length - 1}
                    onUpdate={upd => updateRule(r.id, upd)}
                    onRemove={() => removeRule(r.id)} />
                ))}
              </div>

              <button onClick={addRule}
                className="w-full py-2 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-1.5"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.1)", color: "#64748b" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(59,130,246,0.3)"; e.currentTarget.style.color = "#60a5fa"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "#64748b"; }}>
                <Plus size={12} /> Add Filter Rule
              </button>

              {/* Mini preview of matched contacts */}
              {matched.length > 0 && (
                <div className="rounded-xl overflow-hidden"
                  style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5"
                    style={{ background: "rgba(255,255,255,0.03)", color: "#64748b" }}>
                    <Eye size={10} /> Preview — top {Math.min(matched.length, 8)} contacts
                  </div>
                  {matched.slice(0, 8).map((c, i) => {
                    const ss = STATUS_COLOR[c.status] || STATUS_COLOR.active;
                    return (
                      <div key={i} className="flex items-center gap-3 px-3 py-2 text-xs transition-colors"
                        style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
                        onMouseLeave={e => e.currentTarget.style.background = ""}>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-white">{c.name || '—'}</span>
                          <span className="ml-2 font-mono text-[10px]" style={{ color: "#4ade80" }}>{c.phone}</span>
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap"
                          style={{ background: ss.bg, border: `1px solid ${ss.border}`, color: ss.color }}>
                          {(c.status || 'active').replace(/_/g, ' ')}
                        </span>
                        <span className="text-[10px] font-mono" style={{ color: "#64748b" }}>{c.city || '—'}</span>
                        <span className="text-[10px]" style={{ color: "#475569" }}>{c.device || '—'}</span>
                      </div>
                    );
                  })}
                  {matched.length > 8 && (
                    <div className="px-3 py-2 text-[10px] text-center" style={{ color: "#475569" }}>
                      +{matched.length - 8} more contacts will receive this campaign
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ══ STEP 3: Review & Launch ══ */}
          {step === 3 && (
            <div className="space-y-5 max-w-2xl mx-auto">
              {/* Campaign card */}
              <div className="p-5 rounded-2xl"
                style={{ background: "rgba(59,130,246,0.05)", border: "1px solid rgba(59,130,246,0.15)" }}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-bold mb-1" style={{ color: "#64748b" }}>Custom Campaign</p>
                    <h3 className="text-lg font-bold text-white">{name}</h3>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-blue-400">{matched.length}</p>
                    <p className="text-[10px]" style={{ color: "#475569" }}>contacts targeted</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  {[
                    { label: 'Template',  value: activeTpl?.name || '—',                       color: "#4ade80"  },
                    { label: 'Delay',     value: Number(delayHrs) === 0 ? 'Instant' : `${delayHrs}h`, color: "#fb923c"  },
                    { label: 'Logic',     value: `${rules.length} rules · ${logic}`,             color: "#c084fc"  },
                  ].map(s => (
                    <div key={s.label} className="p-3 rounded-xl text-center"
                      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <p className="text-[10px] mb-1" style={{ color: "#64748b" }}>{s.label}</p>
                      <p className="text-xs font-semibold truncate" style={{ color: s.color }} title={s.value}>{s.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Active filter summary */}
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: "#64748b" }}>
                  Active Filters ({rules.length})
                </p>
                {rules.map((r, i) => {
                  const ff = FILTER_FIELDS.find(f => f.id === r.field);
                  const opLabel = r.op === 'eq' ? 'is' : r.op === 'contains' ? 'contains' : r.op === 'gte' ? '≥' : '≤';
                  const valLabel = ff?.options ? (ff.options.find(o => o.value === r.value)?.label || r.value) : r.value;
                  return (
                    <div key={r.id} className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
                      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                      {i > 0 && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                          style={{ background: logic === 'AND' ? "rgba(59,130,246,0.15)" : "rgba(168,85,247,0.15)",
                                   color: logic === 'AND' ? "#60a5fa" : "#c084fc" }}>
                          {logic}
                        </span>
                      )}
                      <span style={{ color: "#94a3b8" }}>{ff?.label}</span>
                      <span style={{ color: "#475569" }}>{opLabel}</span>
                      <span className="font-semibold text-white">{valLabel || '—'}</span>
                    </div>
                  );
                })}
              </div>

              {/* Full contact list */}
              <div>
                <p className="text-[10px] uppercase tracking-widest font-bold mb-2" style={{ color: "#64748b" }}>
                  All {matched.length} Matched Contacts
                </p>
                <div className="rounded-xl overflow-hidden"
                  style={{ border: "1px solid rgba(255,255,255,0.06)", maxHeight: 260, overflowY: "auto" }}>
                  {matched.map((c, i) => {
                    const ss = STATUS_COLOR[c.status] || STATUS_COLOR.active;
                    return (
                      <div key={i} className="flex items-center gap-3 px-3 py-2 text-xs"
                        style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
                        onMouseLeave={e => e.currentTarget.style.background = ""}>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-white">{c.name || '—'}</span>
                          <span className="ml-2 font-mono text-[10px]" style={{ color: "#4ade80" }}>{c.phone}</span>
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                          style={{ background: ss.bg, border: `1px solid ${ss.border}`, color: ss.color }}>
                          {(c.status || 'active').replace(/_/g, ' ')}
                        </span>
                        <span className="text-[10px]" style={{ color: "#64748b" }}>{c.city || '—'}</span>
                        <span className="text-[10px]" style={{ color: "#475569" }}>{c.device || '—'}</span>
                        <span className="text-[10px] font-mono" style={{ color: c.cart_events > 0 ? "#fb923c" : "#475569" }}>
                          {c.cart_events > 0 ? `${c.cart_events} carts` : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-7 py-4 border-t border-white/5 bg-black/20 space-y-3">
          {err && (
            <div className="flex items-center gap-2 p-3 rounded-xl text-xs"
              style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
              <AlertCircle size={13} /> {err}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <button onClick={onClose} className="btn-secondary">Cancel</button>
            <div className="flex items-center gap-2">
              {step > 1 && (
                <button onClick={() => { setErr(''); setStep(s => s - 1); }} className="btn-secondary">
                  ← Back
                </button>
              )}
              {step < 3 ? (
                <button onClick={handleNext} className="btn-primary px-8">
                  Next <ChevronRight size={14} />
                </button>
              ) : (
                <button onClick={handleCreate} disabled={saving} className="btn-primary px-10 text-base">
                  {saving ? 'Launching…' : '🚀 Launch Campaign'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Campaigns Page ──────────────────────────────────────────────────────
export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showCustom, setShowCustom] = useState(false);

  const load = async () => {
    const c = await campaignsApi.list();
    setCampaigns(c || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
           <h2 className="text-2xl font-bold text-white tracking-tight">Automation Engine</h2>
           <p className="text-xs text-slate-500 mt-1">Cross-channel retargeting with auto-conversion tracking</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCustom(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(59,130,246,0.18)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(59,130,246,0.1)"}>
            <Sliders size={15} /> Custom Campaign
          </button>
          <button onClick={() => setShowModal(true)} className="btn-primary px-6 shadow-[0_0_20px_rgba(34,197,94,0.2)]">
            <Plus size={16}/> New Flow
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading && <div className="col-span-full py-12 text-center text-slate-500">Scanning automation flows...</div>}
        
        {!loading && campaigns.length === 0 && (
          <div className="col-span-full py-20 px-8 rounded-[2.5rem] bg-white/[0.01] border border-white/5 border-dashed flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 rounded-3xl bg-green-500/10 flex items-center justify-center text-4xl mb-6 border border-green-500/20">🚀</div>
            <h3 className="text-xl font-bold text-white mb-2">Ready to Launch?</h3>
            <p className="text-sm text-slate-500 max-w-sm mb-8 leading-relaxed">
              Your automation engine is currently at a clean slate. Create your first campaign to start recovering abandoned carts automatically.
            </p>
            <button onClick={() => setShowModal(true)} className="btn-primary px-10 py-3 shadow-[0_0_30px_rgba(34,197,94,0.3)]">
              Establish First Flow
            </button>
          </div>
        )}

        {campaigns.map(c => {
          const isCustom = c.campaign_type === 'custom';
          const type = CAMPAIGN_TYPES.find(t=>t.id===c.campaign_type) || CAMPAIGN_TYPES[0];
          const rate = c.total_sent > 0 ? ((c.total_recovered/c.total_sent)*100).toFixed(1) : "0.0";
          let filters = null;
          try { filters = c.filters ? JSON.parse(c.filters) : null; } catch (_) {}
          return (
            <div key={c.id} className="card p-6 border-white/5 relative bg-white/[0.01] group/card"
              style={isCustom ? { borderColor: "rgba(59,130,246,0.15)" } : {}}>
              <div className="absolute top-4 right-4 flex items-center gap-2">
                {isCustom
                  ? <span className="py-1 px-2 text-[9px] font-bold rounded-full uppercase tracking-tighter border"
                      style={{ background: "rgba(59,130,246,0.1)", color: "#60a5fa", borderColor: "rgba(59,130,246,0.25)" }}>Custom</span>
                  : <span className="py-1 px-2 bg-green-500/10 text-green-400 border border-green-500/20 text-[9px] font-bold rounded-full uppercase tracking-tighter animate-pulse">Running</span>
                }
                <button
                  onClick={async () => { if(confirm('Delete this campaign?')){ await campaignsApi.delete(c.id); load(); } }}
                  className="p-1.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg opacity-0 group-hover/card:opacity-100 transition-opacity hover:bg-red-500/20"
                ><Trash2 size={13}/></button>
              </div>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-3xl mb-4 border"
                style={isCustom
                  ? { background: "rgba(59,130,246,0.08)", borderColor: "rgba(59,130,246,0.2)" }
                  : { background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.08)" }}>
                {isCustom ? '🎯' : type.icon}
              </div>
              <h3 className="font-bold text-white mb-1">{c.name}</h3>
              <p className="text-[10px] text-slate-500 mb-3 uppercase tracking-widest">
                {isCustom ? 'Custom Audience' : type.targetSegment.replace('_',' ')} Target
              </p>
              {isCustom && filters?.rules?.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-4">
                  {filters.rules.slice(0, 3).map((r, i) => (
                    <span key={i} className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                      style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.15)", color: "#60a5fa" }}>
                      {r.field.replace(/_/g, ' ')} {r.op === 'gte' ? '≥' : r.op === 'lte' ? '≤' : '='} {r.value}
                    </span>
                  ))}
                  {filters.rules.length > 3 && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ color: "#475569" }}>
                      +{filters.rules.length - 3} more
                    </span>
                  )}
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                 <div>
                    <p className="text-[9px] text-slate-500 uppercase">Massages Sent</p>
                    <p className="text-lg font-bold text-white">{c.total_sent}</p>
                 </div>
                 <div>
                    <p className="text-[9px] text-slate-500 uppercase">Auto-Converted</p>
                    <p className="text-lg font-bold text-green-400">{c.total_recovered}</p>
                 </div>
              </div>

              <div className="pt-4 border-t border-white/5 space-y-4">
                 {(c.campaign_type === 'abandoned_cart' || c.campaign_type === 'abandoned_checkout' || c.campaign_type === 'product_view') && (
                    <div className="flex gap-1 justify-between">
                       {[1,2,3,4].map(stg => (
                          <div key={stg} className={`w-1/4 h-1 rounded-full ${c.total_sent >= stg ? 'bg-green-500' : 'bg-white/10'}`} title={`Follow-up Stage ${stg}`}></div>
                       ))}
                    </div>
                 )}
                 <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                       <div className="w-8 h-1 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full bg-green-500" style={{width: `${rate}%`}}></div>
                       </div>
                       <span className="text-[10px] text-green-400 font-bold">{rate}% rate</span>
                    </div>
                    <button onClick={async() => { 
                       await campaignsApi.send(c.id); load(); 
                       alert('Mock message sent and conversion tracked! Check visitors page to see updated status.');
                    }} className="p-2 bg-white/5 rounded-lg hover:text-green-400 border border-white/5 transition-all"><Play size={14}/></button>
                 </div>
              </div>
            </div>
          );
        })}
      </div>

      {showModal  && <CreateModal         onClose={() => setShowModal(false)}  onCreated={load} />}
      {showCustom && <CustomCampaignModal onClose={() => setShowCustom(false)} onCreated={load} />}
    </div>
  );
}
