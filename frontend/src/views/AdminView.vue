<script setup>
import { ref, onMounted } from 'vue'

const STATUTS = {
  idee: 'Idée',
  actif: 'Actif',
  en_pause: 'En pause',
  termine: 'Terminé',
}

const projets = ref([])
const erreur = ref('')
const nouveau = ref(formulaireVide())
const enEdition = ref(null)
const brouillon = ref({})

function formulaireVide() {
  return { nom: '', statut: 'actif', prochaine_etape: '', priorite: 2, categorie: '' }
}

async function charger() {
  const rep = await fetch('/api/projets')
  projets.value = await rep.json()
}

async function ajouter() {
  erreur.value = ''

  const donnees = {
    ...nouveau.value,
    prochaine_etape: nouveau.value.prochaine_etape || null,
    categorie: nouveau.value.categorie || null,
  }

  const rep = await fetch('/api/projets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(donnees),
  })

  if (!rep.ok) {
    erreur.value = (await rep.json()).erreur
    return
  }

  nouveau.value = formulaireVide()
  await charger()
}

function editer(projet) {
  enEdition.value = projet.id
  brouillon.value = {
    ...projet,
    prochaine_etape: projet.prochaine_etape ?? '',
    categorie: projet.categorie ?? '',
  }
}

function annuler() {
  enEdition.value = null
}

async function enregistrer() {
  erreur.value = ''
  const { nom, statut, prochaine_etape, priorite, categorie } = brouillon.value

  const rep = await fetch(`/api/projets/${enEdition.value}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nom,
      statut,
      prochaine_etape: prochaine_etape || null,
      priorite,
      categorie: categorie || null,
    }),
  })

  if (!rep.ok) {
    erreur.value = (await rep.json()).erreur
    return
  }

  enEdition.value = null
  await charger()
}

async function supprimer(projet) {
  if (!confirm(`Supprimer « ${projet.nom} » ?`)) return

  const rep = await fetch(`/api/projets/${projet.id}`, { method: 'DELETE' })

  if (!rep.ok) {
    erreur.value = 'Suppression impossible'
    return
  }

  await charger()
}

onMounted(charger)
</script>

<template>
  <h1>Admin</h1>

  <h2>Nouveau projet</h2>
  <form @submit.prevent="ajouter">
    <input v-model="nouveau.nom" placeholder="Nom" required />

    <select v-model="nouveau.statut">
      <option v-for="(libelle, valeur) in STATUTS" :key="valeur" :value="valeur">
        {{ libelle }}
      </option>
    </select>

    <input v-model="nouveau.prochaine_etape" placeholder="Prochaine étape" />

    <select v-model.number="nouveau.priorite">
      <option :value="1">Priorité 1</option>
      <option :value="2">Priorité 2</option>
      <option :value="3">Priorité 3</option>
    </select>

    <input v-model="nouveau.categorie" placeholder="Catégorie (perso, freelance…)" />

    <button type="submit">Ajouter</button>
  </form>

  <p v-if="erreur" style="color: red">{{ erreur }}</p>

  <h2>Mes projets</h2>
  <ul>
    <li v-for="projet in projets" :key="projet.id">
      <form v-if="enEdition === projet.id" @submit.prevent="enregistrer">
        <input v-model="brouillon.nom" required />

        <select v-model="brouillon.statut">
          <option v-for="(libelle, valeur) in STATUTS" :key="valeur" :value="valeur">
            {{ libelle }}
          </option>
        </select>

        <input v-model="brouillon.prochaine_etape" placeholder="Prochaine étape" />

        <select v-model.number="brouillon.priorite">
          <option :value="1">Priorité 1</option>
          <option :value="2">Priorité 2</option>
          <option :value="3">Priorité 3</option>
        </select>

        <input v-model="brouillon.categorie" placeholder="Catégorie" />

        <button type="submit">Enregistrer</button>
        <button type="button" @click="annuler">Annuler</button>
      </form>

      <div v-else>
        <strong>{{ projet.nom }}</strong> ({{ STATUTS[projet.statut] }}) :
        {{ projet.prochaine_etape ?? 'pas de prochaine étape' }}
        <button @click="editer(projet)">Modifier</button>
        <button @click="supprimer(projet)">Supprimer</button>
      </div>
    </li>
  </ul>
</template>

<style scoped>
.admin { max-width: 640px; margin: 0 auto; padding: 1.25rem; }
h1 { font-size: 1.75rem; margin-bottom: 1rem; }
h2 { font-size: 0.85rem; color: var(--doux); text-transform: uppercase; letter-spacing: 0.06em; margin: 1.75rem 0 0.75rem; }

form { display: flex; flex-direction: column; gap: 0.6rem; }
input, select, button {
  font: inherit;
  font-size: 16px;
  width: 100%;
  padding: 0.7rem 0.9rem;
  border-radius: 10px;
  border: 1px solid var(--bord);
  background: var(--carte);
  color: var(--texte);
}
button { background: var(--accent); color: var(--fond); font-weight: 600; border: none; cursor: pointer; }
button[type="button"] { background: var(--bord); color: var(--texte); }

ul { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 0.75rem; }
li { background: var(--carte); border: 1px solid var(--bord); border-radius: 14px; padding: 1rem; }
li > div button { width: auto; margin: 0.6rem 0.5rem 0 0; padding: 0.45rem 0.9rem; font-size: 0.9rem; }
li > div button:last-child { background: transparent; color: var(--rouge); border: 1px solid var(--rouge); }
</style>