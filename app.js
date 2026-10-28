(function(){
const TVA_RATE = 8.1;
const TEMPLATES = [
  {id:"atelier", nom:"Atelier", pro:false},
  {id:"signal", nom:"Signal", pro:false},
  {id:"ardoise", nom:"Ardoise", pro:true},
  {id:"ligne", nom:"Ligne", pro:true}
];
const METIERS = ["Nettoyage","Vidéosurveillance","Électricité","Plomberie","Peinture","Menuiserie","Jardinage","Déménagement","Autre"];
const EXEMPLE_PROFIL = {
  entreprise:"Léman Clean Sàrl", metier:"Nettoyage", rue:"Chemin des Roches 8", npa:"1020", ville:"Renens",
  tel:"021 555 12 34", email:"contact@lemanclean.ch", iban:"CH93 0076 2011 6238 5295 7",
  tva:true, tvaNo:"CHE-123.456.789 TVA", taux:55,
  tarifs:[
    {nom:"Nettoyage fin de bail", prix:9.5, unite:"m²"},
    {nom:"Nettoyage des vitres", prix:120, unite:"forfait"},
    {nom:"Balcon ou terrasse", prix:60, unite:"forfait"},
    {nom:"Main-d'œuvre", prix:55, unite:"heure"},
    {nom:"Déplacement", prix:35, unite:"forfait"}
  ],
  modeleDevis:"signal", modeleFacture:"atelier", plan:"gratuit", exemple:true
};
const EXEMPLE_DICTEE = {
  devis:"Devis pour Madame Claire Dumont, avenue de Rumine 14, 1005 Lausanne. Nettoyage de fin de bail d'un appartement de 4 pièces et demie, environ 95 mètres carrés, avec les vitres et le balcon. On sera deux, prévoir une journée.",
  facture:"Facture pour la gérance Romandie Immo, rue du Midi 3, 1003 Lausanne. Nettoyage des parties communes de l'immeuble, 6 heures de main-d'œuvre, plus le déplacement."
};

// ---------- state ----------
let profil = null;
let docs = [];
let clients = [];
let view = {name:"boot"};
let draft = null;
let busy = null;

function load(k, d){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }catch(e){ return d; } }
// ---------- sauvegarde en ligne ----------
let sb = null, session = null, uid = null, syncState = "ok", flushing = false, installEvt = null;
const synced = {profil:null, docs:{}, clients:{}};
const pending = new Set();
function newId(p){ return p + Date.now() + Math.random().toString(36).slice(2,6); }
function cacheKey(){ return "fv_cache_" + uid; }
function writeCache(){ try{ localStorage.setItem(cacheKey(), JSON.stringify({profil, docs, clients})); }catch(e){} }
function save(){
  if(!uid) return;
  writeCache();
  if(profil && JSON.stringify(profil)!==synced.profil) pending.add("p");
  docs.forEach(d=>{ if(JSON.stringify(d)!==synced.docs[d.id]) pending.add("d:"+d.id); });
  clients.forEach(c=>{ if(JSON.stringify(c)!==synced.clients[c.id]) pending.add("c:"+c.id); });
  flush();
}
async function flush(){
  if(flushing || !sb || !pending.size) return;
  flushing = true; let failed = false;
  const now = ()=>new Date().toISOString();
  try{
    for(const k of [...pending]){
      let res, snap;
      if(k==="p"){ snap=JSON.stringify(profil); res=await sb.from("profils").upsert({user_id:uid, data:profil, updated_at:now()}); }
      else if(k.startsWith("d:")){ const d=docs.find(x=>x.id===k.slice(2)); if(!d){ pending.delete(k); continue; } snap=JSON.stringify(d); res=await sb.from("documents").upsert({id:d.id, user_id:uid, data:d, updated_at:now()}); }
      else { const c=clients.find(x=>x.id===k.slice(2)); if(!c){ pending.delete(k); continue; } snap=JSON.stringify(c); res=await sb.from("clients").upsert({id:c.id, user_id:uid, data:c, updated_at:now()}); }
      if(res.error) throw res.error;
      if(k==="p") synced.profil=snap; else if(k.startsWith("d:")) synced.docs[k.slice(2)]=snap; else synced.clients[k.slice(2)]=snap;
      pending.delete(k);
    }
    setSync("ok");
  }catch(e){ failed = true; setSync("offline"); }
  finally{ flushing=false; if(!failed && pending.size) flush(); }
}
function setSync(s){
  if(s===syncState) return;
  syncState = s;
  if(s==="offline") toast("Pas de réseau : tes changements seront enregistrés dès le retour de la connexion");
  if(s==="ok") toast("Tout est enregistré");
  if(view.name==="home") render();
}
window.addEventListener("online", ()=>flush());
setInterval(()=>{ if(pending.size) flush(); }, 30000);

function ckey(n){ return String(n||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,""); }
function upsertClient(c){
  if(!c || !String(c.nom||"").trim()) return null;
  let ex = (c.id && clients.find(x=>x.id===c.id)) || clients.find(x=>ckey(x.nom)===ckey(c.nom));
  if(!ex){ ex = {id:newId("c"), nom:"", adresse:"", npaVille:"", email:"", tel:""}; clients.push(ex); }
  ["nom","adresse","npaVille","email","tel"].forEach(k=>{ if(String(c[k]||"").trim()) ex[k]=String(c[k]).trim(); });
  return ex;
}
function syncClient(doc){ const c = upsertClient(doc.client); if(c){ doc.clientId=c.id; doc.client={nom:c.nom,adresse:c.adresse,npaVille:c.npaVille,email:c.email,tel:c.tel}; } }


const $app = document.getElementById("app");
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function chf(n){ return (Math.round(n*100)/100).toLocaleString("fr-CH",{minimumFractionDigits:2,maximumFractionDigits:2}).replace(/ | /g,"'"); }
function r05(n){ return Math.round(n*20)/20; }
function today(){ return new Date().toISOString().slice(0,10); }
function fmtDate(iso){ if(!iso) return ""; const [y,m,d]=iso.split("-"); return d+"."+m+"."+y; }
function addDays(iso,n){ const d=new Date(iso+"T12:00:00"); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); }
function toast(msg){ const t=document.getElementById("toast"); t.textContent=msg; t.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(()=>t.hidden=true,2400); }
function go(v){ if(v.name!=="envoyer") v.msg=null; view=v; render(); window.scrollTo(0,0); }

function totals(doc){
  const ht = doc.lignes.reduce((s,l)=>s+(Number(l.quantite)||0)*(Number(l.prixUnitaire)||0),0);
  const tva = profil.tva ? ht*TVA_RATE/100 : 0;
  return {ht, tva, ttc:r05(ht+tva)};
}
function nextNum(type){
  const y = new Date().getFullYear();
  const pre = ({devis:"D",facture:"F",credit:"NC"})[type]+"-"+y+"-";
  const n = docs.filter(d=>d.num.startsWith(pre)).length + 1;
  return pre + String(n).padStart(3,"0");
}
function statusPill(d){
  const map = {"À signer":"warn","Accepté":"ok","Facturé":"","À payer":"red","Payée":"ok","Annulée":"","Émise":""};
  return `<span class="pill ${map[d.statut]||""}">${esc(d.statut)}</span>`;
}

// ---------- icons ----------
const IC = {
  mic:'<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  doc:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/></svg>',
  back:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  gear:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>'
};
function topbar(left, right){
  return `<div class="bar">${left}${right||""}</div>`;
}
function backBtn(to){ return `<button class="iconbtn" data-go="${to}" aria-label="Retour">${IC.back}</button>`; }

// ---------- template minis ----------
function mini(id){
  const top = id==="signal" ? '<i style="left:0;right:0;top:0;height:22%;border-radius:0;background:var(--paper-red)"></i>'
            : id==="ardoise" ? '<i style="left:0;right:0;top:0;height:22%;border-radius:0;background:var(--paper-slate)"></i>'
            : '<i style="left:10%;top:7%;width:40%;height:6%;background:var(--paper-ink)"></i>';
  const lines = [36,44,52,60].map(t=>`<i style="left:10%;right:10%;top:${t}%;height:3%"></i>`).join("");
  return `<div class="mini">${top}<i style="left:10%;top:28%;width:35%;height:5%;background:${id==="ligne"?"var(--paper-line)":"var(--paper-ink)"}"></i>${lines}<i style="right:10%;top:72%;width:30%;height:5%;background:var(--paper-ink)"></i></div>`;
}

// ---------- views ----------
function render(){
  const v = view;
  if(v.name==="boot") return renderBoot();
  if(v.name==="login") return renderLogin();
  if(v.name==="onb") return renderOnb(v.step);
  if(v.name==="home") return renderHome();
  if(v.name==="archives") return renderArchives();
  if(v.name==="export") return renderExport();
  if(v.name==="dicter") return renderDicter(v.type);
  if(v.name==="choixFacture") return renderChoixFacture();
  if(v.name==="doc") return renderDoc(v.id);
  if(v.name==="signer") return renderSigner(v.id);
  if(v.name==="corriger") return renderCorriger(v.id);
  if(v.name==="envoyer") return renderEnvoyer(v.id, v.mode);
}

