# SuperSAW V0.32 — protection SW/1 et restauration

## 23 November 2026 — 0.32.0-source-draft review preparation

Source-only import onto Modwerk main
`6b741ea15da20c6bfdfacefcad2b8b314f340913`, using the public archive SHA-256
`c94980e59c55f3b9e2146526993ff77bcf425aa81d9bf00bf582d76ab1353475`.
All 133 exported file hashes matched before this documentation update.
The engine and pinned headers are unchanged. This combined checkout is
**not tested on a unit**. Historical reports below apply only to their exact
named package and base. No hardware access, Keep or update was performed.

Modwerk 0.8 was announced by the maintainer on 23 November. Compatibility,
CPU admission price, current source/package integration and lifecycle on that
base remain unqualified. Global CPU readings from 0.7.13 are not a measurement
of this renderer and must not be used as its CPU price. No old base patch was
applied. Public packaging, saved-project and physical reboot checks remain open.

Host recheck on José’s Mac: four test files passed (audition monitor, current
listening lifecycle including late confirmation, console, current recovery).
These tests use simulated transport and do not access the physical unit.
`npm ci` reached the repository prepare step but failed: current main imports
missing `src/config/usb-audio.ts` from `scripts/machine-modules.mjs`. No shared
script or check was changed to bypass it. Full repository checks and pr:ready
are not claimed. GitHub device approval did not complete locally because its
network polling was blocked; native Terminal login is pending. No fork or PR
has yet been created.

## Historical records

État actuel du 22 novembre : voir la section finale, `SUBMISSION_STATUS.md` et
les preuves `evidence/current-base-*.json`. Les sections datées du 15 novembre
ci-dessous sont historiques ; elles ne qualifient pas une publication actuelle.

Contrôles du 15 novembre 2026. **Premier essai physique limité : chargement RAM sans affectation et Undo.**

José a installé la base publique `27c9d36f…` et fourni les captures du démarrage,
de la connexion et de Status (0 module). Le téléchargement SHA-256 `44cb5b…`
se reconstruit avec une section MAIN identique à la base publique locale.
Le paquet machine garde son SHA-256 `52df3143…` après vérification contre
les sites de cette base. Voir `evidence/public-base-pairing.json`. Le test
audio sur cette combinaison exacte passe ses 18 contrôles et 7 captures MAIN
(`evidence/usb-dsp-public-v032.json`). Aucune qualification matérielle du module
ou de sa persistance n’est déduite de ces essais ou des captures de la base seule.
Le premier diagnostic `device.mjs do inventory state stats` reconnaît la base
publique et un inventaire vide dans le Terminal de José, puis échoue sur la
requête de transport réservée aux bases --dev. Aucun paquet n’a été envoyé.
Le diagnostic corrigé `read_hardware.py` / `read_hardware.mjs` ne permet que
les requêtes publiques IDENTIFY (3), INVENTORY (27) et LOAD (30), comme le site.
Il n’importe pas de session d’upload et interdit tous les controlTransferOut.
Le test hôte passe pour la lecture LOAD, l’ordre CPU/DSP, le refus de toutes
les requêtes de développement et le refus des écritures. Le relevé matériel
corrigé passe dans le Terminal de José selon sa capture : identité complète
`27c9d36f…`, inventaire vide, CPU 43,4 %, DSP T1–4 50,3 % (pic 51,3 %),
DSP T5–8 41,9 % (pic 41,9 %), 81 292 ticks et 3 743 294 frames.

