# SuperSAW — préparation du premier essai sur Octatrack MKII

État du 15 novembre 2026 : **base publique installée et connectée selon les
captures de José ; installation de SuperSAW en attente de validation**.
Ce dossier ne contient aucun firmware à flasher. Nos images privées de développement
ne sont pas les fichiers d’installation de la base publique Modwerk.

## 1. Ce qui est déjà identifié

- Octatrack MKII : base Modwerk publique `27c9d36f…` installée par José à
  partir de son OS 1.40C, démarrage et connexion reconnus par le site.
- Fichier téléchargé `Modwerk-octatrack-base-44cb5b.bin`, SHA-256
  `44cb5b245c789f512ec015945a50f971dcb5d259c8c86e6a45b2d7fbbb825707`.
  Sa section MAIN est identique à notre reconstruction de cette base publique.
- Aucun module présent sur les captures fournies. Relevé instantané : CPU 43,4 %,
  DSP T1–4 50,3 %, DSP T5–8 41,9 %. Ce sont des mesures fournies par capture,
  pas une mesure indépendante du coût de SuperSAW.
- José confirme la sauvegarde de la CF d’origine, une copie de secours sur Mac
  et une copie sur la nouvelle CF destinée aux essais. Le contenu n’a pas été
  inspecté ici ; la confirmation repose sur son retour.
- Nouvelle CF formatée et installée dans l’Octatrack, confirmé par José.
- Interfaces MOTU 828x et MT4 branchées, déclarées par José.
- Port **MT4 Port 1** visible dans l’interface Mac, confirmé par José.
- Câblage déclaré : **MT4 OUT 1 → MIDI IN de l’Octatrack**.
- José confirme également le câble USB entre Octatrack et Mac. Le MT4 est
  visible dans IORegistry ; l’Octatrack n’y apparaît pas lors de la lecture
  préalable au passage en USB DISK MODE. Les captures ultérieures du site
  confirment sa connexion sur la base publique. L’environnement de l’agent
  retourne cependant zéro appareil avec libusb ; un relevé en lecture seule
  depuis le Terminal natif est préparé dans `read_hardware.py`.
- Le diagnostic CoreMIDI depuis l’environnement de travail ne voit aucune
  destination ; la reconnaissance du port repose ici sur le retour de José.
  Aucun transfert SysEx de récupération n’a été testé.
- Les fichiers officiels `.bin` et `.syx` présents dans le projet sont reconnus
  comme OS 1.40C par le décodeur utilisé pour construire les tests locaux.

## 2. Préparer maintenant le secours MIDI

1. Brancher l’interface MIDI au Mac et l’allumer si nécessaire.
2. Ouvrir `Configuration audio et MIDI` sur macOS et afficher le Studio MIDI.
3. Vérifier que l’interface apparaît et relever le nom exact de sa sortie MIDI.
4. Relier **MIDI OUT de l’interface → MIDI IN de l’Octatrack**, avec un câble DIN 5 broches.
5. Exécuter `DIAGNOSTIC_MIDI.command` dans ce dossier et conserver le résultat.
   Le diagnostic liste les sorties CoreMIDI ; il n’envoie aucun message MIDI.
6. Sortie retenue dans Transfer : **MT4 Port 1**, lorsqu’elle est proposée.
   La présence d’un port ne démontre pas encore un transfert SysEx complet.

La MOTU 828x peut aussi fournir une entrée et une sortie MIDI DIN si son pilote
et sa connexion au Mac fonctionnent ; ce n’est pas une obligation d’en acheter une.

## 3. Vérifier la sauvegarde avant toute installation

- Conserver une copie séparée et datée de la racine de la CF, avec tous les Sets,
  dossiers AUDIO, projets et fichiers `.work` / `.strd`.
- Vérifier que quelques projets et samples sont bien présents dans la copie.
- Prévoir un Set et un projet de test sans travail important. Ne pas utiliser
  une session musicale en cours comme premier essai.
- Garder à part les deux fichiers officiels 1.40C, sans les renommer comme un
  firmware modifié. Les empreintes attendues sont dans `OFFICIAL_OS_SHA256.txt`.

## 4. Préparation de la base publique

Dans Chrome ou Edge, ouvrir modwerk.app, puis Your Octatrack → Setup
(ou Set up my Octatrack). Le guide propose Choose OS 1.40C file, puis
Download base .bin après lecture des conditions. Choisir le fichier original
`OCTATRACK_OS1.40C.bin`, pas une image privée de développement. La construction
reste dans le navigateur. Relever le nom du fichier téléchargé et vérifier
son identité avant la copie sur la CF et le lancement OS UPGRADE.

La base publique est distincte de la base locale corrigée et qualifiée en
émulation. Le téléchargement ne qualifie pas encore SuperSAW sur cette base.
La première installation de base et l’essai RAM du module sont deux étapes.

## 5. Conditions pour passer à l’installation

