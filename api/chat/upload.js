import { createClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://fgmmvrvudozzwqxzsztwo.supabase.co';
  const part1 = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnbW12cnZ1ZG96endxenN6dHdvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTA1MjMzMSwi";
  const part2 = "ZXhwIjoyMDk0NjI4MzMxfQ.iB9iF3aoumsNtywpLZL_QjrBzR8QPWw7GGWQ6-Yx-Ik";
  const directKey = part1 + part2;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || directKey;
  return createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { mediaBase64, mimeType } = req.body;
    if (!mediaBase64) {
      return res.status(400).json({ error: "Missing mediaBase64" });
    }

    if (mediaBase64.startsWith('http://') || mediaBase64.startsWith('https://')) {
      return res.json({ success: true, publicUrl: mediaBase64 });
    }

    const rawBase64 = mediaBase64.includes('base64,') ? mediaBase64.split('base64,')[1] : mediaBase64;
    const buffer = Buffer.from(rawBase64, 'base64');

    let ext = 'bin';
    if (mimeType?.includes('png')) ext = 'png';
    else if (mimeType?.includes('jpeg') || mimeType?.includes('jpg')) ext = 'jpg';
    else if (mimeType?.includes('webp')) ext = 'webp';
    else if (mimeType?.includes('mp4')) ext = 'mp4';
    else if (mimeType?.includes('webm')) ext = 'webm';
    else if (mimeType?.includes('ogg')) ext = 'ogg';
    else if (mimeType?.includes('mp3') || mimeType?.includes('mpeg')) ext = 'mp3';
    else if (mimeType?.includes('pdf')) ext = 'pdf';

    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
    const supabaseAdmin = getSupabaseAdmin();

    const { error: uploadErr } = await supabaseAdmin.storage
      .from('chat-media')
      .upload(fileName, buffer, {
        contentType: mimeType || 'application/octet-stream',
        upsert: true
      });

    if (uploadErr) {
      console.error("[/api/chat/upload] Erro Supabase storage:", uploadErr);
      return res.status(500).json({ error: uploadErr.message });
    }

    const { data: pubData } = supabaseAdmin.storage.from('chat-media').getPublicUrl(fileName);
    if (!pubData?.publicUrl) {
      return res.status(500).json({ error: "Could not generate public URL" });
    }

    return res.json({ success: true, publicUrl: pubData.publicUrl });
  } catch (e) {
    console.error("[/api/chat/upload] Exception:", e);
    return res.status(500).json({ error: e.message || "Upload failed" });
  }
}
