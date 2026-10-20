<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const CAPTEURS = {
  temperature: { libelle: 'Température', icone: '🌡️', couleur: '#ff9e64' },
  humidite: { libelle: 'Humidité', icone: '💧', couleur: '#7dcfff' },
  pression: { libelle: 'Pression', icone: '🧭', couleur: '#bb9af7' },
  pas: { libelle: 'Pas du jour', icone: '👟', couleur: '#9ece6a' },
  fc: { libelle: 'Cardio', icone: '❤️', couleur: '#f7768e' },
}

const STATUTS = { idee: 'Idée', actif: 'Actif', en_pause: 'En pause', termine: 'Terminé' }
const OBJECTIF_PAS = 10000

const projets = ref([])
const homelab = ref({})
const maintenant = ref(new Date())
let minuteurDonnees = null
let minuteurHorloge = null

const projetsVisibles = computed(() =>
  projets.value.filter((p) => p.statut !== 'termine')
)

const nbActifs = computed(() =>
  projets.value.filter((p) => p.statut === 'actif').length
)

const progressionPas = computed(() => {
  const pas = Number(homelab.value.pas?.valeur)
  if (Number.isNaN(pas)) return 0
  return Math.min(100, (pas / OBJECTIF_PAS) * 100)
})

const heure = computed(() =>
  maintenant.value.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })
)
const date = computed(() =>
  maintenant.value.toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' })
)

function formaterValeur(capteur) {
  if (!capteur) return '—'
  const nombre = Number(capteur.valeur)
  if (Number.isNaN(nombre)) return '—'
  return nombre.toLocaleString('fr-CH', { maximumFractionDigits: 1 })
}

function joursDepuis(dateSql) {
  const d = new Date(dateSql.replace(' ', 'T') + 'Z')
  return Math.floor((maintenant.value - d) / 86400000)
}

function activite(projet) {
  const j = joursDepuis(projet.derniere_activite)
  if (j <= 0) return "aujourd'hui"
  if (j === 1) return 'hier'
  return `il y a ${j} jours`
}

async function charger() {
  try {
    const [repProjets, repHomelab] = await Promise.all([
      fetch('/api/projets'),
      fetch('/api/homelab'),
    ])
    projets.value = await repProjets.json()
    homelab.value = await repHomelab.json()
  } catch (err) {
    console.error('Chargement impossible :', err)
  }
}

onMounted(() => {
  charger()
  minuteurDonnees = setInterval(charger, 30000)
  minuteurHorloge = setInterval(() => (maintenant.value = new Date()), 10000)
})

onUnmounted(() => {
  clearInterval(minuteurDonnees)
  clearInterval(minuteurHorloge)
})
</script>

<template>
  <main class="dashboard">
    <header class="entete">
      <div>
        <div class="heure">{{ heure }}</div>
        <div class="date">{{ date }}</div>
      </div>
      <div class="resume">
        <span class="resume-chiffre">{{ nbActifs }}</span>
        <span class="resume-texte">projets actifs</span>
      </div>
    </header>

    <section class="capteurs">
      <article
        v-for="(info, cle, i) in CAPTEURS"
        :key="cle"
        class="carte capteur"
        :class="[cle, { indispo: !homelab[cle] }]"
        :style="{ '--c': info.couleur, animationDelay: `${i * 80}ms` }"
      >
        <div class="capteur-haut">
          <span class="icone">{{ info.icone }}</span>
          <span class="libelle">{{ info.libelle }}</span>
        </div>
        <div>
          <span class="valeur">
            {{ formaterValeur(homelab[cle]) }}<small v-if="homelab[cle]?.unite">{{ homelab[cle].unite }}</small>
          </span>
          <div v-if="cle === 'pas'" class="barre">
            <span :style="{ width: `${progressionPas}%` }"></span>
          </div>
        </div>
      </article>
    </section>

    <section class="projets">
      <h2 class="titre-section">Projets en cours</h2>
      <ul>
        <li
          v-for="(projet, i) in projetsVisibles"
          :key="projet.id"
          class="carte projet"
          :class="[`p${projet.priorite}`, { dort: joursDepuis(projet.derniere_activite) > 14 }]"
          :style="{ animationDelay: `${300 + i * 80}ms` }"
        >
          <div class="ligne">
            <strong>{{ projet.nom }}</strong>
            <span class="badge" :class="projet.statut">{{ STATUTS[projet.statut] }}</span>
          </div>
          <p class="etape">{{ projet.prochaine_etape ?? 'Pas de prochaine étape' }}</p>
          <div class="meta">
            <span v-if="projet.categorie" class="chip">{{ projet.categorie }}</span>
            <span>{{ activite(projet) }}</span>
          </div>
        </li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
.dashboard {
  height: 100vh;
  padding: 4vh 3vw;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
  grid-template-rows: auto 1fr;
  gap: 3.5vh 2.5vw;
  overflow: hidden;
  background:
    radial-gradient(circle at 12% 8%, rgba(122, 162, 247, 0.22), transparent 40%),
    radial-gradient(circle at 88% 92%, rgba(187, 154, 247, 0.18), transparent 45%),
    radial-gradient(circle at 60% 40%, rgba(158, 206, 106, 0.06), transparent 50%),
    var(--fond);
}

