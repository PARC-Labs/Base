import * as db from './store.js'
import {config} from './config.js'
import {mediaTitle} from './media.js'
import {escapeHtml as e,safeUrl,shortDate} from './utils.js'

const root=document.getElementById('app')
const appState={view:'grid',search:'',materialSearch:'',mobileNav:false,loading:false}
const wordmark='<span class="wordmark">BASE</span>'
const icon={arrow:'↗',fork:'⑂',add:'＋',close:'×',search:'⌕'}
const nav=[['explore','EXPLORE'],['mine','MY SPACES'],['about','ABOUT']]
let lastRoute=''
const route=()=>location.hash.replace(/^#/,'')||'explore'
function go(path){location.hash='#'+path;if(route()===path)render();scrollTo({top:0,behavior:'instant'})}
function toast(message){const old=document.querySelector('.toast');old?.remove();const node=document.createElement('div');node.className='toast';node.role='status';node.textContent=message;document.body.append(node);setTimeout(()=>node.remove(),4500)}
function navHtml(current){return nav.map(([key,title])=>`<a class="nav-link ${current===key?'active':''}" href="#${key}">${title}</a>`).join('')}
function shell(main,current){
 const {user,demo}=db.me()
 return `<div class="frame"><header class="site-header"><a href="#explore" aria-label="Base home">${wordmark}</a></header><main class="page">${demo?'<div class="banner"><span>LOCAL PREVIEW</span><button class="text-btn" data-action="reset-demo">RESET</button></div>':''}${main}</main><footer class="site-footer" aria-label="Site navigation">${navHtml(current)}<a href="#apply">MEMBERSHIP</a>${user?'<a href="#signin">ACCOUNT</a>':'<a href="#signin">SIGN IN</a>'}</footer></div>`
}
const card=s=>`<a class="space-card" href="#space/${e(s.id)}">${s.cover_url&&safeUrl(s.cover_url)?`<img class="card-cover" src="${e(safeUrl(s.cover_url))}" alt="" loading="lazy">`:''}<span class="card-name">${e(s.title)}</span></a>`
function displaySpaces(spaces){
 const withImages=spaces.some(s=>s.cover_url&&safeUrl(s.cover_url))
 return `<div id="cards">${spaces.length?`<div class="${withImages?'space-grid':'space-index'}">${spaces.map(card).join('')}</div>`:'<p class="minimal-empty">No Spaces yet.</p>'}</div>`
}
async function explore(){
 const spaces=await db.listSpaces('explore')
 const filtered=spaces.filter(s=>(s.title+' '+s.summary).toLowerCase().includes(appState.search.toLowerCase()))
 return shell(`<section class="collection-page"><div class="collection-head"><h1>EXPLORE</h1><span class="micro">${String(spaces.length).padStart(2,'0')}</span></div>${spaces.length>4?`<label class="collection-search"><span class="visually-hidden">Search Spaces</span><input id="space-search" type="search" value="${e(appState.search)}" placeholder="SEARCH" aria-label="Search public Spaces"></label>`:''}${displaySpaces(filtered)}</section>`,'explore')
}
async function mine(){
 const {member,user}=db.me()
 if(!user)return signInPage()
 if(!member)return shell('<section class="form-layout"><h1 class="screen-label">MEMBERSHIP PENDING</h1><p class="notice">Access requires approval.</p><a class="text-btn" href="#apply">MEMBERSHIP ↗</a></section>','mine')
 const spaces=await db.listSpaces('mine')
 return shell(`<section class="collection-page"><div class="collection-head"><h1>MY SPACES</h1><a href="#new" class="text-btn">+ NEW SPACE</a></div>${displaySpaces(spaces)}</section>`,'mine')
}
function materialHtml(m,mode,edit=false){
 const searchText=[m.title,m.body,m.type,m.url].filter(Boolean).join(' ').toLowerCase()
 const hidden=appState.materialSearch&&!searchText.includes(appState.materialSearch)?' hidden':''
 const searchAttr=` data-material-search="${e(searchText)}"${hidden}`
 const url=safeUrl(m.asset_url||m.url)
 const image=m.type==='image'&&url, file=m.type==='file'
 const body=m.body?`<p>${e(m.body)}</p>`:''
 const linkLabel=file?'PDF ↗':m.type==='image'?'VIEW ↗':'SOURCE ↗'
 const link=url?`<a class="source-link" href="${e(url)}" target="_blank" rel="noopener noreferrer">${linkLabel}</a>`:''
 const missing=file&&!url?'<p class="micro">FILE UNAVAILABLE</p>':''
 const remove=edit?`<button class="text-btn small-link" data-action="remove-material" data-id="${e(m.id)}">REMOVE</button>`:''
 if(mode==='doc')return `<article class="doc-item"${searchAttr}>${image?`<img src="${e(url)}" loading="lazy" alt="${e(m.title||'Image')}">`:''}<h3>${e(m.title||'Untitled')}</h3>${body}${link}${missing}${remove}</article>`
 return `<article class="material"${searchAttr}>${image?`<img src="${e(url)}" loading="lazy" alt="${e(m.title||'Image')}">`:''}<div class="material-copy"><h3>${e(m.title||'Untitled')}</h3>${body}${link}${missing}${remove}</div></article>`
}
function connectedSpacesHtml(links,editable){
 const outgoing=links.outgoing||[],incoming=links.incoming||[]
 if(!outgoing.length&&!incoming.length&&!editable)return ''
 const items=(list,canRemove)=>list.map(l=>`<div class="connected-item"><div><a href="#space/${e(l.related.id)}" class="connected-title">${e(l.related.title)} ↗</a>${l.note?`<p class="connected-note">${e(l.note)}</p>`:''}</div>${editable&&canRemove?`<button class="text-btn small-link" data-action="disconnect-space" data-id="${e(l.id)}">REMOVE</button>`:''}</div>`).join('')
 return `<section class="connected-spaces"><div class="section-head"><h2>CONNECTIONS</h2>${editable?'<button class="text-btn" data-action="connect-space">+ CONNECT</button>':''}</div>${outgoing.length?items(outgoing,true):''}${incoming.length?`<p class="micro connection-heading">REFERENCED BY</p>${items(incoming,false)}`:''}</section>`
}
function buildView(space,editable){
 return `<div class="system-view">${[['COMPONENTS','component'],['PROCEDURES','procedure']].map(([label,kind])=>{
  const items=space.materials.filter(m=>m.type===kind)
  return `<section class="system-group"><div class="section-head"><h3>${label}</h3>${editable?`<button class="text-btn" data-action="add-${kind}">+ ADD</button>`:''}</div>${items.map(m=>`<article class="system-entry"><h4>${e(m.title)}</h4><p>${e(m.body||'')}</p>${editable?`<button class="text-btn small-link" data-action="remove-material" data-id="${e(m.id)}">REMOVE</button>`:''}</article>`).join('')}</section>`
 }).join('')}</div>`
}
function operationView(logs,releases,editable){
 const latest=releases[0]
 return `<div class="system-view"><div class="section-head"><h3>ACTIVITY</h3>${latest&&editable?'<button class="text-btn" data-action="record-activity">+ RECORD</button>':''}</div>${logs.map(log=>`<article class="system-entry"><p class="micro">${shortDate(log.created_at)}</p><h4>${e(log.title)}</h4>${log.details?`<p>${e(log.details)}</p>`:''}</article>`).join('')}${!latest&&editable?'<p class="micro">Create a release to record activity.</p>':''}</div>`
}
async function spacePage(spaceId){
 const s=await db.getSpace(spaceId)
 if(!s)return shell('<section class="form-layout"><h1 class="screen-label">SPACE UNAVAILABLE</h1><a href="#explore">EXPLORE ↗</a></section>','space')
 const {member,user}=db.me()
 const owner=!!user&&s.owner_id===user.id,editable=!!member&&s.can_edit
 const [connections,releases]=await Promise.all([db.listSpaceConnections(s.id),db.listReleases(s.id)])
 const logs=appState.view==='operate'?await db.listOperationLogs(s.id):[]
 const matching=s.materials.filter(m=>[m.title,m.body,m.type,m.url].filter(Boolean).join(' ').toLowerCase().includes(appState.materialSearch))
 const materialView=`<div class="material-searchbar" ${s.materials.length>6?'':'hidden'}><label for="material-search" class="visually-hidden">Search materials</label><input id="material-search" type="search" placeholder="SEARCH MATERIAL" value="${e(appState.materialSearch)}" aria-label="Search material in this Space"><span class="micro" id="material-search-count">${matching.length} / ${s.materials.length}</span></div><div class="${appState.view==='grid'?'materials':'document-view'}" ${editable?'data-media-dropzone="true"':''}>${s.materials.map(m=>materialHtml(m,appState.view,editable)).join('')}</div><p class="micro material-no-results" id="material-no-results" ${!appState.materialSearch||matching.length?'hidden':''}>No matching material.</p>`
 const body=appState.view==='build'?buildView(s,editable):appState.view==='operate'?operationView(logs,releases,editable):materialView
 const hasSide=owner||releases.length>0
 return shell(`<section class="space-hero"><h1 class="space-title">${e(s.title)}</h1>${s.summary?`<p class="space-summary">${e(s.summary)}</p>`:''}<div class="space-meta"><span>${e(s.visibility.toUpperCase())}</span><span>${s.materials.length} MATERIAL${s.materials.length===1?'':'S'}</span>${s.parent_release_id?'<span>FORK</span>':''}</div></section><nav class="tabbar" aria-label="Space views"><button class="tab ${appState.view==='grid'?'active':''}" data-action="view" data-view="grid">GRID</button><button class="tab ${appState.view==='doc'?'active':''}" data-action="view" data-view="doc">DOCUMENT</button><button class="tab ${appState.view==='build'?'active':''}" data-action="view" data-view="build">BUILD</button><button class="tab ${appState.view==='operate'?'active':''}" data-action="view" data-view="operate">OPERATE</button><span class="spacer"></span>${editable?'<button class="text-btn" data-action="upload-media">+ UPLOAD</button><button class="text-btn" data-action="add-material">+ ADD</button>':''}<button class="text-btn" data-action="copy-link">SHARE ↗</button></nav><div class="split ${hasSide?'':'split-full'}"><section>${body}${connectedSpacesHtml(connections,editable)}</section>${hasSide?`<aside class="aside"><div class="space-actions">${owner?'<button class="text-btn" data-action="edit-space">EDIT</button><button class="text-btn" data-action="invite">INVITE</button>':''}</div>${owner||releases.length?`<div class="releases"><div class="section-head"><h3>RELEASES</h3>${owner?'<button class="text-btn" data-action="release">+ RELEASE</button>':''}</div>${releases.map(r=>`<div class="release-row"><span>v${e(r.version)} · ${shortDate(r.created_at)}</span>${s.visibility==='public'&&member?`<button class="text-btn" data-action="fork" data-release="${e(r.id)}">FORK ↗</button>`:''}</div>`).join('')}</div>`:''}</aside>`:''}</div>`,'space')
}
function newPage(){
 const {member}=db.me()
 if(!member)return shell('<section class="form-layout"><h1 class="screen-label">MEMBERSHIP REQUIRED</h1><a href="#signin">SIGN IN ↗</a></section>','new')
 return shell(`<section class="form-layout"><h1 class="screen-label">NEW SPACE</h1><form data-form="new"><div class="field"><label for="title">TITLE</label><input id="title" name="title" placeholder="Untitled" minlength="2" maxlength="140" required></div><div class="field"><label for="summary">DESCRIPTION (OPTIONAL)</label><textarea id="summary" name="summary" maxlength="2000"></textarea></div><div class="field"><label for="visibility">VISIBILITY</label><select name="visibility" id="visibility"><option value="private">Private</option><option value="public">Public</option></select></div><div class="form-actions"><button class="btn" type="submit">CREATE ↗</button><a href="#mine" class="btn ghost">CANCEL</a></div><p class="notice" data-form-status role="status"></p></form></section>`,'new')
}
function aboutPage(){
 return shell('<article class="utility-document"><h1>ABOUT</h1><div class="utility-copy"><p>Base is an independent environment for collecting, developing and sharing work.</p><p>Research, art, design and systems.</p></div></article>','about')
}
function applyPage(){
 const email=config.applicationsEmail,valid=email&&!email.endsWith('example.org')
 return shell(`<article class="utility-document"><h1>MEMBERSHIP</h1><div class="utility-copy"><p>Founding access is by invitation.</p>${valid?`<p><a class="text-btn" href="mailto:${e(email)}?subject=Base%20%E2%80%94%20Membership%20enquiry">ENQUIRE ↗</a></p>`:''}</div></article>`,'apply')
}
function signInPage(){
 const {user,member,demo}=db.me()
 if(user)return shell(`<article class="utility-document"><h1>ACCOUNT</h1><div class="utility-copy"><p>${e(user.email||'Demo account')}</p><p class="micro">${member?'ACTIVE':'PENDING APPROVAL'}</p><div class="form-actions">${member?'<a class="text-btn" href="#mine">MY SPACES ↗</a>':''}${!demo?'<button class="text-btn" data-action="signout">SIGN OUT</button>':'<button class="text-btn" data-action="reset-demo">RESET</button>'}</div></div></article>`,'signin')
 return shell(`<article class="utility-document"><h1>SIGN IN</h1><div class="utility-copy">${db.authErrorMessage()?`<p class="notice error" role="alert">${e(db.authErrorMessage())}</p>`:''}<form data-form="signin"><div class="field"><label for="signin-email">EMAIL</label><input id="signin-email" type="email" name="email" autocomplete="email" placeholder="Email address" required></div><button class="text-btn" type="submit">SEND LINK ↗</button><p class="notice" data-form-status role="status"></p></form></div></article>`,'signin')
}
async function render(){const path=route();lastRoute=path;try{let html;if(path.startsWith('space/'))html=await spacePage(path.slice(6));else if(path==='explore')html=await explore();else if(path==='mine')html=await mine();else if(path==='new')html=newPage();else if(path==='about')html=aboutPage();else if(path==='apply')html=applyPage();else if(path==='signin')html=signInPage();else html=await explore();if(lastRoute===path){root.innerHTML=html;document.title=(path==='explore'?'Explore':path.startsWith('space/')?'Space':path==='mine'?'My Spaces':'Base')+' — Base'}}catch(err){root.innerHTML=shell(`<div class="empty"><h3>Unable to load this page.</h3><p>${e(err.message)}</p><button class="btn ghost" data-action="retry">TRY AGAIN</button></div>`,'error')}}
const modal=(title,body)=>{document.querySelector('.dialog-backdrop')?.remove();const wrapper=document.createElement('div');wrapper.className='dialog-backdrop';wrapper.innerHTML=`<div class="dialog" role="dialog" aria-modal="true" aria-label="${e(title)}"><div class="dialog-header"><button class="text-btn" data-action="close-modal" aria-label="Close dialog">✕</button></div><h2>${e(title)}</h2>${body}</div>`;document.body.append(wrapper);wrapper.querySelector('input,textarea,select,button')?.focus()}
function modalForm(name,fields,action='SAVE'){modal(name,`<form data-form="${e(name.toLowerCase().replaceAll(' ','-'))}">${fields}<div class="form-actions"><button class="btn" type="submit">${e(action)} ↗</button><button class="btn ghost" data-action="close-modal" type="button">CANCEL</button></div><p class="notice" data-form-status role="status"></p></form>`)}
const field=(label,name,value='',opts='')=>`<div class="field"><label for="dialog-${e(name)}">${e(label)}</label><input id="dialog-${e(name)}" name="${e(name)}" value="${e(value||'')}" ${opts}></div>`
function currentId(){return route().startsWith('space/')?route().slice(6):null}
function value(form,key){return form.elements.namedItem(key)?.value?.trim()||''}
async function perform(fn,form){const button=form?.querySelector('button[type="submit"]');const status=form?.querySelector('[data-form-status]');if(button)button.disabled=true;if(status){status.classList.remove('error');status.textContent='Working…'}try{const result=await fn();document.querySelector('.dialog-backdrop')?.remove();return result}catch(err){if(status){status.textContent=err.message;status.classList.add('error')}else toast(err.message);return null}finally{if(button)button.disabled=false}}
root.addEventListener('click',async ev=>{
 const target=ev.target.closest('[data-action]');if(!target)return;const action=target.dataset.action;
 if(action==='menu'){appState.mobileNav=!appState.mobileNav;await render();return}
 if(action==='account'){go('signin');return}
 if(action==='retry'){render();return}
 if(action==='reset-demo'){if(confirm('Clear all local preview changes and restore sample Spaces?')){db.resetDemo();go('explore');toast('Preview reset')}return}
 if(action==='signout'){await db.signOut();go('explore');return}
 if(action==='view'){appState.view=target.dataset.view;render();return}
 if(action==='connect-space'){
  try{
   const available=await db.listLinkableSpaces(id)
   if(!available.length){toast('Create another Space to connect.');return}
   const options=available.map(s=>`<option value="${e(s.id)}">${e(s.title)} — ${e(s.visibility)}</option>`).join('')
   modalForm('Connect Space',`<div class="field"><label for="connected-target">Related Space</label><select name="target_space" id="connected-target" required>${options}</select></div><div class="field"><label for="connected-note">NOTE (OPTIONAL)</label><textarea id="connected-note" name="note" maxlength="500" placeholder=""></textarea></div><p class="micro"></p>`,'CONNECT')
  }catch(error){toast(error.message)}
  return
 }
 if(action==='disconnect-space'){
  if(!confirm('Remove this connection? The related Space will be unchanged.'))return
  try{await db.disconnectSpace(target.dataset.id);toast('Connection removed.');render()}catch(error){toast(error.message)}
  return
 }
 if(action==='copy-link'){try{await navigator.clipboard.writeText(location.href);toast('Space link copied')}catch{toast('Select and copy the address from your browser.')}return}
 const id=currentId();if(!id)return;
 if(action==='upload-media'){
  modalForm('Upload media',`<div class="field"><label for="base-media-file">Image or PDF</label><input id="base-media-file" name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" required></div><p class="micro">JPG / PNG / WEBP / PDF · 5 MB MAX</p>${field('Title (optional)','title','','maxlength="180"')}<div class="field"><label for="media-notes">CAPTION (OPTIONAL)</label><textarea id="media-notes" name="body" maxlength="10000"></textarea></div>`,'UPLOAD');return
 }
 if(['add-material','add-component','add-procedure'].includes(action)){modalForm('Add material',`<div class="field"><label>Type</label><select name="type" id="material-type"><option value="note">Note / text</option><option value="link">Web link</option><option value="image">Image URL</option><option value="component">System component</option><option value="procedure">Procedure / protocol</option></select></div>${field('Title','title','', 'maxlength="180" required')}${field('SOURCE URL','url','', 'type="url" placeholder="https://"')}<div class="field"><label>TEXT</label><textarea name="body" maxlength="10000" placeholder=""></textarea></div>`,'ADD TO SPACE');if(action==='add-component'||action==='add-procedure')document.querySelector('#material-type').value=action.slice(4);return}
 if(action==='edit-space'){const s=await db.getSpace(id);modalForm('Edit space',`${field('Title','title',s.title,'required maxlength="140"')}<div class="field"><label>DESCRIPTION</label><textarea name="summary" maxlength="2000">${e(s.summary||'')}</textarea></div>${field('COVER URL','cover_url',s.cover_url||'','type="url" placeholder="https://"')}<div class="field"><label>VISIBILITY</label><select name="visibility"><option value="private" ${s.visibility==='private'?'selected':''}>Private</option><option value="public" ${s.visibility==='public'?'selected':''}>Public</option></select></div>`);return}
 if(action==='invite'){modalForm('Invite collaborator',`${field('MEMBER EMAIL','email','','required type="email"')}<p class="muted"></p>`,'INVITE');return}
 if(action==='record-activity'){const releases=await db.listReleases(id);if(!releases.length){toast('Create a release first.');return}modalForm('Record activity',`${field('TITLE','title','','required maxlength="180"')}<div class="field"><label for="activity-details">DETAILS</label><textarea id="activity-details" name="details" maxlength="5000" placeholder=""></textarea></div><p class="micro">THE RECORD WILL BE ATTACHED TO RELEASE v${e(releases[0].version)}.0</p>`,'RECORD ACTIVITY');return}
 if(action==='release'){if(!confirm('Create an immutable release of the current Space?'))return;try{await db.releaseSpace(id);toast('A new release was created.');render()}catch(err){toast(err.message)}return}
 if(action==='fork'){if(!confirm('Fork this release as a new private Space?'))return;try{const next=await db.forkRelease(target.dataset.release);go('space/'+next);toast('Fork created. This is now your independent Space.')}catch(err){toast(err.message)}return}
 if(action==='remove-material'){if(!confirm('Remove this material from this Space?'))return;try{await db.removeMaterial(target.dataset.id);toast('Material removed.');render()}catch(err){toast(err.message)}}
})
document.addEventListener('click',ev=>{if(ev.target.matches('.dialog-backdrop')||ev.target.closest('[data-action="close-modal"]'))document.querySelector('.dialog-backdrop')?.remove()})
root.addEventListener('input',ev=>{
 if(ev.target.id==='material-search'){
  const query=ev.target.value.trim().toLowerCase()
  appState.materialSearch=query
  const cards=[...root.querySelectorAll('[data-material-search]')]
  let matching=0
  cards.forEach(card=>{card.hidden=!card.dataset.materialSearch.includes(query);if(!card.hidden)matching++})
  const counter=root.querySelector('#material-search-count')
  if(counter)counter.textContent=matching+' / '+cards.length
  const empty=root.querySelector('#material-no-results')
  if(empty)empty.hidden=!query||matching!==0
 }
 if(ev.target.id==='space-search'){
  appState.search=ev.target.value
  db.listSpaces('explore').then(spaces=>{
   const el=root.querySelector('#cards')
   if(el)el.outerHTML=displaySpaces(spaces.filter(s=>(s.title+' '+s.summary).toLowerCase().includes(appState.search.toLowerCase())))
  }).catch(()=>{})
 }
})
document.addEventListener('submit',async ev=>{const form=ev.target.closest('[data-form]');if(!form)return;ev.preventDefault();const kind=form.dataset.form;const id=currentId();let done=null;
 if(kind==='new'){done=await perform(()=>db.createSpace({title:value(form,'title'),summary:value(form,'summary'),visibility:value(form,'visibility')}),form);if(done)go('space/'+done.id)}
 if(kind==='add-material'){const type=value(form,'type');const url=value(form,'url');if(['link','image'].includes(type)&&!url){const status=form.querySelector('[data-form-status]');status.textContent='Enter a URL.';status.classList.add('error');return}if(['note','component','procedure'].includes(type)&&!value(form,'body')){const status=form.querySelector('[data-form-status]');status.textContent='Enter text.';status.classList.add('error');return}done=await perform(()=>db.addMaterial(id,{type,title:value(form,'title'),url:['note','component','procedure'].includes(type)?null:url,body:value(form,'body')||null}),form);if(done){toast('Material added');render()}}
 if(kind==='connect-space'){
   done=await perform(()=>db.connectSpace(id,value(form,'target_space'),value(form,'note')),form)
   if(done){toast('Spaces connected.');render()}
  }
  if(kind==='upload-media'){
   const file=form.elements.namedItem('file')?.files?.[0]
   done=await perform(async()=>{
    if(!file)throw new Error('Choose an image or PDF.')
    return db.addUploadedMaterial(id,file,{title:value(form,'title')||mediaTitle(file.name),body:value(form,'body')})
   },form)
   if(done){toast('Media uploaded.');render()}
  }
  if(kind==='edit-space'){done=await perform(()=>db.updateSpace(id,{title:value(form,'title'),summary:value(form,'summary'),cover_url:value(form,'cover_url')||null,visibility:value(form,'visibility')}),form);if(done)render()}
 if(kind==='invite-collaborator'){done=await perform(()=>db.inviteCollaborator(id,value(form,'email')),form);if(done)toast(done.message)}
 if(kind==='record-activity'){const releases=await db.listReleases(id);done=await perform(()=>db.addOperationLog(id,releases[0]?.id,{title:value(form,'title'),details:value(form,'details')}),form);if(done){toast('Operational activity recorded');render()}}
 if(kind==='signin'){done=await perform(async()=>{await db.signIn(value(form,'email'));return true},form);if(done)toast('Check your inbox for a sign-in link. Open it in this browser.')}
})
root.addEventListener('dragover',ev=>{
 if(ev.dataTransfer?.types?.includes('Files')&&ev.target.closest('[data-media-dropzone]')){
  ev.preventDefault()
  ev.dataTransfer.dropEffect='copy'
 }
})
root.addEventListener('drop',async ev=>{
 const target=ev.target.closest('[data-media-dropzone]')
 if(!target)return
 ev.preventDefault()
 const file=ev.dataTransfer?.files?.[0],spaceId=currentId()
 if(!file||!spaceId)return
 target.classList.add('uploading')
 try{
  await db.addUploadedMaterial(spaceId,file,{title:mediaTitle(file.name)})
  toast('Media uploaded.')
  render()
 }catch(error){toast(error.message)}
 finally{target.classList.remove('uploading')}
})
window.addEventListener('hashchange',()=>{appState.search='';appState.materialSearch='';appState.mobileNav=false;render()})
window.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelector('.dialog-backdrop')?.remove()})
await db.init();await render()
