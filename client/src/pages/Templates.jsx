import React, { useEffect, useState, useRef } from "react";
import { Plus, Edit2, Trash2, X, MessageSquare, Globe, Image, Check, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from "lucide-react";
import { templatesApi } from "../api";
import { translateText } from "../translate";

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id:"abandoned_cart", label:"Abandoned Cart" },
  { id:"abandoned_checkout", label:"Checkout Abandoned" },
  { id:"product_view",   label:"Abandoned Product View" },
  { id:"product_recom",  label:"Product Recommendation (Carousel)" },
  { id:"post_purchase",  label:"Post-Purchase Upsell" },
  { id:"discount",       label:"Discount Offer" },
  { id:"poll",           label:"Native WhatsApp Poll (Trending)" },
  { id:"flow",           label:"WhatsApp Flow (Next-Gen)" },
];

const LANGUAGES = [
  { code:"en", flag:"🇺🇸", label:"English"    },
  { code:"hi", flag:"🇮🇳", label:"Hindi"      },
  { code:"gu", flag:"🇮🇳", label:"Gujarati"   },
  { code:"mr", flag:"🇮🇳", label:"Marathi"    },
  { code:"bn", flag:"🇧🇩", label:"Bengali"    },
  { code:"ta", flag:"🇮🇳", label:"Tamil"      },
  { code:"te", flag:"🇮🇳", label:"Telugu"     },
  { code:"ur", flag:"🇵🇰", label:"Urdu"       },
  { code:"ar", flag:"🇦🇪", label:"Arabic"     },
];

const PRODUCT_IMAGES = [
  { label:"Auto (from tracker)",   url:"{{product_image}}", preview:null },
  { label:"Blue Kurti",            url:"https://picsum.photos/seed/bluekurti/400/300",    preview:"https://picsum.photos/seed/bluekurti/80/80"    },
  { label:"Red Saree",             url:"https://picsum.photos/seed/redsaree/400/300",     preview:"https://picsum.photos/seed/redsaree/80/80"     },
  { label:"Lehenga Choli",         url:"https://picsum.photos/seed/lehenga/400/300",      preview:"https://picsum.photos/seed/lehenga/80/80"      },
  { label:"Cotton Shirt",          url:"https://picsum.photos/seed/cottonshirt/400/300",  preview:"https://picsum.photos/seed/cottonshirt/80/80"  },
  { label:"Denim Jeans",           url:"https://picsum.photos/seed/denimjeans/400/300",   preview:"https://picsum.photos/seed/denimjeans/80/80"   },
];

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

const BLANK_CARD = { image:"{{product_image}}", title:"Buy Now", url:"{{product_url}}" };

