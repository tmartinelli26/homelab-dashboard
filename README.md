# Home lab & Dashboard « 2e cerveau »

Documentation du home lab de la chambre : serveur, Home Assistant, station météo, données de la montre et dashboard perso affiché en kiosque.

> ⚠️ Aucun secret dans ce document (clés, jetons, mots de passe). Ils vivent uniquement dans `secrets.yaml` (HA) et `backend/.env` (dashboard).

---

## 1. Vue d'ensemble

### Architecture en 3 couches

```
SOURCES                        COLLECTEUR              AFFICHAGE
─────────                      ──────────              ─────────
Station météo (ESP32) ──pull──▶                        ┌─ /       écran kiosque
Montre Hama ─▶ Santé ─▶ ─push─▶  Home Assistant ──────▶│  Dashboard (Node + Vue)
  Raccourci iOS (webhook)          (entités)           └─ /admin  téléphone / laptop
Projets ─────────────────────────────────────────────▶   SQLite (dashboard.db)
```

- **Home Assistant** est le collecteur unique pour les capteurs : tout devient une entité.
- **Le dashboard** a son propre backend (BFF) qui lit HA et gère les projets dans SQLite.
- Le navigateur ne parle **qu'au backend** du dashboard, jamais directement à HA (le jeton reste côté serveur).

### Adresses

| Service | URL | Rôle |
|---|---|---|
| Home Assistant | `http://ip_local:8123` | Collecteur, config |
| ESPHome | `http://ip_local:6052` | Firmware des ESP |
| Dashboard | `http://ip_local:3000` | Affichage (kiosque) |
| Dashboard admin | `http://ip_local:3000/admin` | Gestion des projets |
| Station météo | `ip_local` | ESP32-C3 + BME680 |

---

## 2. Le serveur

- **Matériel** : vieux portable, Intel Celeron N4000, 8 Go de RAM.
- **OS** : Ubuntu 24.04 LTS, sans bureau (`systemctl set-default multi-user.target`), ~670 Mo de RAM au repos.
- **Couvercle fermé sans veille** : `HandleLidSwitch=ignore` dans `/etc/systemd/logind.conf`.
- **SSH** : par clé ed25519 uniquement, depuis le laptop (WSL). Fichier `/etc/ssh/sshd_config.d/00-securite.conf` :
  ```
  PasswordAuthentication no
  PermitRootLogin no
  ```
- **IP** : ip_local. ⚠️ Réservation DHCP dans la box encore à faire (serveur **et** ESP).
- **Outils** : `tmux` pour les longues opérations, Node 22 (pour le dev), `sqlite3`, `nmap` (sur le laptop).

### Réseau WiFi

- **Le serveur est connecté à l'extendeur `TP-Link_E25E`** (2,4 GHz), comme tous les appareils de la chambre (téléphone, laptop, lumières, ESP).
- La box `Sunrise_9112589` est gardée **en secours**.
- ⚠️ **Un appareil connecté à la box ne joint pas un appareil connecté à l'extendeur** (et inversement). Pour joindre le serveur, il faut être sur `TP-Link_E25E`.

Connexions NetworkManager (`nmcli -f NAME,AUTOCONNECT,AUTOCONNECT-PRIORITY connection show`) :

| Connexion | Autoconnexion | Priorité |
|---|---|---|
| `TP-Link_E25E` | oui | 100 |
| `Sunrise_9112589` | oui | 50 (secours) |
| Tous les autres WiFi enregistrés | non | — |

- Économie d'énergie WiFi désactivée : `802-11-wireless.powersave 2` sur les deux connexions.
- **Carte Realtek RTL8821CE** (`rtw88_8821ce`), qui s'endormait et ne répondait plus aux connexions entrantes. Correctif dans `/etc/modprobe.d/rtw88.conf` :
  ```
  options rtw88_core disable_lps_deep=y
  options rtw88_pci disable_aspm=y
  ```
  Vérification : `cat /sys/module/rtw88_core/parameters/disable_lps_deep` et `cat /sys/module/rtw88_pci/parameters/disable_aspm` doivent afficher `Y`.
- Ajouter un réseau WiFi sans laisser le mot de passe dans l'historique (zsh) :
  ```zsh
  read -s "MDP?Mot de passe : "; echo
  sudo nmcli connection modify "NOM" wifi-sec.psk "$MDP"
  unset MDP
  ```
- Si la carte pose encore problème : une carte Intel AX200/AX210 en remplacement, une clé USB MediaTek, ou des adaptateurs CPL.

