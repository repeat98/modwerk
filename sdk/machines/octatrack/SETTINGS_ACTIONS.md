# Direct settings actions (proposal)

A nonpersistent action is a command, not an instrument setting. The proposed
ABI4 record uses the existing ot_settings table and grouped pages shape. It
adds no hook number and requires no DSP or track processor service.

YES on an action row invokes choose(0, MODWERK_SETTING_FIELDS, row) once,
stays on that field row and redraws its current value. A dynamic page label can
report module-owned context. This is useful for capture, clear and reset
commands that must not run again just because modules were installed or undone.
M/S scene capture/clear is the first separately developed consumer; this API is
submitted independently from its audio processing, as requested in PR2248.

Contribute a fully populated modwerk_setting with abi set to
MODWERK_SETTING_ACTIONS_ABI, count zero and choices pointing to the module's
modwerk_setting_pages. Preserve the existing record requirements, including
valid module-owned callbacks. The apply callback is never invoked for this ABI.
The page callback supplies the field list for MODWERK_SETTING_FIELDS. The
choose result is ignored; the module owns the command, any state and persistence.
No battery choice is read or saved, and installation, MODULES READY and Undo
never replay the action. Callbacks retain the existing UI-task restrictions.

Epoch, current module and row bounds validate before dispatch. A stale context
refuses. Existing ABI1 choices, ABI2 grouped options and ABI3 presets retain
their previous apply and persistence paths.

Check with python3 -B sdk/tests/settings_actions/check_actions.py and
events.py --check. The fixture executes the actual settings and status key/draw
code natively, with native platform facts substituted. It covers original
settings/presets and action behavior, repeat YES, retained row, refreshed value,
stale epoch and no battery write or installation replay. No firmware, emulator
or DSP executes. Current upstream port is not physically qualified.
