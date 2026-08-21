#!/usr/bin/env python3
"""Validate Apache Ossie 0.2.0.dev0 Ontology JSON without network access.

The validator has two layers:

1. The unmodified official ontology JSON Schema.
2. Semantic lint for constraints documented by ontology.md but not encoded in
   the schema (references, inheritance kinds, role ambiguity, multiplicity,
   and identifying relationships).

It intentionally does not parse or execute ontology ``requires`` and
``derived_by`` expressions. The official schema only constrains them to be
strings, so expression correctness still requires a compatible Ossie engine
or a separate parser.
"""

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple


SKILL_ROOT = Path(__file__).resolve().parents[1]
ONTOLOGY_SCHEMA_PATH = (
    SKILL_ROOT / "assets/vendor/apache-ossie/ontology/ontology.json"
)
CORE_SCHEMA_PATH = (
    SKILL_ROOT / "assets/vendor/apache-ossie/core-spec/osi-schema.json"
)
CORE_SCHEMA_RAW_URI = (
    "https://raw.githubusercontent.com/apache/ossie/main/"
    "core-spec/osi-schema.json"
)

# ontology.md lists these as the complete set of built-in concepts. Core
# DataTypes Time, DateTimeTz, and Opaque are deliberately not included.
BUILTIN_ENTITY_CONCEPTS = {"Any"}
BUILTIN_VALUE_CONCEPTS = {
    "Boolean",
    "Date",
    "DateTime",
    "Decimal",
    "Float",
    "Integer",
    "String",
}
BUILTIN_CONCEPTS = BUILTIN_ENTITY_CONCEPTS | BUILTIN_VALUE_CONCEPTS

PLACEHOLDER_RE = re.compile(r"\{([^{}]+)\}")
JSON_IDENTIFIER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


Issue = Dict[str, str]


def issue(
    code: str,
    path: str,
    message: str,
    severity: str = "error",
) -> Issue:
    return {
        "severity": severity,
        "code": code,
        "path": path,
        "message": message,
    }


def json_path(parts: Iterable[Any]) -> str:
    result = "$"
    for part in parts:
        if isinstance(part, int):
            result += f"[{part}]"
        elif isinstance(part, str) and JSON_IDENTIFIER_RE.match(part):
            result += f".{part}"
        else:
            result += f"[{json.dumps(part, ensure_ascii=False)}]"
    return result


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def validate_schema(data: Any) -> List[Issue]:
    """Validate using local resources for every upstream remote reference."""
    try:
        from jsonschema.validators import validator_for
        from referencing import Registry, Resource
        from referencing.exceptions import Unresolvable
    except ImportError:
        return [
            issue(
                "MISSING_DEPENDENCY",
                "$",
                "jsonschema>=4.26.0 is required; install requirements.txt",
            )
        ]

    if not ONTOLOGY_SCHEMA_PATH.exists() or not CORE_SCHEMA_PATH.exists():
        return [
            issue(
                "MISSING_SCHEMA",
                "$",
                "Vendored ontology.json or core-spec/osi-schema.json is missing",
            )
        ]

    try:
        ontology_schema = load_json(ONTOLOGY_SCHEMA_PATH)
        core_schema = load_json(CORE_SCHEMA_PATH)
        validator_class = validator_for(ontology_schema)
        validator_class.check_schema(ontology_schema)

        core_resource = Resource.from_contents(core_schema)
        registry = Registry().with_resource(CORE_SCHEMA_RAW_URI, core_resource)
        core_schema_id = core_schema.get("$id")
        if isinstance(core_schema_id, str) and core_schema_id:
            registry = registry.with_resource(core_schema_id, core_resource)

        validator = validator_class(ontology_schema, registry=registry)
        errors = sorted(
            validator.iter_errors(data),
            key=lambda item: (
                tuple(str(part) for part in item.absolute_path),
                item.message,
            ),
        )
    except (OSError, ValueError, Unresolvable) as exc:
        return [issue("SCHEMA_SETUP_ERROR", "$", str(exc))]
    except Exception as exc:  # jsonschema exposes several resolution subclasses
        return [issue("SCHEMA_VALIDATION_ERROR", "$", str(exc))]

    result: List[Issue] = []
    for error in errors:
        code = "SCHEMA_ERROR"
        if error.validator == "additionalProperties":
            code = "SCHEMA_ADDITIONAL_PROPERTY"
        elif error.validator in {"enum", "const"}:
            code = "SCHEMA_ENUM"
        elif error.validator == "required":
            code = "SCHEMA_REQUIRED"
        elif error.validator == "type":
            code = "SCHEMA_TYPE"
        result.append(
            issue(code, json_path(error.absolute_path), error.message)
        )
    return result


