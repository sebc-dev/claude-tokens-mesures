#!/usr/bin/env node
// Mesures de tokens des modèles Claude via l'endpoint gratuit /v1/messages/count_tokens.
//
//   node --env-file=.env mesurer.mjs                  mesure tout, écrit resultats/<date>/
//   node mesurer.mjs --verifier                        télécharge et vérifie les sources (sans clé)
//
// Options : --actuel claude-opus-5-5  --ancien claude-haiku-4-5  --sortie resultats/<date>
// Les sources tierces (sources.json) sont épinglées sur un commit et vérifiées par SHA-256 ;
// elles sont téléchargées dans .cache/ et ne sont pas redistribuées dans ce dépôt.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const ACTUEL = opt('actuel', 'claude-opus-5-5');
const ANCIEN = opt('ancien', 'claude-haiku-4-5'); // tokenizer antérieur à Claude Opus 4.7
const DATE = new Date().toISOString().slice(0, 10);
const SORTIE = join(ICI, opt('sortie', join('resultats', DATE)));
const VERIFIER = args.includes('--verifier');
const CLE = process.env.ANTHROPIC_API_KEY;

// ------------------------------------------------------------------ sources
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const SOURCES = JSON.parse(readFileSync(join(ICI, 'sources.json'), 'utf8'));
mkdirSync(join(ICI, '.cache'), { recursive: true });
const txt = {};
for (const s of SOURCES) {
  const p = join(ICI, '.cache', createHash('sha1').update(s.url).digest('hex') + '.txt');
  if (!existsSync(p)) {
    const r = await fetch(s.url);
    if (!r.ok) throw new Error(`${s.url} : HTTP ${r.status}`);
    writeFileSync(p, Buffer.from(await r.arrayBuffer()));
  }
  const brut = readFileSync(p);
  if (sha256(brut) !== s.sha256) throw new Error(`Empreinte différente pour ${s.id} : la source a changé ou le téléchargement est corrompu.`);
  txt[s.id] = brut.toString('utf8');
}
txt['corpus:fr'] = readFileSync(join(ICI, 'corpus', 'corpus-fr.txt'), 'utf8');
txt['corpus:en'] = readFileSync(join(ICI, 'corpus', 'corpus-en.txt'), 'utf8');
if (VERIFIER) { console.log(`${SOURCES.length} sources vérifiées (SHA-256 conformes).`); process.exit(0); }
if (!CLE) { console.error('ANTHROPIC_API_KEY absente : créer .env (voir .env.example) et lancer avec node --env-file=.env.'); process.exit(1); }

// ------------------------------------------------------------------ API, avec journal brut
const journal = [];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function compter(modele, texte, etiquette) {
  for (let essai = 0; essai < 6; essai++) {
    const r = await fetch('https://api.anthropic.com/v1/messages/count_tokens', {
      method: 'POST',
      headers: { 'x-api-key': CLE, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: modele, messages: [{ role: 'user', content: texte }] }),
    });
    if (r.status === 429 || r.status >= 500) { await pause(2000 * (essai + 1)); continue; }
    if (!r.ok) throw new Error(`${modele} (${etiquette}) : HTTP ${r.status} ${await r.text()}`);
    const n = (await r.json()).input_tokens;
    journal.push({ modele, etiquette, sha256_texte: sha256(texte), caracteres: [...texte].length, input_tokens: n });
    await pause(200);
    return n;
  }
  throw new Error(`${modele} (${etiquette}) : trop d'échecs`);
}

