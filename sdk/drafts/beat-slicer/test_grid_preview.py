"""Check geometry-only previews against an independent rational arithmetic oracle.

Run in the pinned source-tools image. --runner additionally executes the same
ColdFire fixture; it does not access firmware, USB or an instrument source.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import random
import subprocess

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[2]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def oracle(r, existing):
    rate, start, end, sample, project, beats, source, count = r
    if (not 8000 <= rate <= 192000 or start >= end or source > 1 or
            beats not in (1, 4, 16, 32, 64) or count > 64 or count != len(existing) or
            any(not start <= x < end for x in existing) or
            any(a >= b for a, b in zip(existing, existing[1:]))):
        return 1, 0, []
    bpm = (sample, project)[source]
    if not 720 <= bpm <= 7200:
        return 1, 0, []
    # Unbounded integer arithmetic, no division before multiplication.
    points = set(existing)
    for n in range(65):
        offset = (2*n*rate*1440*beats+bpm)//(2*bpm)
        if offset >= end-start:
            break
        points.add(start+offset)
        if len(points) > 64:
            return 2, 0, []
    return 0, bpm, sorted(points)


def vectors():
    rows = [([44100, 0, 88200, 2880, 2160, 1, source, 1], [1000]) for source in (0, 1)]
    # Capacity, duplicates, fractional tempo, nonzero/high trim and refusal cases.
    for count in (0, 1, 63, 64):
        rows.append(([8000, 0, 256000, 2880, 1440, 1, 0, count], [4000*i for i in range(count)]))
    for source in (0, 1):
        for beats in (1, 4, 16, 32, 64):
            rows.append(([192000, 0xff000000, 0xffffffff, 7199, 721, beats, source, 0], []))
    rng = random.Random(5401)
    for i in range(160):
        rate = rng.choice((8000, 44100, 48000, 96000, 192000))
        start = rng.choice((0, 19, 0xf0000000))
        length = rng.randrange(1, 4000000)
        existing = sorted(rng.sample(range(start, start+length), rng.randrange(0, 8)))
        rows.append(([rate, start, start+length, rng.randrange(720, 7201),
                      rng.randrange(720, 7201), rng.choice((1, 4, 16, 32, 64)), i % 2, len(existing)], existing))
    base = [44100, 0, 88200, 2880, 2160, 1, 0, 0]
    for index, value in ((0, 0), (0, 7999), (0, 192001), (2, 0), (3, 0),
                         (3, 719), (3, 7201), (5, 0), (5, 2), (6, 2), (7, 65)):
        r = base.copy(); r[index] = value; rows.append((r, []))
    for existing in ([5, 5], [6, 5], [88200], [0xffffffff]):
        r = base.copy(); r[7] = len(existing); rows.append((r, existing))
    # Unselected missing tempo must not silently change the selected source.
    rows += [([44100, 0, 88200, 2880, 0, 1, 0, 0], []),
             ([44100, 0, 88200, 0, 2160, 1, 1, 0], [])]
    return rows


def fixture(rows):
    declarations = []
    calls = []
    for i, (r, existing) in enumerate(rows):
        status, bpm, starts = oracle(r, existing)
        def array(name, values):
            declarations.append('static const uint32_t %s[]={%s};' %
                                (name, ','.join(str(x)+'u' for x in (values or [0]))))
        array('old'+str(i), existing)
        array('want'+str(i), starts)
        declarations.append('static const struct bs_grid_request req%d={%s,old%d};' %
                            (i, ','.join(str(x)+'u' for x in r), i))
        calls.append('if(!check(&req%d,%du,%du,%du,want%d))return %du;' %
                     (i, status, bpm, len(starts), i, i+1))
    return '''#include "grid_preview.h"
static uint32_t reads;
static int silence(void *c,uint32_t f,int32_t pcm[2]){(void)c;(void)f;++reads;pcm[0]=pcm[1]=0;return 0;}
static int check(const struct bs_grid_request *r,uint32_t status,uint32_t bpm,uint32_t n,const uint32_t *want){
 struct {uint32_t before;struct bs_grid_plan p;uint32_t after;} guard;
 unsigned char *bytes=(unsigned char *)&guard;
 for(uint32_t i=0;i<sizeof guard;++i)bytes[i]=0xa5;
 if((uint32_t)bs_grid_preview(r,&guard.p)!=status)return 0;
 if(guard.before!=0xa5a5a5a5u||guard.after!=0xa5a5a5a5u)return 0;
 if(status){for(uint32_t i=0;i<sizeof guard;++i)if(bytes[i]!=0xa5)return 0;return 1;}
 if(guard.p.bpm24!=bpm)return 0;
 if(guard.p.count!=n)return 0;
 for(uint32_t i=0;i<64;++i)if(guard.p.starts[i]!=(i<n?want[i]:0u))return 0;
 /* A genuine silence test oracle only: production geometry has no PCM input.
  * This cross-check catches divergence from the existing exact audio planner. */
 struct bs_request audio={r->sample_rate,r->trim_start,r->trim_end,r->sample_bpm24,r->project_bpm24,r->beats,r->tempo_source,r->existing_count,r->existing,0,silence,0};
 struct bs_plan p;reads=0;if(bs_preview(&audio,&p)!=BS_OK||!reads||p.count!=n||p.bpm24!=bpm)return 0;
 for(uint32_t i=0;i<64;++i)if(p.starts[i]!=guard.p.starts[i])return 0;
 return 1;
}
'''+'\n'.join(declarations)+'''
uint32_t bs_grid_test(void){
 static const struct bs_grid_request r={44100,0,88200,2880,2160,1,0,1,0};
 struct bs_grid_plan p;
 if(bs_grid_preview(0,&p)!=BS_INVALID||bs_grid_preview(&r,0)!=BS_INVALID||bs_grid_preview(&r,&p)!=BS_INVALID)return 900;
'''+'\n'.join(calls)+'''\nreturn 0;}
#ifdef HOST_TEST
int main(void){return bs_grid_test()?1:0;}
#endif
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--runner', type=Path)
    parser.add_argument('--sdk-revision', required=True)
    args = parser.parse_args()
    out = args.output.resolve()
    if out.exists() or out == REPO or REPO in out.parents:
        parser.error('Use a fresh directory outside Git.')
    out.mkdir(parents=True)
    rows = vectors(); driver = out/'grid-test.c'; driver.write_text(fixture(rows))
    own = {n: sha(ROOT/n) for n in ('grid_preview.c', 'grid_preview.h', 'planner.c', 'planner.h',
                                   'test_grid_preview.py', 'build_usb_probe.py', 'stock_probe/job_probe.cpp')}
    flags = ['-std=c99', '-O1', '-g', '-Wall', '-Wextra', '-Werror', '-pedantic',
             '-fsanitize=address,undefined', '-fno-omit-frame-pointer', '-DHOST_TEST', '-I', str(ROOT)]
    subprocess.run(['cc', *flags, str(driver), str(ROOT/'grid_preview.c'), str(ROOT/'planner.c'),
                    '-o', str(out/'host')], check=True)
    subprocess.run([str(out/'host')], check=True, timeout=30)
    report = {'scope': 'Geometry-only preview oracle, complete exact-audio-planner comparison, capacity/tempo/trim/input refusals and unchanged failure outputs; no live source or device access',
              'sourceSha256': own, 'vectors': len(rows), 'hostSanitizers': 'address,undefined',
              'hostExitCode': 0, 'fixtureSha256': sha(driver), 'hardware': 'not tested',
              'nativeSourceAccess': 'not implemented', 'boundaryAmplitude': 'unknown; no PCM analysis'}
    if args.runner:
        sdk = load('grid_sdk', REPO/'sdk/runtime/loader/build.py')
        guard = load('grid_codegen', REPO/'sdk/runtime/m68k_codegen.py')
        probe = load('grid_probe_guard', ROOT/'build_usb_probe.py')
        native_flags = [*sdk.CFLAGS, *guard.FLAGS, '-I', str(ROOT)]
        objects = []
        for i, source in enumerate((driver, ROOT/'grid_preview.c', ROOT/'planner.c')):
            obj=out/('native-'+str(i)+'.o')
            subprocess.run(['m68k-elf-gcc', *native_flags, '-c', str(source), '-o', str(obj)], check=True)
            objects.append(obj)
        guard.check(objects); probe.check_addressing(objects)
        elf=out/'grid-test.elf'; binary=out/'grid-test.bin'
        subprocess.run(['m68k-elf-ld', '--no-undefined', '-e', 'bs_grid_test', '-Ttext=0x47040000',
                        '-Tbss=0x47400000', *map(str, objects), '-o', str(elf)], check=True)
        subprocess.run(['m68k-elf-objcopy', '-O', 'binary', str(elf), str(binary)], check=True)
        symbols=subprocess.check_output(['m68k-elf-nm',str(elf)],text=True)
        entry=next(row.split()[0] for row in symbols.splitlines() if row.split()[-1]=='bs_grid_test')
        result=subprocess.run([str(args.runner),str(binary),'0x'+entry],text=True,capture_output=True,timeout=120)
        print(result.stdout,end=''); print(result.stderr,end=''); result.check_returncode()
        assert 'SOURCE_SHA256: '+sha(ROOT/'stock_probe/job_probe.cpp') in result.stdout.splitlines()
        report.update(sdkRevision=args.sdk_revision,
                      sdkDependencySha256={n:sha(REPO/n) for n in ('sdk/runtime/loader/build.py','sdk/runtime/m68k_codegen.py')},
                      nativeFlags=native_flags, nativeExitCode=result.returncode,
                      nativeStdout=result.stdout.splitlines(), runnerSha256=sha(args.runner),
                      objectSha256={x.name:sha(x) for x in objects}, addressingGuard='passed')
    assert own == {n:sha(ROOT/n) for n in own}, 'Sources changed during the checks.'
    (out/'grid-preview.json').write_text(json.dumps(report,indent=2)+'\n')
    print('PASS:', len(rows), 'independent grid vectors; no live-source claim.')


if __name__ == '__main__':
    main()
