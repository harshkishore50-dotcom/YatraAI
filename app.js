/* YatraAI — GitHub Pages friendly demo
   Live APIs: Open-Meteo (geocoding + weather), OpenStreetMap Overpass (nearby mapped places).
   Important: no secret keys are embedded. For an AI LLM endpoint, set window.YATRA_CONFIG.AI_ENDPOINT in config.js.
*/
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const state = { destination:null, weather:null, pois:[], map:null, markers:[], selectedInterests:new Set(['culture','food']), access:new Set(), lastPlan:null };

const CFG = window.YATRA_CONFIG || {
  AI_ENDPOINT: '',
  OVERPASS_ENDPOINTS: [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ]
};

function toast(message){ const el=$('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(window.__toast); window.__toast=setTimeout(()=>el.classList.remove('show'),2600); }
function setLoading(show,title='',text=''){ $('#loadingOverlay').hidden=!show; if(title) $('#loadingTitle').textContent=title; if(text) $('#loadingText').textContent=text; }
function esc(v=''){ return v.replace(/[&<>\"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\\':'\\\\','"':'&quot;'}[c])); }
function selectedValues(id){ return $$('#'+id+' .choice.active').map(x=>x.dataset.value); }
function weatherLabel(code){ const map={0:'Clear sky',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',48:'Rime fog',51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',61:'Light rain',63:'Rain',65:'Heavy rain',71:'Light snow',73:'Snow',75:'Heavy snow',80:'Rain showers',81:'Rain showers',82:'Heavy showers',95:'Thunderstorm',96:'Thunderstorm + hail',99:'Thunderstorm + hail'}; return map[code]||'Unknown conditions'; }
function iconFor(code){ if(code>=95)return '⛈'; if(code>=80)return '🌦'; if(code>=60)return '🌧'; if(code>=45)return '🌫'; if(code>=1)return '⛅'; return '☀'; }

async function fetchJson(url, options={}){ const r=await fetch(url,options); if(!r.ok) throw new Error(`Request failed (${r.status})`); return r.json(); }

async function geocodeDestination(query){
  const url=`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;
  const data=await fetchJson(url); if(!data.results?.length) throw new Error('Destination not found. Try a city, region or country.');
  return data.results[0];
}

async function fetchWeather(lat,lon){
  const params=new URLSearchParams({latitude:lat,longitude:lon,current:'temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m',hourly:'temperature_2m,precipitation_probability,weather_code',daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',forecast_days:'7',timezone:'auto'});
  return fetchJson(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
}

async function fetchPOIs(lat,lon){
  const query=`[out:json][timeout:20];(nwr["tourism"~"attraction|museum|gallery|viewpoint|zoo|theme_park|artwork|heritage"](around:8000,${lat},${lon});nwr["amenity"~"restaurant|cafe|marketplace"](around:5000,${lat},${lon}););out center tags;`;
  let lastErr;
  for(const endpoint of CFG.OVERPASS_ENDPOINTS){
    try{ const data=await fetchJson(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:`data=${encodeURIComponent(query)}`}); return data.elements||[]; }catch(e){lastErr=e;}
  }
  throw lastErr||new Error('Nearby place data unavailable');
}

function poiName(p){ return p.tags?.name || p.tags?.['name:en'] || p.tags?.official_name || p.tags?.brand || null; }
function poiType(p){ return p.tags?.tourism || p.tags?.amenity || 'place'; }
function poiLatLng(p){ return [p.lat ?? p.center?.lat, p.lon ?? p.center?.lon]; }
function classifyPOI(p){
  const t=poiType(p), n=(poiName(p)||'').toLowerCase(), tags=p.tags||{}; let score=0, local=false;
  if(state.selectedInterests.has('culture') && ['museum','gallery','artwork'].includes(t)) score+=5;
  if(state.selectedInterests.has('history') && (['attraction','heritage'].includes(t)||/fort|palace|temple|monument|museum|heritage/.test(n))) score+=5;
  if(state.selectedInterests.has('nature') && ['viewpoint','zoo','theme_park'].includes(t)) score+=4;
  if(state.selectedInterests.has('food') && ['restaurant','cafe','marketplace'].includes(t)) score+=5;
  if(state.selectedInterests.has('shopping') && t==='marketplace') score+=4;
  if(state.selectedInterests.has('local') && ['marketplace','cafe','restaurant'].includes(t)) score+=3;
  if(tags.shop && !tags.brand) local=true;
  if(tags.brand) score-=2;
  if(tags.opening_hours) score+=1;
  if(tags.website) score+=1;
  return {score,local};
}

function pickPOIs(){
  const clean=state.pois.filter(p=>poiName(p));
  const scored=clean.map(p=>({...p,_score:classifyPOI(p)})).sort((a,b)=>b._score.score-a._score.score);
  const picks=[]; const seen=new Set();
  for(const p of scored){ const n=poiName(p); if(seen.has(n.toLowerCase())) continue; seen.add(n.toLowerCase()); picks.push(p); if(picks.length>=18) break; }
  return picks;
}

function dayWeather(dayIndex){
  if(!state.weather?.daily) return null;
  const i=Math.min(dayIndex,state.weather.daily.time.length-1);
  return {date:state.weather.daily.time[i], code:state.weather.daily.weather_code[i], max:state.weather.daily.temperature_2m_max[i], min:state.weather.daily.temperature_2m_min[i], rain:state.weather.daily.precipitation_probability_max[i]};
}
function formatDay(dateStr){return new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'numeric'}).format(new Date(dateStr+'T00:00:00'));}

function makeItinerary(days, pace, walking, group){
  const picks=pickPOIs(); const culture=picks.filter(p=>['museum','gallery','attraction','heritage','artwork'].includes(poiType(p))); const food=picks.filter(p=>['restaurant','cafe','marketplace'].includes(poiType(p))); const nature=picks.filter(p=>['viewpoint','zoo','theme_park'].includes(poiType(p)));
  let seq=[];
  if(walking==='low' || state.access.has('wheelchair') || state.access.has('lowwalking') || state.access.has('elderly')) seq=[...culture,...food,...nature,...picks]; else seq=[...picks];
  const unique=[]; const used=new Set(); for(const p of seq){const n=poiName(p).toLowerCase(); if(!used.has(n)){used.add(n);unique.push(p);}}
  const density=pace==='relaxed'?2:pace==='packed'?4:3; let cursor=0; const out=[];
  for(let d=0; d<days; d++){
    const wd=dayWeather(d); const count=Math.min(density, Math.max(1, unique.length-cursor)); const slots=[];
    for(let s=0;s<count;s++){ const p=unique[cursor%Math.max(1,unique.length)]; cursor++; if(p) slots.push(p); }
    if(!slots.length) break;
    const times=density===2?['10:00 AM','4:00 PM']:density===3?['9:30 AM','1:00 PM','5:00 PM']:['9:00 AM','12:00 PM','3:30 PM','7:00 PM'];
    out.push({day:d+1,date:wd,weather:wd,stops:slots.map((p,i)=>({time:times[i],name:poiName(p),type:poiType(p),latLng:poiLatLng(p),tags:p.tags||{},local:p._score?.local,reason:reasonFor(p,wd,i),crowdRisk:wd?.rain>=65?'Low outdoors / weather-sensitive':'Unknown crowd',source:'OpenStreetMap / community mapped'}))});
  }
  return out;
}
function reasonFor(p,wd,i){
  const t=poiType(p); if(wd?.rain>=65 && ['viewpoint','zoo','theme_park'].includes(t)) return 'Outdoor activity moved earlier because rain probability is elevated.';
  if(state.access.has('lowwalking')||state.access.has('wheelchair')||walkingValue==='low') return 'Selected to keep the day practical for lower walking needs.';
  if(p._score?.local) return 'Mapped local place; surfaced to support independent businesses and community life.';
  if(t==='museum'||t==='gallery') return 'Matches your culture preference and works well as a weather-safe stop.';
  return 'Selected from live mapped places based on your trip preferences.';
}
let walkingValue='medium';

function renderResults(plan){
  $('#results').hidden=false; $('#results').scrollIntoView({behavior:'smooth',block:'start'});
  $('#resultsTitle').textContent=`${plan.destination.name} · ${plan.days} days`;
  $('#resultsSubtitle').textContent=`${plan.group} • ${plan.pace} pace • ${plan.languageLabel}`;
  const c=plan.weather?.current;
  $('#heroWeather').textContent=`${c?Math.round(c.temperature_2m)+'°C · '+weatherLabel(c.weather_code):'Live weather unavailable'}`;
  $('#dataRibbon').innerHTML=`
    <div class="ribbon-card"><div class="label">Weather</div><strong>${c?iconFor(c.weather_code)+' '+Math.round(c.temperature_2m)+'°C':'Unavailable'}</strong><span>${c?esc(weatherLabel(c.weather_code)):'Could not verify live conditions'}</span></div>
    <div class="ribbon-card"><div class="label">Rain risk</div><strong>${plan.weather?.daily?.precipitation_probability_max?.[0] ?? '—'}%</strong><span>Next 24h</span></div>
    <div class="ribbon-card"><div class="label">Places found</div><strong>${plan.poiCount}</strong><span>Mapped nearby</span></div>
    <div class="ribbon-card"><div class="label">Trust posture</div><strong>${plan.poiCount? 'Source-labelled':'Check-needed'}</strong><span>No invented opening hours</span></div>`;
  const quality=plan.poiCount>=6?'Live + sourced':plan.poiCount>=2?'Live + partial':'Limited live data'; $('#planQuality').textContent=quality;
  $('#itinerary').innerHTML=plan.itinerary.map(day=>`<div class="day-block"><div class="day-header"><div><div class="eyebrow">DAY ${day.day}</div><div class="day-title">${esc(day.date)}</div></div><div class="day-meta">${day.weather?`${iconFor(day.weather.code)} ${Math.round(day.weather.max)}° / ${Math.round(day.weather.min)}° · ${day.weather.rain}% rain`:''}</div></div>${day.stops.map(stop=>`<div class="stop"><div class="time">${stop.time}</div><div class="stop-main"><h4>${esc(stop.name)}</h4><p>${esc(stop.reason)}</p><div class="badge-row"><span class="badge green">${esc(sourceBadge(stop.tags))}</span>${stop.local?'<span class="badge green">Local-first</span>':''}${stop.tags.opening_hours?'<span class="badge">Opening hours mapped</span>':'<span class="badge amber">Hours not verified</span>'}</div></div><div class="source-mini">${stop.source}</div></div>`).join('')}</div>`).join('') || `<div class="day-block"><strong>We couldn't build a complete itinerary from live place data.</strong><p>Please retry or use a broader destination query.</p></div>`;
  renderMap(plan); renderSources(plan); renderLocal(plan);
}
function sourceBadge(tags){ if(tags.website) return 'Mapped + website'; if(tags.opening_hours) return 'Mapped data'; return 'Community mapped'; }

function renderSources(plan){
  const items=[
    ['Destination','Open-Meteo Geocoding','Live location lookup for the destination.','LIVE API'],
    ['Weather','Open-Meteo Forecast','Current + daily forecast used to shape the plan.','LIVE API'],
    ['Places','OpenStreetMap / Overpass','Nearby attractions, food and place tags. Community mapped; not an official guarantee.','COMMUNITY DATA'],
    ['Opening hours','Only shown when a source record contains opening_hours','Never guessed. Missing hours are explicitly marked.','UNCERTAINTY RULE'],
    ['AI layer','Optional endpoint','Connect your own LLM endpoint in config.js without exposing an API key in GitHub Pages.','OPTIONAL']
  ];
  $('#sourcesList').innerHTML=items.map(x=>`<div class="source-item"><strong>${x[0]}</strong><p>${x[1]} — ${x[2]}</p><span class="source-tag">${x[3]}</span></div>`).join('');
}
function renderMap(plan){
  if(!state.map){ state.map=L.map('map',{scrollWheelZoom:false}).setView([plan.destination.latitude,plan.destination.longitude],12); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(state.map);} else {state.map.setView([plan.destination.latitude,plan.destination.longitude],12); state.markers.forEach(m=>m.remove());}
  state.markers=[]; state.markers.push(L.marker([plan.destination.latitude,plan.destination.longitude]).addTo(state.map).bindPopup(`<strong>${esc(plan.destination.name)}</strong><br>Trip destination`));
  const all=plan.itinerary.flatMap(d=>d.stops).slice(0,12); const bounds=[[plan.destination.latitude,plan.destination.longitude]];
  all.forEach((s,i)=>{ if(!s.latLng?.[0])return; const m=L.marker(s.latLng).addTo(state.map).bindPopup(`<strong>${esc(s.name)}</strong><br>${esc(s.source)}`); state.markers.push(m); bounds.push(s.latLng); });
  if(bounds.length>1) state.map.fitBounds(bounds,{padding:[20,20],maxZoom:13}); setTimeout(()=>state.map.invalidateSize(),250);
}
function renderLocal(plan){
  const locals=plan.itinerary.flatMap(d=>d.stops).filter(x=>x.local).slice(0,6);
  $('#localCards').innerHTML=locals.length?locals.map(x=>`<article class="local-card"><div class="local-icon">🌱</div><h3>${esc(x.name)}</h3><p>Surfaced as a locally mapped place because it fits your preferences.</p><div class="local-meta"><span>Community mapped</span><span>${esc(poiType({tags:x.tags}))}</span></div></article>`).join(''):`<div class="empty-local"><span>🌱</span><strong>No independent/local signals were confidently identified.</strong><small>That is okay: YatraAI won't pretend a place is locally owned without a supporting signal.</small></div>`;
}

async function buildPlan(){
  const destination=$('#destination').value.trim(); if(!destination){toast('Enter a destination first.'); return;}
  walkingValue=$('#walking').value; state.selectedInterests=new Set(selectedValues('interestChips')); state.access=new Set(selectedValues('accessChips'));
  const days=Number($('#days').value), pace=$('#pace').value, group=$('#group').value, language=$('#tripLanguage').value;
  setLoading(true,'Building your plan…','Geocoding the destination.');
  try{
    const geo=await geocodeDestination(destination); state.destination=geo;
    setLoading(true,'Building your plan…','Fetching live weather.');
    let weather=null; try{weather=await fetchWeather(geo.latitude,geo.longitude);}catch(e){console.warn(e);}
    state.weather=weather;
    setLoading(true,'Building your plan…','Finding nearby mapped places.');
    let pois=[]; try{pois=await fetchPOIs(geo.latitude,geo.longitude);}catch(e){console.warn(e);toast('Place data is temporarily limited; the plan will use what is available.');}
    state.pois=pois;
    setLoading(true,'Building your plan…','Balancing preferences, accessibility and live conditions.');
    const itinerary=makeItinerary(days,pace,walkingValue,group);
    const plan={destination:geo,days,pace,group,languageLabel:language==='hi'?'हिन्दी':language==='bn'?'বাংলা':language==='ta'?'தமிழ்':language==='mr'?'मराठी':'English',weather,pois,itinerary,poiCount:pois.filter(p=>poiName(p)).length}; state.lastPlan=plan;
    renderResults(plan);
    if(CFG.AI_ENDPOINT){ // Optional LLM enrichment; front-end safe only when the endpoint is your own public/serverless proxy.
      try{ await enrichWithAI(plan); }catch(e){ console.warn('AI endpoint unavailable; using deterministic planner.',e); }
    }
  }catch(e){console.error(e);toast(e.message||'Something went wrong.');}
  finally{setLoading(false);}
}
async function enrichWithAI(plan){
  const payload={destination:plan.destination.name, days:plan.days, preferences:[...state.selectedInterests],accessibility:[...state.access],weather:plan.weather?.current||null,places:plan.pois.slice(0,20).map(p=>({name:poiName(p),type:poiType(p),tags:p.tags}))};
  const data=await fetchJson(CFG.AI_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); if(data?.itinerary) {plan.ai= data.itinerary; toast('Optional AI layer connected.');}
}
async function refreshPlan(){ if(!state.lastPlan){toast('Plan a trip first.'); return;} $('#results').scrollIntoView({behavior:'smooth'}); setLoading(true,'Re-checking your plan…','Fetching fresh weather and mapped places.'); try{ state.weather=await fetchWeather(state.destination.latitude,state.destination.longitude); state.pois=await fetchPOIs(state.destination.latitude,state.destination.longitude); state.lastPlan.weather=state.weather; state.lastPlan.pois=state.pois; state.lastPlan.itinerary=makeItinerary(state.lastPlan.days,state.lastPlan.pace,walkingValue,state.lastPlan.group); state.lastPlan.poiCount=state.pois.filter(p=>poiName(p)).length; renderResults(state.lastPlan); toast('Plan refreshed from live APIs.'); }catch(e){toast('Live refresh failed. Keeping the last verified snapshot.');} finally{setLoading(false);} }

$$('#interestChips .choice, #accessChips .choice').forEach(btn=>btn.addEventListener('click',()=>btn.classList.toggle('active')));
$('#plannerForm').addEventListener('submit',e=>{e.preventDefault();buildPlan();});
$('#heroPlanBtn').addEventListener('click',()=>$('#destination').focus() || $('#planner').scrollIntoView({behavior:'smooth'}));
$('#topPlanBtn').addEventListener('click',()=>$('#planner').scrollIntoView({behavior:'smooth'}));
$('#refreshBtn').addEventListener('click',refreshPlan);
$('#replanBtn').addEventListener('click',refreshPlan);
$('#startTripBtn').addEventListener('click',()=>toast('Live Trip mode: use this moment to demo responsive re-planning.'));
$('#languageBtn').addEventListener('click',()=>{const s=$('#tripLanguage');s.value=s.value==='en'?'hi':'en';toast(`Planner language: ${s.options[s.selectedIndex].text}`);});

// Smooth-scroll the planner when the hero button is triggered.
$('#heroPlanBtn').addEventListener('click',()=>$('#planner').scrollIntoView({behavior:'smooth'}));
