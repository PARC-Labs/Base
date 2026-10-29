export function escapeHtml(value='') {return String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
export function safeUrl(value='') {try{const u=new URL(value,typeof document!=='undefined'?document.baseURI:location.origin+'/');return ['http:','https:'].includes(u.protocol)?u.href:null}catch{return null}}
export function shortDate(value){try{return new Date(value).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}catch{return ''}}
export function initials(value){return String(value||'?').trim().split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()||'').join('')}
