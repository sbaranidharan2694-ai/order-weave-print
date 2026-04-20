import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, ArrowRight, Loader2, Plus, RotateCcw, Edit3, MessageCircle, ChevronDown, ChevronUp } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────
type ProductCategory = "business_cards"|"wedding_cards"|"flyers"|"brochures"|"stickers_labels"|"posters_banners"|"invitations"|"custom";
type ArtworkMode = "print_ready"|"need_design"|"";
type DeliveryMode = "pickup"|"local_delivery"|"courier"|"";
type UrgencyMode = "standard"|"priority"|"urgent"|"";
type OrderStatus = "pending"|"in_review"|"printing"|"ready"|"delivered"|"cancelled";

interface FormData {
  product_category: ProductCategory|"";
  specs: Record<string,string|number>;
  quantity: number;
  artwork_mode: ArtworkMode;
  artwork_notes: string;
  design_language: string;
  design_style: string;
  design_content_note: string;
  delivery_mode: DeliveryMode;
  urgency: UrgencyMode;
  delivery_date: string;
  delivery_address: string;
  customer_name: string;
  contact_no: string;
  email: string;
  company: string;
  gstin: string;
  preferred_contact: "whatsapp"|"phone"|"email";
  special_instructions: string;
}

interface PastOrder {
  id: string;
  order_no: string;
  product_label: string;
  quantity: number;
  status: OrderStatus;
  submitted_at: string;
  delivery_date: string;
  form_data: FormData;
}

// ── Constants ──────────────────────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
// BACKEND INTEGRATION: Set VITE_SHOP_WHATSAPP=919XXXXXXXXX in .env (or pull from public settings API)
const SHOP_WA = (import.meta.env.VITE_SHOP_WHATSAPP as string) || "919XXXXXXXXX";
const LS_KEY = "sp_pub_orders";
const LS_DRAFT = "sp_pub_draft";

const CATS = [
  { id:"business_cards",  label:"Business Cards",   icon:"🪪", desc:"500–10,000 pcs" },
  { id:"wedding_cards",   label:"Wedding Cards",    icon:"💌", desc:"Invite sets & boxes" },
  { id:"flyers",          label:"Flyers",           icon:"📄", desc:"A4, A5, DL" },
  { id:"brochures",       label:"Brochures",        icon:"📋", desc:"Bi-fold, tri-fold" },
  { id:"stickers_labels", label:"Stickers & Labels",icon:"🏷️", desc:"Custom cut shapes" },
  { id:"posters_banners", label:"Posters & Banners",icon:"🖼️", desc:"Indoor & outdoor" },
  { id:"invitations",     label:"Invitations",      icon:"✉️", desc:"Events & occasions" },
  { id:"custom",          label:"Custom Print Job", icon:"⚙️", desc:"Describe your need" },
] as const;

const CAT_LABEL: Record<string,string> = Object.fromEntries(CATS.map(c=>[c.id,c.label]));

const STATUS_META: Record<OrderStatus,{label:string;color:string;editable:boolean}> = {
  pending:   {label:"Pending Review",   color:"#2563EB", editable:true},
  in_review: {label:"Under Review",     color:"#D97706", editable:true},
  printing:  {label:"Being Printed",    color:"#7C3AED", editable:false},
  ready:     {label:"Ready for Pickup", color:"#059669", editable:false},
  delivered: {label:"Delivered",        color:"#6B7280", editable:false},
  cancelled: {label:"Cancelled",        color:"#DC2626", editable:false},
};

const PAPER_TYPES = ["130gsm Art Paper","170gsm Art Paper","300gsm Art Card","80gsm Maplitho","100gsm Maplitho","Other"];

const STEPS = [
  {id:1, short:"Type"},
  {id:2, short:"Specs"},
  {id:3, short:"Artwork"},
  {id:4, short:"Delivery"},
  {id:5, short:"Review"},
];

const INIT: FormData = {
  product_category:"", specs:{}, quantity:0,
  artwork_mode:"", artwork_notes:"", design_language:"", design_style:"", design_content_note:"",
  delivery_mode:"", urgency:"", delivery_date:"", delivery_address:"",
  customer_name:"", contact_no:"", email:"", company:"", gstin:"",
  preferred_contact:"whatsapp", special_instructions:"",
};

// ── LocalStorage ───────────────────────────────────────────────────────────
const loadOrders = (): PastOrder[] => { try { return JSON.parse(localStorage.getItem(LS_KEY)||"[]"); } catch { return []; } };
const saveOrder = (o: PastOrder) => {
  const all = loadOrders();
  const idx = all.findIndex(x=>x.id===o.id);
  if (idx>=0) all[idx]=o; else all.unshift(o);
  localStorage.setItem(LS_KEY, JSON.stringify(all.slice(0,10)));
};
const loadDraft = (): Partial<FormData>|null => { try { return JSON.parse(localStorage.getItem(LS_DRAFT)||"null"); } catch { return null; } };
const saveDraft = (d: Partial<FormData>) => localStorage.setItem(LS_DRAFT, JSON.stringify(d));
const clearDraft = () => localStorage.removeItem(LS_DRAFT);

