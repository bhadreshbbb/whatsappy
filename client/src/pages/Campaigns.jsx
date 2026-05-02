import React, { useEffect, useState, useCallback, useMemo } from "react";
import { translateTemplate } from "../translate";
import {
  Plus, Trash2, Play, ChevronDown, ChevronUp, X,
  Zap, Clock, CheckCircle, Globe, MessageSquare, ShoppingCart,
  Eye, TrendingDown, Package, Users, Settings, ToggleLeft, Gift, Layout,
  Filter, Sliders, UserCheck, Search, Target, ChevronRight, AlertCircle,
  Flame, Smartphone, Monitor, Repeat, Send, GitBranch, Image,
} from "lucide-react";
import { campaignsApi, templatesApi, analyticsApi, visitorsApi } from "../api";

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
  {
    id: "order_confirmation",
    icon: "📦",
    label: "Order Confirmation",
    description: "Auto-send confirmation to COD orders received via Shopify webhook. Tracks user replies (Confirmed / Cancelled).",
    color: "green",
    autoTarget: true,
    defaultDelay: 0,
    targetSegment: "cod_orders",
    orderConfirmationOnly: true,
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
    // Load contacts for audience filter preview — same source as Contacts tab
    setCtLoading(true);
    visitorsApi.list({ hasPhone: 'true', limit: '1000' }).then(res => {
      setContacts((res.data || []).map(v => ({
        ...v,
        device:      v.device_type,
        power_score: v.engagement_score || 0,
        cart_events: 0,
        is_repeat:   false,
      })));
    }).catch(() => {}).finally(() => setCtLoading(false));
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

        // Order Confirmation requires an order confirmation Meta template
        if (type?.orderConfirmationOnly) {
          if (!metaTemplateId) {
            setValidationErr("• Please select an Order Confirmation Meta template (UTILITY category).");
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
                {type?.orderConfirmationOnly ? (
                  <div className="p-4 rounded-2xl" style={{ background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.2)' }}>
                    <label className="text-xs font-semibold text-green-400 flex items-center gap-2 mb-3">
                      <Clock size={13} /> Automation Schedule — Instant
                    </label>
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)' }}>
                        <span className="text-base">⚡</span>
                        <div>
                          <p className="text-xs font-bold text-green-300">Instant — as soon as COD order arrives</p>
                          <p className="text-[10px]" style={{ color: '#64748b' }}>Shopify webhook fires → server receives order → WhatsApp sent immediately</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.15)' }}>
                        <span className="text-base">💬</span>
                        <div>
                          <p className="text-xs font-bold" style={{ color: '#a78bfa' }}>User reply tracked automatically</p>
                          <p className="text-[10px]" style={{ color: '#64748b' }}>Confirmed / Cancelled / Custom replies all captured in Responses panel</p>
                        </div>
                      </div>
                      <div className="p-3 rounded-xl text-[10px] leading-relaxed" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', color: '#64748b' }}>
                        <strong className="text-slate-300">Shopify Webhook URL to configure:</strong><br/>
                        <code className="text-green-400 font-mono">POST https://yourserver.com/api/webhooks/shopify/order</code><br/>
                        <span className="text-slate-500">Shopify Admin → Settings → Notifications → Webhooks → Order creation</span>
                      </div>
                    </div>
                  </div>
                ) : type?.singleProductOnly ? (
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
    visitorsApi.list({ hasPhone: 'true', limit: '1000' }).then(res => {
      setContacts((res.data || []).map(v => ({
        ...v,
        device:      v.device_type,
        power_score: v.engagement_score || 0,
        cart_events: 0,
        is_repeat:   false,
      })));
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

// ─── Relative time helper ─────────────────────────────────────────────────────
function timeAgo(iso) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Main Campaigns Page ──────────────────────────────────────────────────────
export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [toggling, setToggling] = useState({});
  const [analyticsMap, setAnalyticsMap] = useState({});   // campaignId → analytics data
  const [analyticsOpen, setAnalyticsOpen] = useState({}); // campaignId → bool (panel open)
  const [analyticsLoading, setAnalyticsLoading] = useState({});
  const [payloadOpen, setPayloadOpen] = useState({});     // campaignId → bool
  const [payloadMap, setPayloadMap] = useState({});       // campaignId → { executions[], totalSent, totalFailed }
  const [audienceOpen, setAudienceOpen] = useState({});  // campaignId → bool
  const [audienceMap, setAudienceMap]   = useState({});  // campaignId → { count, audience[] }
  const [audienceLoading, setAudienceLoading] = useState({});
  const [expandedAPVRow, setExpandedAPVRow] = useState(null); // "campaignId-rowIndex"
  const [sendResultMap, setSendResultMap] = useState({}); // campaignId → { sent, skipped, errors[] }
  const [testModal, setTestModal] = useState(null);  // { id, name } | null
  const [testPhone, setTestPhone] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState(null); // last result for display
  const [flowModal, setFlowModal] = useState(null); // campaign object | null
  const [responsesOpen, setResponsesOpen]       = useState({}); // campaignId → bool
  const [responsesMap, setResponsesMap]         = useState({}); // campaignId → { responses[], summary }
  const [responsesLoading, setResponsesLoading] = useState({});
  const [testOrderPhone, setTestOrderPhone]     = useState('');
  const [testOrderLoading, setTestOrderLoading] = useState({});
  const [testOrderResult, setTestOrderResult]   = useState({});
  const [aiInsights, setAiInsights]             = useState(null);
  const [insightsLoading, setInsightsLoading]   = useState(false);

  const CH = () => ({ 'x-channel-id': localStorage.getItem('channelId') || 'demo' });

  // Auto-refresh open audience panels every 60 seconds
  useEffect(() => {
    const openIds = Object.keys(audienceOpen).filter(id => audienceOpen[id]);
    if (!openIds.length) return;
    const interval = setInterval(() => {
      openIds.forEach(id => loadAudience(id));
    }, 60000);
    return () => clearInterval(interval);
  }, [audienceOpen]);

  const loadAiInsights = async () => {
    setInsightsLoading(true);
    try {
      const res  = await fetch('/api/ai/insights', { headers: CH() });
      const data = await res.json();
      setAiInsights(data);
    } catch (_) {}
    finally { setInsightsLoading(false); }
  };

  // Load AI insights on mount
  useState(() => { setTimeout(loadAiInsights, 500); }, []);

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

  const loadResponses = async (campaignId) => {
    setResponsesLoading(p => ({ ...p, [campaignId]: true }));
    try {
      const res = await fetch(`/api/webhooks/order-responses/${campaignId}`, { headers: CH() });
      const data = await res.json();
      setResponsesMap(p => ({ ...p, [campaignId]: data }));
    } catch (_) {}
    finally { setResponsesLoading(p => ({ ...p, [campaignId]: false })); }
  };
  const toggleResponses = (campaignId) => {
    const next = !responsesOpen[campaignId];
    setResponsesOpen(p => ({ ...p, [campaignId]: next }));
    if (next) loadResponses(campaignId);
  };

  const sendTestCodOrder = async (campaignId) => {
    const phone = testOrderPhone.trim();
    if (!phone) return;
    setTestOrderLoading(p => ({ ...p, [campaignId]: true }));
    setTestOrderResult(p => ({ ...p, [campaignId]: null }));
    try {
      const res = await fetch('/api/webhooks/order/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...CH() },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      setTestOrderResult(p => ({ ...p, [campaignId]: { ok: data.success, ...data } }));
    } catch (e) {
      setTestOrderResult(p => ({ ...p, [campaignId]: { ok: false, error: e.message } }));
    } finally {
      setTestOrderLoading(p => ({ ...p, [campaignId]: false }));
    }
  };

  const sendTestProductView = async (campaignId, productName) => {
    const phone = testOrderPhone.trim();
    if (!phone) return;
    setTestOrderLoading(p => ({ ...p, [campaignId]: true }));
    setTestOrderResult(p => ({ ...p, [campaignId]: null }));
    try {
      const res = await fetch('/api/webhooks/product-view/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...CH() },
        body: JSON.stringify({ phone, product_name: productName || undefined }),
      });
      const data = await res.json();
      setTestOrderResult(p => ({ ...p, [campaignId]: { ok: data.success, ...data } }));
    } catch (e) {
      setTestOrderResult(p => ({ ...p, [campaignId]: { ok: false, error: e.message } }));
    } finally {
      setTestOrderLoading(p => ({ ...p, [campaignId]: false }));
    }
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

  const handleToggle = async (c) => {
    setToggling(p => ({ ...p, [c.id]: true }));
    try {
      const newStatus = c.is_active ? 'paused' : 'running';
      await campaignsApi.toggle(c.id, newStatus);
      await load();
    } catch (_) {}
    setToggling(p => ({ ...p, [c.id]: false }));
  };

  const filteredCampaigns = useMemo(() => {
    let list = campaigns;
    if (search.trim()) list = list.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || (c.campaign_type || '').toLowerCase().includes(search.toLowerCase()));
    if (typeFilter !== 'all') list = list.filter(c => c.campaign_type === typeFilter);
    return list;
  }, [campaigns, search, typeFilter]);

  const globalStats = useMemo(() => ({
    total:     campaigns.length,
    active:    campaigns.filter(c => c.is_active).length,
    sent:      campaigns.reduce((a, c) => a + (c.total_sent || 0), 0),
    converted: campaigns.reduce((a, c) => a + (c.total_recovered || 0), 0),
  }), [campaigns]);

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">

      {/* ── Page Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Automation Engine</h2>
          <p className="text-xs text-slate-500 mt-1">WhatsApp retargeting · auto-conversion tracking · runs every minute</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCustom(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa" }}>
            <Sliders size={14}/> Custom
          </button>
          <button onClick={() => setShowModal(true)} className="btn-primary px-5">
            <Plus size={15}/> New Flow
          </button>
        </div>
      </div>

      {/* ── Global Stats Bar ── */}
      {!loading && campaigns.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Total Flows',   value: globalStats.total,     color: '#94a3b8', icon: '⚡' },
            { label: 'Active',        value: globalStats.active,    color: '#4ade80', icon: '🟢' },
            { label: 'Total Sent',    value: globalStats.sent.toLocaleString(), color: '#22d3ee', icon: '📤' },
            { label: 'Conversions',   value: globalStats.converted.toLocaleString(), color: '#fb923c', icon: '✅' },
          ].map(s => (
            <div key={s.label} className="rounded-2xl px-4 py-3 text-center" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-lg font-bold" style={{ color: s.color }}>{s.icon} {s.value}</p>
              <p className="text-[10px] uppercase tracking-widest mt-0.5" style={{ color: '#334155' }}>{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── AI Insights Panel ── */}
      {!loading && (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(167,139,250,0.2)', background: 'linear-gradient(135deg, rgba(167,139,250,0.06) 0%, rgba(34,211,238,0.04) 100%)' }}>
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(167,139,250,0.1)' }}>
            <div className="flex items-center gap-2">
              <span className="text-base">✨</span>
              <span className="text-[12px] font-bold" style={{ color: '#a78bfa' }}>AI Insights</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(167,139,250,0.15)', color: '#c4b5fd' }}>Smart Analytics</span>
            </div>
            <button onClick={loadAiInsights} className="text-[10px] flex items-center gap-1" style={{ color: '#475569' }}>
              <Repeat size={10}/> Refresh
            </button>
          </div>

          {insightsLoading ? (
            <div className="px-4 py-4 text-[11px] text-center" style={{ color: '#475569' }}>Analyzing your campaign data…</div>
          ) : aiInsights ? (
            <div className="px-4 py-4 space-y-4">
              {/* KPI Grid */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { icon: '💰', label: 'Revenue at Risk',   value: `₹${(aiInsights.revenue_at_risk || 0).toLocaleString('en-IN')}`, color: '#f87171', bg: 'rgba(248,113,113,0.08)' },
                  { icon: '🎯', label: 'High-Intent Buyers', value: aiInsights.high_intent_count || 0,                              color: '#4ade80', bg: 'rgba(74,222,128,0.08)' },
                  { icon: '📤', label: 'Messages Sent',      value: (aiInsights.total_sent_all_time || 0).toLocaleString(),          color: '#22d3ee', bg: 'rgba(34,211,238,0.08)' },
                  { icon: '💬', label: 'Response Rate',      value: `${aiInsights.response_rate || 0}%`,                            color: '#fbbf24', bg: 'rgba(251,191,36,0.08)' },
                ].map(k => (
                  <div key={k.label} className="rounded-xl px-3 py-2.5 text-center" style={{ background: k.bg }}>
                    <div className="text-base">{k.icon}</div>
                    <div className="text-sm font-bold mt-0.5" style={{ color: k.color }}>{k.value}</div>
                    <div className="text-[9px] mt-0.5 uppercase tracking-wide" style={{ color: '#475569' }}>{k.label}</div>
                  </div>
                ))}
              </div>

              {/* Extra stats row */}
              <div className="flex items-center gap-4 text-[10px] flex-wrap px-1" style={{ color: '#64748b' }}>
                {aiInsights.best_send_hour != null && (
                  <span>⏰ Best send time: <span style={{ color: '#a78bfa' }}>{aiInsights.best_send_hour}:00–{aiInsights.best_send_hour + 1}:00</span></span>
                )}
                {aiInsights.revenue_recovered_week > 0 && (
                  <span>🏆 Recovered this week: <span style={{ color: '#4ade80' }}>₹{aiInsights.revenue_recovered_week.toLocaleString('en-IN')}</span></span>
                )}
                {aiInsights.confirmed_orders > 0 && (
                  <span>📦 COD confirmed: <span style={{ color: '#fbbf24' }}>{aiInsights.confirmed_orders}</span></span>
                )}
              </div>

              {/* AI Recommendations */}
              {aiInsights.recommendations?.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#475569' }}>AI Recommendations</p>
                  {aiInsights.recommendations.map((r, i) => (
                    <div key={i} className="text-[11px] px-3 py-2 rounded-xl" style={{ background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.1)', color: '#cbd5e1' }}>
                      {r}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="px-4 py-3 text-[11px]" style={{ color: '#475569' }}>Click Refresh to load insights.</div>
          )}
        </div>
      )}

      {/* ── Search + Type Filter ── */}
      {!loading && campaigns.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/>
            <input
              type="text" placeholder="Search campaigns…"
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs rounded-xl outline-none"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }}
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {['all', 'order_confirmation', 'abandoned_product_view', 'abandoned_cart', 'abandoned_checkout', 'website_visit', 'post_purchase', 'post_cart_upsell'].map(t => (
              <button key={t} onClick={() => setTypeFilter(t)}
                className="text-[10px] px-2.5 py-1.5 rounded-lg font-semibold transition-all"
                style={typeFilter === t
                  ? { background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.35)', color: '#4ade80' }
                  : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#475569' }}>
                {t === 'all' ? 'All' : (CAMPAIGN_TYPES.find(ct => ct.id === t)?.icon || '') + ' ' + (t.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()))}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading && (
          <div className="col-span-full py-16 text-center">
            <div className="inline-flex items-center gap-2 text-slate-500 text-sm"><Repeat size={14} className="animate-spin"/> Loading automation flows…</div>
          </div>
        )}
        {!loading && campaigns.length === 0 && (
          <div className="col-span-full py-20 px-8 rounded-[2.5rem] bg-white/[0.01] border border-white/5 border-dashed flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 rounded-3xl bg-green-500/10 flex items-center justify-center text-4xl mb-6 border border-green-500/20">🚀</div>
            <h3 className="text-xl font-bold text-white mb-2">Ready to Launch?</h3>
            <p className="text-sm text-slate-500 max-w-sm mb-8 leading-relaxed">No automation flows yet. Create your first campaign to start recovering revenue automatically.</p>
            <button onClick={() => setShowModal(true)} className="btn-primary px-10 py-3">Establish First Flow</button>
          </div>
        )}
        {!loading && filteredCampaigns.length === 0 && campaigns.length > 0 && (
          <div className="col-span-full py-12 text-center text-slate-500 text-sm">No campaigns match your filter.</div>
        )}

        {filteredCampaigns.map(c => {
          const isCustom = c.campaign_type === 'custom';
          const type = CAMPAIGN_TYPES.find(t => t.id === c.campaign_type) || CAMPAIGN_TYPES[0];
          const isActive = !!c.is_active;
          const convRate = c.total_sent > 0 ? ((c.total_recovered / c.total_sent) * 100).toFixed(1) : '0.0';
          const isAPV = c.campaign_type === 'abandoned_product_view';
          const lastRun = timeAgo(c.last_run_at);
          let filters = null;
          try { filters = c.filters ? JSON.parse(c.filters) : null; } catch (_) {}

          // Status badge config
          const statusBadge = isActive
            ? { label: 'Active', color: '#4ade80', bg: 'rgba(74,222,128,0.12)', border: 'rgba(74,222,128,0.25)', pulse: true }
            : { label: 'Paused', color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.2)', pulse: false };

          return (
            <div key={c.id} className="rounded-2xl flex flex-col overflow-hidden group/card"
              style={{
                background: 'rgba(255,255,255,0.015)',
                border: `1px solid ${isActive ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.06)'}`,
                boxShadow: isActive ? '0 0 0 1px rgba(74,222,128,0.05) inset' : 'none',
                transition: 'border-color 0.3s',
              }}>

              {/* ── Card Header ── */}
              <div className="px-5 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                    style={{ background: isCustom ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    {isCustom ? '🎯' : type.icon}
                  </div>

                  {/* Name + meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-white text-sm leading-tight truncate">{c.name}</h3>
                      {/* Status badge */}
                      <span className="flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: statusBadge.bg, border: `1px solid ${statusBadge.border}`, color: statusBadge.color }}>
                        {statusBadge.pulse && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: statusBadge.color }}/>}
                        {statusBadge.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[10px]" style={{ color: '#475569' }}>
                        {isCustom ? '🎯 Custom' : `${type.icon} ${type.label}`}
                      </span>
                      {lastRun && (
                        <span className="text-[9px]" style={{ color: '#334155' }}>· last run {lastRun}</span>
                      )}
                      {isAPV && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                          style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)', color: '#22d3ee' }}>
                          Single Product
                        </span>
                      )}
                      {isCustom && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                          style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)', color: '#c084fc' }}>
                          {c.run_times === 0 ? '∞ runs' : `${c.run_times || 1}× runs`}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* Pause / Resume toggle */}
                    <button
                      onClick={() => handleToggle(c)}
                      disabled={!!toggling[c.id]}
                      title={isActive ? 'Pause campaign' : 'Resume campaign'}
                      className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-lg font-semibold transition-all"
                      style={{
                        background: isActive ? 'rgba(251,191,36,0.1)' : 'rgba(74,222,128,0.1)',
                        border: `1px solid ${isActive ? 'rgba(251,191,36,0.25)' : 'rgba(74,222,128,0.25)'}`,
                        color: isActive ? '#fbbf24' : '#4ade80',
                        opacity: toggling[c.id] ? 0.5 : 1,
                      }}>
                      {toggling[c.id]
                        ? <Repeat size={10} className="animate-spin"/>
                        : isActive ? '⏸' : '▶'}
                    </button>
                    {/* Delete */}
                    <button
                      onClick={async () => {
                        if (!confirm(`Delete "${c.name}"?\n\nThis will:\n• Stop all future messages immediately\n• Delete all send history\n• Reset automation state for affected users\n\nThis cannot be undone.`)) return;
                        await campaignsApi.delete(c.id);
                        setAnalyticsMap(p => { const n = {...p}; delete n[c.id]; return n; });
                        setPayloadMap(p => { const n = {...p}; delete n[c.id]; return n; });
                        setAudienceMap(p => { const n = {...p}; delete n[c.id]; return n; });
                        setSendResultMap(p => { const n = {...p}; delete n[c.id]; return n; });
                        if (testModal?.id === c.id) { setTestModal(null); setTestResult(null); }
                        if (flowModal?.id === c.id) setFlowModal(null);
                        load();
                      }}
                      title="Delete campaign"
                      className="p-1.5 rounded-lg opacity-0 group-hover/card:opacity-100 transition-opacity"
                      style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171' }}>
                      <Trash2 size={12}/>
                    </button>
                  </div>
                </div>

                {/* Filter tags for custom campaigns */}
                {isCustom && filters?.rules?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {filters.rules.slice(0, 3).map((r, i) => (
                      <span key={i} className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                        style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)', color: '#60a5fa' }}>
                        {r.field.replace(/_/g, ' ')} {r.op === 'gte' ? '≥' : '='} {r.value}
                      </span>
                    ))}
                    {filters.rules.length > 3 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ color: '#334155' }}>+{filters.rules.length - 3} more</span>
                    )}
                  </div>
                )}
              </div>

              {/* ── Quick Stats Strip ── */}
              <div className="grid grid-cols-4 px-5 py-3" style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                {[
                  { icon: '📤', label: 'Sent',    value: c.total_sent      || 0, color: '#22d3ee' },
                  { icon: '🖱️', label: 'Clicked', value: analyticsMap[c.id]?.msg_clicked ?? '—', color: '#a78bfa' },
                  { icon: '🛒', label: 'Cart',    value: analyticsMap[c.id]?.add_to_carts ?? '—', color: '#fb923c' },
                  { icon: '✅', label: 'Bought',  value: c.total_recovered  || 0, color: '#4ade80' },
                ].map(s => (
                  <div key={s.label} className="text-center">
                    <div className="text-sm font-bold" style={{ color: s.color }}>{s.value}</div>
                    <div className="text-[9px] uppercase tracking-wide mt-0.5" style={{ color: '#334155' }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* ── Collapsible Panels ── */}
              <div className="flex-1 px-5 py-4 space-y-2">

                {/* Analytics */}
                <div>
                  <button onClick={() => toggleAnalytics(c.id)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-[10px] font-semibold transition-all"
                    style={{ background: analyticsOpen[c.id] ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${analyticsOpen[c.id] ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.05)'}`, color: analyticsOpen[c.id] ? '#60a5fa' : '#64748b' }}>
                    <span className="flex items-center gap-1.5"><TrendingDown size={10}/> Analytics</span>
                    <ChevronDown size={10} style={{ transform: analyticsOpen[c.id] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}/>
                  </button>
                  {analyticsOpen[c.id] && (
                    <div className="mt-2 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(59,130,246,0.15)' }}>
                      {analyticsLoading[c.id] ? (
                        <div className="flex items-center justify-center gap-2 py-5 text-xs" style={{ color: '#64748b' }}><Repeat size={11} className="animate-spin"/> Loading…</div>
                      ) : analyticsMap[c.id] ? (() => {
                        const a = analyticsMap[c.id];
                        return (
                          <div className="p-3 space-y-3">
                            <div className="grid grid-cols-3 gap-2 text-center">
                              {[
                                { label: 'Sent',   value: a.total_sent   || 0, color: '#22d3ee', icon: '📤' },
                                { label: 'Failed', value: a.total_failed || 0, color: a.total_failed > 0 ? '#f87171' : '#334155', icon: '✗' },
                                { label: 'Opened', value: a.msg_clicked  || 0, color: '#a78bfa', icon: '📬' },
                              ].map(s => (
                                <div key={s.label} className="py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                                  <div className="text-sm">{s.icon}</div>
                                  <div className="text-sm font-bold mt-0.5" style={{ color: s.color }}>{s.value}</div>
                                  <div className="text-[9px] uppercase tracking-wide mt-0.5" style={{ color: '#475569' }}>{s.label}</div>
                                </div>
                              ))}
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-center">
                              {[
                                { label: 'Link Clicks', value: a.clicks,       color: '#60a5fa', icon: '🖱️' },
                                { label: 'Add to Cart', value: a.add_to_carts, color: '#fb923c', icon: '🛒' },
                                { label: 'Purchases',   value: a.purchases,    color: '#4ade80', icon: '✅' },
                              ].map(s => (
                                <div key={s.label} className="py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                                  <div className="text-sm">{s.icon}</div>
                                  <div className="text-sm font-bold mt-0.5" style={{ color: s.color }}>{s.value}</div>
                                  <div className="text-[9px] uppercase tracking-wide mt-0.5" style={{ color: '#475569' }}>{s.label}</div>
                                </div>
                              ))}
                            </div>
                            <div className="flex items-center justify-between text-[10px] flex-wrap gap-1" style={{ color: '#64748b' }}>
                              {a.open_rate > 0 && <span>Open: <span style={{ color: '#a78bfa' }}>{a.open_rate}%</span></span>}
                              {a.cart_rate > 0 && <><span>·</span><span>Cart: <span style={{ color: '#fb923c' }}>{a.cart_rate}%</span></span></>}
                              {a.buy_rate  > 0 && <><span>·</span><span>Buy: <span style={{ color: '#4ade80' }}>{a.buy_rate}%</span></span></>}
                              <button onClick={() => loadAnalytics(c.id)} className="ml-auto" title="Refresh" style={{ color: '#334155' }}><Repeat size={10}/></button>
                            </div>
                            {a.clicks === 0 && <p className="text-[10px] text-center" style={{ color: '#334155' }}>Conversion data appears once users click your WhatsApp message links.</p>}
                          </div>
                        );
                      })() : (
                        <div className="p-3 text-[10px] text-center" style={{ color: '#475569' }}>No analytics yet.</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Send History */}
                <div>
                  <button onClick={() => togglePayload(c.id)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-[10px] font-semibold transition-all"
                    style={{ background: payloadOpen[c.id] ? 'rgba(6,182,212,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${payloadOpen[c.id] ? 'rgba(6,182,212,0.3)' : 'rgba(255,255,255,0.05)'}`, color: payloadOpen[c.id] ? '#22d3ee' : '#64748b' }}>
                    <span className="flex items-center gap-1.5"><GitBranch size={10}/> Send History</span>
                    <span className="flex items-center gap-1.5">
                      {payloadMap[c.id] && (
                        <>
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(74,222,128,0.12)', color: '#4ade80' }}>✓ {payloadMap[c.id].totalSent}</span>
                          {payloadMap[c.id].totalFailed > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(248,113,113,0.12)', color: '#f87171' }}>✗ {payloadMap[c.id].totalFailed}</span>}
                        </>
                      )}
                      <ChevronDown size={10} style={{ transform: payloadOpen[c.id] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}/>
                    </span>
                  </button>
                  {payloadOpen[c.id] && (() => {
                    const data = payloadMap[c.id];
                    if (!data) return <div className="mt-2 text-[10px] text-center py-3" style={{ color: '#475569' }}>Loading…</div>;
                    const execs = data.executions || [];
                    if (!execs.length) return <div className="mt-2 text-[10px] text-center py-3 rounded-xl" style={{ color: '#475569', border: '1px solid rgba(255,255,255,0.05)' }}>No messages sent yet.</div>;
                    return (
                      <div className="mt-2 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(6,182,212,0.15)' }}>
                        <div className="px-3 py-2 flex items-center gap-3" style={{ background: 'rgba(6,182,212,0.05)', borderBottom: '1px solid rgba(6,182,212,0.08)' }}>
                          <span className="text-[10px] font-bold" style={{ color: '#4ade80' }}>✓ {data.totalSent} sent</span>
                          {data.totalFailed > 0 && <span className="text-[10px] font-bold" style={{ color: '#f87171' }}>✗ {data.totalFailed} failed</span>}
                          <button onClick={() => loadPayload(c.id)} className="ml-auto text-[9px] flex items-center gap-1" style={{ color: '#475569' }}><Repeat size={9}/> Refresh</button>
                        </div>
                        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                          {execs.slice(0, 30).map((ex, i) => {
                            let payload = null;
                            try { payload = JSON.parse(ex.payload_sent || 'null'); } catch (_) {}
                            return (
                              <div key={i} className="p-3 space-y-1.5" style={{ background: i % 2 === 0 ? 'rgba(6,182,212,0.02)' : 'transparent', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                                <div className="flex items-center justify-between flex-wrap gap-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: ex.status === 'sent' ? '#4ade80' : '#f87171' }}/>
                                    <span className="text-[10px] font-semibold" style={{ color: ex.status === 'sent' ? '#4ade80' : '#f87171' }}>{ex.status === 'sent' ? '✓ Sent' : '✗ Failed'}</span>
                                    <span className="text-[10px] text-white font-medium">{ex.name || 'User'}</span>
                                    <span className="text-[9px] font-mono" style={{ color: '#64748b' }}>{ex.phone}</span>
                                    <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.04)', color: '#475569' }}>Stage {ex.stage || 1}</span>
                                    {ex.clicked && <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: 'rgba(167,139,250,0.1)', color: '#a78bfa' }}>🖱 clicked</span>}
                                  </div>
                                  <span className="text-[9px]" style={{ color: '#334155' }}>{new Date(ex.sent_at).toLocaleString()}</span>
                                </div>
                                {ex.campaign_name && ex.campaign_name !== c.name && <p className="text-[9px]" style={{ color: '#334155' }}>Campaign: {ex.campaign_name}</p>}
                                {ex.template_name && <p className="text-[9px]" style={{ color: '#475569' }}>Template: <span style={{ color: '#94a3b8' }}>{ex.template_name}</span></p>}
                                {ex.error && <p className="text-[9px] font-mono px-2 py-1 rounded" style={{ background: 'rgba(248,113,113,0.08)', color: '#fca5a5' }}>✗ {ex.error}</p>}
                                {payload && (
                                  <pre className="text-[9px] rounded-lg p-2 overflow-x-auto leading-relaxed"
                                    style={{ background: '#070d1a', border: '1px solid rgba(6,182,212,0.12)', color: '#67e8f9', maxHeight: 140, overflowY: 'auto' }}>
                                    {JSON.stringify(payload, null, 2)}
                                  </pre>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {execs.length > 30 && <p className="text-center text-[9px] py-2" style={{ color: '#334155' }}>Showing 30 of {execs.length}</p>}
                      </div>
                    );
                  })()}
                </div>

                {/* Who Will Receive */}
                <div>
                  <button onClick={() => toggleAudience(c.id)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-[10px] font-semibold transition-all"
                    style={{ background: audienceOpen[c.id] ? 'rgba(251,191,36,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${audienceOpen[c.id] ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.05)'}`, color: audienceOpen[c.id] ? '#fbbf24' : '#64748b' }}>
                    <span className="flex items-center gap-1.5">👥 Who Will Receive</span>
                    <span className="flex items-center gap-1.5">
                      {audienceMap[c.id] && <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold" style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>{audienceMap[c.id].count}</span>}
                      <ChevronDown size={10} style={{ transform: audienceOpen[c.id] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}/>
                    </span>
                  </button>
                  {audienceOpen[c.id] && (() => {
                    if (audienceLoading[c.id]) return <div className="mt-2 text-[10px] text-center py-3" style={{ color: '#475569' }}>Loading audience…</div>;
                    const aud = audienceMap[c.id];
                    if (!aud) return null;
                    if (!aud.audience?.length) return <div className="mt-2 text-[10px] text-center py-3 rounded-xl" style={{ color: '#475569', border: '1px solid rgba(255,255,255,0.05)' }}>No eligible users right now.</div>;

                    const fmtAgo = (min) => {
                      if (min == null) return '—';
                      if (min < 60) return `${min}m ago`;
                      if (min < 24 * 60) return `${Math.floor(min / 60)}h ${min % 60}m ago`;
                      return `${Math.floor(min / (24 * 60))}d ago`;
                    };
                    const fmtTs = (iso) => {
                      if (!iso) return null;
                      const d = new Date(iso);
                      return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
                    };
                    const fmtCountdown = (min) => {
                      if (min == null) return '—';
                      if (min === 0) return 'sending now';
                      if (min < 60) return `${min}m`;
                      return `${Math.floor(min / 60)}h ${min % 60}m`;
                    };

                    const lockBadge = (u) => {
                      const mAgo = u.minutes_since_activity;
                      const mUntil = u.minutes_until_next_send;

                      // PENDING — not yet locked, viewing product, 1st msg not sent
                      if (u.lock_status === 'pending') {
                        if (u.ready_to_send) {
                          // 30+ min passed → automation sends Stage 1 automatically within ≤1 min
                          return <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(74,222,128,0.15)', color: '#4ade80' }}>🤖 auto-sending 1st msg...</span>;
                        }
                        // < 30 min — still within inactivity window
                        const waitLeft = mAgo != null ? Math.max(0, 30 - mAgo) : null;
                        return <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(100,116,139,0.1)', color: '#64748b' }}>
                          ⏳ 1st msg in {waitLeft != null ? `${waitLeft}m` : '…'}
                        </span>;
                      }

                      // ACTIVE — locked in campaign
                      if (u.lock_status === 'active') {
                        if (u.stage === 0) {
                          // Re-entered after cart cleared — fresh 30 min wait for Stage 1
                          const waitLeft = mAgo != null ? Math.max(0, 30 - mAgo) : null;
                          return <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24' }}>
                            🔄 re-entered · 1st msg in {waitLeft != null ? `${waitLeft}m` : '…'}
                          </span>;
                        }
                        if (u.stage === 1) {
                          // Stage 1 sent — waiting 24h before Stage 2
                          if (mUntil === 0) return <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(74,222,128,0.15)', color: '#4ade80' }}>🤖 auto-sending 2nd msg...</span>;
                          return <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8' }}>
                            ✅ 1st sent · 2nd in {fmtCountdown(mUntil)}
                          </span>;
                        }
                        // stage >= 2 — both sent
                        return <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(56,189,248,0.1)', color: '#38bdf8' }}>✅ both msgs sent</span>;
                      }

                      if (u.lock_status === 'cart_added')             return <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(251,146,60,0.1)', color: '#fb923c' }}>🛒 added to cart</span>;
                      if (u.lock_status === 'purchased')              return <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(74,222,128,0.1)', color: '#4ade80' }}>✅ purchased</span>;
                      if (u.lock_status === 'messaged')               return <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(56,189,248,0.1)', color: '#38bdf8' }}>📨 {u.stage} msg{u.stage !== 1 ? 's' : ''} sent</span>;
                      if (u.lock_status === 'shifted_recommendation') return <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(167,139,250,0.1)', color: '#a78bfa' }}>✨ recommendation</span>;
                      if (u.lock_status === 'visitor')                return <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(100,116,139,0.1)', color: '#64748b' }}>👤 {u.status || 'visitor'}</span>;
                      return null;
                    };

                    const avatarColors = (u) => {
                      if (u.lock_status === 'purchased')  return { bg: 'rgba(74,222,128,0.15)',  color: '#4ade80' };
                      if (u.lock_status === 'cart_added') return { bg: 'rgba(251,146,60,0.15)',  color: '#fb923c' };
                      if (u.lock_status === 'messaged')   return { bg: 'rgba(56,189,248,0.15)',  color: '#38bdf8' };
                      if (u.lock_status === 'active')     return { bg: 'rgba(99,102,241,0.15)', color: '#818cf8' };
                      return { bg: 'rgba(251,191,36,0.1)', color: '#fbbf24' };
                    };

                    // Status badge same as Contacts command center
                    const statusBadge = (u) => {
                      const ss =
                        u.status === 'purchased'          ? { bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.3)',   color: '#4ade80'  } :
                        u.status === 'abandoned_cart'     ? { bg: 'rgba(249,115,22,0.12)',  border: 'rgba(249,115,22,0.3)',  color: '#fb923c'  } :
                        u.status === 'abandoned_checkout' ? { bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)',   color: '#f87171'  } :
                        u.status === 'product_view'       ? { bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.3)',  color: '#60a5fa'  } :
                        u.status === 'followup_complete'  ? { bg: 'rgba(168,85,247,0.12)',  border: 'rgba(168,85,247,0.3)',  color: '#c084fc'  } :
                                                            { bg: 'rgba(100,116,139,0.12)', border: 'rgba(100,116,139,0.3)', color: '#94a3b8'  };
                      return <span className="text-[8px] px-1.5 py-0.5 rounded font-semibold whitespace-nowrap"
                        style={{ background: ss.bg, border: `1px solid ${ss.border}`, color: ss.color }}>
                        {(u.status || 'active').replace(/_/g, ' ')}
                      </span>;
                    };

                    // Power score mini badge
                    const scoreBadge = (score) => {
                      if (!score) return null;
                      const cfg =
                        score >= 80 ? { color: '#f87171', bg: 'rgba(239,68,68,0.1)'   } :
                        score >= 60 ? { color: '#fb923c', bg: 'rgba(249,115,22,0.1)'  } :
                        score >= 40 ? { color: '#fbbf24', bg: 'rgba(245,158,11,0.1)'  } :
                                      { color: '#60a5fa', bg: 'rgba(59,130,246,0.1)'  };
                      return <span className="text-[8px] px-1 py-0.5 rounded font-bold font-mono"
                        style={{ background: cfg.bg, color: cfg.color }}>{score}</span>;
                    };

                    return (
                      <div className="mt-2 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(251,191,36,0.15)' }}>
                        {/* Header */}
                        <div className="px-3 py-2 flex items-center justify-between" style={{ background: 'rgba(251,191,36,0.05)', borderBottom: '1px solid rgba(251,191,36,0.08)' }}>
                          <span className="text-[10px] font-bold" style={{ color: '#fbbf24' }}>
                            {aud.count} user{aud.count !== 1 ? 's' : ''} · 🔄 auto-refresh 60s
                          </span>
                          <button onClick={() => loadAudience(c.id)} className="text-[9px] flex items-center gap-1" style={{ color: '#64748b' }}>
                            <Repeat size={9}/> Refresh
                          </button>
                        </div>

                        {/* Mini command-center table */}
                        <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <th className="text-left px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wide" style={{ color: '#475569' }}>User</th>
                                <th className="text-left px-2 py-1.5 text-[9px] font-semibold uppercase tracking-wide" style={{ color: '#475569' }}>Status</th>
                                <th className="text-left px-2 py-1.5 text-[9px] font-semibold uppercase tracking-wide" style={{ color: '#475569' }}>Campaign</th>
                                <th className="text-left px-2 py-1.5 text-[9px] font-semibold uppercase tracking-wide" style={{ color: '#475569' }}>Pwr</th>
                                <th className="text-left px-2 py-1.5 text-[9px] font-semibold uppercase tracking-wide" style={{ color: '#475569' }}>Product / Cart</th>
                                <th className="text-left px-2 py-1.5 text-[9px] font-semibold uppercase tracking-wide" style={{ color: '#475569' }}>City · Device</th>
                                <th className="text-left px-2 py-1.5 text-[9px] font-semibold uppercase tracking-wide" style={{ color: '#475569' }}>Activity</th>
                              </tr>
                            </thead>
                            <tbody>
                              {aud.audience.slice(0, 50).map((u, i) => {
                                const av = avatarColors(u);
                                const rowKey = `${c.id}-${i}`;
                                const isExpanded = expandedAPVRow === rowKey;
                                return (
                                  <React.Fragment key={i}>
                                  <tr
                                    onClick={() => setExpandedAPVRow(isExpanded ? null : rowKey)}
                                    style={{ borderTop: '1px solid rgba(255,255,255,0.03)', background: isExpanded ? 'rgba(99,102,241,0.07)' : i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent', cursor: 'pointer' }}>

                                    {/* User */}
                                    <td className="px-3 py-2">
                                      <div className="flex items-center gap-1.5">
                                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                                          style={{ background: av.bg, color: av.color }}>
                                          {(u.name || u.phone || '?')[0].toUpperCase()}
                                        </div>
                                        <div className="min-w-0">
                                          <p className="text-[10px] font-semibold text-white truncate max-w-[90px]">{u.name || 'Unknown'}</p>
                                          <p className="text-[9px] font-mono truncate" style={{ color: '#4ade80' }}>
                                            {u.phone}
                                            {u.is_repeat && <span className="ml-1" style={{ color: '#c084fc' }}>🔁</span>}
                                          </p>
                                        </div>
                                      </div>
                                    </td>

                                    {/* Command center status — same as Contacts tab */}
                                    <td className="px-2 py-2">{statusBadge(u)}</td>

                                    {/* Campaign lock status */}
                                    <td className="px-2 py-2">{lockBadge(u)}</td>

                                    {/* Power score */}
                                    <td className="px-2 py-2">
                                      <div className="flex flex-col gap-0.5">
                                        {scoreBadge(u.power_score)}
                                        {u.page_views > 0 && <span className="text-[8px] font-mono" style={{ color: '#64748b' }}>{u.page_views}pg</span>}
                                      </div>
                                    </td>

                                    {/* Product / Cart info */}
                                    <td className="px-2 py-2 max-w-[110px]">
                                      {u.product_name && (
                                        <p className="text-[9px] truncate" style={{ color: '#94a3b8' }}>
                                          {c.campaign_type === 'abandoned_cart' ? '🛒' : '👁'} {u.product_name}
                                          {u.product_price ? ` ₹${u.product_price}` : ''}
                                          {u.cart_items > 0 ? ` ×${u.cart_items}` : ''}
                                        </p>
                                      )}
                                      {u.cart_amount > 0 && <p className="text-[9px]" style={{ color: '#fb923c' }}>₹{u.cart_amount} cart</p>}
                                      {u.revenue > 0    && <p className="text-[9px]" style={{ color: '#4ade80' }}>₹{u.revenue} revenue</p>}
                                    </td>

                                    {/* City · Device */}
                                    <td className="px-2 py-2">
                                      {u.city && <p className="text-[9px]" style={{ color: '#64748b' }}>📍{u.city}</p>}
                                      {u.device && <p className="text-[9px]" style={{ color: '#475569' }}>
                                        {u.device === 'mobile' ? '📱' : u.device === 'desktop' ? '🖥' : '📲'} {u.device}
                                      </p>}
                                    </td>

                                    {/* Activity: show last-seen time */}
                                    <td className="px-2 py-2 whitespace-nowrap">
                                      <p className="text-[9px]" style={{ color: '#64748b' }}>{fmtAgo(u.minutes_since_activity)}</p>
                                      <p className="text-[8px]" style={{ color: '#334155' }}>click for details</p>
                                    </td>
                                  </tr>

                                  {/* Expandable timeline row */}
                                  {isExpanded && (
                                    <tr style={{ background: 'rgba(99,102,241,0.05)', borderBottom: '1px solid rgba(99,102,241,0.15)' }}>
                                      <td colSpan={7} className="px-4 py-3">
                                        <div className="flex flex-col gap-1.5">
                                          <p className="text-[9px] font-semibold uppercase tracking-wide mb-1" style={{ color: '#818cf8' }}>📋 Campaign Timeline — {u.name || u.phone}</p>

                                          {/* Stage 1 */}
                                          <div className="flex items-start gap-2">
                                            <span className="text-[9px] w-16 flex-shrink-0" style={{ color: '#475569' }}>1st msg</span>
                                            {u.stage_1_sent_at
                                              ? <span className="text-[9px]" style={{ color: '#a3e635' }}>✅ Sent · {fmtTs(u.stage_1_sent_at)}</span>
                                              : u.ready_to_send
                                                ? <span className="text-[9px]" style={{ color: '#fbbf24' }}>📤 Queued — sends on next automation tick (≤1 min)</span>
                                                : <span className="text-[9px]" style={{ color: '#475569' }}>⏳ Pending — waits for 30 min inactivity · viewed {fmtAgo(u.minutes_since_activity)}</span>
                                            }
                                          </div>

                                          {/* User response after Stage 1 */}
                                          {u.stage_1_sent_at && (
                                            <div className="flex items-start gap-2 pl-2" style={{ borderLeft: '2px solid rgba(99,102,241,0.3)' }}>
                                              <span className="text-[9px] w-14 flex-shrink-0" style={{ color: '#475569' }}>reply</span>
                                              {u.last_response_text
                                                ? <span className="text-[9px]" style={{ color: '#94a3b8' }}>💬 "{u.last_response_text}" · {fmtTs(u.last_response_at)}</span>
                                                : <span className="text-[9px]" style={{ color: '#334155' }}>No reply yet</span>
                                              }
                                            </div>
                                          )}

                                          {/* Stage 2 */}
                                          {u.stage_1_sent_at && (
                                            <div className="flex items-start gap-2">
                                              <span className="text-[9px] w-16 flex-shrink-0" style={{ color: '#475569' }}>2nd msg</span>
                                              {u.stage_2_sent_at
                                                ? <span className="text-[9px]" style={{ color: '#a3e635' }}>✅ Sent · {fmtTs(u.stage_2_sent_at)}</span>
                                                : u.minutes_until_next_send === 0
                                                  ? <span className="text-[9px]" style={{ color: '#fbbf24' }}>📤 Queued — sends on next automation tick (≤1 min)</span>
                                                  : <span className="text-[9px]" style={{ color: '#818cf8' }}>⏳ Scheduled · sends in {fmtCountdown(u.minutes_until_next_send)} · {fmtTs(u.stage2_due_at)}</span>
                                              }
                                            </div>
                                          )}

                                          {/* Outcome */}
                                          {(u.lock_status === 'purchased' || u.lock_status === 'cart_added') && (
                                            <div className="flex items-start gap-2 mt-0.5">
                                              <span className="text-[9px] w-16 flex-shrink-0" style={{ color: '#475569' }}>outcome</span>
                                              {u.lock_status === 'purchased'
                                                ? <span className="text-[9px]" style={{ color: '#4ade80' }}>✅ Purchased{u.revenue > 0 ? ` · ₹${u.revenue}` : ''}</span>
                                                : <span className="text-[9px]" style={{ color: '#fb923c' }}>🛒 Added to cart{u.cart_amount > 0 ? ` · ₹${u.cart_amount}` : ''}</span>
                                              }
                                            </div>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                  </React.Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        {aud.count > 50 && <p className="text-center text-[9px] py-2" style={{ color: '#334155' }}>+{aud.count - 50} more</p>}
                      </div>
                    );
                  })()}
                </div>

                {/* Order Confirmation — Audience with response status */}
                {c.campaign_type === 'order_confirmation' && (() => {
                  const aud = audienceMap[c.id];
                  const orders = aud?.audience || [];
                  return (
                    <div>
                      <button onClick={() => toggleAudience(c.id)}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-[10px] font-semibold transition-all"
                        style={{ background: audienceOpen[c.id] ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${audienceOpen[c.id] ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.05)'}`, color: audienceOpen[c.id] ? '#4ade80' : '#64748b' }}>
                        <span className="flex items-center gap-1.5">📦 COD Orders</span>
                        <span className="flex items-center gap-1.5">
                          {aud && <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold" style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80' }}>{aud.count}</span>}
                          <ChevronDown size={10} style={{ transform: audienceOpen[c.id] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}/>
                        </span>
                      </button>
                      {audienceOpen[c.id] && (audienceLoading[c.id]
                        ? <div className="mt-2 text-[10px] text-center py-3" style={{ color: '#475569' }}>Loading…</div>
                        : !orders.length
                          ? <div className="mt-2 text-[10px] text-center py-3 rounded-xl" style={{ color: '#475569', border: '1px solid rgba(255,255,255,0.05)' }}>No COD orders yet.</div>
                          : (
                            <div className="mt-2 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(34,197,94,0.15)' }}>
                              <div className="px-3 py-2 flex items-center justify-between" style={{ background: 'rgba(34,197,94,0.05)', borderBottom: '1px solid rgba(34,197,94,0.08)' }}>
                                <span className="text-[10px] font-bold" style={{ color: '#4ade80' }}>{aud.count} COD order{aud.count !== 1 ? 's' : ''}</span>
                                <button onClick={() => loadAudience(c.id)} className="text-[9px] flex items-center gap-1" style={{ color: '#64748b' }}><Repeat size={9}/> Refresh</button>
                              </div>
                              <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                                {orders.slice(0, 25).map((o, i) => {
                                  const respColor = o.response_type === 'confirmed' ? '#4ade80' : o.response_type === 'cancelled' ? '#f87171' : o.response_type === 'custom' ? '#fbbf24' : '#475569';
                                  const respBg    = o.response_type === 'confirmed' ? 'rgba(74,222,128,0.1)' : o.response_type === 'cancelled' ? 'rgba(248,113,113,0.1)' : o.response_type === 'custom' ? 'rgba(251,191,36,0.1)' : 'rgba(255,255,255,0.04)';
                                  const respLabel = o.response_type === 'confirmed' ? '✓ Confirmed' : o.response_type === 'cancelled' ? '✗ Cancelled' : o.response_type === 'custom' ? `💬 ${o.response_text?.slice(0,12)}` : o.confirmation_sent ? '⏳ Awaiting' : '📤 Not sent';
                                  return (
                                    <div key={i} className="flex items-start gap-2 px-3 py-2.5" style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5" style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80' }}>
                                        {(o.name || o.phone || '?')[0].toUpperCase()}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="text-[10px] font-semibold text-white truncate">{o.name || 'Unknown'}</span>
                                          <span className="text-[9px] font-mono" style={{ color: '#475569' }}>{o.phone}</span>
                                          <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ background: respBg, color: respColor }}>{respLabel}</span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                          <span className="text-[9px]" style={{ color: '#64748b' }}>#{o.order_number}</span>
                                          <span className="text-[9px]" style={{ color: '#334155' }}>₹{o.order_total}</span>
                                          {o.products && <span className="text-[9px] truncate max-w-[120px]" style={{ color: '#334155' }}>{o.products}</span>}
                                        </div>
                                        {o.response_text && o.response_type === 'custom' && (
                                          <p className="text-[9px] mt-0.5 italic" style={{ color: '#64748b' }}>"{o.response_text}"</p>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              {aud.count > 25 && <p className="text-center text-[9px] py-2" style={{ color: '#334155' }}>+{aud.count - 25} more orders</p>}
                            </div>
                          )
                      )}
                    </div>
                  );
                })()}

                {/* ── Test COD Order panel — order_confirmation only ── */}
                {c.campaign_type === 'order_confirmation' && (
                  <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(251,191,36,0.25)', background: 'rgba(251,191,36,0.04)' }}>
                    <div className="px-3 py-2.5 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(251,191,36,0.15)' }}>
                      <span className="text-sm">🧪</span>
                      <span className="text-[11px] font-bold" style={{ color: '#fbbf24' }}>Test COD Order</span>
                      <span className="text-[9px] ml-auto" style={{ color: '#475569' }}>Dummy order → triggers real WhatsApp send</span>
                    </div>
                    <div className="px-3 py-3 space-y-2.5">
                      <div className="flex gap-2">
                        <input
                          value={testOrderPhone}
                          onChange={e => setTestOrderPhone(e.target.value)}
                          placeholder="Phone number (e.g. 919876543210)"
                          className="flex-1 text-[11px] px-3 py-2 rounded-xl outline-none"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(251,191,36,0.2)', color: '#e2e8f0' }}
                        />
                        <button
                          onClick={() => sendTestCodOrder(c.id)}
                          disabled={testOrderLoading[c.id] || !testOrderPhone.trim()}
                          className="px-4 py-2 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1.5"
                          style={{
                            background: testOrderLoading[c.id] ? 'rgba(251,191,36,0.1)' : 'rgba(251,191,36,0.2)',
                            border: '1px solid rgba(251,191,36,0.35)',
                            color: '#fbbf24',
                            opacity: testOrderLoading[c.id] || !testOrderPhone.trim() ? 0.5 : 1,
                            cursor: testOrderLoading[c.id] || !testOrderPhone.trim() ? 'not-allowed' : 'pointer',
                          }}>
                          {testOrderLoading[c.id] ? '⏳ Sending…' : '📦 Fire COD Order'}
                        </button>
                      </div>
                      {testOrderResult[c.id] && (
                        <div className="rounded-xl px-3 py-2.5 text-[10px] space-y-1"
                          style={{ background: testOrderResult[c.id].ok ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)', border: `1px solid ${testOrderResult[c.id].ok ? 'rgba(74,222,128,0.25)' : 'rgba(248,113,113,0.25)'}` }}>
                          {testOrderResult[c.id].ok ? (
                            <>
                              <div className="font-bold" style={{ color: '#4ade80' }}>✓ WhatsApp message sent successfully</div>
                              <div style={{ color: '#94a3b8' }}>Order: <span style={{ color: '#e2e8f0' }}>{testOrderResult[c.id].order_number}</span></div>
                              <div style={{ color: '#94a3b8' }}>Campaign: <span style={{ color: '#e2e8f0' }}>{testOrderResult[c.id].campaign}</span></div>
                              <div style={{ color: '#94a3b8' }}>Template: <span style={{ color: '#e2e8f0' }}>{testOrderResult[c.id].template}</span></div>
                              {testOrderResult[c.id].wamid && <div style={{ color: '#94a3b8' }}>WAMID: <span className="font-mono text-[9px]" style={{ color: '#60a5fa' }}>{testOrderResult[c.id].wamid}</span></div>}
                            </>
                          ) : (
                            <>
                              <div className="font-bold" style={{ color: '#f87171' }}>✗ {testOrderResult[c.id].step ? `Failed at: ${testOrderResult[c.id].step}` : 'Error'}</div>
                              <div style={{ color: '#fca5a5' }}>{testOrderResult[c.id].error}</div>
                            </>
                          )}
                        </div>
                      )}
                      <p className="text-[9px]" style={{ color: '#334155' }}>
                        Sends a random dummy COD order to this phone. Campaign must be active with an approved template.
                      </p>
                    </div>
                  </div>
                )}

                {/* ── Test Product View panel — abandoned_product_view only ── */}
                {c.campaign_type === 'abandoned_product_view' && (
                  <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(96,165,250,0.25)', background: 'rgba(96,165,250,0.04)' }}>
                    <div className="px-3 py-2.5 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(96,165,250,0.15)' }}>
                      <span className="text-sm">🧪</span>
                      <span className="text-[11px] font-bold" style={{ color: '#60a5fa' }}>Test Product View</span>
                      <span className="text-[9px] ml-auto" style={{ color: '#475569' }}>Injects a product view → triggers real WhatsApp send</span>
                    </div>
                    <div className="px-3 py-3 space-y-2">
                      <div className="flex gap-2">
                        <input
                          value={testOrderPhone}
                          onChange={e => setTestOrderPhone(e.target.value)}
                          placeholder="Phone (e.g. 919876543210)"
                          className="flex-1 text-[11px] px-3 py-2 rounded-xl outline-none"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(96,165,250,0.2)', color: '#e2e8f0' }}
                        />
                      </div>
                      <div className="flex gap-2">
                        <input
                          id={`apv-product-${c.id}`}
                          placeholder="Product name (optional)"
                          className="flex-1 text-[11px] px-3 py-2 rounded-xl outline-none"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(96,165,250,0.2)', color: '#e2e8f0' }}
                        />
                        <button
                          onClick={() => {
                            const productName = document.getElementById(`apv-product-${c.id}`)?.value || '';
                            sendTestProductView(c.id, productName);
                          }}
                          disabled={testOrderLoading[c.id] || !testOrderPhone.trim()}
                          className="px-4 py-2 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1.5"
                          style={{
                            background: testOrderLoading[c.id] ? 'rgba(96,165,250,0.1)' : 'rgba(96,165,250,0.2)',
                            border: '1px solid rgba(96,165,250,0.35)',
                            color: '#60a5fa',
                            opacity: testOrderLoading[c.id] || !testOrderPhone.trim() ? 0.5 : 1,
                            cursor: testOrderLoading[c.id] || !testOrderPhone.trim() ? 'not-allowed' : 'pointer',
                          }}>
                          {testOrderLoading[c.id] ? '⏳ Sending…' : '👁 Fire Product View'}
                        </button>
                      </div>
                      {testOrderResult[c.id] && (
                        <div className="rounded-xl px-3 py-2.5 text-[10px] space-y-1"
                          style={{ background: testOrderResult[c.id].ok ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)', border: `1px solid ${testOrderResult[c.id].ok ? 'rgba(74,222,128,0.25)' : 'rgba(248,113,113,0.25)'}` }}>
                          {testOrderResult[c.id].ok ? (
                            <>
                              <div className="font-bold" style={{ color: '#4ade80' }}>✓ WhatsApp message sent</div>
                              <div style={{ color: '#94a3b8' }}>Product: <span style={{ color: '#e2e8f0' }}>{testOrderResult[c.id].product}</span></div>
                              <div style={{ color: '#94a3b8' }}>Campaign: <span style={{ color: '#e2e8f0' }}>{testOrderResult[c.id].campaign}</span></div>
                              <div style={{ color: '#94a3b8' }}>Template: <span style={{ color: '#e2e8f0' }}>{testOrderResult[c.id].template}</span></div>
                              {testOrderResult[c.id].wamid && <div style={{ color: '#94a3b8' }}>WAMID: <span className="font-mono text-[9px]" style={{ color: '#60a5fa' }}>{testOrderResult[c.id].wamid}</span></div>}
                            </>
                          ) : (
                            <>
                              <div className="font-bold" style={{ color: '#f87171' }}>✗ {testOrderResult[c.id].step ? `Failed at: ${testOrderResult[c.id].step}` : 'Error'}</div>
                              <div style={{ color: '#fca5a5' }}>{testOrderResult[c.id].error}</div>
                            </>
                          )}
                        </div>
                      )}
                      <p className="text-[9px]" style={{ color: '#334155' }}>
                        Injects a product view 35 min ago (bypasses 30-min wait). Campaign must be active with approved template.
                      </p>
                    </div>
                  </div>
                )}

                {/* User Responses Panel — order_confirmation only */}
                {c.campaign_type === 'order_confirmation' && (
                  <div>
                    <button onClick={() => toggleResponses(c.id)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-[10px] font-semibold transition-all"
                      style={{ background: responsesOpen[c.id] ? 'rgba(167,139,250,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${responsesOpen[c.id] ? 'rgba(167,139,250,0.3)' : 'rgba(255,255,255,0.05)'}`, color: responsesOpen[c.id] ? '#a78bfa' : '#64748b' }}>
                      <span className="flex items-center gap-1.5">💬 User Responses</span>
                      <span className="flex items-center gap-1.5">
                        {responsesMap[c.id]?.summary?.total > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold" style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }}>
                            {responsesMap[c.id].summary.total}
                          </span>
                        )}
                        <ChevronDown size={10} style={{ transform: responsesOpen[c.id] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}/>
                      </span>
                    </button>

                    {responsesOpen[c.id] && (() => {
                      if (responsesLoading[c.id]) return <div className="mt-2 text-[10px] text-center py-3" style={{ color: '#475569' }}>Loading…</div>;
                      const rd = responsesMap[c.id];
                      if (!rd) return null;
                      const { per_user = [], summary = {} } = rd;

                      return (
                        <div className="mt-2 space-y-2">
                          {/* Summary strip */}
                          <div className="grid grid-cols-3 gap-2 text-center">
                            {[
                              { label: 'Confirmed',    value: summary.confirmed || 0, color: '#4ade80', bg: 'rgba(74,222,128,0.08)' },
                              { label: 'Cancelled',    value: summary.cancelled || 0, color: '#f87171', bg: 'rgba(248,113,113,0.08)' },
                              { label: 'Custom Reply', value: summary.custom    || 0, color: '#fbbf24', bg: 'rgba(251,191,36,0.08)' },
                            ].map(s => (
                              <div key={s.label} className="py-2 rounded-lg" style={{ background: s.bg }}>
                                <div className="text-sm font-bold" style={{ color: s.color }}>{s.value}</div>
                                <div className="text-[9px] uppercase tracking-wide mt-0.5" style={{ color: '#475569' }}>{s.label}</div>
                              </div>
                            ))}
                          </div>

                          {/* Extra stats */}
                          {summary.total > 0 && (
                            <div className="flex items-center gap-3 text-[9px] px-1" style={{ color: '#475569' }}>
                              <span>⚡ Quick replies: <span style={{ color: '#a78bfa' }}>{summary.quick_replies || 0}</span></span>
                              <span>✍️ Custom text: <span style={{ color: '#fbbf24' }}>{summary.custom_texts || 0}</span></span>
                              <button onClick={() => loadResponses(c.id)} className="ml-auto flex items-center gap-1" style={{ color: '#334155' }}><Repeat size={8}/> Refresh</button>
                            </div>
                          )}

                          {/* Per-user list */}
                          {per_user.length > 0 ? (
                            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(167,139,250,0.15)', maxHeight: 320, overflowY: 'auto' }}>
                              {per_user.map((u, ui) => {
                                const latestColor = u.latest_type === 'confirmed' ? '#4ade80' : u.latest_type === 'cancelled' ? '#f87171' : '#fbbf24';
                                const latestBg    = u.latest_type === 'confirmed' ? 'rgba(74,222,128,0.1)' : u.latest_type === 'cancelled' ? 'rgba(248,113,113,0.1)' : 'rgba(251,191,36,0.1)';
                                const latestIcon  = u.latest_type === 'confirmed' ? '✓' : u.latest_type === 'cancelled' ? '✗' : '💬';
                                return (
                                  <div key={ui} style={{ borderTop: ui > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none', background: ui % 2 === 0 ? 'rgba(167,139,250,0.03)' : 'transparent' }}>
                                    {/* User header row */}
                                    <div className="flex items-start gap-2 px-3 py-2.5">
                                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                                        style={{ background: latestBg, color: latestColor }}>
                                        {(u.name || u.phone)[0].toUpperCase()}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="text-[10px] font-semibold text-white">{u.name}</span>
                                          <span className="text-[9px] font-mono" style={{ color: '#475569' }}>{u.phone}</span>
                                          {u.order_number && <span className="text-[9px]" style={{ color: '#64748b' }}>#{u.order_number}</span>}
                                          <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ background: latestBg, color: latestColor }}>
                                            {latestIcon} {u.latest_type}
                                          </span>
                                          {u.reply_count > 1 && (
                                            <span className="text-[9px]" style={{ color: '#475569' }}>{u.reply_count} replies</span>
                                          )}
                                        </div>
                                        {/* All replies for this user */}
                                        <div className="mt-1.5 space-y-1">
                                          {u.replies.map((r, ri) => {
                                            const rc = r.response_type === 'confirmed' ? '#4ade80' : r.response_type === 'cancelled' ? '#f87171' : '#fbbf24';
                                            let rawObj = null;
                                            try { rawObj = JSON.parse(r.raw_payload || 'null'); } catch (_) {}
                                            return (
                                              <div key={ri}>
                                                <div className="flex items-start gap-1.5">
                                                  <span className="text-[9px] font-bold mt-0.5 flex-shrink-0" style={{ color: rc }}>
                                                    {r.response_type === 'confirmed' ? '✓' : r.response_type === 'cancelled' ? '✗' : '›'}
                                                  </span>
                                                  <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                      <span className="text-[10px] text-white font-medium">"{r.response_text}"</span>
                                                      <span className="text-[9px] px-1 rounded" style={{ background: r.is_quick_reply ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.05)', color: r.is_quick_reply ? '#4ade80' : '#64748b' }}>
                                                        {r.is_quick_reply ? '⚡ Quick Reply' : '✍️ Text'}
                                                      </span>
                                                      <span className="text-[9px]" style={{ color: '#334155' }}>{new Date(r.responded_at).toLocaleTimeString()}</span>
                                                    </div>
                                                    {/* Raw Meta payload toggle */}
                                                    {rawObj && (
                                                      <details className="mt-1">
                                                        <summary className="text-[9px] cursor-pointer select-none" style={{ color: '#475569' }}>Meta payload</summary>
                                                        <pre className="text-[8px] rounded p-1.5 mt-1 overflow-x-auto" style={{ background: '#070d1a', color: '#67e8f9', border: '1px solid rgba(6,182,212,0.15)', maxHeight: 100, overflowY: 'auto' }}>
                                                          {JSON.stringify(rawObj, null, 2)}
                                                        </pre>
                                                      </details>
                                                    )}
                                                  </div>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-[10px] text-center py-4 rounded-xl" style={{ color: '#334155', border: '1px solid rgba(255,255,255,0.05)' }}>
                              No replies yet — waiting for users to respond.
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Send Result Banner */}
                {sendResultMap[c.id] && (() => {
                  const sr = sendResultMap[c.id];
                  const hasErrors = sr.errors?.length > 0;
                  return (
                    <div className="rounded-xl p-3 space-y-1.5" style={{ background: hasErrors ? 'rgba(248,113,113,0.06)' : 'rgba(74,222,128,0.06)', border: `1px solid ${hasErrors ? 'rgba(248,113,113,0.2)' : 'rgba(74,222,128,0.2)'}` }}>
                      <div className="flex items-center gap-3 text-[11px] font-semibold">
                        <span style={{ color: '#4ade80' }}>✓ {sr.sent} sent</span>
                        {sr.skipped > 0 && <span style={{ color: '#94a3b8' }}>· {sr.skipped} skipped</span>}
                        {hasErrors && <span style={{ color: '#f87171' }}>· {sr.errors.length} error{sr.errors.length > 1 ? 's' : ''}</span>}
                        <button onClick={() => setSendResultMap(p => ({ ...p, [c.id]: null }))} className="ml-auto text-[9px]" style={{ color: '#475569' }}>✕</button>
                      </div>
                      {hasErrors && sr.errors.map((err, i) => (
                        <p key={i} className="text-[9px] font-mono" style={{ color: '#fca5a5' }}>✗ {err}</p>
                      ))}
                    </div>
                  );
                })()}

                {/* Test Send Panel */}
                {testModal?.id === c.id && (
                  <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(167,139,250,0.07)', border: '1px solid rgba(167,139,250,0.2)' }}>
                    <p className="text-[10px] font-semibold" style={{ color: '#a78bfa' }}>Test Send</p>
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
                      <button onClick={handleSendTest} disabled={testSending || !testPhone.trim()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                        style={{ background: 'rgba(167,139,250,0.2)', border: '1px solid rgba(167,139,250,0.3)', color: '#a78bfa', opacity: (!testPhone.trim() || testSending) ? 0.5 : 1 }}>
                        {testSending ? <Repeat size={11} className="animate-spin"/> : <Send size={11}/>}
                        {testSending ? 'Sending…' : 'Send'}
                      </button>
                    </div>
                    {testResult && (
                      <div className="text-[10px] px-2.5 py-1.5 rounded-lg"
                        style={{ background: testResult.success ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)', border: `1px solid ${testResult.success ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}`, color: testResult.success ? '#4ade80' : '#f87171' }}>
                        {testResult.success ? `✓ Sent! wamid: ${testResult.wamid}` : `✗ ${testResult.error || 'Failed'}`}
                      </div>
                    )}
                    <p className="text-[9px]" style={{ color: '#334155' }}>Full payload logged in browser console (F12)</p>
                  </div>
                )}
              </div>

              {/* ── Card Footer Actions ── */}
              <div className="px-5 py-3 flex items-center gap-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.15)' }}>
                {/* Conversion rate pill */}
                <div className="flex-1 flex items-center gap-1.5">
                  <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(parseFloat(convRate), 100)}%`, background: 'linear-gradient(90deg,#4ade80,#22d3ee)' }}/>
                  </div>
                  <span className="text-[10px] font-bold" style={{ color: '#4ade80' }}>{convRate}%</span>
                </div>

                {/* Flow diagram */}
                <button title="View flow diagram" onClick={() => setFlowModal(flowModal?.id === c.id ? null : c)}
                  className="p-2 rounded-lg border transition-all"
                  style={{ background: flowModal?.id === c.id ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.04)', borderColor: flowModal?.id === c.id ? 'rgba(6,182,212,0.4)' : 'rgba(255,255,255,0.07)', color: flowModal?.id === c.id ? '#22d3ee' : '#64748b' }}>
                  <GitBranch size={13}/>
                </button>

                {/* Test Send toggle */}
                <button title="Test send" onClick={() => { if (testModal?.id === c.id) { setTestModal(null); setTestResult(null); } else { setTestModal({ id: c.id, name: c.name }); setTestPhone(''); setTestResult(null); } }}
                  className="p-2 rounded-lg border transition-all"
                  style={{ background: testModal?.id === c.id ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.04)', borderColor: testModal?.id === c.id ? 'rgba(167,139,250,0.4)' : 'rgba(255,255,255,0.07)', color: testModal?.id === c.id ? '#a78bfa' : '#64748b' }}>
                  <Send size={13}/>
                </button>

                {/* Broadcast now */}
                <button title="Send to all matched contacts now"
                  onClick={async () => {
                    setSendResultMap(p => ({ ...p, [c.id]: null }));
                    try {
                      const result = await campaignsApi.send(c.id);
                      setSendResultMap(p => ({ ...p, [c.id]: { sent: result?.sent ?? 0, skipped: result?.skipped ?? 0, errors: result?.errors || [] } }));
                      console.group(`%c[Campaign Send] "${c.name}" — sent:${result?.sent ?? 0} skipped:${result?.skipped ?? 0}`, 'color:#22c55e;font-weight:bold');
                      if (result?.payloads?.length) result.payloads.forEach((p, i) => { console.log(`%cMessage ${i+1} → ${p.phone}`, 'color:#60a5fa'); console.log('%cPayload:', 'color:#f59e0b', JSON.stringify(p.payload, null, 2)); });
                      if (result?.errors?.length) console.error('[Errors]', result.errors);
                      console.groupEnd();
                      loadPayload(c.id);
                    } catch (e) {
                      setSendResultMap(p => ({ ...p, [c.id]: { sent: 0, skipped: 0, errors: [e.message] } }));
                    }
                    load();
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold border transition-all"
                  style={{ background: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.3)', color: '#4ade80' }}>
                  <Play size={11}/> Send Now
                </button>
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
