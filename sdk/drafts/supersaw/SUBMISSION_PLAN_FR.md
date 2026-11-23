# Proposer SuperSAW à Modwerk

Préparation locale du 22 novembre 2026. Aucune soumission, réservation,
publication, ouverture de pull request ou prise de contact n’a été effectuée
par cette préparation.

## Deux objectifs distincts

**Faire connaître le projet :** présenter le prototype et ses essais, demander
une revue technique et les conseils nécessaires à son intégration. Le texte
anglais `REVIEW_REQUEST.md` est préparé pour cela.

**Entrer dans la bibliothèque publique :** livrer une version construite par
les outils Modwerk et satisfaire les contrôles requis. Les essais d’écoute
positifs ne suffisent pas à franchir cette seconde étape.

## Contenu prêt

| Élément | Emplacement | État |
|---|---|---|
| Fiche française | PRESENTATION_FR.md | Prête à relire |
| Présentation courte FR/EN | MESSAGE_PRESENTATION.md | Prête à relire |
| Description de PR | PR_DRAFT.md | Brouillon avec essais et cas limites |
| Message de revue en anglais | REVIEW_REQUEST.md | Brouillon non envoyé |
| Miniature SVG | presentation/thumbnail.svg | Proposition originale à relire |
| Paramètres et métadonnées | octamod.module.json | Présents, statut expérimental |
| Historique et bilan récent | TESTING.md, SUBMISSION_STATUS.md | Mis à jour |
| Preuves des essais actuels | evidence/current-base-*.json | Identités et portée documentées |
| Provenance et licences | provenance.json et fichiers LICENSE | Présents ; validation finale des droits à terminer |
| Diagnostic de fin de session | SESSION_END_REVIEW.md | Cause interne non établie |

## Étapes à suivre pour la revue

1. Actualiser le checkout depuis le main Modwerk au moment de soumettre et
   vérifier les règles qui auraient changé. La documentation utilisée ici est
   celle de `ad600202ed3c5f9866f71d38375891c4c680abec`.
2. Consulter la bibliothèque, les pull requests ouvertes et le tableau des
   développeurs pour rechercher doublons et réservations. La consultation
   connectée de ces deux derniers éléments reste à faire ; ne pas revendiquer
   une réservation acquise.
3. Vérifier que `jokobol` est bien le compte GitHub à employer et préparer le
   fork et la branche de contribution. Le nom provient du manifeste local,
   pas d’une vérification d’identité en ligne.
4. Relire ensemble `REVIEW_REQUEST.md`. La revue doit exposer la signature
   SW/1 au démarrage, l’intégration du paquet et l’échec de retrait temporisé.
5. Avec l’accord de José pour la destination et le texte, pousser les sources
   et ouvrir une pull request **brouillon**, ou transmettre d’abord la demande
   de revue au canal convenu. Préparer un texte ne le soumet pas à Modwerk.

## Ce qui manque pour demander une publication

| Point | Travail restant |
|---|---|
| Fin de session | Deux fins manuelles courtes consécutives passent ; cause de l’ancien refus et durée complète à examiner |
| Paquet officiel | Intégrer la recette publique et contrôler la reconstruction exacte |
| Signature SW/1 | Faire examiner la validation des Parts lorsque le module est absent au démarrage |
| Charge | Mesurer le coût du renderer et le repos dans une scène comparable, sur matériel |
| Persistance | Qualifier Part/projet, Keep, retrait et redémarrage physique, une fois la protection examinée |
| Présentation | Captures de la version actuelle et démonstration courte choisie par José |
| Bibliothèque | Finaliser catalogue, miniature et métadonnées sans publier prématurément |
| Contrôles | `module:doctor --release`, procédure de tests et `pr:ready` doivent passer sur la version soumise |

Le diagnostic expérimental local passe, avec le tableau communautaire désactivé.
Le manifeste et la miniature passent leurs contrôles locaux. Le contrôle
`module:doctor --release` a été relancé : les contrôles de publication restent en échec. Le message du doctor proposant
`module:dev` n’est pas la preuve que notre recette publique produit déjà ce moteur.

## Médias à réunir au retour de José

- Une photo lisible de SRC avec les six paramètres de cette version.
- Une courte démo avec plusieurs densités OSC, DETN/WIDE et une séquence avec
  filtre et delay ; conserver un volume comparable entre les extraits.
- Si possible, les valeurs choisies et le tempo pour reproduire l’exemple.

Aucun nouvel enregistrement ou geste sur l’instrument n’est requis pendant la
pause. Les médias existants restent à sélectionner et à vérifier avant usage.

## Sources des démarches

Documentation du checkout : `docs/DEVELOPER_WORKFLOW.md`,
`docs/ADD_A_MODULE.md`, `docs/TEST_PROCEDURE.md`, `docs/AGENT_BOARD.md`.
Une première publication passe par une revue de la machine ou de l’équipe
Modwerk ; préparer un compte ou un manifeste ne donne pas le droit de publier.

## Vérification avant relecture, soirée du 22 novembre

Le main distant a été récupéré en lecture seule : `c07f3b1c` au moment du
contrôle. Les documents DEVELOPER_WORKFLOW.md, ADD_A_MODULE.md et le modèle
de pull request n’ont pas changé depuis la base documentaire ad600202.
Aucune fusion ni modification de la base matérielle n’a été effectuée.

Le dépôt public `https://github.com/jokobol/SuperSAW-OT` existe ; la copie de
travail locale conserve pour origine `repeat98/modwerk`, et n’a pas de fork
Modwerk configuré. L’outil GitHub CLI n’est pas installé dans l’environnement
contrôlé et aucun connecteur GitHub actif n’est disponible. Aucune connexion
au compte GitHub de José ni autorisation d’écriture distante n’est attestée.

Le tableau public interrogé pour `module octatrack/supersaw` retourne zéro
réservation. La première page de 100 pull requests ouvertes consultée ne
contient pas de titre/corps correspondant à SuperSAW ou SW/1 ; ce n’est pas
une recherche exhaustive des autres pages, issues et travaux non annoncés.
Aucune réservation ni pull request n’a été créée.
