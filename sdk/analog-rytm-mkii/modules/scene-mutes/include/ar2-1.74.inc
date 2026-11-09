| scene-mutes: the firmware symbols it names, at their Analog Rytm MKII OS 1.74 addresses.
| Main OS sha256 34cd0c4da8e4b810d1b25284475a99ea53821e2ab7d30a978bf15dc578251f3b.
| From rytm-mods-src re/symbols.toml (OS 1.73), each address moved by the region shifts of
| rytm2_mods tools/port_os.py: code by 0x6c or 0x1cc, the vtable by 0x2b0, RAM unmoved.
| Addresses and constants only.

        .equ    LED_REGION_TRIGS, 0x00000001      | const
        .equ    KEY_FUNC, 0x00000080              | const
        .equ    PROJECT_WORKING_KIT, 352          | const: the project's working KitSlot
        .equ    KIT_SPARE_A, 0x00000832           | const: stored kit, 16 B stock leaves alone
        .equ    KIT_SPARE_B, 0x00000902           | const: stored kit, 21 B stock leaves alone
        .equ    STORED_KITS, 0x0019d3fb           | const: kit 0's record in PROJECT_IMAGE
        .equ    STORED_KIT_SIZE, 0x00000a32       | const

        .equ    is_key_held, 0x40081c28           | fn
        .equ    led_set, 0x400a05aa               | fn
        .equ    kit_scene_active, 0x400a6fdc      | fn
        .equ    kit_scene_set_active, 0x400a7d70  | fn
        .equ    kit_scene_set_active_body, 0x400a7d78 | data: past its entry's 8 bytes
        .equ    track_selection, 0x400ae492       | fn
        .equ    project_kit, 0x400ae4ca           | fn
        .equ    mute_mask_get, 0x400b6d64         | fn
        .equ    track_mute_set, 0x400b78d8        | fn
        .equ    track_mute_set_body, 0x400b78e0   | data: past its entry's 8 bytes
        .equ    scene_edit_leds, 0x400d0c46       | fn: SceneEditView vtable slot 5
        .equ    scene_edit_clear_invoker, 0x400d0e40 | fn
        .equ    scene_edit_clear_all_invoker, 0x400d0eda | fn
        .equ    scene_edit_keys, 0x400d1378       | fn: SceneEditView vtable slot 2
        .equ    project_singleton, 0x4017fa0a     | fn
        .equ    led_manager, 0x401822f6           | fn
        .equ    PROJECT_IMAGE, 0x405c8f20         | data: the stored project
