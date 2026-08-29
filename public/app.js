
const STORAGE_KEY="healthTrackerBetaCacheV1";
const STATE_VERSION=1;
const todayKey=()=>new Date().toLocaleDateString("en-CA");
const fmtNum=(n,d=2)=>Number(n||0).toLocaleString("en-US",{maximumFractionDigits:d});
const uid=p=>`${p}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const attr=v=>String(v??"").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const dateObj=s=>new Date(`${s}T12:00:00`);

const defaultSchedule={
  0:[["8:00 AM","Wake + Hydrate","16 oz"],["9:00 AM","Protein Shake",""],["1:00 PM","Lunch",""],["4:00 PM","Protein Snack",""],["7:00 PM","Dinner",""],["9:00 PM","Kitchen Closed",""],["Any time","Weekly Reset / Meal Prep",""]],
  1:[["6:30 AM","Wake + Hydrate","16 oz"],["7:00 AM","30-Min Walk",""],["9:00 AM","Protein Shake","100 g protein by noon"],["1:00 PM","Lean Lunch",""],["4:00 PM","Protein Snack",""],["7:00 PM","Dinner",""],["9:00 PM","Kitchen Closed / Fast Starts",""]],
  2:[["7:00 AM","Hydrate","16 oz"],["9:00 AM","Hydrate","16 oz"],["12:00 PM","Hydrate","16 oz"],["3:00 PM","Hydrate","16 oz"],["6:00 PM","Hydrate","16 oz"],["8:00 PM","Herbal Tea / Hydrate","16 oz"]],
  3:[["6:30 AM","Wake + Weigh In","Weigh before eating"],["7:00 AM","30-Min Walk",""],["9:00 AM","Fast Ends + Protein Shake","100 g protein by noon"],["1:00 PM","Lean Lunch",""],["4:00 PM","Protein Snack",""],["7:00 PM","Dinner",""],["9:00 PM","Kitchen Closed",""]],
  4:[["6:30 AM","Wake + Hydrate","16 oz"],["7:00 AM","30-Min Walk",""],["9:00 AM","Protein Shake","100 g protein by noon"],["1:00 PM","Lean Lunch",""],["4:00 PM","Protein Snack",""],["7:00 PM","Dinner",""],["9:00 PM","Kitchen Closed",""]],
  5:[["6:30 AM","Wake + Hydrate","16 oz"],["7:00 AM","30-Min Walk",""],["9:00 AM","Protein Shake","100 g protein by noon"],["1:00 PM","Lean Lunch",""],["4:00 PM","Protein Snack",""],["7:00 PM","Dinner",""],["9:00 PM","Kitchen Closed",""]],
  6:[["8:00 AM","Wake + Hydrate","16 oz"],["9:00 AM","Protein Shake",""],["1:00 PM","Lunch",""],["4:00 PM","Protein Snack",""],["7:00 PM","Dinner",""],["9:00 PM","Kitchen Closed",""]]
};

const stateDefault={
  health:{daily:{},weighIns:[],foods:[],recipes:[],water:{},goalWeight:150,startWeight:0,tuesdayDone:{},checkoffLog:[]},
  schedule:structuredClone(defaultSchedule),
  scheduleItems:[]
};

let state=loadLocalState(),scheduleOpen=true,selectedHealthDate=todayKey(),currentUser=null,remoteReady=false,saveTimer=null,syncStatus="Local cache";
state.schedule=state.schedule||structuredClone(defaultSchedule);
state.scheduleItems=state.scheduleItems||[];
state.health={...structuredClone(stateDefault.health),...(state.health||{})};
state.health.daily=state.health.daily||{};state.health.foods=state.health.foods||[];state.health.water=state.health.water||{};
state.health.weighIns=state.health.weighIns||[];state.health.tuesdayDone=state.health.tuesdayDone||{};
state.health.checkoffLog=state.health.checkoffLog||[];state.health.recipes=state.health.recipes||[];
normalizeWednesdayWeighIns();

if(!state.scheduleItems.length){
  Object.entries(state.schedule||{}).forEach(([day,items])=>(items||[]).forEach(item=>state.scheduleItems.push({
    id:uid("sched"),title:item[1]||"",time:item[0]||"",note:item[2]||"",category:"Health",days:[Number(day)],repeatWeekly:true,source:"default"
  })));
}

function loadLocalState(){try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));return saved?.state?{...structuredClone(stateDefault),...saved.state}:structuredClone(stateDefault)}catch{return structuredClone(stateDefault)}}
function persistLocal(){localStorage.setItem(STORAGE_KEY,JSON.stringify({version:STATE_VERSION,state,updatedAt:new Date().toISOString()}))}
function save(){persistLocal();render();queueRemoteSave()}
function queueRemoteSave(){if(!remoteReady)return;clearTimeout(saveTimer);syncStatus="Saving…";renderSyncStatus();saveTimer=setTimeout(saveRemoteState,450)}
async function saveRemoteState(){try{const res=await fetch("/api/state",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({version:STATE_VERSION,state})});if(!res.ok)throw new Error();syncStatus="Saved"}catch{syncStatus="Offline cache · save pending"}renderSyncStatus()}
async function hydrateRemote(){
  try{
    const sessionRes=await fetch("/api/session");if(!sessionRes.ok)throw new Error("Cloudflare Access sign-in is not configured yet.");
    currentUser=(await sessionRes.json()).user;
    const stateRes=await fetch("/api/state");if(!stateRes.ok)throw new Error("Could not load saved tracker data.");
    const payload=await stateRes.json();
    if(payload?.state){
      state={...structuredClone(stateDefault),...payload.state};
      state.health={...structuredClone(stateDefault.health),...(state.health||{})};state.scheduleItems=state.scheduleItems||[];
      normalizeWednesdayWeighIns();persistLocal();
    }
    remoteReady=true;syncStatus="Saved";render();
  }catch(err){remoteReady=false;syncStatus="Local beta preview";q("#auth-note").textContent=err.message;render()}
}
const q=s=>document.querySelector(s),qs=s=>[...document.querySelectorAll(s)];
function modal(title,eyebrow,fields,onSubmit,submit="Save"){const d=q("#modal"),form=q("#modal-form");q("#modal-title").textContent=title;q("#modal-eyebrow").textContent=eyebrow;q("#modal-submit").textContent=submit;q("#modal-fields").innerHTML=fields;form.onsubmit=e=>{e.preventDefault();onSubmit(new FormData(form));d.close();save()};d.showModal()}
function render(){renderSchedule();renderHealth();renderSidebar();renderSyncStatus()}
function renderSyncStatus(){const el=q("#sync-status");if(!el)return;el.textContent=syncStatus;el.className=`sync-status ${syncStatus==="Saved"?"good":syncStatus.includes("Offline")?"warn":""}`}
function renderSidebar(){q("#sidebar-context").innerHTML=`<h4>Health Streak</h4><div class="big">🔥 ${healthStreak()}</div><span class="muted">days</span>`;q("#user-name").textContent=currentUser?.name||currentUser?.email||"Beta Tester";q("#user-email").textContent=currentUser?.email||"Cloudflare Access sign-in"}

function scheduleTimeSortKey(value){
  const s=String(value||"").trim();
  if(!s)return 99999;
  const first=s.split("–")[0].split("-")[0].trim();
  const m=first.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if(!m)return 90000;
  let h=Number(m[1]),min=Number(m[2]||0),ampm=(m[3]||"").toUpperCase();
  if(ampm==="PM"&&h!==12)h+=12;
  if(ampm==="AM"&&h===12)h=0;
  return h*60+min;
}

function scheduleItemsForDay(day){
  return (state.scheduleItems||[])
    .filter(x=>(x.days||[]).includes(day))
    .sort((a,b)=>scheduleTimeSortKey(a.time)-scheduleTimeSortKey(b.time)||String(a.title).localeCompare(String(b.title)));
}

function renderSchedule(){
  const now=new Date(),day=now.getDay(),dayName=now.toLocaleDateString("en-US",{weekday:"long"}),tuesday=day===2;
  const items=scheduleItemsForDay(day);

  q("#schedule-date").textContent=`Today is ${now.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"})}`;

  q("#schedule-summary").innerHTML=`
    <div class="schedule-feature">
      <div>
        <strong>${tuesday?"☀ Take-Off Tuesday":day===3?"⚖ Weigh-In Wednesday":day===0?"↻ Sunday Reset":dayName}</strong>
        <div class="muted">${tuesday?"Health focus: hydration only. Family, work, trading, and personal schedule items still appear.":"Food Intake Day"}</div>
      </div>
      <span class="pill">${tuesday?"Hydrate Only":"Daily Plan"}</span>
    </div>
    <div class="muted" style="margin-top:10px">◷ ${items.length} items scheduled</div>`;

  q("#schedule-expanded").innerHTML=scheduleOpen?`
    <div class="schedule-items">
      ${items.map(x=>`<div class="schedule-item schedule-item-manage">
        <span>${x.time||"Any time"}</span>
        <div><strong>${x.title}</strong><small>${x.category||"Personal"}${x.note?` · ${x.note}`:""}</small></div>
        <button class="schedule-item-edit" data-id="${x.id}" type="button">✎</button>
      </div>`).join("")||'<div class="empty-state">No schedule items for today.</div>'}
    </div>
    <div class="schedule-week">
      ${[0,1,2,3,4,5,6].filter(d=>d!==day).map(d=>{
        const n=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d];
        return `<div class="schedule-day">
          <div><strong>${n}</strong><div class="muted">${d===2?"Hydrate Only":"Food Intake Day"}</div></div>
          <span>${scheduleItemsForDay(d).length} items ›</span>
        </div>`;
      }).join("")}
    </div>`:"";

  q("#schedule-chevron").textContent=scheduleOpen?"⌃":"⌄";
  qs(".schedule-item-edit").forEach(btn=>btn.onclick=()=>scheduleItemModal(btn.dataset.id));
}
q("#schedule-toggle").onclick=()=>{scheduleOpen=!scheduleOpen;renderSchedule()};
q("#add-schedule-item").onclick=()=>scheduleItemModal();

