const fs = require('fs');
let code = fs.readFileSync('src/pages/ProductsPage.tsx', 'utf-8');

code = code.replace(
  "       openWhatsApp(number, message);\n       navigate('/clients');\n       return;",
  "       openWhatsApp(number, message);\n       setSupplies(supplies.map(s => ({ ...s, quantity: '' })));\n       setSelectedClient(null);\n       return;"
);

code = code.replace(
  "        alert('Mensagem de insumos enviada com sucesso via Evolution API!');\n      }\n      navigate('/clients');\n    } catch (error: any) {",
  "        alert('Mensagem de insumos enviada com sucesso via Evolution API!');\n      }\n      setSupplies(supplies.map(s => ({ ...s, quantity: '' })));\n      setSelectedClient(null);\n    } catch (error: any) {"
);

fs.writeFileSync('src/pages/ProductsPage.tsx', code);
console.log("Patched ProductsPage redirects");
