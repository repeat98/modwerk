/* SPDX-License-Identifier: GPL-3.0-or-later
 * PROJ > MODWERK > SETTINGS: one choice a module, changed on the unit (events.json ot_settings; owner, 20 November
 * 2026: one SETTINGS row for every module, and the base keeps the choice through a power cycle).
 *
 * A module contributes one struct modwerk_setting: a label, two to six choice names and apply(choice). The base lists
 * the settings (status.c's page), calls apply when the player confirms a choice, and keeps the choice in battery
 * RAM under the label's hash, so a module replaced by a newer version or by another build of itself (USB Audio in
 * another layout) keeps its setting, and one that is removed and installed again finds it. After every change of the
 * installed modules each setting's kept choice is applied again: a module starts with its first choice until then,
 * within a tick. A kept choice the installed record does not offer is the first one until the player chooses again;
 * the kept value stays, for the build that offers it.
 *
 * The store: 'MWS1', then MODWERK_SETTINGS_ROOM entries of the label's hash (0: free) and the choice. A store whose
 * magic is not ours is empty. With every entry taken a new setting replaces the entry its hash names: a setting of a
 * module long gone, most likely. UI task only; apply runs there, outside the mask, as part_menu.c's choose does.
 * Battery RAM: battery-ram.json. */
#include <stdint.h>
#include "modwerk_events.h"
#include "settings.h"
#ifndef ST_HOST /* test_settings.c maps these onto a model of the unit */
#include "loader.h"
#define ST_TABLE (MODWERK_OT_SETTINGS - RUNTIME_EVENTS)
#define ST_STORE ((volatile uint32_t *)0x100f9000u)
#define ST_MASK() modwerk_machine_mask()
#define ST_UNMASK(m) modwerk_machine_unmask(m)
#define ST_EPOCH() modwerk_runtime_owner_epoch()
#define ST_ROW() modwerk_runtime_event_row[ST_TABLE]
#endif
#define ST_MAGIC 0x4d575331u /* "MWS1" */
typedef struct modwerk_setting StEntry;
static int st_group(const StEntry *e)
{
    return e->abi == MODWERK_SETTING_ACTIONS_ABI || e->abi == MODWERK_SETTING_GROUP_ABI || e->abi == MODWERK_SETTING_PRESET_ABI;
}

/* Masked, so a table change is never seen half-way (midi_generators.c's mg_generators). */
static unsigned st_entries(const StEntry **out)
{
    unsigned n = 0;
    uint32_t mask = ST_MASK();
    for (uintptr_t volatile *row = ST_ROW(); *row && n < MODWERK_SETTINGS_ROOM; ++row) {
        const StEntry *e = (const StEntry *)*row;
        if (!e->label || !e->label[0] || !e->apply) continue;
        if (st_group(e) && !e->count && e->choices) {
            const struct modwerk_setting_pages *group = (const void *)e->choices;
            if (group->page && group->choose) out[n++] = e;
        } else if (e->abi == MODWERK_SETTING_ABI && e->choices && e->count >= 2u && e->count <= MODWERK_SETTING_OPTIONS)
            out[n++] = e;
    }
    ST_UNMASK(mask);
    return n;
}

/* FNV-1a of the label, never 0. */
static uint32_t st_key(const char *label)
{
    uint32_t h = 2166136261u;
    for (unsigned i = 0; i < 16u && label[i]; ++i) h = (h ^ (uint8_t)label[i]) * 16777619u;
    return h ? h : 1u;
}
static void st_format(void)
{
    volatile uint32_t *s = ST_STORE;
    if (s[0] == ST_MAGIC) return;
    for (unsigned i = 0; i < 2u * MODWERK_SETTINGS_ROOM; ++i) s[1u + i] = 0;
    s[0] = ST_MAGIC;
}
/* The kept choice under this key: what the store holds, whatever the record offers. 0 without one. */
static uint32_t st_kept(uint32_t key)
{
    volatile uint32_t *s = ST_STORE;
    if (s[0] != ST_MAGIC) return 0;
    for (unsigned i = 0; i < MODWERK_SETTINGS_ROOM; ++i) if (s[1u + 2u * i] == key) return s[2u + 2u * i];
    return 0;
}
static void st_keep(uint32_t key, uint32_t choice)
{
    volatile uint32_t *s = ST_STORE;
    unsigned at = MODWERK_SETTINGS_ROOM;
    st_format();
    for (unsigned i = 0; i < MODWERK_SETTINGS_ROOM; ++i) if (s[1u + 2u * i] == key) at = i;
    for (unsigned i = 0; at == MODWERK_SETTINGS_ROOM && i < MODWERK_SETTINGS_ROOM; ++i) if (!s[1u + 2u * i]) at = i;
    if (at == MODWERK_SETTINGS_ROOM) at = key % MODWERK_SETTINGS_ROOM;
    s[2u + 2u * at] = choice; /* the value first: a power cut between the two leaves the entry's old key or a free one */
    s[1u + 2u * at] = key;
}
#include "setting_presets.h"
/* The choice in force for this record: the kept one when the record offers it. */
static unsigned st_choice(const StEntry *e)
{
    if (e->abi == MODWERK_SETTING_ACTIONS_ABI) return 0; /* actions have no persistent choice */
    uint32_t key = st_key(e->label), kept = st_kept(key);
    if (e->abi == MODWERK_SETTING_PRESET_ABI && e->reserved)
        return st_preset_choice(key, e->reserved, kept);
    return st_group(e) || kept < e->count ? (unsigned)kept : 0u;
}

