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

## Mapping transition: adding mappings for legacy `_source`-only fields

Empirical tests in `server/integration_tests/mapping_transition.test.ts` and
`unmapped_fields_esql.test.ts` (saved-object index) cover what happens when
documents already contain mixed-type values in `_source` and a mapping is added
later — the typical saved-object migration scenario (`dynamic: false`, only some
attributes mapped).

### `dynamic: false` (saved object pattern)

| Question | Observed behavior |
|----------|-------------------|
| Does `PUT mapping` succeed when the field existed only in `_source` (including mixed string/number values)? | **Yes.** Mapping update is accepted; Elasticsearch does not scan existing documents for type conflicts when the field was never indexed. |
| Are pre-existing `_source` values indexed automatically after mapping? | **No.** Term queries on the newly mapped field return 0 hits until each document is re-ingested (index/update). New documents indexed after the mapping **are** searchable. |
| Does `update_by_query` fail when `_source` types disagree with the new mapping? | **No.** The task completes with zero failures. Scripts can read and mutate `_source` regardless of mapping; use `ctx.op = 'noop'` to skip documents you do not want to update. Type-mismatched values remain in `_source` until explicitly rewritten and re-indexed. |
| Do ES\|QL queries still find legacy values after mapping? | **With `SET unmapped_fields = "LOAD"` before mapping:** yes. **After mapping:** no — the field is mapped (even though index values are empty), so `LOAD` no longer applies and filters on that column match nothing. Use `METADATA _source` to read legacy attrs, or re-index documents first. **Term/query DSL on the mapped field:** no — same re-index requirement. **DEFAULT mode on a previously unmapped field:** fails before mapping; after mapping the column exists but returns empty until re-indexed. |

### `dynamic: true` (contrast)

| Question | Observed behavior |
|----------|-------------------|
| Does `PUT mapping` succeed when conflicting types were dynamically indexed? | **No.** Elasticsearch rejects the mapping change with `illegal_argument_exception` when existing indexed values conflict with the requested type (e.g. string + long in the same field path, then `PUT` long). |

### Implications for saved-object migrations

1. Adding a property to a type mapping is safe under `dynamic: false` even if production documents already store that attribute in `_source` with inconsistent types — but those values are **not** queryable via the mapped field until re-indexed.
2. `update_by_query` is a viable way to normalize `_source` before or after mapping; it does not fail on type mismatch, but it does not magically index values either — re-ingest (update/index) is still required for search/aggregations on the mapped field.
3. During a transition window **before** mapping is deployed, `SET unmapped_fields = "LOAD"` can query legacy `_source` values. **After** mapping is added, that escape hatch stops working for the newly mapped field — plan a re-index migration before or immediately after the mapping change, or use `METADATA _source` for read-only access.
4. Prefer `dynamic: false` on saved object types so new attributes stay in `_source` until an intentional mapping + migration, rather than being dynamically indexed with unpredictable types.

## Open questions

- Should `performEsql` expose additional ES|QL request options beyond `setOptions`?
- Do we need first-class Scout/FTR coverage on Serverless, or is the Jest integration suite sufficient for CI?
- Performance comparison (mapped vs LOAD) under realistic SO document sizes — not measured in this PoC.
