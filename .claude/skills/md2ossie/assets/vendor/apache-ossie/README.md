# Vendored Apache Ossie validation assets

These files are unmodified snapshots from Apache Ossie commit
`88e0011148283302c9a04cd0287e00e0b9d87354`:

- `core-spec/osi-schema.json`
- `ontology/ontology.json`
- `ontology/ontology.md`
- `validation/validate.py`
- `LICENSE`
- `NOTICE`

Upstream: <https://github.com/apache/ossie>

`ontology.md` is the specification the semantic lint cites for every rule the JSON Schema does
not encode -- the built-in concept list, the multiplicity definitions, the implicit first role,
and the `{Concept:role}` verbalization placeholders. It is pinned alongside the schemas so a
reviewer can check the lint against its source without network access.

The skill's `scripts/validate_ossie.py` reads the two unmodified schemas at runtime. It uses
the official ontology schema as the structural source of truth, resolves that schema's raw
GitHub references from the vendored core schema, and then runs separately labelled ontology
semantic lints. The vendored official `validation/validate.py` is retained for provenance and
maintenance-time cross-checks; it is not imported or modified by the wrapper.

Apache Ossie is licensed under the Apache License 2.0; see `LICENSE` and `NOTICE`.

SHA-256:

```text
8ce9f82aa92080265f9ae119e31cda5bef062f489674d3c467245c2d4c5ff264  core-spec/osi-schema.json
c0ce26ff658aff52307f01bdc564061d194c1987e930d61ff498e63456b9b41d  ontology/ontology.json
dcfa34ac61eb86dbf5715d7f35f9c83d52898ba6880a52bc1df4b7a18d091116  ontology/ontology.md
dc3ef8914a283d0568f65843343ed7592377aa813230e1990c6adbb2241a2be3  validation/validate.py
```

The upstream ontology schema references the core schema through a GitHub URL. The wrapper at
`../../../scripts/validate_ossie.py` resolves that exact reference from the vendored core schema
in memory so validation remains offline; the vendored files themselves remain unchanged.

The official validator can be used as an online cross-check (requires `pyyaml` and
`jsonschema`):

```bash
python3 validation/validate.py model.ossie.json --schema ontology/ontology.json
```

For normal skill execution, use the wrapper. The official validator's non-schema reference,
uniqueness, and SQL checks currently run only for top-level `semantic_model` payloads, not for
pure ontology documents.
