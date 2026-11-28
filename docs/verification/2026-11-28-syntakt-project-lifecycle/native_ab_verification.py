"""Supplement the unchanged native fixture with full slot-128 readback evidence.

A = OLD PROJECT; B = NEW PROJECT. No firmware bytes are emitted. This observer
adds measurements only after the actual native UI worker has returned.
"""
import argparse
import copy
import hashlib
import importlib.util
import json
from pathlib import Path

FIXTURE_SHA='062cbaf875e80710abc743e07c6de78538fde9f330c52e862a13b1358c32ec37'
sha=lambda data:hashlib.sha256(data).hexdigest()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('image',type=Path)
    parser.add_argument('--fixture',type=Path,default=Path(__file__).with_name('native_probe.py'))
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    for input_path in (args.image,args.fixture,Path(__file__)):
        if args.output.resolve()==input_path.resolve() or (args.output.exists() and args.output.samefile(input_path)):
            parser.error('Result must not overwrite an input or script')
    assert sha(args.fixture.read_bytes())==FIXTURE_SHA
    spec=importlib.util.spec_from_file_location('original_project_fixture',args.fixture)
    native=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(native)
    image=args.image.read_bytes()
    assert sha(image)==native.STOCK_SHA
    original_call=native.Fixture.call
    measured=[]

    def observe_call(f,pc,*arguments,**kwargs):
        if pc!=0x4005BAFA:return original_call(f,pc,*arguments,**kwargs)
        slot=f.location(128)
        a=bytes(f.media[slot])
        b=bytes(f.media[f.location(127)])
        assert len(a)==len(b)==native.FILE_SIZE
        assert a[8:24]==b'OLD PROJECT'.ljust(16,b'\0')
        assert b[8:24]==b'NEW PROJECT'.ljust(16,b'\0') and a!=b
        value=original_call(f,pc,*arguments,**kwargs)
        # The native operation is complete before any verification read begins.
        after=bytes(f.media[slot])
        live_before_read=bytes(f.uc.mem_read(native.RUNTIME+12,16))
        operation_events=copy.deepcopy(f.events)
        operation_visits=copy.deepcopy(f.visits)
        attempts=[e for e in operation_events if e['event']=='media_write']
        assert len(attempts)==1
        attempt=attempts[0]
        assert attempt['activation_already_succeeded'] and attempt['bytes']==native.FILE_SIZE
        address=f.allocate(native.FILE_SIZE+64)
        destination=address+32
        f.uc.mem_write(address,b'\xA5'*32)
        f.uc.mem_write(destination,b'\xCC'*native.FILE_SIZE)
        f.uc.mem_write(destination+native.FILE_SIZE,b'\x5A'*32)
        read_value=original_call(f,0x401107B0,native.CAT,destination,128)
        readback=bytes(f.uc.mem_read(destination,native.FILE_SIZE))
        assert read_value==0 and readback==after
        assert f.uc.mem_read(address,32)==b'\xA5'*32
        assert f.uc.mem_read(destination+native.FILE_SIZE,32)==b'\x5A'*32
        assert bytes(f.media[slot])==after
        assert bytes(f.uc.mem_read(native.RUNTIME+12,16))==live_before_read
        assert live_before_read==b'NEW PROJECT'.ljust(16,b'\0')
        if f.fail_write:
            assert after==a and value==1
        else:
            assert sha(after)==attempt['sha256'] and value==0
        wrapper=next(e for e in operation_events if e['event']=='load_wrapper_return')
        activation=next(e for e in operation_events if e['event']=='activation_return')
        assert activation['d0_low8']==1 and activation['live_name']=='NEW PROJECT'
        measured.append({
            'case':'active_slot_write_failure_after_B_activation' if f.fail_write else 'normal_LOAD_B',
            'A_label':'OLD PROJECT','B_label':'NEW PROJECT',
            'buffer_bytes':native.FILE_SIZE,'A_initial_slot128_sha256':sha(a),'B_input_slot127_sha256':sha(b),
            'A_and_B_full_buffers_differ':a!=b,
            'activation_return_low8':activation['d0_low8'],
            'LOAD_wrapper_return_low8':wrapper['d0_low8'],'UI_worker_return_d0':value,
            'live_project_after_LOAD':'B','live_name_after_LOAD':'NEW PROJECT',
            'stored_slot128_name_after_LOAD':after[8:24].decode('ascii').rstrip('\0'),
            'stored_slot128_sha256_after_LOAD':sha(after),'stored_slot128_equals_A_full_buffer':after==a,
            'stored_slot128_equals_original_B_input_full_buffer':after==b,
            'stored_slot128_equals_actual_native_write_attempt':sha(after)==attempt['sha256'],
            'native_write_attempt':attempt,
            'native_slot128_readback_return':read_value,'native_slot128_readback_bytes':len(readback),
            'native_slot128_readback_sha256':sha(readback),'native_slot128_readback_equals_stored_full_buffer':True,
            'native_readback_redzones_intact':True,'verification_read_did_not_change_live_name_or_stored_buffer':True,
            'verification_after_worker_return':True,
            'operation_events':operation_events,'operation_native_visits':operation_visits,
            'verification_events':copy.deepcopy(f.events[len(operation_events):]),
            'services':copy.deepcopy(f.services),'invalid_accesses':copy.deepcopy(f.faults),
        })
        return value

    result={'date':'2026-11-28','evidence':'EMULATOR-PROVEN within explicit original fixture service boundaries',
            'stock_main_sha256':sha(image),'stock_main_length':len(image),'load_address':hex(native.LOAD),
            'original_fixture_sha256':FIXTURE_SHA,'measurement_script_sha256':sha(Path(__file__).read_bytes()),
            'unicorn_version':native.unicorn.__version__,'cases':measured,
            'reused_original_file_cases':14,'new_file_cases':0,'new_LOAD_cases':2,
            'firmware_bytes_emitted':False,'hardware_access':False,'physical_slot128_contents':'OPEN: not measured on hardware',
            'whole_B_input_preservation_through_activation_export':'Measured per case; equality is not assumed',
            'passed':False}
    native.Fixture.call=observe_call
    try:
        for fail in (False,True):native.load_case(image,fail)
        assert len(measured)==2 and all(not c['invalid_accesses'] for c in measured)
        result['passed']=True
    finally:
        native.Fixture.call=original_call
        result['input_hash_unchanged']=sha(args.image.read_bytes())==sha(image)
        args.output.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8',newline='\n')
        print(json.dumps({'passed':result['passed'],'new_LOAD_cases':len(measured),'output':str(args.output)}),flush=True)


if __name__=='__main__':main()
