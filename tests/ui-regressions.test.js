import test from 'node:test'
import assert from 'node:assert/strict'

const memory=new Map()
const handlers=new Map()
const rootHandlers=new Map()
const appended=[]
const root={innerHTML:'',addEventListener:(name,fn)=>rootHandlers.set(name,fn)}
globalThis.localStorage={
 getItem:key=>memory.get(key)||null,
 setItem:(key,value)=>memory.set(key,value),
 removeItem:key=>memory.delete(key)
}
globalThis.location={origin:'https://parc-labs.github.io',pathname:'/Base/',search:'',hash:'#explore'}
globalThis.window={addEventListener:(event,fn)=>handlers.set(event,fn)}
globalThis.document={
 title:'',
 getElementById:()=>root,
 addEventListener(){},
 querySelector:()=>null,
 createElement:()=>({innerHTML:'',className:'',querySelector:()=>null}),
 body:{append:node=>appended.push(node)}
}
globalThis.scrollTo=()=>{}
await import('../src/app.js')
const db=await import('../src/store.js')

test('Connected Space action opens the modal instead of referencing an uninitialised id',async()=>{
 const spaces=await db.listSpaces('explore')
 assert.ok(spaces.length>=2)
 location.hash='#space/'+spaces[0].id
 handlers.get('hashchange')()
 await new Promise(resolve=>setImmediate(resolve))
 assert.match(root.innerHTML,/CONNECTIONS/)
 const target={dataset:{action:'connect-space'}}
 await rootHandlers.get('click')({target:{closest:selector=>selector==='[data-action]'?target:null}})
 assert.ok(appended.length>0,'a dialog should be appended')
 assert.match(appended.at(-1).innerHTML,/Related Space/)
 assert.match(appended.at(-1).innerHTML,/<select name="target_space"/)
})