function renderOnb(step){
  const d = draft;
  let body = "";
  if(step===1){
    body = `
      <div><div class="eyebrow">Étape 1 sur 3</div><h1>Ton entreprise</h1>
      <p class="lead">Ces infos apparaîtront sur tous tes devis et factures. Tu ne les rentres qu'une fois.</p></div>
      ${d.exemple?'<div class="note">Les champs sont pré-remplis avec une entreprise fictive pour tester. Remplace-les par les tiennes quand tu veux.</div>':""}
      <div class="stack">
        <div class="field"><label for="f-ent">Nom de l'entreprise</label><input id="f-ent" data-k="entreprise" value="${esc(d.entreprise)}"></div>
        <div class="field"><label for="f-logo">Logo (facultatif)</label>
          <div class="logorow">${d.logo?`<img src="${d.logo}" alt="Logo" class="logoprev">`:'<span class="logoempty">Aucun logo</span>'}
          <label class="btn ghost filebtn" for="f-logo">${d.logo?"Changer":"Ajouter un logo"}</label>
          ${d.logo?'<button class="linkbtn" id="rmlogo">Retirer</button>':""}</div>
          <input id="f-logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden></div>
        <div class="field"><label for="f-met">Ton métier</label><select id="f-met" data-k="metier">${METIERS.map(m=>`<option ${m===d.metier?"selected":""}>${m}</option>`).join("")}</select></div>
        <div class="field"><label for="f-rue">Rue et numéro</label><input id="f-rue" data-k="rue" value="${esc(d.rue)}"></div>
        <div class="row"><div class="field"><label for="f-npa">NPA</label><input id="f-npa" data-k="npa" inputmode="numeric" value="${esc(d.npa)}"></div>
        <div class="field"><label for="f-vil">Localité</label><input id="f-vil" data-k="ville" value="${esc(d.ville)}"></div></div>
        <div class="row"><div class="field"><label for="f-tel">Téléphone</label><input id="f-tel" data-k="tel" value="${esc(d.tel)}"></div>
        <div class="field"><label for="f-mail">E-mail</label><input id="f-mail" data-k="email" value="${esc(d.email)}"></div></div>
        <div class="field"><label for="f-iban">IBAN (pour la QR-facture)</label><input id="f-iban" data-k="iban" value="${esc(d.iban)}"></div>
        <label class="check"><input type="checkbox" id="f-tva" data-k="tva" ${d.tva?"checked":""}> Je suis assujetti à la TVA (${TVA_RATE} %)</label>
        <div class="field" ${d.tva?"":"hidden"} id="tvaNoWrap"><label for="f-tvano">Numéro TVA</label><input id="f-tvano" data-k="tvaNo" value="${esc(d.tvaNo)}"></div>
      </div>
      <div id="onb-err"></div>
      <button class="btn red" data-onb="2">Continuer</button>
      ${profil?`<button class="linkbtn" id="logout" style="align-self:center">Se déconnecter (${esc(session&&session.user.email||"")})</button>`:""}`;
  } else if(step===2){
    body = `
      <div><div class="eyebrow">Étape 2 sur 3</div><h1>Tes tarifs</h1>
      <p class="lead">L'IA utilise ces prix pour chiffrer tes devis. Tout ce qui n'est pas dans la liste est compté au taux horaire.</p></div>
      <div class="field"><label for="f-taux">Taux horaire (CHF)</label><input id="f-taux" data-k="taux" type="number" inputmode="decimal" value="${esc(d.taux)}"></div>
      <div class="sec">
        <div class="eyebrow">Prestations courantes</div>
        ${d.tarifs.map((t,i)=>`<div class="tarif">
          <input aria-label="Prestation" id="t-n-${i}" data-t="${i}" data-f="nom" value="${esc(t.nom)}">
          <input aria-label="Prix CHF" id="t-p-${i}" data-t="${i}" data-f="prix" type="number" inputmode="decimal" value="${esc(t.prix)}">
          <select aria-label="Unité" id="t-u-${i}" data-t="${i}" data-f="unite">${["forfait","heure","m²","m","pièce","jour"].map(u=>`<option ${u===t.unite?"selected":""}>${u}</option>`).join("")}</select>
          <button class="del" data-deltarif="${i}" aria-label="Supprimer">×</button></div>`).join("")}
        <button class="btn ghost" id="addTarif">+ Ajouter une prestation</button>
      </div>
      <div id="onb-err"></div>
      <div class="btnrow"><button class="btn ghost" data-onb="1">Retour</button><button class="btn red" data-onb="3">Continuer</button></div>`;
  } else {
    const tplRow = (key)=>`<div class="tpls">${TEMPLATES.map(t=>`
      <button class="tpl ${d[key]===t.id?"sel":""} ${t.pro?"lock":""}" data-tpl="${t.id}" data-key="${key}" aria-pressed="${d[key]===t.id}">
        ${mini(t.id)}<span class="nm">${t.nom}${t.pro?'<span class="pro">PRO</span>':""}</span></button>`).join("")}</div>`;
    body = `
      <div><div class="eyebrow">Étape 3 sur 3</div><h1>Ton style</h1>
      <p class="lead">Choisis une fois l'apparence de tes devis et de tes factures. Le plan gratuit donne accès à deux modèles.</p></div>
      <div class="sec"><h2>Modèle de devis</h2>${tplRow("modeleDevis")}</div>
      <div class="sec"><h2>Modèle de facture</h2>${tplRow("modeleFacture")}</div>
      <div class="btnrow"><button class="btn ghost" data-onb="2">Retour</button><button class="btn red" id="finish">Terminer</button></div>`;
  }
  $app.innerHTML = topbar(`<div class="brand"><span class="cross"></span>Factivo</div>`,
      `<div class="steps" style="width:90px">${[1,2,3].map(i=>`<span class="${i<=step?"on":""}"></span>`).join("")}</div>`) + body;

  $app.querySelectorAll("[data-k]").forEach(el=>{
    el.addEventListener("input", ()=>{
      const k = el.dataset.k;
      d[k] = el.type==="checkbox" ? el.checked : (el.type==="number" ? Number(el.value) : el.value);
      if(k==="tva") document.getElementById("tvaNoWrap").hidden = !el.checked;
    });
    if(el.tagName==="SELECT"||el.type==="checkbox") el.addEventListener("change", ()=>el.dispatchEvent(new Event("input")));
  });
  const lf=document.getElementById("f-logo");
  if(lf) lf.onchange=()=>{ const f=lf.files&&lf.files[0]; if(!f) return;
    const rd=new FileReader(); rd.onload=()=>{ const im=new Image(); im.onload=()=>{
      const k=Math.min(1, 360/im.width, 160/im.height); const c=document.createElement("canvas");
      c.width=Math.max(1,Math.round(im.width*k)); c.height=Math.max(1,Math.round(im.height*k));
      c.getContext("2d").drawImage(im,0,0,c.width,c.height); d.logo=c.toDataURL("image/png"); render(); };
      im.onerror=()=>toast("Cette image ne peut pas être lue. Essaie un PNG ou un JPG."); im.src=rd.result; };
    rd.readAsDataURL(f); };
  const rl=document.getElementById("rmlogo"); if(rl) rl.onclick=()=>{ delete d.logo; render(); };
  $app.querySelectorAll("[data-t]").forEach(el=>{
    const h = ()=>{ const t=d.tarifs[+el.dataset.t]; t[el.dataset.f] = el.dataset.f==="prix" ? Number(el.value) : el.value; };
    el.addEventListener("input",h); el.addEventListener("change",h);
  });
  $app.querySelectorAll("[data-deltarif]").forEach(b=>b.onclick=()=>{ d.tarifs.splice(+b.dataset.deltarif,1); render(); });
  const add = document.getElementById("addTarif"); if(add) add.onclick=()=>{ d.tarifs.push({nom:"",prix:0,unite:"forfait"}); render(); };
  $app.querySelectorAll("[data-onb]").forEach(b=>b.onclick=()=>{
    const to=+b.dataset.onb;
    if(to>step){ const err=checkStep(step, d); if(err){ const z=document.getElementById("onb-err"); z.innerHTML=`<div class="note">${esc(err)}</div>`; z.scrollIntoView({block:"center"}); return; } }
    go({name:"onb",step:to});
  });
  const lo=document.getElementById("logout"); if(lo) lo.onclick=async()=>{ await sb.auth.signOut(); try{ localStorage.removeItem(cacheKey()); }catch(e){} location.reload(); };
  $app.querySelectorAll("[data-tpl]").forEach(b=>b.onclick=()=>{
    const t = TEMPLATES.find(x=>x.id===b.dataset.tpl);
    if(t.pro && d.plan!=="pro"){ toast("Le modèle "+t.nom+" est inclus dans le plan Pro"); return; }
    d[b.dataset.key]=t.id; render();
  });
  const fin = document.getElementById("finish");
  if(fin) fin.onclick=()=>{ profil = JSON.parse(JSON.stringify(d)); draft=null; save(); toast("Ton compte est prêt"); go({name:"home"}); };
}

function isLate(d){ return d.type==="facture" && d.statut==="À payer" && d.echeance && d.echeance < today(); }
function citem(d){
  const t=totals(d);
  return `<button class="citem" data-open="${d.id}">
    <span class="t">${esc(d.client.nom||"Client sans nom")}</span>
    <span class="s">${esc(d.num)}</span>
    <span class="a">CHF ${chf(t.ttc)}</span>
    <span>${isLate(d)?'<span class="pill red">En retard</span>':statusPill(d)}</span></button>`;
}
function renderHome(){
  const q = (view.q||"").toLowerCase();
  const match = d=>!q || [d.num,d.client.nom,d.chantier].join(" ").toLowerCase().includes(q);
  const devisOrder = {"À signer":0,"Accepté":1,"Facturé":2};
  const devis = docs.filter(d=>d.type==="devis" && d.statut!=="Facturé" && match(d))
    .sort((a,b)=>(devisOrder[a.statut]-devisOrder[b.statut]) || (b.date+b.num).localeCompare(a.date+a.num));
  const aPayer = docs.filter(d=>d.type==="facture" && d.statut==="À payer" && match(d))
    .sort((a,b)=>(a.echeance||"").localeCompare(b.echeance||"") || a.num.localeCompare(b.num));
  const payees = docs.filter(isArchived).filter(match);
  const aRelancer = docs.filter(relanceDue);
  const totalDu = aPayer.reduce((s,d)=>s+totals(d).ttc,0);
  $app.innerHTML = topbar(`<div class="brand"><span class="cross"></span>Factivo</div>`,
    `<div style="display:flex;gap:8px;align-items:center">${syncState==="offline"?'<span class="pill warn">Hors ligne</span>':'<span class="pill">Plan gratuit</span>'}<button class="iconbtn" id="settings" aria-label="Réglages">${IC.gear}</button></div>`) + installCard() + `
    <div><div class="eyebrow">${esc(profil.entreprise)}</div><h1>Qu'est-ce qu'on fait ?</h1></div>
    <div class="bigacts">
      <button class="bigact devis" data-go="dicter:devis"><span><b>Faire un devis</b><small>Tu dictes, l'appli chiffre</small></span><span class="ico">${IC.mic}</span></button>
      <button class="bigact facture" data-go="choixFacture"><span><b>Faire une facture</b><small>Depuis un devis ou nouvelle</small></span><span class="ico">${IC.doc}</span></button>
    </div>
    ${aRelancer.length?`<div class="alert"><div><b>${aRelancer.length} facture${aRelancer.length>1?"s":""} en retard à relancer</b>
      <div class="s">${aRelancer.slice(0,3).map(d=>esc(d.client.nom||d.num)).join(", ")}${aRelancer.length>3?"…":""}</div></div>
      <button class="btn red small" data-relance="${aRelancer[0].id}">Relancer</button></div>`:""}
    <div class="sec">
      <div class="sechead"><h2>Mes documents</h2>${aPayer.length?`<span class="pill red">CHF ${chf(totalDu)} à encaisser</span>`:""}</div>
      ${docs.length?`<input id="search" type="search" placeholder="Chercher un client, un chantier, un numéro" value="${esc(view.q||"")}">`:""}
      <div class="cols">
        <div class="col"><div class="colhead"><span>Devis</span><span class="cnt">${devis.length}</span></div>
          ${devis.length?devis.map(citem).join(""):`<div class="cempty">${q?"Aucun devis trouvé.":"Tes devis apparaîtront ici."}</div>`}</div>
        <div class="col"><div class="colhead"><span>Factures</span><span class="cnt">${aPayer.length}</span></div>
          ${aPayer.length?aPayer.map(citem).join(""):`<div class="cempty">${q?"Aucune facture à payer trouvée.":"Aucune facture en attente."}</div>`}
</div>
      </div>
      ${payees.length?`<button class="archlink" id="arch"><span>Archives · ${payees.length} document${payees.length>1?"s":""} <span class="s">devis facturés, factures payées ou annulées</span></span><span aria-hidden="true">›</span></button>`:""}
    </div>
    ${docs.some(d=>d.type==="facture")?`<button class="btn ghost" data-go="export">Exporter un mois pour la fiduciaire</button>`:""}`;
  bindGo();
  document.getElementById("settings").onclick=()=>{ draft=JSON.parse(JSON.stringify(profil)); go({name:"onb",step:1}); };
  const s=document.getElementById("search");
  if(s) s.oninput=()=>{ view.q=s.value; const pos=s.selectionStart; renderHome(); const n=document.getElementById("search"); n.focus(); n.setSelectionRange(pos,pos); };
  $app.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>go({name:"doc",id:b.dataset.open}));
  const a=document.getElementById("arch"); if(a) a.onclick=()=>go({name:"archives"});
  bindInstall();
  $app.querySelectorAll("[data-relance]").forEach(b=>b.onclick=()=>go({name:"envoyer",id:b.dataset.relance,mode:"relance"}));
}

