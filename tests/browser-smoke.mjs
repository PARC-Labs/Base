import assert from 'node:assert/strict'
import {spawn,spawnSync} from 'node:child_process'
import {mkdtempSync,readFileSync,existsSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import net from 'node:net'

// Real Chrome/Chromium smoke test. No npm/browser-test dependencies required.
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function freePort(){
 const server=net.createServer()
 await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve))
 const port=server.address().port
 await new Promise(resolve=>server.close(resolve))
 return port
}
async function waitFor(fn,description,ms=20_000){
 const start=Date.now(),errors=[]
 while(Date.now()-start<ms){
  try{const result=await fn();if(result)return result}catch(error){errors.push(error.message)}
  await sleep(90)
 }
 throw new Error('Timed out waiting for '+description+(errors.length?' (last error: '+errors.at(-1)+')':''))
}
function chromeBinary(){
 for(const bin of [process.env.CHROME_BIN,'google-chrome','chromium','chromium-browser']){
  if(bin&&spawnSync('which',[bin],{stdio:'ignore'}).status===0)return bin
 }
 throw new Error('Chromium / Google Chrome is required for browser smoke tests')
}
class CDP {
 constructor(socket){
  this.socket=socket;this.lastId=0;this.pending=new Map();this.exceptions=[]
  socket.addEventListener('message',event=>{
   let msg
   try{msg=JSON.parse(event.data)}catch{return}
   if(msg.id){
    const waiter=this.pending.get(msg.id)
    if(!waiter)return
    this.pending.delete(msg.id)
    if(msg.error)waiter.reject(new Error(JSON.stringify(msg.error)))
    else waiter.resolve(msg.result)
   }else if(msg.method==='Runtime.exceptionThrown'){
    this.exceptions.push(msg.params?.exceptionDetails?.text||'Browser exception')
   }
  })
 }
 call(method,params={}){
  const id=++this.lastId
  return new Promise((resolve,reject)=>{
   this.pending.set(id,{resolve,reject})
   this.socket.send(JSON.stringify({id,method,params}))
  })
 }
 async eval(expression){
  const answer=await this.call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true})
  if(answer.exceptionDetails)throw new Error('Browser evaluate: '+(answer.exceptionDetails.text||answer.exceptionDetails.exception?.description))
  return answer.result?.value
 }
 async until(expression,description){return waitFor(()=>this.eval(expression),description)}
}
const port=await freePort()
const dir=mkdtempSync(join(tmpdir(),'base-browser-smoke-'))
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:process.cwd(),stdio:'ignore'})
let chrome,socket
try{
 await waitFor(async()=>{const r=await fetch(`http://127.0.0.1:${port}/index.html`).catch(()=>null);return r?.ok},'static HTTP server')
 chrome=spawn(chromeBinary(),[
  '--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  '--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'
 ],{stdio:'ignore'})
 await waitFor(()=>existsSync(join(dir,'DevToolsActivePort')),'Chrome debugging port')
 const debugPort=Number(readFileSync(join(dir,'DevToolsActivePort'),'utf8').split('\n')[0])
 const target=await waitFor(async()=>{
  const targets=await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()
  return targets.find(x=>x.type==='page')
 },'Chrome page target')
 socket=new WebSocket(target.webSocketDebuggerUrl)
 await new Promise((resolve,reject)=>{
  socket.addEventListener('open',resolve,{once:true})
  socket.addEventListener('error',reject,{once:true})
 })
 const cdp=new CDP(socket)
 await cdp.call('Page.enable')
 await cdp.call('Runtime.enable')
 await cdp.call('Page.navigate',{url:`http://127.0.0.1:${port}/?preview=1#explore`})
 await cdp.until(`document.querySelector('.space-card')?.textContent?.length > 0`,'preview collection')
 assert.match(await cdp.eval('document.body.textContent'),/LOCAL PREVIEW/)
 console.log('PASS: preview loads in Chromium')

 await cdp.eval(`location.hash='#new'`)
 await cdp.until(`!!document.querySelector('form[data-form="new"]')`,'new Space form')
 await cdp.eval(`(()=>{
  const form=document.querySelector('form[data-form="new"]')
  form.elements.namedItem('title').value='Chromium integration study'
  form.elements.namedItem('summary').value='Temporary integration test research'
  form.elements.namedItem('visibility').value='public'
  form.requestSubmit()
 })()`)
 await cdp.until(`location.hash.startsWith('#space/') && document.querySelector('.space-title')?.textContent==='Chromium integration study'`,'created Space')
 console.log('PASS: create a Space')

 await cdp.eval(`document.querySelector('[data-action="add-material"]').click()`)
 await cdp.until(`!!document.querySelector('form[data-form="add-material"]')`,'new material modal')
 await cdp.eval(`(()=>{
  const form=document.querySelector('form[data-form="add-material"]')
  form.elements.namedItem('type').value='note'
  form.elements.namedItem('title').value='Browser-tested observation'
  form.elements.namedItem('body').value='Observation stored in the local preview.'
  form.requestSubmit()
 })()`)
 await cdp.until(`document.querySelector('.material h3')?.textContent==='Browser-tested observation'`,'created material')
 console.log('PASS: add and display note')

 await cdp.eval(`document.querySelector('[data-action="connect-space"]').click()`)
 await cdp.until(`!!document.querySelector('form[data-form="connect-space"]')`,'connected Space modal')
 await cdp.eval(`(()=>{
  const form=document.querySelector('form[data-form="connect-space"]')
  form.elements.namedItem('note').value='Browser smoke connection'
  form.requestSubmit()
 })()`)
 await cdp.until(`document.querySelector('.connected-item')?.textContent?.includes('Browser smoke connection')`,'connected Space')
 console.log('PASS: connect Spaces')

 await cdp.eval(`window.confirm=()=>true;document.querySelector('[data-action="release"]').click()`)
 await cdp.until(`!!document.querySelector('[data-action="fork"]')`,'created release')
 console.log('PASS: create immutable release')
 await cdp.eval(`document.querySelector('[data-action="fork"]').click()`)
 await cdp.until(`document.querySelector('.space-title')?.textContent?.includes('— fork')`,'forked Space')
 assert.match(await cdp.eval('document.body.textContent'),/PRIVATE/)
 console.log('PASS: fork into private Space')

 assert.deepEqual(cdp.exceptions,[], 'Uncaught JavaScript browser exceptions: '+cdp.exceptions.join('; '))
 console.log('PASS: no uncaught browser JavaScript exceptions')
}finally{
 socket?.close()
 chrome?.kill('SIGKILL')
 server.kill('SIGKILL')
 rmSync(dir,{recursive:true,force:true})
}
