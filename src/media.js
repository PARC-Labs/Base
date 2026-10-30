// Client-side preprocessing. All image resizing runs locally; no paid media API.
export const IMAGE_SOURCE_LIMIT = 12 * 1024 * 1024
export const PDF_LIMIT = 5 * 1024 * 1024
export const IMAGE_OUTPUT_LIMIT = 2 * 1024 * 1024
const allowedImages = new Set(['image/jpeg','image/png','image/webp'])

function canvasBlob(canvas, quality){
 return new Promise(resolve => canvas.toBlob(resolve,'image/webp',quality))
}
async function loadImage(file){
 if(typeof createImageBitmap === 'function'){
  try{return await createImageBitmap(file,{imageOrientation:'from-image'})}catch{}
 }
 const url=URL.createObjectURL(file)
 try{
  return await new Promise((resolve,reject)=>{
   const img=new Image()
   img.onload=()=>resolve(img)
   img.onerror=()=>reject(new Error('This image cannot be decoded.'))
   img.src=url
  })
 }finally{URL.revokeObjectURL(url)}
}
export async function prepareMedia(file){
 if(!file || typeof file.size!=='number')throw new Error('Choose an image or PDF.')
 const type=String(file.type||'').toLowerCase()
 if(type==='application/pdf'){
  if(!file.size||file.size>PDF_LIMIT)throw new Error('PDFs must be no larger than 5 MB.')
  // Confirm the PDF signature instead of trusting the browser MIME label alone.
  const header=new Uint8Array(await file.slice(0,5).arrayBuffer())
  if(String.fromCharCode(...header)!=='%PDF-')throw new Error('This file is not a valid PDF.')
  return {blob:file,mime:'application/pdf',extension:'pdf',type:'file'}
 }
 if(!allowedImages.has(type))throw new Error('Choose a JPG, PNG, WebP image or PDF. SVG and animated files are not accepted.')
 if(!file.size||file.size>IMAGE_SOURCE_LIMIT)throw new Error('Images must be no larger than 12 MB before compression.')
 if(typeof document==='undefined')throw new Error('Image compression requires a browser.')
 const image=await loadImage(file)
 const width=image.width||image.naturalWidth,height=image.height||image.naturalHeight
 if(!width||!height)throw new Error('This image has no readable dimensions.')
 // Keep memory consumption bounded on mobile. A 12 MB source can decode to a huge bitmap.
 if(width*height>45_000_000)throw new Error('Image dimensions are too large.')
 const scale=Math.min(1,1600/Math.max(width,height))
 const canvas=document.createElement('canvas')
 canvas.width=Math.max(1,Math.round(width*scale))
 canvas.height=Math.max(1,Math.round(height*scale))
 const ctx=canvas.getContext('2d')
 if(!ctx)throw new Error('Image compression is unavailable on this browser.')
 ctx.drawImage(image,0,0,canvas.width,canvas.height)
 if(typeof image.close==='function')image.close()
 for(const quality of [0.82,0.72,0.62,0.5]){
  const blob=await canvasBlob(canvas,quality)
  if(blob?.type==='image/webp'&&blob.size>0&&blob.size<=IMAGE_OUTPUT_LIMIT)
   return {blob,mime:'image/webp',extension:'webp',type:'image'}
 }
 throw new Error('Image cannot be reduced below 2 MB. Try a smaller picture.')
}
export function mediaTitle(filename){
 return String(filename||'').replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').trim().slice(0,180)||'Untitled material'
}
