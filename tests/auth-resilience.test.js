import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'

function run(script){
 const r=spawnSync(process.execPath,['--input-type=module','--eval',script],{
  cwd:process.cwd(),encoding:'utf8',env:{...process.env,BASE_PREVIEW_TEST:'0'}
 })
 assert.equal(r.status,0,r.stderr)
}
test('transient auth outage preserves existing session for recovery',()=>{
 run(`
 const stored=JSON.stringify({access_token:'still-valid',refresh_token:'refresh',expires_at:Math.floor(Date.now()/1000)+3600})
 const data=new Map([['base_v1_session',stored]])
 globalThis.localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}
 globalThis.location={origin:'https://parc-labs.github.io',pathname:'/Base/',hash:'#mine',search:''}
 globalThis.fetch=async()=>{throw new TypeError('Network offline')}
 const db=await import('./src/store.js')
 await db.init()
 if(data.get('base_v1_session')!==stored)throw Error('Session should survive a transient outage')
 if(!db.authErrorMessage().includes('session is preserved'))throw Error('Missing actionable connection error')
 `)
})
test('a confirmed unauthorized user session is discarded',()=>{
 run(`
 const data=new Map([['base_v1_session',JSON.stringify({access_token:'invalid',refresh_token:'refresh',expires_at:Math.floor(Date.now()/1000)+3600})]])
 globalThis.localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}
 globalThis.location={origin:'https://parc-labs.github.io',pathname:'/Base/',hash:'#mine',search:''}
 globalThis.fetch=async()=>({ok:false,status:401,text:async()=>JSON.stringify({message:'JWT invalid'})})
 const db=await import('./src/store.js')
 await db.init()
 if(data.has('base_v1_session'))throw Error('Invalid credentials should be cleared')
 if(db.me().user!==null)throw Error('Invalid user should be cleared')
 `)
})
test('failed material deletion does not falsely report success',()=>{
 run(`
 const data=new Map([['base_v1_session',JSON.stringify({access_token:'valid',refresh_token:'refresh',expires_at:Math.floor(Date.now()/1000)+3600})]])
 globalThis.localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}
 globalThis.location={origin:'https://parc-labs.github.io',pathname:'/Base/',hash:'#mine',search:''}
 let deletion
 globalThis.fetch=async(url,opts={})=>{
  if(url.includes('/auth/v1/user'))return {ok:true,status:200,text:async()=>JSON.stringify({id:'11111111-1111-4111-8111-111111111111',email:'member@example.org'})}
  if(url.includes('/rest/v1/memberships'))return {ok:true,status:200,text:async()=>JSON.stringify([{status:'active'}])}
  if(opts.method==='DELETE'){deletion={url,opts};return {ok:true,status:200,text:async()=>JSON.stringify([])}}
  throw Error('Unexpected '+url)
 }
 const db=await import('./src/store.js')
 await db.init()
 let rejected=false
 try{await db.removeMaterial('22222222-2222-4222-8222-222222222222')}catch(error){rejected=error.message.includes('no longer exists')}
 if(!rejected||!deletion.opts.headers.Prefer.includes('return=representation'))throw Error('Missing deletion confirmation')
 `)
})
