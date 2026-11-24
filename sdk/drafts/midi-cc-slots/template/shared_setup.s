| SPDX-License-Identifier: MIT
| Current base owns NOTE SETUP's entry. Its stock body reaches this private
| epilogue (including the null-window branch), then base generator drawing runs.
| Keep the 52-byte stock save frame intact while drawing our right-hand labels.
.global names_shared_setup_exit,replay_shared_setup_exit
names_shared_setup_exit:
 lea %sp@(-16),%sp
 moveml %d0-%d1/%a0-%a1,%sp@
 jsr names_template_draw
 moveml %sp@,%d0-%d1/%a0-%a1
 lea %sp@(16),%sp
replay_shared_setup_exit:
 .space 8
 jmp 0x40036792