`trial_unused.py` prépare une étape séparée : seul le paquet SHA-256
`52df3143…`, sur la base exacte et avec inventaire/MISSING vides, peut être
soumis. Le module reste sans affectation ; après dix lectures de charge, Undo
est exécuté et doit restaurer l’identité précédente et un inventaire vide.
Aucun Keep, sauvegarde de projet ou flash n’est demandé. Une erreur de lecture
passe par le même retrait ; une erreur de retrait arrête le test sans annoncer
la restauration. Le test hôte `test_unused_trial.mjs` passe pour le chemin normal,
une lecture échouée, un Undo échoué, une mauvaise base et un paquet altéré.
**Cet essai RAM matériel passe dans le Terminal natif de José.** Le rapport
local `evidence/hardware-unused-trial.json` et sa capture confirment dix relevés
CPU de 43,3 à 43,8 %, le retour à 0 module et l’identité précédente restaurée.
Les compteurs de frames avancent. La base est `27c9d36f…`, le paquet `52df3143…`.
Aucune affectation, écoute, mesure du coût d’une voix, conservation sur CF ou
persistance après redémarrage n’a encore été qualifiée.

| Vérification | Résultat | Portée |
|---|---|---|
| Suite registre/événements | 13 tests réussis sous ASan/UBSan | Branche locale de base corrigée |
| Contre-test sur la base d’origine | Échec attendu des nouvelles assertions | La régression détecte réellement l’absence de protection |
| Chargement de projet | Signature SW/1 et 12 octets conservés | Donneur récent, charge native terminée avant contrôle |
| Conservation et restauration CF | 11 assertions, 3 processus distincts, inventaires 0 → 1 → 0 | Carte virtuelle exportée après écritures natives des fichiers SET |
| USB/base/deux DSP | 18 assertions, 7 captures MAIN | Même paquet machine V0.31, base privée corrigée |
| Préparation du projet | Ancien format refusé avant modification ; original inchangé | Images privées ; aucun sample externe requis |

La base complète bêta (USB MIDI/audio et contrôleurs) a également été reconstruite
par le script officiel : les variantes passent les scans stock-free et la comparaison
Python/navigateur. Les 11 contrôles CF passent sur cette base exacte, dont l’identité
est dans `evidence/base-beta.json` et les résultats dans `cold-restore-beta.json`.
Le premier lancement audio avec deux DSP a épuisé la limite hôte de 50 millions
d’instructions avant le chargement du module. Le banc expose désormais la cause
et utilise une limite de 150 millions : les **18 contrôles audio/USB passent**
avec 7 captures MAIN sur cette même base complète. Les trois fins attendues
silencieuses ont une crête nulle sur les dernières 100 ms. Les preuves sont dans
`usb-dsp-beta-v032.json`, `emulator-beta-v032-inputs.json` et
`main-beta-v032-captures.json`.
Ce changement ne modifie aucun octet du firmware, horloge ou garde d’admission.
Le diagnostic de publication connecté a été bloqué par la revue automatique
(service externe). Son mode SDK `MODWERK_BOARD=off`, sans requête réseau, atteint
ensuite le contrôle du manifeste : `octamod.module.json` manque dans ce brouillon.
Aucune réussite `module:doctor` ou `pr:ready` n’est revendiquée ; le catalogue
et la réservation sur le tableau communautaire restent non qualifiés.

La correction est dans la branche `fix/supersaw-absent-signature`, séparée du
module. Elle n’est ni fusionnée dans Modwerk ni publiée au catalogue. Les images
et paquets privés restent hors Git et ne font pas partie de l’archive de sources.

Le projet de test est créé dans des fichiers CF privés avant le premier démarrage.
Les processus suivants réutilisent les fichiers SET écrits par le firmware émulé.
Aucune réinstallation hôte n’est faite dans le deuxième processus ; le troisième
choisit le jeu vide plus récent et laisse le module retiré. Le retrait occupé est
refusé avec le code 7. Le test ne préserve pas la SRAM batterie entre processus,
n’exerce pas SAVE PROJECT et ne qualifie aucun cycle d’alimentation physique.

Le premier donneur O-TECH utilisait des PART plus courts que le format attendu.
Les premiers essais de cette fixture sont invalidés : les offsets récents n’y
localisaient pas les champs prévus. La préparation vérifie désormais tous les tags
PART aux offsets attendus avant toute copie modifiée. Le donneur contient zéro
entrée SAMPLE après préparation et le banc impose le retour de LOAD PROJECT à sa
file moteur, au lieu de ne vérifier que le montage et l’envoi de la commande.
Les originaux du propriétaire restent inchangés.

