const { MercadoPagoConfig, Payment } = require("mercadopago");
const { createClient } = require("@supabase/supabase-js");

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }
  console.log("Received MP Webhook:", req.query, req.body);
  
  let dataId = req.query["data.id"] || req.query.id || (req.body && req.body.data && req.body.data.id) || (req.body && req.body.id);
  let type = req.query.type || req.query.topic || (req.body && req.body.type) || (req.body && req.body.topic) || (req.body && req.body.action);
  
  if ((type === "payment" || type === "payment.created" || type === "payment.updated") && dataId) {
    let mpToken = process.env.MP_ACCESS_TOKEN;
    if (!mpToken || mpToken.length < 40) {
      mpToken = "APP_USR-5520671839390863-031622-4f2fede32936291cc0567aebae0a319e-1434591190";
    }
    try {
      const client = new MercadoPagoConfig({ accessToken: mpToken });
      const paymentDetails = new Payment(client);
      const paymentInfo = await paymentDetails.get({ id: String(dataId) });
      
      if (paymentInfo.status === "approved" && paymentInfo.external_reference) {
        await processPayment(paymentInfo.id, paymentInfo.external_reference);
      }
    } catch (error) {
      console.error("Webhook processing error:", error);
    }
  }
  
  res.status(200).send("OK");
};

async function processPayment(paymentId, adminId) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  
  if (!supabaseUrl) return;
  
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  
  const { data: existing } = await supabaseAdmin.from('settings').select('id').eq('id', 'payment_' + paymentId).single();
  if (existing) return;
  
  const { data: userData } = await supabaseAdmin.from("users").select("subscription_expires_at").eq("id", adminId).single();
  let currentExpiry = new Date();
  if (userData && userData.subscription_expires_at) {
     const userExpiry = new Date(userData.subscription_expires_at);
     if (userExpiry > currentExpiry) currentExpiry = userExpiry;
  }
  currentExpiry.setDate(currentExpiry.getDate() + 30);
  
  await supabaseAdmin.from("users").update({
    subscription_status: 'active',
    subscription_expires_at: currentExpiry.toISOString(),
  }).eq('id', adminId);
  
  await supabaseAdmin.from('settings').insert({ id: 'payment_' + paymentId });
}
