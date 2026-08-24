import { MercadoPagoConfig, Preference } from "mercadopago";

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  try {
    const { title, price, quantity, adminId, email, origin } = req.body || {};
    let mpToken = process.env.MP_ACCESS_TOKEN || "APP_USR-5520671839390863-031622-4f2fede32936291cc0567aebae0a319e-1434591190";
    const client = new MercadoPagoConfig({ accessToken: mpToken });
    const preference = new Preference(client);
    
    const response = await preference.create({
      body: {
        items: [{ id: "subscription_monthly", title: title || "Subscription", quantity: quantity || 1, unit_price: Number(price) || 0, currency_id: "BRL" }],
        payer: { email: email || "admin@gestaopro.com", name: "Cliente", surname: "GestãoPro" },
        external_reference: adminId,
        back_urls: {
          success: `${(process.env.PUBLIC_URL || origin || req.headers.origin || 'https://gestaopro.com')}/`,
          failure: `${(process.env.PUBLIC_URL || origin || req.headers.origin || 'https://gestaopro.com')}/`,
          pending: `${(process.env.PUBLIC_URL || origin || req.headers.origin || 'https://gestaopro.com')}/`
        },
        auto_return: "approved",
        notification_url: `${(process.env.PUBLIC_URL || origin || req.headers.origin || 'https://gestaopro.com')}/api/mp-webhook`
      }
    });
    res.status(200).json({ id: response.id, init_point: response.init_point });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
