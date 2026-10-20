import { createRouter, createWebHistory } from 'vue-router'
import AffichageView from '../views/AffichageView.vue'
import AdminView from '../views/AdminView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'affichage', component: AffichageView },
    { path: '/admin', name: 'admin', component: AdminView },
  ],
})

export default router