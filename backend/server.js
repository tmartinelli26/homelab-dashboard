import express from 'express';
import db from './db.js';
import { lireEtat } from './homeassistant.js';
import { fileURLToPath } from 'node:url';

const app = express();
app.use(express.json());

app.get('/api/projets', (req, res) => {
  const projets = db
    .prepare('SELECT * FROM projets ORDER BY priorite, derniere_activite DESC')
    .all();
  res.json(projets);
});

app.post('/api/projets', (req, res) => {
  const {
    nom,
    statut = 'actif',
    prochaine_etape = null,
    priorite = 2,
    categorie = null,
  } = req.body ?? {};

  if (!nom) {
    return res.status(400).json({ erreur: 'Le nom est obligatoire' });
  }

  try {
    const info = db
      .prepare(`INSERT INTO projets (nom, statut, prochaine_etape, priorite, categorie)
                VALUES (?, ?, ?, ?, ?)`)
      .run(nom, statut, prochaine_etape, priorite, categorie);

    const projet = db
      .prepare('SELECT * FROM projets WHERE id = ?')
      .get(info.lastInsertRowid);

    res.status(201).json(projet);
  } catch (err) {
    res.status(400).json({ erreur: err.message });
  }
});

const CHAMPS_MODIFIABLES = ['nom', 'statut', 'prochaine_etape', 'priorite', 'categorie'];

app.patch('/api/projets/:id', (req, res) => {
  const champs = Object.keys(req.body ?? {})
    .filter((champ) => CHAMPS_MODIFIABLES.includes(champ));

  if (champs.length === 0) {
    return res.status(400).json({ erreur: 'Aucun champ à modifier' });
  }

  const set = champs.map((champ) => `${champ} = ?`).join(', ');
  const valeurs = champs.map((champ) => req.body[champ]);

  try {
    const info = db
      .prepare(`UPDATE projets
                SET ${set}, derniere_activite = datetime('now')
                WHERE id = ?`)
      .run(...valeurs, req.params.id);

    if (info.changes === 0) {
      return res.status(404).json({ erreur: 'Projet introuvable' });
    }

    const projet = db
      .prepare('SELECT * FROM projets WHERE id = ?')
      .get(req.params.id);

    res.json(projet);
  } catch (err) {
    res.status(400).json({ erreur: err.message });
  }
});

app.delete('/api/projets/:id', (req, res) => {
  const info = db
    .prepare('DELETE FROM projets WHERE id = ?')
    .run(req.params.id);

  if (info.changes === 0) {
    return res.status(404).json({ erreur: 'Projet introuvable' });
  }

  res.status(204).end();
});

const CAPTEURS = {
  pas: 'sensor.pas_du_jour',
  fc: 'sensor.frequence_cardiaque',
  temperature: 'sensor.station_meteo_temperature',
  pression: 'sensor.station_meteo_pression',
  humidite: 'sensor.station_meteo_humidite',
};

app.get('/api/homelab', async (req, res) => {
  const entrees = await Promise.all(
    Object.entries(CAPTEURS).map(async ([cle, entityId]) => {
      try {
        const etat = await lireEtat(entityId);
        return [cle, {
          valeur: etat.state,
          unite: etat.attributes.unit_of_measurement ?? null,
          maj: etat.last_updated,
        }];
      } catch (err) {
        console.error(`Capteur ${cle} :`, err.message);
	return [cle, null];
      }
    })
  );

  res.json(Object.fromEntries(entrees));
});

const dossierFront = process.env.FRONT_DIR
  ?? fileURLToPath(new URL('../frontend/dist', import.meta.url));

app.use(express.static(dossierFront));

app.get('/{*chemin}', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ erreur: 'Route inconnue' });
  }
  res.sendFile('index.html', { root: dossierFront });
});

app.listen(3000, () => console.log('API sur http://localhost:3000'));
