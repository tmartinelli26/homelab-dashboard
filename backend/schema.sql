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

