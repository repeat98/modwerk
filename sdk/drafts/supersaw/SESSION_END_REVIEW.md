# Fin de session interactive — point à revoir

## Observation matérielle du 22 novembre 2026

Paquet `52df3143854f203044dde02d82a634bf2e5d5e1723c1adcd8c0e11a7afe2f476`,
base `6d23e888c47ab959762044c4facaa0b2b55fed85527284f38f3cea4d80beb58a`.
Après 600 mesures et dix minutes, le client a demandé la fin puis essayé Undo.
Le rollback a répondu `needs-recovery` pendant le budget de dix secondes.
À la sortie : phase `recovery`, `activeKnown=false`, `refusal=0` dans le dernier
diagnostic. José indique ne pas avoir arrêté et remis T1 sur FLEX à temps.

Le contrôle ultérieur a trouvé **dès son entrée** le mode normal, une identité
connue et zéro module. Il n’a pas eu à annuler une transaction. Ce résultat
confirme l’état final, pas l’instant ni la cause du retour à la normale.

## Ce que le code permet d’établir

Dans `trial_current_listen.mjs`, atteindre 600 000 ms appelle `requestFinish()`.
Cela fait sortir la boucle et exécuter `restoreTrial()` dans le bloc `finally`.
Le client n’attend donc pas une confirmation de José avant cette première
écriture de rollback. La phrase « Undo attendra le retour à FLEX » est trop
absolue : l’attente n’est mise en œuvre que si la base fournit le refus
explicite de Part occupée (code 7). Ce refus n’apparaît pas dans cet incident.

La présence de SuperSAW sur T1 est une condition rapportée à prendre en compte,
mais ne démontre pas la cause interne de `needs-recovery`. Les messages
« retrait encore en cours » décrivent l’interprétation du client, pas une preuve
que le firmware avançait effectivement dans le retrait.

## Prochaine correction à concevoir et vérifier

Séparer l’avertissement de durée, la demande à l’utilisateur et l’autorisation
effective de retrait. Examiner en parallèle le contrat de rollback de la base
pour comprendre `needs-recovery`, sans désactiver ses protections ni masquer
les refus. Une temporisation plus longue ne constitue pas une correction démontrée.

Cas de test à couvrir : échéance pendant la lecture ; arrivée tardive de Q ;
T1 encore affectée ; refus explicite 7 ; réponse transitoire confirmée ; réponse
USB incertaine ; fermeture de l’entrée ; retour à FLEX avant Q ; confirmation
finale du mode, de l’identité et de l’inventaire. L’écoute et la fin manuelle
sur matériel devront ensuite être refaites sur les scripts identifiés.

L’analyse initiale n’a pas modifié le firmware ni le moteur. La correction
du parcours hôte décrite ci-dessous reste à vérifier sur matériel.

## Correction du parcours hôte — manual-confirm-v1

`audition_monitor.mjs` sépare demande et confirmation de fin. La durée normale
de dix minutes et l’alerte CPU ≥ 85 % affichent une consigne puis attendent
Q/FIN. Ctrl-C demande également ces gestes sans les confirmer. Le compteur de
durée n’appelle plus la fonction de confirmation. Q/FIN signifie que José a
effectué STOP sur la machine, remis T1 sur FLEX et ouvert AMP pour quitter SRC.
Le client ne peut pas attester ces gestes à sa place.

La fermeture de l’entrée ou une panne de lecture restent des cas de nettoyage
de secours : le client tente l’Undo avec les protections existantes, sans
promettre le succès. Aucun transfert incertain n’est rejoué. Les messages
transitoires ne présentent plus le retrait comme en cours confirmé.

Le mode `trial_current_listen.py --end-check` déclenche la même demande après
trente secondes. Il emploie la même base et le même paquet, sans Keep ni
modification firmware. Son rapport identifie `manual-confirm-v1`, le mode court
et la raison de fin. La rétention est bornée à 3 600 mesures avec décompte des
mesures écartées si l’utilisateur reste absent ; les lectures continuent en attente.

Tests hôte réussis : durée, alerte CPU, interruption, Q tardif, mode trente
secondes, rétention bornée, EOF, lecture échouée, lifecycle complet attendant
la confirmation avant rollback, identité et inventaire après Undo. Les anciens
tests console et lifecycle passent également. Aucun nouvel essai matériel
n’a encore validé ce parcours ; la cause interne du refus passé reste ouverte.

## Deux fins manuelles consécutives confirmées sur matériel

Les deux contrôles `manual-confirm-v1` en mode trente secondes ont attendu le
Q de José puis confirmé Undo, identité précédente restaurée et zéro module ;
aucun Keep. Preuves natives : `evidence/manual-confirm-v1-hardware-end-check-1.json`
et `evidence/manual-confirm-v1-hardware-end-check-2.json`. Cette répétition
confirme le parcours de fin manuelle sur cette base et ce paquet. Elle ne
qualifie pas le maintien dix minutes du nouveau client, la fermeture forcée,
les sauvegardes/reboots, ni la cause interne de l'ancien `needs-recovery`.
