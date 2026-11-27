import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'

function run(code){
 const r=spawnSync(process.execPath,['--input-type=module','--eval',code],{
  cwd:process.cwd(),encoding:'utf8',env:{...process.env,BASE_PREVIEW_TEST:'0'}
 })
 assert.equal(r.status,0,r.stderr)
}
test('when another tab refreshes first, a stale-token failure adopts the newer session',()=>{
 run(`
  const handlers=new Map()
  const now=Math.floor(Date.now()/1000)
  const initial={access_token:'old',refresh_token:'old-refresh',expires_at:now-1}
  const updated={access_token:'new',refresh_token:'new-refresh',expires_at:now+3600}
  const data=new Map([['base_v1_session',JSON.stringify(initial)]])
  globalThis.localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}
  globalThis.window={addEventListener:(name,fn)=>handlers.set(name,fn)}
  globalThis.location={origin:'https://parc-labs.github.io',pathname:'/Base/',hash:'#mine',search:''}
  let refreshes=0
  const response=(status,body)=>({status,ok:status>=200&&status<300,text:async()=>JSON.stringify(body)})
  globalThis.fetch=async(url,opts={})=>{
   if(url.includes('/auth/v1/token')){
    refreshes++
    localStorage.setItem('base_v1_session',JSON.stringify(updated))
    handlers.get('storage')({key:'base_v1_session',newValue:JSON.stringify(updated)})
    return response(400,{message:'Token rotated'})
   }
   if(url.endsWith('/auth/v1/user')){
    if(opts.headers.Authorization!=='Bearer new')throw Error('Did not adopt new token')
    return response(200,{id:'11111111-1111-4111-8111-111111111111',email:'member@example.org'})
   }
   if(url.includes('/rest/v1/memberships'))return response(200,[{status:'active'}])
   throw Error('Unexpected '+url)
  }
  const db=await import('./src/store.js')
  await db.init()
  if(refreshes!==1||!db.me().member)throw Error('Stale tab lost active session')
  if(!data.get('base_v1_session').includes('new-refresh'))throw Error('Stale tab corrupted current token')
 `)
})
test('an in-flight refresh cannot resurrect a session after sign-out in another tab',()=>{
 run(`
  const handlers=new Map()
  const now=Math.floor(Date.now()/1000)
  const data=new Map([['base_v1_session',JSON.stringify({access_token:'old',refresh_token:'old-refresh',expires_at:now-1})]])
  globalThis.localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}
  globalThis.window={addEventListener:(name,fn)=>handlers.set(name,fn)}
  globalThis.location={origin:'https://parc-labs.github.io',pathname:'/Base/',hash:'#mine',search:''}
  globalThis.fetch=async(url)=>{
   if(!url.includes('/auth/v1/token'))throw Error('Unexpected '+url)
   localStorage.removeItem('base_v1_session')
   handlers.get('storage')({key:'base_v1_session',newValue:null})
   return {ok:true,status:200,text:async()=>JSON.stringify({access_token:'resurrected',refresh_token:'new-refresh',expires_in:3600})}
  }
  const db=await import('./src/store.js')
  await db.init()
  if(data.has('base_v1_session')||db.me().user!==null||db.me().member)throw Error('Signed-out account was resurrected')
 `)
})