q("#edit-schedule").onclick=()=>{
  const items=[...(state.scheduleItems||[])].sort((a,b)=>String(a.title).localeCompare(String(b.title)));
  modal("Edit Weekly Schedule","DAILY SCHEDULE",`
    <div class="full-field schedule-editor-list">
      ${items.map(x=>`<button type="button" class="schedule-editor-row" data-id="${x.id}">
        <span><strong>${x.title}</strong><small>${scheduleDayLabels(x.days)} · ${x.time||"Any time"} · ${x.category||"Personal"}</small></span>
        <em>✎</em>
      </button>`).join("")||'<div class="empty-state">No recurring items yet.</div>'}
    </div>`,
    ()=>{},
    "Done"
  );
  setTimeout(()=>qs(".schedule-editor-row").forEach(b=>b.onclick=()=>{q("#modal").close();scheduleItemModal(b.dataset.id)}),0);
};

function scheduleDayLabels(days=[]){
  const labels=["Su","M","T","W","R","F","Sa"];
  return days.slice().sort((a,b)=>a-b).map(d=>labels[d]).join(" · ");
}

function scheduleItemModal(id=null){
  const item=(state.scheduleItems||[]).find(x=>x.id===id);
  const selected=new Set(item?.days||[]);

  modal(item?"Edit Schedule Item":"Add Schedule Item","DAILY SCHEDULE",`
    <label class="full-field">Schedule item<input name="title" value="${item?.title||""}" placeholder="Kids to School" required></label>
    <label>Time<input name="time" value="${item?.time||""}" placeholder="7:15 AM"></label>
    <label>Category<select name="category">
      ${["Health","Family","Work","Personal","Other"].map(x=>`<option ${item?.category===x?"selected":""}>${x}</option>`).join("")}
    </select></label>
    <label class="full-field">Days
      <div class="schedule-day-picker">
        ${[1,2,3,4,5,6,0].map(d=>`<label class="day-chip"><input type="checkbox" name="days" value="${d}" ${selected.has(d)?"checked":""}><span>${["Su","M","T","W","R","F","Sa"][d]}</span></label>`).join("")}
      </div>
    </label>
    <label class="full-field">Optional note<input name="note" value="${item?.note||""}" placeholder="School drop-off, chart review, appointment..."></label>
    <label class="full-field schedule-repeat-row"><input name="repeatWeekly" type="checkbox" ${item?.repeatWeekly!==false?"checked":""}><span>Repeat weekly</span></label>
    ${item?'<button type="button" class="danger-btn full-field" id="schedule-delete-item">Delete Schedule Item</button>':""}`,
    f=>{
      const days=f.getAll("days").map(Number);
      if(!days.length){alert("Select at least one day.");return;}
      const rec={
        id:item?.id||uid("sched"),
        title:String(f.get("title")||"").trim(),
        time:String(f.get("time")||"").trim(),
        category:f.get("category")||"Personal",
        days,
        note:String(f.get("note")||"").trim(),
        repeatWeekly:f.get("repeatWeekly")==="on"
      };
      if(item)Object.assign(item,rec);else state.scheduleItems.push(rec);
    }
  );

  if(item){
    setTimeout(()=>{
      const del=q("#schedule-delete-item");
      if(del)del.onclick=()=>{
        if(confirm(`Delete "${item.title}" from the schedule?`)){
          state.scheduleItems=state.scheduleItems.filter(x=>x.id!==item.id);
          q("#modal").close();
          save();
        }
      };
    },0);
  }
}


