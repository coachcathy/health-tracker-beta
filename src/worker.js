const JSON_HEADERS={"content-type":"application/json; charset=utf-8","cache-control":"no-store"};
export default{async fetch(request,env,ctx){const url=new URL(request.url);if(url.pathname.startsWith("/api/")){try{return await handleApi(request,url,env,ctx)}catch(err){console.error(err);return json({error:"Unexpected server error."},500)}}return env.ASSETS.fetch(request)}};
async function handleApi(request,url,env,ctx){
 if(!env.DB)return json({error:"D1 database is not configured."},503);
 const identity=await getIdentity(request,ctx);if(!identity?.email)return json({error:"Sign-in required."},401);
 const user=await getOrCreateUser(env,identity);
 if(url.pathname==="/api/session"&&request.method==="GET")return json({user:{id:user.id,email:identity.email,name:identity.name||user.display_name||""}});
 if(url.pathname==="/api/state"&&request.method==="GET"){const row=await env.DB.prepare("SELECT state_version,state_json,updated_at FROM user_state WHERE user_id=?").bind(user.id).first();return row?json({version:Number(row.state_version||1),state:JSON.parse(row.state_json),updatedAt:row.updated_at}):json({version:1,state:null,updatedAt:null})}
 if(url.pathname==="/api/state"&&request.method==="PUT"){const body=await readJson(request);if(!body||typeof body.state!=="object")return json({error:"A state object is required."},400);const serialized=JSON.stringify(body.state);if(serialized.length>1500000)return json({error:"Tracker data is too large."},413);const now=new Date().toISOString(),version=Math.max(1,Number(body.version||1));await env.DB.prepare("INSERT INTO user_state(user_id,state_version,state_json,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET state_version=excluded.state_version,state_json=excluded.state_json,updated_at=excluded.updated_at").bind(user.id,version,serialized,now).run();return json({ok:true,updatedAt:now})}
 if(url.pathname==="/api/feedback"&&request.method==="POST"){const body=await readJson(request),message=String(body?.message||"").trim(),type=String(body?.type||"Other").slice(0,40);if(!message)return json({error:"Feedback message is required."},400);await env.DB.prepare("INSERT INTO feedback(id,user_id,feedback_type,message,created_at) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),user.id,type,message.slice(0,5000),new Date().toISOString()).run();return json({ok:true},201)}
 if(url.pathname==="/api/admin/summary"&&request.method==="GET"){if(!isAdmin(identity.email,env))return json({error:"Forbidden."},403);const users=await env.DB.prepare("SELECT u.id,u.display_name,i.email,s.updated_at FROM users u LEFT JOIN identities i ON i.user_id=u.id AND i.provider='cloudflare-access' LEFT JOIN user_state s ON s.user_id=u.id ORDER BY COALESCE(s.updated_at,u.created_at) DESC").all();return json({users:users.results||[]})}
 return json({error:"Not found."},404);
}
async function getIdentity(request,ctx){
  if(ctx.access){
    const identity=await ctx.access.getIdentity();
    if(identity?.email)return {
      email:String(identity.email).trim().toLowerCase(),
      name:String(identity.name||"").trim()
    };
  }

  const cookie=request.headers.get("cookie")||"";
  if(!cookie.includes("CF_Authorization="))return null;

  try{
    const identityUrl=new URL("/cdn-cgi/access/get-identity",request.url);
    const res=await fetch(identityUrl.toString(),{
      method:"GET",
      headers:{cookie}
    });
    if(!res.ok)return null;
    const identity=await res.json();
    if(!identity?.email)return null;
    return {
      email:String(identity.email).trim().toLowerCase(),
      name:String(identity.name||"").trim()
    };
  }catch(err){
    console.error("Access identity lookup failed",err);
    return null;
  }
}
async function getOrCreateUser(env,identity){const provider="cloudflare-access",externalId=identity.email,now=new Date().toISOString();let row=await env.DB.prepare("SELECT u.id,u.display_name FROM identities i JOIN users u ON u.id=i.user_id WHERE i.provider=? AND i.external_id=?").bind(provider,externalId).first();if(row)return row;const userId=crypto.randomUUID();await env.DB.batch([env.DB.prepare("INSERT INTO users(id,display_name,created_at,updated_at) VALUES(?,?,?,?)").bind(userId,identity.name||"",now,now),env.DB.prepare("INSERT INTO identities(id,user_id,provider,external_id,email,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(),userId,provider,externalId,identity.email,now,now)]);return{id:userId,display_name:identity.name||""}}
function isAdmin(email,env){return String(env.ADMIN_EMAILS||"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean).includes(String(email||"").toLowerCase())}
async function readJson(request){try{return await request.json()}catch{return null}}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:JSON_HEADERS})}
