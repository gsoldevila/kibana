# Findings: ES|QL unmapped_fields on saved objects

Parent epic: [kibana-team#3571](https://github.com/elastic/kibana-team/issues/3571)

## Summary

`savedObjectsClient.esql()` can query saved object attributes stored in `_source` but not mapped when `SET unmapped_fields = "LOAD"` is applied. This PoC adds `setOptions` to the saved objects ES|QL API (mirroring `kbn-storage-adapter`) so SET directives are prepended before the auto-generated `FROM` clause.

## What works (validated by integration tests)

| ES|QL feature | Mapped field | Unmapped field (`LOAD`) |
|---------------|-------------|-------------------------|
| WHERE filter | Yes | Yes |
| SORT | Yes | Yes (loaded as keyword) |
| STATS / COUNT BY | Yes | Yes |
| KEEP / DROP | Yes | Yes |
| EVAL + TO_INTEGER | N/A | Yes (explicit conversion) |
| METADATA `_source` | Yes | Yes (read attrs without referencing unmapped columns) |

## unmapped_fields modes

| Mode | Behavior on unmapped field reference |
|------|--------------------------------------|
| `DEFAULT` | Query fails (verification error) |
| `LOAD` | Loads value from `_source` as keyword |
| `NULLIFY` | Treats unmapped fields as null (filters match nothing) |

## Security

### Space isolation

Namespace filters are injected via the ES|QL `filter` parameter regardless of `unmapped_fields` mode. Unmapped field queries respect the `namespaces` option — verified by integration test scoping to `default` vs `namespaceA`.

### RBAC

The saved objects ES|QL path runs `securityExtension.authorizeFind()` before query execution. Unauthorized callers receive an empty `{ columns: [], values: [] }` response (same as mapped-field queries). Example routes use `AuthzDisabled` for demo purposes only; production plugins must enforce authorization.

### Encrypted attributes

Encrypted scalar columns are stripped to `null` in ES|QL results. When `metadata: ['_id', '_source']` is used, `_source` is decrypted via the same path as `find`/`search`. This PoC does not register an encrypted type; see `examples/eso_model_version_example` for ESO patterns and extend tests if encrypted unmapped attrs need explicit validation.

## Performance notes

- `LOAD` reads from stored `_source`, which is slower than querying mapped/indexed fields.
- Prefer mapping fields that need frequent filtering/sorting/aggregation.
- Use `METADATA _source` when you only need to display unmapped attrs, not filter on them in ES|QL.

## Version requirements

- ES|QL `unmapped_fields` is marked **preview** in Kibana's ES|QL language definitions.
- Requires Elasticsearch with ES|QL `SET unmapped_fields` support (8.x+; exact minimum version should be confirmed against ES release notes).

## Known ES limitations (from ES|QL docs)

With `LOAD`, the following are **not supported**:

- `FORK`, `LOOKUP JOIN`, subqueries, and views
- Subfields of `flattened` parents
- `KNN` on partially unmapped `dense_vector` fields
- Full-text search functions in some query positions (see ES|QL settings docs)

## API gap addressed in this PoC

Before this change, consumers could not prepend `SET unmapped_fields` because the saved objects client auto-generates the `FROM` clause and only accepts a post-`FROM` pipeline. Adding `setOptions` to `SavedObjectsEsqlOptions` resolves this.

## Open questions

- Should `performEsql` expose additional ES|QL request options beyond `setOptions`?
- Do we need first-class Scout/FTR coverage on Serverless, or is the Jest integration suite sufficient for CI?
- Performance comparison (mapped vs LOAD) under realistic SO document sizes — not measured in this PoC.
