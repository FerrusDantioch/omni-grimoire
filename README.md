# Omni-Grimoire — Compagnon JDR (v1.1.0)

Application web progressive (PWA) pour le jeu de rôle solo et multi-joueurs.
Installable sur mobile et ordinateur sans passer par les stores, fonctionne
entièrement hors ligne, et ne transmet aucune donnée à un serveur.

**→ [Ouvre l'application](https://ferrusdantioch.github.io/omni-grimoire/)**

Ouvre ce lien sur téléphone ou sur ordinateur, puis installe l'application
depuis le bouton **Installer** de la barre du haut. Elle fonctionne ensuite sans
réseau. Rien à installer par ailleurs : les sections ci-dessous ne concernent que
le développement.

## Démarrer

**Le plus simple : double-clique sur `Lancer Omni-Grimoire.cmd`.** Il installe les
dépendances au premier lancement, compile l'application et ouvre le navigateur.
Laisse la fenêtre noire ouverte pendant l'utilisation ; la fermer arrête le serveur.

En ligne de commande, c'est équivalent :

```bash
npm install
npm start
```

| Commande | Effet |
| --- | --- |
| `npm start` | Compile puis sert l'application sur http://localhost:4173 et ouvre le navigateur |
| `npm run dev` | Serveur de développement (rechargement à chaud) sur http://localhost:5173 |
| `npm run build` | Build de production dans `dist/` (manifeste + service worker + `licences-tierces.txt`) |
| `npm run serve` | Sert `dist/` sans recompiler ni ouvrir le navigateur |
| `npm test` | Tests unitaires du moteur de dés, du markdown, de la sauvegarde différée, des dates locales, de l'import et du partage de fiches |
| `node tests/smoke.mjs` | Test Playwright sur `dist/` servi sous `/omni-grimoire/` (hors ligne, CSP, accessibilité, contraste Parchemin) |
| `npm run licences` | Régénère `public/licences-tierces.txt` à partir de `package-lock.json` |
| `npm run icons` | Régénère les icônes PNG de la PWA |

### Pourquoi un double-clic sur `index.html` donne une page blanche

C'est normal, et aucune configuration ne peut y remédier : ouvert ainsi, le
fichier utilise le protocole `file://`, et une application web moderne ne peut
pas fonctionner dans ce contexte.

- `index.html` à la racine ne contient que `<script src="/src/main.jsx">` : du
  JSX, que le navigateur ne sait pas exécuter. C'est Vite qui le transforme.
- `dist/index.html` référence `/assets/…` ; sur `file://`, la barre oblique
  initiale pointe vers la racine du disque (`C:\assets\…`), donc rien ne charge.
- Même avec des chemins corrigés, les modules ES sont bloqués par la politique
  d'origine sur `file://`, et le service worker, la persistance du stockage et
  l'invite d'installation exigent tous une origine `http://localhost` ou `https://`.

L'application doit donc être **servie**, ce que fait `Lancer Omni-Grimoire.cmd`.

### L'installer comme une vraie application

Une fois la page ouverte sur http://localhost:4173, le bouton **Installer** de la
barre du haut (ou l'icône d'installation dans la barre d'adresse de Chrome/Edge)
crée un raccourci qui ouvre Omni-Grimoire dans sa propre fenêtre, sans barre de
navigateur. Il faut malgré tout que le serveur tourne.

C'est exactement ce que fait la version en ligne : **https://ferrusdantioch.github.io/omni-grimoire/**.
En HTTPS, le service worker met tout en cache et l'application fonctionne ensuite
sans réseau et sans rien lancer localement — c'est la façon recommandée de s'en servir.

> **Installation sur Android (Chrome / Brave) :** sur Chrome Android, une seule
> PWA d'une même origine (`ferrusdantioch.github.io`) peut être installée. Si
> Chrome affiche « Cette appli est déjà installée » alors qu'une autre
> application de l'écosystème Omni-Système l'est déjà, utilise **Brave** (qui
> installe chaque application indépendamment) ou choisis « Créer un raccourci ».

### Déploiement et intégration continue

- Chaque `push` sur `main` déclenche `.github/workflows/deploy.yml` : installation,
  tests, build et publication sur GitHub Pages. Le build de déploiement reçoit la
  variable `GITHUB_PAGES` avec le nom du dépôt, ce qui bascule `base`, `start_url`
  et `scope` sur `/<dépôt>/` ; sans cette variable (donc en local), tout reste à la
  racine et `Lancer Omni-Grimoire.cmd` continue de fonctionner.
- Les `pull_request` et les branches `fix/**`, `feat/**`, `claude/**` déclenchent
  `.github/workflows/ci.yml` : `npm ci`, `npm test`, `npm run build`, vérification
  que `public/licences-tierces.txt` est à jour (`git diff --exit-code`) et tests
  Playwright (`node tests/smoke.mjs`).

## Fonctionnalités

### Fiches de personnage
Structure entièrement libre : tu nommes toi-même chaque **catégorie**
(« Caractéristiques », « Magie », « Contacts »…) et chaque **champ**. Cinq types
de champ : nombre, texte court, texte long, liste déroulante, case à cocher.
Catégories et champs s'ajoutent, se renomment, se réordonnent et se suppriment à
la volée. Trois modèles de départ (vierge, aventurier d20, héros narratif) ne
sont que des points de départ — rien n'est figé.

Sauvegarde automatique dans IndexedDB, 600 ms après la dernière frappe, et
immédiate à la fermeture de la fiche.

**Dupliquer, partager** — le bouton de copie de l'éditeur duplique la fiche
(« Aldric (copie) ») et l'ouvre aussitôt. L'export au format **Fiche Omni-Grimoire**
produit un petit fichier `.json` à envoyer au MJ ou à un autre joueur, qui le
réimporte avec le bouton **Importer** de l'onglet Fiches. Une fiche importée
reçoit toujours de nouveaux identifiants : elle n'écrase jamais une fiche
existante, et son contenu est vérifié champ par champ.

### Lanceur de dés, lié aux fiches
Bouton flottant présent sur **tous** les onglets, affichant le dernier résultat.
Le panneau propose d4 à d100 avec compteur, une expression libre
(`2d6+3`, `4d6kh3`, `2d20kl1`…), des raccourcis avantage / désavantage, une
animation de lancer et l'historique des derniers jets (les 200 plus récents sont
conservés, les 25 plus récents s'affichent, rejouables d'un tap). Un réglage
permet d'activer ou de couper les **vibrations** dans les Réglages.

**Modificateurs de personnage** — quand une fiche est ouverte, elle devient la
fiche active : ses champs numériques marqués « utilisable comme modificateur »
apparaissent en pastilles dans le panneau. Tu en sélectionnes un ou plusieurs, tu
peux ajouter un bonus manuel temporaire, et le résultat est détaillé :

```
1d20 (19) + 3 (Force) = 22
```

Deux modes de calcul par champ : **valeur brute** (le nombre est ajouté tel quel)
ou **modificateur d20** (`(valeur − 10) / 2`, arrondi vers le bas — Force 16 → +3).

Chaque champ modificateur porte aussi, **directement dans la fiche**, un petit
bouton dé : un tap lance `1d20 + modificateur` et affiche le détail du jet en
notification, sans ouvrir le panneau.

### Journal d'aventure
Éditeur markdown avec barre d'insertion et aperçu rendu. Les séances se
regroupent par chapitre, portent une date (en heure locale) et peuvent être liées
à des personnages. Recherche plein texte, compteur de mots, export d'une séance
ou du journal entier.

Le bouton dé de la barre d'insertion propose les derniers jets du lanceur ; un
tap insère le jet choisi à l'emplacement du curseur, sur sa propre ligne :

```
**Jet (Aldric, Force)** : 1d20 (17) + 3 (Force) = **20**
```

### Tracker de combat
Onglet **Combat** : prépare des rencontres à l'avance ou monte-les à table.
Chaque combattant porte nom, initiative, bonus d'initiative, points de vie (avec
jauge) et une note libre pour les états (« empoisonné », « à terre »…).
**L'initiative est tirée automatiquement** (`1d20 + bonus`) à l'ajout d'un
combattant, et le bouton **Initiative** la retire pour tout le monde (avec
confirmation si le combat a déjà commencé). Les combattants se trient par
initiative décroissante, puis par bonus ; **Commencer** / **Tour suivant** font avancer le
tour et incrémentent le round à chaque boucle. Boutons −1 / +1 / −5 / +5 sur
les PV (bornés de 0 au maximum), réinitialisation complète en un clic, et
import direct **depuis les fiches** : bonus d'initiative et PV sont détectés
d'après les noms de champs (« Initiative », « Points de vie », « PV maximum »… ;
à défaut d'« Initiative », le modificateur de Dextérité ou d'Agilité). À 0
PV, le combattant apparaît barré. Terminer un combat demande confirmation et le
retire de la liste.

