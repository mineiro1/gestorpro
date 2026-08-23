const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const debugRoute = `
  app.get("/api/test-db", async (req, res) => {
    try {
      // test if we can read users without auth
      const { data, error } = await supabaseAdmin.from("users").select("id").limit(1);
      if (error) {
         return res.json({ status: "error", message: error.message, code: error.code, usingServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY });
      }
      return res.json({ status: "success", rows: data.length, usingServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY });
    } catch(e) {
      return res.json({ status: "exception", message: e.message });
    }
  });
`;

code = code.replace('  // API Routes', '  // API Routes' + debugRoute);
fs.writeFileSync('server.ts', code);
