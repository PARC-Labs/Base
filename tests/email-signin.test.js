import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'

test('live email-link sign-in creates only a pending identity unless preapproved',()=>{
 const source = [
  "globalThis.location={origin:'https://parc-labs.github.io',pathname:'/Base/',hash:''};",
  "let request;",
  "globalThis.fetch=async(url,options)=>{request={url,options};return {ok:true,text:async()=>JSON.stringify({})}};",
  "const db=await import('./src/store.js');",
  "await db.signIn('  Researcher@Example.COM  ');",
  "const body=JSON.parse(request.options.body);",
  "if(body.email!=='researcher@example.com'||body.create_user!==true)throw Error('Invalid sign in payload');",
  "if(new URL(request.url).searchParams.get('redirect_to')!=='https://parc-labs.github.io/Base/')throw Error('Invalid redirect URL');",
  "if(!request.options.headers.apikey)throw Error('Missing public key');",
  "if(request.options.headers.Authorization)throw Error('Incorrect publishable key in Bearer header');"
 ].join('\n')
 const result=spawnSync(process.execPath,['--input-type=module','--eval',source],{cwd:process.cwd(),encoding:'utf8',env:{...process.env,BASE_PREVIEW_TEST:'0'}})
 assert.equal(result.status,0,result.stderr)
})

test('expired-link messages do not swallow an auth error silently',()=>{
 const source=[
  "globalThis.location={origin:'https://parc-labs.github.io',pathname:'/Base/',hash:'#error=access_denied&error_description=Link%20expired'};",
  "globalThis.history={replaceState:(...args)=>{globalThis.location.hash='#signin'}};",
  "globalThis.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};",
  "const db=await import('./src/store.js');",
  "await db.init();",
  "if(db.authErrorMessage()!=='Link expired')throw Error('Lost error message');",
  "if(globalThis.location.hash!=='#signin')throw Error('Missing recovery route');"
 ].join('\n')
 const result=spawnSync(process.execPath,['--input-type=module','--eval',source],{cwd:process.cwd(),encoding:'utf8',env:{...process.env,BASE_PREVIEW_TEST:'0'}})
 assert.equal(result.status,0,result.stderr)
})
