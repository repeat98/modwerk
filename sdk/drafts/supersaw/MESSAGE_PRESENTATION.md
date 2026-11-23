# Présentation courte pour relecture

Texte préparé pour José, non envoyé à Modwerk. Le dossier technique détaillé
reste dans `REVIEW_REQUEST.md` et `TESTING.md`.

## Version française

Bonjour à l’équipe Modwerk,

Je souhaite vous présenter **SuperSAW-OT**, mon projet de machine de synthèse
monophonique pour l’Octatrack MKII, développé avec une assistance IA au codage
et testé sur mon instrument.

Le moteur associe de un à sept oscillateurs à dents de scie, avec six paramètres
SRC : **TUNE, DETN, MIX, OSC, WIDE et LEVL**. L’idée est d’offrir une source
simple à jouer, des basses aux textures plus épaisses, en profitant du
séquenceur, de l’AMP, des P-locks, des LFO et des effets de piste de l’Octatrack.

Les essais RAM sur la base Modwerk 0.7.13 ont donné des résultats positifs à
l’écoute : séquence avec P-locks, filtre, delay et plusieurs pistes de samples,
sans clic ni saturation signalés. Après une révision du script de fin d’essai,
deux contrôles courts consécutifs ont confirmé le retrait du module, le retour
à l’identité précédente et un inventaire vide.

Je souhaite maintenant solliciter une **revue technique**, pour préparer son
intégration dans Modwerk. Le dossier décrit les sources et leurs licences,
les essais réalisés et ce qui reste à qualifier : paquet public, coût propre
au moteur, sauvegardes et redémarrages. Le refus de retrait rencontré avec
l’ancien script est également documenté.

Le dépôt public du projet est : https://github.com/jokobol/SuperSAW-OT
Le dossier de contribution actualisé est encore local ; le dépôt public ne
constitue donc pas encore la version exacte de cette demande de revue.

Merci pour vos retours et vos conseils !

José Aleixo — jokobol

## English version

Hi Modwerk team,

I’d like to introduce **SuperSAW-OT**, my monophonic synth track-machine project
for the Octatrack MKII, developed with AI coding assistance and tested on my
own instrument.

It combines one to seven saw oscillators with six SRC controls: **TUNE, DETN,
MIX, OSC, WIDE and LEVL**. The aim is a playable source ranging from simple
bass tones to thicker textures, using the Octatrack’s sequencer, AMP,
parameter locks, LFOs and track effects.

RAM listening tests on Modwerk base 0.7.13 were positive: a sequence with
parameter locks, filter, delay and additional sample tracks, with no clicks or
saturation reported. After revising the trial-exit script, two consecutive
short checks confirmed module removal, the previous identity and an empty
inventory.

I’d welcome a **technical review** to prepare its integration into Modwerk.
The dossier covers source attribution, licences, observed tests and the open
work: public packaging, isolated renderer cost, saved projects and reboot
qualification. A rollback refusal with the earlier host script is also recorded.

The public project repository is https://github.com/jokobol/SuperSAW-OT .
The updated contribution dossier is still local; that public repository is
not yet the exact source snapshot for this review request.

Thanks for your feedback and guidance!

José Aleixo — jokobol
