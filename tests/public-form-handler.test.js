import test from 'node:test'
import assert from 'node:assert/strict'
import {createPublicFormHandler} from '../supabase/functions/base-public-form/handler.js'

const endpoint='https://example.supabase.co'
const secret='test-server-key-never-in-client'
function request(body,{origin='https://parc-labs.github.io',method='POST',headers={}}={}){
 return new Request('https://example.supabase.co/functions/v1/base-public-form',{
  method,headers:{origin,'content-type':'application/json','x-forwarded-for':'198.51.100.8',...headers},
  ...(method==='POST'?{body:JSON.stringify(body)}:{})
 })
}
test('anonymous forms validate inputs, use only server key and submit salted hashes',async()=>{
 const calls=[]
 const handler=createPublicFormHandler({baseUrl:endpoint,serviceRoleKey:secret,
  fetchImpl:async(url,opts)=>{calls.push({url,opts});return new Response('',{status:204})}
 })
 const res=await handler(request({kind:'signup',email:'  RESEARCHER@EXAMPLE.COM  ',practice:'student',consent:true,intendedUse:' Field Research ',source:'ref'}))
 assert.equal(res.status,200)
 assert.equal(calls.length,1)
 const call=calls[0],body=JSON.parse(call.opts.body)
 assert.equal(call.url,endpoint+'/rest/v1/rpc/base_submit_public_form')
 assert.equal(call.opts.headers.Authorization,'Bearer '+secret)
 assert.equal(body.p_email,'researcher@example.com')
 assert.equal(body.p_kind,'signup')
 assert.equal(body.p_fingerprint.length,64)
 assert.equal(body.p_email_hash.length,64)
 assert.equal(body.p_intended_use,'Field Research')
 assert.equal(call.opts.body.includes('198.51.100.8'),false)
 assert.equal(res.headers.get('access-control-allow-origin'),'https://parc-labs.github.io')
 const privacy=await handler(request({kind:'privacy',email:'TEST@example.org',requestType:'withdraw'}))
 assert.equal(privacy.status,200)
 assert.equal(JSON.parse(calls[1].opts.body).p_request_type,'withdraw')
})
test('rejects invalid consent, malformed payload, origins and unsupported method without DB writes',async()=>{
 let count=0
 const handler=createPublicFormHandler({baseUrl:endpoint,serviceRoleKey:secret,fetchImpl:async()=>{count++;return new Response('',{status:204})}})
 assert.equal((await handler(request({kind:'signup',email:'x@example.com',consent:false}))).status,400)
 assert.equal((await handler(request({kind:'signup',email:'notanemail',consent:true}))).status,400)
 assert.equal((await handler(request({kind:'privacy',email:'a@example.org',requestType:'unknown'}))).status,400)
 assert.equal((await handler(request({kind:'signup',email:'x@example.org',consent:true},{origin:'https://evil.test'}))).status,403)
 assert.equal((await handler(request({}, {method:'GET'}))).status,405)
 assert.equal((await handler(request({kind:'signup',email:'x@example.org',consent:true,intendedUse:'x'.repeat(281)}))).status,400)
 assert.equal(count,0)
})
test('database quota violations return 429 and other failures are opaque',async()=>{
 const denied=createPublicFormHandler({baseUrl:endpoint,serviceRoleKey:secret,
 fetchImpl:async()=>new Response(JSON.stringify({code:'P0001',message:'DB diagnostics'}),{status:400})})
 const r=await denied(request({kind:'signup',email:'x@example.org',consent:true}))
 assert.equal(r.status,429)
 assert.doesNotMatch(await r.text(),/diagnostics/)
 const down=createPublicFormHandler({baseUrl:endpoint,serviceRoleKey:secret,fetchImpl:async()=>{throw Error('private key leaked')}})
 const x=await down(request({kind:'privacy',email:'x@example.org',requestType:'access'}))
 assert.equal(x.status,503)
 assert.doesNotMatch(await x.text(),/private key/)
})