### Visionneuse PDF
pdf.js intégré : navigation par page (clavier inclus), zoom, ajustement à la
largeur, glisser-déposer pour se déplacer. **Zoom à deux doigts** sur écran
tactile, et par pincement du pavé tactile ou Ctrl + molette sur ordinateur : le
point visé reste sous les doigts. Aux très forts zooms, la finesse du rendu est
plafonnée (16 millions de pixels) pour que la page ne reste jamais blanche sur
téléphone. Le **mode battlemap** passe en plein
écran avec une grille superposée dont la taille des cases et l'opacité sont
réglables. Les documents importés sont stockés localement et la dernière page
consultée est mémorisée.

### Lecteur de musique
Import de fichiers audio locaux (mp3, ogg, wav, m4a, flac, opus), playlists,
lecture aléatoire et répétition. L'élément audio vit au-dessus des vues : **la
lecture continue quand tu changes d'onglet ou que l'onglet passe en arrière-plan**,
et l'API Media Session expose les commandes sur l'écran de verrouillage. Une
barre de lecture compacte reste visible partout dans l'application, avec la
progression temporelle isolée dans `PlayerTimeContext` pour éviter les re-rendus
inutiles du reste de l'interface.

### Soundboard d'ambiances
Troisième onglet de la section Musique : importe des effets sonores ou des
ambiances (mp3, ogg, wav…) et déclenche-les d'un tap sur des pastilles.
Chaque pastille a son bouton lecture/stop, un mode **boucle** (pluie, feu de
camp…), un renommage et une suppression ; un volume global dédié est mémorisé.
Plusieurs ambiances peuvent jouer en même temps, indépendamment du lecteur de
musique. Comme la musique, **elles continuent quand tu changes d'onglet** : une
pastille dans la barre du haut indique combien jouent et les arrête d'un tap.

