#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Run the actual action-capable Base settings code in native host tests."""
import subprocess,tempfile
from pathlib import Path
def transform(source): return source
status=transform  # actual patched source
ROOT=Path(__file__).resolve().parents[3]
machine=ROOT/'sdk/machines/octatrack'
source=machine/'elekloader'
with tempfile.TemporaryDirectory(prefix='ms-action-menu-') as work:
    work=Path(work)
    for name in ('settings.h','setting_presets.h'):(work/name).write_text((source/name).read_text())
    (work/'settings.c').write_text(transform((source/'settings.c').read_text()))
    fixture=(source/'test_settings.c').read_text()
    extra='''static unsigned action_calls;
static uint32_t action_choose(uint32_t saved,unsigned field,unsigned choice) {
    CHECK(!saved && field==MODWERK_SETTING_FIELDS && !choice);++action_calls;return 0x1234;
}
'''
    fixture=fixture.replace('int main(void)',extra+'int main(void)',1)
    exercise='''
    const struct modwerk_setting_pages action_pages={group_page,action_choose};
    struct modwerk_setting action={4u,"TEST ACTION",0,
        (const char *const *)(const void *)&action_pages,apply2,0};
    uint32_t original_store[32];memcpy(original_store,store,sizeof store);
    unsigned original_calls=calls[2];table_row[0]=(uintptr_t)&action;table_row[1]=0;
    epoch+=2;modwerk_settings_tick();modwerk_settings_tick();
    CHECK(calls[2]==original_calls && !action_calls);
    CHECK(modwerk_settings_read(0,&view) && view.fields==2 && view.count==1);
    modwerk_settings_select(0,epoch-2,0);CHECK(!action_calls);
    modwerk_settings_select(0,epoch,0);CHECK(action_calls==1);
    CHECK(calls[2]==original_calls && !memcmp(original_store,store,sizeof store));
    st_seen=1;modwerk_settings_tick();CHECK(action_calls==1 && calls[2]==original_calls);
'''
    fixture=fixture.replace('    if (failures) return 1;',exercise+'    if (failures) return 1;',1)
    (work/'test.c').write_text(fixture)
    subprocess.run(['clang','-std=c11','-Wall','-Wextra','-Werror','-O1','-fsanitize=undefined','-fno-sanitize-recover=all',
        '-I'+str(machine/'include'),str(work/'test.c'),'-o',str(work/'test')],check=True)
    subprocess.run([str(work/'test')],check=True)
    # Native host UI fixture: the real key/draw code, not firmware execution.
    (work/'status.c').write_text(status((source/'status.c').read_text()))
    fixture=(source/'test_status.c').read_text()
    fixture=fixture.replace('selections, grouped_fixture;', 'selections, grouped_fixture, direct_fixture;',1)
    fixture=fixture.replace('v->fields = 1; v->count = 2;', 'v->fields = direct_fixture ? 2u : 1u; v->count = 2;',1)
    fixture=fixture.replace('strcpy(v->values[1], "POST LEVEL");', 'strcpy(v->values[1], direct_fixture ? (selections & 1u ? "S01 -40" : "S01 OFF") : "POST LEVEL");',1)
    exercise='''
    modwerk_test_menu_open=1;direct_fixture=1;modwerk_settings_menu(0);settings_press(YES);
    CHECK(choosing_setting==SETTING_MODULE && setting_field.row==0);
    unsigned before=selections;settings_press(DOWN);
    for(unsigned repeat=0;repeat<4;++repeat){
        settings_press(YES);CHECK(selections==before+repeat+1);
        CHECK(choosing_setting==SETTING_MODULE && setting_field.row==1);
        CHECK(strstr(shows(),"LAYOUT|TRACK TAP|") && strstr(said,"APPLY|") && !strstr(said,"PRE LEVEL"));
        CHECK(strstr(said,selections & 1u ? "S01 -40|" : "S01 OFF|"));
    }
    ++settings_fixture[0].epoch;settings_press(YES);CHECK(selections==before+4 && !choosing_setting);
    settings_press(NO);CHECK(open==CLOSED);direct_fixture=0;
'''
    fixture=fixture.replace('    grouped_fixture = 0;',exercise+'    grouped_fixture = 0;',1)
    (work/'test_status.c').write_text(fixture)
    subprocess.run(['clang','-std=c99','-Wall','-Wextra','-Werror','-pedantic','-O1',
        '-fsanitize=undefined','-fno-sanitize-recover=all','-DMODWERK_HOST',
        '-DMODWERK_DSP_ALLOWANCE0=3120','-DMODWERK_DSP_ALLOWANCE1=3565','-DMODWERK_DSP_RESERVE=342',
        '-I'+str(source),'-I'+str(machine.parents[1]/'octabam/platform/dsp-dynload-transport'),
        '-I'+str(machine.parents[1]/'runtime/upload'),'-I'+str(machine.parents[1]/'runtime/loader'),
        str(work/'test_status.c'),'-o',str(work/'test-status')],check=True)
    subprocess.run([str(work/'test-status')],check=True)
print('PASS: original settings/presets/UI plus direct row actions; repeated YES stays on row and refreshes values; no battery write, install replay or stale selection')