### Retrouver le serveur sur le réseau

Depuis WSL :
```bash
nmap -p 22 --open 192.168.1.0/24   # appareils avec SSH ouvert
nmap -sn 192.168.1.0/24            # tous les appareils allumés
```
Le `192.168.1.222` est l'extendeur (SSH très ancien, ce n'est pas le serveur). Si WSL n'arrive à rien après un changement de WiFi : `wsl --shutdown` dans PowerShell. Test depuis Windows : `Test-NetConnection 192.168.1.237 -Port 22`.

---

## 3. Services Docker Compose

Fichier : `~/homelab/docker-compose.yml`

```yaml
services:
  homeassistant:
    image: ghcr.io/home-assistant/home-assistant:stable
    network_mode: host
    # ...

  esphome:
    image: ghcr.io/esphome/esphome:stable
    network_mode: host
    # ...

  dashboard:
    build: ./dashboard
    container_name: dashboard
    network_mode: host
    env_file: ./dashboard/backend/.env
    volumes:
      - ./dashboard/data:/app/data
    user: "1000:1000"
    restart: unless-stopped
```

Pourquoi ces choix :
- **`network_mode: host` partout** : `localhost:8123` depuis le dashboard pointe bien vers HA.
- **`env_file`** : le jeton HA est lu au démarrage, jamais cuit dans l'image.
- **Volume `data`** : la base SQLite survit aux reconstructions de l'image.
- **`user: "1000:1000"`** : les fichiers de la base appartiennent à `tom`, pas à `root`.
- **`restart: unless-stopped`** : redémarre seul après un crash ou un reboot.

### Commandes utiles

```bash
cd ~/homelab
docker compose ps                          # état des conteneurs
docker compose logs -f dashboard           # logs en direct
docker compose restart homeassistant       # redémarrer HA
docker compose up -d --build dashboard     # reconstruire et relancer le dashboard
docker compose stop dashboard              # arrêter (pour le dev)
```

### Home Assistant

- Comptes : admin + compte **« Écran »** sans droits admin (utilisé pour le jeton du dashboard, principe du moindre privilège).
- Vérifier la config avant un redémarrage : **Outils de développement → YAML → Vérifier la configuration**.

---

## 4. Kiosque sur l'écran du serveur

- **Autologin sur tty1** : surcharge de `getty@tty1` avec `--autologin tom`.
- **`~/.zprofile`** :
  ```zsh
  if [[ "$(tty)" == /dev/tty1 ]]; then
    until curl -s -o /dev/null http://localhost:3000; do
      sleep 2
    done
    exec cage -- firefox --kiosk http://localhost:3000 > ~/kiosk.log 2>&1
  fi
  ```
  La boucle `until` attend que le dashboard réponde : au boot, Firefox peut démarrer avant le conteneur et resterait bloqué sur une page d'erreur.
- **Firefox** installé en `.deb` depuis le dépôt Mozilla, avec pinning (le snap ne marche pas sous `cage`).
- **Navigation** : `Ctrl+Alt+F2` pour un terminal, `Ctrl+Alt+F1` pour revenir au dashboard.
- **Relancer le kiosque** (après une mise à jour du front) :
  ```bash
  sudo systemctl restart getty@tty1
  ```

---

## 5. Station météo

### Matériel

- ESP32-C3 Super Mini + capteur BME680 (I2C, adresse `0x77`).
- Câblage : VCC → 3V3, GND → GND, SDA → GPIO21, SCL → GPIO20.

### Config ESPHome `station-meteo`

- Framework `esp-idf`, `web_server`.
- `i2c` : sda GPIO21, scl GPIO20, `scan: true`.
- `bme680` : température, humidité, pression, résistance gaz, `update_interval: 10s` (pour les tests, à augmenter ensuite).
- WiFi : plusieurs réseaux dans `networks` (box Sunrise, extendeur TP-Link, partage iPhone), secrets dans `secrets.yaml`. La box est trop loin (-88 dB), l'ESP passe par l'extendeur.
- **`output_power: 8.5dB` — à garder.** Corrige le défaut d'antenne connu de la Super Mini (« Auth Expired » en boucle).
- Mises à jour par WiFi (OTA).

### État

- ✅ Pression (~977 hPa) et température cohérentes.
- ❌ Humidité bloquée à 100 % et gaz invalide (« Heater unstable »). Cause probable : soudure froide, ou élément d'humidité abîmé par la chaleur du fer. **À ressouder avec le nouveau fer.**

