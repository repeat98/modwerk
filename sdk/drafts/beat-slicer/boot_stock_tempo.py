"""Observe normal stock tempo changes on a disposable project; no device or injected code."""
import argparse,json,shutil,struct,wave
from pathlib import Path
from boot_observe import Port,digest
from boot_formats import observe
from inspect_stock import STOCK_MAIN_SHA256
from stock_tempo import set_project_tempo,runtime_tempo
ROOT=Path(__file__).resolve().parent

def main():
    p=argparse.ArgumentParser(description=__doc__)
    for n in ('emulator','main','card','wav','output'):p.add_argument('--'+n,type=Path,required=True)
    p.add_argument('--card-sha256',required=True);a=p.parse_args();out=a.output.resolve()
    if not __debug__ or out.exists() or out==ROOT.parents[2] or ROOT.parents[2] in out.parents:p.error('Assertions and a fresh private output path are required.')
    if digest(a.main)!=STOCK_MAIN_SHA256 or digest(a.card)!=a.card_sha256:p.error('Stock/card identity differs.')
    with wave.open(str(a.wav),'rb') as f:
        assert (f.getnchannels(),f.getsampwidth(),f.getframerate(),f.getnframes())==(2,2,44100,44100)
        original=list(struct.unpack('<88200h',f.readframes(44100)))
    out.mkdir(parents=True);card=out/'card.private.img';shutil.copyfile(a.card,card)
    port=Port([str(a.emulator),'--image',str(a.main),'--card',str(card),'--mount','--set','BEATLAB',
               '--project','PROJECT 261023','--load-ms','90000','--dsp','--frame','--ms','3000',
               '--interactive','--main-level','off','--rtc','host','--mkii','--lcd',str(out/'lcd.private.bin')],out)
    changes=[];open_captures=[]
    original_command=port.command
    def capture_command(text,*args,**kwargs):
        if text=='key 0x26 4':
            bpm24=runtime_tempo(port)
            saved=out/f'tempo-open-{bpm24}.private.bin'
            shutil.copyfile(out/'lcd.private.bin',saved)
            open_captures.append({'bpm24':bpm24,'lcdSha256':digest(saved)})
        return original_command(text,*args,**kwargs)
    port.command=capture_command
    try:
        port.reply(b'ready ',timeout=600);assert port.loaded and runtime_tempo(port)==2880
        before=out/'before';before.mkdir();baseline=observe(port,16,2,original,before)
        for bpm in (90,137,120):
            changes.append(set_project_tempo(port,bpm));shutil.copyfile(out/'lcd.private.bin',out/f'tempo-{bpm}.private.bin')
            work=out/f'after-{bpm}';work.mkdir();assert observe(port,16,2,original,work)==baseline
    finally:port.close()
    assert digest(card)==a.card_sha256 and digest(a.card)==a.card_sha256
    report={'scope':'normal stock TEMPO/LEVEL adjustment and closure; no injected code, device, external clock or pattern multiplier qualification',
            'sourceSha256':{n:digest(ROOT/n) for n in ('boot_stock_tempo.py','stock_tempo.py','boot_observe.py','boot_formats.py','inspect_stock.py')},
            'mainSha256':STOCK_MAIN_SHA256,'cardSha256':a.card_sha256,'wavSha256':digest(a.wav),'emulatorSha256':digest(a.emulator),
            'changes':changes,'openTempoCaptures':open_captures,'pcmAndSampleSettingsUnchanged':True,'cardUnchanged':True,'exitCode':0,'hardware':'not tested'}
    (out/'stock-tempo.json').write_text(json.dumps(report,indent=2)+'\n');print('PASS: ordinary stock project tempo 120 -> 90 -> 137 -> 120; unchanged PCM/sample settings/card')
if __name__=='__main__':main()
