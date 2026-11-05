# Mesures de tokens — 2026-11-05

Modèles : **claude-opus-5-5** (tokenizer actuel) et **claude-haiku-4-5** (tokenizer antérieur à Claude Opus 4.7). Endpoint : `POST /v1/messages/count_tokens`. 58 appels, tous consignés dans `mesures.json` (modèle, étiquette, SHA-256 du texte envoyé, nombre de caractères, `input_tokens` renvoyé).

## 1. Méthode : enveloppe du message et stabilité

`count_tokens` compte aussi l’enveloppe du message (rôle, balises). On la retranche après l’avoir mesurée de deux façons indépendantes :
- **M1** : E = compte(« a ») − 1, en supposant que « a » vaut 1 token (contrôlé avec « b » et « x ») ;
- **M2** : E = 2 × compte(T) − compte(T + espace + T), sans hypothèse sur la valeur d’un token, sur trois textes T terminés par « ; ».

On contrôle aussi qu’un retour à la ligne final ne coûte rien (il est absorbé) et que trois appels identiques donnent le même compte.

| Modèle | M1 « a » | M1 « b », « x » | M2 phrase | M2 texte FR | M2 texte EN | « \n » final | 3 appels identiques |
|---|---|---|---|---|---|---|---|
| claude-opus-5-5 | 8 | 8, 8 | 8 | 8 | 8 | 0 | 684 / 684 / 684 |
| claude-haiku-4-5 | 7 | 7, 7 | 7 | 7 | 7 | 0 | 527 / 527 / 527 |

## 2. La phrase « corrige le calcul du net à payer »

7 mots → **12 tokens** sur claude-opus-5-5, 10 sur claude-haiku-4-5.

## 3. Prime du français (tokens FR / tokens EN, même contenu)

Les pages MDN n’entrent dans le calcul que si leur traduction est alignée : rapport de mots FR/EN entre 1,0 et 1,3 (NTREX : ~1,13).

| Page MDN | Mots FR / EN | Retenue |
|---|---|---|
| web/javascript/guide/introduction | 1,08 | oui |
| web/javascript/guide/functions | 1,23 | oui |
| web/javascript/guide/using_promises | 0,51 | **non** (traduction non alignée) |
| web/http/guides/overview | 1,16 | oui |
| learn_web_development/core/scripting/what_is_javascript | 1,00 | oui |

| Corpus | Tokens EN | Tokens FR | Prime (claude-opus-5-5) | Prime (claude-haiku-4-5) | Hausse nouveau/ancien tokenizer, EN | idem, FR |
|---|---|---|---|---|---|---|
| NTREX-128 (actualité, 1 997 phrases) | 83987 | 122128 | **1,45** | 1,57 | +43 % | +33 % |
| MDN, 4 pages alignées (Markdown, liens compris) | 20987 | 31313 | **1,49** | 1,49 | +39 % | +39 % |
| MDN, 4 pages alignées (prose stricte) | 18061 | 27766 | **1,54** | 1,55 | +39 % | +38 % |
| Texte parallèle rédigé pour ces mesures (~280 mots) | 455 | 676 | **1,49** | 1,57 | +37 % | +30 % |

## 4. Mots pour 1 000 tokens (claude-opus-5-5) et sensibilité au comptage des mots

Conventions : **A** élisions et traits d’union joints · **B** élisions séparées (« l’équipe » = 2) · **C** traitement de texte (séparation sur les espaces, ponctuation isolée ignorée), retenue pour le repère · **wc** équivalent de `wc -w`.