function isTuesdayKey(k){return dateObj(k).getDay()===2}
function healthLogForDate(k){return (state.health.checkoffLog||[]).find(x=>x.date===k)}
function healthStreak(){let count=0,d=new Date();d.setDate(d.getDate()-1);while(true){const k=d.toLocaleDateString("en-CA"),isTue=isTuesdayKey(k),log=healthLogForDate(k);const complete=isTue?Boolean(state.health.tuesdayDone[k]&&log?.type==="takeoff"):Boolean(log?.type==="checkoff"&&Number(log.score)===7);if(!complete)break;count++;d.setDate(d.getDate()-1)}return count}
const healthRules=["Low Carb / No Grains","Approved Fats","Lean → Lean → Balanced","No Alcohol","30-Min Walk","Kitchen Closed","Sleep"];
const healthRuleNotes=["≤25 g carbs and no grains","No seed oils; approved fats only","Lean before 4 PM; balanced after 4 PM","No alcohol","At least one dedicated 30-minute walk","No food after 9 PM","7–8 hours of sleep"];
function isWednesdayKey(k){return dateObj(k).getDay()===3}

function normalizeWednesdayWeighIns(){
  state.health.weighIns=state.health.weighIns||[];
  let changed=false;
  state.health.weighIns.forEach(w=>{
    if(!w?.date)return;
    const d=dateObj(w.date);
    // Older prototype builds could accidentally save Tuesday as the weekly weigh-in date.
    // Move Tuesday entries to the immediately following Wednesday.
    if(d.getDay()===2){
      d.setDate(d.getDate()+1);
      const wed=d.toLocaleDateString("en-CA");
      const existing=state.health.weighIns.find(x=>x!==w&&x.date===wed);
      if(!existing){
        w.date=wed;
        w.updatedAt=new Date().toISOString();
        changed=true;
      }
    }
  });
  if(changed)localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
}

