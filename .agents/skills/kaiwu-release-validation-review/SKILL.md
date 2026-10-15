---
name: kaiwu-release-validation-review
description: Resolve the private Kaiwu release authority for validation review.
metadata: {"openclaw":{"homepage":"https://github.com/wuji-labs/kaiwu"}}
---

# Kaiwu Release Validation Review

Resolve the private release authority before validation-review work:

```bash
hmaint release bootstrap --repo <absolute checkout> --json
```

Use the returned private skill and its instructions as the authoritative review procedure. Inspect the public shape with `node scripts/pipeline/run.mjs release-contract`; do not retain a second review policy here.
