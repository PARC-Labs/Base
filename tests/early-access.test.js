import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'

const memory=new Map()
const root={innerHTML:'',addEventListener(){}}
const handlers=new Map()
globalThis.localStorage={
 getItem:key=>memory.get(key)||null,
 setItem:(key,val)=>memory.set(key,val),
 removeItem:key=>memory.delete(key)
}
globalThis.location={origin:'https://parc-labs.github.io',pathname:'/Base/',search:'',hash:'#early-access'}
globalThis.document={title:'',getElementById:()=>root,addEventListener(){}}
globalThis.window={addEventListener:(kind,fn)=>handlers.set(kind,fn)}
globalThis.scrollTo=()=>{}
await import('../src/app.js')
const db=await import('../src/store.js')
async function goto(path){
 location.hash='#'+path
 handlers.get('hashchange')()
 await new Promise(resolve=>setImmediate(resolve))
 return root.innerHTML
}

test('early-access route is a standalone, minimal opt-in form',async()=>{
 const html=await goto('early-access')
 assert.match(html,/<h1>EARLY ACCESS<\/h1>/)
 assert.match(html,/data-form="early-access"/)
 assert.match(html,/name="email"[^>]*required/)
 assert.match(html,/name="practice"/)
 assert.match(html,/name="intendedUse"/)
 assert.match(html,/name="consent"[^>]*required/)
 assert.match(html,/REGISTER INTEREST/)
 assert.match(html,/href="#privacy"/)
 assert.doesNotMatch(html,/data-form="signin"/)
 assert.doesNotMatch(html,/No Spaces yet/)
})

test('privacy route has an accessible data-rights request flow',async()=>{
 const html=await goto('privacy')
 assert.match(html,/<h1>PRIVACY<\/h1>/)
 assert.match(html,/data-form="privacy-request"/)
 assert.match(html,/name="requestType"/)
 assert.match(html,/value="withdraw"/)
 assert.match(html,/data-form-status/)
 assert.doesNotMatch(html,/support@example/)
})

test('explore and membership still reach early access',async()=>{
 const explore=await goto('explore')
 const membership=await goto('apply')
 assert.match(explore,/href="#early-access"/)
 assert.match(membership,/href="#early-access"/)
})

test('preview cannot silently collect actual interest',async()=>{
 await assert.rejects(()=>db.registerEarlyAccess({email:'person@example.invalid',consent:true}),/live Base site/)
 await assert.rejects(()=>db.requestEarlyAccessPrivacy({email:'person@example.invalid',requestType:'withdraw'}),/live Base site/)
})

test('anonymous submissions go only to write-only REST routes, not Auth',()=>{
 const script=`
  globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}}
  globalThis.location={origin:'https://parc-labs.github.io',pathname:'/Base/',hash:'',search:''}
  const calls=[]
  let duplicateNext=false
  globalThis.fetch=async(url,options={})=>{
   calls.push({url,options})
   if(!url.includes('/rest/v1/early_access_'))throw Error('Unexpected endpoint '+url)
   if(duplicateNext){duplicateNext=false;return {ok:false,status:409,text:async()=>JSON.stringify({code:'23505',message:'Duplicate email'})}}
   return {ok:true,status:201,text:async()=>''}
  }
  const db=await import('./src/store.js')
  await db.registerEarlyAccess({
   email:'  TEST.Person@example.invalid  ',
   practice:'student',intendedUse:'Art and research',
   source:'reddit',consent:true
  })
  if(calls.length!==1)throw Error('Wrong number of requests')
  const first=calls[0]
  if(!first.url.endsWith('/rest/v1/early_access_signups'))throw Error('Wrong signup route')
  if(first.options.method!=='POST')throw Error('Wrong method')
  if(!first.options.headers.Prefer.includes('return=minimal'))throw Error('Data must not be returned')
  if(first.options.headers.Prefer.includes('resolution='))throw Error('An upsert would require extra SELECT grants')
  const body=JSON.parse(first.options.body)
  if(body.email!=='test.person@example.invalid'||body.opt_in!==true||body.source!=='reddit')throw Error('Wrong signup payload')
  duplicateNext=true
  await db.registerEarlyAccess({email:'test.person@example.invalid',consent:true})
  if(calls.length!==2)throw Error('Duplicate was not sent or rejected incorrectly')
  await db.requestEarlyAccessPrivacy({email:'TEST.Person@example.invalid',requestType:'withdraw'})
  const privacyCall=calls[2]
  if(!privacyCall.url.endsWith('/rest/v1/early_access_privacy_requests'))throw Error('Wrong privacy route')
  if(JSON.parse(privacyCall.options.body).email!=='test.person@example.invalid')throw Error('Privacy email not normalised')
  if(calls.some(c=>c.url.includes('/auth/v1/')))throw Error('Signup created an auth account')
  const before=calls.length
  for(const values of [
   {email:'not-an-email',consent:true},
   {email:'good@example.invalid',consent:false},
   {email:'good@example.invalid',consent:true,practice:'invalid'},
   {email:'good@example.invalid',consent:true,intendedUse:'x'.repeat(281)}
  ]){
   let rejected=false
   try{await db.registerEarlyAccess(values)}catch{rejected=true}
   if(!rejected)throw Error('Bad signup accepted')
  }
  if(calls.length!==before)throw Error('Validation made a network request')
 `
 const r=spawnSync(process.execPath,['--input-type=module','--eval',script],{
  cwd:process.cwd(),encoding:'utf8',env:{...process.env,BASE_PREVIEW_TEST:'0'}
 })
 assert.equal(r.status,0,r.stderr)
})
