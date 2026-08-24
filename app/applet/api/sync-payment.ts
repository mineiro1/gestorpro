import { MercadoPagoConfig, Payment } from "mercadopago";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: any, res: any) {
  // Configurações de CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const payment_id = req.body?.payment_id || req.query?.payment_id || req.query?.id;
  if (!payment_id) return res.status(400).json({ error: "Missing payment_id (ID da transação não encontrado)" });

  let mpToken = process.env.MP_ACCESS_TOKEN;
  if (!mpToken || mpToken.length < 40) {
    mpToken = "APP_USR-5520671839390863-031622-4f2fede32936291cc0567aebae0a319e-1434591190";
  }

  try {
    const client = new MercadoPagoConfig({ accessToken: mpToken });
    const paymentDetails = new Payment(client);
    const paymentInfo = await paymentDetails.get({ id: String(payment_id) });

    console.log("Sync Info:", paymentInfo.status, paymentInfo.external_reference);
    
    if (paymentInfo.status === "approved" && paymentInfo.external_reference) {
      await processPayment(paymentInfo.id, paymentInfo.external_reference);
      return res.status(200).json({ success: true, message: "Pagamento sincronizado e conta ativada com sucesso!" });
    } else {
      return res.status(400).json({ error: `Pagamento com status: ${paymentInfo.status}. Precisa estar 'approved'.` });
    }
  } catch (e: any) {
    console.error("Sync error:", e);
    return res.status(500).json({ error: e.message });
  }
}

async function processPayment(paymentId: any, adminId: string) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  
  if (!supabaseUrl) throw new Error("Missing VITE_SUPABASE_URL na hospedagem");
  
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: existing, error: selError } = await supabaseAdmin.from('settings').select('id').eq('id', 'payment_' + paymentId).single();
  
  if (existing) {
    console.log('Payment already processed:', paymentId);
    return;
  }
  
  const { data: userData, error: userError } = await supabaseAdmin.from("users").select("subscription_expires_at").eq("id", adminId).single();
  if (userError && userError.code !== 'PGRST116') {
     throw new Error("Failed to fetch user: " + userError.message);
  }

  let currentExpiry = new Date();
  if (userData && userData.subscription_expires_at) {
     const userExpiry = new Date(userData.subscription_expires_at);
     if (userExpiry > currentExpiry) {
         currentExpiry = userExpiry;
     }
  }
  currentExpiry.setDate(currentExpiry.getDate() + 30);
  
  const { data: updateData, error: updateError } = await supabaseAdmin.from("users").update({
    subscription_status: 'active',
    subscription_expires_at: currentExpiry.toISOString(),
  }).eq('id', adminId).select();

  if (!updateError && (!updateData || updateData.length === 0)) {
      throw new Error("Update silent failure: A chave SUPABASE_SERVICE_ROLE_KEY está ausente ou errada na hospedagem.");
  }
  if (updateError) {
      throw new Error("Failed to update user: " + updateError.message);
  }
  
  await supabaseAdmin.from('settings').insert({ id: 'payment_' + paymentId });
  console.log('Successfully processed payment:', paymentId);
}