function sortedWeighIns(){return [...(state.health.weighIns||[])].filter(x=>x&&x.date).sort((a,b)=>a.date.localeCompare(b.date))}
function weighInForDate(k){if(!isWednesdayKey(k))return null;return (state.health.weighIns||[]).find(x=>x.date===k)}
function previousWeighIn(k){return sortedWeighIns().filter(x=>x.date<k).slice(-1)[0]||null}
function weightChangeFor(k){const cur=weighInForDate(k),prev=previousWeighIn(k);if(!cur||!prev)return null;return Number(prev.weight)-Number(cur.weight)}
function weightChangeLabel(change){if(change===null||Number.isNaN(change))return "First weigh-in";if(Math.abs(change)<0.05)return "No change";return change>0?`Lost ${fmtNum(change,1)} lb`:`Gained ${fmtNum(Math.abs(change),1)} lb`}
function nextWednesdayAfter(k){const d=dateObj(k);do{d.setDate(d.getDate()+1)}while(d.getDay()!==3);return d.toLocaleDateString("en-CA")}
function shiftHealthDate(days){const d=dateObj(selectedHealthDate);d.setDate(d.getDate()+days);const next=d.toLocaleDateString("en-CA");if(next<=todayKey()){selectedHealthDate=next;renderHealth()}}
function upsertHealthLog(entry){const i=(state.health.checkoffLog||[]).findIndex(x=>x.date===entry.date);if(i>=0)state.health.checkoffLog[i]={...state.health.checkoffLog[i],...entry};else state.health.checkoffLog.push(entry)}
function healthHistoryModal(){
  const rows=[...(state.health.checkoffLog||[])].sort((a,b)=>b.date.localeCompare(a.date));
  const weights=[...sortedWeighIns()].sort((a,b)=>b.date.localeCompare(a.date));
  const d=q("#modal");q("#modal-title").textContent="Health Results Log";q("#modal-eyebrow").textContent="HEALTH HISTORY";q("#modal-submit").textContent="Close";
  q("#modal-fields").innerHTML=`
    <div class="full-field health-log-section"><h3>Daily Results</h3><p class="muted">Submitted check-offs are saved by date. Selecting an old date on the Health page lets you correct and resubmit that day.</p>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Result</th><th>Submitted</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${dateObj(x.date).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric"})}</td><td>${x.type==="takeoff"?"Take-Off Tuesday":"7 Check-Offs"}</td><td>${x.type==="takeoff"?(x.completed?"Completed":"Not completed"):`${x.score}/7`}</td><td>${x.submittedAt?new Date(x.submittedAt).toLocaleString():"—"}</td></tr>`).join("")||'<tr><td colspan="4">No submitted health results yet.</td></tr>'}</tbody></table></div>
    </div>
    <div class="full-field health-log-section"><h3>Wednesday Weight Log</h3><p class="muted">Wednesday weigh-ins are saved by date and can be edited if you need to correct an entry.</p>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Weight</th><th>Change vs prior</th><th>Action</th></tr></thead><tbody>${weights.map(x=>{const ch=weightChangeFor(x.date);return`<tr><td>${dateObj(x.date).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric"})}</td><td>${fmtNum(x.weight,1)} lb</td><td class="${ch===null?"muted":ch>=0?"green":"red"}">${weightChangeLabel(ch)}</td><td><button class="ghost-btn health-edit-weight-modal" data-date="${x.date}" type="button">Edit Weight</button></td></tr>`}).join("")||'<tr><td colspan="4">No Wednesday weigh-ins submitted yet.</td></tr>'}</tbody></table></div>
    </div>`;
  q("#modal-form").onsubmit=e=>{e.preventDefault();d.close()};d.showModal();setTimeout(()=>qs(".health-edit-weight-modal").forEach(b=>b.onclick=()=>{d.close();editWeightModal(b.dataset.date)}),0);
}


function proteinForDate(k){
  return (state.health.foods||[]).filter(x=>x.date===k).reduce((s,x)=>s+Number(x.protein||0),0);
}
function healthLogDates(){
  const dates=new Set();
  (state.health.checkoffLog||[]).forEach(x=>x?.date&&dates.add(x.date));
  (state.health.foods||[]).forEach(x=>x?.date&&dates.add(x.date));
  (state.health.weighIns||[]).forEach(x=>x?.date&&dates.add(x.date));
  Object.keys(state.health.tuesdayDone||{}).forEach(k=>dates.add(k));
  return [...dates].sort((a,b)=>b.localeCompare(a));
}
function healthLogRow(k){
  const log=healthLogForDate(k);
  const tuesday=isTuesdayKey(k);
  const weight=isWednesdayKey(k)?weighInForDate(k):null;
  const change=weightChangeFor(k);
  return {
    date:k,
    protein:proteinForDate(k),
    score:log?.type==="checkoff"?Number(log.score||0):null,
    takeoff:tuesday?(log?.type==="takeoff"?Boolean(log.completed):Boolean(state.health.tuesdayDone?.[k])):null,
    weight,
    change
  };
}
function editWeightModal(date){
  if(!isWednesdayKey(date))return alert("Weight entries are only stored on Wednesdays.");
  const existing=weighInForDate(date);
  const prev=previousWeighIn(date);
  const label=dateObj(date).toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"});
  modal(existing?"Edit Wednesday Weight":"Add Wednesday Weight","WEEKLY WEIGHT",
    `<div class="full-field weight-submit-note"><strong>${label}</strong><span class="muted">${prev?`Previous: ${fmtNum(prev.weight,1)} lb on ${dateObj(prev.date).toLocaleDateString("en-US",{month:"short",day:"numeric"})}`:"This is your first logged weigh-in."}</span></div>
     <label class="full-field">Weight (lb)<input name="weight" type="number" step=".1" min="1" value="${existing?fmtNum(existing.weight,1):""}" required autofocus></label>
     <div class="full-field muted">You can correct this weight later. The weekly loss/gain will recalculate automatically.</div>`,
    f=>{
      const weight=Number(f.get("weight"));
      if(!weight)return;
      if(existing){
        existing.weight=weight;
        existing.updatedAt=new Date().toISOString();
        existing.locked=false;
      }else{
        state.health.weighIns.push({id:uid("weight"),date,weight,submittedAt:new Date().toISOString(),locked:false});
      }
    },
    existing?"Save Weight":"Submit Weight"
  );
}
function renderFullHealthLog(){
  const dates=healthLogDates();
  return `<div class="card health-full-log">
    <div class="section-title"><div><span class="eyebrow">HEALTH HISTORY</span><h3>Full Health Log</h3><p class="muted">Protein, daily 7-point score, Take-Off Tuesday, and Wednesday weigh-ins in one timeline.</p></div></div>
    <div class="table-wrap padded"><table class="health-log-table">
      <thead><tr><th>Date</th><th>Protein</th><th>7 Tasks</th><th>Take-Off Tuesday</th><th>Weight</th><th>Weekly Change</th><th>Action</th></tr></thead>
      <tbody>${dates.map(k=>{
        const x=healthLogRow(k);
        return `<tr>
          <td><strong>${dateObj(k).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric"})}</strong></td>
          <td><span class="${x.protein>=200?"green":x.protein?"":"muted"}">${fmtNum(x.protein,0)} g</span></td>
          <td>${x.score===null?'<span class="muted">—</span>':`<strong class="${x.score===7?"green":""}">${x.score}/7</strong>`}</td>
          <td>${x.takeoff===null?'<span class="muted">—</span>':x.takeoff?'<span class="status good">✓ Completed</span>':'<span class="status bad">Not completed</span>'}</td>
          <td>${x.weight?`<strong>${fmtNum(x.weight.weight,1)} lb</strong>`:'<span class="muted">—</span>'}</td>
          <td class="${x.change===null?"muted":x.change>=0?"green":"red"}">${x.weight?weightChangeLabel(x.change):"—"}</td>
          <td>${x.weight&&isWednesdayKey(k)?`<button class="ghost-btn health-edit-weight" data-date="${k}" type="button">Edit Weight</button>`:""}</td>
        </tr>`;
      }).join("")||'<tr><td colspan="7" class="muted">No health results logged yet.</td></tr>'}</tbody>
    </table></div>
  </div>`;
}

function renderHealth(){
  const root=q("#page-health"),entryDate=selectedHealthDate,isTuesday=isTuesdayKey(entryDate),isWednesday=isWednesdayKey(entryDate),d=state.health.daily[entryDate]||{checks:{}},score=healthRules.filter((_,i)=>d.checks?.[i]).length,foods=state.health.foods.filter(x=>x.date===entryDate),protein=foods.reduce((s,x)=>s+Number(x.protein||0),0),carbs=foods.reduce((s,x)=>s+Number(x.carbs||0),0),fat=foods.reduce((s,x)=>s+Number(x.fat||0),0),water=Number(state.health.water[entryDate]||0),latestWeight=[...sortedWeighIns()].sort((a,b)=>b.date.localeCompare(a.date))[0],selectedWeight=weighInForDate(entryDate),selectedWeightChange=weightChangeFor(entryDate),submitted=healthLogForDate(entryDate);
  const dateLabel=dateObj(entryDate).toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"});
  root.innerHTML=`<div class="page-head"><div><div class="health-title-row"><h1>Health Tracker</h1><span class="build-badge">Health Log v1.9.1</span></div><p>Viewing <strong>${dateLabel}</strong></p><p class="muted">Use the date controls to catch up or correct an earlier day.</p></div><div class="page-actions health-date-actions"><button class="ghost-btn" id="health-prev">← Previous</button><input id="health-date" type="date" value="${entryDate}" max="${todayKey()}"><button class="ghost-btn" id="health-next" ${entryDate>=todayKey()?"disabled":""}>Next →</button><button class="ghost-btn" id="health-today" ${entryDate===todayKey()?"disabled":""}>Today</button><button class="ghost-btn" id="health-history">⌁ View Health Log</button></div></div>
