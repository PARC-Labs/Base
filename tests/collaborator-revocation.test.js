import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'

test('collaborator management is authenticated and owner-scoped through RPC',()=>{
 const script=`
  const owner='11111111-1111-4111-8111-111111111111'
  const space='22222222-2222-4222-8222-222222222222'
  const data=new Map([['base_v1_session',JSON.stringify({access_token:'member-jwt',refresh_token:'refresh',expires_at:Math.floor(Date.now()/1000)+3600})]])
  globalThis.localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}
  globalThis.location={origin:'https://parc-labs.github.io',pathname:'/Base/',hash:'#space/'+space,search:''}
  const calls=[]
  globalThis.fetch=async(url,opts={})=>{
   const path=new URL(url).pathname
   if(path.includes('/auth/v1/user'))return {ok:true,status:200,text:async()=>JSON.stringify({id:owner,email:'owner@example.org'})}
   if(path.includes('/rest/v1/memberships'))return {ok:true,status:200,text:async()=>JSON.stringify([{status:'active'}])}
   if(path.endsWith('/rpc/base_list_collaborators')){
    calls.push({path,opts})
    return {ok:true,status:200,text:async()=>JSON.stringify([{member_id:'33333333-3333-4333-8333-333333333333',email:'member@example.org'}])}
   }
   if(path.endsWith('/rpc/base_revoke_collaborator')){
    calls.push({path,opts})
    return {ok:true,status:200,text:async()=>JSON.stringify(true)}
   }
   throw Error('Unexpected '+path)
  }
  const db=await import('./src/store.js')
  await db.init()
  const collaborators=await db.listCollaborators(space)
  if(collaborators.length!==1||collaborators[0].email!=='member@example.org')throw Error('Collaborator list missing')
  await db.revokeCollaborator(space,'  MEMBER@EXAMPLE.ORG  ')
  if(calls.length!==2)throw Error('Expected two authenticated RPC calls')
  if(calls.some(c=>c.opts.headers.Authorization!=='Bearer member-jwt'))throw Error('RPC must use member JWT')
  if(JSON.parse(calls[1].opts.body).invitee_email!=='member@example.org')throw Error('Revoke must normalize email')
  let invalidRejected=false
  try{await db.revokeCollaborator(space,'invalid')}catch{invalidRejected=true}
  if(!invalidRejected||calls.length!==2)throw Error('Client accepted invalid email')
 `
 const r=spawnSync(process.execPath,['--input-type=module','--eval',script],{
  cwd:process.cwd(),encoding:'utf8',env:{...process.env,BASE_PREVIEW_TEST:'0'}
 })
 assert.equal(r.status,0,r.stderr)
})
