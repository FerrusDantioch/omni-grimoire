# Omni-Grimoire — notes pour Claude

PWA compagnon de jeu de rôle en **React + Vite** : fiches à structure libre,
lanceur de dés, journal, visionneuse PDF, lecteur audio. Contrairement aux PWA
en JS pur de l'utilisateur, ce projet passe par une **étape de compilation**.

```bash
npm install
npm run dev      # développement
npm run build    # produit dist/
npm start        # build puis aperçu sur http://localhost:4173
npm test         # scripts/test-core.mjs
```

Le fichier `Lancer Omni-Grimoire.cmd` fait tout cela d'un double-clic sous Windows
(installe les dépendances au premier lancement, compile, puis ouvre le
navigateur).

## Version du service worker : automatique, ne rien incrémenter à la main

Le service worker est **généré à chaque build** par `vite-plugin-pwa`, configuré
en `registerType: 'prompt'` dans `vite.config.js`. Le greffon calcule sa
propre liste de fichiers et ses révisions : il n'y a aucune constante de version
à modifier, et aucun fichier de service worker dans le dépôt.

**Nouvelle version : jamais par surprise.** Elle attend un clic sur « Mettre à
jour » (barre du haut, `useMiseAJour` dans `src/lib/usePwa.js`, branché par
`onNeedRefresh` dans `src/main.jsx`). Ne pas revenir à `autoUpdate` ni à
`skipWaiting: true`. Limite du navigateur : une application complètement
fermée trouve la nouvelle version à l'ouverture suivante.

## Chemin de base variable

```js
const base = process.env.GITHUB_PAGES ? `/${process.env.GITHUB_PAGES}/` : '/';
```

En local le site est servi depuis la racine ; le workflow de déploiement pose la
variable `GITHUB_PAGES`. **Ce `base` alimente aussi le manifeste PWA**
(`id`, `start_url`, `scope`) : le modifier sans cohérence casserait
l'installation de l'application.

## ⚠️ Le fichier .cmd doit rester en CRLF

`.gitattributes` contient une exception délibérée :

```
*.cmd text eol=crlf
```

`cmd.exe` interprète mal un fichier `.cmd` n'ayant que des LF, en particulier les
blocs entre parenthèses (`if errorlevel 1 ( ... )`) — et `Lancer Omni-Grimoire.cmd`
en contient plusieurs. **Ne pas retirer cette règle.**

## À savoir

- **Licences tierces** : `public/licences-tierces.txt` rassemble les textes de
  licence des bibliothèques publiées. Il est refait par
  `scripts/licences-tierces.mjs`, lancé automatiquement avant chaque
  `npm run build` (script `prebuild`). Après un changement de dépendances,
  committer le fichier refait.
- Déploiement automatique par GitHub Actions (`.github/workflows/deploy.yml`) à
  chaque envoi sur `main` → https://ferrusdantioch.github.io/omni-grimoire/
- Code et commentaires en français : conserver ce niveau d'explication.

---

## Règles communes à l'écosystème

> Section ajoutée le 13 novembre 2026 à partir du socle commun des PWA de
> Ferrus. Elle est **adaptée à ce dépôt** : les règles du socle qui ne
> concernent que d'autres applications ont été retirées. Si une règle
> ci-dessous semble contredire les notes propres à ce dépôt (plus haut),
> ne tranche pas : signale-le à Ferrus et attends sa décision.
>
> Version de référence : dépôt privé `omni-socle`, fichier `SOCLE.md`. Toute
> modification d'une règle commune se fait d'abord là-bas, puis est recopiée
> ici.

*Chaque règle porte une étiquette :*

* [DÉCIDÉ] : choix confirmé par Ferrus. À respecter sans discuter.
* [CONSTATÉ] : relevé dans le code des dépôts omni-texte, Refuge, omni-budget et omni-grimoire (novembre 2026). Les autres dépôts n'ont pas été lus.
* [RECOMMANDÉ] : proposition non validée. À proposer, jamais à appliquer d'office.

### 1. Qui, pourquoi, comment travailler

* Ferrus veut comprendre ce qui se passe : explique en français simple, signale chaque terme technique, ne délègue pas dans le dos. [DÉCIDÉ]
* Sois clair, direct, sans édulcorant. Dis ce qui est fragile ou incohérent. [DÉCIDÉ]
* Les outils servent à aider les autres, en priorité les personnes autistes et les personnes en situation de handicap. Refuge et Cap sont des assistances pour personnes autistes ; Soutien-IMC est une fiche de contact très lisible, conçue pour des personnes infirmes moteurs cérébrales. [DÉCIDÉ]
* Objectif de fond : remplacer les outils des grandes entreprises par des outils faits maison, et être indépendant des comptes et d'internet. [DÉCIDÉ]
* Avant tout changement important : explique ce que tu vas faire, attends l'accord. Ne modifie jamais plusieurs applications d'un coup sans demande. [DÉCIDÉ]

