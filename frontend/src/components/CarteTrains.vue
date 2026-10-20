<script setup>
import { computed } from 'vue';

const props = defineProps({
  trains: { type: Array, default: null },
  perime: { type: Boolean, default: false },
  maintenant: { type: [Number, Date], required: true },
});

const formatHeure = (iso) =>
  new Date(iso).toLocaleTimeString('fr-CH', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Zurich',
  });

const lignes = computed(() => {
  const now = new Date(props.maintenant).getTime();

  return (props.trains ?? [])
    .map((t) => {
      const departEffectif = t.depart_reel ?? t.depart_prevu;
      const minutes = Math.floor((new Date(departEffectif).getTime() - now) / 60_000);

      let quand;
      if (minutes <= 0) quand = 'maintenant';
      else if (minutes < 60) quand = `dans ${minutes} min`;
      else quand = `à ${formatHeure(departEffectif)}`;

      return { ...t, minutes, quand, heure: formatHeure(t.depart_prevu) };
    })
    .filter((t) => t.minutes >= 0); // un train parti entre deux rafraîchissements disparaît
});
</script>

<template>
  <section class="carte-trains">
    <header class="entete">
      <span class="titre">🚆 Montreux → Lausanne</span>
      <span v-if="perime" class="perime">non actualisé</span>
    </header>

    <p v-if="trains === null" class="vide">Horaires indisponibles</p>
    <p v-else-if="lignes.length === 0" class="vide">Aucun train pour le moment</p>

    <ul v-else class="liste">
      <li
        v-for="t in lignes"
        :key="t.depart_prevu + t.train"
        class="train"
        :class="t.statut"
      >
        <span class="quand">{{ t.quand }}</span>

        <span class="infos">
          <span class="numero">{{ t.train }}</span>
          <span class="destination">{{ t.destination }}</span>
        </span>

        <span class="horaire">
          <span class="heure">{{ t.heure }}</span>
          <span v-if="t.statut === 'annule'" class="badge badge-annule">Supprimé</span>
          <span
            v-else-if="t.retard_min > 0"
            class="badge"
            :class="{ 'badge-retard': t.statut === 'retard' }"
          >+{{ t.retard_min }}'</span>
        </span>

        <span class="voie" :class="{ 'voie-changee': t.changement_voie }">
          voie {{ t.voie ?? '–' }}
        </span>
      </li>
    </ul>

    <footer class="source">Données : opentransportdata.swiss</footer>
  </section>
</template>

<style scoped>
/* Le fond, la bordure et le padding viennent du parent (classe .carte) */
.carte-trains {
  --trains-attenue: var(--doux, #9ca3af);
  --trains-retard: var(--orange, #e0af68);
  --trains-annule: #f7768e;

  display: flex;
  flex-direction: column;
  gap: 1.4vh;
}

.entete {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.titre {
  font-size: 2.1vh;
  color: var(--trains-attenue);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-weight: 600;
}

.perime {
  font-size: 1.5vh;
  color: var(--trains-retard);
}

.vide {
  margin: 0;
  font-size: 2vh;
  color: var(--trains-attenue);
}

.liste {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 1vh;
}

.train {
  display: grid;
  grid-template-columns: 9em 1fr auto 5em;
  align-items: center;
  gap: 1.5vh;
  font-size: 2.1vh;
}

.quand {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.infos {
  display: flex;
  gap: 0.8em;
  min-width: 0;
}

.numero {
  font-weight: 600;
}

.destination {
  color: var(--trains-attenue);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.horaire {
  display: flex;
  align-items: center;
  gap: 0.6em;
  font-variant-numeric: tabular-nums;
}

.badge {
  font-size: 1.6vh;
  color: var(--trains-attenue);
}

.badge-retard {
  color: var(--trains-retard);
  font-weight: 700;
}

.badge-annule {
  color: var(--trains-annule);
  font-weight: 700;
}

.voie {
  text-align: right;
  color: var(--trains-attenue);
}

.voie-changee {
  color: var(--trains-retard);
  font-weight: 700;
}

/* Train supprimé : ligne barrée, seul le badge reste lisible */
.train.annule .quand,
.train.annule .infos,
.train.annule .heure {
  text-decoration: line-through;
  opacity: 0.5;
}

.source {
  font-size: 1.2vh;
  color: var(--trains-attenue);
  text-align: right;
}
</style>