/* En-tête */
.entete { grid-column: 1 / -1; display: flex; align-items: flex-end; justify-content: space-between; }
.heure {
  font-size: 15vh;
  font-weight: 800;
  line-height: 0.9;
  letter-spacing: -0.05em;
  font-variant-numeric: tabular-nums;
  background: linear-gradient(135deg, #ffffff 35%, var(--accent));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.date { font-size: 3.4vh; color: var(--doux); text-transform: capitalize; margin-top: 1.2vh; font-weight: 500; }
.resume { text-align: right; display: flex; flex-direction: column; }
.resume-chiffre { font-size: 9vh; font-weight: 800; line-height: 1; color: var(--accent); }
.resume-texte { font-size: 2vh; color: var(--doux); text-transform: uppercase; letter-spacing: 0.14em; font-weight: 600; }

/* Cartes */
.carte {
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.015));
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 28px;
  backdrop-filter: blur(14px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
  animation: apparition 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

/* Capteurs */
.capteurs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-rows: 1fr; gap: 2.2vh 1.4vw; min-height: 0; }
.capteur {
  padding: 2.6vh 1.6vw;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  position: relative;
  overflow: hidden;
}
.capteur::after {
  content: '';
  position: absolute;
  right: -25%;
  top: -40%;
  width: 75%;
  aspect-ratio: 1;
  background: radial-gradient(circle, var(--c), transparent 70%);
  opacity: 0.22;
  pointer-events: none;
}
.capteur:first-child { grid-column: span 2; }
.capteur-haut { display: flex; align-items: center; gap: 1vw; }
.icone {
  width: 6.5vh;
  height: 6.5vh;
  display: grid;
  place-items: center;
  font-size: 3.4vh;
  border-radius: 18px;
  background: color-mix(in srgb, var(--c) 20%, transparent);
  border: 1px solid color-mix(in srgb, var(--c) 35%, transparent);
}
.libelle { font-size: 2.1vh; color: var(--doux); text-transform: uppercase; letter-spacing: 0.14em; font-weight: 600; }
.valeur { font-size: 8.5vh; font-weight: 800; line-height: 1; letter-spacing: -0.04em; font-variant-numeric: tabular-nums; }
.capteur:first-child .valeur { font-size: 12vh; }
.valeur small { font-size: 0.36em; font-weight: 600; color: var(--c); margin-left: 0.3em; letter-spacing: 0; }

.barre { height: 1.1vh; border-radius: 999px; background: rgba(255, 255, 255, 0.08); overflow: hidden; margin-top: 1.4vh; }
.barre span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--c), color-mix(in srgb, var(--c) 40%, white));
  box-shadow: 0 0 14px var(--c);
  transition: width 1.2s ease;
}

.fc .icone { animation: battement 1.3s ease-in-out infinite; }
.indispo { opacity: 0.35; filter: grayscale(1); }

/* Projets */
.projets { display: flex; flex-direction: column; min-height: 0; }
.titre-section { font-size: 2.1vh; color: var(--doux); text-transform: uppercase; letter-spacing: 0.14em; font-weight: 600; margin-bottom: 1.8vh; }
.projets ul { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 1.8vh; overflow: hidden; }

.projet { padding: 2.4vh 1.8vw 2.4vh 2.2vw; position: relative; }
.projet::before {
  content: '';
  position: absolute;
  left: 0;
  top: 20%;
  bottom: 20%;
  width: 6px;
  border-radius: 0 6px 6px 0;
  background: var(--doux);
}
.projet.p1 { border-color: rgba(122, 162, 247, 0.4); }
.projet.p1::before { background: var(--accent); box-shadow: 0 0 18px var(--accent); }
.projet.p2::before { background: var(--violet); }
.dort { opacity: 0.45; }

.ligne { display: flex; justify-content: space-between; align-items: center; gap: 1vw; }
.ligne strong { font-size: 3.6vh; font-weight: 700; letter-spacing: -0.02em; }
.badge {
  font-size: 1.7vh;
  padding: 0.6vh 1vw;
  border-radius: 999px;
  font-weight: 600;
  white-space: nowrap;
  background: rgba(255, 255, 255, 0.08);
  color: var(--doux);
}
.badge.actif { background: rgba(158, 206, 106, 0.16); color: var(--vert); }
.badge.en_pause { background: rgba(224, 175, 104, 0.16); color: var(--orange); }
.badge.idee { background: rgba(187, 154, 247, 0.16); color: var(--violet); }

.etape { margin-top: 1.1vh; font-size: 2.6vh; opacity: 0.92; }
.etape::before { content: '→ '; color: var(--accent); font-weight: 700; }
.meta { margin-top: 1.4vh; display: flex; align-items: center; gap: 1.2vw; color: var(--doux); font-size: 1.9vh; }
.chip { padding: 0.4vh 0.8vw; border-radius: 8px; background: rgba(255, 255, 255, 0.06); }

/* Animations */
@keyframes apparition {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: none; }
}
@keyframes battement {
  0%, 100% { transform: scale(1); }
  15% { transform: scale(1.15); }
  30% { transform: scale(1); }
  45% { transform: scale(1.1); }
}
</style>