def find_duplicates(values: Sequence[str]) -> Set[str]:
    seen: Set[str] = set()
    duplicates: Set[str] = set()
    for value in values:
        if value in seen:
            duplicates.add(value)
        seen.add(value)
    return duplicates


def expression_issues(data: Dict[str, Any]) -> List[Issue]:
    result: List[Issue] = []

    def check(expressions: Any, path: str) -> None:
        if not isinstance(expressions, list):
            return
        for index, expression in enumerate(expressions):
            if isinstance(expression, str) and not expression.strip():
                result.append(
                    issue(
                        "EMPTY_EXPRESSION",
                        f"{path}[{index}]",
                        "Expression must not be empty",
                    )
                )

    check(data.get("requires"), "$.requires")
    for concept_index, concept in enumerate(data.get("ontology") or []):
        if not isinstance(concept, dict):
            continue
        base = f"$.ontology[{concept_index}]"
        check(concept.get("requires"), f"{base}.requires")
        check(concept.get("derived_by"), f"{base}.derived_by")
        for relationship_index, relationship in enumerate(
            concept.get("relationships") or []
        ):
            if not isinstance(relationship, dict):
                continue
            relationship_base = f"{base}.relationships[{relationship_index}]"
            check(relationship.get("requires"), f"{relationship_base}.requires")
            check(
                relationship.get("derived_by"),
                f"{relationship_base}.derived_by",
            )
    return result


def inheritance_issues(
    concepts: Dict[str, Dict[str, Any]],
    concept_paths: Dict[str, str],
) -> List[Issue]:
    result: List[Issue] = []

    for name, concept in concepts.items():
        concept_type = concept.get("type")
        parents = concept.get("extends") or []
        if not isinstance(parents, list):
            continue
        for parent_index, parent in enumerate(parents):
            if not isinstance(parent, str):
                continue
            path = f"{concept_paths[name]}.extends[{parent_index}]"
            if parent == name:
                result.append(
                    issue("SELF_INHERITANCE", path, f"Concept '{name}' extends itself")
                )
                continue
            if parent not in concepts and parent not in BUILTIN_CONCEPTS:
                result.append(
                    issue(
                        "UNKNOWN_PARENT_CONCEPT",
                        path,
                        f"Parent concept '{parent}' is not defined or built in",
                    )
                )
                continue

            parent_type: Optional[str]
            if parent in BUILTIN_ENTITY_CONCEPTS:
                parent_type = "EntityType"
            elif parent in BUILTIN_VALUE_CONCEPTS:
                parent_type = "ValueType"
            else:
                parent_type = concepts[parent].get("type")

            if concept_type in {"EntityType", "ValueType"} and parent_type != concept_type:
                result.append(
                    issue(
                        "INHERITANCE_TYPE_MISMATCH",
                        path,
                        f"{concept_type} '{name}' cannot extend {parent_type} '{parent}'",
                    )
                )

    # Report inheritance cycles once per traversal root. Cycles also prevent a
    # ValueType from reaching its required built-in value base.
    state: Dict[str, int] = {}
    stack: List[str] = []
    reported_cycles: Set[Tuple[str, ...]] = set()

    def visit(name: str) -> None:
        state[name] = 1
        stack.append(name)
        parents = concepts[name].get("extends") or []
        if isinstance(parents, list):
            for parent in parents:
                if parent not in concepts:
                    continue
                if state.get(parent) == 0 or parent not in state:
                    visit(parent)
                elif state.get(parent) == 1:
                    start = stack.index(parent)
                    cycle = tuple(stack[start:] + [parent])
                    canonical = tuple(sorted(set(cycle)))
                    if canonical not in reported_cycles:
                        reported_cycles.add(canonical)
                        result.append(
                            issue(
                                "INHERITANCE_CYCLE",
                                f"{concept_paths[name]}.extends",
                                "Inheritance cycle: " + " -> ".join(cycle),
                            )
                        )
        stack.pop()
        state[name] = 2

    for concept_name in concepts:
        if state.get(concept_name, 0) == 0:
            visit(concept_name)

    def reaches_builtin_value(name: str, visiting: Set[str]) -> bool:
        if name in BUILTIN_VALUE_CONCEPTS:
            return True
        if name in visiting or name not in concepts:
            return False
        concept = concepts[name]
        if concept.get("type") != "ValueType":
            return False
        parents = concept.get("extends") or []
        if not isinstance(parents, list):
            return False
        return any(
            isinstance(parent, str)
            and reaches_builtin_value(parent, visiting | {name})
            for parent in parents
        )

    for name, concept in concepts.items():
        if concept.get("type") == "ValueType" and not reaches_builtin_value(name, set()):
            result.append(
                issue(
                    "VALUE_TYPE_WITHOUT_BUILTIN_BASE",
                    f"{concept_paths[name]}.extends",
                    f"ValueType '{name}' must ultimately extend one of: "
                    + ", ".join(sorted(BUILTIN_VALUE_CONCEPTS)),
                )
            )
    return result