### Dépannage : `Errno 113` dans les logs HA

`Can't connect to ESPHome API ... [Errno 113]` = « No route to host », l'ESP est injoignable.
1. ESP débranché ?
2. WiFi perdu (antenne faible, extendeur) ?
3. IP changée → d'où l'intérêt de la réservation DHCP.

```bash
ping -c 3 192.168.1.134
```

---

## 6. Données de la montre

### La chaîne

```
Montre Hama Fit Move ─BLE─▶ app Hama FIT Move ─▶ app Santé (iPhone)
   ─▶ Raccourci iOS « Envoyer santé » ─POST─▶ webhook Home Assistant
```

Concept : **push** au lieu de pull. HA ne peut pas lire l'iPhone, c'est l'iPhone qui envoie.

### Côté Home Assistant

`secrets.yaml` :
```yaml
webhook_montre: "<chaîne aléatoire générée avec : openssl rand -hex 16>"
```

`configuration.yaml` :
```yaml
template:
  - triggers:
      - trigger: webhook
        webhook_id: !secret webhook_montre
        allowed_methods: [POST]
        local_only: true
    sensor:
      - name: "Pas du jour"
        unique_id: montre_pas_du_jour
        state: "{{ trigger.json.pas | int(0) }}"
        unit_of_measurement: "pas"
        state_class: total_increasing
        icon: mdi:walk
      - name: "Fréquence cardiaque"
        unique_id: montre_frequence_cardiaque
        state: "{{ trigger.json.fc | int(0) }}"
        unit_of_measurement: "bpm"
        state_class: measurement
        icon: mdi:heart-pulse
```

- L'identifiant du webhook **est** le mot de passe : long, aléatoire, dans `secrets.yaml`.
- `local_only: true` : accepté uniquement depuis le réseau local (iPhone sur le WiFi de la maison).
- Les capteurs à déclenchement gardent leur dernière valeur, même après un redémarrage.

### Tester sans l'iPhone

```bash
curl -i -X POST -H "Content-Type: application/json" \
  -d '{"pas": 1234, "fc": 70}' \
  http://192.168.1.237:8123/api/webhook/<ID>
```

⚠️ HA répond **200 même si le webhook n'existe pas**. Le vrai test : **Outils de développement → États → `sensor.pas_du_jour`**. Si `unknown`, vérifier l'ID :

```bash
docker logs homeassistant 2>&1 | grep -i "unregistered webhook"
```

### Le Raccourci iOS « Envoyer santé »

1. **Rechercher des échantillons de santé** : Type = Pas, Date de début = Aujourd'hui (filtre Source = Hama FIT Move si le total est doublé par les pas de l'iPhone).
2. **Calculer des statistiques** : Somme.
3. **Rechercher des échantillons de santé** : Type = Fréquence cardiaque, tri par date de début, plus récent d'abord, limite 1.
4. **Obtenir le contenu de l'URL** :
   - URL : `http://192.168.1.237:8123/api/webhook/<ID>`
   - Méthode POST, corps JSON
   - Champ Nombre `pas` = variable Statistiques
   - Champ Nombre `fc` = variable Échantillons de santé (FC) → propriété **Valeur**

**Automatisations** (onglet Automatisation → Heure de la journée → Exécuter immédiatement, notification désactivée) : 12:00, 18:00, 22:00.

Pièges :
- iPhone verrouillé → iOS peut bloquer la lecture de Santé.
- L'app Hama doit avoir synchronisé vers Santé. Si les pas restent figés, ajouter « Ouvrir l'app Hama FIT Move » + délai au début du raccourci.

---

## 7. Le dashboard

### Structure

```
~/homelab/dashboard/
├── Dockerfile
├── .dockerignore
├── data/                    # volume : dashboard.db (à sauvegarder)
├── backend/
│   ├── .env                 # HA_URL, HA_TOKEN (chmod 600, jamais sur Git)
│   ├── package.json         # "type": "module" ; express, better-sqlite3
│   ├── schema.sql
│   ├── db.js                # connexion SQLite
│   ├── homeassistant.js     # lecture des états HA
│   └── server.js            # routes API + service du front
└── frontend/                # Vue 3 + Vite + Vue Router
    ├── vite.config.js       # proxy /api en dev
    └── src/
        ├── main.js
        ├── App.vue          # <RouterView /> + variables CSS globales
        ├── router/index.js  # / et /admin
        └── views/
            ├── AffichageView.vue
            └── AdminView.vue
```

