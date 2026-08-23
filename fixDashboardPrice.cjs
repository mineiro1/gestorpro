const fs = require('fs');

let dashCode = fs.readFileSync('src/pages/Dashboard.tsx', 'utf8');

dashCode = dashCode.replace(
  "      let price = 99.90;\n      // You may use settings table here",
  `      let price = 99.90;
      try {
        const { data } = await supabase.from('settings').select('*').eq('id', 'platform').single();
        if (data && data.monthlyprice) {
          price = data.monthlyprice;
        }
      } catch (e) {
        console.error('Failed to get price', e);
      }`
);

fs.writeFileSync('src/pages/Dashboard.tsx', dashCode);