### Export
Modale de confirmation avec choix du format :

- **PDF** — mise en page dessinée à la main via jsPDF : titre, filets, grille de
  champs sur deux colonnes pour les fiches ; titres, listes, citations et pied de
  page numéroté pour le journal.
- **Texte** — `.txt` structuré, lisible et modifiable partout.
- **Fiche Omni-Grimoire** (fiches uniquement) — `.json` réimportable dans Omni-Grimoire.

Les réglages proposent en plus deux sauvegardes en JSON, et leur restauration :

- **légère** — fiches, journal, combats, playlists et historique de dés, sans
  les PDF ni les fichiers audio : quelques Ko, à faire souvent ;
- **complète** — tout, PDF, musiques et ambiances compris (encodés en
  data-URL) : le fichier peut être volumineux.

## Architecture

```
public/
├── theme-init.js            application du thème avant le premier rendu (anti-flash)
└── licences-tierces.txt     textes de licence des paquets tiers embarqués
src/
├── main.jsx                 point d'entrée, enregistrement du service worker
├── App.jsx                  navigation, mise en page, raccourcis du manifeste
├── lib/
│   ├── db.js                IndexedDB (idb) : magasins, réglages, sauvegarde
│   ├── dice.js              analyse d'expressions + tirage cryptographique
│   ├── markdown.js          rendu markdown sûr (échappement avant transformation)
│   ├── exporters.js         PDF (jsPDF), texte et fiche .json
│   ├── characterFile.js     duplication, export et import d'une fiche seule
│   ├── templates.js         modèles de fiches, fabriques de champs
│   ├── utils.js             dates, tailles, fichiers, aides diverses
│   └── usePwa.js            invite d'installation, mise à jour manuelle, état réseau
├── state/
│   ├── AppContext.jsx       données + CRUD + thème + vibrations + notifications
│   ├── DiceContext.jsx      jets, historique, modificateurs actifs
│   ├── PlayerContext.jsx    lecteur audio global + PlayerTimeContext + Media Session
│   └── AmbianceContext.jsx  ambiances du soundboard, jouées sur tous les onglets
├── components/              Icon, Modal, ExportModal, DiceWidget,
│                            CharacterEditor, MiniPlayer, Soundboard, Toasts
├── views/                   Personnages, Journal, Combat, Documents, Musique,
│                            Réglages (avec « À propos » et lien licences-tierces.txt)
└── styles/                  design system et styles partagés
tests/
└── smoke.mjs                suite Playwright sur dist/ (hors ligne, CSP, contraste, a11y)
```

Les données vivent dans IndexedDB (`grimoire-jdr`) : `characters`, `journal`,
`documents`, `tracks`, `playlists`, `rolls`, `encounters`, `sounds`, plus un
magasin `settings` clé/valeur.
Les PDF et fichiers audio sont stockés en `Blob`. L'application demande la
persistance du stockage au premier lancement pour éviter l'éviction automatique.

