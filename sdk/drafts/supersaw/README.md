# SuperSAW V0.32 — protection et restauration des projets

**Sources de développement. Aucun firmware ou module à installer dans cet instantané.**

## État actuel — 22 novembre 2026

La base actuellement testée est Modwerk 0.7.13 (`6d23e888…`). L'écoute sur T1,
les P-locks, filtre/delay et samples FLEX sur T2–T4 sont positifs selon José.
Après un retrait temporisé non confirmé puis une vérification retrouvant l'état
normal et zéro module, le script attend désormais une confirmation manuelle.
Deux contrôles courts consécutifs ont confirmé Undo et l'identité précédente.

Le moteur sonore est inchangé. Le paquet public, le coût propre au moteur,
SW/1 au démarrage, les sauvegardes, Keep et reboot restent à qualifier.
Voir `REVIEW_REQUEST.md`, `SUBMISSION_STATUS.md` et la section du 22 novembre
dans `TESTING.md`. Les paragraphes ci-dessous décrivent les étapes antérieures
sur les anciennes bases et ne représentent pas une qualification actuelle.

## Historique technique antérieur

Le raccordement à la base Modwerk progresse : affectation à une piste, refus
d’une seconde SuperSAW dans la même Part, refus de retrait lorsqu’elle est utilisée,
puis retour à FLEX et retrait passent dans le modèle USB natif. Les protections
du firmware restent actives. Le moteur sonore V0.27 et ses douze fichiers gelés
restent identiques.

Le scénario USB/base/DSP passe aussi ses **18 contrôles sur la base complète bêta** : note manuelle,
FUNC+STOP sans coupure, relâchement, STOP vers le silence, nouvelle note,
nouveau relâchement et retrait après retour à FLEX. Voir `TESTING.md` et
`evidence/usb-dsp-beta-v032.json`. Les 11 contrôles de restauration CF
passent également sur cette base. Ces résultats concernent l’émulateur.
La base publique `27c9d36f…` est maintenant installée sur l’Octatrack de José.
Le premier essai matériel du paquet, sans affectation à une piste, passe ses
dix secondes puis Undo : identité précédente restaurée et inventaire vide.
Voir `evidence/hardware-unused-trial.json`. José confirme ensuite le son sur T1 de SS_TEST et son arrêt par STOP ;
Undo est également vérifié après cette écoute. Les contrôles SRC, le séquençage, les P-locks et les LFO ont ensuite été
essayés à l’écoute par José ; le retrait de la dernière session est confirmé.
Voir [le journal](JOURNAL.md). Le coût précis d’une voix active et la
coexistence restent à tester. Aucun Keep
ou redémarrage n’est qualifié.

## Raccordement

- Machine SUPERSAW, signature SW/1, descripteur ABI de 80 octets et START typé
  séparé de 16 octets. Une seule instance admise par Part via le sélecteur.
- Page SRC : TUNE, DETN, MIX, OSC, WIDE, LEVL ; OSC enregistré 0–6, affiché 1–7.
  Valeurs initiales : 64, 85, 127, 6, 127, 80.
- Production directe de paquets PCM32 stéréo, sans voix FLEX servant de support.
- MIDI et touches chromatiques utilisent les événements de la base ; leurs
  continuations natives de note tenue et de gate sont conservées.
- Relâchement et arrêt d’une voix native publient des tickets de génération.
  Le moteur audio les applique ; un ticket d’une ancienne note ne coupe pas
  sa remplaçante. Un START accepté après un arrêt peut redémarrer normalement.
- Le callback `module_key` observe STOP puis laisse la touche à la base.
  FUNC+STOP est exclu à partir des lignes de touches natives, même si FUNC
  était tenu avant le chargement du module. Aucun site partagé n’est patché.
- Le callback `ev_tail_kill` reste distinct : c’est la coupure native des queues.

## Ce qui a changé dans le banc d’essai

La fixture V0.30 stationnait les appels empruntés dans une ancienne boucle stock,
hors de la boucle idle reconnue par la base. Avec l’exécution réelle des
instructions idle et le retour à la boucle reconnue, l’affectation passe.
Aucun seuil CPU, compteur invité ou garde n’est forcé. Les valeurs CPU du modèle
ne sont pas des mesures du coût de SuperSAW sur le matériel.

