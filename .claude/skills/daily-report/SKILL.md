---
name: daily-report
description: >
  Produire le report fonctionnel quotidien destiné à Yann pendant le sprint
  Jean-Claude, et préparer la démonstration associée. Utilise ce skill en fin
  de journée de développement, quand on demande un point d'avancement, un
  résumé de ce qui a été fait, ou la mise à jour du suivi de backlog. Couvre
  aussi la mise à jour de docs/SUIVI-BACKLOG.md.
---

# Report quotidien

Obligation du §0.1 : **chaque jour** du sprint, Clarisse transmet à Yann un
report fonctionnel **et** une démonstration de ce qui a été développé.

L'objectif n'est pas de montrer du fini. C'est de permettre à Yann de faire
tester en continu par d'autres personnes, plutôt que de découvrir le résultat en
fin de sprint. **Une fonctionnalité buguée ou inachevée se montre quand même.**

## 1. Rassembler la matière

```bash
git log --since="1 day ago" --oneline
```

```bash
git diff --stat HEAD~5..HEAD
```

Puis relire `docs/SUIVI-BACKLOG.md` pour repérer ce qui a changé de statut.

Relire aussi les retours utilisateurs du jour (voir §5) : ils viennent
s'ajouter au report, pas seulement au suivi de statut.

## 2. Le report

Trois sections obligatoires, une quatrième si des retours utilisateurs sont
arrivés depuis le dernier report (§5) — sinon on l'omet, comme un point de
blocage qui n'existe pas ce jour-là. Rédigé pour un porteur de projet, **pas**
pour un développeur : décrire ce que l'utilisateur peut faire, pas les
fichiers touchés.

```markdown
## Jour N — <date>

### Fait aujourd'hui

- On peut maintenant se connecter avec son e-mail et un code reçu par mail.
- Les dossiers s'affichent dans la barre latérale, avec le nombre de
  conversations qu'ils contiennent.

### Reste à faire

- Le fil de conversation lui-même — prévu demain.
- Le rattachement d'une conversation à plusieurs dossiers.

### Points de blocage

- Il me faut le fichier `maquette-interface-ia.html` pour caler l'écran de
  conversation sur la référence prévue.
- Choix à valider avec Antonin : service de reconnaissance vocale.

### Retours utilisateurs

- Un bug signalé sur le bouton d'envoi qui reste grisé après une erreur
  réseau (catégorie « bug », écran `/assistant`).
- Trois pouces bas sur la même réponse à propos des rappels de la semaine.
```

Règles de rédaction :

| ❌                                       | ✅                                                               |
| ---------------------------------------- | ---------------------------------------------------------------- |
| « Implémenté `FolderService.getTree()` » | « Les dossiers s'affichent avec leurs compteurs »                |
| « Refacto du repository pattern »        | _(ne pas mentionner — invisible pour l'utilisateur)_             |
| « Fixé un bug »                          | « Le compteur d'un dossier inclut maintenant ses sous-dossiers » |

Un point de blocage sans demande précise n'est pas un point de blocage. Toujours
formuler ce qui est attendu et de qui.

## 3. La démonstration

Ce qui est développé doit être **montrable**, même partiellement.

```bash
npm run dev:api
```

```bash
npm run dev:web
```

Ordre de préférence : session live > enregistrement d'écran > captures. Le web
suffit si le mobile n'est pas prêt — mais viser une démo mobile dès que
possible, c'est la Cible 3 du §0.2.

Si une variante d'interface est en attente d'arbitrage (§4.3), c'est le moment
de la montrer — voir skill [ui-decision](../ui-decision/SKILL.md).

## 4. Lire les retours utilisateurs

Aucune route ne les liste : les deux tables se lisent à la main dans
Supabase Studio (SQL Editor). Une route de lecture aurait exigé un premier
accès privilégié que les RLS actuelles ne prévoient pas — voir
`.claude/rules/100-api.md` sur `admin` hors traitement système.

```sql
select category, content, platform, screen, created_at
from public.feedback
where created_at > now() - interval '1 day'
order by created_at desc;
```

```sql
select r.rating, r.comment, r.platform, r.screen, r.created_at, m.content as message_content
from public.message_ratings r
join public.messages m on m.id = r.message_id
where r.created_at > now() - interval '1 day'
order by r.created_at desc;
```

Rien depuis le dernier report → la section « Retours utilisateurs » ne
figure pas dans le report du jour.

## 5. Mettre à jour le suivi

`docs/SUIVI-BACKLOG.md` est un **livrable de fin de stage** (§10). Le tenir à
jour chaque jour évite de le reconstituer de mémoire à la fin.

Faire évoluer les statuts (⬜ → 🔵 → 🟡 → ✅), changer la date de dernière mise à
jour, et ajouter tout nouveau point à arbitrer.

## Rappel des cibles du sprint (§0.2)

| Cible                | Formulation                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1 — Adoption         | Yann doit basculer naturellement son usage quotidien vers Jean-Claude, en remplacement de Notion et Google Calendar |
| 2 — Stabilité        | Un périmètre réduit et stable vaut mieux qu'un périmètre large et instable                                          |
| 3 — Mobile et stores | Lancer les apps React Native et engager la procédure App Store / Play Store                                         |

La Cible 1 est le vrai critère de réussite — plus que la couverture du backlog.
Un report qui aligne des fonctionnalités sans rapprocher de l'usage quotidien
signale un problème de priorisation, pas un bon avancement.

## En fin de phase

Toute fonctionnalité non terminée à l'issue de sa phase est documentée comme
« à poursuivre » (§3), jamais livrée à moitié fonctionnelle.
