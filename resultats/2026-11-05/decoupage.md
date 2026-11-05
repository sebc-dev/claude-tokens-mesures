# Découpage estimé en tokens — 2026-11-05

Le tokenizer de Claude n'est pas public : `count_tokens` renvoie un nombre, pas les coupures. Les coupures ci-dessous sont **estimées** en deux temps.

1. La phrase est découpée en mots selon deux conventions : l'espace collée au début du mot suivant (« ␣le »), ou à la fin du mot précédent (« le␣ »). On retient la convention dont la somme des tokens par mot redonne exactement le total. Pour la convention « en fin de mot », chaque mot est mesuré sans son espace, puisque l'API ignore une espace en fin de message.
2. On sonde les préfixes à l'intérieur de chaque mot de plus d'un token : chaque hausse du compte ouvre un nouveau token.

Le découpage est **validé** si une convention donne la somme exacte et si chaque courbe de préfixes est croissante, donc sans fusion ambiguë. Si une courbe redescend, le tokenizer fusionne des morceaux en cours de mot : le nombre de tokens du mot reste sûr, mais pas ses coupures internes.

Quand les deux conventions donnent la somme exacte, la méthode ne permet pas de trancher ; le tableau l'indique. **Indice** : avec le tokenizer actuel, « ␣le » mesuré seul vaut 2 tokens (l'espace d'un côté, « le » de l'autre), contre 1 avec l'ancien. Même validé, il reste une estimation cohérente, pas la segmentation officielle. `␣` représente une espace. Script : `decouper.mjs` ; 107 appels consignés dans `decoupage.json`.

| Modèle | Langue | Phrase | Tokens | Somme par mot, selon la convention | Convention retenue | Segments estimés | Validé |
|---|---|---|---|---|---|---|---|
| claude-opus-5-5 | FR | « corrige le calcul du net à payer » | **12** | espace en tête de mot : 18 ; espace en fin de mot : 12 | espace en fin de mot | `co` · `rri` · `ge␣` · `le␣` · `c` · `alc` · `ul␣` · `du␣` · `net␣` · `à␣` · `p` · `ayer` | oui |
| claude-opus-5-5 | EN | « fix the net pay calculation » | **9** | espace en tête de mot : 13 ; espace en fin de mot : 9 | espace en fin de mot | `f` · `ix␣` · `the␣` · `net␣` · `p` · `ay␣` · `c` · `alc` · `ulati` · `on` | mots : oui ; coupures internes ambiguës pour « calculation » (3 tokens ; préfixes : 1, 2, 2, 2, 3, 3, 3, 3, 3, 4, 3) |
| claude-haiku-4-5 | FR | « corrige le calcul du net à payer » | **10** | espace en tête de mot : 10 ; espace en fin de mot : 10 | indéterminée (les 2 sommes sont exactes) | `cor` · `rige` · `␣le` · `␣calc` · `ul` · `␣du` · `␣net` · `␣à` · `␣pay` · `er` | oui |
| claude-haiku-4-5 | EN | « fix the net pay calculation » | **5** | espace en tête de mot : 5 ; espace en fin de mot : 5 | indéterminée (les 2 sommes sont exactes) | `fix` · `␣the` · `␣net` · `␣pay` · `␣calculation` | oui |
