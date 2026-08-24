const { MercadoPagoConfig, Payment } = require("mercadopago");
const { createClient } = require("@supabase/supabase-js");
module.exports = async function handler(req, res) {
  try {
    const payment_id = req.body?.payment_id || req.query?.payment_id || req.query?.id;
    if (!payment_id) return res.status(400).json({ error: "Missing payment_id" });
    let mpToken = process.env.MP_ACCESS_TOKEN || "APP_USR-5520671839390863-031622-4f2fede32936291cc0567aebae0a319e-1434591190";
    const client = new MercadoPagoConfig({ accessToken: mpToken });
    const paymentDetails = new Payment(client);
    const paymentInfo = await paymentDetails.get({ id: String(payment_id) });
    if (paymentInfo.status === "approved" && paymentInfo.external_reference) {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
      if (supabaseUrl) {
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, { auth: { autoRefreshToken: false, persistSession: false } });
        const { data: existing } = await supabaseAdmin.from('settings').select('id').eq('id', 'payment_' + paymentInfo.id).single();
        if (!existing) {
          const { data: userData } = await supabaseAdmin.from("users").select("subscription_expires_at").eq("id", paymentInfo.external_reference).single();
          let currentExpiry = new Date();
          if (userData && userData.subscription_expires_at) {
             const userExpiry = new Date(userData.subscription_expires_at);
             if (userExpiry > currentExpiry) currentExpiry = userExpiry;
          }
          currentExpiry.setDate(currentExpiry.getDate() + 30);
          await supabaseAdmin.from("users").update({ subscription_status: 'active', subscription_expires_at: currentExpiry.toISOString() }).eq('id', paymentInfo.external_reference);
          await supabaseAdmin.from('settings').insert({ id: 'payment_' + paymentInfo.id });
        }
      }
      return res.status(200).json({ success: true });
    } else {
      return res.status(400).json({ error: "Payment not approved or missing external_reference" });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
