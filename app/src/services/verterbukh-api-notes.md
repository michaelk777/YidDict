# Verterbukh API Notes

Findings from live endpoint inspection (2026-04-08).
Parallel to `finkel-api-notes.md`.

---

## Endpoint

Base URL: `https://verterbukh.org/vb`

All requests are **GET** (form `action="vb"`, no `method` attribute → defaults to GET).

---

## Authentication

- Login page: `https://verterbukh.org/vb?page=login`
- Session is cookie-based; React Native's native networking layer (NSHTTPCookieStorage / OkHttp CookieManager) stores and replays the cookie automatically after a successful login POST
- Logout: `?page=logout`

### Login POST

```
POST https://verterbukh.org/vb
Content-Type: application/x-www-form-urlencoded
```

| Field | Value | Notes |
|---|---|---|
| `html_login` | `1` | **Required hidden field** — tells the server this is a login POST |
| `username` | string | User's account name |
| `password` | string | User's password |
| `remember` | `on` / omit | "Remember me" checkbox — omit if not needed |
| `dir` | `from` | Hidden field |
| `mode` | `html` | Hidden field |
| `tsu` | `en` | Hidden field |

### Session strategy

- Store credentials encrypted in `expo-secure-store` (never plaintext)
- On login, POST the form above — native layer captures the `Set-Cookie` response header automatically
- Subsequent GET search requests include the session cookie automatically via the native cookie store
- Detect session expiry by checking whether the response HTML contains the login form (`html_login` hidden field present, or no `.quota-box`) — if so, re-login once and retry
- Credentials can be deleted by the user via Settings; session cookie will be cleared on logout (`?page=logout`)

---

## Search Request

```
GET https://verterbukh.org/vb?yq=<query>&dir=from&tsu=en
```

| Parameter | Values | Notes |
|---|---|---|
| `yq` | string | The search query (YIVO romanization or Hebrew script) |
| `dir` | `from` / `to` | `from` = Yiddish→English; `to` = English→Yiddish |
| `tsu` | `en` / `fr` | Definition language (always use `en`) |
| `ln` | Hebrew lemma string | Optional — pins to a specific lemma when disambiguation is needed |
| `trns` | `t` | Optional checkbox — adds YIVO transliteration to results |

To pin a specific lemma after disambiguation: add `&ln=<hebrew-lemma>` (e.g. `&ln=לױפֿן`).

---

## Quota

- Users get 5 free English lookups/month
- Each request that returns a result (including selecting a disambiguated lemma) consumes a token
- Quota displayed in `.quota-box` as "used N/5 Eng."
- **Important:** Present disambiguation choices to the user before firing the `ln`-pinned request — auto-resolving would silently burn tokens

---

## Response HTML Structure

### Single entry (noun example: פּאַסירל)

```html
<div class="def">
  <div dir="rtl" lang="yi" class="rtl">
    <span class="lemma">פּאַסירל</span>
  </div>
  <div dir="rtl" lang="yi" class="rtl">
    <span class="gram glossed">דאָס <span class="help">neuter noun</span></span>
    <span class="glossed">(עך <span class="help">plural</span>)</span>
  </div>
  <div lang="en" class="gloss">pass, permit</div>
</div>
```

### Verb entry with example phrase (לױפֿן)

```html
<div class="def">
  <div dir="rtl" lang="yi" class="rtl">
    <span class="lemma">לױפֿ|ן</span>
  </div>
  <div dir="rtl" lang="yi" class="rtl">
    <span class="gram glossed">װ <span class="help">verb</span></span>
    <span class="glossed">(איז געלאָפֿן <span class="help">past participle</span>)</span>
  </div>
  <div lang="en" class="gloss">
    run; <span class="field">(water, fluids)</span> flow;
    <span class="field">(time)</span> fly; flee, fly;
    <span class="field">(timepiece)</span> be fast
  </div>
  <div dir="rtl" lang="yi" class="rtl sep">
    <span>זאָל ער/זי לױפֿן און בעטן</span>
  </div>
  <div lang="en" class="gloss">
    <span class="field">(in speaking of a deceased relative)</span>
    may he/she make haste and intercede on our behalf in Heaven
  </div>
</div>
```

### Element reference

| Selector | Content | Notes |
|---|---|---|
| `.lemma` | Yiddish headword | Strip `\|` stem separator for display |
| `.gram.glossed` | Primary POS block | Both classes on same `<span>`; Yiddish particle + `.help` English label |
| `.glossed` (without `.gram`) | Secondary grammar | e.g. past participle, plural form |
| `.help` | English grammatical label | Inside `.glossed`; e.g. "verb", "neuter noun", "past participle", "plural" |
| `.gloss` | English definition or example translation | Can appear multiple times: first = main definition, subsequent = translation of preceding `.sep` |
| `.sep` | Yiddish example phrase/sentence | RTL block; precedes its `.gloss` translation |
| `.field` | Domain/usage label | Inline inside `.gloss`; e.g. "(water, fluids)", "(time)" |

---

## Disambiguation System

When a query matches multiple lemmas, the response includes a `.choice_container` before `#definition`:

```html
<div class="choice_container">
  <div>loyf - form of</div>
  <div class="alternatives">Choices ...</div>
  <div class="choice_box">
    <div class="option"><a href="vb?yq=loyf&ln=לױף">LOYF</a></div>
    <div class="option selected"><a href="vb?yq=loyf&ln=לױפֿן">LOYFN</a></div>
    <div class="option"><a href="vb?yq=loyf&ln=אַװעקלױפֿן">AVEKLOYFN</a></div>
    <!-- ... -->
    <div class="option extend"><a href="vb?yq=loyf&extend=1">More ...</a></div>
  </div>
</div>
```

- Each `.option` `<a>` href contains the `ln` parameter for that lemma
- `.option.selected` = the lemma the server auto-selected for the current response
- `#definition` contains the `.def` block for the currently selected lemma
- Selecting a different option fires a new request (burns a quota token)
- **Design decision:** Show choices to user before auto-resolving to avoid silent token consumption

---

## No-results response

TBD — not yet observed. Likely `#definition` is empty or absent.

---

## Integration test note

A real HTTP request to this endpoint requires an active session cookie.
Unit tests should mock Axios responses using saved HTML fixtures.
Capture fixture HTML from a live session and save to `app/__fixtures__/`.
