import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'

const memory=new Map()
globalThis.localStorage={
 getItem:key=>memory.get(key)||null,
 setItem:(key,value)=>memory.set(key,value),
 removeItem:key=>memory.delete(key)
}
globalThis.location={origin:'https://parc-labs.github.io',hash:'',pathname:'/Base/'}
const db=await import('../src/store.js')

test('Space connections are references with discoverable incoming backlinks',async()=>{
 assert.equal(db.isLive,false)
 db.resetDemo()
 const source=await db.createSpace({title:'Marine field work',summary:'Research',visibility:'private'})
 const target=await db.createSpace({title:'Temporary building',summary:'Materials',visibility:'public'})
 const note='Related fabrication method'
 const link=await db.connectSpace(source.id,target.id,note)
 assert.ok(link.id)
 const first=await db.listSpaceConnections(source.id)
 assert.equal(first.outgoing.length,1)
 assert.equal(first.incoming.length,0)
 assert.equal(first.outgoing[0].related.title,'Temporary building')
 assert.equal(first.outgoing[0].note,note)
 const second=await db.listSpaceConnections(target.id)
 assert.equal(second.incoming.length,1)
 assert.equal(second.incoming[0].related.id,source.id)
 const available=await db.listLinkableSpaces(source.id)
 assert.ok(available.some(s=>s.id===target.id))
 assert.ok(!available.some(s=>s.id===source.id))
 await db.updateSpace(target.id,{title:'Revised building'})
 assert.equal((await db.listSpaceConnections(source.id)).outgoing[0].related.title,'Revised building')
 assert.equal((await db.getSpace(target.id)).title,'Revised building')
 await db.disconnectSpace(link.id)
 assert.equal((await db.listSpaceConnections(source.id)).outgoing.length,0)
 db.resetDemo()
 assert.equal((await db.listSpaceConnections(target.id)).incoming.length,0)
})

test('connection validation rejects self-links, duplicates and long notes',async()=>{
 db.resetDemo()
 const left=await db.createSpace({title:'Left',summary:'',visibility:'private'})
 const right=await db.createSpace({title:'Right',summary:'',visibility:'private'})
 await assert.rejects(()=>db.connectSpace(left.id,left.id),/cannot link to itself/)
 await assert.rejects(()=>db.connectSpace(left.id,right.id,'x'.repeat(501)),/500 characters/)
 await db.connectSpace(left.id,right.id)
 await assert.rejects(()=>db.connectSpace(left.id,right.id),/already connected/)
})

test('live linkage uses normal authenticated REST and never copies target Space',()=>{
 const script=`
 const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222'
 const session={access_token:'user.jwt.mock',refresh_token:'refresh',expires_at:4102444800}
 globalThis.localStorage={getItem:key=>key==='base_v1_session'?JSON.stringify(session):null,setItem:()=>{},removeItem:()=>{}}
 globalThis.location={origin:'https://parc-labs.github.io',hash:'',pathname:'/Base/'}
 let posted=null
 const spaces=[
  {id:a,title:'Original',summary:'',owner_id:a,visibility:'private'},
  {id:b,title:'Research',summary:'',owner_id:a,visibility:'public'}
 ]
 globalThis.fetch=async(url,options={})=>{
  const p=new URL(url).pathname
  let data
  if(p.endsWith('/auth/v1/user'))data={id:a,email:'member@example.org'}
  else if(p.includes('/rest/v1/memberships'))data=[{status:'active'}]
  else if(p.includes('/rest/v1/space_collaborators'))data=[]
  else if(p.includes('/rest/v1/space_links')){
   if(options.method==='POST'){
    posted=JSON.parse(options.body)
    if(options.headers.Authorization!=='Bearer user.jwt.mock')throw Error('Missing bearer auth')
    data=[{...posted,id:'33333333-3333-4333-8333-333333333333',created_at:'2026-10-30T00:00:00Z'}]
   }else if(options.method==='DELETE')data=null
   else data=[{...posted,id:'33333333-3333-4333-8333-333333333333',created_at:'2026-10-30T00:00:00Z'}]
  }
  else if(p.includes('/rest/v1/spaces'))data=spaces
  else throw Error('Unexpected URL '+p)
  return {ok:true,status:200,text:async()=>JSON.stringify(data)}
 }
 const db=await import('./src/store.js')
 await db.init()
 await db.connectSpace(a,b,'Shared method')
 if(posted.source_space_id!==a||posted.target_space_id!==b)throw Error('Wrong endpoints')
 const links=await db.listSpaceConnections(a)
 if(links.outgoing.length!==1||links.outgoing[0].related.title!=='Research')throw Error('Missing resolved link')
 if(links.incoming.length!==0)throw Error('Unexpected incoming link')
 await db.disconnectSpace('33333333-3333-4333-8333-333333333333')
 `
 const result=spawnSync(process.execPath,['--input-type=module','--eval',script],{
  cwd:process.cwd(),encoding:'utf8',env:{...process.env,BASE_PREVIEW_TEST:'0'}
 })
 assert.equal(result.status,0,result.stderr)
})
