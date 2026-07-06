# Unmapped fields ES|QL example

Example plugin for [kibana-team#3572](https://github.com/elastic/kibana-team/issues/3572).

Demonstrates querying saved object attributes that are stored in `_source` but not mapped (`dynamic: false`), using `savedObjectsClient.esql()` with `SET unmapped_fields`.

## Saved object type

`unmapped-fields-item` maps only `title`. Attributes `category`, `score`, and `notes` are persisted in `_source` without index mappings.

## Running the example UI

```bash
yarn start --run-examples
```

Open **Developer examples → Unmapped fields ES|QL** (app id: `unmappedFieldsEsqlExample`).

## Integration tests

```bash
node scripts/jest_integration --config examples/unmapped_fields_esql_example/jest.integration.config.js
```

## API routes

| Route | Description |
|-------|-------------|
| `POST /api/unmapped_fields_esql_example/_setup` | Seed example saved objects |
| `POST /api/unmapped_fields_esql_example/_query` | Run a named query scenario |
| `GET /api/unmapped_fields_esql_example/_scenarios` | List available scenarios |

See [FINDINGS.md](./FINDINGS.md) for validation notes, security considerations, and known limitations.