// ------------------------------------------------------------------ outils de texte
const proseMdn = (md) => md.replace(/^---[\s\S]*?\n---\n/, '').replace(/```[\s\S]*?```/g, '')
  .replace(/\{\{[^}]*\}\}/g, '').replace(/`[^`\n]*`/g, '').replace(/\n{3,}/g, '\n\n').trim();
const stricte = (t) => t.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ');
const MOTS = {
  A: (t) => (t.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) ?? []).length,
  B: (t) => (t.replace(/\b([cdjlmnst]|qu|jusqu|lorsqu|puisqu|quoiqu)[’']/giu, '$1 ').match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) ?? []).length,
  C: (t) => t.split(/\s+/u).filter((s) => /[\p{L}\p{N}]/u.test(s)).length,
  WC: (t) => t.split(/\s+/u).filter(Boolean).length,
};
const lignesNonVides = (t) => t.split('\n').filter((l) => l.trim()).length;
const lignesNonAscii = (t) => t.split('\n').filter((l) => /[^\x00-\x7F]/.test(l)).length;
const f = (n, d = 2) => n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

const R = { date: DATE, modeles: { actuel: ACTUEL, ancien: ANCIEN } };
const md = [];
const P = (s = '') => md.push(s);

// ------------------------------------------------------------------ 1. enveloppe
const PHRASE = 'corrige le calcul du net à payer';
P('## 1. Méthode : enveloppe du message et stabilité');
P('');
P('`count_tokens` compte aussi l’enveloppe du message (rôle, balises). On la retranche après l’avoir mesurée de deux façons indépendantes :');
P('- **M1** : E = compte(« a ») − 1, en supposant que « a » vaut 1 token (contrôlé avec « b » et « x ») ;');
P('- **M2** : E = 2 × compte(T) − compte(T + espace + T), sans hypothèse sur la valeur d’un token, sur trois textes T terminés par « ; ».');
P('');
P('On contrôle aussi qu’un retour à la ligne final ne coûte rien (il est absorbé) et que trois appels identiques donnent le même compte.');
P('');
P('| Modèle | M1 « a » | M1 « b », « x » | M2 phrase | M2 texte FR | M2 texte EN | « \\n » final | 3 appels identiques |');
P('|---|---|---|---|---|---|---|---|');
R.enveloppe = {};
for (const m of [ACTUEL, ANCIEN]) {
  const c = async (t, e) => compter(m, t, e);
  const a = await c('a', 'témoin a'), b = await c('b', 'témoin b'), x = await c('x', 'témoin x');
  const m2 = async (t, e) => { const T = t.trim() + ' ;'; return 2 * (await c(T, `M2 ${e}`)) - (await c(T + ' ' + T, `M2 ${e} doublé`)); };
  const e2 = [await m2(PHRASE, 'phrase'), await m2(txt['corpus:fr'], 'corpus fr'), await m2(txt['corpus:en'], 'corpus en')];
  const nl = (await c(PHRASE + '\n', 'phrase + \\n')) - (await c(PHRASE, 'phrase'));
  const stab = [await c(txt['corpus:fr'], 'stabilité 1'), await c(txt['corpus:fr'], 'stabilité 2'), await c(txt['corpus:fr'], 'stabilité 3')];
  const E = a - 1;
  if (b - 1 !== E || x - 1 !== E || e2.some((v) => v !== E)) console.error(`Attention : enveloppe incohérente sur ${m}`);
  R.enveloppe[m] = { M1: E, M1_controles: [b - 1, x - 1], M2: e2, retour_ligne_final: nl, stabilite: stab };
  P(`| ${m} | ${E} | ${b - 1}, ${x - 1} | ${e2[0]} | ${e2[1]} | ${e2[2]} | ${nl} | ${stab.join(' / ')} |`);
}
const tok = async (m, t, e) => (await compter(m, t, e)) - R.enveloppe[m].M1;
P('');

// ------------------------------------------------------------------ 2. phrase
P('## 2. La phrase « corrige le calcul du net à payer »');
P('');
R.phrase = {};
for (const m of [ACTUEL, ANCIEN]) R.phrase[m] = await tok(m, PHRASE, 'phrase');
P(`7 mots → **${R.phrase[ACTUEL]} tokens** sur ${ACTUEL}, ${R.phrase[ANCIEN]} sur ${ANCIEN}.`);
P('');

// ------------------------------------------------------------------ 3. prime du français
P('## 3. Prime du français (tokens FR / tokens EN, même contenu)');
P('');
const pages = [...new Set(SOURCES.filter((s) => s.groupe === 'mdn').map((s) => s.page))];
const mdnPage = (p, l, nettoyer) => { const t = proseMdn(txt[`mdn:${p}:${l}`]); return nettoyer ? stricte(t) : t; };
const alignement = pages.map((p) => ({ page: p, rapport: MOTS.C(mdnPage(p, 'fr', true)) / MOTS.C(mdnPage(p, 'en', true)) }));
const alignees = alignement.filter((a) => a.rapport >= 1.0 && a.rapport <= 1.3).map((a) => a.page);
const corpus = [
  { id: 'ntrex', nom: 'NTREX-128 (actualité, 1 997 phrases)', fr: txt['ntrex:fr'], en: txt['ntrex:en'], prose: true },
  { id: 'mdn-brut', nom: `MDN, ${alignees.length} pages alignées (Markdown, liens compris)`, fr: alignees.map((p) => mdnPage(p, 'fr')).join('\n\n'), en: alignees.map((p) => mdnPage(p, 'en')).join('\n\n'), prose: false },
  { id: 'mdn-prose', nom: `MDN, ${alignees.length} pages alignées (prose stricte)`, fr: alignees.map((p) => mdnPage(p, 'fr', true)).join('\n\n'), en: alignees.map((p) => mdnPage(p, 'en', true)).join('\n\n'), prose: true },
  { id: 'corpus', nom: 'Texte parallèle rédigé pour ces mesures (~280 mots)', fr: txt['corpus:fr'], en: txt['corpus:en'], prose: true },
];
P('Les pages MDN n’entrent dans le calcul que si leur traduction est alignée : rapport de mots FR/EN entre 1,0 et 1,3 (NTREX : ~1,13).');
P('');
P('| Page MDN | Mots FR / EN | Retenue |');
P('|---|---|---|');
for (const a of alignement) P(`| ${a.page} | ${f(a.rapport)} | ${alignees.includes(a.page) ? 'oui' : '**non** (traduction non alignée)'} |`);
P('');
P(`| Corpus | Tokens EN | Tokens FR | Prime (${ACTUEL}) | Prime (${ANCIEN}) | Hausse nouveau/ancien tokenizer, EN | idem, FR |`);
P('|---|---|---|---|---|---|---|');
R.prime = {};
for (const c of corpus) {
  const v = {};
  for (const m of [ACTUEL, ANCIEN]) v[m] = { en: await tok(m, c.en, `${c.id} en`), fr: await tok(m, c.fr, `${c.id} fr`) };
  R.prime[c.id] = { nom: c.nom, tokens: v, prime: { [ACTUEL]: v[ACTUEL].fr / v[ACTUEL].en, [ANCIEN]: v[ANCIEN].fr / v[ANCIEN].en } };
  c.tok = v[ACTUEL];
  P(`| ${c.nom} | ${v[ACTUEL].en} | ${v[ACTUEL].fr} | **${f(v[ACTUEL].fr / v[ACTUEL].en)}** | ${f(v[ANCIEN].fr / v[ANCIEN].en)} | +${f((v[ACTUEL].en / v[ANCIEN].en - 1) * 100, 0)} % | +${f((v[ACTUEL].fr / v[ANCIEN].fr - 1) * 100, 0)} % |`);
}
P('');

// ------------------------------------------------------------------ 4. mots pour 1 000 tokens
P(`## 4. Mots pour 1 000 tokens (${ACTUEL}) et sensibilité au comptage des mots`);
P('');
P('Conventions : **A** élisions et traits d’union joints · **B** élisions séparées (« l’équipe » = 2) · **C** traitement de texte (séparation sur les espaces, ponctuation isolée ignorée), retenue pour le repère · **wc** équivalent de `wc -w`.');
P('');
P('| Corpus | Langue | Tokens | Mots A | B | C | wc | Mots / 1 000 tokens (C) | Écart max A/B/C |');
P('|---|---|---|---|---|---|---|---|---|');
const rep = { fr: [], en: [] };
R.mots = {};
for (const c of corpus) {
  for (const l of ['fr', 'en']) {
    const n = Object.fromEntries(Object.entries(MOTS).map(([k, fn]) => [k, fn(c[l])]));
    const par1000 = (1000 * n.C) / c.tok[l];
    if (c.prose) rep[l].push(par1000);
    R.mots[`${c.id}:${l}`] = { ...n, tokens: c.tok[l], mots_pour_1000_tokens_C: par1000 };
    const ecart = (Math.max(n.A, n.B, n.C) / Math.min(n.A, n.B, n.C) - 1) * 100;
    P(`| ${c.nom} | ${l.toUpperCase()} | ${c.tok[l]} | ${n.A} | ${n.B} | ${n.C} | ${n.WC} | **${f(par1000, 0)}** | ${f(ecart, 1)} % |`);
  }
}
R.repere = { fr: [Math.min(...rep.fr), Math.max(...rep.fr)], en: [Math.min(...rep.en), Math.max(...rep.en)] };
P('');
P(`**Repère (prose seulement, convention C) : 1 000 tokens ≈ ${f(R.repere.fr[0], 0)} à ${f(R.repere.fr[1], 0)} mots en français, ${f(R.repere.en[0], 0)} à ${f(R.repere.en[1], 0)} mots en anglais.** Le Markdown brut est exclu du repère : ses adresses de lien consomment des tokens sans être des mots lus.`);
P('');