L’horloge virtuelle est maintenant valide. PLAY et STOP doivent changer le
transport natif avant le test de note manuelle : une fenêtre de date ne peut
plus faire passer un échec de livraison de touche pour un défaut sonore.
Les essais négatifs antérieurs sont conservés dans `evidence/stop-regression.json`.

## Avant l’installation

Lire `PREPARER_ESSAI_REEL.md`. José a confirmé l’OS officiel 1.40C, une sauvegarde
CF entreprise (fin de copie à vérifier) et le port MT4 Port 1, câblé OUT 1 vers MIDI IN de l’Octatrack. Ces informations
matérielles sont déclarées par José ; le transfert SysEx de secours n’est pas testé.

La correction SW/1 est maintenant appliquée dans une **branche locale séparée**
de la base, `fix/supersaw-absent-signature`. Treize tests du registre/événements
passent ; le nouveau test échoue sur l’ancienne base sans correction.
La proposition V0.31 `SW1_BASE_PROPOSAL.patch` reste un document historique.

Onze contrôles passent dans trois processus d’émulation neufs : absence du module,
installation/Keep, restauration automatique depuis la CF virtuelle, refus de retrait
en cours d’utilisation, retour à FLEX, retrait conservé puis redémarrage sans module.
Les douze octets de source et la signature du projet de test restent intacts.
Le projet CF est préparé hors appareil ; le banc ne préserve pas la SRAM batterie
entre processus et n’exerce pas SAVE PROJECT. Il ne prouve pas un redémarrage physique.

La base publique de modwerk.app et le dépôt GitHub de présentation ne sont pas
modifiés par ces essais. Voir `evidence/base-protection.json` et `TESTING.md`.

Restent aussi les changements de Part/projet, les signatures enregistrées en
plusieurs exemplaires, les mutes, les scènes et l’enregistrement sur ce nouveau
raccordement, puis la compatibilité avec une base installable identifiée et les
mesures réelles CPU/DSP. Le coût CPU à zéro du descripteur demande le forfait
de repli de la base ; il ne signifie pas une consommation nulle.

Les images privées `NOT_FLASH_CANDIDATE` ne sont pas des fichiers à installer.
La première installation de base et le chargement d’un module par USB sont deux
opérations distinctes. Le catalogue public et `module:doctor` restent non qualifiés.

## Reproduire

Depuis un checkout SDK épinglé, avec clang, ASan/UBSan et m68k-elf :

- `python3 -B sdk/drafts/supersaw/verify.py`
- `python3 -B sdk/drafts/supersaw/verify_native.py --native CHEMIN_OCTABAM --stock MAIN_PRIVE --out NOUVEAU_DOSSIER`
- `python3 -B sdk/drafts/supersaw/verify_absent_signature.py --sdk . --out RAPPORT_JSON`
- `prepare_lifecycle.py` exige un donneur au format PART récent, contrôlé avant
  modification, et supprime ses entrées SAMPLE. Les anciens formats doivent être
  convertis par un chemin qualifié avant emploi ; aucun offset récent ne leur est appliqué.
- `verify_cold_restore.mjs` reste verrouillé sur le répertoire privé de la V0.32.
- `build_private.py --help` et `build_pipe.py --help` décrivent les constructions
  privées. Le paquet exige le conteneur original ; la fixture ColdFire exige sa
  section MAIN. Ces fichiers restent locaux et ne sont pas distribués.

Le banc USB utilise les classes SDK d’origine et les modèles RTOS/USB/CF natifs
par stdin/stdout, sans réseau ni API USB physique. Le profil `frame-dsp` utilise
les deux DSP en interprétation ; `frame-only` ne prouve pas la sortie sonore.
Les options `--step-idle --resume-idle` ne modifient que l’émulateur privé.

## Provenance et licences

Projet de José Aleixo. Moteur gelé depuis le commit V0.27 `18c1296` ; empreintes
dans `provenance.json`. SDK Modwerk : `b52d11e00a124a7e1ae35d23eff5b4d072ab961f`.
Elekloader : `3b31ef3c0e43c810e3acd0be6257e2484b20fc40`.

Moteur et passerelle sous MIT ; notices de Tim Hastie et Sam Banks conservées
dans `LICENSE-TIM` et `LICENSE-OCTABAM`. En-têtes SDK sous leurs licences
d’origine : `modwerk_page.h` MIT, `modwerk_events.h` GPL-3.0-or-later ;
`support/m68k_codegen.py` GPL-3.0-or-later. Texte GPL inclus.