def relationship_issues(
    concepts: Dict[str, Dict[str, Any]],
    concept_paths: Dict[str, str],
) -> Tuple[List[Issue], Dict[str, Dict[str, Dict[str, Any]]]]:
    result: List[Issue] = []
    relationship_index: Dict[str, Dict[str, Dict[str, Any]]] = {}

    for concept_name, concept in concepts.items():
        base = concept_paths[concept_name]
        raw_relationships = concept.get("relationships") or []
        if not isinstance(raw_relationships, list):
            continue

        names = [
            item.get("name")
            for item in raw_relationships
            if isinstance(item, dict)
            and isinstance(item.get("name"), str)
            and item.get("name")
        ]
        for duplicate in sorted(find_duplicates(names)):
            result.append(
                issue(
                    "DUPLICATE_RELATIONSHIP",
                    f"{base}.relationships",
                    f"Relationship name '{duplicate}' is duplicated under '{concept_name}'",
                )
            )

        relationship_index[concept_name] = {}
        for relationship_position, relationship in enumerate(raw_relationships):
            if not isinstance(relationship, dict):
                continue
            relationship_base = f"{base}.relationships[{relationship_position}]"
            relationship_name = relationship.get("name")
            if isinstance(relationship_name, str) and relationship_name:
                relationship_index[concept_name].setdefault(
                    relationship_name, relationship
                )
            elif relationship_name == "":
                result.append(
                    issue(
                        "EMPTY_RELATIONSHIP_NAME",
                        f"{relationship_base}.name",
                        "Relationship name must not be empty",
                    )
                )

            roles = relationship.get("roles") or []
            if not isinstance(roles, list):
                roles = []

            effective_role_names: Set[str] = {concept_name}
            expected_placeholders: Set[str] = {concept_name}
            for role_position, role in enumerate(roles):
                if not isinstance(role, dict):
                    continue
                role_base = f"{relationship_base}.roles[{role_position}]"
                role_concept = role.get("concept")
                role_name = role.get("name")
                if isinstance(role_concept, str):
                    if (
                        role_concept not in concepts
                        and role_concept not in BUILTIN_CONCEPTS
                    ):
                        result.append(
                            issue(
                                "UNKNOWN_ROLE_CONCEPT",
                                f"{role_base}.concept",
                                f"Role concept '{role_concept}' is not defined or built in",
                            )
                        )

                    effective_name = (
                        role_name
                        if isinstance(role_name, str) and role_name
                        else role_concept
                    )
                    if effective_name in effective_role_names:
                        result.append(
                            issue(
                                "AMBIGUOUS_ROLE_NAME",
                                role_base,
                                f"Role name '{effective_name}' is ambiguous; add a distinct role.name",
                            )
                        )
                    effective_role_names.add(effective_name)
                    placeholder = (
                        f"{role_concept}:{role_name}"
                        if isinstance(role_name, str) and role_name
                        else role_concept
                    )
                    expected_placeholders.add(placeholder)

            multiplicity = relationship.get("multiplicity")
            if multiplicity in {"ManyToOne", "OneToOne"} and not roles:
                result.append(
                    issue(
                        "MULTIPLICITY_ON_UNARY_RELATIONSHIP",
                        f"{relationship_base}.multiplicity",
                        "Multiplicity constrains a last role and is not meaningful on a unary relationship",
                    )
                )
            if multiplicity == "OneToOne" and len(roles) != 1:
                result.append(
                    issue(
                        "ONE_TO_ONE_REQUIRES_BINARY",
                        f"{relationship_base}.multiplicity",
                        "OneToOne is only defined for a binary relationship (exactly one additional role)",
                    )
                )

            verbalizations = relationship.get("verbalizes")
            if isinstance(verbalizations, list):
                if not verbalizations:
                    result.append(
                        issue(
                            "EMPTY_VERBALIZES",
                            f"{relationship_base}.verbalizes",
                            "verbalizes must contain at least one reading",
                        )
                    )
                for verbalization_position, verbalization in enumerate(verbalizations):
                    if not isinstance(verbalization, str):
                        continue
                    verbalization_path = (
                        f"{relationship_base}.verbalizes[{verbalization_position}]"
                    )
                    if not verbalization.strip():
                        result.append(
                            issue(
                                "EMPTY_VERBALIZATION",
                                verbalization_path,
                                "Verbalization must not be empty",
                            )
                        )
                        continue
                    placeholders = set(PLACEHOLDER_RE.findall(verbalization))
                    unknown = placeholders - expected_placeholders
                    if unknown:
                        result.append(
                            issue(
                                "UNKNOWN_VERBALIZATION_ROLE",
                                verbalization_path,
                                "Unknown role placeholder(s): "
                                + ", ".join(sorted(unknown)),
                            )
                        )
                    missing = expected_placeholders - placeholders
                    if missing:
                        result.append(
                            issue(
                                "INCOMPLETE_VERBALIZATION",
                                verbalization_path,
                                "Reading omits role placeholder(s): "
                                + ", ".join(sorted(missing)),
                                severity="warning",
                            )
                        )

    return result, relationship_index


