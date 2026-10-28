// Transforme la dictée d'un artisan en lignes de devis chiffrées, avec l'IA d'Anthropic.
// La clé ANTHROPIC_API_KEY reste sur le serveur : elle n'est jamais envoyée au navigateur.
// Seuls les artisans connectés peuvent appeler cette fonction.

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";

async function userFromToken(token) {
  if (!token) return null;
  const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: process.env.SUPABASE_ANON_KEY }
  });
  if (!r.ok) return null;
  return r.json();
}

function clean(s, max) { return String(s == null ? "" : s).slice(0, max); }

function buildPrompt(b) {
  const tarifs = (Array.isArray(b.tarifs) ? b.tarifs : []).slice(0, 60)
    .map(t => `- ${clean(t.nom, 80)} : ${Number(t.prix) || 0} CHF par ${clean(t.unite, 20)}`).join("\n");
  const known = b.known && b.known.nom
    ? `\nLe client est déjà connu : ${clean(b.known.nom, 80)}, ${clean(b.known.adresse, 80)}, ${clean(b.known.npaVille, 60)}. Reprends ces informations telles quelles.\n`
    : "";
  const type = b.type === "facture" ? "facture" : "devis";
  return `Tu prépares un ${type} pour un artisan suisse romand. Transforme sa dictée en lignes chiffrées.
${known}
Entreprise : ${clean(b.entreprise, 80)} (métier : ${clean(b.metier, 40)})
Taux horaire : ${Number(b.taux) || 0} CHF / heure
Tarifs de l'entreprise (utilise EXACTEMENT ces prix quand une prestation correspond) :
${tarifs || "- aucun tarif enregistré"}

Règles :
- Une ligne par prestation mentionnée. Si une prestation n'est pas dans les tarifs, compte-la en heures au taux horaire, avec une estimation raisonnable et une désignation claire.
- Si l'artisan parle de plusieurs personnes et d'une durée sans prestation au forfait, compte les heures (personnes × heures). N'ajoute pas d'heures pour une prestation déjà facturée au m² ou au forfait.
- Désignations courtes et professionnelles, en français.
- N'invente jamais le nom ou l'adresse du client : laisse vide si ce n'est pas dit.
- Montants hors TVA, nombres décimaux sans unité.

Réponds uniquement avec ce JSON, sans texte autour :
{"client":{"nom":"","adresse":"rue et numéro","npaVille":"NPA et localité"},"chantier":"description courte du chantier","lignes":[{"designation":"","quantite":1,"unite":"forfait","prixUnitaire":0}],"remarques":"conditions utiles mentionnées, sinon vide"}

Dictée de l'artisan :
"""${clean(b.text, 4000)}"""`;
}

function parseJson(text) {
  try { return JSON.parse(text); } catch (e) {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch (e) {} }
  const a = text.indexOf("{"), z = text.lastIndexOf("}");
  if (a >= 0 && z > a) { try { return JSON.parse(text.slice(a, z + 1)); } catch (e) {} }
  return null;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.status(405).json({ error: "method" }); return; }
  if (!process.env.ANTHROPIC_API_KEY) { res.status(503).json({ error: "ai_not_configured" }); return; }

  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const user = await userFromToken(token).catch(() => null);
  if (!user || !user.id) { res.status(401).json({ error: "not_signed_in" }); return; }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  if (!String(body.text || "").trim()) { res.status(400).json({ error: "empty" }); return; }

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        messages: [{ role: "user", content: buildPrompt(body) }]
      })
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      console.error("Anthropic error", r.status, detail.slice(0, 500));
      res.status(502).json({ error: "ai_error", status: r.status });
      return;
    }
    const out = await r.json();
    const text = (out.content || []).filter(c => c.type === "text").map(c => c.text).join("");
    const data = parseJson(text);
    if (!data || !Array.isArray(data.lignes)) { res.status(502).json({ error: "ai_bad_json" }); return; }
    res.status(200).json(data);
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: "ai_unreachable" });
  }
}
