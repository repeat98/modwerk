"""Actual USB base boot with card-restored modules; no code/state injection."""
import json,selectors,subprocess,os,time
from pathlib import Path
from bench import Bench

class UsbCardBench(Bench):
 def __init__(self,emulator,build,card,output,receipt,project='TRIAL'):
  build=Path(build);self.out=Path(output);self.out.mkdir(parents=True,exist_ok=False)
  self.symbols=json.loads(Path(receipt).read_text())['symbols'];self.base_symbols=json.loads((build/'base-symbols.private.json').read_text())
  self.log=[];self.rows=[0]*8;self.pending=b'';self.origin=0;self.stdout_log=(self.out/'stdout.private.log').open('wb')
  self.port=subprocess.Popen([str(emulator),'--image',str(build/'base-MAIN.private.bin'),'--mkii','--boot-logo','--ms','4000','--frame','--dsp','--load-ms','20000','--interactive','--internal-clock','--rtc','off','--main-level','off','--card',str(card),'--card-rw','--mount','--set','TEST','--project',project,'--lcd',str(self.out/'lcd.bin')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=(self.out/'stderr.log').open('wb'))
  self.selector=selectors.DefaultSelector();self.selector.register(self.port.stdout,selectors.EVENT_READ);self.response(b'ready ')
  for _ in range(30):
   self.run(200)
   if int.from_bytes(self.read(self.base_symbols['modwerk_modset_result'],4),'big') in [1,6]:break
  self.modules=[]
  for ptr in [int.from_bytes(self.read(self.base_symbols['live']+i*4,4),'big') for i in range(128)]:
   if not ptr:continue
   identity=int.from_bytes(self.read(ptr,4),'big');self.modules.append(f'{identity:08x}')
   if identity==0xf36a496d:self.origin=int.from_bytes(self.read(ptr+8,4),'big')-self.symbols['mm_profile_tick']
  if not self.origin:raise AssertionError('MIDI module not restored: '+repr(self.modules))
  self.press(0x32);self.press(0x31);self.run(1000)
  if not any(self.read(0x80000012,4)):self.press(0x35)
  self.press(0x22);self.run(1500)
 def response(self,prefix):
  until=time.monotonic()+300
  while time.monotonic()<until:
   while b'\n' in self.pending:
    line,self.pending=self.pending.split(b'\n',1)
    if line.startswith(prefix):return line.decode()
   if self.selector.select(1):
    data=os.read(self.port.stdout.fileno(),65536);self.stdout_log.write(data);self.stdout_log.flush();self.pending+=data
   if self.port.poll() is not None:raise RuntimeError('Emulator exited; see stdout.private.log')
  self.close()
  raise TimeoutError('Native reply timeout; see stdout.private.log')
 def cmd(self,value):
  if value.split()[0] in ['poke','call','load','restore']:raise ValueError('USB card proof forbids injected state/code/calls')
  return super().cmd(value)
