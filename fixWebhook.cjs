const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const oldProcess = `async function processPayment(paymentId, adminId) {
  try {
    // Check if already processed
    const { data: existing } = await supabaseAdmin.from('settings').select('id').eq('id', 'payment_' + paymentId).single();
    if (existing) {
      console.log('Payment already processed:', paymentId);
      return;
    }
    
    // Add 30 days
    const { data: userData } = await supabaseAdmin.from("users").select("subscription_expires_at").eq("id", adminId).single();
    let currentExpiry = new Date();
    if (userData && userData.subscription_expires_at) {
       const userExpiry = new Date(userData.subscription_expires_at);
       if (userExpiry > currentExpiry) {
           currentExpiry = userExpiry;
       }
    }
    currentExpiry.setDate(currentExpiry.getDate() + 30);
    
    await supabaseAdmin.from("users").update({
      subscription_status: 'active',
      subscription_expires_at: currentExpiry.toISOString(),
    }).eq('id', adminId);
    
    // Mark as processed
    await supabaseAdmin.from('settings').insert({ id: 'payment_' + paymentId });
    console.log('Successfully processed payment:', paymentId);
  } catch (error) {
    console.error('Error processing payment:', error);
  }
}`;

const newProcess = `async function processPayment(paymentId, adminId) {
  try {
    console.log('Processing payment:', paymentId, 'for admin:', adminId);
    // Check if already processed
    const { data: existing, error: selError } = await supabaseAdmin.from('settings').select('id').eq('id', 'payment_' + paymentId).single();
    if (selError && selError.code !== 'PGRST116') {
        console.error('Error checking existing payment (Possible RLS issue):', selError);
        throw new Error("Failed to check existing payment: " + selError.message);
    }
    
    if (existing) {
      console.log('Payment already processed:', paymentId);
      return;
    }
    
    // Get user
    const { data: userData, error: userError } = await supabaseAdmin.from("users").select("subscription_expires_at").eq("id", adminId).single();
    if (userError) {
       console.error('Error fetching user (Possible RLS issue):', userError);
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
    
    // Update user
    const { error: updateError } = await supabaseAdmin.from("users").update({
      subscription_status: 'active',
      subscription_expires_at: currentExpiry.toISOString(),
    }).eq('id', adminId);

    if (updateError) {
        console.error('Error updating user (Possible RLS issue):', updateError);
        throw new Error("Failed to update user: " + updateError.message);
    }
    
    // Mark as processed
    const { error: insError } = await supabaseAdmin.from('settings').insert({ id: 'payment_' + paymentId });
    if (insError) {
        console.error('Error inserting settings (Possible RLS issue):', insError);
        throw new Error("Failed to insert payment record: " + insError.message);
    }
    
    console.log('Successfully processed payment:', paymentId);
  } catch (error) {
    console.error('Critical Error processing payment:', error);
    throw error;
  }
}`;

code = code.replace(oldProcess, newProcess);

// Fix webhook parsing
const oldWebhookParse = `    const { "data.id": dataId, type } = req.query;
    if (type === "payment" && dataId) {`;

const newWebhookParse = `    let dataId = req.query["data.id"] || req.query.id || (req.body && req.body.data && req.body.data.id) || (req.body && req.body.id);
    let type = req.query.type || req.query.topic || (req.body && req.body.type) || (req.body && req.body.topic) || (req.body && req.body.action);
    
    console.log("Extracted Webhook Data - type:", type, "dataId:", dataId);

    if ((type === "payment" || type === "payment.created" || type === "payment.updated") && dataId) {`;

code = code.replace(oldWebhookParse, newWebhookParse);

fs.writeFileSync('server.ts', code);
