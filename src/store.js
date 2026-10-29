import { config } from './config.js'

const live = Boolean(config.supabaseUrl && config.supabaseAnonKey)
export const isLive = live
const DEMO_KEY = 'base_v1_demo_20261028'
const SESSION_KEY = 'base_v1_session'
const now = () => new Date().toISOString()
const id = () => {
 if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
 const bytes = new Uint8Array(16)
 crypto.getRandomValues(bytes)
 bytes[6] = (bytes[6] & 0x0f) | 0x40
 bytes[8] = (bytes[8] & 0x3f) | 0x80
 return [...bytes].map((n, i) => ([4,6,8,10].includes(i) ? '-' : '') + n.toString(16).padStart(2, '0')).join('')
}
const demoOwner = '00000000-0000-4000-8000-000000000001'
const samples = [
  { id:'00000000-0000-4000-8000-000000000101', title:'Temporary Structures',summary:'Lightweight architectures, temporary inhabitation and modular constructions.',cover_url:'assets/study-1.svg',author_name:'Studio Field',visibility:'public',owner_id:demoOwner,updated_at:now(),parent_release_id:null },
  { id:'00000000-0000-4000-8000-000000000102', title:'Material Ecologies',summary:'Living materials, ceramic processes and the ecology of making.',cover_url:'assets/study-2.svg',author_name:'L. Hart',visibility:'public',owner_id:demoOwner,updated_at:now(),parent_release_id:null },
  { id:'00000000-0000-4000-8000-000000000103', title:'Marine Instruments',summary:'Low-cost sensing, open ocean instrumentation and situated observation.',cover_url:'assets/study-3.svg',author_name:'Field Laboratory',visibility:'public',owner_id:demoOwner,updated_at:now(),parent_release_id:null },
  { id:'00000000-0000-4000-8000-000000000104', title:'Spatial Protocols',summary:'Processes, rules and interfaces for the organisation of shared environments.',cover_url:'assets/study-4.svg',author_name:'Applied Research',visibility:'public',owner_id:demoOwner,updated_at:now(),parent_release_id:null }
]
const demoMaterials = [
 {space_id:samples[0].id,type:'image',title:'Canopy geometry',url:'assets/study-1.svg',body:'Form, tension and temporary assembly.',position:1},
 {space_id:samples[0].id,type:'note',title:'Design premise',url:null,body:'A family of easily transported structures with few bespoke connections and minimal permanent foundations.',position:2},
 {space_id:samples[0].id,type:'link',title:'Research reference',url:'https://www.are.na/',body:'Shared sources on temporary structures and material culture.',position:3},
 {space_id:samples[1].id,type:'image',title:'Material study 01',url:'assets/study-2.svg',body:'Surface, repetition, form.',position:1},
 {space_id:samples[1].id,type:'note',title:'Working observations',url:null,body:'How might biological and geological time become legible through material transformation?',position:2},
 {space_id:samples[2].id,type:'image',title:'Observation system',url:'assets/study-3.svg',body:'Diagram of a marine sensing installation.',position:1},
 {space_id:samples[2].id,type:'note',title:'Open questions',url:null,body:'Develop reproducible instrument designs with transparent calibrations and public records of uncertainty.',position:2},
 {space_id:samples[3].id,type:'image',title:'Spatial form',url:'assets/study-4.svg',body:'Geometry and spatial organisation.',position:1}
]
function seed(){return {spaces:samples.map(s=>({...s})),materials:demoMaterials.map(x=>({...x,id:id(),created_at:now()})),releases:[],collaborators:[],operation_logs:[],user:{id:demoOwner,email:'founder@base.demo',name:'Founding participant'},member:true}}
let demo
function readDemo(){if(demo)return demo;try{demo=JSON.parse(localStorage.getItem(DEMO_KEY)||'null')}catch{};if(!demo){demo=seed();saveDemo()}demo.operation_logs ||= [];return demo}
function saveDemo(){localStorage.setItem(DEMO_KEY,JSON.stringify(demo))}
let session=null, user=null, isMember=false
function bearer(){return session?.access_token || (config.supabaseAnonKey.startsWith('eyJ')?config.supabaseAnonKey:null)}
async function request(path,{method='GET',body,prefer}={}){
 const r=await fetch(config.supabaseUrl.replace(/\/$/,'')+path,{method,headers:{apikey:config.supabaseAnonKey,...(bearer()?{Authorization:`Bearer ${bearer()}`} : {}),...(body?{'Content-Type':'application/json'}:{}),...(prefer?{Prefer:prefer}:{})},body:body===undefined?undefined:JSON.stringify(body)})
 const text=await r.text();let result
 try{result=text?JSON.parse(text):null}catch{result=text}
 if(!r.ok)throw new Error(result?.message||result?.error_description||result?.hint||`Request failed (${r.status})`)
 return result
}
const rest=(table,query='',opts={})=>request(`/rest/v1/${table}${query?`?${query}`:''}`,opts)
const rpc=(name,body={})=>request(`/rest/v1/rpc/${name}`,{method:'POST',body})
async function refresh(){if(!session?.refresh_token)return;try{const next=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}});session=next;localStorage.setItem(SESSION_KEY,JSON.stringify(next))}catch{session=null;user=null;localStorage.removeItem(SESSION_KEY)}}
async function bootAuth(){
 if(!live){readDemo();return}
 const params=new URLSearchParams(location.hash.slice(1));
 if(params.has('access_token')&&params.has('refresh_token')){
  session={access_token:params.get('access_token'),refresh_token:params.get('refresh_token'),expires_at:Math.floor(Date.now()/1000)+Number(params.get('expires_in')||3600)}
  localStorage.setItem(SESSION_KEY,JSON.stringify(session));history.replaceState(null,'',location.pathname+'#explore')
 }
 try{session=JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{session=null}
 if(session){if(session.expires_at && session.expires_at<Math.floor(Date.now()/1000)+100)await refresh()
  if(session){try{user=await request('/auth/v1/user');const memberships=await rest('memberships',`select=status&user_id=eq.${encodeURIComponent(user.id)}&limit=1`);isMember=memberships?.[0]?.status==='active'}catch{session=null;user=null;isMember=false;localStorage.removeItem(SESSION_KEY)}}}
}
export async function init(){await bootAuth()}
export function me(){if(!live){const d=readDemo();return {user:d.user,member:d.member,demo:true}}return {user,member:isMember,demo:false}}
export async function signIn(email){if(!live)return;return request('/auth/v1/otp?redirect_to='+encodeURIComponent(location.origin+location.pathname),{method:'POST',body:{email,create_user:false}})}
export async function signOut(){if(!live){demo=seed();saveDemo();return}try{await request('/auth/v1/logout',{method:'POST'})}catch{}session=null;user=null;isMember=false;localStorage.removeItem(SESSION_KEY)}
function ensureMember(){if(!me().member)throw new Error('Active membership is required.')}
export async function listSpaces(scope='explore'){
 if(!live){const d=readDemo();return d.spaces.filter(s=>scope==='mine'||s.visibility==='public').sort((a,b)=>b.updated_at.localeCompare(a.updated_at))}
 const spaces=await rest('spaces','select=id,title,summary,cover_url,author_name,visibility,owner_id,parent_release_id,updated_at&order=updated_at.desc&limit=200')
 if(scope!=='mine')return spaces.filter(s=>s.visibility==='public')
 if(!user)return []
 const collaborations=await rest('space_collaborators',`select=space_id&user_id=eq.${encodeURIComponent(user.id)}`)
 const joined=new Set(collaborations.map(c=>c.space_id))
 return spaces.filter(s=>s.owner_id===user.id||joined.has(s.id))
}
export async function getSpace(spaceId){
 if(!live){const d=readDemo();const s=d.spaces.find(x=>x.id===spaceId);if(!s)return null;return {...s,materials:d.materials.filter(x=>x.space_id===spaceId).sort((a,b)=>a.position-b.position),can_edit:true}}
 const matches=await rest('spaces',`select=*&id=eq.${encodeURIComponent(spaceId)}&limit=1`)
 const s=matches[0];if(!s)return null
 const materials=await rest('materials',`select=*&space_id=eq.${encodeURIComponent(spaceId)}&order=position.asc`)
 return {...s,materials,can_edit:!!user&&(s.owner_id===user.id||await isCollaborator(spaceId))}
}
async function isCollaborator(spaceId){const rows=await rest('space_collaborators',`select=user_id&space_id=eq.${encodeURIComponent(spaceId)}&user_id=eq.${encodeURIComponent(user.id)}&limit=1`);return !!rows.length}
export async function createSpace(values){ensureMember();if(!live){const d=readDemo();const s={id:id(),owner_id:d.user.id,author_name:d.user.name,...values,cover_url:values.cover_url||null,updated_at:now(),parent_release_id:null};d.spaces.unshift(s);saveDemo();return s}
 const rows=await rest('spaces','select=*',{method:'POST',prefer:'return=representation',body:{owner_id:user.id,author_name:user.user_metadata?.name||user.email.split('@')[0],...values}});return rows[0]}
export async function updateSpace(spaceId,values){ensureMember();if(!live){const d=readDemo();const s=d.spaces.find(x=>x.id===spaceId);Object.assign(s,values,{updated_at:now()});saveDemo();return s}
 const rows=await rest('spaces',`id=eq.${encodeURIComponent(spaceId)}&select=*`,{method:'PATCH',prefer:'return=representation',body:values});if(!rows?.length)throw new Error('Space not editable');return rows[0]}
export async function addMaterial(spaceId,values){ensureMember();if(!live){const d=readDemo();const m={...values,space_id:spaceId,id:id(),position:d.materials.filter(x=>x.space_id===spaceId).length+1,created_at:now()};d.materials.push(m);saveDemo();return m}
 const rows=await rest('materials','select=*',{method:'POST',prefer:'return=representation',body:{space_id:spaceId,...values}});return rows[0]}
export async function removeMaterial(materialId){ensureMember();if(!live){const d=readDemo();d.materials=d.materials.filter(m=>m.id!==materialId);saveDemo();return}await rest('materials',`id=eq.${encodeURIComponent(materialId)}`,{method:'DELETE'})}
export async function listReleases(spaceId){if(!live)return readDemo().releases.filter(x=>x.space_id===spaceId).sort((a,b)=>b.version-a.version);return rest('releases',`select=id,space_id,version,created_at&space_id=eq.${encodeURIComponent(spaceId)}&order=version.desc`)}
export async function releaseSpace(spaceId){ensureMember();if(!live){const d=readDemo();const s=d.spaces.find(x=>x.id===spaceId);if(!s)throw new Error('Unknown Space');const previous=d.releases.filter(x=>x.space_id===spaceId);const release={id:id(),space_id:spaceId,version:previous.length+1,created_at:now(),snapshot:{title:s.title,summary:s.summary,cover_url:s.cover_url,author_name:s.author_name,materials:d.materials.filter(m=>m.space_id===spaceId).map(m=>({type:m.type,title:m.title,url:m.url,body:m.body}))}};d.releases.push(release);saveDemo();return release}
 return rpc('release_space',{target_space_id:spaceId})}
export async function forkRelease(releaseId){ensureMember();if(!live){const d=readDemo();const r=d.releases.find(x=>x.id===releaseId);if(!r)throw new Error('Release not found');const src=d.spaces.find(x=>x.id===r.space_id);if(src?.visibility!=='public')throw new Error('Only public releases can be forked');const s={id:id(),owner_id:d.user.id,author_name:d.user.name,title:r.snapshot.title+' — fork',summary:r.snapshot.summary,cover_url:r.snapshot.cover_url,visibility:'private',parent_release_id:releaseId,updated_at:now()};d.spaces.unshift(s);r.snapshot.materials.forEach((m,i)=>d.materials.push({id:id(),space_id:s.id,...m,position:i+1,created_at:now()}));saveDemo();return s.id}
 return rpc('fork_release',{target_release_id:releaseId})}
export async function inviteCollaborator(spaceId,email){ensureMember();if(!live){return {message:`Demo invitation noted for ${email}. Multi-user invitations require Supabase.`}}await rpc('invite_space_collaborator',{target_space_id:spaceId,invitee_email:email});return {message:'Collaborator added. They can now access the Space.'}}
export async function listOperationLogs(spaceId){
 if(!live)return readDemo().operation_logs.filter(log=>log.space_id===spaceId).sort((a,b)=>b.created_at.localeCompare(a.created_at))
 return rest('operation_logs',`select=id,space_id,release_id,actor_id,title,details,created_at&space_id=eq.${encodeURIComponent(spaceId)}&order=created_at.desc&limit=100`)
}
export async function addOperationLog(spaceId, releaseId, values){
 ensureMember()
 const title=String(values.title||'').trim(),details=String(values.details||'').trim()
 if(title.length<2||title.length>180||details.length>5000)throw new Error('Enter a title (2–180 characters) and details of at most 5000 characters.')
 if(!releaseId)throw new Error('A released version is required to record operations.')
 if(!live){
  const d=readDemo(),s=d.spaces.find(s=>s.id===spaceId)
  if(!s || !d.releases.some(r=>r.id===releaseId&&r.space_id===spaceId))throw new Error('The release does not belong to this Space.')
  const log={id:id(),space_id:spaceId,release_id:releaseId,actor_id:d.user.id,title,details,created_at:now()}
  d.operation_logs.unshift(log);saveDemo();return log
 }
 const rows=await rest('operation_logs','select=*',{method:'POST',prefer:'return=representation',body:{space_id:spaceId,release_id:releaseId,actor_id:user.id,title,details}})
 return rows[0]
}
export function resetDemo(){demo=seed();saveDemo()}
