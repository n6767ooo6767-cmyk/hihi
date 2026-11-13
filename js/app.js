const $=id=>document.getElementById(id);
const cfg=window.ONEPLACE_CONFIG||{};
const client=window.supabase?.createClient(cfg.SUPABASE_URL||"",cfg.SUPABASE_PUBLISHABLE_KEY||"");
let me=null,profile=null,sound=false,pendingMessage="";
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function toast(t){$("toast").textContent=t;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),2800)}
function beep(f=650){if(!sound)return;try{const c=new AudioContext(),o=c.createOscillator(),g=c.createGain();o.frequency.value=f;g.gain.value=.04;o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+.12);o.onended=()=>c.close()}catch{}}
function status(t){$("authStatus").textContent=t}
function showAuth(){ $("auth").classList.remove("hidden");$("dashboard").classList.add("hidden"); }
function showDashboard(){ $("auth").classList.add("hidden");$("dashboard").classList.remove("hidden"); }
async function getProfile(){const {data,error}=await client.from("profiles").select("*").eq("id",me.id).single();if(error)throw error;profile=data}
async function loadDashboard(){
 await getProfile();showDashboard();
 $("welcome").textContent="Привет, "+profile.username+"!";$("roleLabel").textContent=({admin:"Администратор",guard:"Охранник",player:"Игрок"})[profile.role]||"Игрок";
 $("balance").textContent=profile.balance+" "+(profile.role==="admin"?"гугла":"игровых");
 $("adminTools").classList.toggle("hidden",profile.role!=="admin");
 $("guardTools").classList.toggle("hidden",profile.role!=="guard"&&profile.role!=="admin");
 $("staffParcels").classList.toggle("hidden",profile.role==="player");
 const [tickets,messages,parcels]=await Promise.all([
  client.from("tickets").select("*").eq("owner_id",me.id).order("created_at",{ascending:false}),
  client.from("messages").select("*").eq("receiver_id",me.id).order("created_at",{ascending:false}),
  client.from("parcels").select("*").eq("sender_id",me.id).order("created_at",{ascending:false})
 ]);
 if(tickets.error)throw tickets.error;if(messages.error)throw messages.error;if(parcels.error)throw parcels.error;
 $("ticketCount").textContent=tickets.data.length;$("messageCount").textContent=messages.data.length;$("parcelCount").textContent=parcels.data.length;
 $("tickets").innerHTML=tickets.data.length?tickets.data.map(t=>'<div class="item item-row"><div><b>'+esc(t.title)+'</b><small>'+esc(t.status)+' · '+new Date(t.created_at).toLocaleDateString("ru-RU")+'</small><small>Код: '+esc(t.qr_code)+'</small></div><div class="qr" id="qr-'+t.id+'"></div></div>').join(""):"Пока билетов нет.";
 tickets.data.forEach(t=>{const el=$("qr-"+t.id);if(el&&window.QRCode)new QRCode(el,{text:t.qr_code,width:82,height:82})});
 $("messages").innerHTML=messages.data.length?messages.data.map(m=>'<div class="item message"><b>OnePlace</b><small>'+new Date(m.created_at).toLocaleString("ru-RU")+'</small>'+esc(m.message)+'</div>').join(""):"Сообщений пока нет.";
 $("parcels").innerHTML=parcels.data.length?parcels.data.map(p=>'<div class="item"><b>'+esc(p.receiver_name)+'</b><small>'+esc(p.tracking_code)+' · '+esc(p.status)+'</small>'+esc(p.description||"")+'</div>').join(""):"Посылок пока нет.";
 if(profile.role==="admin")await loadPlayers();
 if(profile.role==="admin"||profile.role==="guard")await loadAllParcels();
}
async function loadPlayers(){const {data,error}=await client.from("profiles").select("id,username").eq("role","player").order("username");if(error)throw error;for(const id of ["ticketOwner","messageOwner"]){$(id).innerHTML=data.map(u=>'<option value="'+u.id+'">'+esc(u.username)+'</option>').join("")}}
async function loadAllParcels(){const {data,error}=await client.from("parcels").select("id,receiver_name,tracking_code,status,description,created_at").order("created_at",{ascending:false}).limit(50);if(error){$("allParcels").textContent=error.message;return}$("allParcels").innerHTML=data.length?data.map(p=>'<div class="item"><b>'+esc(p.receiver_name)+'</b><small>'+esc(p.tracking_code)+' · '+esc(p.status)+'</small><p>'+esc(p.description||"")+'</p><label>Статус<select data-parcel="'+p.id+'"><option value="accepted" '+(p.status==="accepted"?"selected":"")+'>Принята</option><option value="in_transit" '+(p.status==="in_transit"?"selected":"")+'>В пути</option><option value="ready" '+(p.status==="ready"?"selected":"")+'>Готова к выдаче</option><option value="delivered" '+(p.status==="delivered"?"selected":"")+'>Выдана</option></select></label></div>').join(""):"Пока посылок нет.";document.querySelectorAll("[data-parcel]").forEach(s=>s.onchange=async()=>{const {error}=await client.rpc("staff_update_parcel",{p_parcel_id:s.dataset.parcel,p_status:s.value});if(error){toast(error.message);return}toast("Статус посылки обновлён");await loadAllParcels()})}
async function refresh(){const {data:{session}}=await client.auth.getSession();me=session?.user||null;if(me){try{await loadDashboard()}catch(e){toast("Ошибка загрузки: "+e.message);showAuth()}}else showAuth()}
$("loginForm").onsubmit=async e=>{e.preventDefault();const {data,error}=await client.auth.signInWithPassword({email:$("loginEmail").value,password:$("loginPassword").value});if(error){status(error.message);return}me=data.user;await refresh();beep(740)};
$("signupForm").onsubmit=async e=>{e.preventDefault();const {data,error}=await client.auth.signUp({email:$("signupEmail").value,password:$("signupPassword").value,options:{data:{username:$("signupName").value.trim()},emailRedirectTo:window.location.origin}});if(error){status(error.message);return}status(data.session?"Аккаунт создан!":"Проверь почту и подтверди регистрацию, затем войди.");beep(800)};
$("logoutBtn").onclick=async()=>{await client.auth.signOut();me=null;profile=null;showAuth();toast("Ты вышел из аккаунта")};
$("parcelForm").onsubmit=async e=>{e.preventDefault();const {error}=await client.from("parcels").insert({sender_id:me.id,receiver_name:$("parcelReceiver").value.trim(),description:$("parcelDescription").value.trim(),status:"accepted"});if(error){toast(error.message);return}e.target.reset();toast("Посылка зарегистрирована!");await loadDashboard()};
$("ticketForm").onsubmit=async e=>{e.preventDefault();const {error}=await client.rpc("admin_create_ticket",{p_owner_id:$("ticketOwner").value,p_title:$("ticketTitle").value.trim(),p_price:Number($("ticketPrice").value)});if(error){toast(error.message);return}e.target.reset();toast("Билет создан");await loadDashboard()};
$("messageForm").onsubmit=async e=>{e.preventDefault();pendingMessage=$("messageBody").value.trim();if(!pendingMessage)return;if(!confirm("Отправить это сообщение игроку?"))return;const {error}=await client.rpc("admin_send_message",{p_receiver_id:$("messageOwner").value,p_message:pendingMessage});if(error){toast(error.message);return}e.target.reset();toast("Сообщение отправлено");beep(900)};
$("scanForm").onsubmit=async e=>{e.preventDefault();const {data,error}=await client.rpc("guard_use_ticket",{p_qr_code:$("scanCode").value.trim()});if(error){toast(error.message);return}toast(data||"Билет проверен");$("scanCode").value="";beep(900)};
$("soundBtn").onclick=()=>{sound=!sound;$("soundBtn").textContent=sound?"🔊 Звук включён":"🔇 Звук";beep(850);toast(sound?"Звуки включены":"Звуки выключены")};
$("notifyBtn").onclick=async()=>{if(!("Notification"in window)){toast("Уведомления не поддерживаются");return}const p=await Notification.requestPermission();toast(p==="granted"?"Уведомления разрешены":"Разрешение не получено")};
$("openAuth").onclick=()=>$("auth").scrollIntoView({behavior:"smooth"});
if(!client){status("Проверь настройки Supabase в js/config.js")}else{status("Подключено к Supabase. Можно войти или зарегистрироваться.");client.auth.onAuthStateChange(()=>setTimeout(refresh,0));refresh().catch(e=>status(e.message))}