static uint32_t st_seen = 1u; /* the owner epoch the choices were last applied for; odd: never */
/* Cached by the UI task whenever the installed table changes. EP0 reads only
 * copied integers and refuses a snapshot from before the latest switch. */
static volatile uint32_t st_preset_epoch = 1u;
static uint32_t st_preset_keys[MODWERK_SETTINGS_ROOM], st_preset_values[MODWERK_SETTINGS_ROOM];
static unsigned st_preset_count;
unsigned modwerk_settings_presets(uint8_t *out)
{
    uint32_t epoch = ST_EPOCH();
    if ((epoch & 1u) || st_preset_epoch != epoch) return 0;
    out[0] = 'M'; out[1] = 'W'; out[2] = 'P'; out[3] = (uint8_t)st_preset_count;
    for (unsigned i = 0; i < st_preset_count; ++i)
        for (unsigned j = 0; j < 4; ++j) {
            out[4 + 8*i + j] = (uint8_t)(st_preset_keys[i] >> (24 - 8*j));
            out[8 + 8*i + j] = (uint8_t)(st_preset_values[i] >> (24 - 8*j));
        }
    return 4u + 8u * st_preset_count;
}
void modwerk_settings_tick(void)
{
    const StEntry *e[MODWERK_SETTINGS_ROOM];
    uint32_t epoch = ST_EPOCH();
    if (epoch == st_seen || (epoch & 1u)) return; /* unchanged, or a change is under way */
    unsigned n = st_entries(e);
    if (ST_EPOCH() != epoch) return; /* it moved while the rows were read: the next tick */
    st_seen = epoch;
    unsigned count = 0;
    for (unsigned i = 0; i < n; ++i) {
        if (e[i]->abi == MODWERK_SETTING_PRESET_ABI) {
            st_preset_keys[count] = st_key(e[i]->label);
            st_preset_values[count++] = e[i]->reserved;
        }
        if (e[i]->abi != MODWERK_SETTING_ACTIONS_ABI) e[i]->apply(st_choice(e[i]));
    }
    st_preset_count = count;
    __asm__ volatile ("" ::: "memory");
    st_preset_epoch = epoch;
}
unsigned modwerk_settings_count(void)
{
    const StEntry *e[MODWERK_SETTINGS_ROOM];
    return st_entries(e);
}
static void st_text(char out[16], const char *name)
{
    unsigned j = 0;
    while (name && j < 15u && name[j]) { out[j] = name[j]; ++j; }
    out[j] = 0;
}
unsigned modwerk_settings_field(unsigned i, unsigned field, struct modwerk_setting_view *view)
{
    const StEntry *entries[MODWERK_SETTINGS_ROOM];
    uint32_t epoch = ST_EPOCH();
    if ((epoch & 1u) || i >= st_entries(entries)) return 0;
    uint32_t mask = ST_MASK();
    if (epoch != ST_EPOCH()) { ST_UNMASK(mask); return 0; }
    const StEntry *e = entries[i];
    view->epoch = epoch;
    view->fields = 0;
    view->count = 0;
    if (st_group(e)) {
        const struct modwerk_setting_pages *group = (const void *)e->choices;
        struct modwerk_choice_page page = {0};
        group->page(st_choice(e), field, &page);
        if (page.count && page.count <= MODWERK_SETTING_PAGE_ROOM && page.active < page.count) {
            view->fields = field == MODWERK_SETTING_FIELDS ? (e->abi == MODWERK_SETTING_ACTIONS_ABI ? 2u : 1u) : 0u;
            view->active = page.active;
            view->count = page.count;
            st_text(view->label, view->fields && !(e->abi == MODWERK_SETTING_ACTIONS_ABI && page.label) ? e->label : page.label);
            for (unsigned j = 0; j < page.count; ++j) {
                st_text(view->choices[j], page.names[j]);
                if (view->fields) st_text(view->values[j], page.values[j]);
            }
        }
    } else if (field == MODWERK_SETTING_FIELDS) {
        view->count = e->count;
        view->active = st_choice(e);
        st_text(view->label, e->label);
        for (unsigned j = 0; j < e->count; ++j) st_text(view->choices[j], e->choices[j]);
    }
    ST_UNMASK(mask);
    return view->count != 0;
}
unsigned modwerk_settings_read(unsigned i, struct modwerk_setting_view *view)
{
    return modwerk_settings_field(i, MODWERK_SETTING_FIELDS, view);
}
void modwerk_settings_choose(unsigned i, uint32_t epoch, unsigned field, unsigned choice)
{
    struct modwerk_setting_view view;
    const StEntry *entries[MODWERK_SETTINGS_ROOM];
    if (!modwerk_settings_field(i, field, &view) || view.fields == 1u || view.epoch != epoch ||
        choice >= view.count || i >= st_entries(entries) || ST_EPOCH() != epoch) return;
    const StEntry *e = entries[i];
    if (e->abi == MODWERK_SETTING_ACTIONS_ABI) {
        const struct modwerk_setting_pages *actions = (const void *)e->choices;
        (void)actions->choose(0, field, choice);
        return;
    }
    uint32_t value = choice;
    if (st_group(e)) {
        const struct modwerk_setting_pages *group = (const void *)e->choices;
        value = group->choose(st_choice(e), field, choice);
    }
    if (e->abi == MODWERK_SETTING_PRESET_ABI && e->reserved)
        st_save_preset(st_key(e->label), e->reserved, value);
    else st_keep(st_key(e->label), value);
    e->apply(value);
}
void modwerk_settings_select(unsigned i, uint32_t epoch, unsigned choice)
{
    modwerk_settings_choose(i, epoch, MODWERK_SETTING_FIELDS, choice);
}