### 2. Règles non négociables

1. Pas de compte, pas de backend, pas d'IA intégrée. [DÉCIDÉ]
2. Fonctionnement hors ligne systématique. Tout ce dont l'application a besoin est embarqué dans l'installation, moteur de reconnaissance de texte (OCR) d'omni-budget compris (environ 6 Mo). [DÉCIDÉ]
3. Aucun appel réseau sans en avoir parlé à Ferrus d'abord. Si une fonctionnalité demande internet, arrête-toi, explique pourquoi, propose une alternative locale, attends la décision. [DÉCIDÉ] Cette règle vise l'application. Les outils de développement (`npm install`, GitHub Actions) sont acceptés ; toute nouvelle bibliothèque, tout nouvel outil ou tout nouveau serveur contacté doit être signalé à Ferrus avant. [DÉCIDÉ]
4. Les données restent sur l'appareil. Rien n'est envoyé. Les liens externes ne s'ouvrent que sur action de la personne. [DÉCIDÉ]
5. Pas de police, de bibliothèque ou de script chargés depuis un CDN : tout est embarqué avec sa licence. [CONSTATÉ dans omni-texte ; à étendre]
6. Ne copie jamais un fichier depuis un serveur tiers pendant la publication (build). Le fichier est versé dans le dépôt, avec son empreinte vérifiée. [RECOMMANDÉ, suite à l'OCR téléchargé sans contrôle]

### 3. Identité, ton, mentions

* Signature : « Ferrus Dantioch », sauf dans Refuge, qui signe d'un prénom seul (celui qui figure dans son « À propos »). C'est voulu : dans le contexte de Refuge, le prénom crée la confiance. Ne pas « corriger ». [DÉCIDÉ]
* Ton : tutoiement partout, y compris dans omni-budget et omni-grimoire. Exception conservée dans Refuge : « vous » pour ce qui est montré à d'autres personnes (message d'urgence, etc.). [DÉCIDÉ pour le tutoiement ; exception CONSTATÉE]
* Chaque application contient un « À propos » avec au minimum : nom, version, « Application réalisée par Ferrus Dantioch, avec l'aide de l'intelligence artificielle », mention de licence, phrase de confidentialité, contact, lien « Découvrir l'Omni-système ». Chaque application garde son texte propre. [DÉCIDÉ pour le fond ; modèle CONSTATÉ dans omni-texte]
* Licence du code : © 2026 Ferrus Dantioch, Creative Commons BY-NC-ND 4.0, avec le fichier LICENSE identique dans tous les dépôts. Règles, fiches, logos et textes de l'Omni-système : tous droits réservés. [DÉCIDÉ]
* Contact dans les applications : l'alias e-mail de l'Omni-système. Le serveur Discord figure sur le portfolio seulement : il n'a pas besoin d'apparaître dans les applications. [DÉCIDÉ]
* Identité visuelle : violet nuit pour l'écosystème Omni. Logo de l'Omni-système (dé à vingt faces violet entouré d'un anneau lumineux) dans l'« À propos ». Exception Refuge : pas de logo Omni ; le violet nuit y est une gamme facultative parmi les autres, pas celle par défaut. [DÉCIDÉ]
* Chaque bibliothèque tierce est créditée avec sa licence (fichier de licences, et lien depuis l'« À propos »). [RECOMMANDÉ ; aujourd'hui le lien manque dans les deux applications React]

### 4. Sécurité et vie privée

* Une CSP (règle de sécurité qui interdit au navigateur de contacter d'autres sites) stricte dans chaque application. [RECOMMANDÉ ; CONSTATÉ : présente dans omni-texte et omni-budget, absente de Refuge et omni-grimoire]
* Données sensibles (journal, notes vocales, finances) : chiffrées au repos quand c'est possible. [RECOMMANDÉ ; CONSTATÉ : seul omni-budget chiffre]
* Origine partagée : toutes les applications vivent sous la même adresse de base, donc chacune pourrait techniquement lire les données des autres. Ne jamais stocker deux applications sous le même nom de base de données ou de préfixe. Préfixe propre à chaque application pour caches, IndexedDB et localStorage. Un préfixe générique (ex. `budget-`) est à éviter. [CONSTATÉ ; hébergement à origines séparées : décision reportée] Cette règle vaut pour les nouveaux noms : les noms déjà publiés (`budget-perso` et `budget-theme` d'omni-budget) restent, car les renommer ferait perdre les données des personnes. [DÉCIDÉ]
* Sur Chrome Android, une seule PWA du même site s'installe. Contournement : utiliser Brave, qui les installe indépendamment. C'est un palliatif d'installation : il ne règle ni l'isolation des données ni le risque de sécurité. À mentionner dans l'aide à l'installation de chaque application. [DÉCIDÉ comme palliatif]
* Ne pas stocker en clair ce qui pourrait nuire à la personne si quelqu'un d'autre ouvre l'appareil. [RECOMMANDÉ]

### 5. Hors ligne et versions

* Service worker (petit programme qui garde une copie de l'application sur l'appareil) : tout est copié à l'installation, puis « cache d'abord ». [CONSTATÉ]
* La mise à jour doit se vérifier au retour au premier plan, avec un message clair. [CONSTATÉ dans 3 apps sur 4 ; manque dans omni-budget] Exception Refuge : le message clair est la note discrète de l'accueil (sans bouton) et le bouton « Mettre à jour » des Réglages ; rien en bouclier, jamais de changement par surprise. [DÉCIDÉ]
* Le service worker gère l'échec réseau (plan B quand un fichier manque). [RECOMMANDÉ ; absent de Refuge]
* Numéro de version : une seule source de vérité, automatique, jamais écrite à la main à deux endroits. [RECOMMANDÉ ; CONSTATÉ : 4 méthodes différentes, dont 2 reposent sur la mémoire]
* Si le numéro de version affiché ne correspond pas au code, le signaler. [RECOMMANDÉ]

### 6. Accessibilité (minimum pour toute application)

* Cibles tactiles : 44 px minimum. Refuge en vise 60 px. [DÉCIDÉ ; CONSTATÉ : plusieurs boutons du grimoire font 34 à 40 px]
* Contraste du texte : 4,5 minimum (WCAG). [RECOMMANDÉ ; CONSTATÉ : Refuge, thème clair, à 3,8–4,3]
* Contour de focus clavier toujours visible, y compris en thème « bouclier noir » de Refuge. [RECOMMANDÉ] Dans le bouclier : contour gris foncé, juste au minimum de la norme (contraste 3:1 sur le noir, environ `#5a5a5a`), seulement autour de l'élément sélectionné, pour éclairer le moins possible. [DÉCIDÉ]
* Respect du réglage « réduire les animations » du téléphone. [CONSTATÉ dans les quatre]
* Un seul `<h1>` par page. Échap ferme les écrans plein écran. Tab ne s'en échappe pas. [RECOMMANDÉ ; CONSTATÉ : manque dans Refuge]
* Vibration : interdite dans Refuge. Ailleurs, toute vibration a un réglage pour la couper. [DÉCIDÉ ; CONSTATÉ : le grimoire vibre sans réglage]
* Thème appliqué avant l'affichage pour éviter l'éclair du mauvais thème : petit script en tête de page. [CONSTATÉ dans omni-texte et Refuge ; manque dans omni-budget et omni-grimoire]
* Thèmes de référence : Omni (violet nuit), Sombre, Clair. [CONSTATÉ] « Auto » (suit le réglage du téléphone) est accepté en plus de ces trois thèmes. [DÉCIDÉ]

### 7. Tests et livraison

* Test automatique de chaque nouvelle fonction. omni-texte a Playwright (hors ligne, contrastes, téléphone) ; omni-budget a Vitest ; Refuge n'en a pas. [CONSTATÉ ; tests pour Refuge : RECOMMANDÉ]
* Avant de dire que c'est terminé : vérifie hors ligne, vérifie sur téléphone et sur tablette, relis le bloc « À propos », vérifie qu'aucune requête réseau ne part.
* Mettre à jour le README et les commentaires quand le code change (omni-texte annonce 1.3.0 alors que le code est en 1.3.1). [CONSTATÉ]

### 8. Technologies

* Pour une petite application : HTML, CSS et JavaScript purs, sans étape de compilation (build). [RECOMMANDÉ par défaut]
* React + Vite (build obligatoire, publication par GitHub Actions) n'est utilisé que si la complexité le justifie. [CONSTATÉ dans omni-budget et omni-grimoire]
* Publication : GitHub Pages. [CONSTATÉ]

### 10. Périmètre actuel

Seuls omni-texte, Refuge, omni-budget et omni-grimoire ont été examinés. Cap, Soutien-IMC et les autres dépôts ne le seront pas pour le moment, par décision de Ferrus. Ne pas étendre les règles de ce document à un dépôt non lu sans l'avoir lu. [DÉCIDÉ]

### 11. Dettes connues, par priorité

- **Priorité 2** — Origine partagée : décision d'hébergement à étudier, reportée.
- **Priorité 4** — Méthode de version unique pour toutes les applications.
- **Priorité 5** — Grimoire : réglage pour couper la vibration, cibles tactiles, CSP, jsPDF 2.5.2 à auditer (à vérifier, non confirmé), Workbox à citer dans `licences-tierces.txt`.
- **Priorité 6** — Éclair de thème (omni-budget, omni-grimoire), préfixe de cache générique d'omni-budget, documentation périmée.
- **À classer** — Tutoiement à appliquer dans omni-budget et omni-grimoire (aujourd'hui : vouvoiement).
- **À classer** — omni-budget et omni-grimoire : lien vers `licences-tierces.txt` depuis l'« À propos ».
