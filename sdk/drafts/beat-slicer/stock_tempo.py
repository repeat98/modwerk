"""Normal stock TEMPO/LEVEL panel helper; no direct tempo stores or native call."""
def runtime_tempo(port):return int.from_bytes(port.peek(0x80001814,4),'big')
def tempo_key(port):
    port.command('key 0x23 1');port.command('run 60')
    port.command('key 0x23 0');port.command('run 60')
def set_project_tempo(port,bpm):
    if not isinstance(bpm,int) or not 30<=bpm<=300:raise ValueError('Integer BPM 30..300 only.')
    before=runtime_tempo(port)
    if before%24:raise ValueError('This measured helper starts at integer runtime BPM.')
    tempo_key(port)
    # First prove the observed LEVEL detent step, then use bounded ordinary turns.
    probe=-1 if before//24>30 else 1
    port.command(f'key 0x36 {probe & 255}');port.command('run 120')
    observed=runtime_tempo(port)
    if observed != before+probe*24:raise RuntimeError('Stock LEVEL detent mapping differs.')
    while observed != bpm*24:
        remaining=bpm-observed//24;delta=max(-30,min(30,remaining))
        port.command(f'key 0x36 {delta & 255}');port.command('run 120')
        changed=runtime_tempo(port)
        if changed!=observed+delta*24:raise RuntimeError('Stock bounded tempo turn differs.')
        observed=changed
    # NO leaves the tempo window; it does not undo an accepted tempo adjustment.
    port.command('key 0x26 4');port.command('run 60')
    port.command('key 0x26 0');port.command('run 60')
    if runtime_tempo(port)!=bpm*24:raise RuntimeError('Closing tempo window changed the tempo.')
    return {'beforeBpm24':before,'afterBpm24':observed,'normalPanelOnly':True,'levelDetentBpm24':24}
