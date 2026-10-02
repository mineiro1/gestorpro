export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { sdp, type, sessionId: reqSessionId, callId } = req.body;
    const astracallsUrl = 'https://calls.rspiscinas.app.br';
    const astracallsApiKey = 'rs_piscinas_segredo_2026';
    const sessionId = reqSessionId || '8090cca3add0b8eb3e41efb9eec363e4';

    const resp = await fetch(`${astracallsUrl}/api/sessions/${sessionId}/calls/webrtc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': astracallsApiKey
      },
      body: JSON.stringify({ sdp, type, callId })
    });

    if (resp.ok) {
      const data = await resp.json();
      return res.json(data);
    } else {
      const errTxt = await resp.text().catch(() => '');
      return res.status(resp.status).json({ error: errTxt });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