L’essai d’écoute interactif `trial_listen.py` est préparé pour T1 de SS_TEST.
Il conserve un unique UploadSession, lit les charges chaque seconde et ne
demande aucun Keep. FIN ou dix minutes demandent Undo. Seul un refus
confirmé code 7 permet d’attendre un retour manuel à FLEX puis de retenter ;
une réponse USB non confirmée arrête le programme sans rejouer l’écriture.
L’identité précédente et l’inventaire vide sont vérifiés après retrait.
Le parent Python laisse le client gérer Ctrl-C et la passerelle reste ouverte
pendant ce nettoyage. Les tests hôte passent : retrait normal, piste occupée,
erreur de mesure, réponse non confirmée et identité finale incorrecte.
**Premier retour physique de José :** affectation à T1 de SS_TEST, page SRC
avec les six libellés photographiée, son déclenché avec T1 + PLAY, puis STOP
qui coupe bien le son, explicitement confirmé. Le Terminal montre d’abord
41,0–41,2 % CPU, deux relevés à 55,5 %, puis 46,9–47,2 %. Les événements
START/STOP ne sont pas marqués : aucun coût incrémental précis n’est établi.
Les anciennes mesures 43,4/50,3/41,9 ne décrivent pas le même projet.
Voir `evidence/hardware-first-sound-reported.json`. Ni analyse d’enregistrement
audio, ni balayage des contrôles, ni coexistence avec sept pistes sample
n’ont été réalisés. Le retrait de cet essai d’écoute est confirmé par le rapport natif
`evidence/hardware-listen-trial.json` et la capture de José : inventaire vide,
identité précédente restaurée, aucun Keep. Les mesures sont horodatées
relativement au début de l’essai ; les notes restent sans marqueur START/STOP.

Les preuves sont dans `base-protection.json`, `base-negative-control.json`,
`cold-restore.json`, `usb-dsp-v032.json` et `fixture-layout-guard.json` sous `evidence/`.
La consommation CPU/DSP réelle et les tests de Parts/projets/scènes/mutes restent
à mesurer. Les preuves V0.31/V0.30 ci-dessous gardent leur portée historique.

---

# SuperSAW V0.31 — contrôles et limites

Contrôles du 15 novembre 2026, Mac arm64. **Aucun test sur matériel physique.**
Les résultats V0.30 conservés plus bas sont historiques ; leur blocage CPU ne
décrit pas la fixture corrigée.

| Contrôle V0.31 | Résultat observé | Limite |
|---|---|---|
| Empreintes du moteur | 12 fichiers identiques à V0.27 | Le raccordement USB est nouveau |
| Passerelle ASan/UBSan | 38 824 paquets, 320 000 échantillons stéréo | Simulation hôte |
| Oracle scalaire gelé | 212 600 appels, 1 695 200 échantillons stéréo | Régression du moteur, pas sortie complète firmware |
| Fixture ColdFire ciblée | 2 228 appels, aucun échec | Contextes fournis, pas RTOS/base/DSP |
| Paquet privé | ABI 8, START typé, relocalisations, reconstruction exacte et deux scans stricts réussis | Pas de publication ou installation physique |
| Base avec frames, sans DSP | 11 contrôles réussis avec le candidat voice-reset | Pas de preuve sonore ; candidat antérieur au callback de touche |
| Proposition SW/1 absente | Suite du registre + sélection/version/types/validation/silence réussies sous ASan/UBSan | Copie temporaire seulement, base d’essai inchangée |
| Scénario USB/base/deux DSP final | 18 contrôles réussis, 7 captures MAIN | Modèle USB en mémoire ; pas de cycle d’alimentation |

## Arrêt et livraison des touches

