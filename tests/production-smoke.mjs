import assert from 'node:assert/strict'

// Read-only monitoring: no real addresses, registrations, or privileged keys.
const site='https://parc-labs.github.io/Base/'
const edge='https://niotfttsjntivmpizrnc.supabase.co/functions/v1/base-public-form'
async function get(url){
 const response=await fetch(url,{signal:AbortSignal.timeout(15_000),headers:{'cache-control':'no-cache'}})
 assert.equal(response.status,200,url+' returned HTTP '+response.status)
 return response.text()
}
const html=await get(site)
assert.match(html,/<div id="app"/,'Base HTML entrypoint missing')
const js=await get(site+'src/store.js')
assert.match(js,/\/functions\/v1\/base-public-form/,'Published client is not using the guarded endpoint')
const response=await fetch(edge,{
 method:'POST',headers:{origin:'https://parc-labs.github.io','content-type':'application/json'},
 body:JSON.stringify({kind:'signup',email:'invalid-email',consent:true}),
 signal:AbortSignal.timeout(15_000)
})
assert.equal(response.status,400,'Edge endpoint did not reject malformed submission; HTTP '+response.status)
assert.equal(response.headers.get('access-control-allow-origin'),'https://parc-labs.github.io')
console.log('Base site, deployed client and public Edge validation are healthy.')