| Corpus | Langue | Tokens | Mots A | B | C | wc | Mots / 1 000 tokens (C) | Écart max A/B/C |
|---|---|---|---|---|---|---|---|---|
| NTREX-128 (actualité, 1 997 phrases) | FR | 122128 | 47486 | 50130 | 47415 | 48791 | **388** | 5,7 % |
| NTREX-128 (actualité, 1 997 phrases) | EN | 83987 | 42108 | 42110 | 41902 | 42034 | **499** | 0,5 % |
| MDN, 4 pages alignées (Markdown, liens compris) | FR | 31313 | 11707 | 12215 | 10778 | 11143 | **344** | 13,3 % |
| MDN, 4 pages alignées (Markdown, liens compris) | EN | 20987 | 10479 | 10479 | 9691 | 9971 | **462** | 8,1 % |
| MDN, 4 pages alignées (prose stricte) | FR | 27766 | 10819 | 11332 | 10737 | 11198 | **387** | 5,5 % |
| MDN, 4 pages alignées (prose stricte) | EN | 18061 | 9712 | 9712 | 9666 | 9949 | **535** | 0,5 % |
| Texte parallèle rédigé pour ces mesures (~280 mots) | FR | 676 | 281 | 301 | 281 | 285 | **416** | 7,1 % |
| Texte parallèle rédigé pour ces mesures (~280 mots) | EN | 455 | 276 | 276 | 276 | 276 | **607** | 0,0 % |

**Repère (prose seulement, convention C) : 1 000 tokens ≈ 387 à 416 mots en français, 499 à 607 mots en anglais.** Le Markdown brut est exclu du repère : ses adresses de lien consomment des tokens sans être des mots lus.

## 5. Code open source entièrement en anglais (claude-opus-5-5)

| Fichier | Lignes non vides | Lignes non ASCII | Tokens | Tokens / ligne | Caractères / token | Pour 500 lignes | Tokens sur claude-haiku-4-5 |
|---|---|---|---|---|---|---|---|
| Python — psf/requests/src/requests/sessions.py | 758 | 0 | 11972 | 15,8 | 2,85 | ~7 897 | 9016 (+33 %) |
| TypeScript — sindresorhus/ky/source/core/Ky.ts | 1144 | 0 | 21267 | 18,6 | 2,51 | ~9 295 | 15655 (+36 %) |
| JavaScript — expressjs/express/lib/response.js | 908 | 0 | 10146 | 11,2 | 2,47 | ~5 587 | 8350 (+22 %) |
| Go — golang/go/src/strings/strings.go | 1192 | 0 | 15266 | 12,8 | 2,26 | ~6 404 | 12401 (+23 %) |
| Java — google/guava/guava/src/com/google/common/base/Strings.java | 295 | 0 | 4771 | 16,2 | 2,68 | ~8 086 | 3762 (+27 %) |
| PHP — laravel/framework/src/Illuminate/Support/Str.php | 1840 | 2 | 25821 | 14,0 | 2,54 | ~7 017 | 21268 (+21 %) |

Médiane : **14,9 tokens par ligne non vide** (de 11,2 à 18,6), soit ~7 457 tokens pour 500 lignes et ~67 053 lignes pour 1 M de tokens.

## Sources

