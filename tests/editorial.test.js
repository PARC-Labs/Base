import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const memory=new Map()
const root={innerHTML:'',addEventListener(){}}
const handlers=new Map()
globalThis.localStorage={
 getItem:key=>memory.get(key)||null,
 setItem:(key,val)=>memory.set(key,val),
 removeItem:key=>memory.delete(key)
}
globalThis.location={origin:'https://example.com',pathname:'/',hash:'#explore'}
globalThis.document={title:'',getElementById:()=>root,addEventListener(){}}
globalThis.window={addEventListener:(kind,fn)=>handlers.set(kind,fn)}
globalThis.scrollTo=()=>{}
await import('../src/app.js')
const db=await import('../src/store.js')
async function goto(route){
 globalThis.location.hash='#'+route
 handlers.get('hashchange')()
 await new Promise(resolve=>setImmediate(resolve))
 return root.innerHTML
}
test('Explore is a minimal index without marketing sections',async()=>{
 const html=await goto('explore')
 assert.match(html,/class="collection-page"/)
 assert.match(html,/<h1>EXPLORE<\/h1>/)
 assert.match(html,/class="space-grid"/)
 assert.doesNotMatch(html,/Working together, independently/)
 assert.doesNotMatch(html,/BASE \/ EXPERIMENTAL PRACTICE/)
 assert.doesNotMatch(html,/footer-note/)
 assert.doesNotMatch(html,/card-desc/)
 assert.match(html,/MEMBERSHIP<\/a>/)
})
test('My Spaces stays functional with short labels and creation action',async()=>{
 const html=await goto('mine')
 assert.match(html,/<h1>MY SPACES<\/h1>/)
 assert.match(html,/href="#new" class="text-btn">\+ NEW SPACE/)
 assert.doesNotMatch(html,/YOUR WORKING ENVIRONMENT/)
 assert.doesNotMatch(html,/Your own research, developing work/)
})
test('Space keeps controls and material but removes repeated explanatory copy',async()=>{
 const sample=(await db.listSpaces('mine'))[0]
 const html=await goto('space/'+sample.id)
 for(const action of ['upload-media','add-material','connect-space','edit-space','invite','release'])
  assert.ok(html.includes('data-action="'+action+'"'),action+' missing')
 assert.match(html,/class="space-title"/)
 assert.doesNotMatch(html,/About this Space/)
 assert.doesNotMatch(html,/Releases are fixed snapshots/)
 assert.doesNotMatch(html,/Reference related work without copying/)
 assert.doesNotMatch(html,/A developing body of work/)
 assert.doesNotMatch(html,/STRUCTURE \/ DEVELOPING WORK/)
})
test('About, membership, sign-in and new Space have concise readable forms',async()=>{
 let html=await goto('about')
 assert.match(html,/class="utility-document"/)
 assert.doesNotMatch(html,/01 \/ Inquiry before category/)
 html=await goto('apply')
 assert.match(html,/Founding access is by invitation/)
 assert.doesNotMatch(html,/Payment and invitation processes/)
 html=await goto('new')
 assert.match(html,/data-form="new"/)
 assert.match(html,/name="visibility"/)
 assert.match(html,/name="title"/)
 html=await goto('signin')
 assert.match(html,/ACCOUNT/)
})
test('editorial styles follow Applied State-like hierarchy',()=>{
 const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8')
 assert.match(css,/\.space-index\s*\{/)
 assert.match(css,/\.collection-page\s*\{/)
 assert.match(css,/\.utility-document\s*\{/)
 assert.match(css,/\.space-grid\s*\{/)
})
