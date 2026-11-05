# Mesures de tokens des modèles Claude

Données et scripts derrière les chiffres de l'épisode 1 de la série « Claude Code pour développeurs » de [sebc.dev](https://sebc.dev) (vidéo et article). Toutes les mesures se rejouent avec une clé API, gratuitement : l'endpoint [`count_tokens`](https://platform.claude.com/docs/en/build-with-claude/token-counting) ne facture rien.

*English summary below.*

## Résultats (mesure du 5 novembre 2026)

Le détail complet est dans [`resultats/2026-11-05/resultats.md`](resultats/2026-11-05/resultats.md). Le journal brut des 58 appels se trouve dans [`mesures.json`](resultats/2026-11-05/mesures.json) : pour chaque appel, le modèle, le SHA-256 du texte envoyé et le nombre de tokens renvoyé.

| Question | Résultat sur `claude-opus-5-5` |
|---|---|
| Combien de tokens pour « corrige le calcul du net à payer » (7 mots) ? | **12 tokens**, contre 10 sur l'ancien tokenizer (`claude-haiku-4-5`) |
| Combien de tokens en plus pour le même contenu en français ? | **× 1,45** sur NTREX-128 (actualité), **× 1,49 à × 1,54** sur la documentation technique MDN |
| Combien de mots tiennent dans 1 000 tokens ? | **~400 mots en français** (387 à 416), **500 à 600 en anglais** (499 à 607), sur de la prose |
| Le tokenizer actuel produit-il plus de tokens que l'ancien ? | Oui : **+30 à +43 %** sur la prose, **+21 à +36 %** sur le code |
| Combien de tokens pèse une ligne de code en anglais ? | Médiane de **14,9 tokens par ligne non vide** (de 11,2 à 18,6), soit **~7 500 tokens pour 500 lignes** |

Pour comparaison : [Serval, *The Invisible Language Tax* (arXiv:2609.39001)](https://arxiv.org/abs/2609.39001) publie un facteur de 1,45 (IC 95 % 1,44–1,47) pour le tokenizer Claude 5 sur NTREX-128. On retrouve exactement cette valeur.

## Méthode

- **Endpoint** : `POST /v1/messages/count_tokens`. Chaque texte est envoyé seul, dans un unique message `user`.
- **Enveloppe** : le compte inclut l'enveloppe du message (8 tokens sur `claude-opus-5-5`, 7 sur `claude-haiku-4-5`), qu'on retranche. Elle est mesurée de deux façons indépendantes, qui concordent : témoin d'un token (« a », contrôlé avec « b » et « x »), et différence entre un texte et ce même texte doublé. Trois appels identiques donnent le même compte. Un retour à la ligne final ne coûte aucun token.
- **Ancien tokenizer** : `claude-haiku-4-5` sert de référence. Il est antérieur à Claude Opus 4.7, à partir duquel la documentation annonce environ 30 % de tokens en plus pour un même texte ([models overview](https://platform.claude.com/docs/en/about-claude/models/overview)).
- **Textes parallèles** :
  - NTREX-128 (newstest2019, 1 997 phrases traduites par des professionnels) ;
  - 5 pages MDN en anglais et en français. Une page n'est retenue que si sa traduction est alignée (rapport de mots FR/EN entre 1,0 et 1,3) : 4 sur 5 le sont. Pour la variante « prose », les blocs de code, le code en ligne, les macros, les adresses de lien, les balises et les entités sont retirés ;
  - un court texte rédigé pour ces mesures (`corpus/`).
- **Mots** : trois conventions sont comparées (élisions jointes, élisions séparées, traitement de texte). Sur de la prose, elles s'écartent d'au plus ~7 % en français et de moins de 1 % en anglais. Le repère utilise la convention « traitement de texte ».
- **Code** : un fichier open source par langage (Python, TypeScript, JavaScript, Go, Java, PHP), sans texte non anglais (contrôle des lignes non ASCII). Seules les lignes non vides sont comptées.
- **Sources figées** : chaque source tierce est épinglée sur un commit et vérifiée par SHA-256 ([`sources.json`](sources.json)). Elle est téléchargée à la volée dans `.cache/` et n'est pas redistribuée ici.

## Rejouer les mesures

Prérequis : Node.js 20.6 ou plus récent (pour `--env-file`), et une clé API Anthropic.

```bash
cp .env.example .env        # puis renseigner ANTHROPIC_API_KEY
node mesurer.mjs --verifier # télécharge les sources et vérifie leurs empreintes (sans clé)
node --env-file=.env mesurer.mjs   # écrit resultats/<date>/resultats.md et mesures.json
```

Options : `--actuel <modèle>` et `--ancien <modèle>` pour comparer d'autres modèles. Si un tokenizer change, une nouvelle mesure s'ajoute dans un nouveau dossier daté, et les précédentes restent consultables.

## Limites

- Un seul fichier par langage de programmation : la médiane de tokens par ligne repose sur six fichiers.
- Les traductions MDN sont faites par la communauté, et l'alignement n'est contrôlé que par le nombre de mots.
- Le tokenizer de Claude n'est pas public : les mesures portent sur ce que renvoie l'API à la date indiquée.

## Licences

- Scripts : [MIT](LICENSE).
- Textes de `corpus/` : [CC BY 4.0](corpus/LICENCE.md).
- Sources tierces : non redistribuées, sous leurs propres licences, indiquées dans [`sources.json`](sources.json) : NTREX-128 CC BY-SA 4.0, prose MDN CC BY-SA 2.5, code Apache-2.0, MIT ou BSD-3-Clause.

---

## English summary

Data and scripts behind the figures in episode 1 of the sebc.dev series *Claude Code for developers*. Every measurement can be re-run for free with an API key, through the [`count_tokens`](https://platform.claude.com/docs/en/build-with-claude/token-counting) endpoint.

Key results on `claude-opus-5-5` (5 November 2026):
- **French needs 1.45× the tokens of English** on NTREX-128, which matches [Serval (arXiv:2609.39001)](https://arxiv.org/abs/2609.39001) exactly, and **1.49–1.54×** on MDN technical documentation.
- **1,000 tokens ≈ 500–600 English words, ~400 French words** of prose.
- **The current tokenizer yields 30–43 % more tokens** than the previous one (`claude-haiku-4-5`) on prose, and 21–36 % more on code.
- **English source code: median of 14.9 tokens per non-empty line**, about 7,500 tokens for a 500-line file.

Method, sources (pinned to commits and verified by SHA-256) and limitations are described above. The full results are in [`resultats/2026-11-05/resultats.md`](resultats/2026-11-05/resultats.md), and the raw log of every API call is in [`mesures.json`](resultats/2026-11-05/mesures.json). To reproduce: `cp .env.example .env`, set `ANTHROPIC_API_KEY`, then run `node --env-file=.env mesurer.mjs`.