def identifier_issues(
    concepts: Dict[str, Dict[str, Any]],
    concept_paths: Dict[str, str],
    relationships: Dict[str, Dict[str, Dict[str, Any]]],
) -> List[Issue]:
    result: List[Issue] = []
    for concept_name, concept in concepts.items():
        identifiers = concept.get("identify_by") or []
        if not isinstance(identifiers, list):
            continue
        if identifiers and concept.get("type") != "EntityType":
            result.append(
                issue(
                    "IDENTIFIER_ON_VALUE_TYPE",
                    f"{concept_paths[concept_name]}.identify_by",
                    "identify_by is for referencing EntityType objects",
                )
            )
        string_identifiers = [item for item in identifiers if isinstance(item, str)]
        for duplicate in sorted(find_duplicates(string_identifiers)):
            result.append(
                issue(
                    "DUPLICATE_IDENTIFIER",
                    f"{concept_paths[concept_name]}.identify_by",
                    f"Identifier relationship '{duplicate}' is repeated",
                )
            )
        for identifier_position, identifier in enumerate(identifiers):
            if not isinstance(identifier, str):
                continue
            path = f"{concept_paths[concept_name]}.identify_by[{identifier_position}]"
            relationship = relationships.get(concept_name, {}).get(identifier)
            if relationship is None:
                result.append(
                    issue(
                        "UNKNOWN_IDENTITY_RELATIONSHIP",
                        path,
                        f"'{identifier}' is not a relationship under '{concept_name}'",
                    )
                )
                continue
            roles = relationship.get("roles") or []
            if not isinstance(roles, list) or len(roles) != 1:
                result.append(
                    issue(
                        "IDENTIFIER_REQUIRES_BINARY_RELATIONSHIP",
                        path,
                        f"Identifying relationship '{identifier}' must have exactly one additional role",
                    )
                )
            if relationship.get("multiplicity") not in {"ManyToOne", "OneToOne"}:
                result.append(
                    issue(
                        "IDENTIFIER_WITHOUT_FUNCTIONAL_MULTIPLICITY",
                        path,
                        f"Identifying relationship '{identifier}' should declare ManyToOne or OneToOne",
                        severity="warning",
                    )
                )
    return result


