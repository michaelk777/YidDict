# Google Translate API Notes

## Endpoint

Unofficial (no API key required):
```
GET https://translate.googleapis.com/translate_a/single
```

### Parameters

| Param    | Value        | Notes                            |
|----------|--------------|----------------------------------|
| `client` | `gtx`        | Required by this unofficial path |
| `sl`     | `yi` / `en`  | Source language (see Direction)  |
| `tl`     | `en` / `yi`  | Target language (see Direction)  |
| `dt`     | `t`          | Return translation segments      |
| `q`      | `<query>`    | The text to translate            |

### Response format

JSON array (not an object):
```json
[[["translated text", "original text", null, null, 10]], null, null]
```

- `response[0]` — array of translation segments (one per phrase fragment)
- `response[0][N][0]` — translated text of segment N

Join all segment texts to reconstruct the full translation.

## Direction

Direction is determined by the `isHebrew` flag, not auto-detection:

| Input type        | sl   | tl   | Result field      |
|-------------------|------|------|-------------------|
| Hebrew script     | `yi` | `en` | `english`         |
| Latin (English)   | `en` | `yi` | `yiddishHebrew`   |

Google Translate does not reliably recognize YIVO
romanization as Yiddish — it may misidentify it as Polish, German, or
another Latin-script language. Latin input by a user is therefore always treated as
English. This is appropriate since Google Translate is more of a fallback source;
Finkel and Verterbukh handle YIVO input directly.

## Limitations

- **Unofficial**: URL or response format could change without notice
- **No formal rate limit** documented; fine for single-user mobile app
- **Machine translation quality**: suitable as a fallback source — no
  grammatical metadata (POS, conjugation info, romanization)
- **Integration test note**: Use mocked axios in unit tests; verify live
  behavior manually before release and consider making non-mock axios in unit tests as well
