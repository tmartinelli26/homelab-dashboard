const { HA_URL, HA_TOKEN } = process.env;

export async function lireEtat(entityId) {
  const reponse = await fetch(`${HA_URL}/api/states/${entityId}`, {
    headers: { Authorization: `Bearer ${HA_TOKEN}` },
  });

  if (!reponse.ok) {
    throw new Error(`HA a répondu ${reponse.status} pour ${entityId}`);
  }

  return reponse.json();
}
