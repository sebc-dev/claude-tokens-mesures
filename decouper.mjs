#!/usr/bin/env node
// Estimation du découpage d'une phrase en tokens, par sondage des préfixes.
//
//   node --env-file=.env decouper.mjs [--sortie resultats/<date>]
//
// Le tokenizer de Claude n'est pas public : count_tokens donne un nombre, pas les coupures.
// Méthode : (1) mots selon deux conventions d'espace (en tête « ␣le » ou en fin « le␣ ») ; on retient celle
// dont la somme des tokens par mot redonne le total (l'API ignore une espace en fin de message) ;
// (2) sondage des préfixes à l'intérieur de chaque mot : chaque hausse du compte ouvre un token.
// Validé si une convention est exacte et si chaque courbe est croissante.
// Un découpage validé reste une ESTIMATION cohérente, pas la segmentation officielle du tokenizer.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const DATE = new Date().toISOString().slice(0, 10);
const SORTIE = join(ICI, opt('sortie', join('resultats', DATE)));
const MODELES = [opt('actuel', 'claude-opus-5-5'), opt('ancien', 'claude-haiku-4-5')];
const PHRASES = [
  { langue: 'fr', texte: 'corrige le calcul du net à payer' },
  { langue: 'en', texte: 'fix the net pay calculation' },
];
const CLE = process.env.ANTHROPIC_API_KEY;
if (!CLE) { console.error('ANTHROPIC_API_KEY absente : lancer avec node --env-file=.env.'); process.exit(1); }

const journal = [];
async function compter(modele, texte) {
  for (let essai = 0; essai < 6; essai++) {
    const r = await fetch('https://api.anthropic.com/v1/messages/count_tokens', {
      method: 'POST',
      headers: { 'x-api-key': CLE, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: modele, messages: [{ role: 'user', content: texte }] }),
    });
    if (r.status === 429 || r.status >= 500) { await new Promise((s) => setTimeout(s, 2000 * (essai + 1))); continue; }
    if (!r.ok) throw new Error(`${modele} : HTTP ${r.status} ${await r.text()}`);
    const n = (await r.json()).input_tokens;
    journal.push({ modele, texte, input_tokens: n });
    await new Promise((s) => setTimeout(s, 150));
    return n;
  }
  throw new Error(`${modele} : trop d'échecs`);
}

