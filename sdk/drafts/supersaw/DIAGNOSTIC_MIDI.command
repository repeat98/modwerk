#!/bin/bash
# SPDX-License-Identifier: MIT
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
task_cache="$(mktemp -d "${TMPDIR:-/tmp}/supersaw-midi-read.XXXXXX")"
trap 'rm -rf -- "$task_cache"' EXIT
printf '%s\n' 'SuperSAW — diagnostic MIDI en lecture seule'
/usr/bin/swift -module-cache-path "$task_cache" "$script_dir/MIDIRead.swift"
printf '\n%s\n' 'Conserver le nom de la sortie et le modèle de votre interface.'
read -r -p 'Appuyer sur Entrée pour fermer.'
