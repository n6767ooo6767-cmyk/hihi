// OnePlace Cloudflare Worker
// D1 binding required: variable name DB, database: hihi
// Secret required for first admin setup: ADMIN_SETUP_SECRET
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};
const json = (data, status=200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type":"application/json; charset=utf-8", ...cors }
});
const enc = new TextEncoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const hex = (buf) => [...new Uint8Array(buf)].map(x=>x.toString(16).padStart(2,"0")).join("");
async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({name:"PBKDF2",salt:enc.encode(salt),iterations:120000,hash:"SHA-256"},key,256);
  return hex(bits);
}
function id(){ return crypto.randomUUID(); }
async function body(req){ try{return await req.json()}catch{return {}} }
async function currentUser(req, env) {
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token) return null;
  return await env.DB.prepare(
    "SELECT u.id,u.username,u.role,u.balance FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>datetime('now')"
  ).bind(await passwordHash(token,"oneplace-session-v1")).first();
}
async function handle(req, env) {
  if(req.method==="OPTIONS") return new Response(null,{headers:cors});
  const url=new URL(req.url), path=url.pathname;
  if(!env.DB) return json({error:"D1 binding DB is missing. Bind database hihi as DB."},500);
  if(path==="/api/health") return json({ok:true,app:"OnePlace",database:"connected"});
  if(path==="/api/register" && req.method==="POST"){
    const b=await body(req), username=String(b.username||"").trim(), password=String(b.password||"");
    if(!/^[a-zA-Z0-9_]{3,20}$/.test(username)||password.length<8) return json({error:"Username: 3-20 letters/numbers/_. Password: at least 8 characters."},400);
    const exists=await env.DB.prepare("SELECT id FROM users WHERE username=?").bind(username).first();
    if(exists) return json({error:"This username is already taken."},409);
    const uid=id(), salt=id(), hash=await passwordHash(password,salt);
    await env.DB.prepare("INSERT INTO users(id,username,password_hash,password_salt,role,balance) VALUES(?,?,?,?,'player',1000)").bind(uid,username,hash,salt).run();
    return json({ok:true,message:"Account created. Please sign in."},201);
  }
  if(path==="/api/login" && req.method==="POST"){
    const b=await body(req), username=String(b.username||"").trim(), password=String(b.password||"");
    const user=await env.DB.prepare("SELECT id,username,password_hash,password_salt,role,balance FROM users WHERE username=?").bind(username).first();
    if(!user || await passwordHash(password,user.password_salt)!==user.password_hash) return json({error:"Incorrect username or password."},401);
    const token=b64(crypto.getRandomValues(new Uint8Array(32)));
    const tokenHash=await passwordHash(token,"oneplace-session-v1");
    await env.DB.prepare("INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,datetime('now','+7 days'))").bind(id(),user.id,tokenHash).run();
    return json({token,user:{id:user.id,username:user.username,role:user.role,balance:user.balance}});
  }
  if(path==="/api/setup-admin" && req.method==="POST"){
    if(!env.ADMIN_SETUP_SECRET) return json({error:"Set ADMIN_SETUP_SECRET Worker secret first."},503);
    const b=await body(req);
    if(b.setupSecret!==env.ADMIN_SETUP_SECRET) return json({error:"Not allowed."},403);
    const username=String(b.username||"admin").trim(), password=String(b.password||"");
    if(!/^[a-zA-Z0-9_]{3,20}$/.test(username)||password.length<8) return json({error:"Invalid username or password (minimum 8 characters)."},400);
    const exists=await env.DB.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").first();
    if(exists) return json({error:"Admin already exists."},409);
    const uid=id(),salt=id(),hash=await passwordHash(password,salt);
    await env.DB.prepare("INSERT INTO users(id,username,password_hash,password_salt,role,balance) VALUES(?,?,?,?,'admin',32)").bind(uid,username,hash,salt).run();
    return json({ok:true,message:"Admin account created."},201);
  }
  if(path==="/api/me" && req.method==="GET"){
    const user=await currentUser(req,env); return user?json({user}):json({error:"Sign in required."},401);
  }
  if(path==="/api/messages" && req.method==="GET"){
    const user=await currentUser(req,env); if(!user)return json({error:"Sign in required."},401);
    const rows=await env.DB.prepare("SELECT id,message,is_read,created_at FROM messages WHERE receiver_id=? ORDER BY created_at DESC LIMIT 100").bind(user.id).all();
    return json({messages:rows.results||[]});
  }
  if(path==="/api/messages" && req.method==="POST"){
    const user=await currentUser(req,env); if(!user)return json({error:"Sign in required."},401);
    if(user.role!=="admin")return json({error:"Admin only."},403);
    const b=await body(req), receiver=String(b.receiverId||""), message=String(b.message||"").trim();
    if(!receiver||!message||message.length>2000)return json({error:"Choose a player and enter a message (up to 2000 characters)."},400);
    const target=await env.DB.prepare("SELECT id FROM users WHERE id=? AND role='player'").bind(receiver).first();
    if(!target)return json({error:"Player not found."},404);
    await env.DB.prepare("INSERT INTO messages(id,sender_id,receiver_id,message) VALUES(?,?,?,?)").bind(id(),user.id,receiver,message).run();
    return json({ok:true,message:"Message sent."},201);
  }
  return json({error:"Not found."},404);
}
export default { fetch: (req,env) => handle(req,env).catch(()=>json({error:"Server error."},500)) };
