import re

with open('src/pages/Clients.tsx', 'r') as f:
    content = f.read()

# I will replace the channel logic inside the useEffect
old_channel = """    const clientChannel = supabase.channel('clients-realtime-clients')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients', filter: `admin_id=eq.${adminId}` }, fetchClients)
      .subscribe();
    
    const paymentChannel = supabase.channel('clients-realtime-payments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: `admin_id=eq.${adminId}` }, fetchPayments)
      .subscribe();

    return () => {
      supabase.removeChannel(clientChannel);
      supabase.removeChannel(paymentChannel);
    };"""

content = content.replace(old_channel, "")

# Wait, `useRealtimeUpdates` in Clients.tsx needs to listen to BOTH 'clients' and 'payments'
content = content.replace("useRealtimeUpdates(['clients']", "useRealtimeUpdates(['clients', 'payments']")

with open('src/pages/Clients.tsx', 'w') as f:
    f.write(content)