Les premiers essais par écriture brute dans une mailbox ne prouvent pas une
pression STOP. Les premiers essais de touche sans précontrôle n’établissent
pas non plus sa livraison à l’interface native. Ils restent classés non qualifiés.

Avec une horloge valide et PLAY/STOP vérifiés sur le transport, le paquet V0.30
et le candidat voice-reset seul laissent une note MIDI manuelle tenue sonner
après STOP lorsque le transport était déjà arrêté. Les mesures et empreintes
sont dans `evidence/stop-regression.json` : cette assertion reste en échec,
elle n’a pas été relâchée pour obtenir une réussite.

Le candidat final ajoute `module_key` pour observer la pression STOP, sans
prendre la touche à stock, en excluant FUNC+STOP. Les demandes sont transmises
par ticket au renderer. Les tests ciblés vérifient STOP, FUNC+STOP, une nouvelle
note après reset et la libération de touche qui ne coupe pas une note suivante.
Le scénario DSP complet exige une note audible, FUNC+STOP sans coupure,
MIDI-off vers le silence, redémarrage, STOP vers le silence, nouvelle note puis
nouveau relâchement. Le seuil de silence tolère au plus un LSB PCM16.

## Résultat final dans la base et les deux DSP

`evidence/usb-dsp-lifecycle.json` : 18 assertions réussies sur le paquet privé
`52df3143854f203044dde02d82a634bf2e5d5e1723c1adcd8c0e11a7afe2f476`.
Deux constructions de ce paquet sont identiques octet pour octet.
Image 35 336 octets, BSS 2 416 octets, 88 relocalisations, 38 mots de table,
15 copies vérifiées par empreintes ; aucun site stock propre au module.
Les classes UploadSession et UsbVendorTransport du SDK restent inchangées.

- Trial, Undo, réinstallation, Keep et descripteur relocalisé passent.
- Affectation T1 et refus d’une seconde SuperSAW passent, sans désactiver les gardes.
- PLAY/STOP changent le transport natif avant le test de note manuelle.
- MAIN sonne sur note MIDI, reste audible après FUNC+STOP, puis finit au silence
  après note-off. Une nouvelle note sonne ; STOP la coupe au silence.
- Une nouvelle note après STOP sonne et son relâchement finit au silence.
- Le retrait d’un module utilisé est refusé avec le code 7 ; après retour à FLEX,
  sa signature disparaît et le retrait réussit.

Les trois captures de fin (release, stopped, after-stop-release) ont une crête
nulle dans leur dernière fenêtre de 100 ms. Les autres captures sonnent sans
atteindre une extrémité PCM16. Empreintes dans `evidence/main-captures.json` ;
les WAV restent locaux et ne sont pas inclus dans l’archive.
Les entrées de construction de l’émulateur sont dans `evidence/emulator-inputs.json`.
Le changement d’horloge, l’exécution idle et le retour d’appel sont des adaptations
de l’hôte ; le firmware, ses seuils et ses compteurs n’ont pas été forcés.
La valeur CPU préaffectation de ce modèle ne mesure ni le matériel ni le coût
incrémental de SuperSAW pendant le jeu.

## Qualification qui reste à faire

- Mise en place de la protection SW/1 dans une base appropriée, puis restauration
  après redémarrage, absence du module et projet/Part de test.
- Tous les gestes STOP, les mutes, les Part/pattern/project switches, le jeu
  chromatique complet et l’enregistrement dans le nouveau raccordement.
- Locks, LFO, scènes et effets sur cette base ; comparaison MAIN à V0.27.
- Paquet compatible avec la base installable exacte, USB physique, redémarrage,
  mesure ColdFire/DSP et marge avec les sept pistes de samples.
- Récupération SysEx via le MT4 : port et câblage déclarés, transfert non effectué.

Les tests hôte ou émulateur ne remplacent aucune de ces observations physiques.
Le banc de développement ne contient aucune API de commande USB physique.

---

# Historique V0.30 — preuves et limites

