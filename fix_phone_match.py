with open('server.ts', 'r') as f:
    content = f.read()

old_match = """      const matchedClient = clients?.find(c => {
         const cp = (c.phone || '').replace(/\D/g, '');
         const lp = (c.local_phone || '').replace(/\D/g, '');
         if (!cp && !lp) return false;
         
         let matchPhone = false;
         if (cp.length > 5) matchPhone = cp.includes(phone) || phone.includes(cp);
         
         let matchLocal = false;
         if (lp.length > 5) matchLocal = lp.includes(phone) || phone.includes(lp);
         
         return matchPhone || matchLocal;
      });"""

new_match = """      const matchedClient = clients?.find(c => {
         const cp = (c.phone || '').replace(/\D/g, '');
         const lp = (c.local_phone || '').replace(/\D/g, '');
         if (!cp && !lp) return false;
         
         // Helper function to safely get the last 8 digits of a number for robust Brazilian matching
         // This bypasses issues with DDI (55), DDD, and the presence/absence of the 9th digit.
         const getCore = (num) => num.length >= 8 ? num.slice(-8) : num;
         
         const webhookCore = getCore(phone);
         
         let matchPhone = false;
         if (cp.length > 5) {
            matchPhone = cp.includes(phone) || phone.includes(cp) || getCore(cp) === webhookCore;
         }
         
         let matchLocal = false;
         if (lp.length > 5) {
            matchLocal = lp.includes(phone) || phone.includes(lp) || getCore(lp) === webhookCore;
         }
         
         return matchPhone || matchLocal;
      });"""

content = content.replace(old_match, new_match)

with open('server.ts', 'w') as f:
    f.write(content)
