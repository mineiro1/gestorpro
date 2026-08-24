const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target = `    // Update user
    const { error: updateError } = await supabaseAdmin.from("users").update({
      subscription_status: 'active',
      subscription_expires_at: currentExpiry.toISOString(),
    }).eq('id', adminId);`;

const replacement = `    // Update user
    const { data: updateData, error: updateError } = await supabaseAdmin.from("users").update({
      subscription_status: 'active',
      subscription_expires_at: currentExpiry.toISOString(),
    }).eq('id', adminId).select();
    
    if (!updateError && (!updateData || updateData.length === 0)) {
        throw new Error("Update silent failure: Check if SUPABASE_SERVICE_ROLE_KEY is valid. RLS might have blocked the update.");
    }`;

code = code.replace(target, replacement);
fs.writeFileSync('server.ts', code);
