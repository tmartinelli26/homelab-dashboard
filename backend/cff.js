// cff.js — Prochains trains Montreux → Lausanne
// Source : transport.opendata.ch (données : opentransportdata.swiss)

const API_URL = 'https://transport.opendata.ch/v1/connections';
const DEPART = '8501300';          // Montreux
const ARRIVEE = '8501120';         // Lausanne
const NB_TRAINS = 4;
const DUREE_CACHE_MS = 60_000;
const TIMEOUT_MS = 5_000;
const SEUIL_RETARD_MIN = 3;

let cache = { donnees: null, expireLe: 0 };
let requeteEnCours = null;

const enIso = (timestamp) => (timestamp ? new Date(timestamp * 1000).toISOString() : null);

function normaliserTrajet(c) {
  const depart = c.from;
  const journey = c.sections?.find((s) => s.journey)?.journey;

  const retard = depart.delay;
  const voiePrevue = depart.platform || null;
  const voieReelle = depart.prognosis?.platform || voiePrevue;

  if (depart.realtimeAvailability !== null && depart.realtimeAvailability !== undefined) {
    console.log('[cff] realtimeAvailability :', depart.realtimeAvailability, journey?.name);
  }

  let statut = 'a_l_heure';
  if (retard !== null && retard >= SEUIL_RETARD_MIN) statut = 'retard';
  // TODO : statut 'annule' quand on saura comment l'API le signale

  return {
    train: journey ? `${journey.category} ${journey.number}` : (c.products?.[0] ?? '?'),
    destination: journey?.to ?? null,
    depart_prevu: enIso(depart.departureTimestamp),
    depart_reel: retard !== null ? enIso(depart.departureTimestamp + retard * 60) : null,
    arrivee_prevue: enIso(c.to?.arrivalTimestamp),
    retard_min: retard,
    voie: voieReelle,
    changement_voie: voieReelle !== voiePrevue,
    correspondances: c.transfers ?? 0,
    temps_reel: retard !== null,
    statut,
  };
}

async function appelerApi() {
  const params = new URLSearchParams({ from: DEPART, to: ARRIVEE, limit: String(NB_TRAINS) });
  params.append('transportations[]', 'train');

  const reponse = await fetch(`${API_URL}?${params}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!reponse.ok) throw new Error(`API CFF : HTTP ${reponse.status}`);

  const json = await reponse.json();
  return (json.connections ?? []).map(normaliserTrajet);
}

const estAVenir = (t) => new Date(t.depart_reel ?? t.depart_prevu).getTime() > Date.now();

export async function lireTrains() {
  if (cache.donnees && Date.now() < cache.expireLe) {
    return { trains: cache.donnees.filter(estAVenir), perime: false };
  }

  if (!requeteEnCours) {
    requeteEnCours = appelerApi()
      .then((trains) => {
        cache = { donnees: trains, expireLe: Date.now() + DUREE_CACHE_MS };
        return trains;
      })
      .finally(() => {
        requeteEnCours = null;
      });
  }

  try {
    const trains = await requeteEnCours;
    return { trains: trains.filter(estAVenir), perime: false };
  } catch (err) {
    console.error('[cff]', err.message);

    if (cache.donnees) return { trains: cache.donnees.filter(estAVenir), perime: true };
    return { trains: null, perime: false };
  }
}