Contrôles exécutés le 14 novembre 2026, Mac arm64. Résultats exacts dans
`evidence/local-checks.json`. `verify.py` est le point de reproduction.

| Contrôle | Résultat | Ce que cela prouve |
|---|---|---|
| Empreintes du moteur V0.27 | Identiques, 12 fichiers | Le moteur et ses tests de référence n’ont pas été modifiés |
| Passerelle, ASan/UBSan | 38 824 paquets, 320 000 échantillons stéréo | PCM32 et état du moteur égaux à la commande V0.27 sur les scénarios simulés |
| Oracle scalaire V0.26, ASan/UBSan | 212 600 appels, 1 695 200 échantillons stéréo | Régression du moteur optimisé contre le moteur scalaire gelé |
| Descripteur/page sur hôte | Réussi | Plages, valeurs initiales, affichage OSC, masque SRC et admission dans le menu |
| Compilation MCF54455 | 6 objets | C/assembleur acceptés, descripteur 80 octets, START 16 octets, callback typé |
| Garde SDK de génération | Réussie | Pas d’instruction détectée avec index incompatible ni piège late-combine surveillé |

Le test des paquets couvre tous les découpages 0–16, des paramètres fractionnels,
des valeurs d’enveloppe, START, relâchement, STOP et redémarrage. Il vérifie aussi
les sentinelles après les paquets et le refus sans mutation des tailles invalides,
la priorité d’un START en attente, le silence avant initialisation et après
sortie, et l’indépendance de deux états de piste. Il ne teste pas les courses
entre tâches et interruption, les destinataires réels des événements ou les
écritures MMIO du raccordement cible.

## Fixture ColdFire native

`verify_native.py` : 2 211 appels sans échec. Le module est lié à une adresse
privée de la mémoire de l’émulateur, et les registres/contexte sont fournis par
le test. Le firmware officiel fournit les continuations MIDI et clavier ;
aucune donnée du firmware n’est incluse dans ces sources.

- Les signatures SW/1 des huit pistes sont reconnues, une piste sample voisine
  ne l’est pas ; le prédicat chromatique utilise la piste de l’événement même
  lorsque la piste sélectionnée au panneau est différente.
- MIDI 84 écrit TUNE 64, la note tenue et le bit gate via la continuation native.
- Un MIDI-off d’une ancienne note ne coupe pas la voix courante ; celui de la
  note courante garde les écritures natives de mailbox/gate et finit au zéro PCM32.
- Même contrôle pour les touches chromatiques anciennes/courantes, avec les
  branches natives d’acceptation ou de refus.
- Rendu audible à la source, en-têtes/curseur, paramètres intacts, maintien DSP
  de l’enveloppe et tous les points de découpage de 0 à 16.
- Transition lecture/STOP : source coupée. Appel direct du callback tail-kill
  lorsque le transport est déjà arrêté : source coupée.
- Conservation des registres C appelés et de la pile aux points mesurés.

L’ordre et la livraison des événements de notes par la base ne sont pas exercés.
Pas de démarrage RTOS, de notif d’enregistrement MIDI, de sortie DSP MAIN,
de contact USB, de capture LCD ou de mesure de temps matériel.
Les adresses et archives d’émulateur sont identifiées par leurs empreintes
dans `evidence/native-checks.json`. Le compteur d’appels n’est pas une mesure CPU.

La demande de relâchement est maintenant différée vers le moteur audio. Le
test hôte vérifie qu’elle ne modifie pas immédiatement le moteur et qu’un numéro
de génération périmé ne coupe pas la nouvelle note. Les interruptions aux
différents points du handler natif complet restent à tester.

## Non exécuté

- Affectation et rendu du prototype chargé dans la base Modwerk complète.
- Test des paquets à travers le DSP et comparaison de MAIN avec la V0.27.
- Distribution complète des événements MIDI/clavier, STOP global dans tous
  les états, commande DSP de redémarrage et coexistence avec les mutes.
