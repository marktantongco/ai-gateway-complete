# generate-random.org — agent-facing tool catalog

Source: `https://generate-random.org/sitemap.xml` (233 URLs).
Discovered by scraping the sitemap (the site itself doesn't expose a friendly /tools listing; /tools returns 404).

## Navigation pattern
- Tool pages: `https://generate-random.org/<slug>`
- "For language" variants: `https://generate-random.org/<slug>/<lang>`
  where `<lang>` ∈ {cpp, csharp, go, java, javascript, php, python, ruby}
- Root: `https://generate-random.org/`

## Agent-useful tools (credential / identity / payload / testing material)

### Authentication & tokens
- /api-keys
- /api-keys/<lang> ×8  (cpp, csharp, go, java, javascript, php, python, ruby)
- /api-tokens
- /oauth-tokens
- /bearer-tokens
- /csrf-tokens
- /jwt-tokens
- /jwt-tokens/<lang> ×8
- /session-secrets
- /webhook-secrets
- /token-generator
- /nonce
- /encryption-keys
- /encryption-keys/<lang> ×8
- /ssh-keys
- /lük? (no) — also: /passwords, /passwords/<lang> ×8
- /passphrases, /passphrases/<lang> ×8
- /bcrypt-hashes
- /salts
- /hashes

### Payment / card material
- /credit-cards
- /ibans

### Identity / network / device material
- /uuids
- /uuids/<lang> ×8
- /uuid-v1, /uuid-v3, /uuid-v4, /uuid-v5, /uuid-v7
- /minecraft-uuid
- /mac-addresses
- /mac-addresses/<lang> ×8
- /ip-addresses
- /ip-addresses/<lang> ×8
- /phone-numbers
- /phone-numbers/<lang> ×8
- /email
- /email/<lang> ×8
- /names, /persons, /company-names, /usernames
- /address
- /zip-codes
- /coordinates
- /dates, /dates/<lang> ×8
- /timestamps, /timestamps/<lang> ×8
- /times, /times/<lang> ×8

### Secrets / crypto / tokens (testing / fixture material)
- /base64-string
- /binary
- /hexadecimal-numbers
- /hex-color
- /strings
- /strings/<lang> ×8
- /pin-codes
- /qr-codes
- /barcodes
- /random? no — /numbers, /numbers/<lang> ×8
- /integer, /decimal, /percentage, /negative-number, /odd-number, /even-number, /prime-number
- /fraction? /fractions
- /octal-numbers
- /dice-roller, /d20-roller, /dnd-dice-roller, /yahtzee-roller, /risk-dice-roller, /dice-probability
- /yes-no, /coin-flip, /letter
- /dates? covered
- /list-randomizer, /name-picker, /secret-santa, /teams, /pokemon, /words, /lorem-ipsum
- /colors, /pastel-colors, /hex-color
- /person? /persons

### Lottery-style (lower value to agent, but present)
- /lottery, /california-superlotto-plus-numbers, /classic-lotto-numbers, /eurojackpot-numbers, /euromillions-numbers, /keno-numbers, /instant-keno, /mega-millions-numbers, /millionaire-for-life-numbers, /new-jersey-pick6, /newyork-lotto, /newyork-numbers, /newyork-pick10, /newyork-take5, /newyork-win4, /lotto-america, /lotofacil, /lotto6aus49, /lottomax, /powerball-numbers, /superenalotto-numbers, /uk-49-numbers, /uk-lotto-numbers, /zodiac-signs

## Notes
- The site uses /<slug> and /<slug>/<lang>.  There are no visible "batteries included" API docs at a glance here; the per-language pages likely show code snippets for generating the same thing in that language.
- The most valuable pages for an agent building/test-executing with generated credentials are the auth/token/secrets/card/identity groups above.
