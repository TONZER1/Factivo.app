# Factivo

Devis et factures par la voix pour les artisans suisses.
L'artisan dicte son chantier, l'IA le chiffre avec ses tarifs, le client signe sur le téléphone, la facture part avec sa QR-facture.

## Ce que contient ce projet

| Fichier | À quoi il sert |
| --- | --- |
| `index.html`, `app.js`, `styles.css` | L'appli elle-même, ce que voit l'artisan |
| `manifest.webmanifest`, `sw.js`, `icons/` | L'installation sur l'écran d'accueil et le fonctionnement sans réseau |
| `api/devis.js` | Le service qui demande à l'IA de chiffrer la dictée (la clé de l'IA reste secrète sur le serveur) |
| `api/config.js` | Donne à l'appli l'adresse de la base de données |
| `supabase/schema.sql` | La base de données : profils, clients, documents, et les règles qui protègent les données de chaque artisan |

## Mise en ligne, pas à pas

### 1. Préparer la base de données (Supabase)

1. Dans ton projet Supabase, ouvre **SQL Editor → New query**.
2. Copie tout le contenu du fichier `supabase/schema.sql`, colle-le, puis clique sur **Run**. Le message doit indiquer « Success ».
3. Ouvre **Authentication → Sign In / Providers** et vérifie que **Email** est activé.
4. Ouvre **Authentication → Emails → Templates → Magic Link** et remplace le texte par :

   ```
   <h2>Ton code Factivo</h2>
   <p>Voici ton code de connexion :</p>
   <p style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
   <p>Il est valable une heure. Si tu n'as rien demandé, ignore cet e-mail.</p>
   ```

   Change aussi l'objet en « Ton code Factivo », puis enregistre.
5. **Envoi des e-mails.** Par défaut, Supabase n'envoie les codes qu'aux membres de ton équipe Supabase, et en petite quantité. Pour tes testeurs, branche ton adresse IONOS : **Authentication → Emails → SMTP Settings**, active **Custom SMTP** et remplis avec les réglages SMTP donnés par IONOS pour contact@factivo.ch (serveur, port 587, adresse, mot de passe de la boîte). Nom de l'expéditeur : Factivo.
6. Ouvre **Project Settings → API** (ou **API Keys**) et garde cette page ouverte : tu auras besoin de l'**URL du projet** et de la clé **anon public** (ou **publishable**). N'utilise jamais la clé **service_role** ou **secret** dans l'appli.

### 2. Mettre l'appli en ligne (Vercel)

1. Sur vercel.com : **Add New… → Project → Import** le projet GitHub **Factivo.app**.
2. Avant de cliquer sur **Deploy**, ouvre **Environment Variables** et ajoute :

   | Nom | Valeur |
   | --- | --- |
   | `SUPABASE_URL` | l'URL du projet Supabase (commence par `https://` et finit par `.supabase.co`) |
   | `SUPABASE_ANON_KEY` | la clé anon public ou publishable |
   | `ANTHROPIC_API_KEY` | une clé créée sur console.anthropic.com → API Keys (commence par `sk-ant-`) |

3. Clique sur **Deploy**. L'appli est en ligne sur une adresse en `.vercel.app`.
4. Dans Supabase, **Authentication → URL Configuration** : mets cette adresse dans **Site URL**.

Ces clés se collent uniquement dans Vercel. Ne les envoie à personne, ni par e-mail ni dans un chat.

### 3. Relier app.factivo.ch

1. Dans Vercel, projet **Factivo.app → Settings → Domains** : ajoute `app.factivo.ch`.
2. Vercel affiche une ligne **CNAME** à créer. Chez IONOS : **Domaines & SSL → factivo.ch → DNS → Ajouter un enregistrement → CNAME**, nom d'hôte `app`, valeur donnée par Vercel.
3. Ne modifie pas les lignes **MX** : elles font fonctionner l'adresse e-mail.
4. Quand Vercel affiche la coche verte, remplace la **Site URL** de Supabase par `https://app.factivo.ch`.

### 4. Premier test

1. Ouvre l'appli sur ton téléphone, entre ton e-mail, puis le code reçu.
2. Remplis ton entreprise, tes tarifs, ton modèle.
3. Dicte un devis, fais-le signer, crée la facture, télécharge le PDF.
4. Sur iPhone : Safari → Partager → **Sur l'écran d'accueil**. Sur Android : menu ⋮ → **Installer l'application**.

## Coûts de départ

Supabase et Vercel sont gratuits pour commencer. L'IA est payée à l'usage sur console.anthropic.com (quelques centimes par devis). Le modèle utilisé peut être changé avec la variable `ANTHROPIC_MODEL` (par défaut `claude-haiku-5-5`).

## Ce qui viendra ensuite

- Envoi direct des e-mails et relances automatiques depuis l'appli
- Abonnements payants (plan Pro) avec Stripe
- Publication sur l'App Store et le Google Play