function isArchived(d){ return (d.type==="devis" && d.statut==="Facturé") || (d.type==="facture" && d.statut!=="À payer") || d.type==="credit"; }
function renderArchives(){
  const tab = view.tab || "factures";
  const all = docs.filter(isArchived);
  const devis = all.filter(d=>d.type==="devis").sort((a,b)=>(b.date+b.num).localeCompare(a.date+a.num));
  const facts = all.filter(d=>d.type!=="devis").sort((a,b)=>(b.payeeLe||b.date).localeCompare(a.payeeLe||a.date));
  const total = facts.filter(d=>d.statut==="Payée").reduce((s,d)=>s+totals(d).ttc,0);
  const list = tab==="devis" ? devis : facts;
  const sub = d => d.type==="devis" ? (()=>{ const f=docs.find(x=>x.fromDevis===d.id); return "facturé"+(f?" · "+f.num:""); })()
    : d.statut==="Payée" ? "payée le "+fmtDate(d.payeeLe||d.date) : fmtDate(d.date);
  $app.innerHTML = topbar(backBtn("home"), `<span class="pill ok">Archives</span>`) + `
    <div><h1>Archives</h1><p class="lead">Les documents terminés. Ils restent consultables et partent dans l'export pour la fiduciaire.</p></div>
    <div class="seg" role="tablist">
      <button role="tab" aria-selected="${tab==="factures"}" data-tab="factures">Factures · ${facts.length}</button>
      <button role="tab" aria-selected="${tab==="devis"}" data-tab="devis">Devis · ${devis.length}</button>
    </div>
    ${tab==="factures"&&facts.length?`<p class="lead" style="margin:0">CHF ${chf(total)} encaissés au total.</p>`:""}
    <div class="list">${list.length?list.map(d=>{const t=totals(d); return `
      <button class="item" data-open="${d.id}">
        <span class="t">${esc(d.client.nom||"Client sans nom")}</span><span class="a">${chf(t.ttc)}</span>
        <span class="s">${esc(d.num)} · ${esc(sub(d))}</span><span>${d.type==="credit"?'<span class="pill">Note de crédit</span>':statusPill(d)}</span></button>`;}).join("")
      :`<div class="empty">${tab==="devis"?"Les devis transformés en facture sont rangés ici.":"Les factures payées ou annulées et les notes de crédit sont rangées ici."}</div>`}</div>`;
  bindGo();
  $app.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{ view.tab=b.dataset.tab; renderArchives(); });
  $app.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>go({name:"doc",id:b.dataset.open,from:"archives",tab}));
}

function bindGo(){
  $app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>{
    const [name,arg]=b.dataset.go.split(":");
    go(name==="dicter"?{name,type:arg}:name==="doc"?{name,id:arg}:{name});
  });
}

let recog = null;
const MICMSG = "";
function micHelp(){
  const ua = navigator.userAgent;
  const how = /iPhone|iPad/.test(ua) ? "Sur iPhone : touche le micro en bas à droite du clavier."
    : /Android/.test(ua) ? "Sur Android : touche le micro en haut ou en bas du clavier."
    : /Mac/.test(ua) ? "Sur Mac : appuie deux fois sur la touche fn (ou 🌐) pour lancer la dictée."
    : /Windows/.test(ua) ? "Sur Windows : appuie sur la touche Windows + H pour lancer la dictée."
    : "Utilise le micro de ton clavier pour dicter.";
  return how;
}
function renderDicter(type){
  const label = type==="devis" ? "Nouveau devis" : "Nouvelle facture";
  $app.innerHTML = topbar(backBtn(type==="devis"?"home":"choixFacture"), `<span class="pill">${label}</span>`) + `
    <div><h1>Décris le travail</h1>
    <p class="lead">Dis pour qui, où, et ce qu'il faut faire. Les prix viennent de tes tarifs.</p></div>
    <button class="mic" id="mic" aria-label="Dicter">${IC.mic}</button>
    <div class="miccap" id="miccap">Appuie pour parler</div>
    <div class="field"><label for="d-client">Client</label><select id="d-client">
      <option value="">Nouveau client (dis son nom dans la dictée)</option>
      ${clients.slice().sort((a,b)=>a.nom.localeCompare(b.nom)).map(c=>`<option value="${c.id}" ${view.clientId===c.id?"selected":""}>${esc(c.nom)}${c.npaVille?" · "+esc(c.npaVille):""}</option>`).join("")}
    </select></div>
    <div class="field"><label for="dictee">Ce que tu as dit</label>
      <textarea id="dictee" placeholder="Ex. : Devis pour Monsieur Rossi, rue de Lausanne 20 à Morges. Nettoyage fin de bail, 70 m², avec les vitres."></textarea></div>
    <div id="gen-area"><button class="btn red" id="gen">${type==="devis"?"Générer le devis":"Générer la facture"}</button></div>
    <div id="gen-err"></div>`;
  bindGo();
  const ta = document.getElementById("dictee");
  try{ const dr = sessionStorage.getItem("dv_dictee_"+type); if(dr) ta.value = dr; }catch(e){}
  ta.oninput=()=>{ try{ sessionStorage.setItem("dv_dictee_"+type, ta.value); }catch(e){} };
  const mic = document.getElementById("mic"), cap = document.getElementById("miccap");
  const fallback=()=>{ cap.innerHTML = `<div class="note" style="text-align:left"><b>Le micro n'a pas pu démarrer.</b> Autorise le micro pour Factivo dans les réglages, ou dicte avec celui de ton clavier dans le champ ci-dessous.<br>${esc(micHelp())}</div>`; ta.focus(); };
  mic.onclick=()=>{
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(recog){ recog.stop(); return; }
    if(!SR){ fallback(); return; }
    try{
      recog = new SR(); recog.lang="fr-CH"; recog.continuous=true; recog.interimResults=true;
      const base = ta.value ? ta.value.trim()+" " : "";
      recog.onresult=(e)=>{ let t=""; for(let i=0;i<e.results.length;i++) t+=e.results[i][0].transcript; ta.value = base+t; ta.oninput(); };
      recog.onerror=()=>{ fallback(); };
      recog.onend=()=>{ recog=null; mic.classList.remove("live"); if(cap.textContent==="J'écoute… appuie pour arrêter") cap.textContent="Appuie pour parler"; };
      recog.start(); mic.classList.add("live"); cap.textContent="J'écoute… appuie pour arrêter";
    }catch(err){ recog=null; fallback(); }
  };
  const sel=document.getElementById("d-client"); sel.onchange=()=>{ view.clientId=sel.value||null; };
  document.getElementById("gen").onclick=()=>generate(type, ta.value.trim(), sel.value||null);
}

async function generate(type, text, clientId){
  const known = clientId ? clients.find(c=>c.id===clientId) : null;
  const area=document.getElementById("gen-area"), err=document.getElementById("gen-err");
  err.innerHTML="";
  if(!text){ err.innerHTML='<div class="note">Dicte ou écris d\'abord ce qu\'il faut faire.</div>'; return; }
  area.innerHTML='<div class="loading"><span class="spin"></span>L\'IA prépare ton '+(type==="devis"?"devis":"facture")+'…</div>';
  let data=null, viaIA=false;
  try{
    const {data:sd} = await sb.auth.getSession();
    const r = await fetch("/api/devis", {method:"POST", headers:{"Content-Type":"application/json", Authorization:"Bearer "+(sd.session?sd.session.access_token:"")},
      body: JSON.stringify({type, text, known: known?{nom:known.nom, adresse:known.adresse, npaVille:known.npaVille}:null,
        entreprise:profil.entreprise, metier:profil.metier, taux:profil.taux, tarifs:profil.tarifs})});
    if(r.ok){ data = await r.json(); viaIA = true; }
  }catch(e){ data = null; }
  if(!data || !Array.isArray(data.lignes) || !data.lignes.length){ data = localParse(text); viaIA=false; }
  const doc = {
    id: newId("d"), type, num: nextNum(type), date: today(),
    client: {nom: str(data.client&&data.client.nom), adresse: str(data.client&&data.client.adresse), npaVille: str(data.client&&data.client.npaVille)},
    chantier: str(data.chantier), remarques: str(data.remarques),
    lignes: data.lignes.slice(0,20).map(l=>({designation:str(l.designation)||"Prestation", quantite:Number(l.quantite)||1, unite:str(l.unite)||"forfait", prixUnitaire:Number(l.prixUnitaire)||0})),
    statut: type==="devis"?"À signer":"À payer", dictee:text, viaIA
  };
  if(known) doc.client = {...known};
  if(type==="facture"){ doc.echeance = addDays(doc.date,30); doc.datePrestation = doc.date; }
  syncClient(doc);
  docs.push(doc); save();
  try{ sessionStorage.removeItem("dv_dictee_"+type); }catch(e){}
  go({name:"doc", id:doc.id, fresh:true});
}
function str(v){ return v==null ? "" : String(v).trim(); }

