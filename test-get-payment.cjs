const { MercadoPagoConfig, Payment } = require("mercadopago");
const mpToken = "APP_USR-5520671839390863-031622-4f2fede32936291cc0567aebae0a319e-1434591190";
const client = new MercadoPagoConfig({ accessToken: mpToken });
const paymentDetails = new Payment(client);
paymentDetails.get({ id: "175307219570" }).then(console.log).catch(console.error);
