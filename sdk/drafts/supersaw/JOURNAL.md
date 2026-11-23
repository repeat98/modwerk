# Journal de SuperSAW-OT

## Session du 15 au 16 novembre 2026 — premiers essais matériels

Projet de José (jokobol), Octatrack MKII, projet de test SS_TEST.
Essais privés en RAM, une seule piste SuperSAW, sans Keep ni sauvegarde
pendant les essais. Base Modwerk publique `27c9d36f…` ; paquet exact
`52df3143854f203044dde02d82a634bf2e5d5e1723c1adcd8c0e11a7afe2f476`.
Le moteur sonore reste inchangé ; la version de dossier est V0.32 source draft.
Les sauvegardes CF et Mac ont été confirmées par José avant installation.

### Résultats d’écoute rapportés par José

| Fonction | Observation |
| --- | --- |
| Déclenchement / STOP | Son déclenché sur T1 ; STOP arrête le son. |
| DETN | Effet souhaité clairement obtenu. |
| MIX | Variation progressive ; légère remontée de volume perçu entre 18 et 0, à mesurer. |
| WIDE | Variation de largeur stéréo nettement perçue. |
| OSC | Changements d’épaisseur par pas, acceptés pour le choix du timbre ; plage affichée exacte encore à confirmer. |
| LEVL | Variation douce, sans clic ni saturation ; aucun son perceptible à 0 via MOTU 828. |
| TUNE | Hauteur réactive et résultat apprécié, y compris dans le grave ; justesse non mesurée. |
| Séquenceur | Quatre trigs, notes courtes réglées avec AMP HOLD/REL ; répétitions régulières et relâchement doux. |
| P-locks / LFO | Modulations essayées, notamment DETN/WIDE ; aucun clic signalé. |

Ces observations sont des écoutes utilisateur, sans enregistrement audio analysé.

### Relevés et retrait

La dernière session comporte 503 relevés sur environ 8 min 23 s. Les relevés
présentés pendant la séquence montrent 59,7 à 60,5 % CPU ; le maximum de tout
le journal est 66,1 %. DSP affichés alors : pistes 1–4 à 38,5 %, pistes 5–8
à 41,9 %. Les relevés n’ont pas de marqueurs d’action : aucun pic n’est
attribué à un geste précis. Ce sont les charges globales de l’instrument,
pas le coût isolé de SuperSAW ni une qualification de huit pistes simultanées.

Fin de session : STOP, T1 remis sur FLEX, Q dans le Terminal. Le journal
confirme Undo, zéro module conservé et libération USB. Voir
`evidence/hardware-sequence-controls-20261116.json`.

### Incidents et corrections du lanceur

Deux sessions antérieures ont refusé le retrait (`needs-recovery`). Les
contrôles ultérieurs ont trouvé la base déjà normale et l’inventaire vide ;
on n’attribue donc pas leur restauration au script de récupération.
La cause de ces refus reste ouverte. La saisie FIN était brouillée visuellement
par les relevés CPU : désormais les mesures restent enregistrées sans défiler,
CPU/C affiche le dernier relevé, FIN/Q demande la fin et les avertissements
préservent la saisie. Les refus explicitement acquittés peuvent être repris
pendant 10 s, conformément au minimum du site ; une réponse de transport
inconnue arrête toujours le processus. Aucun garde-fou invité n’a été modifié.

La console et le retrait ont réussi au cours des essais suivants, dont la
session séquencée ; cela ne démontre pas la disparition de tous les cas de refus.

### Reprise prévue

José termine les essais pour cette nuit. Prochain scénario : SuperSAW sur T1
avec samples sur d’autres pistes, en augmentant progressivement la charge.
Restent à qualifier : coexistence avec les sept pistes de samples, notes MIDI
et jeu chromatique, justesse, niveaux mesurés, Keep et redémarrage, installation
publique et revue Modwerk. Aucun module n’a été soumis au catalogue ou publié
par cette mise à jour. Aucune nouvelle installation n’est nécessaire ce soir.

## 16 novembre 2026 — SuperSAW et quatre pistes FLEX

José confirme T1 SuperSAW, T2–T5 samples FLEX, T6–T8 sans samples. Les cinq
pistes jouent simultanément, sans clic ni coupure à son écoute. La capture
montre 72,5, 72,6 et 73,2 % CPU pendant la lecture, DSP T1–T4 à 38,4–40,3 %
et T5–T8 à 43,7 %. Le journal automatique comporte 547 relevés sur environ
9 min 7 s, avec un maximum global de 73,3 % CPU. Les actions ne sont pas
horodatées : ce maximum ne permet pas d’isoler la consommation de SuperSAW.

Après STOP, retour de T1 à FLEX et Q, Undo est confirmé : identité précédente
restaurée et zéro module conservé. USB libéré. Aucun Keep. Paquet sonore
inchangé. Preuve : `evidence/hardware-flex-coexistence-20261116.json`.

Prochain scénario : ajouter progressivement T6–T8 pour tester SuperSAW avec
sept pistes de samples. Coexistence STATIC et persistance restent à qualifier.

## 17 novembre 2026 — huit pistes, FLEX et STATIC

T1 SuperSAW avec la même séquence et P-locks ; T2–T5 FLEX ; T6–T8 STATIC.
Tous les samples sont courts, avec un delay sur T5 (voix courte). José active
progressivement les pistes et confirme les huit pistes en lecture, sans clic,
coupure ou autre anomalie audible. Il a choisi des percussions distinctes pour
faciliter l’écoute des différentes pistes.

Capture opérateur : 47,5 % CPU arrêté avant l’essai, 82 % avec T1 séquencée,
81,7–82,2 % lors des activations successives, 81,9 % avec les huit pistes,
puis 51,8 % arrêté. DSP en lecture : T1–T4 38,4–40,3 %, T5–T8 48–49,3 %.
Le journal natif comporte 518 relevés sur environ 8 min 38 s ; son maximum
CPU global est 82,6 %. Pas de marqueurs d’action précis dans les relevés.

La faible variation lors des activations ne démontre pas un coût nul des
pistes : des pistes muettes peuvent encore traiter. Ce n’est pas un benchmark
isolé de SuperSAW. La marge CPU par rapport au seuil de précaution de 85 %
est limitée ; cette réussite ne qualifie pas tous les projets à huit pistes.

Fin : STOP, T1 sur FLEX, Q. Undo confirmé dans le journal et la capture :
identité précédente restaurée, zéro module conservé, USB libéré. Aucun Keep.
Preuve : `evidence/hardware-eight-tracks-20261117.json`.

Restent à qualifier : lecture STATIC de fichiers longs, notes MIDI et jeu
chromatique, charge comparative à réglages identiques, Keep et redémarrage,
coexistence avec d’autres modules et revue avant publication.