function _unusedPrompt(type, text, known){
  return `Tu prépares un ${type} pour un artisan suisse romand. Transforme sa dictée en lignes chiffrées.
${known?`\nLe client est déjà connu : ${known.nom}, ${known.adresse}, ${known.npaVille}. Reprends ces informations telles quelles.\n`:""}
Entreprise : ${profil.entreprise} (métier : ${profil.metier})
Taux horaire : ${profil.taux} CHF / heure
Tarifs de l'entreprise (utilise EXACTEMENT ces prix quand une prestation correspond) :
${profil.tarifs.map(t=>`- ${t.nom} : ${t.prix} CHF par ${t.unite}`).join("\n")}

Règles :
- Une ligne par prestation mentionnée. Si une prestation n'est pas dans les tarifs, compte-la en heures au taux horaire, avec une estimation raisonnable et une désignation claire.
- Si l'artisan parle de plusieurs personnes et d'une durée sans prestation au forfait, compte les heures (personnes × heures). N'ajoute pas d'heures pour une prestation déjà facturée au m² ou au forfait.
- Désignations courtes et professionnelles, en français.
- N'invente jamais le nom ou l'adresse du client : laisse vide si ce n'est pas dit.
- Montants hors TVA, nombres décimaux sans unité.

Réponds uniquement avec ce JSON :
{"client":{"nom":"","adresse":"rue et numéro","npaVille":"NPA et localité"},"chantier":"description courte du chantier","lignes":[{"designation":"","quantite":1,"unite":"forfait","prixUnitaire":0}],"remarques":"conditions utiles mentionnées, sinon vide"}

Dictée de l'artisan :
"""${text.slice(0,4000)}"""`;
}