| Source | Licence | SHA-256 |
|---|---|---|
| [NTREX-128 newstest2019, référence française](https://raw.githubusercontent.com/MicrosoftTranslator/NTREX/468c6b69c7f6a75d31d4743d9daba2af566cc18d/NTREX-128/newstest2019-ref.fra.txt) | CC-BY-SA-4.0 | `1dd80d337f6a75c6…` |
| [NTREX-128 newstest2019, source anglaise](https://raw.githubusercontent.com/MicrosoftTranslator/NTREX/468c6b69c7f6a75d31d4743d9daba2af566cc18d/NTREX-128/newstest2019-src.eng.txt) | CC-BY-SA-4.0 | `389e8f5796c66db4…` |
| [MDN web/javascript/guide/introduction (en-US)](https://raw.githubusercontent.com/mdn/content/5c76c9c822b4083750ff7fcabcd07422ad3a591b/files/en-us/web/javascript/guide/introduction/index.md) | CC-BY-SA-2.5 (prose MDN) | `faeb63304f01f63d…` |
| [MDN web/javascript/guide/introduction (fr)](https://raw.githubusercontent.com/mdn/translated-content/fd64e208d746f44034cef9530b6a939c13b86639/files/fr/web/javascript/guide/introduction/index.md) | CC-BY-SA-2.5 (prose MDN) | `93b542522b9946b1…` |
| [MDN web/javascript/guide/functions (en-US)](https://raw.githubusercontent.com/mdn/content/5c76c9c822b4083750ff7fcabcd07422ad3a591b/files/en-us/web/javascript/guide/functions/index.md) | CC-BY-SA-2.5 (prose MDN) | `11e59a5c148dd61a…` |
| [MDN web/javascript/guide/functions (fr)](https://raw.githubusercontent.com/mdn/translated-content/fd64e208d746f44034cef9530b6a939c13b86639/files/fr/web/javascript/guide/functions/index.md) | CC-BY-SA-2.5 (prose MDN) | `03b00daeb2e04ab6…` |
| [MDN web/javascript/guide/using_promises (en-US)](https://raw.githubusercontent.com/mdn/content/5c76c9c822b4083750ff7fcabcd07422ad3a591b/files/en-us/web/javascript/guide/using_promises/index.md) | CC-BY-SA-2.5 (prose MDN) | `f7af04e405c512d3…` |
| [MDN web/javascript/guide/using_promises (fr)](https://raw.githubusercontent.com/mdn/translated-content/fd64e208d746f44034cef9530b6a939c13b86639/files/fr/web/javascript/guide/using_promises/index.md) | CC-BY-SA-2.5 (prose MDN) | `0dd764bd79c70152…` |
| [MDN web/http/guides/overview (en-US)](https://raw.githubusercontent.com/mdn/content/5c76c9c822b4083750ff7fcabcd07422ad3a591b/files/en-us/web/http/guides/overview/index.md) | CC-BY-SA-2.5 (prose MDN) | `a04dcfc8a443a2c7…` |
| [MDN web/http/guides/overview (fr)](https://raw.githubusercontent.com/mdn/translated-content/fd64e208d746f44034cef9530b6a939c13b86639/files/fr/web/http/guides/overview/index.md) | CC-BY-SA-2.5 (prose MDN) | `67860da581080ed7…` |
| [MDN learn_web_development/core/scripting/what_is_javascript (en-US)](https://raw.githubusercontent.com/mdn/content/5c76c9c822b4083750ff7fcabcd07422ad3a591b/files/en-us/learn_web_development/core/scripting/what_is_javascript/index.md) | CC-BY-SA-2.5 (prose MDN) | `6228a40a77e3937a…` |
| [MDN learn_web_development/core/scripting/what_is_javascript (fr)](https://raw.githubusercontent.com/mdn/translated-content/fd64e208d746f44034cef9530b6a939c13b86639/files/fr/learn_web_development/core/scripting/what_is_javascript/index.md) | CC-BY-SA-2.5 (prose MDN) | `aa9aaeb159b071cd…` |
| [Python — psf/requests/src/requests/sessions.py](https://raw.githubusercontent.com/psf/requests/3c7baaa05ab4aa49cc819ce3a819d260de19c157/src/requests/sessions.py) | Apache-2.0 | `3d2089736ced93b2…` |
| [TypeScript — sindresorhus/ky/source/core/Ky.ts](https://raw.githubusercontent.com/sindresorhus/ky/3541888878c4d303a8bc2ad61815f4e048f55a5d/source/core/Ky.ts) | MIT | `6b11f97688184630…` |
| [JavaScript — expressjs/express/lib/response.js](https://raw.githubusercontent.com/expressjs/express/43fca52d28a422c8be48fd489cbd4f2d6152bab6/lib/response.js) | MIT | `efe24afe2978d0bf…` |
| [Go — golang/go/src/strings/strings.go](https://raw.githubusercontent.com/golang/go/908f2642cb0fab5d4238d1bb8b5b08837344acfc/src/strings/strings.go) | BSD-3-Clause | `16fa8e209f272e75…` |
| [Java — google/guava/guava/src/com/google/common/base/Strings.java](https://raw.githubusercontent.com/google/guava/592a1e6bf8b3370dde28e778931ccdf5242b1d0c/guava/src/com/google/common/base/Strings.java) | Apache-2.0 | `452c6456b0846359…` |
| [PHP — laravel/framework/src/Illuminate/Support/Str.php](https://raw.githubusercontent.com/laravel/framework/64dc24f5d965add4d402b4b8b64f59b561112af5/src/Illuminate/Support/Str.php) | MIT | `4c9bd077de3fa26d…` |
| Texte parallèle `corpus/corpus-fr.txt` / `corpus-en.txt` (ce dépôt) | CC BY 4.0 | `19cbaff2302548de…` / `584f4f07512368e4…` |