const BLANK = {
  name:"", language:"en", category:"abandoned_cart", use_visitor_lang: false,
  header_type:"none", header_text:"", header_image_url:"",
  body_text:"Hi {{name}}! 👋 You left something in your cart. Check it out!",
  footer_text:"", buttons:[], carousel_cards: [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fillVars(text = "") {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => PREVIEW_VARS[k] || `[${k}]`);
}

// ─── WhatsApp Preview Component ───────────────────────────────────────────────
function WAPreview({ tmpl }) {
  if (!tmpl) return null;
  const isCarousel = tmpl.category === "product_recom";
  const isPoll = tmpl.category === "poll";
  const isFlow = tmpl.category === "flow";
  
  const cards = tmpl.carousel_cards 
    ? (typeof tmpl.carousel_cards === 'string' ? JSON.parse(tmpl.carousel_cards) : tmpl.carousel_cards) 
    : [];

  const pollOptions = tmpl.poll_options
    ? (typeof tmpl.poll_options === 'string' ? JSON.parse(tmpl.poll_options) : tmpl.poll_options)
    : ["Option 1", "Option 2"];

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
    <div className="phone-frame glow-wapp scale-90 lg:scale-100">
       <div className="phone-notch"></div>
       
       {/* WhatsApp Header Simulation */}
       <div className="bg-[#1f2c34] pt-8 pb-3 px-4 flex items-center gap-3 border-b border-white/5">
          <ChevronLeft size={20} className="text-[#00a9ff]"/>
          <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-white/50">WA</div>
          <div className="flex-1">
             <h4 className="text-[13px] font-bold text-white leading-none">WhatsApp Marketing</h4>
             <span className="text-[10px] text-wapp/70 flex items-center gap-1.5 mt-1">
                <span className="w-1.5 h-1.5 bg-wapp rounded-full live-dot"></span>
                online
             </span>
          </div>
       </div>

       {/* Message Area */}
       <div className="h-[calc(100%-110px)] overflow-y-auto p-4 space-y-4 wa-bg-pattern bg-[#0b141a]">
          {/* Main Bubble */}
          <div className="relative animate-float">
             <svg className="absolute -left-2 top-0 text-[#1f2c34]" width="10" height="15">
               <path fill="currentColor" d="M10 0 L10 15 L0 0 Z" />
             </svg>
             
             <div className="bg-[#1f2c34] rounded-tr-xl rounded-b-xl overflow-hidden shadow-xl border border-white/5">
                {tmpl.header_type === "image" && (
                  <div className="h-36 bg-slate-800 relative group overflow-hidden">
                    <img src={fillVars(tmpl.header_image_url === "{{product_image}}" ? PREVIEW_VARS.product_image : tmpl.header_image_url)} 
                         className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt=""/>
                    {tmpl.personalize_image && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
                         <span className="text-white font-black text-lg bg-black/30 px-3 py-1 rounded-lg border border-white/20 shadow-2xl">
                            Hi {PREVIEW_VARS.name}! 👋
                         </span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent"/>
                  </div>
                )}

                <div className="px-3.5 py-3 relative">
                  <p className="text-[#e9edef] text-[13px] leading-relaxed whitespace-pre-wrap">{fillVars(tmpl.body_text)}</p>
                  
                  {isPoll && (
                    <div className="mt-4 space-y-2">
                       {pollOptions.map((opt, i) => (
                         <div key={i} className="poll-option group">
                            <span>{opt}</span>
                            <div className="w-4 h-4 rounded-full border border-white/20 group-hover:bg-wapp/20 group-hover:border-wapp transition-all"/>
                         </div>
                       ))}
                       <p className="text-[9px] text-center text-slate-500 font-medium">Select one option</p>
                    </div>
                  )}

                  {tmpl.footer_text && <p className="text-slate-400 text-[10px] mt-2 italic border-t border-white/5 pt-1">{fillVars(tmpl.footer_text)}</p>}
                  <div className="text-right mt-1.5 flex items-center justify-end gap-1">
                     <span className="text-[9px] text-slate-500">10:45 AM</span>
                     <CheckIcon/>
                  </div>
                </div>
             </div>

             {/* Dynamic Buttons */}
             {!isCarousel && !isPoll && (
                <div className="mt-1.5 space-y-1">
                   {isFlow ? (
                      <div className="bg-[#1f2c34] rounded-xl py-2.5 text-center border border-white/5 shadow-sm active:bg-white/5 transition-all flex items-center justify-center gap-2 cursor-pointer group">
                        <FlowIcon/>
                        <span className="text-[#00a9ff] text-sm font-semibold">{tmpl.flow_name || "Open Shop Flow"}</span>
                      </div>
                   ) : (
                      tmpl.buttons && (typeof tmpl.buttons === 'string' ? JSON.parse(tmpl.buttons) : tmpl.buttons).map((btn, i) => (
                        <div key={i} className="bg-[#1f2c34] rounded-xl py-2.5 text-center border border-white/5 shadow-sm active:bg-white/5 transition-all flex items-center justify-center gap-2 cursor-pointer">
                          {btn.type === 'url' && <LinkIcon/>}
                          <span className="text-[#00a9ff] text-sm font-semibold">{btn.text}</span>
                        </div>
                      ))
                   )}
                </div>
             )}
          </div>

          {/* Carousel Special View */}
          {isCarousel && cards.length > 0 && (
             <div className="flex gap-2.5 overflow-x-auto pb-4 scrollbar-hide snap-x mt-2">
                {cards.map((card, i) => (
                  <div key={i} className="min-w-[200px] bg-[#1f2c34] rounded-2xl overflow-hidden shadow-xl snap-center border border-white/5 group">
                    <div className="h-28 bg-slate-800 relative">
                      <img src={fillVars(card.image === "{{product_image}}" ? PREVIEW_VARS.product_image : card.image)} 
                           className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt=""/>
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-40"/>
                    </div>
                    <div className="p-2.5 bg-[#1f2c34]">
                        <button className="w-full bg-white/[0.03] hover:bg-white/[0.08] py-2 px-3 rounded-lg text-[#00a9ff] text-[11px] font-bold transition-all border border-white/5 flex items-center justify-center">
                           <LinkIcon/> {card.title || "Buy Now"}
                        </button>
                    </div>
                  </div>
                ))}
             </div>
          )}
       </div>
    </div>
  );
}


// ─── Card Preview Component ───────────────────────────────────────────────────
function CardPreview({ t }) {
  const isCarousel = t.category === "product_recom";
  const isPoll = t.category === "poll";
  const isFlow = t.category === "flow";
  const buttons = t.buttons ? (typeof t.buttons === 'string' ? JSON.parse(t.buttons) : t.buttons) : [];
  const cards = t.carousel_cards ? (typeof t.carousel_cards === 'string' ? JSON.parse(t.carousel_cards) : t.carousel_cards) : [];
  const pollOptions = t.poll_options ? (typeof t.poll_options === 'string' ? JSON.parse(t.poll_options) : t.poll_options) : [];

  // Support both new format (body_text) and old format (components[].text)
  let bodyText = t.body_text || '';
  if (!bodyText && t.components) {
    try {
      const comps = typeof t.components === 'string' ? JSON.parse(t.components) : t.components;
      bodyText = comps.find(c => c.type === 'body')?.text || comps[0]?.text || '';
    } catch {}
  }

  return (
    <div className="bg-[#0b141a] rounded-xl px-2.5 pt-2.5 pb-1 border border-white/5 h-44 overflow-hidden mt-3 wa-bg-pattern">
      <div className="max-w-[88%]">
        <div className="bg-[#1f2c34] rounded-tr-xl rounded-b-xl overflow-hidden shadow-lg border border-white/5">
          {t.header_type === 'image' && t.header_image_url && (
            <img
              src={t.header_image_url === '{{product_image}}' ? PREVIEW_VARS.product_image : t.header_image_url}
              className="w-full h-14 object-cover" alt=""
            />
          )}
          <div className="px-2 py-1.5">
            <p className="text-[#e9edef] text-[9px] leading-snug line-clamp-3">{fillVars(bodyText)}</p>
            {t.footer_text && <p className="text-slate-400 text-[8px] mt-0.5 italic line-clamp-1">{fillVars(t.footer_text)}</p>}
            <div className="text-right mt-0.5"><span className="text-[7px] text-slate-500">10:45 AM ✓✓</span></div>
          </div>
        </div>

        {isPoll && pollOptions.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {pollOptions.slice(0, 2).map((opt, i) => (
              <div key={i} className="bg-[#1f2c34] rounded-lg py-0.5 px-2 text-[#e9edef] text-[8px] border border-white/5">{opt}</div>
            ))}
          </div>
        )}

        {isFlow && t.flow_name && (
          <div className="mt-1 bg-[#1f2c34] rounded-lg py-1 text-center text-[#00a9ff] text-[8px] font-bold border border-white/5">
            {t.flow_name}
          </div>
        )}

        {!isCarousel && !isPoll && !isFlow && buttons.length > 0 && (
          <div className="mt-1 bg-[#1f2c34] rounded-lg py-1 text-center text-[#00a9ff] text-[8px] font-bold border border-white/5">
            {buttons[0].text}
          </div>
        )}
      </div>

      {isCarousel && cards.length > 0 && (
        <div className="flex gap-1 mt-1 overflow-hidden">
          {cards.slice(0, 3).map((card, i) => (
            <div key={i} className="min-w-[56px] bg-[#1f2c34] rounded-lg overflow-hidden border border-white/5 flex-shrink-0">
              <img
                src={card.image === '{{product_image}}' ? PREVIEW_VARS.product_image : card.image}
                className="w-full h-9 object-cover" alt=""
              />
              <p className="text-[7px] text-[#00a9ff] text-center py-0.5 font-bold truncate px-1">{card.title}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Child Components ─────────────────────────────────────────────────────────

function ImagePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const selected = PRODUCT_IMAGES.find(p => p.url === value);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-white/10 text-left text-xs">
        {selected?.preview ? <img src={selected.preview} className="w-6 h-6 rounded object-cover"/> : <div className="w-6 h-6 bg-green-500/10 rounded flex items-center justify-center text-[10px]">🤖</div>}
        <span className="flex-1 truncate">{selected?.label || "Custom Image URL"}</span>
        <ChevronDown size={14}/>
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 p-2 bg-[#0d1424] border border-white/10 rounded-xl z-20 grid grid-cols-3 gap-1 shadow-2xl">
          {PRODUCT_IMAGES.map(img => (
            <button key={img.url} onClick={() => { onChange(img.url); setOpen(false); }} className="p-1 rounded hover:bg-white/5">
               {img.preview ? <img src={img.preview} className="w-full h-10 object-cover rounded"/> : <div className="h-10 bg-green-500/10 rounded flex items-center justify-center text-lg">🤖</div>}
            </button>
          ))}
          <div className="col-span-3 pt-1 border-t border-white/5 mt-1">
             <input className="input text-[10px] py-1" placeholder="Or custom URL..." value={value} onChange={e=>onChange(e.target.value)}/>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Templates() {
  const [templates, setTemplates] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [filterCat, setFilterCat] = useState("");
  const [validationErr, setValidationErr] = useState("");

  const load = async () => {
    const data = await templatesApi.list();
    setTemplates(data || []);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(BLANK); setShowModal(true); };
  const openEdit = t => {
    setEditing(t);
    setForm({
      ...t,
      carousel_cards: t.carousel_cards ? (typeof t.carousel_cards === 'string' ? JSON.parse(t.carousel_cards) : t.carousel_cards) : [],
      buttons: t.buttons ? (typeof t.buttons === 'string' ? JSON.parse(t.buttons) : t.buttons) : [],
    });
    setShowModal(true);
  };

  const save = async () => {
    setValidationErr("");
    const errs = [];
    if (!form.name || !form.name.trim()) errs.push("• Template Name is required.");
    if (!form.body_text || !form.body_text.trim()) errs.push("• Message Body is required.");
    
    if (form.category === 'poll') {
       if (!form.poll_options || form.poll_options.length < 2) errs.push("• Poll must have at least 2 options.");
       else if (form.poll_options.some(o => !o.trim())) errs.push("• All poll options must contain text.");
    }
    else if (form.category === 'product_recom') {
       if (!form.carousel_cards || form.carousel_cards.length === 0) errs.push("• Carousel must have at least 1 slide.");
       else if (form.carousel_cards.some(c => !c.title.trim() || !c.url.trim())) errs.push("• All carousel slides must have a label and URL.");
    }
    else if (form.category === 'flow') {
       if (!form.flow_name || !form.flow_name.trim()) errs.push("• Flow Configuration button label is required.");
    }
    else {
       if (form.buttons && form.buttons.some(b => !b.text.trim() || !b.url.trim())) errs.push("• All action buttons must have text and a URL.");
    }

    if (errs.length > 0) {
      setValidationErr(errs.join("\n"));
      return;
    }

    setSaving(true);
    try {
      const payload = { ...form, 
        carousel_cards: JSON.stringify(form.carousel_cards || []),
        buttons: JSON.stringify(form.buttons || []),
        poll_options: JSON.stringify(form.poll_options || []),
      };
      if (editing) await templatesApi.update(editing.id, payload);
      else await templatesApi.create(payload);
      await load(); setShowModal(false);
    } finally { setSaving(false); }
  };

  const magicRephrase = () => {
    setTranslating(true);
    setTimeout(() => {
       const variants = [
         "Ready to level up? 🚀 Your {{product_name}} is waiting for its new home!",
         "Psst... {{name}}! 🤫 We saved your {{product_name}} just for you. Grab it before it's gone!",
         "Final call! ⏰ Complete your order for {{product_name}} and enjoy direct delivery!"
       ];
       f("body_text", variants[Math.floor(Math.random()*variants.length)]);
       setTranslating(false);
    }, 800);
  };

  const f = (k, v) => {
    setForm(p => {
      const next = { ...p, [k]:v };
      // ── Auto-defaults based on Category ──
      if (k === 'category') {
        if (v === 'abandoned_cart' || v === 'discount') {
           if (!next.buttons.length) next.buttons = [{ type: 'url', text: 'Complete Order 🛍', url: '{{cart_url}}' }];
        } else if (v === 'product_view') {
           if (!next.buttons.length) next.buttons = [{ type: 'url', text: 'View Product 🛍', url: '{{product_url}}' }];
        } else if (v === 'product_recom' || v === 'post_purchase') {
           if (!next.carousel_cards.length) next.carousel_cards = [
             { image:'https://picsum.photos/seed/bluekurti/400/300', title:'Blue Kurti', url:'{{product_url}}' },
             { image:'https://picsum.photos/seed/redsaree/400/300', title:'Red Saree', url:'{{product_url}}' }
           ];
        } else if (v === 'poll') {
           next.poll_options = ["Yes, interested!", "Tell me more", "Not now"];
        } else if (v === 'flow') {
           next.flow_name = "Selection Assistant";
        }
      }
      return next;
    });
  };

  const addCard = () => {
    if (form.carousel_cards.length >= 4) return;
    f("carousel_cards", [...form.carousel_cards, { ...BLANK_CARD, url: '{{product_url}}' }]);
  };

  const updateCard = (i, k, v) => {
    const next = [...form.carousel_cards];
    next[i] = { ...next[i], [k]:v };
    f("carousel_cards", next);
  };

  const removeCard = (i) => f("carousel_cards", form.carousel_cards.filter((_,idx)=>idx!==i));

  const AutoFill = ({ onSelect }) => (
    <div className="flex gap-1 mt-1.5 min-h-[22px]">
       {[
          { l: "Cart URL", v: "{{cart_url}}", color: "bg-orange-500/10 text-orange-400 border-orange-400/20" },
          { l: "Prod URL", v: "{{product_url}}", color: "bg-blue-500/10 text-blue-400 border-blue-400/20" }
       ].map(btn => (
         <button key={btn.v} onClick={()=>onSelect(btn.v)} className={`px-2 py-0.5 rounded text-[8px] font-bold border transition-all hover:scale-105 active:scale-95 ${btn.color}`}>
            🤖 {btn.l}
         </button>
       ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Message Architect</h2>
        <button onClick={openCreate} className="btn-primary px-6"><Plus size={18}/> New Template</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {templates.map(t => (
          <div key={t.id} className="card p-5 group relative border-white/5 hover:border-blue-500/30 transition-all">
             <div className="flex justify-between items-start mb-3">
                <div className="flex-1 min-w-0">
                   <h3 className="font-bold text-white truncate">{t.name}</h3>
                   <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                     <span className="text-[9px] text-wapp/80 bg-wapp/10 px-1.5 py-0.5 rounded font-medium uppercase tracking-wide">{t.category?.replace(/_/g,' ')}</span>
                     {t.language && <span className="text-[9px] text-slate-400 bg-white/5 px-1.5 py-0.5 rounded uppercase">{t.language}</span>}
                   </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                   <button onClick={()=>openEdit(t)} className="p-2 bg-white/5 rounded-lg hover:text-blue-400"><Edit2 size={14}/></button>
                   <button onClick={async() => { if(confirm('Delete?')){ await templatesApi.delete(t.id); load(); } }} className="p-2 bg-white/5 rounded-lg hover:text-red-400"><Trash2 size={14}/></button>
                </div>
             </div>
             <CardPreview t={t}/>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
           <div className="bg-[#0d1424] border border-white/10 rounded-3xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
              <div className="px-8 py-5 border-b border-white/5 flex items-center justify-between">
                 <h3 className="text-lg font-bold text-white">{editing ? 'Optimize Template' : 'Architect New Message'}</h3>
                 <button onClick={()=>setShowModal(false)} className="p-2 hover:bg-white/5 rounded-full text-slate-500"><X/></button>
              </div>

              <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-2 gap-0">
                 {/* Builder */}
                 <div className="p-8 space-y-6 border-r border-white/5">
                    <div className="grid grid-cols-2 gap-4">
                       <div>
                          <label className="label">Template Name</label>
                          <input className="input" value={form.name} onChange={e=>f("name",e.target.value)} placeholder="e.g. Winter Sale Recovery"/>
                       </div>
                       <div>
                          <label className="label">Focus Category</label>
                          <select className="input" value={form.category} onChange={e=>f("category",e.target.value)}>
                             {CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
                          </select>
                       </div>
                    </div>

                    <div>
                       <label className="label flex justify-between items-end">
                          Message Body
                          <div className="group relative">
                             <span className="text-[10px] text-blue-400 cursor-help border-b border-blue-400/30">Variable Guide</span>
                             <div className="absolute right-0 bottom-full mb-2 w-64 p-3 bg-slate-900 border border-white/10 rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none">
                                <p className="text-[10px] font-bold text-white mb-2 uppercase tracking-widest">Available Tags</p>
                                <div className="space-y-1.5">
                                   {[
                                      { t:"{{name}}", d:"Customer Name" },
                                      { t:"{{product_name}}", d:"Item Name" },
                                      { t:"{{product_price}}", d:"Unit Price" },
                                      { t:"{{currency}}", d:"e.g. INR / USD" },
                                      { t:"{{product_url}}", d:"Direct Link" },
                                      { t:"{{cart_url}}", d:"Recovery Link" }
                                   ].map(v => (
                                      <div key={v.t} className="flex justify-between text-[9px]">
                                         <code className="text-green-400">{v.t}</code>
                                         <span className="text-slate-500">{v.d}</span>
                                      </div>
                                   ))}
                                </div>
                             </div>
                          </div>
                       </label>
                       <textarea className="input min-h-[120px]" value={form.body_text} onChange={e=>f("body_text",e.target.value)} placeholder="Craft your message..."/>
                    </div>

                     {form.category === 'product_recom' && (
                        <div className="space-y-4">
                           <div className="flex items-center justify-between">
                              <p className="label font-bold text-blue-400 text-[10px]">Carousel Slides ({form.carousel_cards.length}/4)</p>
                              <button onClick={addCard} className="btn-secondary py-1 px-3 text-[10px]"><Plus size={12}/> Add Slide</button>
                           </div>
                           
                           <div className="grid grid-cols-2 gap-3">
                              {form.carousel_cards.map((card, i) => (
                                 <div key={i} className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 relative group/card">
                                    <button onClick={()=>removeCard(i)} className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity z-10"><X size={12} className="text-white"/></button>
                                    <div className="space-y-2">
                                       <ImagePicker value={card.image} onChange={v=>updateCard(i, "image", v)}/>
                                       <input className="input text-[10px] py-1" placeholder="Label" value={card.title} onChange={e=>updateCard(i, "title", e.target.value)}/>
                                       <AutoFill onSelect={v=>updateCard(i, "url", v)}/>
                                    </div>
                                 </div>
                              ))}
                           </div>
                        </div>
                     )}

                     {form.category === 'poll' && (
                        <div className="space-y-4">
                           <p className="label font-bold text-purple-400">Poll Options</p>
                           {form.poll_options?.map((opt, i) => (
                              <div key={i} className="flex gap-2">
                                <input className="input text-xs" value={opt} onChange={e => {
                                   const next = [...form.poll_options];
                                   next[i] = e.target.value;
                                   f("poll_options", next);
                                }}/>
                                <button onClick={() => f("poll_options", form.poll_options.filter((_,idx)=>idx!==i))} className="p-2 text-slate-500 hover:text-red-400"><Trash2 size={14}/></button>
                              </div>
                           ))}
                           <button onClick={() => f("poll_options", [...(form.poll_options||[]), "New Option"])} className="btn-secondary w-full py-2 text-xs"><Plus size={14}/> Add Option</button>
                        </div>
                     )}

                     {form.category === 'flow' && (
                        <div className="space-y-4">
                           <p className="label font-bold text-orange-400 uppercase tracking-widest">Flow Configuration</p>
                           <div>
                              <label className="text-[10px] text-slate-500 mb-1 block">Button Label</label>
                              <input className="input" value={form.flow_name} onChange={e=>f("flow_name", e.target.value)} placeholder="e.g. Open Selection Assistant"/>
                           </div>
                           <div className="p-4 bg-orange-500/5 rounded-2xl border border-orange-500/10">
                              <p className="text-[10px] text-orange-400 font-bold mb-1">PRO-TIP</p>
                              <p className="text-[10px] text-slate-400">Flows allow users to fill forms, choose options, or look up orders directly in WhatsApp.</p>
                           </div>
                        </div>
                     )}

                     {(!['product_recom', 'poll', 'flow'].includes(form.category)) && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                               <p className="label font-bold text-green-400">Standard Attachment</p>
                               <label className="flex items-center gap-2 cursor-pointer group">
                                  <input type="checkbox" className="hidden" checked={form.personalize_image} onChange={e=>f("personalize_image", e.target.checked)}/>
                                  <span className={`text-[9px] font-black uppercase tracking-tighter px-2 py-0.5 rounded border transition-all ${form.personalize_image ? 'bg-wapp text-black border-wapp' : 'text-slate-500 border-white/10 group-hover:border-white/20'}`}>
                                     {form.personalize_image ? '🔥 Personalized' : 'Static Image'}
                                  </span>
                               </label>
                            </div>
                            <div className="flex gap-2">
                                {["none","image","text"].map(h => (
                                    <button key={h} onClick={()=>f("header_type", h)} className={`flex-1 py-1.5 rounded-xl text-[10px] border capitalize font-bold transition-all ${form.header_type===h ? 'bg-green-500/10 border-green-400 text-white' : 'border-white/10 text-slate-500'}`}>{h}</button>
                                ))}
                            </div>
                            {form.header_type === 'image' && <ImagePicker value={form.header_image_url} onChange={v=>f("header_image_url", v)}/>}
                            
                            {form.buttons.length > 0 && (
                               <div className="pt-2 space-y-3">
                                  <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold leading-none mb-1">Primary CTA Button</p>
                                  {form.buttons.map((btn, idx) => (
                                     <div key={idx} className="space-y-1.5">
                                        <div className="flex gap-2">
                                           <input className="input text-xs py-2 flex-[2]" value={btn.text} onChange={e=>{
                                              const next = [...form.buttons];
                                              next[idx] = { ...next[idx], text: e.target.value };
                                              f("buttons", next);
                                           }} placeholder="Button Text"/>
                                           <input className="input text-[10px] py-1.5 flex-[3]" value={btn.url} onChange={e=> {
                                              const next = [...form.buttons];
                                              next[idx] = { ...next[idx], url: e.target.value };
                                              f("buttons", next);
                                           }} placeholder="Link URL"/>
                                        </div>
                                        <AutoFill onSelect={v => {
                                           const next = [...form.buttons];
                                           next[idx] = { ...next[idx], url: v };
                                           f("buttons", next);
                                        }}/>
                                     </div>
                                  ))}
                               </div>
                            )}
                        </div>
                     )}

                     {validationErr && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl mt-4 text-red-400 text-xs whitespace-pre-line font-medium shadow-sm">
                           ❌ Validation Errors:<br/>
                           {validationErr}
                        </div>
                     )}

                    <div className="pt-4 flex gap-4">
                       <button onClick={()=>setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
                       <button onClick={save} disabled={saving} className="btn-primary flex-1 justify-center">{saving ? 'Architecting...' : 'Deploy Template'}</button>
                    </div>
                 </div>

                 {/* Preview */}
                 <div className="p-8 bg-black/20 flex flex-col">
                    <p className="label text-center mb-8 uppercase tracking-[0.2em] text-slate-500">Real-time WhatsApp UI</p>
                    <div className="flex-1 flex items-center justify-center">
                       <WAPreview tmpl={form}/>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
