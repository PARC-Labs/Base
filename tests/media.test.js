import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {prepareMedia,mediaTitle} from '../src/media.js'

test('PDF validation rejects mislabeled and oversized documents',async()=>{
 const valid=new Blob(['%PDF-1.7\\nexample'],{type:'application/pdf'})
 assert.equal((await prepareMedia(valid)).extension,'pdf')
 const spoof=new Blob(['not a pdf'],{type:'application/pdf'})
 await assert.rejects(()=>prepareMedia(spoof),/valid PDF/)
 const oversized={type:'application/pdf',size:5*1024*1024+1}
 await assert.rejects(()=>prepareMedia(oversized),/5 MB/)
 await assert.rejects(()=>prepareMedia(new Blob(['<svg/>'],{type:'image/svg+xml'})),/SVG/)
 assert.equal(mediaTitle('my_test-photo.PNG'),'my test photo')
})

test('image resizing happens in browser without a paid transformation API',async()=>{
 const previousDocument=globalThis.document
 const previousBitmap=globalThis.createImageBitmap
 let dimensions=[]
 globalThis.createImageBitmap=async()=>({width:2400,height:1200,close(){}})
 globalThis.document={createElement:()=>({
  set width(value){dimensions[0]=value},get width(){return dimensions[0]},
  set height(value){dimensions[1]=value},get height(){return dimensions[1]},
  getContext:()=>({drawImage:()=>{}}),
  toBlob:callback=>callback(new Blob(['compressed'],{type:'image/webp'}))
 })}
 try{
  const image=new Blob(['image'],{type:'image/jpeg'})
  const result=await prepareMedia(image)
  assert.equal(result.extension,'webp')
  assert.equal(result.mime,'image/webp')
  assert.deepEqual(dimensions,[1600,800])
 }finally{globalThis.document=previousDocument;globalThis.createImageBitmap=previousBitmap}
})

test('live private PDF upload stores a path and signs it only for an authorised Space',()=>{
 const script=`
 const id='11111111-1111-4111-8111-111111111111'
 let current=null;let uploaded=false;let uploadEndpoint=''
 const session={access_token:'mock.user.jwt',refresh_token:'refresh',expires_at:4102444800}
 globalThis.localStorage={getItem:key=>key==='base_v1_session'?JSON.stringify(session):null,setItem:()=>{},removeItem:()=>{}}
 globalThis.location={origin:'https://parc-labs.github.io',pathname:'/Base/',hash:''}
 globalThis.fetch=async(url,options={})=>{
  const path=new URL(url).pathname
  let body
  if(path.endsWith('/auth/v1/user'))body={id,email:'member@example.org'}
  else if(path.includes('/rest/v1/memberships'))body=[{status:'active'}]
  else if(path.includes('/rest/v1/spaces'))body=[{id,owner_id:id,visibility:'private',title:'Test',summary:'',author_name:'Member'}]
  else if(path.includes('/rest/v1/materials')&&options.method==='POST'){
   current=JSON.parse(options.body)
   body=[{...current,id:'1234',position:1}]
  }
  else if(path.includes('/rest/v1/materials'))body=current?[{...current,id:'1234',position:1}]:[]
  else if(path.includes('/storage/v1/object/sign/')){
   body={signedURL:'/object/sign/base-media/'+current.storage_path+'?token=temporary'}
  }
  else if(path.includes('/storage/v1/object/base-media/')){
   uploaded=true;uploadEndpoint=path
   if(options.headers.Authorization!=='Bearer mock.user.jwt')throw Error('JWT missing')
   if(options.headers['Content-Type']!=='application/pdf')throw Error('wrong MIME')
   body={Key:path}
  }else throw Error('Unexpected '+path)
  return {ok:true,status:200,text:async()=>JSON.stringify(body)}
 }
 const db=await import('./src/store.js')
 await db.init()
 const file=new Blob(['%PDF-1.6\\nunit'],{type:'application/pdf'})
 const added=await db.addUploadedMaterial(id,file,{title:'My drawing'})
 if(!uploaded||added.storage_path?.split('/')[0]!==id||!added.storage_path.endsWith('.pdf'))throw Error('Bad upload path')
 if(!uploadEndpoint.includes('base-media'))throw Error('Wrong bucket')
 const space=await db.getSpace(id)
 if(!space.materials[0].asset_url.startsWith('https://niotfttsjntivmpizrnc.supabase.co/storage/v1/object/sign/'))throw Error('Bad signed media URL')
 `
 const result=spawnSync(process.execPath,['--input-type=module','--eval',script],{cwd:process.cwd(),encoding:'utf8',env:{...process.env,BASE_PREVIEW_TEST:'0'}})
 assert.equal(result.status,0,result.stderr)
})