## PWA, sécurité et vie privée

- `manifest.webmanifest` : `display: standalone`, icônes 192/512 + maskable,
  raccourcis « Lancer 1d20 » et « Journal ».
- Service worker Workbox (`registerType: prompt`, `workbox.cacheId: 'omni-grimoire'`) :
  tout le build est pré-caché (dont le worker `pdf.js` et `licences-tierces.txt`),
  avec repli de navigation sur `index.html`. La nouvelle version attend un clic
  sur **Mettre à jour** dans la barre du haut (jamais de changement par surprise).
- Bouton « Installer » affiché dans la barre du haut dès que le navigateur le
  propose ; sur iOS, passe par « Ajouter à l'écran d'accueil ».
- **CSP stricte** dans `index.html` (`default-src 'none'`, `script-src 'self'`,
  `connect-src 'self'`) : aucun appel réseau externe, aucun script inline
  (`public/theme-init.js` est servi comme fichier statique `'self'`), validation
  des `data:` URLs à la restauration de sauvegarde.

Le service worker n'est actif que sur le build de production servi en HTTP(S) :
`npm run build && npm run serve`, puis coupe le réseau pour vérifier.

## Responsive et accessibilité

Conception mobile d'abord. Barre d'onglets en bas sous 900 px, rail latéral
au-delà ; **zones tactiles de 44 px minimum** sur tous les boutons (y compris les
boutons compacts), un seul `<h1>` visible, contour de focus clavier visible,
respect du réglage système « réduire les animations », réglage dédié pour couper
les **vibrations** dans Réglages, et marges de sécurité (encoches) prises en
compte. Trois thèmes : **Grimoire** (sombre), **Parchemin** (clair, contraste
vérifié >= 4,5:1) et **Omni-système** (sombre, aux couleurs violettes du logo de
l'Omni-Système).

## Vérifications effectuées

- `npm test` (`scripts/test-core.mjs`) : tests unitaires sur l'analyse
  d'expressions, les bornes de tirage, `kh`/`kl`, les modificateurs (y compris
  champs vides/`null`), la détection des critiques, le rendu markdown (liens avec
  `__`, neutralisation du HTML et des liens `javascript:`), la sauvegarde différée
  des éditeurs, la date locale de `createJournalEntry()` et l'affichage des dates
  quel que soit le fuseau horaire, la ligne de jet insérée dans le journal, le
  rejet des URL `https://` à l'import de sauvegarde, la regex PV de `CombatView`
  (qui ignore `Survie`), et la duplication / l'import de fiches.
- `node tests/smoke.mjs` : vérifications Playwright automatisées sur `dist/`
  servi sous `/omni-grimoire/` en viewport mobile `390×844` (0 erreur console,
  0 `pageerror`, 0 violation CSP, 0 requête externe, un seul `<h1>` visible, pas
  de débordement horizontal, Service Worker actif et rechargement hors ligne,
  accès hors ligne à `licences-tierces.txt`, contraste du bouton primaire en
  thème Parchemin >= 4,5:1, présence du réglage « Vibrations » et du bloc
  « À propos » complet).

---

## Licence, auteur et contact

- **Auteur** : **Ferrus Dantioch** (application conçue et développée par Ferrus
  Dantioch, avec l'aide de l'intelligence artificielle)
- **Contact officiel** : **`omni-systeme.choking513@passmail.net`**
- **Licence** : **© 2026 Ferrus Dantioch — Creative Commons Attribution - Pas
  d'Utilisation Commerciale - Pas de Modification 4.0 International (`CC BY-NC-ND 4.0`)**
  ([résumé de la licence en français](https://creativecommons.org/licenses/by-nc-nd/4.0/deed.fr))

En français, cette licence signifie que :
- tu es autorisé à partager et copier l'application à l'identique, à condition de
  citer son auteur (**Ferrus Dantioch**) ;
- toute utilisation commerciale est interdite ;
- toute modification, transformation ou œuvre dérivée est interdite sans
  autorisation préalable.

Le logiciel est fourni « en l'état », sans aucune garantie. Texte complet dans
le fichier [LICENSE](LICENSE) : le texte officiel en anglais, suivi de la
traduction française officielle publiée par Creative Commons.

Les bibliothèques tierces embarquées dans l'application restent soumises à leurs
propres licences. Leurs textes de licence sont rassemblés dans
[`public/licences-tierces.txt`](public/licences-tierces.txt), précaché pour le
hors-ligne, lié dans « À propos » et régénéré automatiquement avant chaque build
(`npm run licences`, script `scripts/licences-tierces.mjs`).
