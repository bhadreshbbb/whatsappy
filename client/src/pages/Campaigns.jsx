import React, { useEffect, useState, useCallback, useMemo } from "react";
import { translateTemplate } from "../translate";
import {
  Plus, Trash2, Play, ChevronDown, ChevronUp, X,
  Zap, Clock, CheckCircle, Globe, MessageSquare, ShoppingCart,
  Eye, TrendingDown, Package, Users, Settings, ToggleLeft, Gift, Layout,
  Filter, Sliders, UserCheck, Search, Target, ChevronRight, AlertCircle,
  Flame, Smartphone, Monitor, Repeat, Send, GitBranch, Image,
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
  {
    id: "abandoned_product_view",
    icon: "🔍",
    label: "Abandoned Product View",
    description: "Auto-reach users who viewed a specific product page but didn't add to cart. Uses single product template with dynamic product data.",
    color: "cyan",
    autoTarget: true,
    defaultDelay: 0.5,
    targetSegment: "product_view",
    singleProductOnly: true,
  },
  {
    id: "product_recommendation",
    icon: "🎯",
    label: "Product Recommendation",
    description: "Send a carousel of product recommendations to any audience segment. Requires a Meta carousel template.",
    color: "green",
    autoTarget: false,
    defaultDelay: 0,
    targetSegment: "all",
    carouselOnly: true,
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
  red:    "text-red-400 bg-red-400/10 border-red-400/20",
  pink:   "text-pink-400 bg-pink-400/10 border-pink-400/20",
  cyan:   "text-cyan-400 bg-cyan-400/10 border-cyan-400/20",
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
  const [stageVars, setStageVars] = useState({
    s1: { v1: '{product_name}', v2: '{product_price}' },
    s2: { v1: '{product_name}', v2: 'Still available — grab it before it sells out!' },
  });
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translatedTpl, setTranslatedTpl] = useState(null);
  const [validationErr, setValidationErr] = useState("");

  // ── Audience filters (same as Custom campaign) ────────────────────────────
  const [showFilters, setShowFilters] = useState(false);
  const [contacts, setContacts]       = useState([]);
  const [ctLoading, setCtLoading]     = useState(false);
  const [fStatus, setFStatus] = useState('');
  const [fCity,   setFCity]   = useState('');
  const [fDevice, setFDevice] = useState('');
  const [fAudLang,setFAudLang]= useState('');   // audience language (separate from message language)
  const [fScore,  setFScore]  = useState('');
  const [fCarts,  setFCarts]  = useState('');
  const [fPages,  setFPages]  = useState('');
  const [fEngage, setFEngage] = useState('');
  const [fRepeat, setFRepeat] = useState('');

  const audFilters = { status: fStatus, city: fCity, device: fDevice, lang: fAudLang,
                       score: fScore, carts: fCarts, pages: fPages, engage: fEngage, repeat: fRepeat };
  const activeFilterCount = Object.values(audFilters).filter(Boolean).length;
  const allCities = useMemo(() =>
    [...new Set(contacts.map(c => c.city).filter(Boolean))].sort(), [contacts]);
  const matchedContacts = useMemo(() => applyFilters(contacts, audFilters),
    [contacts, fStatus, fCity, fDevice, fAudLang, fScore, fCarts, fPages, fEngage, fRepeat]);

  const CH = () => ({ 'x-channel-id': localStorage.getItem('channelId') || 'demo' });
  const META_LANG_MAP = { en: 'en_US', hi: 'hi', gu: 'gu', ta: 'ta', te: 'te', mr: 'mr', bn: 'bn', ar: 'ar' };

  useEffect(() => {
    templatesApi.list().then(setTemplates);
    // Load ALL Meta templates so user can select any of them for a campaign
    fetch('/api/meta-templates', { headers: CH() })
      .then(r => r.json())
      .then(d => setMetaTemplates(d.templates || []))
      .catch(() => {});
    // Auto-detect dominant language from visitor geo analytics
    analyticsApi.topLanguage().then(data => {
      if (data?.topLang) {
        setDetectedLang(data.topLang);
        setLang(data.topLang);
      }
    }).catch(() => {});
    // Load contacts for audience filter preview
    setCtLoading(true);
    analyticsApi.contacts(60, 1000).then(d => setContacts(d?.contacts || []))
      .catch(() => {}).finally(() => setCtLoading(false));
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
        // Product Recommendation requires a carousel Meta template
        if (type?.carouselOnly) {
          if (!metaTemplateId) {
            setValidationErr("• Please select a carousel Meta template. Product Recommendation campaigns only work with carousel templates.");
            return;
          }
          setStep(3); return;
        }

        // Abandoned Product View requires a single product Meta template
        if (type?.singleProductOnly) {
          if (!metaTemplateId) {
            setValidationErr("• Please select a single product Meta template. Abandoned Product View campaigns require a non-carousel Meta template.");
            return;
          }
          setStep(3); return;
        }

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
      const audRules = [
        fStatus  && { field: 'status',           op: 'eq',       value: fStatus  },
        fCity    && { field: 'city',              op: 'contains', value: fCity    },
        fDevice  && { field: 'device',            op: 'eq',       value: fDevice  },
        fAudLang && { field: 'language',          op: 'eq',       value: fAudLang },
        fScore   && { field: 'power_score',       op: 'gte',      value: fScore   },
        fCarts   && { field: 'cart_events',       op: 'gte',      value: fCarts   },
        fPages   && { field: 'page_views',        op: 'gte',      value: fPages   },
        fEngage  && { field: 'engagement_score',  op: 'gte',      value: fEngage  },
      ].filter(Boolean);

      const campaign = await campaignsApi.create({
        name: `${type.label} (${language === 'per_user' ? 'Native Language' : (LANG_LABEL[language] || language.toUpperCase())})`,
        campaign_type: type.id,
        trigger_event: type.id,
        target_segment: type.targetSegment,
        target_language: language,
        template_id: isMultiStage ? templateIds[0] : templateId,
        template_ids: isMultiStage ? templateIds.filter(id => id !== "") : [],
        meta_template_id: metaTemplateId || null,
        stage_vars: type.singleProductOnly ? stageVars : null,
        delay_hours: delayHrs,
        is_active: true,
        filters: audRules.length > 0 ? JSON.stringify({ logic: 'AND', rules: audRules }) : null,
      });

      // Instant campaign → fire send in background (don't await — modal closes immediately)
      if (Number(delayHrs) === 0 && campaign?.id) {
        const cName = campaign.name;
        const cId   = campaign.id;
        campaignsApi.send(cId).then(result => {
          console.group(`%c[Instant Campaign] "${cName}" — sent:${result?.sent ?? 0}  skipped:${result?.skipped ?? 0}`, 'color:#a78bfa;font-weight:bold');
          if (result?.payloads?.length) {
            result.payloads.forEach((p, i) => {
              console.log(`%cMessage ${i+1} → ${p.phone} (${p.template})`, 'color:#60a5fa;font-weight:bold');
              console.log('%cMeta API Payload:', 'color:#f59e0b', JSON.stringify(p.payload, null, 2));
            });
          } else {
            console.warn('%cNo messages sent — check contacts have phones and Meta template is APPROVED', 'color:#f59e0b');
          }
          if (result?.errors?.length) console.error('[Errors]', result.errors);
          console.groupEnd();
        }).catch(e => console.error('[Instant Campaign Send Failed]', e));
      }

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
                   {/* ── Language selector — hidden for abandoned_product_view (locked to template language) ── */}
                   {!type?.singleProductOnly ? (
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
                   ) : metaTemplateId && (() => {
                     const selTpl = metaTemplates.find(t => t.id === metaTemplateId);
                     const tplLang = selTpl?.language || language || 'en';
                     const langEntry = LANGUAGES.find(l => l.code === tplLang);
                     return (
                       <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.2)' }}>
                         <Globe size={14} className="text-cyan-400 shrink-0" />
                         <div>
                           <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest">Language (from template)</p>
                           <p className="text-xs text-white font-semibold mt-0.5">
                             {langEntry?.flag} {langEntry?.label || tplLang.toUpperCase()}
                           </p>
                         </div>
                         <span className="ml-auto text-[9px] bg-cyan-500/10 text-cyan-500 px-2 py-0.5 rounded-full border border-cyan-500/20 font-bold">Auto-locked</span>
                       </div>
                     );
                   })()}

                   {/* ── Meta Templates ────────────────────────────────────── */}
                   <div className="space-y-2">
                     <label className="label flex items-center gap-2">
                       <span className="text-orange-400">📋</span>
                       {type?.carouselOnly ? 'Carousel Meta Template' : type?.singleProductOnly ? 'Single Product Meta Template' : 'Meta Template'}
                       {(type?.carouselOnly || type?.singleProductOnly) && <span className="text-[10px] text-red-400 font-bold">Required</span>}
                     </label>
                     <p className="text-[10px] text-slate-500 -mt-1">
                       {type?.carouselOnly
                         ? 'Select a carousel template. Only APPROVED templates will deliver. Payload format matches the Meta carousel API exactly.'
                         : type?.singleProductOnly
                           ? 'Select a single product (non-carousel) template. Product name, price & image are injected dynamically per user.'
                           : 'Select any created Meta template. Only APPROVED templates can deliver messages.'}
                     </p>
                     <div className="space-y-2">
                       {!type?.carouselOnly && !type?.singleProductOnly && (
                         <button
                           onClick={() => setMetaTplId("")}
                           className={`w-full p-2.5 rounded-xl border text-left flex justify-between items-center transition-all text-xs ${!metaTemplateId ? 'bg-slate-700/40 border-white/10 text-slate-400' : 'border-white/5 text-slate-500 hover:border-white/10'}`}>
                           <span>None — use regular template below</span>
                           {!metaTemplateId && <CheckCircle size={12} className="text-slate-400"/>}
                         </button>
                       )}
                       {(() => {
                         const filtered = type?.carouselOnly
                           ? metaTemplates.filter(t => t.is_carousel)
                           : type?.singleProductOnly
                             ? metaTemplates.filter(t => !t.is_carousel)
                             : metaTemplates;
                         if (filtered.length === 0) return (
                           <p className="text-[10px] text-slate-500 px-1">
                             {type?.carouselOnly
                               ? 'No carousel Meta templates found. Create one in the Templates page.'
                               : type?.singleProductOnly
                                 ? 'No single product templates found. Go to Templates → Custom Single Product to create one.'
                                 : 'No Meta templates found. Create one in the Templates page.'}
                           </p>
                         );
                         return filtered.map(t => {
                           const statusColor = t.meta_status === 'APPROVED' ? 'text-green-400' : t.meta_status === 'PENDING' ? 'text-yellow-400' : 'text-red-400';
                           const isSingleProd = type?.singleProductOnly;
                           const selBg    = isSingleProd ? 'bg-cyan-500/10 border-cyan-500/50 text-white'         : 'bg-orange-500/10 border-orange-500/50 text-white';
                           const hoverBg  = isSingleProd ? 'border-white/5 text-slate-400 hover:border-cyan-500/30 hover:bg-cyan-500/5' : 'border-white/5 text-slate-400 hover:border-orange-500/30 hover:bg-orange-500/5';
                           const checkCol = isSingleProd ? 'text-cyan-400' : 'text-orange-400';
                           return (
                             <button key={t.id} onClick={() => {
                               setMetaTplId(t.id);
                               // Auto-lock campaign language to the template's language
                               if (isSingleProd && t.language) setLang(t.language);
                             }}
                               className={`w-full p-3 rounded-2xl border text-left flex justify-between items-center transition-all ${metaTemplateId === t.id ? selBg : hoverBg}`}>
                               <div>
                                 <p className="text-xs font-bold">{t.name}</p>
                                 <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                   <span className={`text-[10px] font-semibold ${statusColor}`}>{t.meta_status || 'DRAFT'}</span>
                                   {!t.is_carousel && <span className="text-[10px] text-cyan-500">· Single Product</span>}
                                   {t.is_carousel && <span className="text-[10px] text-orange-400">· {t.carousel_cards?.length} cards</span>}
                                   {t.auto_product_mode && <span className="text-[10px] text-orange-300">· Auto-products</span>}
                                   <span className="text-[10px] text-slate-500">· {t.language?.toUpperCase()}</span>
                                 </div>
                               </div>
                               {metaTemplateId === t.id && <CheckCircle size={14} className={checkCol}/>}
                             </button>
                           );
                         });
                       })()}
                     </div>
                   </div>

                   {/* ── Regular templates (hidden when Meta template selected or carouselOnly) ─── */}
                   {!metaTemplateId && !type?.carouselOnly && (
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

                   {/* Meta template preview */}
                   {metaTemplateId && metaPayloadPreview ? (
                     <div className="space-y-2">
                       <div className="p-2 rounded-xl text-[10px] font-mono"
                         style={{ background: metaPayloadPreview.is_single_product ? 'rgba(6,182,212,0.05)' : 'rgba(251,146,60,0.05)', border: `1px solid ${metaPayloadPreview.is_single_product ? 'rgba(6,182,212,0.2)' : 'rgba(251,146,60,0.2)'}`, color: metaPayloadPreview.is_single_product ? '#22d3ee' : '#fb923c' }}>
                         POST {metaPayloadPreview.api_url || 'https://graph.facebook.com/v25.0/.../messages'}
                       </div>
                       <div className="flex items-center gap-2 text-[10px] text-slate-500 flex-wrap">
                         <span>Lang: <span className="text-white font-mono">{metaPayloadPreview.payload?.template?.language?.code}</span></span>
                         {metaPayloadPreview.is_single_product && <span className="text-cyan-500 font-bold">· Single Product</span>}
                         {metaPayloadPreview.last_refresh && <span>· Refreshed: {new Date(metaPayloadPreview.last_refresh).toLocaleTimeString()}</span>}
                       </div>

                       {/* ── Single product template info ── */}
                       {metaPayloadPreview.is_single_product && metaPayloadPreview.single_product_info && (() => {
                         const sp = metaPayloadPreview.single_product_info;
                         return (
                           <div className="space-y-2">
                             <div className="px-3 py-2 rounded-xl text-[11px]" style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.15)' }}>
                               <p className="text-[10px] font-bold text-cyan-400 mb-1.5 uppercase tracking-widest">Template Structure</p>
                               {sp.header_type === 'IMAGE' && (
                                 <div className="flex items-center gap-1.5 text-slate-400 text-[10px] mb-1">
                                   <Image size={10} className="text-cyan-400"/> <span>Header image → auto-uploaded per user's product</span>
                                 </div>
                               )}
                               <div className="text-slate-300 text-[10px] mb-1 font-mono whitespace-pre-wrap">{sp.body}</div>
                               {sp.footer && <div className="text-slate-600 text-[10px] italic">{sp.footer}</div>}
                               <div className="flex flex-wrap gap-1 mt-2">
                                 {sp.buttons.map((b, i) => (
                                   <span key={i} className="text-[9px] px-2 py-0.5 rounded-full font-bold"
                                     style={{ background: b.type === 'COPY_CODE' ? 'rgba(168,85,247,0.15)' : 'rgba(59,130,246,0.15)', color: b.type === 'COPY_CODE' ? '#c084fc' : '#60a5fa', border: `1px solid ${b.type === 'COPY_CODE' ? 'rgba(168,85,247,0.3)' : 'rgba(59,130,246,0.3)'}` }}>
                                     {b.type === 'COPY_CODE' ? `🎟 ${b.coupon_code || 'Coupon'}` : `🔗 ${b.text}`}
                                   </span>
                                 ))}
                               </div>
                             </div>
                             <div className="flex items-start gap-2 px-3 py-2 rounded-xl text-[10px]" style={{ background: 'rgba(6,182,212,0.04)', border: '1px solid rgba(6,182,212,0.1)' }}>
                               <Zap size={10} className="text-cyan-400 mt-0.5 shrink-0"/>
                               <p className="text-slate-400">{sp.note}</p>
                             </div>
                           </div>
                         );
                       })()}

                       {/* ── Carousel product cards ── */}
                       {!metaPayloadPreview.is_single_product && (
                         <div className="space-y-1 max-h-40 overflow-y-auto">
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
                       )}

                       {/* Payload JSON */}
                       <div className="bg-black/20 rounded-xl p-2 max-h-48 overflow-y-auto">
                         <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest mb-1">Message Payload (sample)</p>
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
             <div className="max-w-2xl mx-auto space-y-6">
                {/* Campaign Summary */}
                <div className="p-5 bg-white/[0.02] border border-white/5 rounded-2xl text-center">
                   <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 font-bold text-blue-400">Campaign Summary</p>
                   <h2 className="text-lg font-bold text-white mb-1">{type.label}</h2>
                   <p className="text-xs text-slate-400">Auto-targets <span className="text-white font-medium">{type.targetSegment.replace(/_/g,' ')}</span> users from your tracker.</p>
                </div>

                {/* ── Stage Variables (abandoned_product_view only) ─── */}
                {type?.singleProductOnly && (
                  <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(6,182,212,0.25)" }}>
                    <div className="px-4 py-3 flex items-center gap-2" style={{ background: "rgba(6,182,212,0.07)", borderBottom: "1px solid rgba(6,182,212,0.15)" }}>
                      <span className="text-sm">📝</span>
                      <span className="text-xs font-bold text-cyan-400">Message Variable Values</span>
                      <span className="text-[10px] text-slate-500 ml-1">{"— what goes in {{1}} and {{2}} for each stage"}</span>
                    </div>
                    <div className="p-4 space-y-5" style={{ background: "rgba(6,182,212,0.03)" }}>
                      <p className="text-[10px]" style={{ color: "#64748b" }}>
                        Use <code style={{ color: "#22d3ee", background: "rgba(6,182,212,0.1)", padding: "1px 5px", borderRadius: "4px" }}>{"{product_name}"}</code>{" "}
                        <code style={{ color: "#22d3ee", background: "rgba(6,182,212,0.1)", padding: "1px 5px", borderRadius: "4px" }}>{"{product_price}"}</code>{" "}
                        <code style={{ color: "#22d3ee", background: "rgba(6,182,212,0.1)", padding: "1px 5px", borderRadius: "4px" }}>{"{customer_name}"}</code>{" "}
                        as tokens — replaced with real values per user at send time.
                      </p>
                      {[
                        { key: 's1', label: 'Stage 1', sub: 'First message (30 min after inactivity)', color: '#22d3ee' },
                        { key: 's2', label: 'Stage 2', sub: 'Follow-up (24h later)', color: '#a78bfa' },
                      ].map(({ key, label, sub, color }) => (
                        <div key={key} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color }}>{label}</span>
                            <span className="text-[10px]" style={{ color: "#475569" }}>— {sub}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { vk: 'v1', placeholder: 'e.g. Hi {customer_name}! 👋 You viewed *{product_name}*' },
                              { vk: 'v2', placeholder: 'e.g. 💰 Price: {product_price} — grab it now! 🛍️' },
                            ].map(({ vk, placeholder }) => (
                              <div key={vk}>
                                <label className="text-[10px] font-semibold mb-1 block" style={{ color: "#64748b" }}>
                                  {vk === 'v1' ? '{{1}}' : '{{2}}'}
                                </label>
                                <textarea
                                  rows={2}
                                  className="w-full text-[11px] px-2.5 py-2 rounded-lg outline-none resize-none"
                                  style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${stageVars[key][vk] ? 'rgba(6,182,212,0.35)' : 'rgba(255,255,255,0.08)'}`, color: "#e2e8f0" }}
                                  placeholder={placeholder}
                                  value={stageVars[key][vk]}
                                  onChange={e => setStageVars(prev => ({ ...prev, [key]: { ...prev[key], [vk]: e.target.value } }))}
                                />
                              </div>
                            ))}
                          </div>
                          {/* Live preview */}
                          <div className="text-[10px] px-3 py-2 rounded-lg space-y-0.5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                            <p className="font-semibold" style={{ color: "#475569" }}>Preview (sample values):</p>
                            <p style={{ color: "#94a3b8" }}>
                              {(stageVars[key].v1 || '{{1}}').replace(/{product_name}/g, 'Blue Kurti').replace(/{product_price}/g, '₹799').replace(/{customer_name}/g, 'Priya')}
                            </p>
                            <p style={{ color: "#94a3b8" }}>
                              {(stageVars[key].v2 || '{{2}}').replace(/{product_name}/g, 'Blue Kurti').replace(/{product_price}/g, '₹799').replace(/{customer_name}/g, 'Priya')}
                            </p>
                          </div>
                        </div>
                      ))}
                      <div className="text-[10px] p-3 rounded-xl" style={{ background: "rgba(6,182,212,0.05)", border: "1px solid rgba(6,182,212,0.15)", color: "#67e8f9" }}>
                        <p className="font-semibold mb-1">Auto-injected per user (no input needed):</p>
                        <p style={{ color: "#94a3b8" }}>• Header image — uploaded to Meta Media API per product, media_id passed in payload</p>
                        <p style={{ color: "#94a3b8" }}>• Product URL — auto-detected from product_view record</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Audience Filters — hidden for abandoned_product_view (auto-targets product_view users) ── */}
                {!type?.singleProductOnly && <div className="rounded-2xl border border-white/8 overflow-hidden">
                  {/* Header — toggle */}
                  <button onClick={() => setShowFilters(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                    <div className="flex items-center gap-2">
                      <Filter size={13} className="text-blue-400" />
                      <span className="text-xs font-semibold text-white">Refine Audience</span>
                      {activeFilterCount > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                          style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#60a5fa' }}>
                          {activeFilterCount} active
                        </span>
                      )}
                      {activeFilterCount === 0 && (
                        <span className="text-[10px] text-slate-600">optional — leave blank to target all</span>
                      )}
                    </div>
                    <ChevronDown size={14} className={`text-slate-500 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                  </button>

                  {showFilters && (
                    <div className="px-4 pb-4 pt-3 space-y-3 border-t border-white/5">
                      {/* Live count */}
                      <div className="flex items-center justify-between p-3 rounded-xl"
                        style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.12)' }}>
                        <div className="flex items-center gap-2">
                          <Users size={14} className="text-blue-400" />
                          <span className="text-xs text-white font-semibold">
                            {ctLoading ? 'Loading…' : <><span className="text-blue-400">{matchedContacts.length}</span> / {contacts.length} contacts match</>}
                          </span>
                        </div>
                        {activeFilterCount > 0 && (
                          <button onClick={() => { setFStatus(''); setFCity(''); setFDevice(''); setFAudLang(''); setFScore(''); setFCarts(''); setFPages(''); setFEngage(''); setFRepeat(''); }}
                            className="text-[10px] px-2 py-1 rounded-lg flex items-center gap-1"
                            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                            <X size={9} /> Clear
                          </button>
                        )}
                      </div>

                      <datalist id="create-modal-city-list">
                        {allCities.map(c => <option key={c} value={c} />)}
                      </datalist>

                      {/* Filter grid */}
                      <div className="grid grid-cols-2 gap-2">
                        <FilterCard label="Status" icon={UserCheck} active={!!fStatus}>
                          <select value={fStatus} onChange={e => setFStatus(e.target.value)} className="input w-full text-xs py-1.5">
                            <option value="">All contacts</option>
                            <option value="active">Active Visitor</option>
                            <option value="product_view">Product View</option>
                            <option value="abandoned_cart">Abandoned Cart</option>
                            <option value="followup_complete">Followup Complete</option>
                            <option value="purchased">Purchased</option>
                          </select>
                        </FilterCard>

                        <FilterCard label="City" icon={Globe} active={!!fCity}>
                          <input value={fCity} onChange={e => setFCity(e.target.value)}
                            list="create-modal-city-list" placeholder="Type or pick a city…"
                            className="input w-full text-xs py-1.5" />
                        </FilterCard>

                        <FilterCard label="Device" icon={Smartphone} active={!!fDevice}>
                          <select value={fDevice} onChange={e => setFDevice(e.target.value)} className="input w-full text-xs py-1.5">
                            <option value="">All devices</option>
                            <option value="mobile">📱 Mobile</option>
                            <option value="desktop">🖥 Desktop</option>
                            <option value="tablet">📲 Tablet</option>
                          </select>
                        </FilterCard>

                        <FilterCard label="Language" icon={Globe} active={!!fAudLang}>
                          <select value={fAudLang} onChange={e => setFAudLang(e.target.value)} className="input w-full text-xs py-1.5">
                            <option value="">All languages</option>
                            {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
                          </select>
                        </FilterCard>

                        <FilterCard label="Power Score (min)" icon={Flame} active={!!fScore}>
                          <select value={fScore} onChange={e => setFScore(e.target.value)} className="input w-full text-xs py-1.5">
                            <option value="">Any score</option>
                            <option value="20">20+ (Low intent)</option>
                            <option value="40">40+ (Medium)</option>
                            <option value="60">60+ (High intent)</option>
                            <option value="80">80+ (Hot 🔥)</option>
                          </select>
                        </FilterCard>

                        <FilterCard label="Cart Events (min)" icon={ShoppingCart} active={!!fCarts}>
                          <select value={fCarts} onChange={e => setFCarts(e.target.value)} className="input w-full text-xs py-1.5">
                            <option value="">Any</option>
                            <option value="1">1+ cart event</option>
                            <option value="2">2+ cart events</option>
                            <option value="3">3+ cart events</option>
                            <option value="5">5+ cart events</option>
                          </select>
                        </FilterCard>

                        <FilterCard label="Page Views (min)" icon={Eye} active={!!fPages}>
                          <select value={fPages} onChange={e => setFPages(e.target.value)} className="input w-full text-xs py-1.5">
                            <option value="">Any</option>
                            <option value="2">2+ pages</option>
                            <option value="5">5+ pages</option>
                            <option value="10">10+ pages</option>
                            <option value="20">20+ pages</option>
                          </select>
                        </FilterCard>

                        <FilterCard label="Engagement Score (min)" icon={Zap} active={!!fEngage}>
                          <select value={fEngage} onChange={e => setFEngage(e.target.value)} className="input w-full text-xs py-1.5">
                            <option value="">Any</option>
                            <option value="30">30+ (Mild)</option>
                            <option value="50">50+ (Good)</option>
                            <option value="70">70+ (High)</option>
                            <option value="85">85+ (Very high)</option>
                          </select>
                        </FilterCard>

                        <FilterCard label="Repeat Customer" icon={Repeat} active={!!fRepeat}>
                          <select value={fRepeat} onChange={e => setFRepeat(e.target.value)} className="input w-full text-xs py-1.5">
                            <option value="">All</option>
                            <option value="yes">🔁 Repeat only</option>
                            <option value="no">🆕 First-time only</option>
                          </select>
                        </FilterCard>
                      </div>

                      {/* Contact preview list */}
                      {matchedContacts.length > 0 && (
                        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                          <div className="px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wide"
                            style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            Preview — first {Math.min(matchedContacts.length, 8)} of {matchedContacts.length}
                          </div>
                          {matchedContacts.slice(0, 8).map((c, i) => (
                            <div key={i} className="flex items-center justify-between px-3 py-2 text-xs"
                              style={{ borderBottom: i < Math.min(matchedContacts.length, 8) - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                                  style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>
                                  {(c.name || c.phone || '?')[0].toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-white font-medium truncate">{c.name || 'Unknown'}</div>
                                  <div className="text-slate-500 text-[10px]">{c.phone || '—'}</div>
                                </div>
                              </div>
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ml-2"
                                style={{
                                  background: c.status === 'purchased' ? 'rgba(74,222,128,0.1)' : c.status === 'abandoned_cart' ? 'rgba(251,146,60,0.1)' : 'rgba(148,163,184,0.08)',
                                  border: c.status === 'purchased' ? '1px solid rgba(74,222,128,0.2)' : c.status === 'abandoned_cart' ? '1px solid rgba(251,146,60,0.2)' : '1px solid rgba(148,163,184,0.12)',
                                  color: c.status === 'purchased' ? '#4ade80' : c.status === 'abandoned_cart' ? '#fb923c' : '#94a3b8',
                                }}>
                                {(c.status || 'visitor').replace(/_/g, ' ')}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Active filter tags */}
                      {activeFilterCount > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {[
                            fStatus  && { label: 'Status',      value: fStatus.replace(/_/g, ' ')  },
                            fCity    && { label: 'City',         value: fCity                       },
                            fDevice  && { label: 'Device',       value: fDevice                     },
                            fAudLang && { label: 'Language',     value: LANGUAGES.find(l => l.code === fAudLang)?.label || fAudLang },
                            fScore   && { label: 'Power Score',  value: `${fScore}+`                },
                            fCarts   && { label: 'Cart Events',  value: `${fCarts}+`                },
                            fPages   && { label: 'Page Views',   value: `${fPages}+`                },
                            fEngage  && { label: 'Engagement',   value: `${fEngage}+`               },
                            fRepeat  && { label: 'Customer Type', value: fRepeat === 'yes' ? '🔁 Repeat' : '🆕 First-time' },
                          ].filter(Boolean).map((f, i) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                              style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', color: '#60a5fa' }}>
                              {f.label}: <span className="text-white">{f.value}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>}

                {/* Automation Delay */}
                {type?.singleProductOnly ? (
                  <div className="p-4 rounded-2xl" style={{ background: 'rgba(6,182,212,0.04)', border: '1px solid rgba(6,182,212,0.2)' }}>
                    <label className="text-xs font-semibold text-cyan-400 flex items-center gap-2 mb-3">
                      <Clock size={13} /> Automation Schedule — Fixed
                    </label>
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.15)' }}>
                        <span className="text-base">⏱️</span>
                        <div>
                          <p className="text-xs font-bold text-cyan-300">Stage 1 — 30 minutes</p>
                          <p className="text-[10px]" style={{ color: '#64748b' }}>First message sent after 30 min of inactivity since product view</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.15)' }}>
                        <span className="text-base">🔄</span>
                        <div>
                          <p className="text-xs font-bold" style={{ color: '#a78bfa' }}>Stage 2 — 24 hours later</p>
                          <p className="text-[10px]" style={{ color: '#64748b' }}>Follow-up message sent 24h after Stage 1 if no action taken</p>
                        </div>
                      </div>
                      <p className="text-[10px] mt-1" style={{ color: '#475569' }}>If user adds to cart — automatically exits this campaign and enters Abandoned Cart flow.</p>
                    </div>
                  </div>
                ) : (
                <div className="p-4 rounded-2xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-2 mb-3">
                    <Clock size={13} className="text-green-400" /> Automation Delay
                  </label>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {[0, 1, 2, 6, 12, 24, 48].map(h => (
                      <button key={h} onClick={() => setDelay(h)}
                        className="text-xs px-3 py-1.5 rounded-xl font-semibold transition-all"
                        style={Number(delayHrs) === h
                          ? { background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.4)', color: '#4ade80' }
                          : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: '#475569' }}>
                        {h === 0 ? '⚡ Instant' : `${h}h`}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-4">
                    <input type="range" min="0" max="48" value={delayHrs} onChange={e => setDelay(Number(e.target.value))} className="flex-1 accent-green-500" />
                    <span className="text-xl font-bold text-green-400 min-w-[52px] text-right">
                      {Number(delayHrs) === 0 ? 'Now' : `${delayHrs}h`}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-600 mt-2 italic">
                    {Number(delayHrs) === 0
                      ? 'Campaign sends immediately when triggered.'
                      : `Recommendation: ${(type.id === 'abandoned_cart' || type.id === 'abandoned_checkout') ? '1 hour' : 'Instant (0h)'} is best for conversion.`}
                  </p>
                </div>
                )}

                <div className="pt-2 flex gap-4">
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

function applyFilters(contacts, f) {
  return contacts.filter(c => {
    if (f.status  && c.status  !== f.status)  return false;
    if (f.city    && !(c.city  || '').toLowerCase().includes(f.city.toLowerCase())) return false;
    if (f.device  && c.device  !== f.device)  return false;
    if (f.lang    && c.language !== f.lang)   return false;
    if (f.score   && Number(c.power_score      || 0) < Number(f.score))   return false;
    if (f.carts   && Number(c.cart_events      || 0) < Number(f.carts))   return false;
    if (f.pages   && Number(c.page_views       || 0) < Number(f.pages))   return false;
    if (f.engage  && Number(c.engagement_score || 0) < Number(f.engage))  return false;
    if (f.repeat === 'yes' && !c.is_repeat)  return false;
    if (f.repeat === 'no'  && !!c.is_repeat) return false;
    return true;
  });
}

function FilterCard({ label, icon: Icon, children, active }) {
  return (
    <div className="p-3 rounded-xl space-y-1.5 transition-all"
      style={{
        background: active ? "rgba(59,130,246,0.07)" : "rgba(255,255,255,0.02)",
        border: `1px solid ${active ? "rgba(59,130,246,0.25)" : "rgba(255,255,255,0.06)"}`,
      }}>
      <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: active ? "#60a5fa" : "#64748b" }}>
        {Icon && <Icon size={10} />} {label}
      </label>
      {children}
    </div>
  );
}

function CustomCampaignModal({ onClose, onCreated }) {
  const [step, setStep]               = useState(1);
  const [name, setName]               = useState('');
  const [delayHrs, setDelay]          = useState(0);
  const [runTimes, setRunTimes]       = useState(1);   // 0 = infinite
  const [templateId, setTplId]        = useState('');
  const [metaTemplateId, setMetaTplId]= useState('');  // selected meta template
  const [metaPayloadPreview, setMetaPayloadPreview] = useState(null);
  const [templates, setTemplates]     = useState([]);
  const [metaTemplates, setMetaTpls]  = useState([]);  // all meta templates
  const [tplSearch, setTplSearch]     = useState('');
  const [contacts, setContacts]       = useState([]);
  const [ctLoading, setCtLoading]     = useState(false);
  const [saving, setSaving]           = useState(false);
  const [err, setErr]                 = useState('');

  // Audience filters — all are AND, just pick values
  const [fStatus, setFStatus] = useState('');
  const [fCity,   setFCity]   = useState('');
  const [fDevice, setFDevice] = useState('');
  const [fLang,   setFLang]   = useState('');
  const [fScore,  setFScore]  = useState('');
  const [fCarts,  setFCarts]  = useState('');
  const [fPages,  setFPages]  = useState('');
  const [fEngage, setFEngage] = useState('');
  const [fRepeat, setFRepeat] = useState('');

  useEffect(() => {
    templatesApi.list().then(setTemplates).catch(() => {});
    const chHeaders = { 'x-channel-id': localStorage.getItem('channelId') || 'demo' };
    fetch('/api/meta-templates', { headers: chHeaders })
      .then(r => r.json()).then(d => setMetaTpls(d.templates || [])).catch(() => {});
    setCtLoading(true);
    analyticsApi.contacts(60, 1000).then(d => {
      setContacts(d?.contacts || []);
    }).catch(() => {}).finally(() => setCtLoading(false));
  }, []);

  useEffect(() => {
    if (!metaTemplateId) { setMetaPayloadPreview(null); return; }
    const chHeaders = { 'x-channel-id': localStorage.getItem('channelId') || 'demo' };
    fetch(`/api/meta-templates/${metaTemplateId}/send-payload`, { headers: chHeaders })
      .then(r => r.json()).then(setMetaPayloadPreview).catch(() => setMetaPayloadPreview(null));
  }, [metaTemplateId]);

  const filters = { status: fStatus, city: fCity, device: fDevice, lang: fLang,
                    score: fScore, carts: fCarts, pages: fPages, engage: fEngage, repeat: fRepeat };
  const matched = useMemo(() => applyFilters(contacts, filters),
    [contacts, fStatus, fCity, fDevice, fLang, fScore, fCarts, fPages, fEngage, fRepeat]);

  const activeTpl = templates.find(t => String(t.id) === String(templateId));
  const filteredTpls = useMemo(() =>
    templates.filter(t => !tplSearch ||
      (t.name || '').toLowerCase().includes(tplSearch.toLowerCase())
    ), [templates, tplSearch]);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  // All cities from contacts for datalist suggestions
  const allCities = useMemo(() =>
    [...new Set(contacts.map(c => c.city).filter(Boolean))].sort(), [contacts]);

  const handleNext = () => {
    setErr('');
    if (step === 1) {
      if (!name.trim())                    { setErr('Please enter a campaign name.'); return; }
      if (!templateId && !metaTemplateId)  { setErr('Please select a message template.'); return; }
      setStep(2);
    } else if (step === 2) {
      if (matched.length === 0) { setErr('No contacts match these filters. Adjust your selection.'); return; }
      setStep(3);
    }
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      const rules = [
        fStatus && { field: 'status',           op: 'eq',       value: fStatus },
        fCity   && { field: 'city',              op: 'contains', value: fCity   },
        fDevice && { field: 'device',            op: 'eq',       value: fDevice },
        fLang   && { field: 'language',          op: 'eq',       value: fLang   },
        fScore  && { field: 'power_score',       op: 'gte',      value: fScore  },
        fCarts  && { field: 'cart_events',       op: 'gte',      value: fCarts  },
        fPages  && { field: 'page_views',        op: 'gte',      value: fPages  },
        fEngage && { field: 'engagement_score',  op: 'gte',      value: fEngage },
      ].filter(Boolean);
      const campaign = await campaignsApi.create({
        name: name.trim(),
        campaign_type:   'custom',
        target_segment:  'custom',
        target_language: fLang || 'en',
        template_id:     metaTemplateId ? null : templateId,
        template_ids:    [],
        meta_template_id: metaTemplateId || null,
        delay_hours:     Number(delayHrs),
        run_times:       runTimes,
        is_active:       true,
        filters: JSON.stringify({ logic: 'AND', rules }),
      });

      // Instant campaign → fire send in background (don't await — modal closes immediately)
      if (Number(delayHrs) === 0 && campaign?.id) {
        const cName = campaign.name;
        const cId   = campaign.id;
        campaignsApi.send(cId).then(result => {
          console.group(`%c[Instant Campaign] "${cName}" — sent:${result?.sent ?? 0}  skipped:${result?.skipped ?? 0}`, 'color:#a78bfa;font-weight:bold');
          if (result?.payloads?.length) {
            result.payloads.forEach((p, i) => {
              console.log(`%cMessage ${i+1} → ${p.phone} (${p.template})`, 'color:#60a5fa;font-weight:bold');
              console.log('%cMeta API Payload:', 'color:#f59e0b', JSON.stringify(p.payload, null, 2));
            });
          } else {
            console.warn('%cNo messages sent — check contacts have phones and Meta template is APPROVED', 'color:#f59e0b');
          }
          if (result?.errors?.length) console.error('[Errors]', result.errors);
          console.groupEnd();
        }).catch(e => console.error('[Instant Campaign Send Failed]', e));
      }

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
            <div className="flex gap-6 h-full">{/* two-col layout */}
            <div className="flex-1 space-y-6 min-w-0">

              <div className="space-y-1.5">
                <label className="label flex items-center gap-1.5">
                  <Target size={12} className="text-blue-400" /> Campaign Name
                </label>
                <input value={name} onChange={e => setName(e.target.value)}
                  placeholder="e.g. Diwali Sale — Mumbai Abandoned Carts"
                  className="input w-full" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Delay */}
                <div className="space-y-2 p-4 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <label className="label flex items-center gap-1.5 mb-1">
                    <Clock size={12} className="text-orange-400" /> Delay Between Each Run
                  </label>
                  <div className="flex items-center gap-3">
                    <input type="range" min="0" max="72" value={delayHrs}
                      onChange={e => setDelay(e.target.value)} className="flex-1 accent-orange-400" />
                    <div className="text-right min-w-[48px]">
                      <span className="text-xl font-bold text-orange-400">{delayHrs}</span>
                      <span className="text-xs text-slate-500 ml-1">hrs</span>
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {[0, 1, 2, 6, 12, 24, 48].map(h => (
                      <button key={h} onClick={() => setDelay(h)}
                        className="text-[10px] px-2 py-1 rounded-lg transition-all"
                        style={Number(delayHrs) === h
                          ? { background: "rgba(251,146,60,0.15)", border: "1px solid rgba(251,146,60,0.35)", color: "#fb923c" }
                          : { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", color: "#475569" }}>
                        {h === 0 ? 'Instant' : `${h}h`}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px]" style={{ color: "#475569" }}>
                    {Number(delayHrs) === 0
                      ? 'Campaign runs immediately when triggered.'
                      : `Each run fires ${delayHrs}h after the previous one.`}
                  </p>
                </div>

                {/* Run times */}
                <div className="space-y-2 p-4 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <label className="label flex items-center gap-1.5 mb-1">
                    <Repeat size={12} className="text-purple-400" /> How Many Times to Run
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[1, 2, 3, 4, 5, 6, 0].map(n => (
                      <button key={n} onClick={() => setRunTimes(n)}
                        className="py-2.5 rounded-xl text-xs font-bold transition-all"
                        style={runTimes === n
                          ? { background: n === 0 ? "rgba(168,85,247,0.2)" : "rgba(59,130,246,0.2)",
                              border: `1px solid ${n === 0 ? "rgba(168,85,247,0.4)" : "rgba(59,130,246,0.4)"}`,
                              color: n === 0 ? "#c084fc" : "#60a5fa" }
                          : { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", color: "#475569" }}>
                        {n === 0 ? '∞' : n}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px]" style={{ color: "#475569" }}>
                    {runTimes === 0
                      ? 'Runs forever — repeats every ' + (Number(delayHrs) === 0 ? 'immediately' : `${delayHrs}h`) + ' indefinitely.'
                      : runTimes === 1
                      ? 'Sends once to each matched contact.'
                      : `Sends ${runTimes} times to each contact, ${Number(delayHrs) === 0 ? 'back-to-back' : `${delayHrs}h apart`}.`}
                  </p>
                </div>

              </div>

              <div className="space-y-4">
                <label className="label flex items-center gap-1.5">
                  <MessageSquare size={12} className="text-green-400" /> Message Template
                </label>

                {/* ── Meta Templates (carousel + all) ── */}
                {metaTemplates.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#f97316" }}>Meta Templates</p>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                      {metaTemplates.map(t => {
                        const sel = metaTemplateId === t.id;
                        const statusColor = t.meta_status === 'APPROVED' ? '#4ade80' : t.meta_status === 'PENDING' ? '#facc15' : '#f87171';
                        return (
                          <button key={t.id}
                            onClick={() => { setMetaTplId(t.id); setTplId(''); }}
                            className="w-full p-3 rounded-xl border text-left flex items-center justify-between transition-all"
                            style={sel
                              ? { background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.4)", color: "#fff" }
                              : { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", color: "#94a3b8" }}>
                            <div>
                              <p className="text-xs font-semibold text-white">{t.name}</p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <span className="text-[10px] font-semibold" style={{ color: statusColor }}>{t.meta_status || 'DRAFT'}</span>
                                {t.is_carousel && <span className="text-[10px]" style={{ color: "#f97316" }}>· {t.carousel_cards?.length} cards</span>}
                                {t.auto_product_mode && <span className="text-[10px]" style={{ color: "#fb923c" }}>· Auto-products</span>}
                                <span className="text-[10px]" style={{ color: "#64748b" }}>· {t.language?.toUpperCase()}</span>
                              </div>
                            </div>
                            {sel && <CheckCircle size={13} className="text-orange-400 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── Regular Templates ── */}
                <div className="space-y-1.5">
                  {metaTemplates.length > 0 && (
                    <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#64748b" }}>Regular Templates</p>
                  )}
                  <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#475569" }} />
                    <input value={tplSearch} onChange={e => setTplSearch(e.target.value)}
                      placeholder="Search templates…" className="input w-full pl-7 text-xs py-1.5" />
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {filteredTpls.length === 0 && (
                      <p className="text-xs text-center py-3" style={{ color: "#475569" }}>No regular templates found.</p>
                    )}
                    {filteredTpls.map(t => (
                      <button key={t.id}
                        onClick={() => { setTplId(t.id); setMetaTplId(''); }}
                        className="w-full p-3 rounded-xl border text-left flex items-center justify-between transition-all"
                        style={String(templateId) === String(t.id)
                          ? { background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", color: "#fff" }
                          : { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", color: "#94a3b8" }}>
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
            </div>{/* end left col */}

            {/* ── Right: Payload Preview ── */}
            <div className="w-80 shrink-0 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#64748b" }}>Payload Preview</p>
              {metaTemplateId && metaPayloadPreview ? (
                <div className="space-y-2">
                  <div className="p-2 rounded-xl text-[10px] font-mono" style={{ background: "rgba(249,115,22,0.05)", border: "1px solid rgba(249,115,22,0.2)", color: "#f97316" }}>
                    POST {metaPayloadPreview.api_url || 'https://graph.facebook.com/v25.0/.../messages'}
                  </div>
                  <div className="flex items-center gap-2 text-[10px]" style={{ color: "#64748b" }}>
                    <span>Lang: <span className="text-white font-mono">{metaPayloadPreview.payload?.template?.language?.code}</span></span>
                    {metaPayloadPreview.last_refresh && (
                      <span>· {new Date(metaPayloadPreview.last_refresh).toLocaleTimeString()}</span>
                    )}
                  </div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {(metaPayloadPreview.products || []).filter(p => p.title).map((p, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-lg px-2 py-1.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        {p.image && <img src={p.image} alt="" className="w-8 h-8 object-cover rounded shrink-0" onError={e => e.target.style.display='none'} />}
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-[11px] font-medium truncate">Card {i+1}: {p.title}</p>
                          {p.price && <p className="text-green-400 text-[10px]">{p.price}</p>}
                        </div>
                      </div>
                    ))}
                    {!(metaPayloadPreview.products || []).some(p => p.title) && (
                      <p className="text-[10px] text-center py-2" style={{ color: "#475569" }}>Products auto-fill at send time.</p>
                    )}
                  </div>
                  <div className="rounded-xl p-2 max-h-64 overflow-y-auto" style={{ background: "rgba(0,0,0,0.3)" }}>
                    <pre className="text-[10px] font-mono whitespace-pre-wrap" style={{ color: "#94a3b8" }}>{JSON.stringify(metaPayloadPreview.payload, null, 2)}</pre>
                  </div>
                </div>
              ) : templateId && templates.find(t => String(t.id) === String(templateId)) ? (
                <div className="rounded-xl p-3 space-y-2" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <p className="text-xs font-semibold text-white">{templates.find(t => String(t.id) === String(templateId))?.name}</p>
                  <p className="text-[11px] leading-relaxed" style={{ color: "#94a3b8" }}>
                    {templates.find(t => String(t.id) === String(templateId))?.body_text || 'No preview available.'}
                  </p>
                </div>
              ) : (
                <div className="rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-center h-32" style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.08)" }}>
                  <Eye size={18} style={{ color: "#334155" }} />
                  <p className="text-[10px]" style={{ color: "#475569" }}>Select a template to preview the send payload</p>
                </div>
              )}
            </div>{/* end right col */}

          </div>
          )}

          {/* ══ STEP 2: Audience Filters ══ */}
          {step === 2 && (
            <div className="space-y-5">

              {/* Live count bar */}
              <div className="flex items-center justify-between p-4 rounded-2xl"
                style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)" }}>
                <div className="flex items-center gap-3">
                  <Users size={20} className="text-blue-400" />
                  <div>
                    <p className="text-sm font-bold text-white">
                      {ctLoading ? 'Loading…' : <><span style={{ color: "#60a5fa" }}>{matched.length}</span> contacts selected</>}
                    </p>
                    <p className="text-[10px]" style={{ color: "#64748b" }}>
                      {contacts.length} total · set filters below to narrow audience
                    </p>
                  </div>
                </div>
                {activeFilterCount > 0 && (
                  <button onClick={() => { setFStatus(''); setFCity(''); setFDevice(''); setFLang(''); setFScore(''); setFCarts(''); setFPages(''); setFEngage(''); }}
                    className="text-xs flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors"
                    style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
                    <X size={10} /> Clear all
                  </button>
                )}
              </div>

              {/* Filter grid */}
              <datalist id="city-list">
                {allCities.map(c => <option key={c} value={c} />)}
              </datalist>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

                <FilterCard label="Status" icon={UserCheck} active={!!fStatus}>
                  <select value={fStatus} onChange={e => setFStatus(e.target.value)} className="input w-full text-sm py-2">
                    <option value="">All contacts</option>
                    <option value="active">Active Visitor</option>
                    <option value="product_view">Product View</option>
                    <option value="abandoned_cart">Abandoned Cart</option>
                    <option value="purchased">Purchased</option>
                  </select>
                </FilterCard>

                <FilterCard label="City" icon={Globe} active={!!fCity}>
                  <input value={fCity} onChange={e => setFCity(e.target.value)}
                    list="city-list" placeholder="Type or pick a city…"
                    className="input w-full text-sm py-2" />
                </FilterCard>

                <FilterCard label="Device" icon={Smartphone} active={!!fDevice}>
                  <select value={fDevice} onChange={e => setFDevice(e.target.value)} className="input w-full text-sm py-2">
                    <option value="">All devices</option>
                    <option value="mobile">📱 Mobile</option>
                    <option value="desktop">🖥 Desktop</option>
                    <option value="tablet">📲 Tablet</option>
                  </select>
                </FilterCard>

                <FilterCard label="Language" icon={Globe} active={!!fLang}>
                  <select value={fLang} onChange={e => setFLang(e.target.value)} className="input w-full text-sm py-2">
                    <option value="">All languages</option>
                    {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
                  </select>
                </FilterCard>

                <FilterCard label="Power Score — minimum" icon={Flame} active={!!fScore}>
                  <select value={fScore} onChange={e => setFScore(e.target.value)} className="input w-full text-sm py-2">
                    <option value="">Any score</option>
                    <option value="20">20+ (Low intent)</option>
                    <option value="40">40+ (Medium)</option>
                    <option value="60">60+ (High intent)</option>
                    <option value="80">80+ (Hot 🔥)</option>
                  </select>
                </FilterCard>

                <FilterCard label="Cart Events — minimum" icon={ShoppingCart} active={!!fCarts}>
                  <select value={fCarts} onChange={e => setFCarts(e.target.value)} className="input w-full text-sm py-2">
                    <option value="">Any</option>
                    <option value="1">1+ cart event</option>
                    <option value="2">2+ cart events</option>
                    <option value="3">3+ cart events</option>
                    <option value="5">5+ cart events</option>
                  </select>
                </FilterCard>

                <FilterCard label="Page Views — minimum" icon={Eye} active={!!fPages}>
                  <select value={fPages} onChange={e => setFPages(e.target.value)} className="input w-full text-sm py-2">
                    <option value="">Any</option>
                    <option value="2">2+ pages</option>
                    <option value="5">5+ pages</option>
                    <option value="10">10+ pages</option>
                    <option value="20">20+ pages</option>
                  </select>
                </FilterCard>

                <FilterCard label="Engagement Score — minimum" icon={Zap} active={!!fEngage}>
                  <select value={fEngage} onChange={e => setFEngage(e.target.value)} className="input w-full text-sm py-2">
                    <option value="">Any</option>
                    <option value="30">30+ (Mild)</option>
                    <option value="50">50+ (Good)</option>
                    <option value="70">70+ (High)</option>
                    <option value="85">85+ (Very high)</option>
                  </select>
                </FilterCard>

                <FilterCard label="Repeat Customer" icon={Repeat} active={!!fRepeat}>
                  <select value={fRepeat} onChange={e => setFRepeat(e.target.value)} className="input w-full text-sm py-2">
                    <option value="">All</option>
                    <option value="yes">🔁 Repeat only</option>
                    <option value="no">🆕 First-time only</option>
                  </select>
                </FilterCard>

              </div>

              {/* Contact preview */}
              {matched.length > 0 && (
                <div className="rounded-xl overflow-hidden"
                  style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5"
                    style={{ background: "rgba(255,255,255,0.03)", color: "#64748b" }}>
                    <Eye size={10} /> Preview — {Math.min(matched.length, 6)} of {matched.length} contacts
                  </div>
                  {matched.slice(0, 6).map((c, i) => {
                    const ss = STATUS_COLOR[c.status] || STATUS_COLOR.active;
                    return (
                      <div key={i} className="flex items-center gap-3 px-3 py-2.5 text-xs transition-colors"
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
                        <span className="text-[10px]" style={{ color: "#64748b" }}>{c.city || '—'}</span>
                        <span className="text-[10px]" style={{ color: "#475569" }}>{c.device || '—'}</span>
                      </div>
                    );
                  })}
                  {matched.length > 6 && (
                    <div className="px-3 py-2 text-[10px] text-center" style={{ color: "#475569" }}>
                      +{matched.length - 6} more contacts will receive this campaign
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
                    { label: 'Template',  value: activeTpl?.name || '—',                                             color: "#4ade80" },
                    { label: 'Delay',     value: Number(delayHrs) === 0 ? 'Instant' : `${delayHrs}h between runs`,    color: "#fb923c" },
                    { label: 'Runs',      value: runTimes === 0 ? '∞ Infinite' : `${runTimes}×`,                      color: "#c084fc" },
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
              {activeFilterCount > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: "#64748b" }}>
                    Selected Filters
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      fStatus  && { label: 'Status',      value: fStatus.replace(/_/g, ' ')  },
                      fCity    && { label: 'City',         value: fCity                       },
                      fDevice  && { label: 'Device',       value: fDevice                     },
                      fLang    && { label: 'Language',     value: LANGUAGES.find(l=>l.code===fLang)?.label || fLang },
                      fScore   && { label: 'Power Score',  value: `${fScore}+`                },
                      fCarts   && { label: 'Cart Events',  value: `${fCarts}+`                },
                      fPages   && { label: 'Page Views',   value: `${fPages}+`                },
                      fEngage  && { label: 'Engagement',   value: `${fEngage}+`               },
                    ].filter(Boolean).map((f, i) => (
                      <span key={i} className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full font-medium"
                        style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", color: "#60a5fa" }}>
                        {f.label}: <span className="text-white">{f.value}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

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
  const [analyticsMap, setAnalyticsMap] = useState({});   // campaignId → analytics data
  const [analyticsOpen, setAnalyticsOpen] = useState({}); // campaignId → bool (panel open)
  const [analyticsLoading, setAnalyticsLoading] = useState({});
  const [payloadOpen, setPayloadOpen] = useState({});     // campaignId → bool
  const [payloadMap, setPayloadMap] = useState({});       // campaignId → { executions[], totalSent, totalFailed }
  const [audienceOpen, setAudienceOpen] = useState({});  // campaignId → bool
  const [audienceMap, setAudienceMap]   = useState({});  // campaignId → { count, audience[] }
  const [audienceLoading, setAudienceLoading] = useState({});
  const [sendResultMap, setSendResultMap] = useState({}); // campaignId → { sent, skipped, errors[] }
  const [testModal, setTestModal] = useState(null);  // { id, name } | null
  const [testPhone, setTestPhone] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState(null); // last result for display
  const [flowModal, setFlowModal] = useState(null); // campaign object | null

  const CH = () => ({ 'x-channel-id': localStorage.getItem('channelId') || 'demo' });

  const loadAnalytics = async (campaignId) => {
    if (analyticsLoading[campaignId]) return;
    setAnalyticsLoading(p => ({ ...p, [campaignId]: true }));
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/analytics`, { headers: CH() });
      const data = await res.json();
      setAnalyticsMap(p => ({ ...p, [campaignId]: data }));
    } catch (_) {}
    finally { setAnalyticsLoading(p => ({ ...p, [campaignId]: false })); }
  };

  const toggleAnalytics = (campaignId) => {
    const next = !analyticsOpen[campaignId];
    setAnalyticsOpen(p => ({ ...p, [campaignId]: next }));
    if (next && !analyticsMap[campaignId]) loadAnalytics(campaignId);
  };

  const loadPayload = async (campaignId) => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/executions`, { headers: CH() });
      const data = await res.json();
      setPayloadMap(p => ({ ...p, [campaignId]: data }));
    } catch (_) {}
  };
  const togglePayload = (campaignId) => {
    const next = !payloadOpen[campaignId];
    setPayloadOpen(p => ({ ...p, [campaignId]: next }));
    if (next) loadPayload(campaignId);
  };

  const loadAudience = async (campaignId) => {
    setAudienceLoading(p => ({ ...p, [campaignId]: true }));
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/audience`, { headers: CH() });
      const data = await res.json();
      setAudienceMap(p => ({ ...p, [campaignId]: data }));
    } catch (_) {}
    finally { setAudienceLoading(p => ({ ...p, [campaignId]: false })); }
  };
  const toggleAudience = (campaignId) => {
    const next = !audienceOpen[campaignId];
    setAudienceOpen(p => ({ ...p, [campaignId]: next }));
    if (next) loadAudience(campaignId);
  };

  const handleSendTest = async () => {
    if (!testModal || !testPhone.trim()) return;
    setTestSending(true);
    setTestResult(null);
    try {
      const result = await campaignsApi.sendTest(testModal.id, testPhone.trim());
      setTestResult(result);
      console.group(`%c[Test Send] Campaign "${testModal.name}" → ${testPhone.trim()}`, 'color:#a78bfa;font-weight:bold');
      console.log('%cResult:', 'color:#60a5fa', result);
      if (result?.payload) {
        console.log('%cMeta API Payload:', 'color:#f59e0b', JSON.stringify(result.payload, null, 2));
      }
      if (result?.error) console.error('[Test Send Error]', result.error);
      if (result?.wamid) console.log('%c✓ wamid:', 'color:#4ade80', result.wamid);
      console.groupEnd();
    } catch (e) {
      setTestResult({ success: false, error: e.message });
      console.error('[Test Send]', e);
    }
    setTestSending(false);
  };

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
          const isProdRec = c.campaign_type === 'product_recommendation';
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
              <div className="flex items-center gap-2 mb-3">
                <p className="text-[10px] text-slate-500 uppercase tracking-widest">
                  {isCustom ? 'Custom Audience' : type.targetSegment.replace('_',' ')} Target
                </p>
                {isCustom && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                    style={{ background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.2)", color: "#c084fc" }}>
                    {c.run_times === 0 ? '∞ runs' : `${c.run_times || 1}× · ${c.delay_hours || 0}h`}
                  </span>
                )}
              </div>
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
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                 <div>
                    <p className="text-[9px] text-slate-500 uppercase">Messages Sent</p>
                    <p className="text-lg font-bold text-white">{c.total_sent}</p>
                 </div>
                 <div>
                    <p className="text-[9px] text-slate-500 uppercase">Auto-Converted</p>
                    <p className="text-lg font-bold text-green-400">{c.total_recovered}</p>
                 </div>
              </div>

              {/* ── Analytics Panel ── */}
              <div className="mb-4">
                <button onClick={() => toggleAnalytics(c.id)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-[10px] font-semibold transition-all"
                  style={{ background: analyticsOpen[c.id] ? "rgba(59,130,246,0.1)" : "rgba(255,255,255,0.03)", border: `1px solid ${analyticsOpen[c.id] ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.06)"}`, color: analyticsOpen[c.id] ? "#60a5fa" : "#64748b" }}>
                  <span className="flex items-center gap-1.5"><TrendingDown size={11}/> Campaign Analytics</span>
                  <ChevronDown size={11} style={{ transform: analyticsOpen[c.id] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}/>
                </button>

                {analyticsOpen[c.id] && (
                  <div className="mt-2 rounded-xl overflow-hidden" style={{ border: "1px solid rgba(59,130,246,0.15)" }}>
                    {analyticsLoading[c.id] ? (
                      <div className="flex items-center justify-center gap-2 py-4 text-xs" style={{ color: "#64748b" }}>
                        <Repeat size={12} className="animate-spin"/> Loading…
                      </div>
                    ) : analyticsMap[c.id] ? (() => {
                      const a = analyticsMap[c.id];
                      const cr = a.clicks > 0 ? ((a.add_to_carts / a.clicks) * 100).toFixed(0) : 0;
                      const pr = a.clicks > 0 ? ((a.purchases / a.clicks) * 100).toFixed(0) : 0;
                      return (
                        <div className="p-3 space-y-3">
                          <div className="grid grid-cols-3 gap-2 text-center">
                            {[
                              { label: 'Site Clicks', value: a.clicks,       color: '#60a5fa', icon: '🖱️' },
                              { label: 'Add to Cart', value: a.add_to_carts, color: '#fb923c', icon: '🛒' },
                              { label: 'Purchases',   value: a.purchases,    color: '#4ade80', icon: '✅' },
                            ].map(s => (
                              <div key={s.label} className="py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.03)" }}>
                                <div className="text-base">{s.icon}</div>
                                <div className="text-sm font-bold mt-0.5" style={{ color: s.color }}>{s.value}</div>
                                <div className="text-[9px] uppercase tracking-wide mt-0.5" style={{ color: "#475569" }}>{s.label}</div>
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center gap-3 text-[10px]" style={{ color: "#64748b" }}>
                            <span>Cart rate: <span style={{ color: "#fb923c" }}>{cr}%</span></span>
                            <span>·</span>
                            <span>Purchase rate: <span style={{ color: "#4ade80" }}>{pr}%</span></span>
                            <button onClick={() => loadAnalytics(c.id)} className="ml-auto" title="Refresh" style={{ color: "#475569" }}><Repeat size={10}/></button>
                          </div>
                          {a.clicks === 0 && (
                            <p className="text-[10px] text-center" style={{ color: "#334155" }}>
                              UTM links active — data appears when users click from WhatsApp
                            </p>
                          )}
                        </div>
                      );
                    })() : null}
                  </div>
                )}
              </div>

              {/* ── Send History Panel ── */}
              <div className="mb-4">
                <button onClick={() => togglePayload(c.id)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-[10px] font-semibold transition-all"
                  style={{ background: payloadOpen[c.id] ? "rgba(6,182,212,0.1)" : "rgba(255,255,255,0.03)", border: `1px solid ${payloadOpen[c.id] ? "rgba(6,182,212,0.3)" : "rgba(255,255,255,0.06)"}`, color: payloadOpen[c.id] ? "#22d3ee" : "#64748b" }}>
                  <span className="flex items-center gap-1.5"><GitBranch size={11}/> Send History</span>
                  <span className="flex items-center gap-1.5">
                    {payloadMap[c.id] && (
                      <>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(74,222,128,0.12)', color: '#4ade80' }}>✓ {payloadMap[c.id].totalSent}</span>
                        {payloadMap[c.id].totalFailed > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(248,113,113,0.12)', color: '#f87171' }}>✗ {payloadMap[c.id].totalFailed}</span>}
                      </>
                    )}
                    <ChevronDown size={11} style={{ transform: payloadOpen[c.id] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}/>
                  </span>
                </button>
                {payloadOpen[c.id] && (() => {
                  const data = payloadMap[c.id];
                  if (!data) return <div className="mt-2 text-[10px] text-center py-3" style={{ color: "#475569" }}>Loading…</div>;
                  const execs = data.executions || [];
                  if (!execs.length) return <div className="mt-2 text-[10px] text-center py-3 rounded-xl" style={{ color: "#475569", border: "1px solid rgba(255,255,255,0.05)" }}>No messages sent yet.</div>;
                  return (
                    <div className="mt-2 rounded-xl overflow-hidden" style={{ border: "1px solid rgba(6,182,212,0.15)" }}>
                      <div className="px-3 py-2 flex items-center gap-3" style={{ background: 'rgba(6,182,212,0.05)', borderBottom: '1px solid rgba(6,182,212,0.1)' }}>
                        <span className="text-[10px] font-bold" style={{ color: '#4ade80' }}>✓ {data.totalSent} sent</span>
                        {data.totalFailed > 0 && <span className="text-[10px] font-bold" style={{ color: '#f87171' }}>✗ {data.totalFailed} failed</span>}
                        <button onClick={() => loadPayload(c.id)} className="ml-auto text-[9px] flex items-center gap-1" style={{ color: '#475569' }}><Repeat size={9}/> Refresh</button>
                      </div>
                      {execs.slice(0, 30).map((ex, i) => {
                        let payload = null;
                        try { payload = JSON.parse(ex.payload_sent || 'null'); } catch (_) {}
                        return (
                          <div key={i} className="p-3 space-y-1.5" style={{ background: i % 2 === 0 ? "rgba(6,182,212,0.02)" : "transparent", borderTop: i > 0 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                            <div className="flex items-center justify-between flex-wrap gap-1">
                              <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: ex.status === 'sent' ? '#4ade80' : '#f87171' }}/>
                                <span className="text-[10px] font-semibold" style={{ color: ex.status === 'sent' ? '#4ade80' : '#f87171' }}>{ex.status === 'sent' ? '✓ Sent' : '✗ Failed'}</span>
                                <span className="text-[10px] text-white font-medium">{ex.name || 'User'}</span>
                                <span className="text-[9px] font-mono" style={{ color: "#64748b" }}>{ex.phone}</span>
                                <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.04)', color: '#475569' }}>Stage {ex.stage || 1}</span>
                              </div>
                              <span className="text-[9px]" style={{ color: "#334155" }}>{new Date(ex.sent_at).toLocaleString()}</span>
                            </div>
                            {ex.template_name && <p className="text-[9px]" style={{ color: '#475569' }}>Template: <span style={{ color: '#94a3b8' }}>{ex.template_name}</span></p>}
                            {ex.error && <p className="text-[9px] font-mono px-2 py-1 rounded" style={{ background: 'rgba(248,113,113,0.08)', color: '#fca5a5' }}>✗ {ex.error}</p>}
                            {payload && (
                              <pre className="text-[9px] rounded-lg p-2 overflow-x-auto leading-relaxed"
                                style={{ background: "#070d1a", border: "1px solid rgba(6,182,212,0.12)", color: "#67e8f9", maxHeight: "140px", overflowY: "auto" }}>
                                {JSON.stringify(payload, null, 2)}
                              </pre>
                            )}
                          </div>
                        );
                      })}
                      {execs.length > 30 && <p className="text-center text-[9px] py-2" style={{ color: '#334155' }}>Showing 30 of {execs.length}</p>}
                    </div>
                  );
                })()}
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
                    <div className="flex items-center gap-1.5">
                       {/* Flow Diagram button */}
                       <button
                         title="View campaign flow diagram"
                         onClick={() => setFlowModal(flowModal?.id === c.id ? null : c)}
                         className="p-2 rounded-lg border transition-all text-xs"
                         style={{ background: flowModal?.id === c.id ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.05)', borderColor: flowModal?.id === c.id ? 'rgba(6,182,212,0.4)' : 'rgba(255,255,255,0.08)', color: flowModal?.id === c.id ? '#22d3ee' : '#64748b' }}>
                         <GitBranch size={13}/>
                       </button>
                       {/* Test Send button */}
                       <button
                         title="Send test message to a specific number"
                         onClick={() => {
                           if (testModal?.id === c.id) { setTestModal(null); setTestResult(null); }
                           else { setTestModal({ id: c.id, name: c.name }); setTestPhone(''); setTestResult(null); }
                         }}
                         className="p-2 rounded-lg border transition-all text-xs"
                         style={{ background: testModal?.id === c.id ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.05)', borderColor: testModal?.id === c.id ? 'rgba(167,139,250,0.4)' : 'rgba(255,255,255,0.08)', color: testModal?.id === c.id ? '#a78bfa' : '#64748b' }}>
                         <Send size={13}/>
                       </button>
                       {/* Broadcast send button */}
                       <button onClick={async() => {
                          setSendResultMap(p => ({ ...p, [c.id]: null }));
                          try {
                            const result = await campaignsApi.send(c.id);
                            setSendResultMap(p => ({ ...p, [c.id]: { sent: result?.sent ?? 0, skipped: result?.skipped ?? 0, errors: result?.errors || [] } }));
                            console.group(`%c[Campaign Send] "${c.name}" — sent:${result?.sent ?? 0} skipped:${result?.skipped ?? 0}`, 'color:#22c55e;font-weight:bold');
                            if (result?.payloads?.length) result.payloads.forEach((p, i) => { console.log(`%cMessage ${i+1} → ${p.phone}`, 'color:#60a5fa'); console.log('%cPayload:', 'color:#f59e0b', JSON.stringify(p.payload, null, 2)); });
                            if (result?.errors?.length) console.error('[Campaign Errors]', result.errors);
                            console.groupEnd();
                            loadPayload(c.id);
                          } catch (e) {
                            setSendResultMap(p => ({ ...p, [c.id]: { sent: 0, skipped: 0, errors: [e.message] } }));
                          }
                          load();
                       }} title="Send to all matched contacts" className="p-2 bg-white/5 rounded-lg hover:text-green-400 border border-white/5 transition-all"><Play size={14}/></button>
                    </div>
                 </div>

                 {/* ── Test Send Panel ── */}
                 {testModal?.id === c.id && (
                   <div className="mt-3 rounded-xl p-3 space-y-2" style={{ background: 'rgba(167,139,250,0.07)', border: '1px solid rgba(167,139,250,0.2)' }}>
                     <p className="text-[10px] font-semibold" style={{ color: '#a78bfa' }}>Send Test Message</p>
                     <div className="flex gap-2">
                       <input
                         type="tel"
                         placeholder="91XXXXXXXXXX"
                         value={testPhone}
                         onChange={e => { setTestPhone(e.target.value); setTestResult(null); }}
                         onKeyDown={e => e.key === 'Enter' && handleSendTest()}
                         className="flex-1 text-[11px] px-2.5 py-1.5 rounded-lg outline-none"
                         style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(167,139,250,0.25)', color: '#e2e8f0' }}
                       />
                       <button
                         onClick={handleSendTest}
                         disabled={testSending || !testPhone.trim()}
                         className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                         style={{ background: testSending ? 'rgba(167,139,250,0.1)' : 'rgba(167,139,250,0.2)', border: '1px solid rgba(167,139,250,0.3)', color: '#a78bfa', opacity: (!testPhone.trim() || testSending) ? 0.5 : 1 }}>
                         {testSending ? <Repeat size={11} className="animate-spin"/> : <Send size={11}/>}
                         {testSending ? 'Sending…' : 'Send'}
                       </button>
                     </div>
                     {testResult && (
                       <div className="text-[10px] px-2.5 py-1.5 rounded-lg" style={{ background: testResult.success ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)', border: `1px solid ${testResult.success ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}`, color: testResult.success ? '#4ade80' : '#f87171' }}>
                         {testResult.success ? `✓ Sent! wamid: ${testResult.wamid}` : `✗ ${testResult.error || 'Failed'}`}
                       </div>
                     )}
                     <p className="text-[9px]" style={{ color: '#475569' }}>Full payload logged in browser console (F12)</p>
                   </div>
                 )}

                 {/* ── Send Result Banner ── */}
                 {sendResultMap[c.id] && (() => {
                   const sr = sendResultMap[c.id];
                   const hasErrors = sr.errors?.length > 0;
                   return (
                     <div className="mt-2 rounded-xl p-3 space-y-1.5" style={{ background: hasErrors ? 'rgba(248,113,113,0.06)' : 'rgba(74,222,128,0.06)', border: `1px solid ${hasErrors ? 'rgba(248,113,113,0.2)' : 'rgba(74,222,128,0.2)'}` }}>
                       <div className="flex items-center gap-3 text-[11px] font-semibold">
                         <span style={{ color: '#4ade80' }}>✓ {sr.sent} sent</span>
                         {sr.skipped > 0 && <span style={{ color: '#94a3b8' }}>· {sr.skipped} skipped</span>}
                         {hasErrors && <span style={{ color: '#f87171' }}>· {sr.errors.length} error{sr.errors.length > 1 ? 's' : ''}</span>}
                         <button onClick={() => setSendResultMap(p => ({ ...p, [c.id]: null }))} className="ml-auto text-[9px]" style={{ color: '#475569' }}>✕</button>
                       </div>
                       {hasErrors && (
                         <div className="space-y-0.5">
                           {sr.errors.map((err, i) => (
                             <p key={i} className="text-[9px] font-mono" style={{ color: '#fca5a5' }}>✗ {err}</p>
                           ))}
                         </div>
                       )}
                     </div>
                   );
                 })()}

                 {/* ── Audience Preview Panel ── */}
                 <div className="mt-2">
                   <button onClick={() => toggleAudience(c.id)}
                     className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-[10px] font-semibold transition-all"
                     style={{ background: audienceOpen[c.id] ? 'rgba(251,191,36,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${audienceOpen[c.id] ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.06)'}`, color: audienceOpen[c.id] ? '#fbbf24' : '#64748b' }}>
                     <span className="flex items-center gap-1.5">👥 Who Will Receive This</span>
                     <span className="flex items-center gap-1.5">
                       {audienceMap[c.id] && <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold" style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>{audienceMap[c.id].count}</span>}
                       <ChevronDown size={11} style={{ transform: audienceOpen[c.id] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}/>
                     </span>
                   </button>
                   {audienceOpen[c.id] && (() => {
                     if (audienceLoading[c.id]) return <div className="mt-2 text-[10px] text-center py-3" style={{ color: '#475569' }}>Loading audience…</div>;
                     const aud = audienceMap[c.id];
                     if (!aud) return null;
                     if (!aud.audience?.length) return <div className="mt-2 text-[10px] text-center py-3 rounded-xl" style={{ color: '#475569', border: '1px solid rgba(255,255,255,0.05)' }}>No eligible users right now.</div>;
                     return (
                       <div className="mt-2 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(251,191,36,0.15)' }}>
                         <div className="px-3 py-2 flex items-center justify-between" style={{ background: 'rgba(251,191,36,0.05)', borderBottom: '1px solid rgba(251,191,36,0.1)' }}>
                           <span className="text-[10px] font-bold" style={{ color: '#fbbf24' }}>{aud.count} user{aud.count !== 1 ? 's' : ''} eligible</span>
                           <button onClick={() => loadAudience(c.id)} className="text-[9px] flex items-center gap-1" style={{ color: '#64748b' }}><Repeat size={9}/> Refresh</button>
                         </div>
                         <div className="divide-y" style={{ divideColor: 'rgba(255,255,255,0.04)' }}>
                           {aud.audience.slice(0, 20).map((u, i) => (
                             <div key={i} className="flex items-start gap-2 px-3 py-2" style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                               <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24' }}>
                                 {(u.name || u.phone || '?')[0].toUpperCase()}
                               </div>
                               <div className="flex-1 min-w-0">
                                 <div className="flex items-center gap-2">
                                   <span className="text-[10px] font-semibold text-white truncate">{u.name || 'Unknown'}</span>
                                   <span className="text-[9px] font-mono" style={{ color: '#475569' }}>{u.phone}</span>
                                   {u.ready_to_send === false && <span className="text-[9px] px-1.5 rounded" style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24' }}>⏱ waiting</span>}
                                   {u.ready_to_send === true && <span className="text-[9px] px-1.5 rounded" style={{ background: 'rgba(74,222,128,0.1)', color: '#4ade80' }}>ready</span>}
                                 </div>
                                 {u.product_name && <p className="text-[9px] truncate" style={{ color: '#64748b' }}>{u.product_name}{u.product_price ? ` · ${u.product_price}` : ''}</p>}
                                 {u.minutes_since_activity !== undefined && <p className="text-[9px]" style={{ color: '#334155' }}>{u.minutes_since_activity}m since activity · stage {u.followup_count || 0} done</p>}
                               </div>
                             </div>
                           ))}
                           {aud.count > 20 && <p className="text-center text-[9px] py-2" style={{ color: '#334155' }}>+{aud.count - 20} more users</p>}
                         </div>
                       </div>
                     );
                   })()}
                 </div>
              </div>
            </div>
          );
        })}
      </div>

      {showModal  && <CreateModal         onClose={() => setShowModal(false)}  onCreated={load} />}
      {showCustom && <CustomCampaignModal onClose={() => setShowCustom(false)} onCreated={load} />}
      {flowModal  && <FlowDiagramModal campaign={flowModal} onClose={() => setFlowModal(null)} />}
    </div>
  );
}

// ── Flow Diagram Modal ────────────────────────────────────────────────────────
function FlowDiagramModal({ campaign, onClose }) {
  const type = CAMPAIGN_TYPES.find(t => t.id === campaign.campaign_type);

  const FLOWS = {
    abandoned_product_view: {
      title: "Abandoned Product View Flow",
      color: "#22d3ee",
      steps: [
        { icon: "🌐", label: "User visits product page", sub: "tracker.js auto-captures product URL, name, price, image", type: "trigger" },
        { icon: "💾", label: "product_views record created", sub: "Stored in DB with product_url, phone, session_id", type: "action" },
        { icon: "🔍", label: "URL slug check", sub: `URL must contain the configured product slug (e.g. /products)`, type: "check" },
        { icon: "📊", label: "Status → product_view", sub: "Forward-only status upgrade (won't downgrade if already carted)", type: "action" },
        { icon: "⏱️", label: "30-minute inactivity wait", sub: "Automation checks visitor's last_activity — must be silent for 30 min", type: "wait" },
        { icon: "🛒", label: "Cart check (product-level)", sub: "If same product URL found in unrecovered cart → skip, cart campaign handles it", type: "check" },
        { icon: "📱", label: "Stage 1 — WhatsApp message sent", sub: "Single product template with dynamic: product name, price, image, URL", type: "send" },
        { icon: "⏱️", label: "24-hour gap", sub: "If user hasn't purchased or carted after 24h", type: "wait" },
        { icon: "🔒", label: "Status re-check", sub: "If status changed to abandoned_cart or purchased → stop here", type: "check" },
        { icon: "📱", label: "Stage 2 — Follow-up sent", sub: "Same single product template — final follow-up", type: "send" },
        { icon: "📊", label: "Status → followup_complete", sub: "After stage 2, user moves to weekly product recommendations loop", type: "action" },
        { icon: "♾️", label: "Weekly Recommendations loop", sub: "post_cart_upsell campaign takes over — sends new products every 7 days", type: "end" },
      ],
      bypasses: [
        { icon: "🛒", text: "User adds same product to cart → abandoned_cart campaign takes over immediately" },
        { icon: "💳", text: "User reaches checkout → abandoned_checkout campaign takes over" },
        { icon: "✅", text: "User purchases → status = purchased, all campaigns stop" },
        { icon: "🔄", text: "User views a product again → status re-enters product_view (new funnel cycle), abandoned_product_view restarts" },
        { icon: "🚫", text: "User opts out → permanently excluded from all campaigns" },
      ],
    },
    abandoned_cart: {
      title: "Abandoned Cart Recovery Flow",
      color: "#fb923c",
      steps: [
        { icon: "🛒", label: "User adds product to cart", sub: "tracker.js captures cart items, quantities, prices, cart URL", type: "trigger" },
        { icon: "💾", label: "cart_events record created", sub: "event_type = add_to_cart, stored with product details", type: "action" },
        { icon: "📊", label: "Status → abandoned_cart", sub: "Upgraded from product_view or active (forward-only)", type: "action" },
        { icon: "⏱️", label: `${campaign.delay_hours || 1}h delay`, sub: "Automation waits configured delay before first message", type: "wait" },
        { icon: "📱", label: "Stage 1 sent", sub: "Cart recovery template with product image + cart URL", type: "send" },
        { icon: "⏱️", label: "24h gap", sub: "Progressive: 24h → 48h → 72h between follow-ups", type: "wait" },
        { icon: "📱", label: "Stage 2 → Stage 3 → Stage 4", sub: "Up to 4 follow-ups total (progressive delay)", type: "send" },
        { icon: "✅", label: "followup_complete status", sub: "After all 4 stages → post_cart_upsell campaign can engage", type: "end" },
      ],
      bypasses: [
        { icon: "✅", text: "User purchases → cart marked recovered, no more messages" },
        { icon: "🔄", text: "After stage 4 → Infinite Weekly Recommendations campaign takes over" },
      ],
    },
    abandoned_checkout: {
      title: "Checkout Drop-off Recovery Flow",
      color: "#f87171",
      steps: [
        { icon: "💳", label: "User starts checkout", sub: "tracker.js detects checkout_started event", type: "trigger" },
        { icon: "💾", label: "cart_events record created", sub: "event_type = checkout_started — high intent signal", type: "action" },
        { icon: "📊", label: "Status → abandoned_checkout", sub: "Highest urgency pre-purchase status", type: "action" },
        { icon: "⏱️", label: `${campaign.delay_hours || 1}h delay`, sub: "Shorter delay recommended — user showed payment intent", type: "wait" },
        { icon: "📱", label: "Stage 1 sent", sub: "High-urgency template — offer discount if configured", type: "send" },
        { icon: "📱", label: "Stages 2 → 3 → 4", sub: "Up to 4 follow-ups with progressive delay", type: "send" },
        { icon: "✅", label: "followup_complete", sub: "All follow-ups sent without purchase", type: "end" },
      ],
      bypasses: [
        { icon: "✅", text: "User completes purchase → status = purchased, campaign stops" },
      ],
    },
    product_view: {
      title: "Abandoned Product View (Multi-stage) Flow",
      color: "#60a5fa",
      steps: [
        { icon: "👁", label: "User views product page", sub: "product_views record created with product data", type: "trigger" },
        { icon: "📊", label: "Status → product_view", sub: "Only if user hasn't carted — status machine blocks downgrade", type: "action" },
        { icon: "⏱️", label: `${campaign.delay_hours || 2}h delay`, sub: "Configurable delay before first outreach", type: "wait" },
        { icon: "📱", label: "Stages 1 → 2 → 3 → 4", sub: "Up to 4 follow-ups using the last viewed product data", type: "send" },
        { icon: "✅", label: "followup_complete", sub: "All follow-ups sent", type: "end" },
      ],
      bypasses: [
        { icon: "🛒", text: "User adds to cart → abandoned_cart campaign takes over" },
        { icon: "✅", text: "User purchases → campaign stops" },
      ],
    },
    website_visit: {
      title: "Abandoned Website Visitor Flow",
      color: "#a78bfa",
      steps: [
        { icon: "🏠", label: "User visits home / listing page", sub: "No product viewed — pure browse session", type: "trigger" },
        { icon: "📊", label: "Status = active", sub: "Lowest-funnel status — browsed but no product interest shown", type: "action" },
        { icon: "⏱️", label: `${campaign.delay_hours || 4}h delay`, sub: "Longer delay — lower intent visitor", type: "wait" },
        { icon: "📱", label: "Stage 1 → Catalog recommendations", sub: "Hot products from catalog sent as carousel", type: "send" },
        { icon: "📱", label: "Stages 2 → 3 → 4", sub: "Progressive follow-ups every 24 / 48 / 72h", type: "send" },
        { icon: "✅", label: "Campaign completes", sub: "User remains active status after all stages", type: "end" },
      ],
      bypasses: [
        { icon: "👁", text: "User views product → status upgrades to product_view, product_view campaign takes over" },
        { icon: "🛒", text: "User carts → abandoned_cart campaign takes over" },
      ],
    },
    post_purchase: {
      title: "Post-Purchase Upsell Flow",
      color: "#4ade80",
      steps: [
        { icon: "✅", label: "User completes purchase", sub: "purchase_history record created, status → purchased", type: "trigger" },
        { icon: "📊", label: "purchase_count tracked", sub: "is_repeat_purchaser = true when purchase_count ≥ 2", type: "action" },
        { icon: "⏱️", label: `${campaign.delay_hours || 24}h delay`, sub: "Wait before upsell — let the purchase experience settle", type: "wait" },
        { icon: "🤖", label: "AI picks upsell products", sub: "Recommends related items based on what they purchased", type: "action" },
        { icon: "📱", label: "Upsell message sent", sub: "Product recommendation with AI-curated suggestions", type: "send" },
        { icon: "✅", label: "One-time send", sub: "Fires once per purchase cycle", type: "end" },
      ],
      bypasses: [],
    },
    post_cart_upsell: {
      title: "Infinite Weekly Recommendations Flow",
      color: "#f472b6",
      steps: [
        { icon: "♾️", label: "Triggered after followup_complete", sub: "User finished all 4 cart reminders without buying", type: "trigger" },
        { icon: "⏱️", label: "7-day wait", sub: "First upsell fires 1 week after followup_complete", type: "wait" },
        { icon: "🎯", label: "Random 3 products from catalog", sub: "Rotates weekly — always fresh picks", type: "action" },
        { icon: "📱", label: "Weekly upsell sent", sub: "Continues indefinitely every 7 days", type: "send" },
        { icon: "🔄", label: "Loop forever", sub: "No max follow-up limit — runs every 168 hours", type: "end" },
      ],
      bypasses: [
        { icon: "✅", text: "User purchases → status = purchased, upsell loop stops" },
      ],
    },
    product_recommendation: {
      title: "Product Recommendation Broadcast Flow",
      color: "#4ade80",
      steps: [
        { icon: "🎯", label: "Manual or auto trigger", sub: "Runs when campaign is sent — targets configured audience", type: "trigger" },
        { icon: "🔍", label: "Audience filter", sub: "Status filters, city, device, language, engagement score", type: "check" },
        { icon: "🛍️", label: "Hot products selected", sub: "Auto-product mode: latest viewed products from page_views", type: "action" },
        { icon: "📱", label: "Carousel template sent", sub: "Multi-card carousel with images, prices, product links", type: "send" },
        { icon: "✅", label: "Done", sub: "One-time or repeating based on campaign settings", type: "end" },
      ],
      bypasses: [],
    },
    discount: {
      title: "Discount Offer Flow",
      color: "#4ade80",
      steps: [
        { icon: "🎁", label: "Targets abandoned_cart users", sub: "High-intent users who carted but didn't buy", type: "trigger" },
        { icon: "⏱️", label: "Instant or delayed send", sub: `Delay: ${campaign.delay_hours || 0}h configured`, type: "wait" },
        { icon: "📱", label: "Discount code message sent", sub: "Special offer to push conversion", type: "send" },
        { icon: "✅", label: "Done", sub: "Complements abandoned cart campaign", type: "end" },
      ],
      bypasses: [
        { icon: "✅", text: "User purchases → no more messages" },
      ],
    },
  };

  const flow = FLOWS[campaign.campaign_type] || {
    title: `${type?.label || campaign.campaign_type} Flow`,
    color: "#64748b",
    steps: [
      { icon: "🎯", label: "Campaign triggered", sub: "Custom campaign flow", type: "trigger" },
      { icon: "📱", label: "Message sent", sub: "To matched audience", type: "send" },
      { icon: "✅", label: "Done", sub: "", type: "end" },
    ],
    bypasses: [],
  };

  const stepColors = {
    trigger: { bg: "rgba(34,211,102,0.08)",  border: "rgba(34,211,102,0.25)",  dot: "#22d36a", label: "TRIGGER"  },
    action:  { bg: "rgba(96,165,250,0.08)",  border: "rgba(96,165,250,0.25)",  dot: "#60a5fa", label: "ACTION"   },
    check:   { bg: "rgba(251,191,36,0.08)",  border: "rgba(251,191,36,0.25)",  dot: "#fbbf24", label: "CHECK"    },
    wait:    { bg: "rgba(167,139,250,0.08)", border: "rgba(167,139,250,0.25)", dot: "#a78bfa", label: "WAIT"     },
    send:    { bg: `rgba(6,182,212,0.08)`,   border: `rgba(6,182,212,0.25)`,   dot: "#22d3ee", label: "SEND"     },
    end:     { bg: "rgba(148,163,184,0.06)", border: "rgba(148,163,184,0.15)", dot: "#94a3b8", label: "END"      },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl overflow-hidden"
        style={{ background: "#0d1422", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 25px 80px rgba(0,0,0,0.6)" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.015)" }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: `${flow.color}18`, border: `1px solid ${flow.color}30` }}>
              <GitBranch size={14} style={{ color: flow.color }} />
            </div>
            <div>
              <p className="text-sm font-bold text-white">{flow.title}</p>
              <p className="text-[10px]" style={{ color: "#64748b" }}>{campaign.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors"
            style={{ color: "#475569" }}
            onMouseEnter={e => e.currentTarget.style.color = "#e2e8f0"}
            onMouseLeave={e => e.currentTarget.style.color = "#475569"}>
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto p-5 space-y-0 flex-1">

          {/* Steps */}
          <div className="relative">
            {flow.steps.map((step, idx) => {
              const sc = stepColors[step.type] || stepColors.action;
              const isLast = idx === flow.steps.length - 1;
              return (
                <div key={idx} className="relative flex gap-3">
                  {/* Connector line */}
                  {!isLast && (
                    <div className="absolute left-[17px] top-10 w-px"
                      style={{ height: "calc(100% - 8px)", background: "rgba(255,255,255,0.06)" }} />
                  )}
                  {/* Icon dot */}
                  <div className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-base mt-1 z-10"
                    style={{ background: sc.bg, border: `1px solid ${sc.border}` }}>
                    {step.icon}
                  </div>
                  {/* Content */}
                  <div className={`flex-1 pb-5 ${isLast ? '' : ''}`}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-xs font-semibold text-white">{step.label}</p>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-widest"
                        style={{ background: sc.bg, border: `1px solid ${sc.border}`, color: sc.dot }}>
                        {sc.label}
                      </span>
                    </div>
                    {step.sub && <p className="text-[11px]" style={{ color: "#64748b" }}>{step.sub}</p>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bypass / Exit conditions */}
          {flow.bypasses?.length > 0 && (
            <div className="mt-2 rounded-xl p-4 space-y-2"
              style={{ background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.15)" }}>
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#fbbf24" }}>
                ⚡ Early Exit Conditions
              </p>
              {flow.bypasses.map((b, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px]" style={{ color: "#94a3b8" }}>
                  <span>{b.icon}</span>
                  <span>{b.text}</span>
                </div>
              ))}
            </div>
          )}

          {/* Legend */}
          <div className="mt-4 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            <p className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: "#334155" }}>Legend</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stepColors).map(([k, sc]) => (
                <div key={k} className="flex items-center gap-1.5 text-[9px]" style={{ color: "#475569" }}>
                  <div className="w-2 h-2 rounded-full" style={{ background: sc.dot }} />
                  {sc.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
