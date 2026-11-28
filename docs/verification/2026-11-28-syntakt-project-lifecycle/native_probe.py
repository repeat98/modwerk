"""Original offline stock Syntakt Project-path fixture; never writes firmware.

Owner supplies an unpacked OS 1.42 MAIN. No OS bytes are embedded in this file.
The fixture substitutes final media, allocation and OS synchronization services.
All additional substitutions must be explicit in the result. No device access.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import time
import gc

import unicorn
from unicorn import Uc, UC_ARCH_M68K, UC_MODE_BIG_ENDIAN, UC_HOOK_CODE, UC_HOOK_MEM_INVALID
from unicorn.m68k_const import *

LOAD, RET, STACK = 0x40000400, 0x5000F000, 0x5000D000
CAT, CONTEXT, BUFFER = 0x50100000, 0x50120000, 0x51001000
RUNTIME, MODEL, ALLOC = 0x52000000, 0x54000000, 0x60000000
FILE_SIZE, PREFIX, RUNTIME_SIZE = 0x3E6604, 0x3A5604, 0x1164A54
STOCK_SHA = '1a9723b19fb54d0566c1f690379d2e6dfe43227f77e170ad731dd029430eb3e7'


class Fixture:
    def __init__(self, image):
        assert len(image) == 3442576 and hashlib.sha256(image).hexdigest() == STOCK_SHA
        self.uc = Uc(UC_ARCH_M68K, UC_MODE_BIG_ENDIAN, cpu=UC_CPU_M68K_ANY)
        self.uc.mem_map(0x40000000, 0x05600000)
        self.uc.mem_write(LOAD, image)
        self.uc.mem_map(0x50000000, 0x05000000)
        self.uc.mem_map(ALLOC, 0x10000000)
        self.uc.mem_map(0x80000000, 0x10000)  # CPU1-visible shared audio parameter RAM only
        self.next = ALLOC
        self.events, self.faults, self.services, self.visits = [], [], [], {}
        self.service_calls = {}
        self.returns = []
        self.media = {}
        self.fail_read, self.fail_write = False, False
        self.failure_requires_activation = False
        self.w32(CAT + 0x15440, 0xBEEFBACE)
        self.uc.mem_write(CAT + 0x1543C, b'\1')
        self.uc.mem_write(CAT + 0x15448, b'\1')  # write-protection table present; bitmap clear
        self.uc.hook_add(UC_HOOK_MEM_INVALID, self.invalid)
        self.service(0x40001980, 1, 'OS mutex acquire (single task)', lambda *_: 0)
        self.service(0x40001AA2, 1, 'OS mutex release (single task)', lambda *_: 0)
        self.service(0x40001904, 1, 'OS mutex create (single task)', lambda *_: 0)
        self.service(0x4010394C, 1, 'owned fixture allocation', self.allocate)
        self.service(0x40103958, 1, 'owned fixture free (arena retained)', lambda *_: 0)
        self.service(0x401100D4, 5, 'final media read', self.read)
        self.service(0x40111628, 6, 'final media write', self.write)
        self.watch(0x400AFAF6, 'normalizer')
        self.watch(0x400AE070, 'project_import')
        self.watch(0x400AE3B0, 'project_export')

    def w32(self, p, x):
        self.uc.mem_write(p, struct.pack('>I', x & 0xFFFFFFFF))

    def r32(self, p):
        return struct.unpack('>I', self.uc.mem_read(p, 4))[0]

    def args(self, n):
        sp = self.uc.reg_read(UC_M68K_REG_A7)
        return struct.unpack('>' + 'I'*(n+1), self.uc.mem_read(sp, 4*(n+1)))[1:]

    def invalid(self, uc, access, address, size, value, _):
        self.faults.append({'pc':hex(uc.reg_read(UC_M68K_REG_PC)), 'address':hex(address), 'size':size, 'access':access,
                            'a2':hex(uc.reg_read(UC_M68K_REG_A2)), 'a0':hex(uc.reg_read(UC_M68K_REG_A0)),
                            'stack':[hex(self.r32(uc.reg_read(UC_M68K_REG_A7)+i)) for i in range(0,48,4)]})
        return False

    def service(self, pc, n, label, handler):
        self.services.append({'address':hex(pc), 'name':label})
        def invoke(uc, address, size, _):
            sp = uc.reg_read(UC_M68K_REG_A7)
            ret = self.r32(sp)
            self.service_calls[label] = self.service_calls.get(label,0)+1
            value = handler(*self.args(n))
            uc.reg_write(UC_M68K_REG_D0, value & 0xFFFFFFFF)
            uc.reg_write(UC_M68K_REG_A7, sp + 4)
            uc.reg_write(UC_M68K_REG_PC, ret)
        self.uc.hook_add(UC_HOOK_CODE, invoke, begin=pc, end=pc)

    def watch(self, pc, name):
        def note(*_): self.visits[name] = self.visits.get(name, 0) + 1
        self.uc.hook_add(UC_HOOK_CODE, note, begin=pc, end=pc)

    def allocate(self, size):
        assert 0 < size <= 0x02000000, hex(size)
        p = self.next
        self.next += (size + 15) & ~15
        assert self.next < 0x70000000
        return p

    @staticmethod
    def location(slot):
        return 0x7E000 if slot == 128 else (slot + 64) << 13

    def read(self, context, location, size, destination, operation):
        payload = self.media.get(location)
        ok = not self.fail_read and payload is not None and len(payload) >= size
        self.events.append({'event':'media_read','location':hex(location),'bytes':size,'success':ok})
        if ok: self.uc.mem_write(destination, payload[:size])
        return 0 if ok else 1

    def write(self, context, location, size, source, operation, flags):
        payload = bytes(self.uc.mem_read(source, size))
        ok = not self.fail_write
        if not ok and self.failure_requires_activation:
            assert location == self.location(128)
            assert self.visits.get('activation_succeeded') == 1
            assert bytes(self.uc.mem_read(RUNTIME+12,16)) == b'NEW PROJECT'.ljust(16,b'\0')
        self.events.append({'event':'media_write','location':hex(location),'bytes':size,'success':ok,'sha256':hashlib.sha256(payload).hexdigest(),'activation_already_succeeded':self.visits.get('activation_succeeded',0)==1})
        if ok: self.media[location] = payload
        return 0 if ok else 1

    def call(self, pc, *args, count=300_000_000):
        sp = STACK - 4*(len(args)+1)
        self.uc.mem_write(sp, struct.pack('>'+'I'*(len(args)+1), RET, *[x & 0xffffffff for x in args]))
        self.uc.reg_write(UC_M68K_REG_SR, 0x2700)
        self.uc.reg_write(UC_M68K_REG_A7, sp)
        start = time.monotonic()
        try:
            self.uc.emu_start(pc, RET, count=count, timeout=45_000_000)
        except Exception as exc:
            raise RuntimeError(json.dumps({'entry':hex(pc),'pc':hex(self.uc.reg_read(UC_M68K_REG_PC)),'error':str(exc),'faults':self.faults,'events':self.events[-5:]})) from exc
        end = self.uc.reg_read(UC_M68K_REG_PC)
        if end != RET:
            raise RuntimeError(json.dumps({'entry':hex(pc),'stopped_pc':hex(end),'instruction_budget':count,'seconds':time.monotonic()-start}))
        value=self.uc.reg_read(UC_M68K_REG_D0) & 0xffffffff
        self.returns.append({'entry':hex(pc),'d0':value,'d0_low8':value&255,'returned_to_sentinel':True})
        return value

    def payload(self, name=b'NEW PROJECT'):
        data = bytearray(FILE_SIZE)
        struct.pack_into('>II', data, 0, 0xBEEFBACE, 13)
        data[8:24] = name.ljust(16, b'\0')[:16]
        struct.pack_into('>I', data, PREFIX-4, 0xBACEF00C)
        data[PREFIX:] = bytes(range(256))*(0x41000//256)
        return bytes(data)


def native_payload(f):
    f.call(0x40018AB0,BUFFER)
    f.uc.mem_write(BUFFER+8,b'NEW PROJECT'.ljust(16,b'\0'))
    f.uc.mem_write(BUFFER+PREFIX,f.payload()[PREFIX:])
    return bytes(f.uc.mem_read(BUFFER,FILE_SIZE))


def file_cases(image):
    rows=[]
    for slot in (0,127,128):
        f=Fixture(image)
        payload=native_payload(f)
        f.uc.mem_write(BUFFER-32,b'\xA5'*32)
        f.uc.mem_write(BUFFER+FILE_SIZE,b'\x5A'*32)
        written=f.call(0x40112124,CAT,BUFFER,slot,0,CONTEXT)
        assert written==0 and f.media[f.location(slot)]==payload,(slot,written,f.events)
        f.uc.mem_write(BUFFER,b'\xCC'*FILE_SIZE)
        read=f.call(0x401107B0,CAT,BUFFER,slot)
        assert read==0 and bytes(f.uc.mem_read(BUFFER,FILE_SIZE))==payload
        assert f.uc.mem_read(BUFFER-32,32)==b'\xA5'*32 and f.uc.mem_read(BUFFER+FILE_SIZE,32)==b'\x5A'*32
        rows.append({'case':'full_file_roundtrip','slot':slot,'location':hex(f.location(slot)),'write_return':written,'read_return':read,'full_buffer_equal':True,'opaque_tail_equal':True,'redzones_intact':True,'events':f.events,'native_visits':f.visits,'services':f.services,'service_calls':f.service_calls,'invalid_accesses':f.faults})
        del f
        gc.collect()
    for case,expected_r,expected_w in [('slot_129',2,1),('slot_minus_one',2,1),('null_buffer',2,1),('catalogue_unready',5,4),('media_error',3,2),('missing_slot',1,None),('bad_footer',4,None),('future_version',4,None),('nonproject_512',None,0),('write_protected',None,3),('protection_table_unavailable',None,3)]:
        f=Fixture(image)
        payload=bytearray(f.payload())
        slot=129 if case=='slot_129' else 0xffffffff if case=='slot_minus_one' else 0
        pointer=0 if case=='null_buffer' else BUFFER
        f.uc.mem_write(CAT+12,b'\1')
        if case=='catalogue_unready':f.uc.mem_write(CAT+0x1543C,b'\0')
        if case=='missing_slot':f.uc.mem_write(CAT+12,b'\0')
        if case=='write_protected':f.uc.mem_write(CAT+0x15449,b'\1')
        if case=='protection_table_unavailable':f.uc.mem_write(CAT+0x15448,b'\0')
        if case=='bad_footer':struct.pack_into('>I',payload,PREFIX-4,0)
        if case=='future_version':struct.pack_into('>I',payload,4,14)
        if case=='nonproject_512':struct.pack_into('>I',payload,0,0)
        f.uc.mem_write(BUFFER,bytes(payload))
        f.media[f.location(0)]=bytes(payload)
        f.fail_read=f.fail_write=case=='media_error'
        rd=f.call(0x401107B0,CAT,pointer,slot) if expected_r is not None else None
        wr=f.call(0x40112124,CAT,pointer,slot,0,CONTEXT) if expected_w is not None else None
        assert rd==expected_r and wr==expected_w,(case,rd,wr)
        if case in ('slot_129','slot_minus_one','null_buffer','catalogue_unready','missing_slot','write_protected','protection_table_unavailable'):assert not f.events
        if case=='nonproject_512':assert next(e for e in f.events if e['event']=='media_write')['bytes']==512
        rows.append({'case':case,'read_return':rd,'write_return':wr,'events':f.events,'invalid_accesses':f.faults})
        del f
        gc.collect()
    return rows


def load_case(image,fail,worker=True,read_failure=False):
    f=Fixture(image)
    if worker:f.service(0x40002550,2,'OS timer callback scheduling (recorded, not dispatched)',lambda delay,callback:f.events.append({'event':'scheduled_callback','delay':delay,'callback':hex(callback)}) or 0)
    f.call(0x401A0826)
    for q in (0x444A0990,0x454E49B4):f.call(0x40001BAC,q,0,f.allocate(256),64)
    f.call(0x4008DC5A)
    for address,value in ((0x444E23F4,MODEL),(0x444E239C,CAT),(0x444E23AC,CONTEXT+0x100),(0x43BD8430,RUNTIME+0x1C),(0x43BD843C,RUNTIME+0x109C61C)):f.w32(address,value)
    f.call(0x4001BB10,MODEL,0)
    payload=native_payload(f)
    assert f.call(0x400AE070,RUNTIME,BUFFER,CONTEXT)&255==1
    f.w32(MODEL+16,RUNTIME)
    models=[MODEL,MODEL+0x30,MODEL+0x130,MODEL+0x378D8]+[MODEL+0x3394+i*0x680 for i in range(128)]+[MODEL+0x3394+i*0x680+44 for i in range(128)]+[MODEL+0x37394+i*84 for i in range(16)]
    inhibits=[bytes(f.uc.mem_read(p+12,1)) for p in models]
    for p in models:f.uc.mem_write(p+12,b'\1')
    f.call(0x400182BC,MODEL)
    for p,b in zip(models,inhibits):f.uc.mem_write(p+12,b)
    assert [bytes(f.uc.mem_read(p+12,1)) for p in models]==inhibits
    f.uc.mem_write(RUNTIME+12,b'OLD PROJECT'.ljust(16,b'\0'))
    f.media[f.location(127)]=payload
    old=bytearray(payload)
    old[8:24]=b'OLD PROJECT'.ljust(16,b'\0')
    f.media[f.location(128)]=bytes(old)
    f.uc.mem_write(CAT+12+28*127,b'\1')
    f.visits={}
    for pc,name in ((0x4001D430,'native_activation'),(0x4001D744,'activation_succeeded'),(0x4001D750,'save_active_called'),(0x400183D6,'metadata_notify'),(0x4008C792,'native_transport_prepare'),(0x400C1D88,'native_slot_decode'),(0x401107B0,'native_file_read'),(0x40112124,'native_file_write')):f.watch(pc,name)
    name=lambda:bytes(f.uc.mem_read(RUNTIME+12,16)).decode('ascii').rstrip('\0')
    for pc,label in ((0x4001D72C,'activation_return'),(0x4001D754,'active_slot_save_return'),(0x400C1942,'file_writer_return'),(0x4005BBAE,'load_wrapper_return')):
        def note(uc,pc,size,unused,label=label):f.events.append({'event':label,'pc':hex(pc),'d0':uc.reg_read(UC_M68K_REG_D0),'d0_low8':uc.reg_read(UC_M68K_REG_D0)&255,'live_name':name()})
        f.uc.hook_add(UC_HOOK_CODE,note,begin=pc,end=pc)
    f.fail_write=fail
    f.fail_read=read_failure
    f.failure_requires_activation=True
    before=name()
    if worker:
        capture=CONTEXT+0x200
        f.w32(capture,capture+0x10)
        f.w32(capture+0x18,127)
        result=f.call(0x4005BAFA,capture)
    else:result=f.call(0x4001D6FE,MODEL,127,CONTEXT)
    after=name()
    root=f.call(0x401752F2,MODEL)
    disk_name=f.media[f.location(128)][8:24].decode('ascii').rstrip('\0')
    selected=bytes(f.uc.mem_read(0x40653441,1))[0]
    if read_failure:
        assert after==before=='OLD PROJECT' and selected==0 and result==1
        assert not f.visits.get('activation_succeeded') and not f.visits.get('save_active_called')
    else:
        assert before=='OLD PROJECT' and after=='NEW PROJECT' and root==RUNTIME
        assert result==(int(fail) if worker else int(not fail))
        assert disk_name==('OLD PROJECT' if fail else 'NEW PROJECT')
        assert selected==(0 if fail else 127)
    assert not f.faults
    row={'case':'read_failure_before_decode' if read_failure else 'active_slot_write_failure' if fail else 'load_success_control','entry':hex(0x4005BAFA if worker else 0x4001D6FE),'return_d0':result,'return_low8':result&255,'before_live_name':before,'after_live_name':after,'root_runtime':hex(root),'stored_active_name':disk_name,'selected_slot_after':selected,'active_cache_valid':bytes(f.uc.mem_read(0x43FF45C8,1))[0],'native_visits':f.visits,'events':f.events,'services':f.services,'service_calls':f.service_calls,'arena_high_water':f.next-ALLOC,'invalid_accesses':f.faults,'initial_notification_inhibits_restored':True}
    del f
    gc.collect()
    return row


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('image',type=Path)
    ap.add_argument('--phase',choices=('files','load','all'),default='all')
    ap.add_argument('--output',type=Path,required=True)
    args=ap.parse_args()
    if args.output.resolve()==args.image.resolve() or (args.output.exists() and args.output.samefile(args.image)):
        ap.error('The result path must not refer to the input MAIN image')
    image=args.image.read_bytes()
    result={'date':'2026-11-28','evidence':'EMULATOR-PROVEN, isolated native CPU1 operations with explicit OS/media services','stock_main_sha256':hashlib.sha256(image).hexdigest(),'stock_main_length':len(image),'load_address':hex(LOAD),'unicorn_version':unicorn.__version__,'fixture_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'no_instruction_bytes_patched':True,'instruction_budget_per_call':300_000_000,'timeout_us_per_call':45_000_000,'hardware_access':False,'firmware_build':False,'file_cases':[],'load_cases':[]}
    try:
        if args.phase in ('files','all'):result['file_cases']=file_cases(image)
        if args.phase in ('load','all'):
            result['load_cases']=[load_case(image,False),load_case(image,True),load_case(image,False,read_failure=True)]
        result['passed']=True
    except Exception as error:
        result['passed']=False
        result['error']=str(error)
        raise
    finally:
        result['input_hash_unchanged']=hashlib.sha256(args.image.read_bytes()).hexdigest()==result['stock_main_sha256']
        args.output.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
        print(json.dumps({'passed':result['passed'],'file_cases':len(result['file_cases']),'load_cases':len(result['load_cases']),'output':str(args.output)}),flush=True)


if __name__=='__main__': main()
