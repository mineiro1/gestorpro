import { MercadoPagoConfig, Preference } from "mercadopago";

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { title, price, quantity, adminId, email } = req.body;

    let mpToken = process.env.MP_ACCESS_TOKEN;
    if (!mpToken || mpToken.length < 40) {
      mpToken = "APP_USR-5520671839390863-031622-4f2fede32936291cc0567aebae0a319e-1434591190";
    }

    if (!mpToken) {
      console.error("No MP access token");
      return res.status(500).json({ error: "Mercado Pago access token not configured." });
    }

    const client = new MercadoPagoConfig({ accessToken: mpToken });
    const preference = new Preference(client);

    const response = await preference.create({
      body: {
        items: [
          {
            id: adminId || "1",
            title: title || "Assinatura Mensal - GestãoPro",
            quantity: quantity || 1,
            unit_price: Number(price) || 99.90,
          }
        ],
        payer: {
          email: email || "admin@gestaopro.com",
          name: "Cliente",
          surname: "GestãoPro",
        },
        external_reference: adminId,
        back_urls: {
          success: `${process.env.PUBLIC_URL || req.headers.origin || 'https://gestaopro.com'}/`,
          failure: `${process.env.PUBLIC_URL || req.headers.origin || 'https://gestaopro.com'}/`,
          pending: `${process.env.PUBLIC_URL || req.headers.origin || 'https://gestaopro.com'}/`
        },
        auto_return: "approved",
        notification_url: `${process.env.PUBLIC_URL || req.headers.origin || 'https://gestaopro.com'}/api/mp-webhook`
      }
    });

    res.status(200).json({ id: response.id, init_point: response.init_point });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error?.message || "Failed to create preference" });
  }
}