// ── Field primitives ───────────────────────────────────────────────────────
function Sel({label,id,value,opts,onChange}:{label:string;id:string;value:string|number;opts:string[];onChange:(v:string)=>void}) {
  return (
    <div className="spf">
      <label className="spl" htmlFor={id}>{label}</label>
      <select id={id} className="spi" value={value||""} onChange={e=>onChange(e.target.value)}>
        <option value="">Select…</option>
        {opts.map(o=><option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
function Inp({label,id,value,onChange,placeholder,type="text"}:{label:string;id:string;value:string|number;onChange:(v:string)=>void;placeholder?:string;type?:string}) {
  return (
    <div className="spf">
      <label className="spl" htmlFor={id}>{label}</label>
      <input id={id} type={type} className="spi" value={value||""} placeholder={placeholder} onChange={e=>onChange(e.target.value)} />
    </div>
  );
}
function Txt({label,id,value,onChange,placeholder}:{label:string;id:string;value:string;onChange:(v:string)=>void;placeholder?:string}) {
  return (
    <div className="spf">
      <label className="spl" htmlFor={id}>{label}</label>
      <textarea id={id} className="spi spta" rows={3} value={value||""} placeholder={placeholder} onChange={e=>onChange(e.target.value)} />
    </div>
  );
}

// ── Spec fields per product ────────────────────────────────────────────────
function SpecFields({cat,specs,upd}:{cat:ProductCategory;specs:Record<string,string|number>;upd:(k:string,v:string)=>void}) {
  const f=(k:string)=>specs[k]||"";
  if (cat==="business_cards") return (
    <div className="spgrid">
      <Sel label="Sides" id="sides" value={f("sides")} opts={["Single Side","Double Side"]} onChange={v=>upd("sides",v)} />
      <Sel label="Size" id="size" value={f("size")} opts={['90×54mm (Standard)','85×55mm','Square 55mm','Custom']} onChange={v=>upd("size",v)} />
      <Sel label="Paper" id="paper" value={f("paper")} opts={["300gsm Art Card","350gsm Art Card","400gsm Matt Board"]} onChange={v=>upd("paper",v)} />
      <Sel label="Lamination" id="lam" value={f("lamination")} opts={["Gloss","Matte","Soft Touch Matte","None"]} onChange={v=>upd("lamination",v)} />
      <Sel label="Corners" id="corners" value={f("corners")||"Square"} opts={["Square","Rounded"]} onChange={v=>upd("corners",v)} />
    </div>
  );
  if (cat==="wedding_cards") return (
    <div className="spgrid">
      <Sel label="Card Type" id="card_type" value={f("card_type")} opts={["Single Card","Folded Card","Box Set"]} onChange={v=>upd("card_type",v)} />
      <Sel label="Language" id="lang" value={f("language")} opts={["English","Tamil","Tamil & English","Hindi","Hindi & English"]} onChange={v=>upd("language",v)} />
      <Sel label="Paper" id="paper" value={f("paper")} opts={["300gsm Art Card","270gsm Conqueror","250gsm Textured"]} onChange={v=>upd("paper",v)} />
      <Sel label="Envelope" id="envelope" value={f("envelope")} opts={["Yes","No"]} onChange={v=>upd("envelope",v)} />
      <Sel label="Inserts" id="inserts" value={f("inserts")} opts={["None","1 Insert","2 Inserts","3 Inserts"]} onChange={v=>upd("inserts",v)} />
      <Sel label="Box Packaging" id="box" value={f("box")} opts={["No box","Printed box","Premium box"]} onChange={v=>upd("box",v)} />
    </div>
  );
  if (cat==="flyers") return (
    <div className="spgrid">
      <Sel label="Size" id="size" value={f("size")} opts={["A4","A5","A6","DL","Custom"]} onChange={v=>upd("size",v)} />
      <Sel label="Sides" id="sides" value={f("sides")} opts={["Single Side","Double Side"]} onChange={v=>upd("sides",v)} />
      <Sel label="Paper" id="paper" value={f("paper")} opts={PAPER_TYPES} onChange={v=>upd("paper",v)} />
    </div>
  );
  if (cat==="brochures") return (
    <div className="spgrid">
      <Sel label="Size" id="size" value={f("size")} opts={["A4","A5","DL"]} onChange={v=>upd("size",v)} />
      <Sel label="Fold Type" id="fold" value={f("fold")} opts={["Bi-fold (4 panels)","Tri-fold (6 panels)","Z-fold","Gate-fold"]} onChange={v=>upd("fold",v)} />
      <Sel label="Paper" id="paper" value={f("paper")} opts={PAPER_TYPES} onChange={v=>upd("paper",v)} />
    </div>
  );
  if (cat==="stickers_labels") return (
    <div className="spgrid">
      <Sel label="Shape" id="shape" value={f("shape")} opts={["Rectangle","Circle","Oval","Custom Cut"]} onChange={v=>upd("shape",v)} />
      <Sel label="Finish" id="finish" value={f("finish")} opts={["Gloss","Matte","Transparent"]} onChange={v=>upd("finish",v)} />
      <Sel label="Use" id="use" value={f("use")} opts={["Indoor","Outdoor (weatherproof)"]} onChange={v=>upd("use",v)} />
      <Sel label="Size" id="size" value={f("size")} opts={["Small (≤5cm)","Medium (5–10cm)","Large (10–20cm)","Custom"]} onChange={v=>upd("size",v)} />
    </div>
  );
  if (cat==="posters_banners") return (
    <div className="spgrid">
      <Sel label="Type" id="type" value={f("type")} opts={["Poster (Paper)","Flex Banner","Vinyl Banner","Canvas Print"]} onChange={v=>upd("type",v)} />
      <Sel label="Size" id="size" value={f("size")} opts={["A3","A2","A1","2×3ft","3×4ft","4×6ft","Custom"]} onChange={v=>upd("size",v)} />
      <Sel label="Use" id="use" value={f("use")} opts={["Indoor","Outdoor"]} onChange={v=>upd("use",v)} />
      <Sel label="Finishing" id="fin" value={f("finishing")} opts={["None","Lamination","Mounted on board","Eyelets"]} onChange={v=>upd("finishing",v)} />
    </div>
  );
  if (cat==="invitations") return (
    <div className="spgrid">
      <Sel label="Occasion" id="occ" value={f("occasion")} opts={["Wedding","Birthday","Corporate Event","Housewarming","Other"]} onChange={v=>upd("occasion",v)} />
      <Sel label="Language" id="lang" value={f("language")} opts={["English","Tamil","Tamil & English","Hindi","Hindi & English"]} onChange={v=>upd("language",v)} />
      <Sel label="Size" id="size" value={f("size")} opts={["A5","A4","DL","Square","Custom"]} onChange={v=>upd("size",v)} />
      <Sel label="Envelope" id="env" value={f("envelope")} opts={["Yes","No"]} onChange={v=>upd("envelope",v)} />
    </div>
  );
  return (
    <div className="spgrid1">
      <Txt label="Describe your print requirement" id="desc" value={f("description") as string} onChange={v=>upd("description",v)} placeholder="E.g. A3 certificate on 250gsm textured paper, 50 pieces, printed on one side…" />
      <Inp label="Approximate dimensions" id="dims" value={f("dimensions") as string} onChange={v=>upd("dimensions",v)} placeholder='E.g. 210×297mm or A3' />
      <Txt label="Special requirements" id="special" value={f("special") as string} onChange={v=>upd("special",v)} placeholder="Finishes, constraints, or anything else…" />
    </div>
  );
}

// ── Summary panel ──────────────────────────────────────────────────────────
function Summary({form,step}:{form:FormData;step:number}) {
  if (step<2||!form.product_category) return null;
  const cat=CATS.find(c=>c.id===form.product_category);
  return (
    <div className="sp-summ">
      <div className="sp-summ-head">Your Request</div>
      <div className="sp-summ-row"><span>{cat?.icon} {cat?.label}</span>{form.quantity>0&&<span>{form.quantity.toLocaleString("en-IN")} pcs</span>}</div>
      {Object.entries(form.specs).filter(([,v])=>v).slice(0,4).map(([,v])=>(
        <div key={v} className="sp-summ-spec">{String(v)}</div>
      ))}
      {form.artwork_mode&&<div className="sp-summ-spec">{form.artwork_mode==="print_ready"?"✓ Artwork ready":"✎ Design help needed"}</div>}
      {form.urgency&&<div className="sp-summ-spec" style={{textTransform:"capitalize"}}>{form.urgency} delivery</div>}
      {form.delivery_date&&<div className="sp-summ-spec">By {new Date(form.delivery_date).toLocaleDateString("en-IN",{day:"2-digit",month:"short"})}</div>}
      <div className="sp-summ-note">Final pricing confirmed after artwork review</div>
    </div>
  );
}

function MobileSummary({form,step}:{form:FormData;step:number}) {
  const [open,setOpen]=useState(false);
  const cat=CATS.find(c=>c.id===form.product_category);
  if (step<2||!cat) return null;
  return (
    <div className="sp-msum">
      <button className="sp-msum-tog" onClick={()=>setOpen(!open)}>
        <span>{cat.icon} {cat.label}{form.quantity>0?` · ${form.quantity.toLocaleString("en-IN")} pcs`:""}</span>
        {open?<ChevronUp size={15}/>:<ChevronDown size={15}/>}
      </button>
      {open&&<div className="sp-msum-body">
        {Object.entries(form.specs).filter(([,v])=>v).map(([,v])=><div key={String(v)} className="sp-summ-spec">{String(v)}</div>)}
        {form.artwork_mode&&<div className="sp-summ-spec">{form.artwork_mode==="print_ready"?"Artwork ready":"Design help needed"}</div>}
        {form.urgency&&<div className="sp-summ-spec" style={{textTransform:"capitalize"}}>{form.urgency} delivery</div>}
        <div className="sp-summ-note">Quote confirmed before printing starts</div>
      </div>}
    </div>
  );
}

// ── Past orders panel ──────────────────────────────────────────────────────
function PastPanel({orders,onReorder,onEdit,onClose}:{orders:PastOrder[];onReorder:(o:PastOrder)=>void;onEdit:(o:PastOrder)=>void;onClose:()=>void}) {
  const active=orders.filter(o=>!["delivered","cancelled"].includes(o.status));
  const past=orders.filter(o=>["delivered","cancelled"].includes(o.status));
  return (
    <div className="sp-overlay" onClick={onClose} role="dialog" aria-modal aria-label="Your orders">
      <div className="sp-drawer" onClick={e=>e.stopPropagation()}>
        <div className="sp-dr-head">
          <h2 className="sp-dr-title">Your Orders</h2>
          <button className="sp-dr-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {orders.length===0&&<p className="sp-empty">No past orders saved on this device.</p>}
        {active.length>0&&<div className="sp-dr-sec"><p className="sp-sec-lbl">Active Orders</p>{active.map(o=><OrderCard key={o.id} o={o} onReorder={onReorder} onEdit={onEdit}/>)}</div>}
        {past.length>0&&<div className="sp-dr-sec"><p className="sp-sec-lbl">Past Orders</p>{past.map(o=><OrderCard key={o.id} o={o} onReorder={onReorder} onEdit={onEdit}/>)}</div>}
        {/* BACKEND INTEGRATION: Replace localStorage with GET /api/orders?phone={phone} for cross-device history */}
        <p className="sp-dr-note">Orders shown are saved on this device only.</p>
      </div>
    </div>
  );
}

function OrderCard({o,onReorder,onEdit}:{o:PastOrder;onReorder:(o:PastOrder)=>void;onEdit:(o:PastOrder)=>void}) {
  const meta=STATUS_META[o.status]||STATUS_META.pending;
  return (
    <div className="sp-ocard">
      <div className="sp-ocard-top">
        <div>
          <div className="sp-ono">{o.order_no}</div>
          <div className="sp-ometa">{o.product_label} · {o.quantity.toLocaleString("en-IN")} pcs</div>
          <div className="sp-odate">{new Date(o.submitted_at).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}</div>
        </div>
        <span className="sp-sbadge" style={{background:meta.color+"20",color:meta.color}}>{meta.label}</span>
      </div>
      <div className="sp-oacts">
        {meta.editable&&<button className="sp-osm sp-osm-out" onClick={()=>onEdit(o)}><Edit3 size={12}/> Edit</button>}
        <button className="sp-osm sp-osm-pri" onClick={()=>onReorder(o)}><RotateCcw size={12}/> {o.status==="delivered"?"Reorder":"Duplicate"}</button>
      </div>
    </div>
  );
}

// ── Trust sidebar ──────────────────────────────────────────────────────────
function TrustBlock() {
  return (
    <div className="sp-trust">
      {[
        {i:"🔍",t:"Artwork reviewed manually before printing"},
        {i:"✅",t:"No printing before your approval"},
        {i:"💬",t:"WhatsApp support throughout your order"},
        {i:"🔒",t:"Files handled securely and privately"},
        {i:"📍",t:"Chennai-based team, local support"},
      ].map((x,i)=><div key={i} className="sp-trust-row"><span>{x.i}</span><span>{x.t}</span></div>)}
      <a href={`https://wa.me/${SHOP_WA}`} className="sp-wabtn" target="_blank" rel="noopener noreferrer">
        <MessageCircle size={13}/> Need help? WhatsApp us
      </a>
    </div>
  );
}

// ── Step 1: Print type ─────────────────────────────────────────────────────
function Step1({form,errors,upd}:{form:FormData;errors:Record<string,string>;upd:(u:Partial<FormData>)=>void}) {
  return (
    <div className="spstep">
      <h2 className="spstep-h">What would you like to print?</h2>
      <p className="spstep-sub">Choose a category — we'll show the right fields from there.</p>
      <div className="sp-catgrid" role="radiogroup" aria-label="Print category">
        {CATS.map(c=>(
          <button key={c.id} role="radio" aria-checked={form.product_category===c.id}
            className={`sp-catcard${form.product_category===c.id?" sel":""}`}
            onClick={()=>upd({product_category:c.id as ProductCategory,specs:{}})}>
            <span className="sp-cati">{c.icon}</span>
            <span className="sp-catl">{c.label}</span>
            <span className="sp-catd">{c.desc}</span>
          </button>
        ))}
      </div>
      {errors.product_category&&<p className="sp-err">{errors.product_category}</p>}
      <div className="spf">
        <label className="spl">Approximate quantity *</label>
        <div className="sp-qrow">
          {[100,250,500,1000,2000,5000].map(n=>(
            <button key={n} type="button" className={`sp-qchip${form.quantity===n?" sel":""}`} onClick={()=>upd({quantity:n})}>
              {n.toLocaleString("en-IN")}
            </button>
          ))}
        </div>
        <input type="number" className="spi" min={1} placeholder="Or type a number"
          value={form.quantity||""} onChange={e=>upd({quantity:parseInt(e.target.value)||0})} />
        {errors.quantity&&<p className="sp-err">{errors.quantity}</p>}
      </div>
    </div>
  );
}

// ── Step 2: Specs ──────────────────────────────────────────────────────────
function Step2({form,errors,upd}:{form:FormData;errors:Record<string,string>;upd:(u:Partial<FormData>)=>void}) {
  const cat=CATS.find(c=>c.id===form.product_category);
  const updSpec=(k:string,v:string)=>upd({specs:{...form.specs,[k]:v}});
  return (
    <div className="spstep">
      <h2 className="spstep-h">{cat?.label} — specifications</h2>
      <p className="spstep-sub">You can update these during quote review — don't overthink it.</p>
      {form.product_category&&<SpecFields cat={form.product_category as ProductCategory} specs={form.specs} upd={updSpec}/>}
    </div>
  );
}

// ── Step 3: Artwork ────────────────────────────────────────────────────────
function Step3({form,errors,upd}:{form:FormData;errors:Record<string,string>;upd:(u:Partial<FormData>)=>void}) {
  return (
    <div className="spstep">
      <h2 className="spstep-h">Artwork</h2>
      <p className="spstep-sub">All artwork is reviewed manually before printing starts.</p>
      <div className="sp-awchoice" role="radiogroup" aria-label="Artwork option">
        <button role="radio" aria-checked={form.artwork_mode==="print_ready"}
          className={`sp-awcard${form.artwork_mode==="print_ready"?" sel":""}`}
          onClick={()=>upd({artwork_mode:"print_ready"})}>
          <span className="sp-awi">📁</span>
          <div><div className="sp-awt">I have print-ready artwork</div><div className="sp-awd">PDF, AI, CDR, PSD at 300 DPI</div></div>
        </button>
        <button role="radio" aria-checked={form.artwork_mode==="need_design"}
          className={`sp-awcard${form.artwork_mode==="need_design"?" sel":""}`}
          onClick={()=>upd({artwork_mode:"need_design"})}>
          <span className="sp-awi">✏️</span>
          <div><div className="sp-awt">I need design help</div><div className="sp-awd">Share a brief — our team will design it</div></div>
        </button>
      </div>
      {errors.artwork_mode&&<p className="sp-err">{errors.artwork_mode}</p>}

      {form.artwork_mode==="print_ready"&&(
        <div className="sp-awbox">
          <p className="sp-awinfo">📎 Share files via WhatsApp or email after submitting. Accepted: <strong>PDF, AI, CDR, PSD, TIFF</strong> — 300 DPI or higher.</p>
          <Txt label="Notes about your artwork (optional)" id="awnotes" value={form.artwork_notes} onChange={v=>upd({artwork_notes:v})} placeholder="E.g. CMYK, bleed marks included, file ready for press…" />
        </div>
      )}

      {form.artwork_mode==="need_design"&&(
        <div className="sp-awbox spgrid">
          <Sel label="Preferred language" id="dlang" value={form.design_language} opts={["English","Tamil","Tamil & English","Hindi","Hindi & English"]} onChange={v=>upd({design_language:v})} />
          <Sel label="Design style" id="dstyle" value={form.design_style} opts={["Clean & minimal","Traditional / Classic","Bold & colourful","Corporate","Festive","Modern"]} onChange={v=>upd({design_style:v})} />
          <div className="spf spf-full">
            <label className="spl">Is your content / text ready?</label>
            <div className="sp-radiorow">
              {["Yes — I'll share the text","No — I need help with content too"].map(opt=>(
                <label key={opt} className="sp-rlabel">
                  <input type="radio" name="dcontent" value={opt} checked={form.design_content_note===opt} onChange={()=>upd({design_content_note:opt})}/>
                  <span>{opt}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="spf spf-full">
            <Txt label="Design brief or reference" id="dref" value={form.artwork_notes} onChange={v=>upd({artwork_notes:v})} placeholder="Describe your idea, share reference links, or describe the content…" />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Step 4: Delivery ───────────────────────────────────────────────────────
function Step4({form,errors,upd}:{form:FormData;errors:Record<string,string>;upd:(u:Partial<FormData>)=>void}) {
  const minDate=new Date(Date.now()+86400000).toISOString().split("T")[0];
  return (
    <div className="spstep">
      <h2 className="spstep-h">Delivery &amp; Deadline</h2>
      <p className="spstep-sub">Actual timeline is confirmed after artwork review — this helps us plan.</p>
      <fieldset className="sp-fs">
        <legend className="spl">How do you want to receive your order? *</legend>
        <div className="sp-drow">
          {[{id:"pickup",l:"Pick up from shop",i:"🏪"},{id:"local_delivery",l:"Local delivery (Chennai)",i:"🛵"},{id:"courier",l:"Courier anywhere in India",i:"📦"}].map(d=>(
            <button key={d.id} type="button" className={`sp-dcard${form.delivery_mode===d.id?" sel":""}`} onClick={()=>upd({delivery_mode:d.id as DeliveryMode})}>
              <span className="sp-di">{d.i}</span><span>{d.l}</span>
            </button>
          ))}
        </div>
        {errors.delivery_mode&&<p className="sp-err">{errors.delivery_mode}</p>}
      </fieldset>

      {(form.delivery_mode==="courier"||form.delivery_mode==="local_delivery")&&(
        <Txt label="Delivery address" id="addr" value={form.delivery_address} onChange={v=>upd({delivery_address:v})} placeholder="Full address including pincode…" />
      )}

      <fieldset className="sp-fs">
        <legend className="spl">Urgency *</legend>
        <div className="sp-urow">
          {[{id:"standard",l:"Standard",d:"3–5 working days"},{id:"priority",l:"Priority",d:"1–2 working days"},{id:"urgent",l:"Urgent",d:"Same / next day"}].map(u=>(
            <button key={u.id} type="button" className={`sp-ucard${form.urgency===u.id?" sel":""}`} onClick={()=>upd({urgency:u.id as UrgencyMode})}>
              <span className="sp-ul">{u.l}</span><span className="sp-ud">{u.d}</span>
            </button>
          ))}
        </div>
        {errors.urgency&&<p className="sp-err">{errors.urgency}</p>}
      </fieldset>

      <div className="spf">
        <label className="spl" htmlFor="deldate">Required by date *</label>
        <input id="deldate" type="date" className="spi" min={minDate} value={form.delivery_date} onChange={e=>upd({delivery_date:e.target.value})} />
        <p className="sp-hint">We'll confirm whether this timeline is achievable after artwork review.</p>
        {errors.delivery_date&&<p className="sp-err">{errors.delivery_date}</p>}
      </div>
    </div>
  );
}

// ── Step 5: Contact + Review ───────────────────────────────────────────────
function Step5({form,errors,upd}:{form:FormData;errors:Record<string,string>;upd:(u:Partial<FormData>)=>void}) {
  const [showGst,setShowGst]=useState(false);
  const cat=CATS.find(c=>c.id===form.product_category);
  const dlabel=form.delivery_date?new Date(form.delivery_date).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}):"—";
  return (
    <div className="spstep">
      <h2 className="spstep-h">Contact details</h2>
      <p className="spstep-sub">We'll send the confirmed quote before any printing starts.</p>
      <div className="spgrid">
        <Inp label="Full Name *" id="cname" value={form.customer_name} onChange={v=>upd({customer_name:v})} placeholder="Your full name" />
        <Inp label="Mobile Number *" id="cphone" type="tel" value={form.contact_no} onChange={v=>upd({contact_no:v})} placeholder="10-digit number" />
        <Inp label="Email address (optional)" id="cemail" type="email" value={form.email} onChange={v=>upd({email:v})} placeholder="you@example.com" />
        <Inp label="Company / Brand (optional)" id="cco" value={form.company} onChange={v=>upd({company:v})} placeholder="Your business name" />
      </div>
      {errors.customer_name&&<p className="sp-err">{errors.customer_name}</p>}
      {errors.contact_no&&<p className="sp-err">{errors.contact_no}</p>}

      <div className="spf">
        <label className="spl">Preferred way to confirm quote *</label>
        <div className="sp-radiorow">
          {[{id:"whatsapp",l:"WhatsApp"},{id:"phone",l:"Phone call"},{id:"email",l:"Email"}].map(o=>(
            <label key={o.id} className={`sp-cchip${form.preferred_contact===o.id?" sel":""}`}>
              <input type="radio" name="pref_contact" value={o.id} checked={form.preferred_contact===o.id} onChange={()=>upd({preferred_contact:o.id as "whatsapp"|"phone"|"email"})} />
              {o.l}
            </label>
          ))}
        </div>
      </div>

      <button type="button" className="sp-gsttog" onClick={()=>setShowGst(!showGst)}>
        {showGst?"▾":"▸"} Need a GST invoice?
      </button>
      {showGst&&<Inp label="GSTIN" id="gstin" value={form.gstin} onChange={v=>upd({gstin:v.toUpperCase()})} placeholder="e.g. 33AADCC0948F1Z1" />}

      <Txt label="Additional notes (optional)" id="notes" value={form.special_instructions} onChange={v=>upd({special_instructions:v})} placeholder="Anything else we should know…" />

      <div className="sp-revcard">
        <div className="sp-revhead">Order Summary</div>
        <div className="sp-revbody">
          {[
            ["Print type", cat?.label||"—"],
            ["Quantity", form.quantity>0?`${form.quantity.toLocaleString("en-IN")} pcs`:"—"],
            ["Artwork", form.artwork_mode==="print_ready"?"Print-ready":form.artwork_mode==="need_design"?"Design needed":"—"],
            ["Delivery", (form.delivery_mode||"—").replace("_"," ")],
            ["Urgency", form.urgency||"—"],
            ["Required by", dlabel],
          ].map(([k,v])=>(
            <div key={k} className="sp-revrow">
              <span className="sp-revk">{k}</span>
              <span className="sp-revv" style={{textTransform:"capitalize"}}>{v}</span>
            </div>
          ))}
        </div>
        <p className="sp-revnote">We'll confirm the quote and timeline. No payment needed now.</p>
      </div>
    </div>
  );
}

// ── Landing page ───────────────────────────────────────────────────────────
function Landing({pastOrders,onNew,onShowPast}:{pastOrders:PastOrder[];onNew:()=>void;onShowPast:()=>void}) {
  const active=pastOrders.filter(o=>!["delivered","cancelled"].includes(o.status));
  return (
    <div className="sp-land">
      <section className="sp-hero">
        <div className="sp-hero-in">
          <div className="sp-badge">Chennai's trusted print partner</div>
          <h1 className="sp-h1">Share your print requirement.<br/>We handle the rest.</h1>
          <p className="sp-hsub">Submit a print requirement in under 3 minutes. We review the specs, confirm the quote, then start printing only after your approval.</p>
          <div className="sp-paths">
            <button className="sp-pri" onClick={onNew}><Plus size={17}/> Start a New Print Request</button>
            {pastOrders.length>0&&(
              <button className="sp-sec" onClick={onShowPast}>
                <RotateCcw size={15}/> Reorder or Continue
                {active.length>0&&<span className="sp-cnt">{active.length}</span>}
              </button>
            )}
          </div>
          <p className="sp-htime">⏱ Most first-time requests take under 3 minutes</p>
        </div>
      </section>

      {active.length>0&&(
        <div className="sp-abanner">
          <div className="sp-abanner-in">
            <span>You have <strong>{active.length}</strong> active order{active.length>1?"s":""} — open for editing or tracking.</span>
            <button className="sp-abtn" onClick={onShowPast}>View Orders</button>
          </div>
        </div>
      )}

      <section className="sp-sec-wrap sp-cats-sec">
        <h2 className="sp-sec-h">What we print</h2>
        <div className="sp-catpills">{CATS.map(c=><div key={c.id} className="sp-pill"><span>{c.icon}</span><span>{c.label}</span></div>)}</div>
      </section>

      <section className="sp-sec-wrap sp-how-sec">
        <h2 className="sp-sec-h">How it works</h2>
        <div className="sp-howgrid">
          {[
            {n:"01",t:"Share your requirement",b:"Select what you want to print, add specs, and tell us about your artwork."},
            {n:"02",t:"We review and quote",b:"Our team checks the specs and artwork, then sends you a confirmed price."},
            {n:"03",t:"You approve",b:"Printing starts only after your explicit approval of the quote and artwork."},
            {n:"04",t:"Ready for pickup or delivery",b:"We coordinate dispatch and keep you updated throughout."},
          ].map(s=>(
            <div key={s.n} className="sp-howcard">
              <div className="sp-hown">{s.n}</div>
              <div><div className="sp-howt">{s.t}</div><div className="sp-howb">{s.b}</div></div>
            </div>
          ))}
        </div>
      </section>

      <section className="sp-trust-sec">
        <div className="sp-sec-wrap sp-trustgrid">
          {[
            {i:"🔍",t:"Artwork reviewed before printing"},
            {i:"✅",t:"Quote confirmed before production starts"},
            {i:"💬",t:"WhatsApp support throughout your order"},
            {i:"🔒",t:"Files handled securely and privately"},
            {i:"📍",t:"Chennai-based team, local support"},
            {i:"♻️",t:"Easy reorder from past orders"},
          ].map((x,i)=><div key={i} className="sp-ti"><span>{x.i}</span><span>{x.t}</span></div>)}
        </div>
      </section>

      <section className="sp-btm">
        <div className="sp-btm-in">
          <h2 className="sp-btmh">Ready to get started?</h2>
          <p className="sp-btms">Fill the short form — takes about 2–3 minutes.</p>
          <button className="sp-pri" onClick={onNew}><Plus size={17}/> Start a New Print Request</button>
          <a href={`https://wa.me/${SHOP_WA}`} className="sp-walink" target="_blank" rel="noopener noreferrer">
            <MessageCircle size={14}/> Need help? Chat with us on WhatsApp
          </a>
        </div>
      </section>
    </div>
  );
}

// ── Success view ───────────────────────────────────────────────────────────
function Success({orderNo,form,onNew}:{orderNo:string;form:FormData;onNew:()=>void}) {
  const via=form.preferred_contact==="whatsapp"?"WhatsApp":form.preferred_contact==="phone"?"phone call":"email";
  return (
    <div className="sp-succ">
      <div className="sp-succ-card">
        <div className="sp-succ-icon">✓</div>
        <h2 className="sp-succ-h">Request received!</h2>
        <div className="sp-ono-big">{orderNo}</div>
        <p className="sp-succ-body">We'll review your specs and get back to you via <strong>{via}</strong> with a confirmed quote. Printing starts only after your approval.</p>
        <div className="sp-nexts">
          {["Share your artwork files via WhatsApp or email","Receive quote confirmation from our team","Approve and we begin printing"].map((s,i)=>(
            <div key={i} className="sp-nxt"><span>{i+1}</span><span>{s}</span></div>
          ))}
        </div>
        <button className="sp-pri" style={{width:"100%"}} onClick={onNew}><Plus size={15}/> Place Another Order</button>
        <p className="sp-succ-note">Save your order number: <strong>{orderNo}</strong></p>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function PublicOrderForm() {
  const [view,setView]=useState<"landing"|"form"|"success">("landing");
  const [step,setStep]=useState(1);
  const [form,setForm]=useState<FormData>(INIT);
  const [errors,setErrors]=useState<Record<string,string>>({});
  const [submitting,setSubmitting]=useState(false);
  const [serverError,setServerError]=useState("");
  const [orderNo,setOrderNo]=useState("");
  const [editingId,setEditingId]=useState<string|null>(null);
  const [showPast,setShowPast]=useState(false);
  const [pastOrders,setPastOrders]=useState<PastOrder[]>([]);

  useEffect(()=>{
    setPastOrders(loadOrders());

    // SEO
    document.title="Place Your Print Order – Super Printers, Chennai";
    const setMeta=(n:string,c:string,prop=false)=>{
      const sel=prop?`meta[property="${n}"]`:`meta[name="${n}"]`;
      const el=document.querySelector(sel)||document.createElement("meta");
      prop?el.setAttribute("property",n):el.setAttribute("name",n);
      el.setAttribute("content",c);
      if(!document.querySelector(sel))document.head.appendChild(el);
    };
    setMeta("description","Request a print quote from Super Printers, Chennai. Business cards, wedding cards, flyers, banners & more. Quote confirmed before production starts.");
    setMeta("keywords","print shop Chennai, business cards Chennai, wedding cards printing, flyers printing Chennai, Super Printers");
    setMeta("og:title","Print Order – Super Printers, Chennai",true);
    setMeta("og:description","Share your print requirement. We review specs, confirm the quote, then print.",true);
    setMeta("og:type","website",true);

    // Google Fonts
    if(!document.getElementById("sp-fonts")){
      const l=document.createElement("link");
      l.id="sp-fonts"; l.rel="stylesheet";
      l.href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap";
      document.head.appendChild(l);
    }

    // JSON-LD
    if(!document.getElementById("sp-schema")){
      const s=document.createElement("script");
      s.id="sp-schema"; s.type="application/ld+json";
      s.text=JSON.stringify({
        "@context":"https://schema.org","@type":"LocalBusiness",
        "name":"Super Printers","description":"Professional printing services in Chennai.",
        "address":{"@type":"PostalAddress","addressLocality":"Chennai","addressRegion":"Tamil Nadu","addressCountry":"IN"},
        "url":window.location.origin+"/order","openingHours":"Mo-Sa 09:00-20:00",
      });
      document.head.appendChild(s);
    }
    return()=>{document.title="Super Printers";};
  },[]);

  useEffect(()=>{ if(view==="form") saveDraft(form); },[form,view]);

  const upd=useCallback((u:Partial<FormData>)=>{ setForm(p=>({...p,...u})); setErrors({}); },[]);

  const startNew=()=>{
    const d=loadDraft();
    setForm(d&&d.product_category?{...INIT,...d}:INIT);
    setStep(1); setEditingId(null); setView("form"); window.scrollTo(0,0);
  };

  const handleReorder=(o:PastOrder)=>{ setForm({...INIT,...o.form_data}); setEditingId(null); setStep(1); setShowPast(false); setView("form"); window.scrollTo(0,0); };
  const handleEdit=(o:PastOrder)=>{
    if(!STATUS_META[o.status]?.editable) return;
    setForm({...INIT,...o.form_data}); setEditingId(o.id); setStep(1); setShowPast(false); setView("form"); window.scrollTo(0,0);
  };

  const validate=():boolean=>{
    const e:Record<string,string>={};
    if(step===1){
      if(!form.product_category) e.product_category="Please select a print type";
      if(!form.quantity||form.quantity<1) e.quantity="Please enter a quantity";
    }
    if(step===3&&!form.artwork_mode) e.artwork_mode="Please select an artwork option";
    if(step===4){
      if(!form.delivery_mode) e.delivery_mode="Please select a delivery option";
      if(!form.urgency) e.urgency="Please select urgency";
      if(!form.delivery_date) e.delivery_date="Please select a required-by date";
    }
    if(step===5){
      if(!form.customer_name.trim()) e.customer_name="Full name is required";
      if(!/^\d{10}$/.test(form.contact_no)) e.contact_no="Enter a valid 10-digit mobile number";
    }
    setErrors(e);
    return Object.keys(e).length===0;
  };

  const next=()=>{
    if(!validate()) return;
    if(step<5){setStep(s=>s+1);window.scrollTo(0,0);}
    else submit();
  };
  const back=()=>{ if(step>1){setStep(s=>s-1);window.scrollTo(0,0);}else setView("landing"); };

  const submit=async()=>{
    if(!validate()) return;
    setSubmitting(true); setServerError("");
    // Map to Edge Function payload — preserves existing API contract
    const payload={
      customer_name:form.customer_name, contact_no:form.contact_no, email:form.email||"",
      product_type:CAT_LABEL[form.product_category]||form.product_category,
      quantity:form.quantity,
      size:(form.specs.size as string)||"",
      color_mode:"full_color",
      paper_type:(form.specs.paper as string)||"",
      delivery_date:form.delivery_date,
      special_instructions:[
        form.special_instructions, form.artwork_notes,
        Object.entries(form.specs).map(([k,v])=>`${k}: ${v}`).join(", "),
      ].filter(Boolean).join("\n"),
      // Extended fields (ignored by current edge fn, ready for future API support)
      artwork_mode:form.artwork_mode, delivery_mode:form.delivery_mode, urgency:form.urgency,
      company:form.company, gstin:form.gstin, preferred_contact:form.preferred_contact,
      design_language:form.design_language, design_style:form.design_style,
    };
    try {
      const res=await fetch(`${SUPABASE_URL}/functions/v1/submit-public-order`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      const data=await res.json();
      if(!res.ok||!data.success){setServerError(data.error||"Something went wrong. Please try again.");setSubmitting(false);return;}
      const no=data.order_no; setOrderNo(no);
      const saved:PastOrder={
        id:editingId||crypto.randomUUID(), order_no:no,
        product_label:CAT_LABEL[form.product_category]||form.product_category,
        quantity:form.quantity, status:"pending",
        submitted_at:new Date().toISOString(), delivery_date:form.delivery_date, form_data:form,
      };
      saveOrder(saved); setPastOrders(loadOrders()); clearDraft();
      setView("success"); window.scrollTo(0,0);
    } catch {
      setServerError("Network error. Please check your connection and try again.");
      setSubmitting(false);
    }
  };

  const ctaLabel:Record<number,string>={
    1:"Continue to Specifications",2:"Continue to Artwork",
    3:"Continue to Delivery",4:"Review My Request",
    5:editingId?"Update My Request":"Send for Quote Review",
  };

  if(view==="success") return <><style>{CSS}</style><Success orderNo={orderNo} form={form} onNew={()=>{setView("landing");setForm(INIT);setOrderNo("");}}/></>;
  if(view==="landing") return (
    <><style>{CSS}</style>
      <Landing pastOrders={pastOrders} onNew={startNew} onShowPast={()=>setShowPast(true)}/>
      {showPast&&<PastPanel orders={pastOrders} onReorder={handleReorder} onEdit={handleEdit} onClose={()=>setShowPast(false)}/>}
    </>
  );

  return (
    <div className="sp-froot">
      <style>{CSS}</style>
      <div className="sp-flayout">
        <div className="sp-fmain">
          {/* Progress bar */}
          <nav className="sp-prog" aria-label="Form progress">
            {STEPS.map((s,i)=>(
              <div key={s.id} className="sp-pitem">
                <div className={`sp-pdot${step===s.id?" act":step>s.id?" done":""}`}>{step>s.id?"✓":s.id}</div>
                <span className={`sp-plbl${step===s.id?" act":""}`}>{s.short}</span>
                {i<STEPS.length-1&&<div className={`sp-pline${step>s.id?" done":""}`}/>}
              </div>
            ))}
          </nav>

          <MobileSummary form={form} step={step}/>

          <div className="sp-fcard">
            {step===1&&<Step1 form={form} errors={errors} upd={upd}/>}
            {step===2&&<Step2 form={form} errors={errors} upd={upd}/>}
            {step===3&&<Step3 form={form} errors={errors} upd={upd}/>}
            {step===4&&<Step4 form={form} errors={errors} upd={upd}/>}
            {step===5&&<Step5 form={form} errors={errors} upd={upd}/>}

            {serverError&&<div className="sp-errbox" role="alert">{serverError}</div>}

            <div className="sp-fnav">
              <button className="sp-fbk" onClick={back}><ArrowLeft size={15}/> {step===1?"Back to Home":"Back"}</button>
              <button className="sp-fnxt" onClick={next} disabled={submitting}>
                {submitting?<><Loader2 size={15} className="sp-spin"/> Sending…</>:<>{ctaLabel[step]} <ArrowRight size={15}/></>}
              </button>
            </div>
          </div>
        </div>

        <aside className="sp-fsidebar">
          <Summary form={form} step={step}/>
          <TrustBlock/>
        </aside>
      </div>
    </div>
  );
}

// ── CSS ────────────────────────────────────────────────────────────────────
const CSS=`
:root{--n:#0C1A2E;--n2:#162035;--b:#1B3A6B;--a:#C9973A;--a2:#E8B14A;--cr:#F5EDD6;--cr2:#EDE4CC;--w:#fff;--g:#64748B;--g2:#94A3B8;--br:#E2E8F0;--re:#DC2626;--gr:#059669;--fh:'DM Serif Display',Georgia,serif;--fb:'DM Sans',system-ui,sans-serif}
*,*::before,*::after{box-sizing:border-box}
.sp-land,.sp-froot,.sp-succ{font-family:var(--fb);color:var(--n);min-height:100vh;background:var(--w)}

/* Hero */
.sp-hero{background:var(--n);padding:72px 24px 64px;position:relative;overflow:hidden}
.sp-hero::before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 40px,rgba(255,255,255,.015) 40px,rgba(255,255,255,.015) 41px)}
.sp-hero-in{max-width:680px;margin:0 auto;position:relative;z-index:1}
.sp-badge{display:inline-block;background:rgba(201,151,58,.18);color:var(--a2);border:1px solid rgba(201,151,58,.4);border-radius:2px;padding:4px 12px;font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;margin-bottom:22px}
.sp-h1{font-family:var(--fh);font-size:clamp(30px,5vw,50px);color:var(--cr);line-height:1.15;margin:0 0 18px;font-weight:400}
.sp-hsub{font-size:16px;color:rgba(245,237,214,.72);line-height:1.65;max-width:520px;margin:0 0 32px}
.sp-paths{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:18px}
.sp-pri{display:inline-flex;align-items:center;gap:8px;background:var(--a);color:var(--n);border:none;border-radius:4px;padding:13px 26px;font-size:14px;font-weight:700;cursor:pointer;font-family:var(--fb);transition:background .15s,transform .1s;text-decoration:none}
.sp-pri:hover{background:var(--a2);transform:translateY(-1px)}
.sp-sec{display:inline-flex;align-items:center;gap:7px;background:transparent;color:var(--cr);border:1px solid rgba(245,237,214,.3);border-radius:4px;padding:12px 18px;font-size:13px;font-weight:500;cursor:pointer;font-family:var(--fb);transition:border-color .15s,background .15s}
.sp-sec:hover{border-color:rgba(245,237,214,.65);background:rgba(245,237,214,.06)}
.sp-cnt{background:var(--a);color:var(--n);border-radius:10px;padding:1px 7px;font-size:10px;font-weight:700;margin-left:4px}
.sp-htime{font-size:12px;color:rgba(245,237,214,.5);margin:0}

/* Active banner */
.sp-abanner{background:#EFF6FF;border-bottom:1px solid #BFDBFE;padding:12px 24px}
.sp-abanner-in{max-width:960px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:14px;color:#1E40AF}
.sp-abtn{background:#1E40AF;color:#fff;border:none;border-radius:4px;padding:7px 14px;font-size:12px;font-weight:600;cursor:pointer;font-family:var(--fb)}

/* Sections */
.sp-sec-wrap{max-width:960px;margin:0 auto;padding:0 24px}
.sp-cats-sec{padding:52px 0;background:var(--cr)}
.sp-how-sec{padding:52px 0;background:var(--w)}
.sp-trust-sec{padding:44px 24px;background:var(--n)}
.sp-btm{padding:60px 24px;background:var(--cr2);text-align:center}
.sp-sec-h{font-family:var(--fh);font-size:26px;color:var(--n);margin:0 0 24px;font-weight:400}

.sp-catpills{display:flex;flex-wrap:wrap;gap:10px}
.sp-pill{display:inline-flex;align-items:center;gap:8px;background:var(--w);border:1px solid var(--cr2);border-radius:40px;padding:8px 16px;font-size:13px;font-weight:500;color:var(--n)}

.sp-howgrid{display:grid;gap:16px}
.sp-howcard{display:flex;gap:18px;align-items:flex-start;padding:18px;border:1px solid var(--br);border-radius:6px}
.sp-hown{font-family:var(--fh);font-size:26px;color:var(--a);line-height:1;min-width:34px;font-weight:400}
.sp-howt{font-size:14px;font-weight:600;margin-bottom:4px;color:var(--n)}
.sp-howb{font-size:13px;color:var(--g);line-height:1.55}

.sp-trustgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
.sp-ti{display:flex;gap:12px;align-items:center;color:var(--cr);font-size:13px}

.sp-btm-in{display:flex;flex-direction:column;align-items:center;gap:14px;max-width:480px;margin:0 auto}
.sp-btmh{font-family:var(--fh);font-size:28px;margin:0;color:var(--n);font-weight:400}
.sp-btms{font-size:15px;color:var(--g);margin:0}
.sp-walink{display:inline-flex;align-items:center;gap:6px;color:var(--g);font-size:13px;text-decoration:none}
.sp-walink:hover{color:var(--n)}

/* Past orders overlay */
.sp-overlay{position:fixed;inset:0;background:rgba(12,26,46,.6);z-index:200;display:flex;justify-content:flex-end}
.sp-drawer{background:var(--w);width:100%;max-width:440px;height:100%;overflow-y:auto;display:flex;flex-direction:column}
.sp-dr-head{display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid var(--br);position:sticky;top:0;background:var(--w);z-index:1}
.sp-dr-title{font-family:var(--fh);font-size:20px;font-weight:400;margin:0}
.sp-dr-close{background:none;border:none;font-size:17px;cursor:pointer;color:var(--g);padding:4px}
.sp-dr-sec{padding:18px 22px;border-bottom:1px solid var(--br)}
.sp-sec-lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--g2);margin:0 0 10px}
.sp-empty{padding:28px 22px;color:var(--g);font-size:14px}
.sp-dr-note{padding:14px 22px;font-size:11px;color:var(--g2);margin-top:auto}

.sp-ocard{border:1px solid var(--br);border-radius:6px;padding:13px 15px;margin-bottom:10px;background:#FAFAFA}
.sp-ocard-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px}
.sp-ono{font-weight:700;font-size:14px;color:var(--n)}
.sp-ometa{font-size:12px;color:var(--g);margin-top:2px}
.sp-odate{font-size:11px;color:var(--g2);margin-top:2px}
.sp-sbadge{font-size:10px;font-weight:700;padding:3px 9px;border-radius:20px;white-space:nowrap}
.sp-oacts{display:flex;gap:7px}
.sp-osm{display:inline-flex;align-items:center;gap:4px;padding:6px 12px;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;font-family:var(--fb);border:none;transition:opacity .1s}
.sp-osm:hover{opacity:.82}
.sp-osm-out{background:transparent;border:1px solid var(--br);color:var(--n)}
.sp-osm-pri{background:var(--a);color:var(--n)}

/* Form layout */
.sp-froot{background:#F8FAFC;min-height:100vh;padding:0 0 80px}
.sp-flayout{max-width:1080px;margin:0 auto;padding:28px 20px;display:grid;grid-template-columns:1fr 300px;gap:24px;align-items:start}
@media(max-width:768px){.sp-flayout{grid-template-columns:1fr;padding:14px}.sp-fsidebar{display:none}}

/* Progress */
.sp-prog{display:flex;align-items:center;margin-bottom:22px;overflow-x:auto;padding-bottom:4px}
.sp-pitem{display:flex;align-items:center;flex-shrink:0}
.sp-pdot{width:26px;height:26px;border-radius:50%;background:var(--br);color:var(--g);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;transition:background .2s,color .2s}
.sp-pdot.act{background:var(--a);color:var(--n)}
.sp-pdot.done{background:var(--gr);color:#fff}
.sp-plbl{font-size:11px;color:var(--g2);margin:0 7px;white-space:nowrap;font-weight:500}
.sp-plbl.act{color:var(--n);font-weight:700}
.sp-pline{height:2px;width:20px;background:var(--br);flex-shrink:0}
.sp-pline.done{background:var(--gr)}

/* Form card */
.sp-fcard{background:var(--w);border:1px solid var(--br);border-radius:8px;padding:28px}
@media(max-width:600px){.sp-fcard{padding:18px 14px}}

/* Steps */
.spstep{display:flex;flex-direction:column;gap:18px}
.spstep-h{font-family:var(--fh);font-size:21px;font-weight:400;color:var(--n);margin:0}
.spstep-sub{font-size:13px;color:var(--g);margin:-10px 0 0;line-height:1.5}

/* Category grid */
.sp-catgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:9px}
@media(max-width:460px){.sp-catgrid{grid-template-columns:repeat(2,1fr)}}
.sp-catcard{display:flex;flex-direction:column;align-items:center;gap:5px;padding:14px 8px;border:2px solid var(--br);border-radius:6px;background:var(--w);cursor:pointer;transition:border-color .15s,background .15s;font-family:var(--fb);text-align:center}
.sp-catcard:hover{border-color:var(--a);background:#FFFBF2}
.sp-catcard.sel{border-color:var(--a);background:#FFFBF2;box-shadow:0 0 0 3px rgba(201,151,58,.12)}
.sp-cati{font-size:22px}
.sp-catl{font-size:12px;font-weight:600;color:var(--n)}
.sp-catd{font-size:10px;color:var(--g2)}

/* Quantity */
.sp-qrow{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:4px}
.sp-qchip{padding:6px 13px;border:1px solid var(--br);border-radius:20px;background:var(--w);font-size:12px;font-weight:500;cursor:pointer;color:var(--n);font-family:var(--fb);transition:border-color .15s,background .15s}
.sp-qchip:hover{border-color:var(--a)}
.sp-qchip.sel{border-color:var(--a);background:#FFFBF2;font-weight:700}

/* Spec grids */
.spgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px}
.spgrid1{display:flex;flex-direction:column;gap:14px}
.spf-full{grid-column:1/-1}

/* Fields */
.spf{display:flex;flex-direction:column;gap:5px}
.spl{font-size:12px;font-weight:600;color:var(--n)}
.spi{padding:9px 11px;border:1px solid var(--br);border-radius:5px;font-size:13px;font-family:var(--fb);color:var(--n);background:var(--w);transition:border-color .15s;width:100%;outline:none}
.spi:focus{border-color:var(--a);box-shadow:0 0 0 3px rgba(201,151,58,.1)}
.spta{resize:vertical}
.sp-hint{font-size:11px;color:var(--g2);margin:0}
.sp-err{font-size:11px;color:var(--re);margin:0}

/* Artwork */
.sp-awchoice{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media(max-width:460px){.sp-awchoice{grid-template-columns:1fr}}
.sp-awcard{display:flex;align-items:flex-start;gap:12px;padding:16px 14px;border:2px solid var(--br);border-radius:6px;cursor:pointer;background:var(--w);font-family:var(--fb);text-align:left;transition:border-color .15s,background .15s}
.sp-awcard:hover{border-color:var(--a)}
.sp-awcard.sel{border-color:var(--a);background:#FFFBF2}
.sp-awi{font-size:22px}
.sp-awt{font-size:13px;font-weight:600;color:var(--n);margin-bottom:3px}
.sp-awd{font-size:11px;color:var(--g)}
.sp-awbox{display:flex;flex-direction:column;gap:12px;margin-top:2px}
.sp-awinfo{font-size:12px;color:var(--g);background:#F0F9FF;border:1px solid #BAE6FD;border-radius:5px;padding:11px 13px;line-height:1.55;margin:0}

/* Delivery */
.sp-fs{border:none;padding:0;margin:0;display:flex;flex-direction:column;gap:9px}
.sp-drow{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}
@media(max-width:460px){.sp-drow{grid-template-columns:1fr}}
.sp-dcard{display:flex;flex-direction:column;align-items:center;gap:7px;padding:14px 8px;border:2px solid var(--br);border-radius:6px;cursor:pointer;background:var(--w);font-family:var(--fb);font-size:12px;font-weight:500;transition:border-color .15s,background .15s;text-align:center;color:var(--n)}
.sp-dcard:hover{border-color:var(--a)}
.sp-dcard.sel{border-color:var(--a);background:#FFFBF2}
.sp-di{font-size:20px}
.sp-urow{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}
@media(max-width:460px){.sp-urow{grid-template-columns:1fr}}
.sp-ucard{display:flex;flex-direction:column;gap:3px;padding:13px 10px;border:2px solid var(--br);border-radius:6px;cursor:pointer;background:var(--w);font-family:var(--fb);text-align:center;transition:border-color .15s,background .15s}
.sp-ucard:hover{border-color:var(--a)}
.sp-ucard.sel{border-color:var(--a);background:#FFFBF2}
.sp-ul{font-size:13px;font-weight:700;color:var(--n)}
.sp-ud{font-size:10px;color:var(--g)}

/* Radio + chips */
.sp-radiorow{display:flex;flex-wrap:wrap;gap:8px}
.sp-rlabel{display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;color:var(--n)}
.sp-cchip{display:flex;align-items:center;gap:5px;padding:7px 14px;border:2px solid var(--br);border-radius:20px;cursor:pointer;font-size:12px;font-weight:500;font-family:var(--fb);background:var(--w);transition:border-color .15s;color:var(--n)}
.sp-cchip input{display:none}
.sp-cchip.sel{border-color:var(--a);background:#FFFBF2}

.sp-gsttog{background:none;border:none;font-size:12px;color:var(--b);cursor:pointer;font-family:var(--fb);padding:0;font-weight:600;text-align:left}

/* Review card */
.sp-revcard{border:1px solid var(--br);border-radius:6px;overflow:hidden}
.sp-revhead{background:var(--n);color:var(--cr);padding:9px 15px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
.sp-revbody{padding:4px 0}
.sp-revrow{display:flex;justify-content:space-between;padding:7px 15px;font-size:12px;border-bottom:1px solid #F1F5F9}
.sp-revk{color:var(--g)}
.sp-revv{font-weight:600;color:var(--n)}
.sp-revnote{padding:9px 15px;font-size:11px;color:var(--g);background:#FAFAFA}

/* Nav */
.sp-fnav{display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:18px;border-top:1px solid var(--br)}
.sp-fbk{display:inline-flex;align-items:center;gap:5px;background:none;border:1px solid var(--br);border-radius:4px;padding:9px 14px;font-size:12px;font-weight:500;cursor:pointer;color:var(--g);font-family:var(--fb);transition:border-color .15s}
.sp-fbk:hover{border-color:var(--g);color:var(--n)}
.sp-fnxt{display:inline-flex;align-items:center;gap:7px;background:var(--a);color:var(--n);border:none;border-radius:4px;padding:11px 22px;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--fb);transition:background .15s}
.sp-fnxt:hover:not(:disabled){background:var(--a2)}
.sp-fnxt:disabled{opacity:.6;cursor:not-allowed}
.sp-spin{animation:spin 1s linear infinite}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
.sp-errbox{background:#FEF2F2;border:1px solid #FECACA;border-radius:5px;padding:11px 14px;font-size:12px;color:var(--re)}

/* Summary panel */
.sp-summ{background:var(--n);border-radius:8px;padding:18px;display:flex;flex-direction:column;gap:9px;margin-bottom:14px}
.sp-summ-head{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--a);margin-bottom:3px}
.sp-summ-row{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--cr)}
.sp-summ-spec{font-size:11px;color:rgba(245,237,214,.6)}
.sp-summ-note{font-size:10px;color:rgba(245,237,214,.45);border-top:1px solid rgba(245,237,214,.12);padding-top:9px;margin-top:3px}

/* Trust block */
.sp-trust{background:#F8FAFC;border:1px solid var(--br);border-radius:8px;padding:16px;display:flex;flex-direction:column;gap:11px}
.sp-trust-row{display:flex;gap:9px;align-items:flex-start;font-size:11px;color:var(--g);line-height:1.4}
.sp-wabtn{display:inline-flex;align-items:center;gap:5px;background:#25D366;color:#fff;border-radius:4px;padding:8px 12px;font-size:11px;font-weight:600;text-decoration:none;margin-top:4px;transition:opacity .15s}
.sp-wabtn:hover{opacity:.88}

/* Mobile summary */
.sp-msum{background:var(--n);border-radius:6px;overflow:hidden;margin-bottom:14px}
.sp-msum-tog{width:100%;display:flex;justify-content:space-between;align-items:center;padding:11px 14px;background:none;border:none;color:var(--cr);font-size:12px;font-weight:600;cursor:pointer;font-family:var(--fb)}
.sp-msum-body{padding:0 14px 11px;display:flex;flex-direction:column;gap:3px}

/* Success */
.sp-succ{min-height:100vh;background:var(--n);display:flex;align-items:center;justify-content:center;padding:24px;font-family:var(--fb)}
.sp-succ-card{background:var(--w);border-radius:10px;padding:36px 28px;max-width:460px;width:100%;text-align:center;display:flex;flex-direction:column;gap:16px;align-items:center}
.sp-succ-icon{width:52px;height:52px;background:var(--gr);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700}
.sp-succ-h{font-family:var(--fh);font-size:24px;font-weight:400;margin:0;color:var(--n)}
.sp-ono-big{background:var(--n);color:var(--cr);border-radius:4px;padding:9px 22px;font-size:20px;font-weight:700;letter-spacing:.08em;font-family:monospace}
.sp-succ-body{font-size:14px;color:var(--g);line-height:1.6;margin:0}
.sp-nexts{display:flex;flex-direction:column;gap:9px;width:100%;text-align:left}
.sp-nxt{display:flex;gap:11px;align-items:flex-start;font-size:12px;color:var(--g)}
.sp-nxt span:first-child{width:20px;height:20px;background:var(--a);color:var(--n);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0}
.sp-succ-note{font-size:11px;color:var(--g2);margin:0}
`;
