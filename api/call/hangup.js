export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { callId, sessionId: reqSessionId } = req.body;
    const astracallsUrl = 'https://calls.rspiscinas.app.br';
    const astracallsApiKey = 'rs_piscinas_segredo_2026';
    const sessionId = reqSessionId || '8090cca3add0b8eb3e41efb9eec363e4';

    try {
      await fetch(`${astracallsUrl}/api/sessions/${sessionId}/calls/hangup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': astracallsApiKey
        },
        body: JSON.stringify({ callId })
      });
    } catch (e) {}

    return res.json({ success: true, callId });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
