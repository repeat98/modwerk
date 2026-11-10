import { describe, expect, it } from 'vitest'
import { deflateSync } from 'node:zlib'
import { parseModuleDocument, requireModuleQualificationForPublication, requireModuleUiForPublication } from './module-contract'
import { requireCompleteReadme, requireMonochromePng, REQUIRED_README_SECTIONS } from '../../scripts/module-documentation.mjs'
import { qualificationFixture, qualificationMedia, qualificationReadme, qualificationPng } from './test-fixtures/qualification'
import example from '../../public/module-repository.example.json'

const document=()=>parseModuleDocument({...example,media:[qualificationMedia],tests:{...example.tests,hardwareStatus:'verified',qualification:qualificationFixture()}})
// Tiny original binary fixtures test pixel inspection, not screenshot authenticity.
function png(color:number[],type=2,filter=0,palette?:number[]) {
  const chunk=(name:string,data:Buffer)=>{const size=Buffer.alloc(4);size.writeUInt32BE(data.length);return Buffer.concat([size,Buffer.from(name),data,Buffer.alloc(4)])}
  const header=Buffer.alloc(13);header.writeUInt32BE(1,0);header.writeUInt32BE(1,4);header[8]=8;header[9]=type
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),...(palette?[chunk('PLTE',Buffer.from(palette))]:[]),chunk('IDAT',deflateSync(Buffer.from([filter,...color]))),chunk('IEND',Buffer.alloc(0))])
}
describe('release documentation gates',()=>{
  it('requires a complete README, matching short tutorial and linked screenshots',()=>{
    expect(()=>requireCompleteReadme(document(),qualificationReadme)).not.toThrow()
    for(const title of REQUIRED_README_SECTIONS) expect(()=>requireCompleteReadme(document(),qualificationReadme.replace('## '+title,'## Missing section'))).toThrow(title)
    expect(()=>requireCompleteReadme(document(),qualificationReadme.replace('Original fixture signal path and intended uses.',''))).toThrow('populated Overview')
    expect(()=>requireCompleteReadme(document(),qualificationReadme.replace('### Quick tutorial','### Different heading'))).toThrow('tutorial heading')
    expect(()=>requireCompleteReadme(document(),qualificationReadme.replace('Move the controls while playing a sample.','Unrelated step.'))).toThrow('steps must match')
    expect(()=>requireCompleteReadme(document(),qualificationReadme.replace('](media/ui.png)','](media/missing.png)'))).toThrow('screenshot')
  })
  it('rejects incomplete tutorial declarations, missing screenshots and the yellow style',()=>{
    const parse=(change:unknown)=>parseModuleDocument({...example,tests:{...example.tests,qualification:{...qualificationFixture(),documentation:change}}})
    const docs=qualificationFixture().documentation
    for(const change of [{...docs,tutorial:{...docs.tutorial,steps:docs.tutorial.steps.slice(0,2)}},{...docs,screenshots:[]},{...docs,screenshots:['media/ui.png','media/ui.png']},{...docs,screenshotStyle:'yellow'},undefined]) expect(()=>parse(change)).toThrow()
    const bad=document();bad.tests.qualification!.documentation.screenshots=['media/missing.png']
    expect(()=>requireModuleQualificationForPublication(bad)).toThrow('declared in media')
  })
  it('lets a module that draws nothing give access.noUiReason in place of screenshots, at any location, and still needs the tutorial',()=>{
    const docs={...qualificationFixture().documentation,screenshots:[]}
    const noUi={...example,controls:[],compatibility:{...example.compatibility,effectId:null,location:'Project sequencer',uiClaims:['key:TRIG+A']},access:{location:'The tempo LED, while the sequencer plays',steps:['Press PLAY and watch the tempo LED.'],screenshots:[],noUiReason:'It draws nothing: the tempo LED turns green on the pattern\'s first step.'},media:[],tests:{...example.tests,hardwareStatus:'verified',qualification:{...qualificationFixture(),documentation:docs}}}
    const parsed=parseModuleDocument(noUi)
    expect(()=>requireModuleUiForPublication(parsed)).not.toThrow()
    expect(()=>requireModuleQualificationForPublication(parsed)).not.toThrow()
    expect(()=>requireCompleteReadme(parsed,qualificationReadme.replace('![Synthetic test LCD](media/ui.png)','It draws nothing, so there are no screenshots.'))).not.toThrow()
    const {noUiReason:_reason,...access}=noUi.access
    expect(_reason).toBeTruthy()
    expect(()=>parseModuleDocument({...noUi,access})).toThrow('real documentation screenshots')
    for(const draws of [{controls:example.controls},{compatibility:{...noUi.compatibility,uiClaims:['key:TRIG+A','screen:TEMPO']}},{compatibility:{...noUi.compatibility,effectId:10}}]) expect(()=>parseModuleDocument({...noUi,...draws})).toThrow('no dedicated OT UI')
    expect(()=>parseModuleDocument({...noUi,tests:{...noUi.tests,qualification:{...noUi.tests.qualification,documentation:{...docs,tutorial:{...docs.tutorial,steps:docs.tutorial.steps.slice(0,2)}}}}})).toThrow('three practical tutorial steps')
  })
  it('accepts real grayscale/RGB/RGBA PNG representations and all standard row filters',()=>{
    expect(()=>requireMonochromePng(qualificationPng)).not.toThrow()
    for(const value of [0,127,255]) for(let filter=0;filter<=4;filter++) expect(()=>requireMonochromePng(png([value,value,value],2,filter))).not.toThrow()
    expect(()=>requireMonochromePng(png([40,40,40,128],6))).not.toThrow()
    expect(()=>requireMonochromePng(png([0],3,0,[80,80,80]))).not.toThrow()
  })
  it('rejects yellow or other colored pixels, malformed images and non-PNG files',()=>{
    for(const color of [[255,255,0],[255,0,0],[0,30,255]]) expect(()=>requireMonochromePng(png(color))).toThrow('yellow/colored')
    expect(()=>requireMonochromePng(png([255,255,0,255],6))).toThrow('yellow/colored')
    expect(()=>requireMonochromePng(png([0],3,0,[255,255,0]))).toThrow('yellow/colored')
    for(const bytes of [Buffer.from('Not a PNG'),qualificationPng.subarray(0,32),png([0,0,0],2,5)]) expect(()=>requireMonochromePng(bytes)).toThrow()
  })
})
