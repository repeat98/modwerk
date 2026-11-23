#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Local USB runner; its default entry point is the read-only diagnostic.

Run from the user's Terminal if the agent environment cannot enumerate USB.
The explicit trial_unused.py and trial_listen.py entry points select their
pinned RAM-trial clients. None of these clients accepts/Keep or flashes.
"""
from pathlib import Path
import select
import signal
import subprocess
import sys
import tempfile


def run_client(client='read_hardware.mjs', *, end_check=False):
    if end_check and client != 'trial_current_listen.mjs':
        raise ValueError('Contrôle court réservé au lanceur courant')
    if client not in ('read_hardware.mjs', 'inspect_hardware.mjs', 'trial_unused.mjs', 'trial_current_base.mjs', 'trial_current_listen.mjs', 'trial_listen.mjs', 'recover_trial.mjs', 'recover_current_trial.mjs'):
        raise ValueError('Client USB non autorisé')
    listening = client in ('trial_listen.mjs', 'trial_current_listen.mjs')
    recovery = client in ('recover_trial.mjs', 'recover_current_trial.mjs')
    protected_cleanup = listening or client == 'trial_current_base.mjs'
    trial = client not in ('read_hardware.mjs', 'inspect_hardware.mjs')
    sdk = Path(__file__).resolve().parents[3]
    integration = sdk.parent
    node = integration / 'local-tools/node24/node-v24.22.3-darwin-arm64/bin/node'
    bridge = sdk / 'scripts/octatrack-usb-bridge.py'
    if recovery:
        print('Récupération : annuler la transaction existante, puis vérifier 0 module.', flush=True)
        print('Aucun paquet envoyé, aucun Keep, aucune sauvegarde ou mise à jour.', flush=True)
    elif listening:
        print('Essai RAM interactif sur T1 de SUPER SAW TEST. Aucun Keep ou flash.' if client == 'trial_current_listen.mjs' else 'Essai RAM interactif sur T1 de SS_TEST. Aucun Keep ou flash.', flush=True)
        print('Fin : STOP, remettre T1 sur FLEX, puis taper FIN et Entrée.', flush=True)
    elif trial:
        print('Essai RAM de SuperSAW sans affectation à une piste, dix secondes puis Undo.', flush=True)
        print('Aucun Keep, aucune sauvegarde de projet, aucun flash.', flush=True)
    else:
        print('Lecture seule publique : identité, modules et charges CPU/DSP.', flush=True)
        print('Aucun module envoyé ; aucune sauvegarde ou mise à jour.', flush=True)
    with tempfile.TemporaryDirectory(prefix='sw-recover-' if recovery else 'sw-trial-' if trial else 'sw-read-', dir='/tmp') as directory:
        endpoint = str(Path(directory) / 'usb.sock')
        child = subprocess.Popen(
            [sys.executable, '-B', str(bridge), endpoint], cwd=sdk,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
            start_new_session=protected_cleanup,
        )
        try:
            if not select.select([child.stdout], [], [], 15)[0]:
                raise RuntimeError('La passerelle USB ne répond pas dans le délai prévu.')
            line = child.stdout.readline().strip()
            print(line, flush=True)
            if not line.startswith('bridge ready on '):
                raise RuntimeError('Interface Modwerk inaccessible. Fermer son onglet Chrome, puis réessayer depuis Terminal.')
            previous_sigint = signal.getsignal(signal.SIGINT)
            if protected_cleanup:
                interrupt_message = ('Fin demandée : STOP sur l’Octatrack, T1 sur FLEX, ouvrir AMP, puis Q et Entrée.'
                                     if client == 'trial_current_listen.mjs' else
                                     'Fin demandée ; laisser le client effectuer Undo après retour à FLEX.' if listening else
                                     'Fin demandée ; laisser le client terminer son retrait automatique.')
                signal.signal(signal.SIGINT, lambda *_: print(interrupt_message, flush=True))
            try:
                result = subprocess.run(
                    [str(node), 'sdk/drafts/supersaw/' + client, endpoint] + (['--end-check'] if end_check else []),
                    cwd=sdk, timeout=None if listening else 120 if trial else 45,
                )
            finally:
                if protected_cleanup:
                    signal.signal(signal.SIGINT, previous_sigint)
            if result.returncode:
                raise RuntimeError('Échec du test ; lire le résultat Undo avant de poursuivre.' if trial else 'Le diagnostic SDK a échoué ; aucun essai de module lancé.')
        finally:
            if child.poll() is None:
                child.terminate()
                try:
                    child.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait()
    print('Interface USB libérée.', flush=True)


if __name__ == '__main__':
    try:
        if sys.argv[1:] not in ([], ['--inspect']):
            raise RuntimeError('Option inconnue ; utiliser --inspect pour identifier une nouvelle base en lecture seule.')
        run_client('inspect_hardware.mjs' if sys.argv[1:] else 'read_hardware.mjs')
    except (RuntimeError, subprocess.TimeoutExpired) as error:
        print('ARRÊT : ' + str(error), file=sys.stderr)
        sys.exit(1)
