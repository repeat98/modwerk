import { createHash } from 'node:crypto'
// Inspect committed documentation and PNG pixels; never run module source.
import { readFile } from 'node:fs/promises'
import { inflateSync } from 'node:zlib'
import { resolveModuleFile } from '../src/catalog/module-folder.ts'
import { requireModuleUiForPublication } from '../src/catalog/module-contract.ts'

export const REQUIRED_README_SECTIONS = ['Overview','Controls','Usage','Compatibility and limitations','Tests and measurements','Authorship and licences','Screens and audio']
export function requireCompleteReadme(document, readme) {
  const headings=[...readme.matchAll(/^#{1,6}\s+(.+)\r?$/gm)]
  for(const title of REQUIRED_README_SECTIONS) {
    const index=headings.findIndex(heading=>heading[1].trim().toLowerCase()===title.toLowerCase())
    if(index<0||!readme.slice(headings[index].index+headings[index][0].length,headings[index+1]?.index).trim()) throw new Error(document.id+': README requires a populated '+title+' section')
  }
  const documentation=document.tests.retainedEvidence?.documentation??document.tests.qualification?.documentation??document.tests.releaseWaiver?.documentation??document.tests.documentation
  if(!documentation) throw new Error(document.id+': complete release documentation is required')
  const tutorial=documentation.tutorial
  const tutorialIndex=headings.findIndex(heading=>heading[1].trim()===tutorial.title)
  if(tutorialIndex<0) throw new Error(document.id+': README must contain the declared short tutorial heading')
  const tutorialText=readme.slice(headings[tutorialIndex].index+headings[tutorialIndex][0].length,headings[tutorialIndex+1]?.index)
  let position=0
  for(const step of tutorial.steps) {
    const index=tutorialText.indexOf(step,position)
    if(index<0) throw new Error(document.id+': README and declared tutorial steps must match in order')
    position=index+step.length
  }
  for(const path of documentation.screenshots) if(!readme.includes(']('+path+')')) throw new Error(document.id+': README must link or embed the documentation screenshot '+path)
}

/** Bounded decoding of ordinary lossless PNG captures, including grayscale/palette formats. */
export function requireMonochromePng(bytes) {
  const fail=()=>{throw new Error('Documentation screenshots require a valid noninterlaced black-and-white PNG; yellow/colored pixels are not allowed')}
  if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) fail()
  let header,palette,alpha,end=false;const chunks=[]
  for(let offset=8;offset+12<=bytes.length;) {
    const size=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8)
    if(size>bytes.length-offset-12) fail()
    const data=bytes.subarray(offset+8,offset+8+size)
    if(type==='IHDR') {if(header||offset!==8||size!==13) fail();header=data}
    if(type==='PLTE') palette=data
    if(type==='tRNS') alpha=data
    if(type==='IDAT') chunks.push(data)
    offset+=12+size
    if(type==='IEND') {end=true;break}
  }
  if(!header||!end||!chunks.length) fail()
  const width=header.readUInt32BE(0),height=header.readUInt32BE(4),depth=header[8],type=header[9],channels={0:1,2:3,3:1,4:2,6:4}[type]
  if(!width||!height||width>2048||height>2048||!channels||header[10]||header[11]||header[12]||!([0,3].includes(type)?[1,2,4,8].includes(depth):depth===8)) fail()
  if(type===3&&(!palette||!palette.length||palette.length>768||palette.length%3)) fail()
  const stride=Math.ceil(width*channels*depth/8),bpp=Math.max(1,Math.ceil(channels*depth/8)),length=(stride+1)*height
  let raw;try{raw=inflateSync(Buffer.concat(chunks),{maxOutputLength:length})}catch{fail()}
  if(raw.length!==length) fail()
  let previous=Buffer.alloc(stride)
  const paeth=(a,b,c)=>{const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);return da<=db&&da<=dc?a:db<=dc?b:c}
  for(let y=0;y<height;y++) {
    const offset=y*(stride+1),filter=raw[offset],row=Buffer.alloc(stride)
    if(filter>4) fail()
    for(let x=0;x<stride;x++) {
      const a=x>=bpp?row[x-bpp]:0,b=previous[x],c=x>=bpp?previous[x-bpp]:0
      row[x]=(raw[offset+1+x]+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter])&255
    }
    for(let x=0;x<width;x++) {
      let r,g,b,opacity=255
      if(type===2||type===6) {const i=x*channels;r=row[i];g=row[i+1];b=row[i+2];if(type===6) opacity=row[i+3]}
      else if(type===3) {
        const bit=x*depth,index=(row[Math.floor(bit/8)]>>(8-depth-bit%8))&((1<<depth)-1)
        if(!palette||index*3+2>=palette.length) fail()
        r=palette[index*3];g=palette[index*3+1];b=palette[index*3+2];opacity=alpha?.[index]??255
      } else continue // Grayscale and grayscale-alpha are monochrome by definition.
      if(opacity&&(r!==g||g!==b)) fail()
    }
    previous=row
  }
}

