# SuperSAW-OT

**Une machine de synthèse monophonique pour l’Octatrack MKII, développée par
José Aleixo avec une assistance IA au développement.**

SuperSAW-OT transforme une piste audio en source de synthèse à dents de scie.
De un à sept oscillateurs peuvent être associés, désaccordés et répartis dans
l’espace stéréo. On passe ainsi d’un son simple et direct à une texture plus
épaisse, pour des basses, des leads et des motifs séquencés.

Le projet cherche à conserver le jeu propre à l’Octatrack : enveloppe AMP,
séquenceur, P-locks, LFO et effets de piste. Le moteur sonore de référence est
resté inchangé pendant les derniers essais.

## Les six paramètres SRC

| Paramètre | Fonction |
|---|---|
| TUNE | Hauteur du son |
| DETN | Désaccordage entre les oscillateurs |
| MIX | Équilibre entre l’oscillateur central et les oscillateurs désaccordés |
| OSC | Nombre d’oscillateurs, de 1 à 7 |
| WIDE | Répartition stéréo |
| LEVL | Niveau de sortie de la source |

OSC modifie l’épaisseur et la combinaison des oscillateurs. Il ne sélectionne
pas d’autres formes d’ondes et n’ajoute pas de notes indépendantes. Cette
version reste monophonique, avec une instance de SuperSAW par Part. Le sub
et les accords sont reportés pour privilégier la validation de cette version.

## Ce qui a été entendu sur la machine

Lors des essais du 22 novembre 2026 sur la base Modwerk 0.7.13, José confirme
le son sur T1, une séquence avec P-locks sur TUNE, DETN et WIDE, un filtre en
FX1 et un delay en FX2, eux aussi modulés par pas. Des samples FLEX courts
jouaient sur T2, T3 et T4. Aucun clic ni saturation n’a été signalé dans cette
écoute. Les essais antérieurs avaient également donné des retours positifs
sur les LFO, l’AMP, STOP et la cohabitation avec davantage de pistes de samples.

Le journal de la session actuelle contient un maximum de **57,1 % de CPU global**.
La capture des lectures demandées affichait jusqu’à 48,9 %. Ces chiffres
concernent tout l’Octatrack dans ce projet : ils ne mesurent pas SuperSAW seul
et ne promettent pas la même charge dans une autre configuration.

## État du projet

**Prototype fonctionnel essayé en RAM sur un Octatrack MKII ; non publié dans
la bibliothèque Modwerk et non encore approuvé pour une installation durable.**

Le chargement et l’Undo sans affectation à une piste passent sur la base
actuelle. Pendant l’écoute, la tentative de retrait à la limite de dix minutes
n’a pas été confirmée. Une vérification ultérieure a trouvé la machine déjà
en mode normal, avec une identité connue et zéro module. Le script demande désormais une confirmation manuelle avant le retrait ;
deux contrôles courts consécutifs ont ensuite confirmé Undo et zéro module.
La cause interne du refus précédent reste à établir.

Restent notamment l’intégration du paquet dans la chaîne publique Modwerk,
la mesure propre au moteur, les contrôles de publication et la qualification
des sauvegardes et redémarrages. Aucun téléchargement public n’est annoncé.

## Crédits et ressources

Projet et essais musicaux : **José Aleixo / jokobol**, avec assistance IA au
codage. Les sources conservent les crédits et licences des composants utilisés,
notamment Tim Hastie et Sam Banks ; leur provenance est détaillée dans le dépôt.

Cette fiche est préparée pour présentation et revue. Elle ne constitue ni une
approbation de Modwerk ni un guide d’installation publique.
