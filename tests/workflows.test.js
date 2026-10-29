import test from 'node:test'
import assert from 'node:assert/strict'

const browserData=new Map()
globalThis.localStorage={getItem:k=>browserData.get(k)||null,setItem:(k,v)=>browserData.set(k,v),removeItem:k=>browserData.delete(k)}
globalThis.location={origin:'https://example.org',hash:'',pathname:'/'}

const db=await import('../src/store.js')
const utils=await import('../src/utils.js')

test('preview seeds a substantive public collection',async()=>{
 await db.init()
 assert.equal(db.isLive,false)
 const spaces=await db.listSpaces()
 assert.ok(spaces.length>=3)
 assert.ok(spaces.every(s=>s.visibility==='public'))
})
test('create, add material, release and fork preserve immutable source',async()=>{
 const original=await db.createSpace({title:'Experimental Lab',summary:'A physical systems lab',visibility:'public'})
 assert.ok(original.id)
 await db.addMaterial(original.id,{type:'note',title:'Operating principle',url:null,body:'Collect reliable field data.'})
 const snapshot=await db.releaseSpace(original.id)
 assert.equal(snapshot.version,1)
 await db.addMaterial(original.id,{type:'note',title:'Later development',url:null,body:'A subsequent addition.'})
 const forkId=await db.forkRelease(snapshot.id)
 const fork=await db.getSpace(forkId)
 const current=await db.getSpace(original.id)
 assert.equal(fork.visibility,'private')
 assert.equal(fork.parent_release_id,snapshot.id)
 assert.equal(fork.materials.length,1)
 assert.equal(current.materials.length,2)
 assert.equal(fork.title,'Experimental Lab — fork')
 assert.equal(snapshot.snapshot.materials.length,1)
})
test('edits persist, material can be removed, demo can be reset',async()=>{
 const mine=await db.listSpaces('mine')
 const newest=mine.find(s=>s.title==='Experimental Lab')
 await db.updateSpace(newest.id,{summary:'Revised study'})
 assert.equal((await db.getSpace(newest.id)).summary,'Revised study')
 const m=(await db.getSpace(newest.id)).materials[0]
 await db.removeMaterial(m.id)
 assert.equal((await db.getSpace(newest.id)).materials.length,1)
 db.resetDemo()
 assert.equal((await db.listSpaces('mine')).filter(s=>s.title==='Experimental Lab').length,0)
})
test('untrusted values are HTML-escaped and non-http URLs are refused',()=>{
 assert.equal(utils.escapeHtml('<script>"&'), '&lt;script&gt;&quot;&amp;')
 assert.equal(utils.safeUrl('javascript:alert(1)'),null)
 assert.equal(utils.safeUrl('https://example.com/hello'),'https://example.com/hello')
})

test('a Space can become a versioned system with an append-only operational record',async()=>{
 db.resetDemo()
 const space=await db.createSpace({title:'Coastal Field Laboratory',summary:'An experimental field protocol.',visibility:'public'})
 const component=await db.addMaterial(space.id,{type:'component',title:'Sampling apparatus',body:'Reusable water sampling instrument.',url:null})
 const procedure=await db.addMaterial(space.id,{type:'procedure',title:'Morning observation',body:'Record temperature and instrument readings.',url:null})
 assert.equal((await db.getSpace(space.id)).materials.filter(x=>['component','procedure'].includes(x.type)).length,2)
 const release=await db.releaseSpace(space.id)
 assert.equal(release.snapshot.materials.length,2)
 const record=await db.addOperationLog(space.id,release.id,{title:'First station test',details:'Instrument calibrated; reading recorded.'})
 assert.equal(record.release_id,release.id)
 assert.equal((await db.listOperationLogs(space.id))[0].title,'First station test')
 await db.removeMaterial(component.id)
 const second=await db.releaseSpace(space.id)
 assert.equal(second.version,2)
 assert.equal(release.snapshot.materials.length,2,'the earlier released design must remain unchanged')
 assert.equal((await db.listOperationLogs(space.id))[0].release_id,release.id,'the activity must remain linked to the original release')
 await assert.rejects(()=>db.addOperationLog(space.id,'wrong-release',{title:'Invalid record',details:''}),/does not belong/)
 assert.ok(procedure.id)
 db.resetDemo()
 assert.equal((await db.listOperationLogs(space.id)).length,0)
})
