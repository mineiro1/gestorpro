const target = `    if ((body.object === "whatsapp_business_account" || body.object === "wame") && body.entry && body.entry[0].changes) {
       const value = body.entry[0].changes[0].value;
       if (value.messages && value.messages.length > 0) {
          const msg = value.messages[0];
          phone = msg.from;
          if (msg.type === "text" && msg.text) {
             content = msg.text.body;
          } else if (msg.type === "audio" && msg.audio) {
             content = "🎵 Áudio recebido";
             mediaUrl = msg.audio.url || "";
          } else if (msg.type === "image" && msg.image) {
             content = msg.image.caption || "📸 Imagem recebida";
             mediaUrl = msg.image.url || "";
          } else if (msg.type === "video" && msg.video) {
             content = msg.video.caption || "🎥 Vídeo recebido";
             mediaUrl = msg.video.url || "";
          } else if (msg.type === "document" && msg.document) {
             content = \`📄 Documento: \${msg.document.filename || 'Arquivo'}\`;
             mediaUrl = msg.document.url || "";
          } else {
             content = \`[Media: \${msg.type}]\`;
          }
       } else {
          return res.status(200).send("EVENT_RECEIVED");
       }
    }`;
