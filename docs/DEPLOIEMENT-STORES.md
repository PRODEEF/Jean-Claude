# Déploiement stores — App Store & Google Play

Issue [#21](https://github.com/PRODEEF/Jean-Claude/issues/21), §7, §0.2 (Cible 3).
Contact référent pour les comptes développeur : Nicolas (associé d'Antonin).

Objectif de ce document : que la soumission puisse démarrer sans redécouvrir
les prérequis en cours de route. Il documente le processus et amorce ce qui
peut l'être sans compte développeur — la création des comptes eux-mêmes
reste une démarche administrative hors du périmètre de ce document.

## État au 7 septembre 2026

| Point                                         | Statut | Détail                                                          |
| ---------------------------------------------- | :----: | ---------------------------------------------------------------- |
| Identifiants de bundle réservés                |   ✅   | `fr.prodeef.jeanclaude` (iOS + Android), voir `apps/app/app.json` |
| Permissions natives déclarées                  |   ✅   | Micro (`NSMicrophoneUsageDescription`, `RECORD_AUDIO`)           |
| Config EAS Build (`eas.json`)                  |   ✅   | Profils `development` / `preview` / `production`                 |
| Politique de confidentialité                   |   🔵   | Brouillon rédigé, publié sur `/privacy` — champs légaux à compléter (voir plus bas) |
| Compte Apple Developer Program                 |   ⬜   | À créer — Nicolas                                                 |
| Compte Google Play Console                     |   ⬜   | À créer — Nicolas                                                 |
| Projet EAS (`eas init`)                        |   ⬜   | Dépend d'un compte Expo — à créer                                 |
| Fiches store (icônes, captures, description)   |   ⬜   | Non commencé — cette itération documente les specs, pas les visuels |
| Build natif réellement vérifié                 |   ⬜   | `expo prebuild --platform android` réussit ; compilation Gradle complète non vérifiée dans cet environnement (voir §8) |

## 1. Comptes développeur

Aucun des deux comptes n'existe à ce jour. Les deux sont des démarches
administratives (identité, moyen de paiement) qui ne peuvent pas être
engagées depuis une session de développement — à faire par Nicolas.

### Apple Developer Program

- **Coût** : 99 USD/an, individuel ou organisation.
- **Délai d'obtention** : variable, généralement quelques jours ; plus long
  pour un compte organisation (Apple vérifie l'entité via D-U-N-S Number).
  **Si le compte est ouvert au nom de PRODEEF plutôt qu'à titre individuel,
  prévoir la démarche D-U-N-S en amont** — c'est souvent le poste le plus
  long de toute la procédure.
- Ce qu'il permet une fois créé : App Store Connect, TestFlight (jusqu'à
  10 000 testeurs externes), les capacités avancées si besoin un jour
  (notifications push, etc.).

### Google Play Console

- **Coût** : 25 USD, frais **unique** (pas annuel, contrairement à Apple).
- **Vérification d'identité obligatoire** depuis l'évolution 2025-2026 de
  Google : quelques heures à deux jours ouvrés selon la complétude du
  dossier (pièce d'identité, moyen de paiement et profil développeur
  cohérents entre eux).
- **Point important pour un compte personnel** : un nouveau compte
  personnel doit passer par un test fermé — **12 testeurs, opt-in continu
  pendant 14 jours** — avant de pouvoir publier en production. **Les
  comptes organisation en sont exemptés.** Ouvrir le compte au nom de
  PRODEEF plutôt qu'à titre personnel évite ce délai de 14 jours
  incompressible.

Sources (à revérifier au moment de l'inscription — ces conditions évoluent) :
[Apple Developer Fee 2026](https://magora-systems.com/apple-developer-fee/),
[Google Play Developer Account Fee 2026](https://www.iconikai.com/blog/google-play-developer-account-fee-2026).

## 2. Configuration technique

`apps/app/eas.json` est prêt, trois profils :

- **`development`** — build avec dev client, distribution interne, APK sur
  Android (installable directement, contrairement à l'App Bundle de prod)
- **`preview`** — même format APK, distribution interne : c'est le profil à
  utiliser pour partager un build de test avant la review
- **`production`** — App Bundle Android, incrémentation automatique du
  numéro de build (`autoIncrement`), c'est celui qui part vers les stores

**`eas.json` ne suffit pas à lancer un build.** Il manque encore, dans
l'ordre :

1. Un compte Expo (gratuit, distinct des comptes Apple/Google)
2. `eas login` puis `eas init` depuis `apps/app/` — crée le projet EAS et
   pose `extra.eas.projectId` dans `app.json`
3. Pour soumettre (`eas submit`), les identifiants Apple/Google ci-dessus

Une fois ces trois prérequis réunis : `eas build --profile preview --platform android`
(ou `ios`) déclenche un premier build réel, sur l'infrastructure Expo — donc
sans les limites d'environnement rencontrées ici (§8).

## 3. Fiches store — ce qu'il faudra fournir

Cette itération documente les formats attendus ; produire les visuels
eux-mêmes (icône soignée, captures d'écran mises en scène) est un travail de
design hors du périmètre de ce document.

### App Store Connect (iOS)

- Icône 1024×1024 px, sans transparence, sans coins arrondis (Apple les
  applique automatiquement)
- Captures d'écran par taille d'appareil supportée — au minimum iPhone
  6.9" (1320×2868 px ou équivalent) ; iPad si `supportsTablet` reste actif
  dans `app.json`
- Description (4000 caractères max), sous-titre (30 caractères), mots-clés
  (100 caractères, séparés par des virgules)
- Catégorie principale et secondaire
- URL de la politique de confidentialité → `/privacy` une fois le domaine
  de production connu

### Google Play Console (Android)

- Icône 512×512 px
- Image de couverture (feature graphic) 1024×500 px
- Captures d'écran téléphone (min. 2, jusqu'à 8) et tablette si applicable
- Description courte (80 caractères) et complète (4000 caractères)
- Classification de contenu — questionnaire à remplir dans la Console
- URL de la politique de confidentialité (même page que ci-dessus)

## 4. Politique de confidentialité

Brouillon complet rédigé et publié à l'écran `/privacy` (accessible sans
authentification — voir `apps/app/src/app/_layout.tsx`), lié depuis l'écran
de connexion et depuis Réglages.

Vu la nature du produit (données de santé, administratives et d'assurance
que l'utilisateur peut confier), **ce brouillon doit être relu avant
publication effective** sur les stores. Champs explicitement marqués
`[À COMPLÉTER]` dans `apps/app/src/features/legal/privacy-policy.content.ts` :

- Raison sociale exacte, forme juridique, SIREN, adresse du siège
- Adresse de contact dédiée aux demandes RGPD
- Région d'hébergement du projet Supabase — **point non tranché**, déjà
  listé aux « Points à arbitrer » de `docs/SUIVI-BACKLOG.md` (§8, UE
  recommandé, à valider avec Antonin)
- Garanties contractuelles de chaque fournisseur de modèle (via le Vercel AI
  Gateway) contre la réutilisation du contenu des conversations à des fins
  d'entraînement — à vérifier avant mise en production, pas supposé ici

## 5. Processus et délais de review

### Apple

Généralement 24 à 72 heures. Peut s'étendre à 7-10 jours pour les cas
particuliers — secteurs réglementés, capacités IA, accessibilité — ce qui
peut concerner Jean-Claude vu la nature conversationnelle et les données de
santé potentiellement traitées. À anticiper dans le calendrier de
soumission, pas à découvrir au moment du dépôt.

Point technique à trancher avant la soumission (mis de côté le 7 septembre,
à reprendre) : l'authentification est un code à usage unique envoyé par
e-mail (`packages/domain/src/auth/auth.schema.ts`), sans mot de passe. Or
Apple exige un compte de démonstration fonctionnel dans les notes de review.
Deux pistes déjà identifiées : un trigger Supabase donnant un code fixe à
une adresse e-mail dédiée, ou une boîte mail de review surveillée
manuellement.

### Google

Vérification du compte développeur : quelques heures à deux jours ouvrés.
Review de l'application elle-même : généralement plus rapide qu'Apple,
quelques heures à quelques jours. Le test fermé de 14 jours pour un compte
personnel (§1) s'ajoute **avant** la review de production si le compte
n'est pas ouvert en organisation — c'est le délai le plus long de tout le
processus Android dans ce cas de figure.

## 6. Packaging et distribution de test

- **iOS** : `eas build --profile preview --platform ios` produit un build
  installable via TestFlight une fois soumis depuis App Store Connect —
  nécessite le compte Apple Developer
- **Android** : le profil `preview` produit un APK installable directement
  (partage de fichier, sans passer par une piste de test) ; pour une piste
  de test Play Console à proprement parler (interne, fermée ou ouverte), il
  faut le compte Google Play Console et un App Bundle (`eas build --profile
  production --platform android`)

## 7. Résultat du test de faisabilité technique (7 septembre 2026)

`expo prebuild --platform android` réussit proprement dans cet
environnement (Linux, sans Xcode) : génération du projet natif sans erreur,
manifeste cohérent. La compilation Gradle complète (`assembleDebug`) a
échoué pour une raison d'environnement précise — JDK 17 requis par le
plugin Gradle React Native/Expo, absent de ce bac à sable, et impossible à
récupérer (résolveur de toolchain bloqué par le proxy réseau, miroir Ubuntu
de secours en erreur 404). Ce n'est pas un défaut du code identifié à ce
stade — mais aucun build natif complet n'a encore réussi nulle part, y
compris sur un poste de développement classique ou EAS Build. À vérifier
avec un vrai `eas build` dès que les prérequis du §2 sont réunis.

## 8. Prochaines étapes

1. Nicolas : ouvrir les deux comptes développeur — en organisation
   (PRODEEF) plutôt qu'à titre personnel, pour éviter le test fermé de 14
   jours côté Google
2. Compléter les champs `[À COMPLÉTER]` de la politique de confidentialité
   et la faire relire
3. `eas login` + `eas init` dès qu'un compte Expo existe
4. Premier `eas build --profile preview` réel, sur les deux plateformes
5. Trancher le mécanisme de compte de démonstration pour la review Apple
6. Produire les visuels des fiches store (icône, captures d'écran)
