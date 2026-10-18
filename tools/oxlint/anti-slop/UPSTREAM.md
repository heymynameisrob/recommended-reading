# Vendored anti-slop Oxlint plugins

Source: [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop), commit
`13909c9e07590f5a85d93c62712259fe14a883f7`.

Copied from `skills/install-anti-slop/assets/anti-slop` with the skill's own
`scripts/install.mjs`. Every copied file matches that revision byte for byte.

Installed plugin paths:

- `tools/oxlint/anti-slop/index.ts` — generic plugin, registered in `.oxlintrc.json` as
  `anti-slop`.
- `tools/oxlint/anti-slop/effect/index.ts` — opt-in Effect plugin. It is **not** registered,
  because this repository has no direct `effect` dependency.

Bundled third-party code:

- `vendor/eslint-stylistic/` — the padding-line-between-statements rule from ESLint Stylistic,
  commit `435c3ea0fd26a5fef9042c4b36b6e165fbbf8d08`. Keep `LICENSE` with any redistributed copy.
  See `vendor/eslint-stylistic/UPSTREAM.md` for its own provenance and local adaptations.

## Intentional deviations

One configuration deviation from the source revision, in `.oxlintrc.json`:

```json
"anti-slop/no-runtime-typeof": ["error", { "allowInTypeGuards": true }]
```

`apps/worker/src/collectors/rss.ts` decodes untrusted XML at its I/O boundary. That decoder needs
type predicates such as `function isXmlText(value: XmlValue | undefined): value is string`, and
the rule's own option permits `typeof` inside a predicate. Every other file still fails the rule
on any `typeof`. Rule severity and the other eighteen rules stay unchanged.

No other rule, diagnostic, or severity deviates from the source revision.

## Upstream assets that were not copied

The source repository keeps rule tests, a `sync:skill-assets` script, and repository-specific
`pnpm check` guidance beside the plugin. Those files stay upstream. Use the update procedure in
`.agents/skills/install-anti-slop/references/update.md` to port later rule fixes, then re-record
the new revision here.