- Affichage LCD, param locks/LFO/scènes sur la nouvelle base.
- Save/load, changement de Part, coexistence et protection si module absent.
- Cycle physique USB, remplacement, retrait d’un module utilisé et redémarrage.
- `module:doctor` : pas encore de manifeste de module installable.
- Tout test sur un Octatrack physique, mesure DTCN3, pourcentage CPU ou marge DSP.

Les tests de l’ancienne V0.27 ne qualifient pas ce nouveau raccordement USB.
Les compteurs d’appels et d’instructions ne sont pas des cycles matériels.

## Préparation de la base

Base privée reconstruite depuis le SDK épinglé et Elekloader
`3b31ef3c0e43c810e3acd0be6257e2484b20fc40` avec le conteneur OS 1.40C original
fourni localement. Les gardes du firmware, les contrôles de chevauchement, la
liaison et la relecture du conteneur passent. Aucun conteneur n’est distribué.

L’émulateur adapté du SDK démarre cette base jusqu’au contrôle RTOS M6a :
10 tâches créées, 190 dispatches, 11 contextes exécutés, aucune interruption audio.
Pas de carte/projet chargé, aucun module SuperSAW installé, aucun contact USB
ou matériel. Le profil privé n’est pas une preuve d’identité avec la base publique.
Les empreintes et limites sont dans `evidence/base-preparation.json`.

## Paquet et modèle USB dans la base — V0.30

Paquet privé ABI 8 : image 35 152 octets, BSS 2 384 octets, 85 relocalisations,
7 contributions/abonnements répartis dans 38 mots, aucun correctif de site stock.
Les 14 copies par empreintes reconstruisent exactement l’image compilée.
Deux scans stock-free inchangés et la vérification SDK du START typé passent.
Deux constructions finales donnent le même paquet octet pour octet.

Le premier test par socket est bloqué par l’environnement (`bind` refusé).
Le banc local par processus utilise ensuite les mêmes modèles RTOS, USB et
CompactFlash, avec les transferts EP0 pilotés par les classes SDK d’origine.
Aucune API USB physique n’est appelée, aucune protection du firmware n’est modifiée.

Le sous-ensemble `loader-only` passe : base vide, admission du Trial, Undo,
réinstallation/Keep, descripteur SW/1 relocalisé dans la table machines, retrait
du module inutilisé. La carte reste un objet en mémoire ; pas de redémarrage.
Voir `evidence/usb-loader.json` et `evidence/package-checks.json`.

Le scénario `full` **échoue encore à l’affectation T1**. Le prédicat du module
admet la piste, mais `mw_assign` refuse : CPU affiché 1000/1000, seuil 850/1000,
allocation de base 45 %. La fixture n’active pas l’interruption audio.
Ce refus est conservé dans `evidence/integration-blocked.json` ; le test
complet n’est pas transformé en réussite. Aucun seuil ni compteur n’est forcé.
Cela ne prouve ni une saturation réelle ni une marge CPU sur l’Octatrack.

Le chargement a révélé une autre erreur, corrigée : la banque native est à
0x400e21e0 dans cette base, alors que le prédicat V0.29 n’acceptait que la zone
à partir de 0x46000000. Le prédicat utilise maintenant les bornes du SDK ; la
fixture ColdFire teste les deux zones et le refus d’une borne invalide.

## Incident lors de la session de contrôles suivante

José valide DETN et WIDE à l’écoute. MIX présente une remontée progressive
de volume perçu de 18 à 0, sans saut signalé ; aucune mesure RMS ne qualifie
encore cette courbe. La fin d’une session ultérieure répond `needs-recovery`
à rollback. Le lanceur s’arrête correctement sans annoncer Undo, mais il ne
traitait pas cette réponse transitoire comme le client officiel. FIN saisi
après retour au shell est seulement une commande inconnue.