### Base de données : `schema.sql`

```sql
CREATE TABLE IF NOT EXISTS projets (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  nom               TEXT    NOT NULL UNIQUE,
  statut            TEXT    NOT NULL DEFAULT 'actif'
                    CHECK (statut IN ('idee', 'actif', 'en_pause', 'termine')),
  prochaine_etape   TEXT,
  priorite          INTEGER NOT NULL DEFAULT 2
                    CHECK (priorite BETWEEN 1 AND 3),
  categorie         TEXT,
  derniere_activite TEXT    NOT NULL DEFAULT (datetime('now')),
  cree_le           TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

- Dates stockées en texte ISO, **en UTC** (conversion en heure locale dans le front).
- `CHECK` : la base refuse elle-même les valeurs invalides.
- Valeurs techniques en base (`en_pause`), libellés dans le front (« En pause »).
- `IF NOT EXISTS` : appliqué à chaque démarrage sans risque.

Console :
```bash
sqlite3 ~/homelab/dashboard/data/dashboard.db
.tables
SELECT * FROM projets;
.quit
```

### API

| Méthode | Route | Rôle | Codes |
|---|---|---|---|
| GET | `/api/projets` | Liste triée (priorité, puis activité récente) | 200 |
| POST | `/api/projets` | Créer | 201, 400 |
| PATCH | `/api/projets/:id` | Modifier certains champs (met à jour `derniere_activite`) | 200, 400, 404 |
| DELETE | `/api/projets/:id` | Supprimer | 204, 404 |
| GET | `/api/homelab` | Valeurs des capteurs HA sélectionnés | 200 |

Principes de sécurité :
- **Requêtes préparées** (`?`) partout → pas d'injection SQL.
- **Liste blanche** des champs modifiables en `PATCH` (`nom`, `statut`, `prochaine_etape`, `priorite`, `categorie`) : les noms de colonnes ne viennent jamais du client.
- **Liste blanche** des capteurs exposés (`CAPTEURS` dans `server.js`) : on n'expose pas tout HA.
- Un capteur en erreur renvoie `null` (et est loggé avec `console.error`) sans faire tomber les autres.
- Jeton HA créé sur le compte **Écran** (non admin), stocké dans `.env`.

Capteurs exposés (`server.js`) :
```js
const CAPTEURS = {
  pas: 'sensor.pas_du_jour',
  fc: 'sensor.frequence_cardiaque',
  temperature: 'sensor.station_meteo_temperature',
  pression: 'sensor.station_meteo_pressure',
  humidite: '...',
};
```
(Adapter les `entity_id` à ceux visibles dans **Outils de développement → États**.)

Tester l'API :
```bash
curl http://192.168.1.237:3000/api/projets
curl http://192.168.1.237:3000/api/homelab
curl -i -X PATCH -H "Content-Type: application/json" \
  -d '{"statut": "en_pause"}' http://192.168.1.237:3000/api/projets/2
```

### Service du front et fallback SPA

En prod, Express sert le front compilé (`frontend/dist`). Toute route qui n'est ni `/api` ni un fichier existant renvoie `index.html` pour que Vue Router gère `/admin` (même après un rafraîchissement). Une route `/api` inconnue renvoie un 404 JSON. Le fallback est déclaré **en dernier**.

### Front

- **`/` (Affichage)** : heure et date, cartes capteurs (couleur par capteur, barre de progression vers 10 000 pas), projets non terminés avec statut, prochaine étape, catégorie et dernière activité. Un projet inactif depuis plus de 14 jours est atténué. Rafraîchissement des données toutes les 30 s, horloge toutes les 10 s. Tailles en `vh` pour remplir l'écran.
- **`/admin`** : formulaire d'ajout, liste avec modification (via un **brouillon** copié, annulable) et suppression (avec confirmation). Champs vides convertis en `null`. Champs en `16px` pour éviter le zoom auto sur iPhone.
- Astuce iPhone : Safari → Partager → **Sur l'écran d'accueil** pour avoir l'admin comme une app.

### Docker : build multi-stage

```dockerfile
# Étape 1 : compiler le front
FROM node:22-slim AS front
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Étape 2 : dépendances du backend (avec outils de compilation pour better-sqlite3)
FROM node:22-slim AS back
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev

# Étape 3 : image finale, sans les outils
FROM node:22-slim
WORKDIR /app/backend
COPY --from=back /app/backend/node_modules ./node_modules
COPY backend/ ./
COPY --from=front /app/frontend/dist /app/frontend/dist
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
```

`.dockerignore` :
```
**/node_modules
**/dist
backend/.env
data
```

Les chemins par défaut de `db.js` (`../data`) et du front (`../frontend/dist`) sont calculés depuis l'emplacement des fichiers (`import.meta.url`), ce qui tombe juste dans l'image (`/app/data`, `/app/frontend/dist`). Variables optionnelles : `DB_PATH`, `FRONT_DIR`.

---

## 8. Workflow de développement

1. Arrêter le conteneur : `docker compose stop dashboard` (libère le port 3000).
2. Backend :
   ```bash
   cd ~/homelab/dashboard/backend
   node --watch --env-file=.env server.js
   ```
3. Front (autre terminal tmux) :
   ```bash
   cd ~/homelab/dashboard/frontend
   npm run dev
   ```
   → `http://192.168.1.237:5173` (le proxy Vite envoie `/api` vers le port 3000).
4. Mise en prod :
   ```bash
   cd ~/homelab && docker compose up -d --build dashboard
   sudo systemctl restart getty@tty1
   ```

Conseils :
- VS Code + **Remote - SSH** pour éditer confortablement.
- Pour coller un long fichier en SSH, utiliser `cat > fichier << 'EOF' … EOF` plutôt que nano (évite les collages tronqués).
- Après une modification, rien ne change à l'écran tant que l'image n'est pas reconstruite.

---

## 9. Dépannage rapide

| Symptôme | Cause probable | Action |
|---|---|---|
| Capteur montre `unknown` | Webhook jamais déclenché | Vérifier l'ID dans l'URL, `grep "unregistered webhook"` |
| `null` partout dans `/api/homelab` | Backend n'arrive pas à joindre HA | Lire les `console.error` dans les logs |
| `lireEtat is not defined` | Import manquant | `import { lireEtat } from './homeassistant.js'` |
| `no such table: projets` | Schéma non appliqué / mauvais fichier ouvert | `.databases`, vérifier le chemin |
| `Identifier ... already been declared` | Code collé deux fois | Supprimer le doublon |
| `Element is missing end tag` | Fichier `.vue` tronqué ou balise non fermée | `tail -5 fichier`, recoller avec `cat << 'EOF'` |
| `npm ci` échoue dans Docker | better-sqlite3 à compiler sans outils | Étape `back` avec python3/make/g++ |
| Kiosque bloqué sur page d'erreur au boot | Firefox lancé avant le conteneur | Boucle `until curl` dans `.zprofile` |
| `Errno 113` station météo | ESP injoignable | `ping`, dashboard ESPHome, réservation DHCP |
| SSH `No route to host` | Laptop et serveur pas sur la même borne (box vs extendeur) | Connecter le laptop à `TP-Link_E25E`, `nmap` pour retrouver le serveur |
| Serveur injoignable mais dashboard OK à l'écran | Carte WiFi endormie ou décrochée | Vérifier le correctif rtw88 et le `powersave` |

---

## 10. Maintenance

- **Sauvegarde** : copier `~/homelab/dashboard/data/` (ex. `scp` vers le laptop).
- **Git** : `git init` dans `~/homelab/dashboard` avec un `.gitignore` :
  ```
  node_modules
  dist
  data
  backend/.env
  ```
- Ne **jamais** exposer le dashboard sur Internet en l'état (pas d'authentification sur `/admin`).

---

## 11. À faire

- [ ] Ressouder le BME680 (humidité et gaz).
- [ ] Passer l'`update_interval` du BME680 de 10 s à une valeur normale.
- [ ] Confirmer les réservations DHCP (serveur et ESP).
- [x] Régler la carte WiFi (correctif rtw88 + serveur sur l'extendeur).
- [ ] Régler le pont box ↔ extendeur (firmware TP-Link, isolation des clients) ou passer au CPL / mesh.
- [ ] Vérifier l'historique de `sensor.pas_du_jour` (les envois de 12h/18h/22h arrivent-ils ?).
- [ ] Ajouter l'admin sur l'écran d'accueil de l'iPhone.
- [ ] Code PIN sur `/admin`.
- [ ] Composant réutilisable `FormulaireProjet.vue` (props / emits).
- [ ] Temps réel via le WebSocket de HA à la place du polling.
- [ ] Ajouter d'autres données : sommeil, électricité, conso de tokens.
- [ ] Rubans LED et lampe connectée.
- [ ] LLM local / lien avec Jarvis.
