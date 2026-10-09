import { describe, expect, it } from 'vitest'
import { parseModuleDocument, requireModuleUiForPublication } from './module-contract'
import { compareModuleVersions } from './versions'
import example from '../../public/module-repository.example.json'
import catalog from './module-documents.json'
import sdkCatalog from '../../sdk/catalog.json'
describe('module folder contract',()=>{
 it('retains multiple credited contributors without replacing the primary author',()=>{
  const contributors=[{github:'bryantysinger',name:'Bryan Tysinger'},{github:'tester-two'}]
  expect(parseModuleDocument({...example,author:{...example.author,contributors}}).author).toEqual({...example.author,contributors})
  for(const invalid of [[{github:example.author.github.toUpperCase()}],[...contributors,{github:'BRYANTYSINGER'}],[{github:'https://example.com'}],[{github:'tester',name:''}],[{github:'tester',maintainer:true}],Array(21).fill({github:'tester'})])expect(()=>parseModuleDocument({...example,author:{...example.author,contributors:invalid}})).toThrow('author.contributors')
 })
 it('requires exact versions and retains honest evidence for every catalog module',()=>{
  expect(parseModuleDocument(example).version).toBe('0.1.0')
  expect(catalog.modules.map(module=>parseModuleDocument(module).id)).toEqual(sdkCatalog.modules.map(module=>module.id))
  expect(parseModuleDocument(catalog.modules.find(m=>m.id==='tapeecho')).tests.summary).toContain('seventh freezing')
  expect(parseModuleDocument(catalog.modules.find(m=>m.id==='miniverb')).tests.hardwareStatus).toBe('untested')
 })
 it('requires exact source pins and an honest pending-build declaration',()=>{
  const source={repository:'https://github.com/sambanks/octabam',revision:'a'.repeat(40),path:'modules/quantizer'}
  const build={status:'pending',reason:'Awaiting Octamod verification.'}
  expect(parseModuleDocument({...example,source,build,category:'machines'}).source).toEqual(source)
  expect(parseModuleDocument({...example,source,build,category:'system'}).category).toBe('system')
  for(const change of [{revision:'main'},{repository:'http://github.com/sambanks/octabam'},{repository:'https://github.com/sambanks/octabam?token=secret'},{path:'../modules/quantizer'},{extra:true}])expect(()=>parseModuleDocument({...example,source:{...source,...change}})).toThrow()
  expect(()=>parseModuleDocument({...example,build})).toThrow('source pin')
  for(const change of [{status:'verified'},{reason:''},{override:true}])expect(()=>parseModuleDocument({...example,source,build:{...build,...change}})).toThrow()
 })
 it('rejects undeclared fields, invalid versions and unsafe source or media paths',()=>{
  for(const bad of [{...example,extra:'unreviewed'},{...example,version:'latest'},{...example,version:'01.0.0'},{...example,version:'1.0.0-01'},{...example,nativeManifest:'../manifest.py'},{...example,license:{...example.license,file:'firmware.bin'}}])expect(()=>parseModuleDocument(bad)).toThrow()
  const media={path:'media/screen.png',captureType:'emulator',caption:'Actual capture',alt:'The effect page',credit:'Author',license:'CC-BY-4.0',source:'original'}
  expect(parseModuleDocument({...example,media:[media]}).media[0].alt).toBe('The effect page')
  for(const change of [{path:'../media/screen.png'},{path:'media/upgrade.bin'},{captureType:'audio'},{credit:''},{source:'http://example.com/file'},{alt:''}])expect(()=>parseModuleDocument({...example,media:[{...media,...change}]})).toThrow()
 })
 it('rejects broken controls and false numeric resource claims',()=>{
  const control=example.controls[0]
  for(const change of [{default:128},{count:0},{labels:['one']},{doc:''}])expect(()=>parseModuleDocument({...example,controls:[{...control,...change}]})).toThrow()
  const resources=example.resources
  expect(()=>parseModuleDocument({...example,resources:{...resources,storage:{...resources.storage,value:30}}})).toThrow('unmeasured')
  expect(()=>parseModuleDocument({...example,resources:{...resources,processing:{...resources.processing,value:101,unit:'%',method:'hardware'}}})).toThrow('percentage')
 })
 it('requires real versioned OT location and control captures for publication, while allowing drafts',()=>{
  const ui={page:'FX2 SETUP',shows:'location-and-controls',firmware:'1.40C',moduleVersion:example.version,imageSha256:'a'.repeat(64),setup:'Headless ot_emu, MKII panel, stopped transport.'}
  const media={path:'media/fx2.png',captureType:'emulator',caption:'Select the effect in FX2 SETUP.',alt:'FX2 SETUP with the module selected.',credit:'Contributor',license:'LicenseRef-OT-UI-Documentation',source:'original',otUi:ui}
  const access={location:'Audio track FX2 SETUP',steps:['Select an audio track.','Hold FUNC and press FX2.'],screenshots:[media.path]}
  const draft=parseModuleDocument(example)
  expect(draft.access?.screenshots).toEqual([])
  expect(()=>requireModuleUiForPublication(draft)).toThrow('actual screenshots')
  const document=parseModuleDocument({...example,access,media:[media]})
  expect(()=>requireModuleUiForPublication(document)).not.toThrow()
  expect(document.media[0].otUi).toEqual(ui)
  expect(()=>requireModuleUiForPublication(parseModuleDocument({...example,access,media:[{...media,otUi:{...ui,moduleVersion:'0.0.1'}}]}))).toThrow('this module version')
  expect(()=>requireModuleUiForPublication(parseModuleDocument({...example,access,media:[{...media,otUi:{...ui,shows:'controls'}}]}))).toThrow('selected or enabled')
  expect(()=>requireModuleUiForPublication(parseModuleDocument({...example,access,media:[{...media,otUi:{...ui,shows:'location'}}]}))).toThrow('module controls')
  expect(()=>requireModuleUiForPublication(parseModuleDocument({...example,access,controls:[],media:[{...media,otUi:{...ui,shows:'location'}}]}))).not.toThrow()
  for(const change of [{screenshots:['media/missing.png']},{screenshots:[media.path,media.path]},{steps:[]},{extra:true}])expect(()=>parseModuleDocument({...example,access:{...access,...change},media:[media]})).toThrow()
  for(const change of [{firmware:'1.41'},{shows:'mockup'},{page:''},{moduleVersion:'latest'},{imageSha256:'main'},{setup:''},{extra:true}])expect(()=>parseModuleDocument({...example,access,media:[{...media,otUi:{...ui,...change}}]})).toThrow()
  expect(()=>parseModuleDocument({...example,access,media:[{...media,path:'media/sound.wav',captureType:'audio'}]})).toThrow('OT UI evidence')
  expect(()=>parseModuleDocument({...example,access,media:[{...media,otUi:undefined}]})).toThrow()
  const automatic={...example,category:'midi-usb',controls:[],compatibility:{...example.compatibility,location:'USB',effectId:null},access:{...access,screenshots:[],noUiReason:'USB Audio starts automatically and adds no OT page or controls.'},media:[]}
  expect(()=>requireModuleUiForPublication(parseModuleDocument(automatic))).not.toThrow()
  const documentation={tutorial:{title:'Connect USB',steps:['Select USB.','Connect the host.','Check the input.']},screenshots:[],screenshotStyle:'black-and-white'}
  expect(parseModuleDocument({...automatic,tests:{...automatic.tests,documentation}}).tests.documentation?.screenshots).toEqual([])
  expect(()=>parseModuleDocument({...example,tests:{...example.tests,documentation}})).toThrow('real documentation screenshots')
  const {noUiReason: _reason,...withoutReason}=automatic.access
  expect(_reason).toBeTruthy()
  expect(()=>parseModuleDocument({...automatic,access:withoutReason,tests:{...automatic.tests,documentation}})).toThrow('real documentation screenshots')
  expect(()=>parseModuleDocument({...automatic,controls:example.controls})).toThrow('no dedicated OT UI')
  expect(()=>parseModuleDocument({...automatic,compatibility:example.compatibility})).toThrow('no dedicated OT UI')
  expect(()=>parseModuleDocument({...automatic,access:{...automatic.access,noUiReason:''}})).toThrow()
 })
 it('accepts a separate author name while keeping the GitHub login and strict author fields',()=>{
  const author={...example.author,github:'repeat98',name:'Jannik Aßfalg'}
  expect(parseModuleDocument({...example,author}).author).toEqual(author)
  expect(parseModuleDocument(example).author.name).toBeUndefined()
  for(const name of ['',null,42,'a'.repeat(101),'Jannik\u0000Aßfalg'])expect(()=>parseModuleDocument({...example,author:{...author,name}})).toThrow('author.name')
  expect(()=>parseModuleDocument({...example,author:{...author,github:'Jannik Aßfalg'}})).toThrow('GitHub login')
  expect(()=>parseModuleDocument({...example,author:{...author,display:'Unrecognized'}})).toThrow('unknown field')
  expect(()=>parseModuleDocument({...example,author:{name:author.name,credits:author.credits}})).toThrow('required field')
 })
})
describe('module version ordering',()=>{
 it('requires actual semantic increases, including prerelease ordering',()=>{
  for(const [a,b] of [['1.0.1','1.0.0'],['1.1.0','1.0.99'],['2.0.0','1.99.99'],['1.0.0','1.0.0-rc.9'],['1.0.0-rc.10','1.0.0-rc.9'],['1.0.0-beta','1.0.0-alpha'],['1.0.0-alpha.1','1.0.0-alpha']]){expect(compareModuleVersions(a,b)).toBe(1);expect(compareModuleVersions(b,a)).toBe(-1)}
  expect(compareModuleVersions('1.0.0','1.0.0')).toBe(0)
  for(const value of ['0.01.0','1.0','1.0.0-01','latest','1.0.0+mutable'])expect(()=>compareModuleVersions(value,'1.0.0')).toThrow()
 })
})
