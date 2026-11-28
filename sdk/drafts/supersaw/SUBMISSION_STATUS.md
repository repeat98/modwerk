# SuperSAW-OT — préparation à la revue, 22 novembre 2026

Objectif convenu : soumettre la version monophonique déjà écoutée, sans ajouter
le sub ni les accords. Aucune modification du moteur sonore, aucun paquet envoyé à la machine physique,
aucun Keep ni flash par cette préparation.

## État matériel rapporté

Le diagnostic en lecture seule exécuté par José montre la base
`6d23e888c47ab959762044c4facaa0b2b55fed85527284f38f3cea4d80beb58a`,
annoncée 0.7.13 par le site, ABI maximum 10, fonctions 3975, 128 sites et copies.
À cet instant Syntiz figurait encore dans l'inventaire (`970f03ad`), avec aucun
module manquant et CPU global 33,9 %. José a ensuite confirmé son retrait via
la synchronisation du jeu vide. Un nouvel inventaire natif reste à recueillir.
Projet séparé : SUPER SAW TEST, sans Algo70 selon José.

## Ce qui passe localement

Dans le checkout de préparation `ad600202ed3c5f9866f71d38375891c4c680abec`
(main récupéré le 22 novembre), `verify.py` confirme les empreintes du moteur
gelé, 38 824 paquets de passerelle, l'équivalence PCM/état sur 212 600 appels
et 1 695 200 échantillons stéréo, puis la compilation de six objets MCF54455
et les contrats d'événements épinglés. Ces tests ne chargent pas un paquet
dans la nouvelle base et ne qualifient pas son temps d'interruption.

Le nouveau manifeste décrit explicitement un brouillon dont la construction
publique est en attente dans ses limites et son résumé. `manifest.py` est une déclaration USB ; il ne compose
pas une image CF contenant le moteur. Aucun catalogue public n'est modifié.

## Points bloquant une publication ou un essai de persistance

1. Le main récupéré contient dans son artefact de base l'identité exacte
   annoncée par la machine. L'audit statique du paquet historique ne trouve
   aucun changement d'index/type/site des abonnements ni chevauchement de ses
   15 copies avec les sites de cette base. ABI 10 est un maximum : le format
   ABI 8 de notre paquet peut être accepté. Cela ne constitue pas un essai
   d'installation dans cette base. Voir `evidence/current-base-static-audit.json`.
2. La table `known[]` de `machine_registry.c` sur ce main reconnaît AB, FM,
   WV et FR, pas SW/1. Le commentaire explique que la validation des Parts
   restaurées au démarrage précède la restauration des modules. La carte des
   machines manquantes n'est pas à elle seule une preuve de protection de
   cette validation. La proposition historique SW/1 est séparée ; ne pas
   présenter une correction locale comme intégrée au firmware de José.
3. Intégrer le paquet par les recettes officielles, contrôler ses abonnements,
   ses copies protégées et la cohabitation avec la base et les autres modules.
4. Mesurer le prix propre au renderer et le repos sur la base actuelle. Les
   maxima globaux historiques 73,3 % et 82,6 % ne sont pas ce prix.
5. Qualifier les opérations requises de Part/projet, Keep, chargement et
   redémarrage physique sur un paquet identifié, puis l'absence/retrait.
6. Finaliser captures d'interface, provenance, réservations/revue communautaire
   et contrôles `module:doctor`/`pr:ready`. Le schéma du manifeste passe. Le
   diagnostic expérimental, tableau communautaire désactivé, accepte ses
   lignes expérimentales, mais ne prouve pas que le chemin de construction
   officiel produit ce moteur (la recette publique reste à intégrer).
   Le contrôle de publication reste en échec ; résultat brut conservé dans
   `evidence/submission-doctor-20261122.txt`. Aucun succès global n'est annoncé.

Le dossier est une préparation locale à la revue, pas une version publiable.
Ne pas lancer les anciens scripts d'essai sur une nouvelle base en remplaçant
simplement leur identité attendue. Ils conservent leurs gardes d'origine.

## Essai RAM préparé sur 0.7.13

Le lanceur séparé `trial_current_base.py` emploie le paquet historique inchangé
(SHA-256 `52df3143854f203044dde02d82a634bf2e5d5e1723c1adcd8c0e11a7afe2f476`).
Il exige la base publique exacte ci-dessus, ABI maximum 10, un inventaire vide,
aucune référence manquante et un relevé CPU sous 85 %. Il ne sélectionne aucune
machine sur les pistes. Après dix secondes, il effectue Undo et vérifie le mode
normal, l'identité précédente et zéro module. Il n'appelle jamais Keep.

La répétition utilise l'image reconstruite depuis le paquet public et l'OS
original local : SHA-256 du BIN reconstruit
`261ced971a82f27e4d698769c1df2361b359068f5831ed8168bb937796cb1715`.
Les résultats sont dans `evidence/current-base-ram-rehearsal.json`. Les compteurs
et charges d'un émulateur ne mesurent ni les performances physiques ni le son.
José a exécuté ce contrôle sur sa machine : dix relevés, chargement et Undo
confirmés, zéro module et identité précédente restaurée. Le résultat natif est
dans `evidence/current-base-hardware-unused.json`. Cela ne qualifie pas encore
une écoute, la persistance ou une publication.

Tests du lanceur : refus d'une base/ABI/empreinte différente, d'un inventaire
non vide, de références manquantes ou d'un CPU au seuil ; annulation d'un
transfert interrompu ; nettoyage après échec de lecture ; refus d'annoncer Undo
si le retrait échoue ou si l'identité restaurée diffère. Les tests des anciens
lanceurs et de l'inspection en lecture seule passent également.