// ------------------------------------------------------------------ 5. code en anglais
P(`## 5. Code open source entièrement en anglais (${ACTUEL})`);
P('');
P('| Fichier | Lignes non vides | Lignes non ASCII | Tokens | Tokens / ligne | Caractères / token | Pour 500 lignes | Tokens sur ' + ANCIEN + ' |');
P('|---|---|---|---|---|---|---|---|');
const tpl = [];
R.code = {};
for (const s of SOURCES.filter((x) => x.groupe === 'code')) {
  const t = txt[s.id];
  const n = await tok(ACTUEL, t, s.id), o = await tok(ANCIEN, t, `${s.id} ancien`);
  const l = lignesNonVides(t);
  tpl.push(n / l);
  R.code[s.id] = { lignes_non_vides: l, lignes_non_ascii: lignesNonAscii(t), tokens: n, tokens_ancien: o };
  P(`| ${s.libelle} | ${l} | ${lignesNonAscii(t)} | ${n} | ${f(n / l, 1)} | ${f([...t].length / n)} | ~${Math.round((n / l) * 500).toLocaleString('fr-FR')} | ${o} (+${f((n / o - 1) * 100, 0)} %) |`);
}
R.code_median_tokens_par_ligne = med(tpl);
P('');
P(`Médiane : **${f(med(tpl), 1)} tokens par ligne non vide** (de ${f(Math.min(...tpl), 1)} à ${f(Math.max(...tpl), 1)}), soit ~${Math.round(med(tpl) * 500).toLocaleString('fr-FR')} tokens pour 500 lignes et ~${Math.round(1e6 / med(tpl)).toLocaleString('fr-FR')} lignes pour 1 M de tokens.`);
P('');