def mapping_reference_issues(
    data: Dict[str, Any],
    concepts: Dict[str, Dict[str, Any]],
) -> List[Issue]:
    """Check concept references in ontology mappings.

    Full mapping-tree arity and SQL correctness are deliberately left to an
    Ossie mapping implementation; this lint only rejects definite dangling
    concept references.
    """
    result: List[Issue] = []
    mappings = data.get("ontology_mappings") or []
    if not isinstance(mappings, list):
        return result
    for mapping_position, mapping in enumerate(mappings):
        if not isinstance(mapping, dict):
            continue
        concept_mappings = mapping.get("concept_mappings") or []
        if not isinstance(concept_mappings, list):
            continue
        for concept_mapping_position, concept_mapping in enumerate(concept_mappings):
            if not isinstance(concept_mapping, dict):
                continue
            base = (
                f"$.ontology_mappings[{mapping_position}]"
                f".concept_mappings[{concept_mapping_position}]"
            )
            mapped_concept = concept_mapping.get("concept")
            if (
                isinstance(mapped_concept, str)
                and mapped_concept not in concepts
                and mapped_concept not in BUILTIN_CONCEPTS
            ):
                result.append(
                    issue(
                        "UNKNOWN_MAPPED_CONCEPT",
                        f"{base}.concept",
                        f"Mapped concept '{mapped_concept}' is not defined or built in",
                    )
                )
            object_mappings = concept_mapping.get("object_mappings") or []
            if not isinstance(object_mappings, list):
                continue
            for object_mapping_position, object_mapping in enumerate(object_mappings):
                if not isinstance(object_mapping, dict):
                    continue
                object_concept = object_mapping.get("concept")
                if (
                    isinstance(object_concept, str)
                    and object_concept not in concepts
                    and object_concept not in BUILTIN_CONCEPTS
                ):
                    result.append(
                        issue(
                            "UNKNOWN_OBJECT_MAPPING_CONCEPT",
                            f"{base}.object_mappings[{object_mapping_position}].concept",
                            f"Object mapping concept '{object_concept}' is not defined or built in",
                        )
                    )
    return result