Les premiers retraits réussis restent valides ; celui de cette session est
**non confirmé**. Aucun nouveau trial n’est prévu avant récupération.
`recover_trial.py` reprend seulement la transaction existante sur la base
exacte, après retour manuel à FLEX, et suit adopt/cancel/rollback/leave du SDK.
Les reprises ne concernent que des refus explicitement confirmés unsafe ou
needs-recovery et sont bornées à 3 s comme l’ancien client CLI ; aucune
écriture dont la réponse est inconnue n’est rejouée. Inventaire vide, mode
normal et identité connue sont requis. Tests hôte réussis : récupération,
base déjà normale, refus transitoire, réponse inconnue, limite des reprises
et inventaire résiduel. Ce chemin de récupération restait alors à exécuter sur matériel.

Le contrôle de récupération natif de José confirme ensuite une identité connue,
un inventaire vide et le mode normal, **déjà présents avant la commande**.
La commande n’a donc pas eu de transaction résiduelle à annuler. Preuve :
`evidence/hardware-recovery-check.json`. Le lanceur d’écoute traite désormais
les refus confirmés unsafe/needs-recovery avec reprises bornées à 3 s ; le
refus occupé 7 attend le retour à FLEX, et une réponse inconnue arrête toujours
le processus. Les tests hôte étendus passent, y compris needs-recovery avec
piste occupée et refus permanent. Avertissements ajoutés à 8 et 9 minutes
avant la demande de fin à 10 minutes. Cette correction hôte ne modifie pas
le paquet sonore ; son nouveau chemin de reprise reste à vérifier sur matériel.


## Console opérateur et deuxième refus de retrait

Un deuxième retrait a épuisé les reprises de 3 s puis répondu needs-recovery.
Le contrôle natif suivant confirme à nouveau le mode normal, l’identité de
base connue et zéro module, déjà présents avant la commande de récupération.
Cela ne prouve pas que le script de récupération a réparé la transaction.
La cause du refus initial reste indéterminée.

La console ne fait plus défiler les mesures périodiques : elle les conserve
chaque seconde et affiche le dernier relevé sur CPU ou C. FIN ou Q demande la
fin ; casse mixte et préfixe de prompt collé sont acceptés. Les avertissements
préservent le texte en cours de saisie. Les commandes invalides reçoivent un
retour explicite. Tests hôte réussis et essai PTY de saisie partielle réussi.

Le budget de reprise du lanceur d’écoute passe à 10 s, conformément au minimum
de setBudget utilisé par OctatrackLink dans le site. Le lanceur CLI ancien
utilise 3 s. Seuls les refus explicitement acquittés sont rejoués ; une réponse
de transport inconnue arrête toujours la tentative. Aucune protection de la
base ni aucun octet du paquet sonore ne change. Les échecs produisent désormais
un rapport JSON avec état, relevés et dernier refus disponibles.

Ces modifications passent les tests hôte ; elles ne sont pas encore validées
sur l’Octatrack. Prochain contrôle : un essai RAM bref consacré au retrait,
avant de reprendre les essais sonores longs. Ne jamais relancer si le retrait
ou la récupération n’a pas confirmé l’identité connue et l’inventaire vide.


## Essais musicaux du 16 novembre 2026

Voir `JOURNAL.md` et `evidence/hardware-sequence-controls-20261116.json` :
écoutes opérateur des contrôles, AMP, séquenceur, P-locks et LFO ; relevés
natifs et Undo final confirmé. Qualification limitée à une piste en RAM,
sans Keep, reboot ou coexistence avec les autres pistes.


## Coexistence huit pistes — 17 novembre 2026

Voir `evidence/hardware-eight-tracks-20261117.json` et `JOURNAL.md`.
Une SuperSAW, quatre FLEX, trois STATIC (samples courts), delay T5 : José
rapporte une lecture sans anomalie ; Undo final confirmé. Pic global natif
82,6 %, marge CPU limitée ; aucun benchmark isolé ni qualification Keep/reboot.

## 22 novembre 2026 — base publique 0.7.13

