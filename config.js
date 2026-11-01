// Verbindung zu Supabase.
// Supabase → Project Settings → API: "Project URL" und "anon public" Key.
// Der anon-Key ist öffentlich gedacht – die Daten schützen die Regeln in schema.sql.
window.FSP_CONFIG = {
  SUPABASE_URL: "https://bxyxickwkfzefuixijmt.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4eXhpY2t3a2Z6ZWZ1aXhpam10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0MDI0NjksImV4cCI6MjEwODk3ODQ2OX0.h78Sm2TqP8zsVt9D61ksN1UbWTXXKfcvtBt3ctxisT4",
  // Öffentlicher Schlüssel für Push-Mitteilungen (der geheime Teil liegt nur in Supabase → Edge Functions → Secrets)
  VAPID_PUBLIC_KEY: "BLtg0k7XoaF8DpRD2NmnE5ZrAaUEDUoVgFcIE0Lw6ro87irZH-JCOtRrqGOx-SZEtTLP7Y3yb8-EtCOhrxPfG6s",
};