const resultats = [];
const md = [];
// Deux conventions possibles pour l'espace entre deux mots : collée au début du mot suivant (« ␣le »)
// ou à la fin du mot précédent (« le␣ »). On retient celle dont la somme des tokens par mot redonne le total.
const CONVENTIONS = [
  { nom: 'espace en tête de mot', mots: (t) => t.split(/(?= )/u), mesure: (w) => w, sonde: (w) => w },
  { nom: 'espace en fin de mot', mots: (t) => t.split(/(?<= )/u), mesure: (w) => w.trimEnd(), sonde: (w) => w.trimEnd() },
];
for (const m of MODELES) {
  const E = (await compter(m, 'a')) - 1; // enveloppe, validée par deux méthodes dans mesurer.mjs
  for (const { langue, texte } of PHRASES) {
    const total = (await compter(m, texte)) - E;
    const essais = [];
    for (const c of CONVENTIONS) {
      const mots = c.mots(texte);
      const parMot = [];
      for (const w of mots) parMot.push((await compter(m, c.mesure(w))) - E);
      essais.push({ convention: c, mots, parMot, somme: parMot.reduce((a, b) => a + b, 0) });
    }
    const exactes = essais.filter((e) => e.somme === total);
    const retenu = exactes[0];
    let segments = [], monotone = false, courbes = [];
    const ambigus = [];
    if (retenu) {
      monotone = true;
      for (const [k, w] of retenu.mots.entries()) {
        const sonde = [...retenu.convention.sonde(w)];
        const reste = w.slice(sonde.join('').length); // espace finale éventuelle, rattachée au dernier morceau
        if (retenu.parMot[k] === 1) { segments.push(w); courbes.push([1]); continue; }
        const depart = sonde[0] === ' ' ? 2 : 1;
        const t = [];
        for (let n = depart; n <= sonde.length; n++) t.push((await compter(m, sonde.slice(0, n).join(''))) - E);
        courbes.push(t);
        if (t.some((v, x) => x > 0 && v < t[x - 1]) || t[t.length - 1] !== retenu.parMot[k]) { monotone = false; ambigus.push(`« ${w.trim()} » (${retenu.parMot[k]} tokens ; préfixes : ${t.join(', ')})`); }
        const morceaux = [];
        let debut = 0;
        for (let x = 1; x < t.length; x++) if (t[x] > t[x - 1]) { morceaux.push(sonde.slice(debut, x + depart - 1).join('')); debut = x + depart - 1; }
        morceaux.push(sonde.slice(debut).join('') + reste);
        segments.push(...morceaux);
      }
    }
    const valide = Boolean(retenu) && monotone && segments.length === total && segments.join('') === texte;
    resultats.push({ modele: m, langue, texte, total, mots_ambigus: ambigus, essais: essais.map((e) => ({ convention: e.convention.nom, mots: e.mots, tokens_par_mot: e.parMot, somme: e.somme })), convention_retenue: retenu?.convention.nom ?? null, courbes_prefixes: courbes, monotone, segments, valide });
    const vis = segments.length ? segments.map((x) => `\`${x.replace(/ /g, '␣')}\``).join(' · ') : '—';
    const sommes = essais.map((e) => `${e.convention.nom} : ${e.somme}`).join(' ; ');
    const conv = exactes.length > 1 ? `indéterminée (les ${exactes.length} sommes sont exactes)` : retenu ? retenu.convention.nom : 'aucune';
    const statut = valide ? 'oui' : retenu ? `mots : oui ; coupures internes ambiguës pour ${ambigus.join(', ')}` : '**non**';
    md.push(`| ${m} | ${langue.toUpperCase()} | « ${texte} » | **${total}** | ${sommes} | ${conv} | ${vis} | ${statut} |`);
  }
}

mkdirSync(SORTIE, { recursive: true });
writeFileSync(join(SORTIE, 'decoupage.json'), JSON.stringify({ date: DATE, resultats, appels: journal }, null, 2) + '\n');
writeFileSync(join(SORTIE, 'decoupage.md'), `# Découpage estimé en tokens — ${DATE}

Le tokenizer de Claude n'est pas public : \`count_tokens\` renvoie un nombre, pas les coupures. Les coupures ci-dessous sont **estimées** en deux temps.

1. La phrase est découpée en mots selon deux conventions : l'espace collée au début du mot suivant (« ␣le »), ou à la fin du mot précédent (« le␣ »). On retient la convention dont la somme des tokens par mot redonne exactement le total. Pour la convention « en fin de mot », chaque mot est mesuré sans son espace, puisque l'API ignore une espace en fin de message.
2. On sonde les préfixes à l'intérieur de chaque mot de plus d'un token : chaque hausse du compte ouvre un nouveau token.

Le découpage est **validé** si une convention donne la somme exacte et si chaque courbe de préfixes est croissante, donc sans fusion ambiguë. Si une courbe redescend, le tokenizer fusionne des morceaux en cours de mot : le nombre de tokens du mot reste sûr, mais pas ses coupures internes.

Quand les deux conventions donnent la somme exacte, la méthode ne permet pas de trancher ; le tableau l'indique. **Indice** : avec le tokenizer actuel, « ␣le » mesuré seul vaut 2 tokens (l'espace d'un côté, « le » de l'autre), contre 1 avec l'ancien. Même validé, il reste une estimation cohérente, pas la segmentation officielle. \`␣\` représente une espace. Script : \`decouper.mjs\` ; ${journal.length} appels consignés dans \`decoupage.json\`.

| Modèle | Langue | Phrase | Tokens | Somme par mot, selon la convention | Convention retenue | Segments estimés | Validé |
|---|---|---|---|---|---|---|---|
${md.join('\n')}
`);
console.log(`${journal.length} appels.`);
console.log(md.join('\n'));
