export default async function handler(req, res) {
  try {
    const astracallsUrl = 'https://calls.rspiscinas.app.br';
    const astracallsApiKey = 'rs_piscinas_segredo_2026';

    const [healthRes, sessionsRes, webhookRes] = await Promise.allSettled([
      fetch(`${astracallsUrl}/health`),
      fetch(`${astracallsUrl}/api/sessions`, { headers: { 'X-Api-Key': astracallsApiKey } }),
      fetch(`${astracallsUrl}/api/webhook`, { headers: { 'X-Api-Key': astracallsApiKey } })
    ]);

    let isOnline = false;
    let sessions = [];
    let webhookConfig = null;

    if (healthRes.status === 'fulfilled' && healthRes.value.ok) {
      isOnline = true;
    }
    if (sessionsRes.status === 'fulfilled' && sessionsRes.value.ok) {
      const sData = await sessionsRes.value.json().catch(() => ({}));
      sessions = sData.sessions || [];
      if (sessions.length > 0) isOnline = true;
    }
    if (webhookRes.status === 'fulfilled' && webhookRes.value.ok) {
      webhookConfig = await webhookRes.value.json().catch(() => null);
    }

    return res.json({
      online: isOnline,
      serverUrl: astracallsUrl,
      sessionsCount: sessions.length,
      sessions,
      webhookConfig
    });
  } catch (e) {
    return res.status(500).json({ error: e.message, online: false });
  }
}
