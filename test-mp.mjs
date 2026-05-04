import fetch from "node-fetch";

async function run() {
  try {
    const res = await fetch("http://localhost:3000/api/create-preference", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Assinatura Mensal - GestãoPro",
        price: 99.90,
        quantity: 1,
        adminId: undefined,
        email: "servincg@gmail.com"
      })
    });
    console.log(res.status, await res.text());
  } catch (e) {
    console.error(e);
  }
}
run();