def validate_semantics(data: Any) -> List[Issue]:
    if not isinstance(data, dict):
        return []
    ontology = data.get("ontology")
    if not isinstance(ontology, list):
        return []

    result: List[Issue] = []
    if data.get("name") == "":
        result.append(
            issue(
                "EMPTY_ONTOLOGY_NAME",
                "$.name",
                "Ontology name must not be empty",
            )
        )
    concepts: Dict[str, Dict[str, Any]] = {}
    concept_paths: Dict[str, str] = {}
    names: List[str] = []
    for concept_position, concept in enumerate(ontology):
        if not isinstance(concept, dict):
            continue
        name = concept.get("concept")
        path = f"$.ontology[{concept_position}]"
        if name == "":
            result.append(
                issue(
                    "EMPTY_CONCEPT_NAME",
                    f"{path}.concept",
                    "Concept name must not be empty",
                )
            )
        if not isinstance(name, str) or not name:
            continue
        names.append(name)
        concepts.setdefault(name, concept)
        concept_paths.setdefault(name, path)
        if name in BUILTIN_CONCEPTS:
            result.append(
                issue(
                    "BUILTIN_CONCEPT_REDECLARATION",
                    f"{path}.concept",
                    f"Built-in concept '{name}' must not be redeclared",
                )
            )

    for duplicate in sorted(find_duplicates(names)):
        result.append(
            issue(
                "DUPLICATE_CONCEPT",
                "$.ontology",
                f"Concept name '{duplicate}' is duplicated",
            )
        )

    result.extend(expression_issues(data))
    result.extend(inheritance_issues(concepts, concept_paths))
    relationship_result, relationships = relationship_issues(
        concepts, concept_paths
    )
    result.extend(relationship_result)
    result.extend(
        identifier_issues(concepts, concept_paths, relationships)
    )
    result.extend(mapping_reference_issues(data, concepts))
    return result


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate Apache Ossie 0.2.0.dev0 Ontology JSON"
    )
    parser.add_argument("ontology_json", type=Path)
    parser.add_argument(
        "--schema-only",
        action="store_true",
        help="run only the unmodified official JSON Schema layer",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="return a non-zero status when semantic lint warnings are present",
    )
    return parser.parse_args(argv)


def print_report(
    target: Path,
    schema_issues: List[Issue],
    semantic_issues: List[Issue],
    semantic_skipped: bool = False,
) -> None:
    errors = [
        item
        for item in schema_issues + semantic_issues
        if item["severity"] == "error"
    ]
    warnings = [
        item
        for item in schema_issues + semantic_issues
        if item["severity"] == "warning"
    ]
    semantic_errors = [
        item for item in semantic_issues if item["severity"] == "error"
    ]

    print("# Apache Ossie Validation Report\n")
    print(f"- Target File: `{target.name}`")
    print("- Standard: `apache-ossie/0.2.0.dev0`")
    print(f"- Schema Status: `{'passed' if not schema_issues else 'failed'}`")
    if semantic_skipped:
        print("- Semantic Lint Status: `skipped`")
    else:
        print(
            "- Semantic Lint Status: "
            f"`{'passed' if not semantic_errors and not warnings else 'needs-review'}`"
        )
    print(f"- Total Errors: `{len(errors)}`")
    print(f"- Total Warnings: `{len(warnings)}`\n")

    if errors:
        print("## Errors\n")
        for item in errors:
            print(
                f"- **{item['code']}** @ `{item['path']}`: {item['message']}"
            )
        print()
    if warnings:
        print("## Warnings\n")
        for item in warnings:
            print(
                f"- **{item['code']}** @ `{item['path']}`: {item['message']}"
            )
        print()

    if not errors and not warnings:
        print("Validation Result: **PASSED (0 Errors, 0 Warnings)**")
    elif not errors:
        print("Validation Result: **PASSED WITH WARNINGS**")
    else:
        print("Validation Result: **FAILED**")


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    target = args.ontology_json.resolve()
    if not target.is_file():
        print(f"Error: File not found: {target}", file=sys.stderr)
        return 1

    try:
        data = load_json(target)
    except json.JSONDecodeError as exc:
        print(
            f"Error: Invalid JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}",
            file=sys.stderr,
        )
        return 1
    except OSError as exc:
        print(f"Error: Cannot read {target}: {exc}", file=sys.stderr)
        return 1

    schema_issues = validate_schema(data)
    semantic_issues = [] if args.schema_only else validate_semantics(data)
    print_report(
        target,
        schema_issues,
        semantic_issues,
        semantic_skipped=args.schema_only,
    )

    errors = [
        item
        for item in schema_issues + semantic_issues
        if item["severity"] == "error"
    ]
    warnings = [
        item
        for item in schema_issues + semantic_issues
        if item["severity"] == "warning"
    ]
    if errors:
        return 2
    if args.strict and warnings:
        return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