Paquet inchangé SHA-256 `52df3143854f203044dde02d82a634bf2e5d5e1723c1adcd8c0e11a7afe2f476`.
Base exacte `6d23e888c47ab959762044c4facaa0b2b55fed85527284f38f3cea4d80beb58a`.

| Contrôle | Résultat et portée | Preuve |
|---|---|---|
| Moteur et contrats | Empreintes gelées, passerelle, PCM/état et six objets ColdFire vérifiés localement | local-checks.json |
| Contrats avec la base | Audit statique, 15 copies sans chevauchement ; ne remplace pas les essais | current-base-static-audit.json |
| Répétition RAM | Émulateur, profils frame-only et deux DSP ; Trial/Undo sans affectation réussi | current-base-ram-rehearsal.json |
| RAM sans affectation | Matériel : dix relevés, Undo et identité précédente confirmés, inventaire vide ; boutons manipulés par José | current-base-hardware-unused.json |
| Écoute T1 | Son, séquence, P-locks, filtre, delay et T2–T4 FLEX ; aucun clic/saturation selon José | current-base-listening-user-report.json |
| Fin temporisée | Échec `needs-recovery` à dix minutes, état recovery et identité inconnue à la sortie | current-base-hardware-listen-interrupted.json |
| Vérification ultérieure | Déjà normal, identité connue, inventaire vide ; pas de nouvelle annulation nécessaire | current-base-hardware-recovery.json |
| Coût propre, Keep, SAVE PROJECT, reboot | Non qualifiés sur cette base ; pas d’installation durable autorisée par ce bilan | SUBMISSION_STATUS.md |

Tous les chemins de preuve sont relatifs à `evidence/`. Les 600 mesures de
l’écoute donnent CPU global 33,6–57,1 %, DSP 1–4 32,7–38,2 % et DSP 5–8
constant à 41,9 %. Les événements musicaux ne sont pas horodatés dans ce
journal : aucune attribution précise du pic ou mesure comparative du moteur.

Le diagnostic de publication reste en échec. La préparation de la fiche et
du texte de revue n’ajoute aucune approbation communautaire ou matérielle.

### Nouveau parcours de fin à confirmation manuelle

`test_audition_monitor.mjs` vérifie que durée/CPU/Ctrl-C demandent STOP et FLEX
sans terminer la boucle, qu’un Q tardif l’autorise, qu’EOF est distingué d’une
confirmation, et que la mémoire des mesures reste bornée. Le test intégré
dans `test_current_listen_trial.mjs` fait passer le seuil de trente secondes,
constate zéro rollback avant la confirmation simulée, puis confirme un unique
Undo avec identité précédente et inventaire vide. Les tests des anciens
lanceurs et de la console passent. Essai physique du nouveau parcours :
**non effectué à cette étape**, deux retours consécutifs à recueillir.

Premier contrôle matériel `manual-confirm-v1` en mode trente secondes réussi :
avertissement, attente du Q de José, puis Undo confirmé, identité précédente
restaurée et zéro module ; aucun Keep. Preuve native :
`evidence/manual-confirm-v1-hardware-end-check-1.json`. Le journal ne marque
pas les gestes physiques ni ne prouve une lecture sonore pendant ce contrôle.
Un second passage consécutif reste à recueillir avant de conclure sur cette
répétition ; la cause interne du refus antérieur demeure non établie.

## Deux fins manuelles consécutives confirmées sur matériel

Les deux contrôles `manual-confirm-v1` en mode trente secondes ont attendu le
Q de José puis confirmé Undo, identité précédente restaurée et zéro module ;
aucun Keep. Preuves natives : `evidence/manual-confirm-v1-hardware-end-check-1.json`
et `evidence/manual-confirm-v1-hardware-end-check-2.json`. Cette répétition
confirme le parcours de fin manuelle sur cette base et ce paquet. Elle ne
qualifie pas le maintien dix minutes du nouveau client, la fermeture forcée,
les sauvegardes/reboots, ni la cause interne de l'ancien `needs-recovery`.
