import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'

test('a 401 during an active session refreshes credentials and retries only once',()=>{
 const script=`
 const now=Math.floor(Date.now()/1000)
 const data=new Map([['base_v1_session',JSON.stringify({
  access_token:'old-token',refresh_token:'old-refresh',expires_at:now+1800
 })]])
 globalThis.localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}
 globalThis.location={origin:'https://parc-labs.github.io',pathname:'/Base/',hash:'#mine',search:''}
 let refreshes=0,spaceCalls=0
 const response=(status,body)=>({ok:status>=200&&status<300,status,text:async()=>JSON.stringify(body)})
 globalThis.fetch=async(url,options={})=>{
  const auth=options.headers?.Authorization
  if(url.includes('/auth/v1/user'))return response(200,{id:'11111111-1111-4111-8111-111111111111',email:'member@example.org'})
  if(url.includes('/auth/v1/token?grant_type=refresh_token')){
   refreshes++
   return response(200,{access_token:'new-token',refresh_token:'new-refresh',expires_in:3600})
  }
  if(url.includes('/rest/v1/memberships'))return response(200,[{status:'active'}])
  if(url.includes('/rest/v1/spaces')){
   spaceCalls++
   return auth==='Bearer new-token'?response(200,[{id:'22222222-2222-4222-8222-222222222222',title:'A Space',visibility:'public',owner_id:'11111111-1111-4111-8111-111111111111',updated_at:'2026-11-23T00:00:00Z'}]):response(401,{message:'JWT expired'})
  }
  if(url.includes('/rest/v1/space_collaborators'))return response(200,[])
  throw Error('Unexpected request '+url)
 }
 const db=await import('./src/store.js')
 await db.init()
 if(!db.me().member)throw Error('Expected active member')
 const spaces=await db.listSpaces('mine')
 if(spaces.length!==1)throw Error('Retry did not return the Space')
 if(spaceCalls!==2||refreshes!==1)throw Error('Expected exactly one refresh and one retry: '+spaceCalls+'/'+refreshes)
 if(!data.get('base_v1_session').includes('new-token'))throw Error('Refresh was not persisted')
 `
 const r=spawnSync(process.execPath,['--input-type=module','--eval',script],{
  cwd:process.cwd(),encoding:'utf8',env:{...process.env,BASE_PREVIEW_TEST:'0'}
 })
 assert.equal(r.status,0,r.stderr)
})
