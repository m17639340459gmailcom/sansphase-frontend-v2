# CI commands

Run the same clean-install gates on Node 24.21.x in the private repository:

```text
npm ci
npm ci --prefix previews/hero-upgrade
npm run check:types
npm run build
npm test
```

Cache keys must include both package-lock.json files. Do not inject production database credentials, mail credentials, account files or deployment keys. Tests use only the committed frontend synthetic fixtures. Build artifacts are temporary outputs, not source. Production same-origin cookie, CAPTCHA, email and community handoff checks remain separate upstream release gates. Choose and pin maintained official CI actions when enabling a specific CI provider; this source export does not add unverified action tags or grant deployment permissions.
