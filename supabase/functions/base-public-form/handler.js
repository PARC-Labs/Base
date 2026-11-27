// Public anonymous form proxy. The only database writer is a restricted RPC
// executed with the server-side key. Never return PostgREST errors or PII.
const ALLOWED_ORIGINS=new Set(['https://parc-labs.github.io','http://localhost:8080'])
const PRACTICES=new Set(['unspecified','artist','designer','architect','researcher','technologist','maker','student','enthusiast','other'])
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/
const encoder=new TextEncoder()

function response(origin,status,payload){
 return new Response(JSON.stringify(payload),{status,headers:{
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
  Vary:'Origin',...(ALLOWED_ORIGINS.has(origin)?{
   'Access-Control-Allow-Origin':origin,
   'Access-Control-Allow-Methods':'POST, OPTIONS',
   'Access-Control-Allow-Headers':'content-type, apikey, authorization',
   'Access-Control-Max-Age':'600'
  }:{})
 }})
}
function clientIdentifier(req){
 // Prefer the platform's client address. For forwarded chains take the
 // closest address added by the reverse proxy, not the user-supplied first hop.
 const raw=req.headers.get('cf-connecting-ip')||req.headers.get('x-real-ip')
  ||req.headers.get('x-forwarded-for')?.split(',').at(-1)||'unavailable'
 return raw.trim().slice(0,128)
}
export function createPublicFormHandler({baseUrl,serviceRoleKey,fetchImpl=fetch}){
 const keyPromise=serviceRoleKey?crypto.subtle.importKey(
  'raw',encoder.encode(serviceRoleKey),{name:'HMAC',hash:'SHA-256'},false,['sign']
 ):null
 const digest=async value=>{
  const key=await keyPromise
  const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value)))
  return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('')
 }
 return async req=>{
  const origin=req.headers.get('origin')||''
  if(!ALLOWED_ORIGINS.has(origin))return response(origin,403,{error:'Origin not allowed.'})
  if(req.method==='OPTIONS')return response(origin,200,{ok:true})
  if(req.method!=='POST')return response(origin,405,{error:'Method not allowed.'})
  if(!baseUrl||!serviceRoleKey)return response(origin,503,{error:'Registration is temporarily unavailable.'})
  if(!/^application\/json(?:;|$)/i.test(req.headers.get('content-type')||''))
   return response(origin,415,{error:'Expected JSON.'})
  const declared=Number(req.headers.get('content-length')||0)
  if(declared>4096)return response(origin,413,{error:'Request is too large.'})
  let input
  try{
   const body=await req.text()
   if(body.length>4096) return response(origin,413,{error:'Request is too large.'})
   input=JSON.parse(body)
  }catch{return response(origin,400,{error:'Invalid submission.'})}
  if(!input||typeof input!=='object'||Array.isArray(input))
   return response(origin,400,{error:'Invalid submission.'})
  const kind=input.kind
  const email=typeof input.email==='string'?input.email.trim().toLowerCase():''
  if(!['signup','privacy'].includes(kind)||email.length>254||email.length<6||!EMAIL.test(email))
   return response(origin,400,{error:'Enter a valid email address.'})
  const practice=typeof input.practice==='string'?input.practice:'unspecified'
  const intendedUse=typeof input.intendedUse==='string'?input.intendedUse.trim():''
  const rawSource=String(input.source||'direct').toLowerCase()
  const source=/^[a-z0-9_-]{1,40}$/.test(rawSource)?rawSource:'direct'
  if(kind==='signup'&&(input.consent!==true||!PRACTICES.has(practice)||intendedUse.length>280))
   return response(origin,400,{error:'Check your form details and consent.'})
  if(kind==='privacy'&&!['withdraw','access','correct'].includes(input.requestType))
   return response(origin,400,{error:'Choose a valid request type.'})
  try{
   const [fingerprint,emailHash]=await Promise.all([
    digest('ip:'+clientIdentifier(req)),
    digest('email:'+email)
   ])
   const upstream=await fetchImpl(baseUrl.replace(/\/$/,'')+'/rest/v1/rpc/base_submit_public_form',{
    method:'POST',
    headers:{'Content-Type':'application/json','apikey':serviceRoleKey,'Authorization':'Bearer '+serviceRoleKey},
    body:JSON.stringify({
     p_kind:kind,p_email:email,p_fingerprint:fingerprint,p_email_hash:emailHash,
     p_practice:practice,p_intended_use:intendedUse,p_source:source,
     p_request_type:kind==='privacy'?input.requestType:null
    }),
    signal:AbortSignal.timeout(8000)
   })
   if(upstream.ok)return response(origin,200,{ok:true})
   // P0001 comes from the atomic database quota check; do not leak raw SQL.
   let problem
   try{problem=await upstream.json()}catch{}
   if(problem?.code==='P0001')return response(origin,429,{error:'Too many requests. Try again later.'})
   if(problem?.code==='22023')return response(origin,400,{error:'Invalid submission.'})
   return response(origin,503,{error:'Unable to submit at the moment. Try again later.'})
  }catch{
   return response(origin,503,{error:'Unable to reach registration. Try again later.'})
  }
 }
}