<div class="health-top"><div class="card padded">${isTuesday?`<div class="health-score"><div><h3>Take-Off Tuesday</h3><p class="muted">The 7 daily check-offs are inactive on Tuesdays. Confirm only whether you completed the fast.</p></div><div><span class="score-chip">FAST DAY</span></div></div><div class="takeoff-confirm"><label class="check-row"><input type="checkbox" id="tuesday-complete" ${state.health.tuesdayDone[entryDate]?"checked":""}><strong>Completed Take-Off Tuesday</strong><small>Monday 9 PM → Wednesday 9 AM</small></label></div><button class="primary-btn" id="submit-health" style="margin-top:14px">${submitted?"Update Tuesday Log":"Submit Tuesday"}</button>${submitted?`<p class="muted health-submitted-note">Last submitted ${new Date(submitted.submittedAt).toLocaleString()}</p>`:""}`:`<div class="health-score"><div><h3>Daily 7 Check-Offs</h3><p class="muted">Check off each item completed for this date, then submit it to the log.</p></div><div><span class="score-chip">${score} / 7 ✓</span><div style="text-align:right;margin-top:6px">${Math.round(score/7*100)}%</div></div></div><div class="check-list">${healthRules.map((r,i)=>`<label class="check-row"><input type="checkbox" class="health-check" data-i="${i}" ${d.checks?.[i]?"checked":""}><strong>${i+1}. ${r}</strong><small>${healthRuleNotes[i]}</small></label>`).join("")}</div><button class="primary-btn" id="submit-health" style="margin-top:14px">${submitted?"Update Check-Off Log":"Submit Check-Offs"}</button>${submitted?`<p class="muted health-submitted-note">Logged ${submitted.score}/7 · last submitted ${new Date(submitted.submittedAt).toLocaleString()}</p>`:""}`}</div>
<div style="display:grid;gap:14px"><div class="card padded weight-card"><div class="weight-card-head"><div><h3>Weigh-In Wednesday</h3><p class="muted">${isWednesday?(selectedWeight?"This week's weight is logged. You can edit it if you need to correct an entry.":"Enter this week's Wednesday weight."):"Weight entry opens on Wednesdays."}</p></div><button class="ghost-btn" id="weight-log-btn">View Weight Log</button></div><div style="text-align:center;padding:14px">${isWednesday?selectedWeight?`<span class="muted">Submitted Weight</span><div class="weight-value">${fmtNum(selectedWeight.weight,1)} <small>lbs</small></div><div class="weight-change ${selectedWeightChange===null?"muted":selectedWeightChange>=0?"green":"red"}">${weightChangeLabel(selectedWeightChange)}</div><button class="outline-btn" id="edit-weight" style="margin-top:12px">Edit Weight</button><div class="muted" style="margin-top:8px">Next weigh-in: ${dateObj(nextWednesdayAfter(entryDate)).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</div>`:`<span class="eyebrow">WEIGH-IN REQUIRED</span><div class="weight-prompt">Add your Wednesday weight</div><button class="primary-btn" id="add-weight" style="margin-top:12px">+ Add Weight</button>`:`<span class="muted">Latest Weigh-In</span><div class="weight-value">${latestWeight?fmtNum(latestWeight.weight,1):"—"} <small>lbs</small></div><div class="muted">${latestWeight?dateObj(latestWeight.date).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"No weigh-in yet"}</div><div class="muted" style="margin-top:12px">Next weigh-in opens on Wednesday.</div>`}</div></div>
<div class="card padded"><h3>${isTuesday?"Tuesday Status":"Take-Off Tuesday"}</h3><p class="muted">${isTuesday?"This date is handled by the Take-Off Tuesday confirmation.":"Tuesday fasting completion is stored by date in your health log."}</p><div style="text-align:center;padding:14px"><div class="${state.health.tuesdayDone[entryDate]?"green":"muted"}" style="font-size:19px;font-weight:800">${isTuesday?(state.health.tuesdayDone[entryDate]?"✓ Completed":"○ Not submitted"):"Select a Tuesday to review"}</div></div></div></div></div>
<div class="food-health-grid"><div class="card"><div class="tabs"><button class="tab active">Food Log</button><button class="tab" id="recipes-tab">Recipes</button></div><div class="padded"><div class="section-title" style="padding:0"><div><h3>Food diary — ${dateObj(entryDate).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</h3><p class="muted">Food, macros, and water follow the selected date so you can backfill missed days.</p></div><button class="primary-btn" id="add-food">+ Add Food</button></div><div>${foods.length?foods.map(x=>`<div class="food-row"><div><strong>${x.name}</strong><div class="muted">${x.meal||"Food"}</div></div><div class="macro-pills"><span>${x.protein}P</span><span>${x.fat}F</span><span>${x.carbs}C</span></div><button class="ghost-btn delete-food" data-id="${x.id}">×</button></div>`).join(""):'<div class="empty-state">No food logged for this date.</div>'}</div></div></div>
<div class="card padded"><h3>Nutrition Summary</h3><div class="mini-list"><div class="mini-row"><span>Protein</span><strong class="green">${fmtNum(protein,0)} / 200 g</strong></div><div class="mini-row"><span>Carbs</span><strong class="${carbs<=25?"green":"red"}">${fmtNum(carbs,0)} / 25 g</strong></div><div class="mini-row"><span>Fat</span><strong>${fmtNum(fat,0)} g</strong></div><div class="mini-row"><span>Water</span><strong class="blue">${water} / 128 oz</strong></div></div><div class="bar blue" style="margin-top:10px"><div style="width:${Math.min(100,water/128*100)}%"></div></div><div class="page-actions" style="margin-top:12px"><button class="ghost-btn water-add" data-oz="16">+16 oz</button><button class="ghost-btn water-add" data-oz="32">+32 oz</button></div></div></div>${renderFullHealthLog()}`;

  q("#health-prev").onclick=()=>shiftHealthDate(-1);q("#health-next").onclick=()=>shiftHealthDate(1);q("#health-today").onclick=()=>{selectedHealthDate=todayKey();renderHealth()};q("#health-date").onchange=e=>{if(e.target.value&&e.target.value<=todayKey()){selectedHealthDate=e.target.value;renderHealth()}};q("#health-history").onclick=()=>healthHistoryModal();
  qs(".health-check").forEach(c=>c.onchange=()=>{const x=state.health.daily[entryDate]||{checks:{}};x.checks=x.checks||{};x.checks[c.dataset.i]=c.checked;state.health.daily[entryDate]=x;persistLocal();renderHealth();queueRemoteSave()});
  if(q("#tuesday-complete"))q("#tuesday-complete").onchange=e=>{state.health.tuesdayDone[entryDate]=e.target.checked;persistLocal();renderHealth();queueRemoteSave()};
  q("#submit-health").onclick=()=>{const now=new Date().toISOString();if(isTuesday){const completed=Boolean(state.health.tuesdayDone[entryDate]);if(!completed&&!confirm("Submit Tuesday as not completed?"))return;upsertHealthLog({date:entryDate,type:"takeoff",completed,submittedAt:now})}else{upsertHealthLog({date:entryDate,type:"checkoff",score,checks:{...(state.health.daily[entryDate]?.checks||{})},submittedAt:now})}save()};
  if(q("#weight-log-btn"))q("#weight-log-btn").onclick=()=>healthHistoryModal();
  if(q("#add-weight"))q("#add-weight").onclick=()=>editWeightModal(entryDate);
  if(q("#edit-weight"))q("#edit-weight").onclick=()=>editWeightModal(entryDate);
  q("#add-food").onclick=()=>modal("Add Food","FOOD LOG",`<label>Date<input name="date" type="date" value="${entryDate}" max="${todayKey()}" required></label><label>Meal<select name="meal"><option>Shake</option><option>Lunch</option><option>Snack</option><option>Dinner</option></select></label><label>Food / Recipe<select name="recipe"><option value="">Custom food</option>${allRecipes().map(r=>`<option value="${r.id}">${r.name}</option>`).join("")}</select></label><label class="full-field">Food name<input name="name"></label><label>Protein g<input name="protein" type="number" step=".1"></label><label>Fat g<input name="fat" type="number" step=".1"></label><label>Carbs g<input name="carbs" type="number" step=".1"></label>`,f=>{const rr=allRecipes().find(x=>x.id===f.get("recipe"));state.health.foods.push({id:uid("food"),date:f.get("date")||entryDate,meal:f.get("meal"),name:rr?.name||f.get("name")||"Food",protein:rr?.protein||Number(f.get("protein")||0),fat:rr?.fat||Number(f.get("fat")||0),carbs:rr?.carbs||Number(f.get("carbs")||0)})});
  qs(".delete-food").forEach(b=>b.onclick=()=>{state.health.foods=state.health.foods.filter(x=>x.id!==b.dataset.id);save()});q("#recipes-tab").onclick=()=>recipeLibraryModal();qs(".water-add").forEach(b=>b.onclick=()=>{state.health.water[entryDate]=Number(state.health.water[entryDate]||0)+Number(b.dataset.oz);save()});qs(".health-edit-weight").forEach(b=>b.onclick=()=>editWeightModal(b.dataset.date));
}


function allRecipes(){
  const custom=(state.health.recipes||[]).map(r=>({...r,custom:true,category:r.category||"Custom",timing:r.timing||"Custom",servings:r.servings||1,ingredients:r.ingredients||[],instructions:r.instructions||[]}));
  return [...(typeof PRELOADED_RECIPES!=="undefined"?PRELOADED_RECIPES:[]),...custom];
}
function recipeMacro(v){return v===null||v===undefined?"—":fmtNum(v,0)}
function recipeLibraryModal(){
  const d=q("#modal");
  q("#modal-title").textContent="Recipe Library";q("#modal-eyebrow").textContent="PRELOADED HEALTH RECIPES";q("#modal-submit").textContent="Close";
  q("#modal-fields").innerHTML=`<div class="full-field recipe-library-tools"><input id="recipe-search" placeholder="Search recipes, poultry, seafood..."><select id="recipe-category"><option value="">All categories</option>${[...new Set(allRecipes().map(r=>r.category))].map(x=>`<option>${x}</option>`).join("")}</select><button type="button" class="outline-btn" id="add-custom-recipe">+ Custom Recipe</button></div><div class="full-field" id="recipe-library-list"></div>`;
  q("#modal-form").onsubmit=e=>{e.preventDefault();d.close()}; d.showModal();
  const draw=()=>{const term=q("#recipe-search").value.toLowerCase(),cat=q("#recipe-category").value;const rows=allRecipes().filter(r=>(!cat||r.category===cat)&&(!term||`${r.name} ${r.category} ${r.timing}`.toLowerCase().includes(term)));q("#recipe-library-list").innerHTML=`<div class="recipe-grid">${rows.map(r=>`<button type="button" class="recipe-card" data-id="${r.id}"><span class="recipe-category">${r.category}</span><strong>${r.name}</strong><small>${r.timing}</small><div class="macro-pills"><span>${recipeMacro(r.protein)}P</span><span>${recipeMacro(r.fat)}F</span><span>${recipeMacro(r.carbs)}C</span></div><em>${r.servings||1} servings · View recipe →</em></button>`).join("")||'<div class="empty-state">No recipes match.</div>'}</div>`;qs(".recipe-card").forEach(b=>b.onclick=()=>recipeDetailModal(b.dataset.id));};
  q("#recipe-search").oninput=draw;q("#recipe-category").onchange=draw;q("#add-custom-recipe").onclick=()=>customRecipeModal();draw();
}
function recipeDetailModal(id){
  const r=allRecipes().find(x=>x.id===id);if(!r)return;
  const healthIng=(r.ingredients||[]).filter(x=>x.version==="Health");const familyIng=(r.ingredients||[]).filter(x=>x.version==="Family");
  const healthSteps=(r.instructions||[]).filter(x=>x.version==="Health").sort((a,b)=>a.step-b.step);const familySteps=(r.instructions||[]).filter(x=>x.version==="Family").sort((a,b)=>a.step-b.step);
  const fmtIng=x=>`${x.amount??""} ${x.unit||""} ${x.name}`.trim()+`${x.optional?" (optional)":""}`;
  const d=q("#modal");q("#modal-title").textContent=r.name;q("#modal-eyebrow").textContent=`${r.category} · ${r.timing}`;q("#modal-submit").textContent="Back to Recipes";
  q("#modal-fields").innerHTML=`<div class="full-field recipe-detail"><div class="recipe-detail-head"><span class="score-chip">${r.servings||1} servings</span><div class="macro-pills"><span>${recipeMacro(r.protein)}P</span><span>${recipeMacro(r.fat)}F</span><span>${recipeMacro(r.carbs)}C</span></div></div><p class="muted">${r.healthNotes||r.notes||""}</p><div class="recipe-columns"><section><h3>Health Version Ingredients</h3><ul>${healthIng.map(x=>`<li>${fmtIng(x)}${x.notes?` <small>— ${x.notes}</small>`:""}</li>`).join("")||'<li>Ingredients being finalized.</li>'}</ul></section><section><h3>Health Instructions</h3><ol>${healthSteps.map(x=>`<li>${x.text}</li>`).join("")||'<li>Instructions being finalized.</li>'}</ol></section></div>${familyIng.length?`<details><summary>Family / original structure</summary><div class="recipe-columns"><ul>${familyIng.map(x=>`<li>${fmtIng(x)}</li>`).join("")}</ul><ol>${familySteps.map(x=>`<li>${x.text}</li>`).join("")}</ol></div></details>`:""}${r.source?`<p><a class="recipe-source" href="${r.source}" target="_blank" rel="noopener">View original recipe source ↗</a></p>`:""}<button type="button" class="primary-btn" id="log-recipe-food">+ Log One Serving Today</button></div>`;
  q("#modal-form").onsubmit=e=>{e.preventDefault();recipeLibraryModal()};d.showModal();q("#log-recipe-food").onclick=()=>{state.health.foods.push({id:uid("food"),date:selectedHealthDate,meal:"Recipe",name:r.name,protein:Number(r.protein||0),fat:Number(r.fat||0),carbs:Number(r.carbs||0)});save();d.close()};
}
function customRecipeModal(){modal("Add Custom Recipe","HEALTH RECIPES",`<label class="full-field">Recipe name<input name="name" required></label><label>Category<input name="category" placeholder="Poultry / Beef / Seafood"></label><label>Servings<input name="servings" type="number" value="1"></label><label>Protein g<input name="protein" type="number" step=".1"></label><label>Fat g<input name="fat" type="number" step=".1"></label><label>Carbs g<input name="carbs" type="number" step=".1"></label><label class="full-field">Notes<textarea name="notes"></textarea></label>`,f=>state.health.recipes.push({id:uid("recipe"),name:f.get("name"),category:f.get("category")||"Custom",servings:Number(f.get("servings")||1),protein:Number(f.get("protein")||0),fat:Number(f.get("fat")||0),carbs:Number(f.get("carbs")||0),notes:f.get("notes")}))}



q("#modal-close").onclick=q("#modal-cancel").onclick=()=>q("#modal").close();
q("#export-page").onclick=()=>{const blob=new Blob([JSON.stringify({version:STATE_VERSION,user:currentUser,state},null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`health-tracker-backup-${todayKey()}.json`;a.click();URL.revokeObjectURL(a.href)};
q("#feedback-btn").onclick=()=>modal("Beta Feedback","HELP US IMPROVE",`<label>Type<select name="type"><option>Bug</option><option>Idea</option><option>Confusing</option><option>Other</option></select></label><label class="full-field">What happened or what should change?<textarea name="message" rows="5" required></textarea></label>`,f=>{fetch("/api/feedback",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({type:f.get("type"),message:f.get("message")})}).catch(()=>{})},"Send Feedback");
render();hydrateRemote();