// ------------------------------------------------------------------ sortie
P('## Sources');
P('');
P('| Source | Licence | SHA-256 |');
P('|---|---|---|');
for (const s of SOURCES) P(`| [${s.libelle}](${s.url}) | ${s.licence} | \`${s.sha256.slice(0, 16)}…\` |`);
P('| Texte parallèle `corpus/corpus-fr.txt` / `corpus-en.txt` (ce dépôt) | CC BY 4.0 | ' + `\`${sha256(txt['corpus:fr']).slice(0, 16)}…\` / \`${sha256(txt['corpus:en']).slice(0, 16)}…\` |`);

mkdirSync(SORTIE, { recursive: true });
writeFileSync(join(SORTIE, 'mesures.json'), JSON.stringify({ ...R, appels: journal }, null, 2) + '\n');
writeFileSync(join(SORTIE, 'resultats.md'), `# Mesures de tokens — ${DATE}

Modèles : **${ACTUEL}** (tokenizer actuel) et **${ANCIEN}** (tokenizer antérieur à Claude Opus 4.7). Endpoint : \`POST /v1/messages/count_tokens\`. ${journal.length} appels, tous consignés dans \`mesures.json\` (modèle, étiquette, SHA-256 du texte envoyé, nombre de caractères, \`input_tokens\` renvoyé).

${md.join('\n')}
`);
console.log(`${journal.length} appels. Résultats : ${SORTIE}/resultats.md et mesures.json`);