Nous devons disposer d’un candidat identifié et d’une procédure correspondant
à la base réellement installée, après vérification de l’affectation, du rendu,
des STOP et du retrait du module. L’ancienne lecture CPU en émulation ne constitue
pas une mesure de consommation physique.

Le premier essai prévu utilise une seule SuperSAW, sans effets, dans un projet
jetable, puis mesure la charge avec les mêmes réglages de page et de pistes.
La protection CPU et le garde-fou de rendu restent actifs.

La base Modwerk s’installe une première fois suivant le parcours de
[modwerk.app](https://modwerk.app/), à partir de l’OS original et de la CF.
Le chargement ultérieur d’un module USB constitue une opération distincte.
**Aucun fichier `NOT_FLASH_CANDIDATE` de nos essais locaux ne doit être installé.**

Une fois le candidat validé : essai RAM d’abord, contrôle du son et des compteurs,
retour de la piste à FLEX avant Undo, puis seulement décision de conserver le module.
Éviter de sauvegarder un projet dépendant de SuperSAW pendant ce premier essai :
la correction SW/1 passe maintenant dans une base locale et des redémarrages
virtuels ; son intégration à la base utilisée sur le matériel reste à qualifier.

### Premier essai : admission sans affectation

Fermer l’onglet Modwerk pour libérer l’USB et arrêter la lecture. Depuis le
Terminal déjà placé dans SuperSAW-OT-Integration, lancer :

```sh
./local-tools/usb-venv/bin/python -B modwerk-supersaw-work/sdk/drafts/supersaw/trial_unused.py
```

Pendant dix secondes, ne pas affecter la machine à une piste et ne pas manipuler
le projet. Le lanceur effectue ensuite Undo et vérifie identité/inventaire.
Attendre `UNDO CONFIRMÉ : 0 module, identité précédente restaurée.`
Une erreur ou un retrait non confirmé arrête la suite ; ce passage ne qualifie
ni le son, ni le jeu, ni la sauvegarde ou la consommation d’une voix active.

### Deuxième essai : T1 de SS_TEST

José confirme le projet vide SS_TEST créé et chargé. Depuis le même Terminal :

```sh
./local-tools/usb-venv/bin/python -B modwerk-supersaw-work/sdk/drafts/supersaw/trial_listen.py
```

Attendre SUPERSAW PRÊT EN RAM. Garder ce Terminal ouvert, Modwerk fermé et le
volume bas. Double-appui sur T1, LEFT si la liste de samples s’affiche, choisir
SUPERSAW puis YES. Ouvrir SRC et vérifier les six contrôles avant de jouer.
Une seule piste SuperSAW ; aucune sauvegarde du projet pendant cet essai.
Pour terminer : STOP, réaffecter T1 à FLEX depuis la même liste, puis FIN ou Q et
Entrée dans le Terminal. Les mesures sont enregistrées chaque seconde sans
défilement automatique ; CPU ou C puis Entrée affiche le dernier relevé. Le programme attend le retour à FLEX si la base
refuse le retrait occupé. Sans UNDO CONFIRMÉ, ne pas relancer de module.

## 6. Revenir à l’OS officiel

### Si l’Octatrack démarre normalement

Le manuel Elektron décrit le retour par CF : mettre le `.bin` officiel à la racine,
éjecter proprement le volume sur le Mac, puis utiliser `PROJECT → SYSTEM → OS UPGRADE`.
Avant cela, sauvegarder le projet actif : l’opération synchronise son état sur la CF.

### Si le système ne démarre plus normalement

Le chemin documenté par Elektron est le menu de démarrage : maintenir **FUNC** à
l’allumage, choisir **TRIG 3 / MIDI UPGRADE**, puis envoyer le `.syx` officiel avec
Elektron Transfer par l’interface MIDI DIN. Attendre la fin de l’écriture et du
démarrage ; ne pas couper l’alimentation pendant la mise à jour.

Le menu de démarrage ne reçoit pas cette mise à jour par le port USB de l’Octatrack.
Undo d’un module ne réinstalle pas, à lui seul, l’OS officiel.

## Références

- [Manuel Elektron Octatrack MKII, SYSTEM et STARTUP](https://www.elektron.se/wp-content/uploads/2024/09/Octatrack-MKII-User-Manual_ENG_OS1.40A_210414.pdf), pages 32–33 et 112.
- [Support Elektron : transfert SysEx et démarrage](https://support.elektron.se/support/solutions/articles/43000662701-how-to-update-your-device-via-sysex-transfer).
- [Manuel MOTU 828x Mac](https://cdn-data.motu.com/manuals/thunderbolt/828x_Manual_Mac.pdf), section MIDI I/O.

Cette préparation ne garantit pas qu’une récupération résoudra toute panne.
Le fonctionnement matériel, les données conservées et la récupération de notre
combinaison exacte base/module ne sont pas encore qualifiés sur ton Octatrack.
