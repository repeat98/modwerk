"""Boot an actual card MAIN; no runtime publication, pokes or timing fixtures."""
import json
from pathlib import Path
import selectors
import subprocess
from bench import Bench


class CardBench(Bench):
    def __init__(self,emulator,build,card,output,project='TRIAL'):
        build=Path(build);self.out=Path(output);self.out.mkdir(parents=True,exist_ok=False)
        self.symbols=json.loads((build/'runtime-symbols.json').read_text())['symbols']
        mapping=json.loads((build/'Midi-Mode-2-card-test.syx.map.json').read_text())
        self.origin=int(mapping['midi_mode2_tick'],16)-self.symbols['mm_profile_tick']
        self.log=[];self.rows=[0]*8;self.pending=b''
        self.port=subprocess.Popen([str(emulator),'--image',str(build/'card-MAIN.private.bin'),'--mkii','--boot-logo','--ms','4000','--interactive','--internal-clock','--rtc','off','--main-level','off','--card',str(card),'--card-rw','--mount','--set','TEST','--project',project,'--lcd',str(self.out/'lcd.bin')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=(self.out/'stderr.log').open('wb'))
        self.selector=selectors.DefaultSelector();self.selector.register(self.port.stdout,selectors.EVENT_READ)
        self.response(b'ready ')
        self.press(0x32);self.press(0x31);self.run(1000)
        if not any(self.read(0x80000012,4)):self.press(0x35)
        self.press(0x22);self.run(1500)

    def cmd(self,value):
        if value.split()[0] in ['poke','call','load','restore']:raise ValueError('Card proof forbids injected code, state or calls')
        return super().cmd(value)