function norm(s){ return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,""); }
function localParse(text){
  const t = norm(text);
  const words = profil.tarifs.map(tr=>norm(tr.nom).split(/[^a-z]+/).filter(w=>w.length>=4));
  const count={}; words.flat().forEach(w=>count[w]=(count[w]||0)+1);
  const lignes=[];
  profil.tarifs.forEach((tr,i)=>{
    const uniq = words[i].filter(w=>count[w]===1);
    if(uniq.some(w=>t.includes(w.slice(0, Math.max(4,w.length-1))))){
      let q=1;
      if(tr.unite==="m²"){ const m=t.match(/(\d+(?:[.,]\d+)?)\s*(?:m2|m²|metres? carres?|metres?)/); if(m) q=parseFloat(m[1].replace(",",".")); }
      if(tr.unite==="heure"){ const m=t.match(/(\d+(?:[.,]\d+)?)\s*h(?:eures?)?\b/); if(m) q=parseFloat(m[1].replace(",",".")); }
      lignes.push({designation:tr.nom, quantite:q, unite:tr.unite, prixUnitaire:tr.prix});
    }
  });
  if(!lignes.length){
    const m=t.match(/(\d+(?:[.,]\d+)?)\s*h(?:eures?)?\b/);
    lignes.push({designation:"Travaux selon description", quantite:m?parseFloat(m[1].replace(",",".")):4, unite:"heure", prixUnitaire:profil.taux});
  }
  const cm = text.match(/(?:pour|client(?:e)?)\s+(?:la\s+)?((?:madame|monsieur|mme|m\.)?\s*[^,.]+)/i);
  let nom = cm ? cm[1].trim().replace(/^madame/i,"Mme").replace(/^monsieur/i,"M.") : "";
  const am = text.match(/,\s*([^,.]*\d+[^,.]*?)\s*,\s*(\d{4})\s+([A-Za-zÀ-ÿ' -]+)/);
  return {client:{nom, adresse: am?am[1].trim():"", npaVille: am?am[2]+" "+am[3].trim():""}, chantier: text.split(".").slice(1,2).join("").trim().slice(0,90), lignes, remarques:""};
}

function renderChoixFacture(){
  const devisList = docs.filter(d=>d.type==="devis" && d.statut!=="Facturé").reverse();
  $app.innerHTML = topbar(backBtn("home"), `<span class="pill">Nouvelle facture</span>`) + `
    <div><h1>Faire une facture</h1><p class="lead">Reprends un devis déjà fait, ou crée une facture directement.</p></div>
    <button class="bigact devis" data-go="dicter:facture"><span><b>Nouvelle facture</b><small>Tu dictes le travail effectué</small></span><span class="ico">${IC.mic}</span></button>
    <div class="sec"><h2>Depuis un devis</h2>
      <div class="list">${devisList.length? devisList.map(d=>{const t=totals(d); return `
        <button class="item" data-fromdevis="${d.id}" ${d.statut==="Facturé"?'aria-disabled="true"':""}>
          <span class="t">${esc(d.client.nom||"Client sans nom")}</span><span class="a">${chf(t.ttc)}</span>
          <span class="s">${esc(d.num)} · ${esc(d.chantier||"")}</span><span>${statusPill(d)}</span></button>`;}).join("")
        : '<div class="empty">Aucun devis en attente de facture. Les devis déjà facturés sont dans les archives.</div>'}</div></div>`;
  bindGo();
  $app.querySelectorAll("[data-fromdevis]").forEach(b=>b.onclick=()=>factureDepuis(b.dataset.fromdevis));
}

function factureDepuis(id){
  const dv = docs.find(d=>d.id===id); if(!dv) return;
  if(dv.statut==="Facturé"){ const f=docs.find(d=>d.fromDevis===id); toast("Ce devis a déjà été facturé"); if(f) go({name:"doc",id:f.id}); return; }
  const f = {id:newId("d"), type:"facture", num:nextNum("facture"), date:today(), echeance:addDays(today(),30),
    client:{...dv.client}, clientId:dv.clientId, chantier:dv.chantier, remarques:"", lignes:dv.lignes.map(l=>({...l})), statut:"À payer", fromDevis:dv.id, refDevis:dv.num, datePrestation:today()};
  dv.statut="Facturé"; docs.push(f); save(); toast("Facture créée depuis "+dv.num); go({name:"doc",id:f.id});
}

// ---------- paper ----------
function paperHTML(doc){
  const tpl = doc.type==="devis" ? profil.modeleDevis : profil.modeleFacture;
  const t = totals(doc);
  const banded = tpl==="signal"||tpl==="ardoise";
  const co = `<div>${profil.logo?`<img class="p-logo" src="${profil.logo}" alt="">`:""}<div class="p-co">${esc(profil.entreprise)}</div><div class="p-small">${esc(profil.rue)}<br>${esc(profil.npa)} ${esc(profil.ville)}<br>${esc(profil.tel)} · ${esc(profil.email)}</div></div>`;
  const head = banded ? `<div class="p-band"><div class="p-head">${co}<div class="p-small" style="text-align:right">${esc(profil.metier)}${profil.tva?"<br>"+esc(profil.tvaNo):""}</div></div></div>`
                      : `<div class="p-head">${co}<div class="p-small" style="text-align:right">${esc(profil.metier)}${profil.tva?"<br>"+esc(profil.tvaNo):""}</div></div>`;
  const title = ({devis:"Devis",facture:"Facture",credit:"Note de crédit"})[doc.type];
  const lines = doc.lignes.map(l=>`<tr><td>${esc(l.designation)}</td><td class="n">${chf(l.quantite).replace(/\.00$/,"")} ${esc(l.unite)}</td><td class="n">${chf(l.prixUnitaire)}</td><td class="n">${chf(l.quantite*l.prixUnitaire)}</td></tr>`).join("");
  let foot = "";
  if(doc.type==="devis"){
    foot = `<div class="p-small" style="margin-top:14px">Devis valable 30 jours. Le client accepte le devis et ses conditions en le signant.</div>
      <div class="p-sign"><div class="box"><div class="p-label">Pour l'entreprise</div><div style="margin-top:6px">${esc(profil.entreprise)}</div></div>
      <div class="box"><div class="p-label">Bon pour accord, le client</div>${doc.signature?`<img src="${doc.signature.img}" alt="Signature du client"><div class="p-small">${esc(doc.signature.nom)}, le ${fmtDate(doc.signature.date)} à ${esc(doc.signature.heure)}</div>`:""}</div></div>`;
  } else if(doc.type==="credit"){
    foot = `<div class="p-small" style="margin-top:14px">Cette note de crédit annule la facture ${esc(doc.refFacture)} du ${fmtDate(doc.dateFacture)}.${doc.rembourser?" Le montant déjà payé sera remboursé.":""}</div>`;
  } else {
    foot = `<div class="p-small" style="margin-top:14px">Payable dans les 30 jours, jusqu'au ${fmtDate(doc.echeance)}.${doc.refDevis?" Selon devis "+esc(doc.refDevis)+".":""}</div>
      <div class="p-qr"><div><h4>Récépissé</h4><div class="p-label">Compte / Payable à</div>${esc(profil.iban)}<br>${esc(profil.entreprise)}<br>${esc(profil.npa)} ${esc(profil.ville)}
        <div class="p-label" style="margin-top:8px">Montant</div>CHF ${chf(t.ttc)}</div>
        <div><h4>Section paiement</h4><div style="display:flex;gap:12px;flex-wrap:wrap"><div class="q">${qrSVG(doc,t.ttc)}</div>
        <div style="min-width:0"><div class="p-label">Payable par</div>${esc(doc.client.nom)}<br>${esc(doc.client.adresse)}<br>${esc(doc.client.npaVille)}
        <div class="p-label" style="margin-top:8px">Informations</div>${esc(doc.num)}</div></div></div></div>`;
  }
  return `<div class="paper t-${tpl}">${head}<div class="p-pad" style="${banded?"padding-top:12px":""}">
    <div class="p-title">${title}</div><div class="p-small">N° ${esc(doc.num)} · ${fmtDate(doc.date)}</div>
    <div class="p-meta"><div><div class="p-label">Client</div>${esc(doc.client.nom)||'<span class="p-small">À compléter</span>'}<br>${esc(doc.client.adresse)}<br>${esc(doc.client.npaVille)}</div>
    <div><div class="p-label">Chantier</div>${esc(doc.chantier)||"—"}${doc.type==="facture"?`<div class="p-label" style="margin-top:8px">Date de la prestation</div>${fmtDate(doc.datePrestation||doc.date)}`:""}</div></div>
    <table class="p-lines"><thead><tr><th>Désignation</th><th class="n">Qté</th><th class="n">Prix CHF</th><th class="n">Total CHF</th></tr></thead><tbody>${lines}</tbody></table>
    <div class="p-tot"><div><span>Sous-total</span><span>${chf(t.ht)}</span></div>
    ${profil.tva?`<div><span>TVA ${TVA_RATE} %</span><span>${chf(t.tva)}</span></div>`:""}
    <div class="grand"><span>Total CHF</span><span>${chf(t.ttc)}</span></div></div>
    ${doc.remarques?`<div class="p-small" style="margin-top:10px">${esc(doc.remarques)}</div>`:""}
    ${foot}</div></div>`;
}

function splitCity(s){ const m=String(s||"").match(/^\s*(\d{4})\s+(.+)$/); return m?[m[1],m[2]]:["",String(s||"")]; }
function qrPayload(doc, amount){
  const iban = profil.iban.replace(/\s/g,"");
  const [cpc,ctown] = [profil.npa, profil.ville];
  const debtor = doc.client.nom ? (()=>{ const [pc,town]=splitCity(doc.client.npaVille); return ["S", doc.client.nom.slice(0,70), (doc.client.adresse||"").slice(0,70), "", pc, town.slice(0,35), pc?"CH":""]; })() : ["","","","","","",""];
  return ["SPC","0200","1",iban,"S",profil.entreprise.slice(0,70),profil.rue.slice(0,70),"",cpc,ctown,"CH",
    "","","","","","","", amount.toFixed(2),"CHF", ...debtor, "NON","", (doc.num+" "+(doc.chantier||"")).slice(0,140), "EPD"].join("\n");
}
function qrSVG(doc, amount){
  if(typeof qrcode!=="function") return '<div class="p-small">QR indisponible</div>';
  try{
    if(qrcode.stringToBytesFuncs && qrcode.stringToBytesFuncs["UTF-8"]) qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];
    const q = qrcode(0,"M"); q.addData(qrPayload(doc,amount),"Byte"); q.make();
    const n = q.getModuleCount(), cell = 8, size = n*cell;
    const c = document.createElement("canvas"); c.width = size; c.height = size;
    const x = c.getContext("2d"); x.fillStyle="#fff"; x.fillRect(0,0,size,size); x.fillStyle="#000";
    for(let r=0;r<n;r++) for(let k=0;k<n;k++) if(q.isDark(r,k)) x.fillRect(k*cell,r*cell,cell,cell);
    const s = size*0.17, o = (size-s)/2;
    x.fillStyle="#fff"; x.fillRect(o,o,s,s); x.fillStyle="#000"; x.fillRect(o+s*0.08,o+s*0.08,s*0.84,s*0.84);
    x.fillStyle="#fff"; x.fillRect(o+s*0.42,o+s*0.22,s*0.16,s*0.56); x.fillRect(o+s*0.22,o+s*0.42,s*0.56,s*0.16);
    return `<img src="${c.toDataURL("image/png")}" width="120" height="120" alt="QR-facture suisse" style="image-rendering:pixelated">`;
  }catch(e){ return '<div class="p-small">QR indisponible</div>'; }
}

// ---------- PDF & export ----------
const LIBS = {
  html2canvas:"https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
  jspdf:"https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  jszip:"https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"
};
const loaded = {};
function loadLib(k){
  if(!loaded[k]) loaded[k] = new Promise((res,rej)=>{ const sc=document.createElement("script"); sc.src=LIBS[k]; sc.onload=res; sc.onerror=()=>{ delete loaded[k]; rej(new Error("lib")); }; document.head.appendChild(sc); });
  return loaded[k];
}
async function docPDF(doc){
  await Promise.all([loadLib("html2canvas"), loadLib("jspdf")]);
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;width:640px;background:#fff";
  host.innerHTML = paperHTML(doc);
  document.body.appendChild(host);
  try{
    await Promise.all([...host.querySelectorAll("img")].map(i=>i.decode?i.decode().catch(()=>{}):null));
    if(document.fonts && document.fonts.ready) await document.fonts.ready;
    const canvas = await window.html2canvas(host.firstElementChild, {scale:2, backgroundColor:"#ffffff", logging:false});
    const pdf = new window.jspdf.jsPDF({unit:"mm", format:"a4", compress:true});
    let w = 190, h = canvas.height * w / canvas.width;
    if(h > 277){ h = 277; w = canvas.width * h / canvas.height; }
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", (210-w)/2, 10, w, h);
    pdf.setProperties({title: ({devis:"Devis ",facture:"Facture ",credit:"Note de crédit "})[doc.type]+doc.num, author: profil.entreprise});
    return pdf.output("blob");
  } finally { host.remove(); }
}
async function saveFile(filename, data){
  const type = filename.endsWith(".csv") ? "text/csv;charset=utf-8" : filename.endsWith(".pdf") ? "application/pdf" : "application/zip";
  const blob = data instanceof Blob ? data : new Blob([data], {type});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 5000);
}
function safeName(s){ return String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^A-Za-z0-9-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,40); }
function pdfName(doc){ return `${doc.num}_${safeName(doc.client.nom)||"client"}.pdf`; }
function dlError(e){
  if(e && e.code==="declined") return "Téléchargement annulé.";
  if(e && e.code==="rate_limited") return "Une demande de téléchargement est déjà ouverte. Réessaie dans un instant.";
  if(e && e.message==="lib") return "Impossible de charger l'outil PDF. Vérifie ta connexion et réessaie.";
  return "Le téléchargement n'est pas disponible ici.";
}
function monthKey(iso){ return iso.slice(0,7); }
function monthLabel(key){ const [y,m]=key.split("-").map(Number); const l=new Date(y,m-1,1).toLocaleDateString("fr-CH",{month:"long",year:"numeric"}); return l.charAt(0).toUpperCase()+l.slice(1); }
function csvCell(v){ const t=String(v==null?"":v); return /[;"\n]/.test(t) ? '"'+t.replace(/"/g,'""')+'"' : t; }
function csvMoney(n){ return (Math.round(n*100)/100).toFixed(2); }
function recapCSV(list){
  const head = ["Type","Numéro","Date","Date de prestation","Échéance","Client","Adresse","NPA et localité","Chantier","Montant HT","TVA","Total TTC","Statut","Payée le","Référence"];
  const rows = list.map(d=>{ const t=totals(d); return [d.type==="credit"?"Note de crédit":"Facture",d.num,fmtDate(d.date),fmtDate(d.datePrestation),fmtDate(d.echeance),d.client.nom,d.client.adresse,d.client.npaVille,d.chantier,csvMoney(t.ht),csvMoney(t.tva),csvMoney(t.ttc),d.statut,fmtDate(d.payeeLe),d.refFacture||d.refDevis||""]; });
  const sum = list.reduce((a,d)=>{ const t=totals(d); a.ht+=t.ht; a.tva+=t.tva; a.ttc+=t.ttc; return a; },{ht:0,tva:0,ttc:0});
  rows.push(["TOTAL","","","","","","","","",csvMoney(sum.ht),csvMoney(sum.tva),csvMoney(sum.ttc),"","",""]);
  return "﻿" + [head,...rows].map(r=>r.map(csvCell).join(";")).join("\r\n");
}

function renderExport(){
  const factures = docs.filter(d=>d.type==="facture" || d.type==="credit");
  const months = [...new Set(factures.map(d=>monthKey(d.date)))].sort().reverse();
  if(!months.length) months.push(monthKey(today()));
  const key = view.month && months.includes(view.month) ? view.month : months[0];
  const list = factures.filter(d=>monthKey(d.date)===key).sort((a,b)=>a.num.localeCompare(b.num));
  const sum = list.reduce((a,d)=>{ const t=totals(d); a.ht+=t.ht; a.tva+=t.tva; a.ttc+=t.ttc; if(d.statut==="Payée") a.paye+=t.ttc; if(d.statut==="Annulée") a.annule+=t.ttc; return a; },{ht:0,tva:0,ttc:0,paye:0,annule:0});
  const reste = list.filter(d=>d.statut==="À payer").reduce((s,d)=>s+totals(d).ttc,0);
  $app.innerHTML = topbar(backBtn("home"), `<span class="pill">Export</span>`) + `
    <div><h1>Export pour la fiduciaire</h1><p class="lead">Toutes les factures du mois en PDF, avec un tableau récapitulatif qui s'ouvre dans Excel.</p></div>
    <div class="field"><label for="ex-m">Mois</label><select id="ex-m">${months.map(m=>`<option value="${m}" ${m===key?"selected":""}>${monthLabel(m)}</option>`).join("")}</select></div>
    <div class="sumgrid">
      <div><span class="eyebrow">Documents</span><b>${list.length}</b></div>
      <div><span class="eyebrow">Total net facturé</span><b>CHF ${chf(sum.ttc)}</b></div>
      <div><span class="eyebrow">Encaissé</span><b class="okc">CHF ${chf(sum.paye)}</b></div>
      <div><span class="eyebrow">Reste à encaisser</span><b class="redc">CHF ${chf(reste)}</b></div>
      ${profil.tva?`<div class="wide"><span class="eyebrow">Dont TVA ${TVA_RATE} %</span><b>CHF ${chf(sum.tva)}</b></div>`:""}
    </div>
    <div class="list">${list.length?list.map(d=>{const t=totals(d); return `<div class="item" style="cursor:default">
      <span class="t">${esc(d.client.nom||"Client sans nom")}</span><span class="a">${chf(t.ttc)}</span>
      <span class="s">${esc(d.num)} · ${fmtDate(d.date)}</span><span>${d.type==="credit"?'<span class="pill">Note de crédit</span>':statusPill(d)}</span></div>`;}).join(""):'<div class="empty">Aucune facture ce mois-ci.</div>'}</div>
    <div class="stack" id="ex-actions">
      <button class="btn red" id="ex-zip" ${list.length?"":"disabled"}>Télécharger le dossier complet (.zip)</button>
      <button class="btn ghost" id="ex-csv" ${list.length?"":"disabled"}>Tableau récapitulatif seul (.csv)</button>
    </div>
    <div id="ex-msg"></div>`;
  bindGo();
  document.getElementById("ex-m").onchange=e=>{ view.month=e.target.value; renderExport(); };
  const msg = t=>{ document.getElementById("ex-msg").innerHTML = t?`<div class="note">${esc(t)}</div>`:""; };
  const base = `Factures-${key}-${safeName(profil.entreprise)||"entreprise"}`;
  document.getElementById("ex-csv").onclick=async()=>{
    try{ await saveFile(base+".csv", recapCSV(list)); msg(""); toast("Tableau téléchargé"); }catch(e){ msg(dlError(e)); }
  };
  document.getElementById("ex-zip").onclick=async()=>{
    const btn = document.getElementById("ex-zip"); btn.disabled=true;
    try{
      await loadLib("jszip");
      const zip = new window.JSZip();
      const folder = zip.folder("Factures");
      for(let i=0;i<list.length;i++){
        btn.textContent = `Préparation des PDF… ${i+1}/${list.length}`;
        folder.file(pdfName(list[i]), await docPDF(list[i]));
      }
      zip.file(`Recapitulatif-${key}.csv`, recapCSV(list));
      btn.textContent = "Compression…";
      const blob = await zip.generateAsync({type:"blob"});
      await saveFile(base+".zip", blob);
      msg(""); toast("Dossier téléchargé");
    }catch(e){ msg(dlError(e)); }
    finally{ btn.disabled=false; btn.textContent="Télécharger le dossier complet (.zip)"; }
  };
}

function relanceDue(d){
  if(!isLate(d)) return false;
  const r=d.relances||[]; if(!r.length) return true;
  return addDays(r[r.length-1],10) <= today();
}
function canEdit(doc){
  if(doc.type==="devis") return !doc.signature && doc.statut!=="Facturé";
  if(doc.type==="facture") return !doc.envoyeLe && doc.statut==="À payer";
  return false;
}
function creerNoteCredit(f){
  const nc = {id:newId("d"), type:"credit", num:nextNum("credit"), date:today(), client:{...f.client}, clientId:f.clientId,
    chantier:f.chantier, remarques:"", lignes:f.lignes.map(l=>({...l, prixUnitaire:-Math.abs(Number(l.prixUnitaire)||0)})),
    statut:"Émise", refFacture:f.num, dateFacture:f.date, factureId:f.id, rembourser:f.statut==="Payée"};
  f.statut="Annulée"; f.creditId=nc.id; docs.push(nc); save(); return nc;
}
function renderDoc(id){
  const doc = docs.find(d=>d.id===id); if(!doc){ go({name:"home"}); return; }
  const isDevis = doc.type==="devis", isCredit = doc.type==="credit";
  const late = isLate(doc);
  let actions="", infos=[];
  if(doc.envoyeLe) infos.push("Envoyé le "+fmtDate(doc.envoyeLe));
  if(doc.relances&&doc.relances.length) infos.push(`Relancé ${doc.relances.length} fois, la dernière le ${fmtDate(doc.relances[doc.relances.length-1])}`);
  if(isDevis){
    if(!doc.signature) actions += `<button class="btn red" data-to="signer">Faire signer le client sur place</button>`;
    if(!doc.signature) actions += `<button class="btn ghost" data-to="envoyer">${doc.envoyeLe?"Renvoyer le devis":"Envoyer le devis au client"}</button>`;
    if(doc.statut!=="Facturé") actions += `<button class="btn ${doc.signature?"red":"ghost"}" id="toFacture">Créer la facture</button>`;
    else { const f=docs.find(d=>d.fromDevis===doc.id); if(f) actions += `<button class="btn ghost" data-open="${f.id}">Voir la facture ${esc(f.num)}</button>`; }
  } else if(!isCredit){
    if(doc.statut==="À payer"){
      if(late) actions += `<button class="btn red" data-to="relance">Relancer le client</button>`;
      actions += `<button class="btn ${late||!doc.envoyeLe?"ghost":"red"}" id="paid">Marquer comme payée</button>`;
      if(!late) actions = `<button class="btn ${doc.envoyeLe?"ghost":"red"}" data-to="envoyer">${doc.envoyeLe?"Renvoyer la facture":"Envoyer la facture au client"}</button>` + actions;
    }
    if(doc.creditId) actions += `<button class="btn ghost" data-open="${doc.creditId}">Voir la note de crédit</button>`;
  } else {
    actions += `<button class="btn ghost" data-open="${doc.factureId}">Voir la facture annulée ${esc(doc.refFacture)}</button>`;
    actions += `<button class="btn ghost" data-to="envoyer">Envoyer la note de crédit au client</button>`;
  }
  if(canEdit(doc)) actions += `<button class="btn ghost" data-to="corriger">Corriger</button>`;
  actions += `<button class="btn ghost" id="dlpdf">Télécharger le PDF</button><div id="dl-msg"></div>`;
  if(doc.type==="facture" && doc.statut!=="Annulée") actions += `<div id="nc-zone"><button class="linkbtn danger" id="nc">Annuler cette facture par une note de crédit</button></div>`;
  const label = ({devis:"Devis",facture:"Facture",credit:"Note de crédit"})[doc.type];
  $app.innerHTML = topbar(view.from==="archives"?`<button class="iconbtn" id="backarch" aria-label="Retour">${IC.back}</button>`:backBtn("home"), `<div class="status">${late?'<span class="pill red">En retard</span>':isCredit?'<span class="pill">Note de crédit</span>':statusPill(doc)}</div>`) + `
    <div><div class="eyebrow">${label} ${esc(doc.num)}</div><h1>${esc(doc.client.nom||"Client sans nom")}</h1>
    ${view.fresh?`<p class="lead">${doc.viaIA?"Préparé par l'IA à partir de ta dictée et de tes tarifs.":"Préparé à partir de ta dictée et de tes tarifs (mode hors IA, plus approximatif)."} Vérifie les lignes avant de l'envoyer.</p>`:""}
    ${infos.length?`<p class="lead">${esc(infos.join(" · "))}</p>`:""}</div>
    <div class="sheetwrap">${paperHTML(doc)}</div>
    <div class="stack">${actions}</div>
    ${doc.type==="facture"&&doc.envoyeLe&&doc.statut==="À payer"?'<p class="lead" style="font-size:13px">Une facture envoyée ne se modifie plus. Pour corriger une erreur, annule-la par une note de crédit et refais une facture.</p>':""}
    ${doc.dictee?`<details><summary class="eyebrow" style="cursor:pointer">Dictée d'origine</summary><p class="lead">${esc(doc.dictee)}</p></details>`:""}`;
  bindGo();
  const ba=document.getElementById("backarch"); if(ba) ba.onclick=()=>go({name:"archives",tab:view.tab});
  $app.querySelectorAll("[data-to]").forEach(b=>b.onclick=()=>{
    const t=b.dataset.to;
    if(t==="relance") go({name:"envoyer",id:doc.id,mode:"relance"});
    else if(t==="envoyer") go({name:"envoyer",id:doc.id,mode:"doc"});
    else go({name:t,id:doc.id});
  });
  $app.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>go({name:"doc",id:b.dataset.open,from:view.from,tab:view.tab}));
  const tf=document.getElementById("toFacture"); if(tf) tf.onclick=()=>factureDepuis(doc.id);
  const dp=document.getElementById("dlpdf");
  if(dp) dp.onclick=()=>downloadPDF(doc, dp, document.getElementById("dl-msg"));
  const pd=document.getElementById("paid"); if(pd) pd.onclick=()=>{ doc.statut="Payée"; doc.payeeLe=today(); save(); toast("Facture payée, rangée dans les archives"); render(); };
  const nc=document.getElementById("nc");
  if(nc) nc.onclick=()=>{
    document.getElementById("nc-zone").innerHTML = `<div class="confirm"><b>Annuler la facture ${esc(doc.num)} ?</b>
      <p>Une note de crédit de CHF -${chf(totals(doc).ttc)} sera créée. La facture reste dans tes archives, marquée comme annulée.${doc.statut==="Payée"?" Elle a déjà été payée : pense à rembourser le client.":""}</p>
      <div class="btnrow"><button class="btn ghost" id="nc-no">Garder la facture</button><button class="btn red" id="nc-yes">Créer la note de crédit</button></div></div>`;
    document.getElementById("nc-no").onclick=()=>render();
    document.getElementById("nc-yes").onclick=()=>{ const n=creerNoteCredit(doc); toast("Note de crédit "+n.num+" créée"); go({name:"doc",id:n.id}); };
  };
}

async function downloadPDF(doc, btn, m){
  const label=btn.textContent; btn.disabled=true; btn.textContent="Préparation du PDF…";
  try{ const blob=await docPDF(doc); await saveFile(pdfName(doc), blob); m.innerHTML=""; toast("PDF téléchargé"); return true; }
  catch(e){ m.innerHTML=`<div class="note">${esc(dlError(e))}</div>`; return false; }
  finally{ btn.disabled=false; btn.textContent=label; }
}

function canShareFiles(){
  try{ return !!(navigator.canShare && navigator.canShare({files:[new File(["x"], "t.pdf", {type:"application/pdf"})]})); }catch(e){ return false; }
}
function waNumber(tel){
  let t=String(tel||"").replace(/[^\d+]/g,"");
  if(t.startsWith("+")) t=t.slice(1); else if(t.startsWith("00")) t=t.slice(2); else if(t.startsWith("0")) t="41"+t.slice(1);
  return t;
}
function messageFor(doc, mode){
  const t=totals(doc), nom=doc.client.nom||"Madame, Monsieur";
  doc = {...doc, chantier:String(doc.chantier||"").replace(/[\s,.;:]+$/,"")};
  const sig = `${profil.entreprise}\n${profil.tel}`;
  if(mode==="relance"){
    const n=(doc.relances||[]).length;
    const intro = n===0 ? `Sauf erreur de notre part, la facture ${doc.num} du ${fmtDate(doc.date)} n'a pas encore été réglée. Elle était payable jusqu'au ${fmtDate(doc.echeance)}.`
      : n===1 ? `Nous vous avons rappelé il y a quelques jours que la facture ${doc.num} du ${fmtDate(doc.date)} restait ouverte. Nous n'avons toujours pas reçu le paiement.`
      : `Malgré nos rappels, la facture ${doc.num} du ${fmtDate(doc.date)} n'est toujours pas réglée. Il s'agit de notre dernier rappel avant d'engager d'autres démarches.`;
    return `Bonjour ${nom},\n\n${intro}\n\nMontant : CHF ${chf(t.ttc)}\nIBAN : ${profil.iban}\nRéférence : ${doc.num}\n\nVous pouvez payer en scannant la QR-facture jointe avec votre application bancaire. Si le paiement a déjà été fait, merci de ne pas tenir compte de ce message.\n\nMerci et bonne journée,\n${sig}`;
  }
  if(doc.type==="devis") return `Bonjour ${nom},\n\nVoici notre devis ${doc.num}${doc.chantier?" pour "+doc.chantier:""}, d'un montant de CHF ${chf(t.ttc)}${profil.tva?" TVA comprise":""}. Il est valable 30 jours.\n\nPour l'accepter, il suffit de nous répondre « Bon pour accord » ou de nous le renvoyer signé.\n\nNous restons à votre disposition pour toute question.\n\n${sig}`;
  if(doc.type==="credit") return `Bonjour ${nom},\n\nVous trouverez ci-joint la note de crédit ${doc.num}, qui annule la facture ${doc.refFacture}. ${doc.rembourser?"Nous vous remboursons le montant déjà versé.":"Vous n'avez rien à payer pour cette facture."}\n\n${sig}`;
  return `Bonjour ${nom},\n\nVeuillez trouver ci-joint la facture ${doc.num}${doc.chantier?" pour "+doc.chantier:""}.\n\nMontant : CHF ${chf(t.ttc)}\nÀ payer jusqu'au : ${fmtDate(doc.echeance)}\n\nLe plus simple : scannez la QR-facture en bas du document avec votre application bancaire.\n\nMerci de votre confiance,\n${sig}`;
}

function renderEnvoyer(id, mode){
  const doc = docs.find(d=>d.id===id); if(!doc){ go({name:"home"}); return; }
  const isRelance = mode==="relance";
  const n=(doc.relances||[]).length;
  const titre = isRelance ? (n===0?"Relancer le client":n===1?"Deuxième rappel":"Dernier rappel") : ({devis:"Envoyer le devis",facture:"Envoyer la facture",credit:"Envoyer la note de crédit"})[doc.type];
  const w = {email:doc.client.email||"", tel:doc.client.tel||"", msg: view.msg || messageFor(doc, mode)};
  const subject = isRelance ? `Rappel : facture ${doc.num}` : `${({devis:"Devis",facture:"Facture",credit:"Note de crédit"})[doc.type]} ${doc.num} – ${profil.entreprise}`;
  $app.innerHTML = topbar(`<button class="iconbtn" id="cancel" aria-label="Retour">${IC.back}</button>`, `<span class="pill">${esc(doc.num)}</span>`) + `
    <div><div class="eyebrow">${esc(doc.client.nom||"Client")}</div><h1>${titre}</h1>
    <p class="lead">${isRelance?`Facture en retard depuis le ${fmtDate(doc.echeance)}. Le message est déjà rédigé, adapte-le si besoin.`:"Le message est prêt. Joins le PDF et envoie-le par WhatsApp ou par e-mail."}</p></div>
    ${canShareFiles()?`<button class="btn red" id="e-share">Envoyer le PDF avec le message</button>
    <p class="lead" style="font-size:13px;margin-top:-8px">Choisis WhatsApp, Mail ou Messages. Ou fais-le en trois étapes :</p>`:""}
    <div class="steps-list">
      <div class="stepi"><span class="num">1</span><div class="grow"><b>Télécharge le PDF</b><div class="s">Pour le joindre à ton message.</div></div>
        <button class="btn ghost small" id="e-pdf">PDF</button></div>
      <div class="stepi"><span class="num">2</span><div class="grow"><b>Vérifie le message</b></div></div>
    </div>
    <textarea id="e-msg" style="min-height:220px">${esc(w.msg)}</textarea>
    <div class="stepi"><span class="num">3</span><div class="grow"><b>Envoie-le</b></div></div>
    <div class="row">
      <div class="field"><label for="e-tel">Téléphone du client</label><input id="e-tel" type="tel" inputmode="tel" placeholder="079 123 45 67" value="${esc(w.tel)}"></div>
      <div class="field"><label for="e-mail">E-mail du client</label><input id="e-mail" type="email" inputmode="email" placeholder="client@exemple.ch" value="${esc(w.email)}"></div>
    </div>
    <div class="sendrow">
      <a class="btn wa" id="e-wa" target="_blank" rel="noopener">WhatsApp</a>
      <a class="btn ghost" id="e-em" target="_blank" rel="noopener">E-mail</a>
      <button class="btn ghost" id="e-copy">Copier</button>
    </div>
    <div id="e-note"></div>
    <div class="confirm soft"><p>Une fois le message parti, confirme-le ici pour que l'appli suive ${isRelance?"les relances":"l'envoi"}.</p>
      <button class="btn red" id="e-done">${isRelance?"La relance est envoyée":"C'est envoyé"}</button></div>
`;
  const msgEl=document.getElementById("e-msg"), telEl=document.getElementById("e-tel"), mailEl=document.getElementById("e-mail");
  const wa=document.getElementById("e-wa"), em=document.getElementById("e-em"), note=document.getElementById("e-note");
  const refresh=()=>{
    view.msg = msgEl.value;
    const num=waNumber(telEl.value);
    wa.href = "https://wa.me/"+(num||"")+"?text="+encodeURIComponent(msgEl.value);
    em.href = "mailto:"+encodeURIComponent(mailEl.value.trim())+"?subject="+encodeURIComponent(subject)+"&body="+encodeURIComponent(msgEl.value);
    em.toggleAttribute("aria-disabled", !mailEl.value.trim());
  };
  [msgEl,telEl,mailEl].forEach(el=>el.oninput=refresh); refresh();
  const keepContact=()=>{ doc.client.tel=telEl.value.trim(); doc.client.email=mailEl.value.trim(); syncClient(doc); save(); };
  telEl.onchange=keepContact; mailEl.onchange=keepContact;
  em.onclick=()=>{ keepContact(); note.innerHTML = mailEl.value.trim()?`<div class="note">Si ta messagerie ne s'ouvre pas, copie le message et envoie-le à <b>${esc(mailEl.value.trim())}</b> depuis ton e-mail habituel.</div>`:'<div class="note">Ajoute l\'e-mail du client pour préparer l\'e-mail.</div>'; };
  wa.onclick=()=>{ keepContact(); };
  document.getElementById("e-copy").onclick=async()=>{
    try{ await navigator.clipboard.writeText(msgEl.value); toast("Message copié"); }
    catch(e){ msgEl.focus(); msgEl.select(); note.innerHTML='<div class="note">Le texte est sélectionné, copie-le avec ton appareil.</div>'; }
  };
  const pdfBtn=document.getElementById("e-pdf");
  pdfBtn.onclick=()=>downloadPDF(doc, pdfBtn, note);
  const sh=document.getElementById("e-share");
  if(sh) sh.onclick=async()=>{
    keepContact(); const label=sh.textContent; sh.disabled=true; sh.textContent="Préparation du PDF…";
    try{
      const blob=await docPDF(doc);
      const file=new File([blob], pdfName(doc), {type:"application/pdf"});
      await navigator.share({files:[file], text:msgEl.value, title:subject});
      note.innerHTML='<div class="note">Une fois le message parti, confirme-le ci-dessous.</div>';
    }catch(e){ if(e && e.name!=="AbortError") note.innerHTML='<div class="note">Le partage n\'a pas fonctionné. Utilise les étapes ci-dessous.</div>'; }
    finally{ sh.disabled=false; sh.textContent=label; }
  };
  document.getElementById("cancel").onclick=()=>{ view.msg=null; go({name:"doc",id}); };
  document.getElementById("e-done").onclick=()=>{
    keepContact();
    if(isRelance){ doc.relances=(doc.relances||[]).concat(today()); toast("Relance enregistrée"); }
    else { if(!doc.envoyeLe) doc.envoyeLe=today(); toast((doc.type==="devis"?"Devis":"Document")+" marqué comme envoyé"); }
    save(); go({name:"doc",id});
  };
}

function renderCorriger(id){
  const doc = docs.find(d=>d.id===id); if(!doc){ go({name:"home"}); return; }
  const w = JSON.parse(JSON.stringify(doc));
  const draw = ()=>{
    $app.innerHTML = topbar(`<button class="iconbtn" id="cancel" aria-label="Annuler">${IC.back}</button>`, `<span class="pill">${esc(doc.num)}</span>`) + `
      <div><h1>Corriger</h1><p class="lead">Ajuste le client, les quantités et les prix.</p></div>
      <div class="stack">
        <div class="field"><label for="c-nom">Client</label><input id="c-nom" value="${esc(w.client.nom)}"></div>
        <div class="field"><label for="c-adr">Adresse</label><input id="c-adr" value="${esc(w.client.adresse)}"></div>
        <div class="field"><label for="c-npa">NPA et localité</label><input id="c-npa" value="${esc(w.client.npaVille)}"></div>
        <div class="row"><div class="field"><label for="c-tel">Téléphone</label><input id="c-tel" type="tel" value="${esc(w.client.tel||"")}"></div>
        <div class="field"><label for="c-mail">E-mail</label><input id="c-mail" type="email" value="${esc(w.client.email||"")}"></div></div>
        <div class="field"><label for="c-ch">Chantier</label><input id="c-ch" value="${esc(w.chantier)}"></div>
        ${w.type==="facture"?`<div class="field"><label for="c-dp">Date de la prestation</label><input id="c-dp" type="date" value="${esc(w.datePrestation||w.date)}"></div>`:""}
      </div>
      <div class="sec"><div class="eyebrow">Lignes · désignation, quantité, prix</div>
        ${w.lignes.map((l,i)=>`<div class="edit-line"><input aria-label="Désignation" id="l-d-${i}" data-l="${i}" data-f="designation" value="${esc(l.designation)}">
          <input aria-label="Quantité" id="l-q-${i}" data-l="${i}" data-f="quantite" type="number" inputmode="decimal" value="${l.quantite}">
          <input aria-label="Prix unitaire" id="l-p-${i}" data-l="${i}" data-f="prixUnitaire" type="number" inputmode="decimal" value="${l.prixUnitaire}">
          <button class="del" data-dl="${i}" aria-label="Supprimer la ligne">×</button></div>`).join("")}
        <button class="btn ghost" id="addl">+ Ajouter une ligne</button></div>
      <button class="btn red" id="savec">Enregistrer</button>`;
    document.getElementById("cancel").onclick=()=>go({name:"doc",id});
    [["c-nom",v=>w.client.nom=v],["c-adr",v=>w.client.adresse=v],["c-npa",v=>w.client.npaVille=v],["c-ch",v=>w.chantier=v],["c-tel",v=>w.client.tel=v],["c-mail",v=>w.client.email=v],["c-dp",v=>w.datePrestation=v]].forEach(([i,f])=>{ const el=document.getElementById(i); if(el) el.oninput=e=>f(e.target.value); });
    $app.querySelectorAll("[data-l]").forEach(el=>el.oninput=()=>{ const l=w.lignes[+el.dataset.l]; l[el.dataset.f]= el.dataset.f==="designation"?el.value:Number(el.value); });
    $app.querySelectorAll("[data-dl]").forEach(b=>b.onclick=()=>{ w.lignes.splice(+b.dataset.dl,1); draw(); });
    document.getElementById("addl").onclick=()=>{ w.lignes.push({designation:"",quantite:1,unite:"forfait",prixUnitaire:0}); draw(); };
    document.getElementById("savec").onclick=()=>{ Object.assign(doc,{client:w.client,chantier:w.chantier,datePrestation:w.datePrestation,lignes:w.lignes.filter(l=>l.designation.trim())}); syncClient(doc); save(); toast("Modifications enregistrées"); go({name:"doc",id}); };
  };
  draw();
}

function renderSigner(id){
  const doc = docs.find(d=>d.id===id); if(!doc){ go({name:"home"}); return; }
  const t = totals(doc);
  $app.innerHTML = topbar(`<button class="iconbtn" id="cancel" aria-label="Retour">${IC.back}</button>`, `<span class="pill">${esc(doc.num)}</span>`) + `
    <div><div class="eyebrow">À remplir par le client</div><h1>Bon pour accord</h1>
    <p class="lead">J'accepte le devis ${esc(doc.num)} de ${esc(profil.entreprise)} pour un montant de <b>CHF ${chf(t.ttc)}</b>${profil.tva?" TVA comprise":""}.</p></div>
    <div class="row"><div class="field"><label for="s-pre">Prénom</label><input id="s-pre" autocomplete="off"></div>
    <div class="field"><label for="s-nom">Nom</label><input id="s-nom" autocomplete="off"></div></div>
    <div class="field"><label>Signature</label><canvas class="sigpad" id="pad" aria-label="Zone de signature"></canvas></div>
    <button class="linkbtn" id="clear" style="align-self:flex-start">Effacer la signature</button>
    <div id="s-err"></div>
    <button class="btn red" id="valider">Signer le devis</button>`;
  document.getElementById("cancel").onclick=()=>go({name:"doc",id});
  const pad=document.getElementById("pad"), ctx=pad.getContext("2d");
  const ratio=window.devicePixelRatio||1; let drawn=false;
  const size=()=>{ const r=pad.getBoundingClientRect(); pad.width=r.width*ratio; pad.height=r.height*ratio; ctx.scale(ratio,ratio); ctx.lineWidth=2.4; ctx.lineCap="round"; ctx.lineJoin="round"; ctx.strokeStyle="#141414"; };
  size();
  let down=false, last=null;
  const pt=e=>{ const r=pad.getBoundingClientRect(); return {x:e.clientX-r.left,y:e.clientY-r.top}; };
  pad.onpointerdown=e=>{ down=true; last=pt(e); pad.setPointerCapture(e.pointerId); };
  pad.onpointermove=e=>{ if(!down) return; const p=pt(e); ctx.beginPath(); ctx.moveTo(last.x,last.y); ctx.lineTo(p.x,p.y); ctx.stroke(); last=p; drawn=true; };
  pad.onpointerup=pad.onpointercancel=()=>{ down=false; };
  document.getElementById("clear").onclick=()=>{ ctx.clearRect(0,0,pad.width,pad.height); drawn=false; };
  document.getElementById("valider").onclick=()=>{
    const pre=document.getElementById("s-pre").value.trim(), nom=document.getElementById("s-nom").value.trim();
    const err=document.getElementById("s-err");
    if(!pre||!nom){ err.innerHTML='<div class="note">Le client doit écrire son prénom et son nom.</div>'; return; }
    if(!drawn){ err.innerHTML='<div class="note">Le client doit signer dans le cadre avec le doigt.</div>'; return; }
    const now=new Date();
    doc.signature={nom:pre+" "+nom, img:pad.toDataURL("image/png"), date:today(), heure:now.toTimeString().slice(0,5)};
    doc.statut="Accepté"; if(!doc.client.nom) doc.client.nom=pre+" "+nom;
    syncClient(doc); save(); toast("Devis signé et verrouillé"); go({name:"doc",id});
  };
}

// ---------- connexion et démarrage ----------
function blankProfil(email){
  return {entreprise:"", metier:"Nettoyage", rue:"", npa:"", ville:"", tel:"", email:email||"", iban:"", tva:false, tvaNo:"", taux:60,
    tarifs:[{nom:"",prix:0,unite:"heure"}], modeleDevis:"atelier", modeleFacture:"atelier", plan:"gratuit"};
}
function ibanValid(iban){
  const s=String(iban||"").replace(/\s/g,"").toUpperCase();
  if(!/^(CH|LI)\d{2}[0-9A-Z]{17}$/.test(s)) return false;
  const r=(s.slice(4)+s.slice(0,4)).replace(/[A-Z]/g,c=>c.charCodeAt(0)-55);
  let m=0; for(const ch of r) m=(m*10+ +ch)%97; return m===1;
}
function checkStep(step, d){
  if(step===1){
    if(!String(d.entreprise).trim()) return "Indique le nom de ton entreprise.";
    if(!String(d.rue).trim() || !String(d.ville).trim()) return "Indique l'adresse complète de ton entreprise.";
    if(!/^\d{4}$/.test(String(d.npa).trim())) return "Le NPA doit compter 4 chiffres.";
    if(!ibanValid(d.iban)) return "L'IBAN n'est pas valable. Vérifie-le dans ton e-banking (il commence par CH).";
    if(d.tva && !String(d.tvaNo).trim()) return "Indique ton numéro TVA, ou décoche la case TVA.";
  }
  if(step===2){
    if(!(Number(d.taux)>0)) return "Indique ton taux horaire.";
    d.tarifs = d.tarifs.filter(t=>String(t.nom).trim());
  }
  return "";
}
function renderBoot(msg, retry){
  $app.innerHTML = topbar(`<div class="brand"><span class="cross"></span>Factivo</div>`) +
    `<div class="boot"><div class="stack" style="text-align:center;max-width:320px">${msg?`<p>${esc(msg)}</p>${retry?'<button class="btn red" id="retry">Réessayer</button>':""}`:'<div class="loading" style="justify-content:center"><span class="spin"></span>Chargement…</div>'}</div></div>`;
  const r=document.getElementById("retry"); if(r) r.onclick=()=>location.reload();
}
function renderLogin(){
  const step = view.step || "email";
  $app.innerHTML = topbar(`<div class="brand"><span class="cross"></span>Factivo</div>`) + (step==="email" ? `
    <div><h1>Connexion</h1><p class="lead">Entre ton adresse e-mail. Tu reçois un code, pas de mot de passe à retenir.</p></div>
    <form class="stack" id="lf"><div class="field"><label for="l-mail">Adresse e-mail</label>
      <input id="l-mail" type="email" inputmode="email" autocomplete="email" required value="${esc(view.email||"")}"></div>
      <div id="l-err"></div><button class="btn red" id="l-go" type="submit">Recevoir mon code</button></form>` : `
    <div><h1>Ton code</h1><p class="lead">On vient d'envoyer un code à <b>${esc(view.email)}</b>. Il arrive en moins d'une minute, pense à regarder les indésirables.</p></div>
    <form class="stack" id="lf"><div class="field"><label for="l-code">Code reçu par e-mail</label>
      <input id="l-code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" required style="font-size:24px;letter-spacing:.3em;text-align:center"></div>
      <div id="l-err"></div><button class="btn red" id="l-go" type="submit">Me connecter</button>
      <button class="linkbtn" type="button" id="l-back" style="align-self:center">Changer d'adresse ou renvoyer le code</button></form>`);
  const f=document.getElementById("lf"), err=document.getElementById("l-err"), btn=document.getElementById("l-go");
  const fail=m=>{ err.innerHTML=`<div class="note">${esc(m)}</div>`; btn.disabled=false; };
  const back=document.getElementById("l-back"); if(back) back.onclick=()=>go({name:"login", step:"email", email:view.email});
  f.onsubmit=async e=>{
    e.preventDefault(); btn.disabled=true; err.innerHTML="";
    if(step==="email"){
      const email=document.getElementById("l-mail").value.trim().toLowerCase();
      const {error}=await sb.auth.signInWithOtp({email, options:{shouldCreateUser:true}});
      if(error) return fail(/rate|seconds/i.test(error.message)?"Trop de demandes. Attends une minute avant de redemander un code.":"Impossible d'envoyer le code. Vérifie l'adresse et ta connexion.");
      go({name:"login", step:"code", email});
    } else {
      const token=document.getElementById("l-code").value.replace(/\D/g,"");
      const {data, error}=await sb.auth.verifyOtp({email:view.email, token, type:"email"});
      if(error || !data.session) return fail("Ce code n'est pas bon ou a expiré. Vérifie-le, ou demande un nouveau code.");
      session=data.session; await loadData();
    }
  };
}
async function loadData(){
  uid = session.user.id;
  renderBoot();
  try{
    const [p,d,c] = await Promise.all([
      sb.from("profils").select("data").eq("user_id", uid).maybeSingle(),
      sb.from("documents").select("id,data"),
      sb.from("clients").select("id,data")
    ]);
    const e = p.error||d.error||c.error; if(e) throw e;
    profil = p.data ? p.data.data : null;
    docs = (d.data||[]).map(r=>r.data).sort((x,y)=>String(x.id).localeCompare(String(y.id)));
    clients = (c.data||[]).map(r=>r.data);
    synced.profil = profil ? JSON.stringify(profil) : null;
    docs.forEach(x=>synced.docs[x.id]=JSON.stringify(x));
    clients.forEach(x=>synced.clients[x.id]=JSON.stringify(x));
    writeCache();
  }catch(e){
    let cache=null; try{ cache=JSON.parse(localStorage.getItem(cacheKey())||"null"); }catch(_){}
    if(!cache){ renderBoot("Impossible de charger tes données. Vérifie ta connexion internet.", true); return; }
    profil=cache.profil; docs=cache.docs||[]; clients=cache.clients||[]; syncState="offline";
  }
  if(profil) go({name:"home"});
  else { draft = blankProfil(session.user.email); go({name:"onb", step:1}); }
}
function isStandalone(){ return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone===true; }
function installCard(){
  let hidden=false; try{ hidden = localStorage.getItem("fv_install_hide")==="1"; }catch(e){}
  if(isStandalone() || hidden) return "";
  const ios=/iPhone|iPad|iPod/.test(navigator.userAgent);
  return `<div class="install"><b>Installe Factivo sur ton écran d'accueil</b>
    <span class="lead" style="font-size:14px;margin:0">${installEvt?"Un tap, et Factivo s'ouvre comme une appli.":ios?"Dans Safari : bouton Partager, puis « Sur l'écran d'accueil ».":"Dans le menu du navigateur (⋮) : « Installer l'application » ou « Ajouter à l'écran d'accueil »."}</span>
    <div class="row2">${installEvt?'<button class="btn red small" id="inst-go">Installer</button>':"<span></span>"}<button class="linkbtn" id="inst-hide">Plus tard</button></div></div>`;
}
function bindInstall(){
  const h=document.getElementById("inst-hide"); if(h) h.onclick=()=>{ try{ localStorage.setItem("fv_install_hide","1"); }catch(e){} render(); };
  const g=document.getElementById("inst-go"); if(g) g.onclick=async()=>{ installEvt.prompt(); await installEvt.userChoice.catch(()=>{}); installEvt=null; render(); };
}
window.addEventListener("beforeinstallprompt", e=>{ e.preventDefault(); installEvt=e; if(view.name==="home") render(); });

async function boot(){
  renderBoot();
  let cfg=null;
  try{ const r=await fetch("/api/config"); cfg=await r.json(); }catch(e){}
  if(!cfg || !cfg.supabaseUrl){ renderBoot(cfg&&cfg.message ? cfg.message : "Factivo n'arrive pas à démarrer. Vérifie ta connexion internet.", true); return; }
  sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {auth:{persistSession:true, autoRefreshToken:true, detectSessionInUrl:false}});
  const {data} = await sb.auth.getSession();
  session = data.session;
  sb.auth.onAuthStateChange((ev, s)=>{ if(s) session=s; });
  if(!session){ go({name:"login", step:"email"}); return; }
  await loadData();
}
if("serviceWorker" in navigator) window.addEventListener("load", ()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}));
boot();

})();