José précise avoir manipulé des boutons pendant le contrôle RAM du 22 novembre.
L'Undo est confirmé par le résultat natif ; ces charges ne sont donc pas une
mesure de référence immobile ou du coût propre du module.

Le lanceur d'écoute séparé `trial_current_listen.py` conserve le paquet et les
contrôles de l'essai précédent. Il exige aussi la réussite du contrôle matériel
sans affectation sur cette base exacte, vérifie ABI 10 et inventaire vide, puis
ouvre l'écoute manuelle sur T1 uniquement. CPU/C affiche les mesures ; FIN/Q
demande la fin. STOP puis T1 sur FLEX précèdent Undo. Demande de fin à dix minutes
ou à 85 % de CPU global, puis confirmation manuelle ; aucun Keep ni flash. Le parcours d'écoute sur la base actuelle est rapporté ci-dessous, avec une
fin interrompue dont le retrait reste à confirmer.

## Écoute rapportée et fin interrompue, 22 novembre

José confirme le son sur T1, les notes aux pas 1/4/7/9/12/15, P-locks TUNE/DETN/
WIDE, filtre FX1 et delay FX2 (BASE/FB/WDTH/SEND au pas 9), et des samples FLEX
sur T2/T3/T4. Aucun clic ni saturation rapporté ; plusieurs réglages OSC appréciés.
Le relevé natif contient 600 mesures : CPU global 33,6–57,1 %, DSP 1–4 32,7–38,2 %, DSP 5–8 constant à 41,9 %. Le maximum affiché dans sa capture est 48,9 %,
qui n'est pas le maximum de la session enregistrée. Les scènes et la base
diffèrent des tests historiques : aucune optimisation propre au moteur n'est prouvée.

À dix minutes, la fin a été demandée et rollback a échoué (`needs-recovery`,
phase recovery, identité active inconnue, aucun refus explicite de Part=7
dans le diagnostic). L'absence de STOP/retour FLEX au moment de la demande
est rapportée ; elle ne prouve pas à elle seule la cause interne de cet échec.
Le retrait reste non confirmé. Le lanceur `recover_current_trial.py` reprend
le contrôle de récupération existant, épinglé à la base actuelle et ABI 10 ;
il n'envoie aucun paquet, n'appelle ni stage, activate, ni Keep. À lancer
uniquement après STOP sur la machine et retour de T1 à FLEX.

## Vérification après la fin interrompue

Le rapport natif `evidence/current-base-hardware-recovery.json` confirme ensuite
mode normal, identité active connue et inventaire vide. L'état initial était
déjà normal : le contrôle n'a pas exécuté de nouvelle annulation. Cela confirme
l'état final sans démontrer la cause ni l'instant exact du retour à la normale.
Le retrait temporisé de la session d'écoute reste enregistré comme échec non
confirmé au moment de sa sortie ; la vérification ultérieure ne l'efface pas.
L'écoute est positive selon José, mais ce défaut de fin de session reste à
traiter avant la qualification pour publication.

## Dossier préparé pendant la pause

`PRESENTATION_FR.md`, `SUBMISSION_PLAN_FR.md`, `REVIEW_REQUEST.md` et la
miniature originale `presentation/thumbnail.svg` sont prêts pour relecture.
Le manifeste, la provenance et TESTING distinguent désormais les essais sur
0.7.13, l'échec du retrait temporisé et la vérification ultérieure. L'analyse
`SESSION_END_REVIEW.md` identifie l'appel automatique de rollback à dix minutes ;
elle n'établit pas la cause interne de `needs-recovery` et ne prétend pas la corriger.
Aucun changement du moteur, du firmware ou de la minuterie ; aucune action
sur l'instrument ; aucune démarche ou publication externe durant cette préparation.

## Parcours de fin corrigé, essai matériel à effectuer

Le client actuel utilise `manual-confirm-v1` : avertissement de durée puis
attente de Q/FIN après STOP, T1 sur FLEX et ouverture d’AMP. Le mode
`trial_current_listen.py --end-check` permet d’exercer ce parcours en trente
secondes. Tests hôte de coordination et intégration réussis ; le paquet et
les empreintes du moteur sont inchangés. Vérification physique à obtenir
sur deux fins manuelles consécutives avant de parler de reproductibilité.
Ce changement ne résout pas à lui seul la cause interne de `needs-recovery`.

## Deux fins manuelles consécutives confirmées sur matériel

Les deux contrôles `manual-confirm-v1` en mode trente secondes ont attendu le
Q de José puis confirmé Undo, identité précédente restaurée et zéro module ;
aucun Keep. Preuves natives : `evidence/manual-confirm-v1-hardware-end-check-1.json`
et `evidence/manual-confirm-v1-hardware-end-check-2.json`. Cette répétition
confirme le parcours de fin manuelle sur cette base et ce paquet. Elle ne
qualifie pas le maintien dix minutes du nouveau client, la fermeture forcée,
les sauvegardes/reboots, ni la cause interne de l'ancien `needs-recovery`.

## Préparation de la relecture et du brouillon GitHub

`MESSAGE_PRESENTATION.md` contient un message court en français et en anglais.
`PR_DRAFT.md` reprend le modèle de contribution avec identité du paquet testé,
portée matérielle, tableau des cas limites et contrôles restant en échec. Les
attestations de l’auteur et les cases de publication restent décochées.
Le dépôt public de José a été identifié et le tableau consulté sans écriture ;
voir `evidence/submission-readiness-20261122.json`. Aucun envoi n’a eu lieu.
