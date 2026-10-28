// Donne à l'appli l'adresse publique de Supabase et sa clé publique (anon).
// Ces deux valeurs sont faites pour être visibles dans le navigateur :
// la sécurité des données est assurée par les règles de la base (voir supabase/schema.sql).
export default function handler(req, res) {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    res.status(500).json({ error: "config_missing", message: "SUPABASE_URL et SUPABASE_ANON_KEY ne sont pas encore réglées dans Vercel." });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ supabaseUrl: url, supabaseAnonKey: anonKey });
}
