<template>
  <RouterView />
</template>

<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; }

:root {
  --fond: #0f1115;
  --carte: #181b22;
  --bord: #262a33;
  --texte: #e8eaed;
  --doux: #8b919c;
  --accent: #7aa2f7;
  --vert: #9ece6a;
  --orange: #e0af68;
  --violet: #bb9af7;
  --rouge: #f7768e;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: var(--texte);
  background: var(--fond);
}

body { min-height: 100vh; background: var(--fond); }
</style>