export async function requireModuleDocumentation(folder, document, retainedVersion) {
  requireModuleUiForPublication(document, retainedVersion)
  requireCompleteReadme(document,await readFile(await resolveModuleFile(folder,'README.md'),'utf8'))
  const documentation=document.tests.retainedEvidence?.documentation??document.tests.qualification?.documentation??document.tests.releaseWaiver?.documentation??document.tests.documentation
  for(const path of documentation.screenshots) {
    const media=document.media.find(item=>item.path===path)
    if(!media||media.captureType==='audio'||!path.endsWith('.png')) throw new Error(document.id+': tutorial screenshots must reference declared hardware/emulator PNG media')
  }
  const paths=new Set([...document.access.screenshots,...documentation.screenshots])
  for(const path of paths) {
    if(!path.endsWith('.png')) throw new Error(document.id+': release documentation screenshots must be black-and-white PNGs')
    try{requireMonochromePng(await readFile(await resolveModuleFile(folder,path)))}catch(error){throw new Error(document.id+'/'+path+': '+error.message,{cause:error})}
  }
}

/** Documentation evidence is independent of firmware/audio/hardware qualification. */
export async function requireModwerkDocumentation(folder, document) {
  const docs = document.tests.documentation
  if (!docs) return
  requireCompleteReadme(document, await readFile(await resolveModuleFile(folder, 'README.md'), 'utf8'))
  const record = JSON.parse(await readFile(await resolveModuleFile(folder, docs.captureRecord), 'utf8'))
  const records = record.schemaVersion === 2 && Array.isArray(record.records) && record.records.length > 0 && record.records.length <= 12 ? record.records : [record]
  if (record.machine !== document.machine || record.moduleId !== document.id || record.moduleVersion !== document.version) throw new Error(document.id + ': capture record identity differs')
  for (const record of records) if (record.schemaVersion !== 1 || record.machine !== document.machine || record.moduleId !== document.id || record.moduleVersion !== document.version || !/^[a-f0-9]{64}$/.test(record.imageSha256)) throw new Error(document.id + ': capture record must identify this module, version and built image')
  for (const path of new Set([...('screenshots' in document.access ? document.access.screenshots : []), ...docs.screenshots])) {
    const media = document.media.find(item => item.path === path && item.kind === 'screenshot')
    const matches = records.flatMap(record => (record.captures ?? []).filter(item => item.path === path).map(capture => ({ record, capture })))
    if (matches.length !== 1) throw new Error(document.id + ': screenshot needs one capture record: ' + path)
    const { record, capture } = matches[0]
    if (!path.endsWith('.png') || !media?.capture || media.capture.imageSha256 !== record.imageSha256 || media.capture.release !== record.firmware || !capture?.plan?.trim()) throw new Error(document.id + ': screenshot needs a matching image/release and panel-input plan in capture.json: ' + path)
    const bytes = await readFile(await resolveModuleFile(folder, path))
    requireMonochromePng(bytes)
    if (createHash('sha256').update(bytes).digest('hex') !== capture.sha256) throw new Error(document.id + ': screenshot hash differs from capture.json: ' + path)
  }
}
