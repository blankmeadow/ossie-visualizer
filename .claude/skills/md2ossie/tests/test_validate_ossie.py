import importlib.util
import hashlib
import json
import unittest
from pathlib import Path
from unittest.mock import patch


SKILL_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = SKILL_ROOT / "scripts" / "validate_ossie.py"
SPEC = importlib.util.spec_from_file_location("validate_ossie", SCRIPT_PATH)
VALIDATOR = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(VALIDATOR)


def base_document():
    return {
        "version": "0.2.0.dev0",
        "name": "test_ontology",
        "ontology": [
            {"concept": "party", "type": "EntityType"},
            {
                "concept": "account",
                "type": "EntityType",
                "relationships": [
                    {
                        "name": "owner",
                        "roles": [{"concept": "party"}],
                        "multiplicity": "ManyToOne",
                        "verbalizes": [
                            "{account} 归属于 {party}",
                            "{party} 拥有 {account}",
                        ],
                    }
                ],
            },
        ],
    }


class ValidateOssieTests(unittest.TestCase):
    def assert_codes(self, issues, *expected):
        self.assertEqual({item["code"] for item in issues}, set(expected))

    def test_bundled_template_passes_schema_and_semantic_lint(self):
        with (SKILL_ROOT / "assets" / "template.ossie.json").open(
            encoding="utf-8"
        ) as handle:
            document = json.load(handle)
        self.assertEqual(VALIDATOR.validate_schema(document), [])
        self.assertEqual(VALIDATOR.validate_semantics(document), [])

    def test_schema_validation_does_not_fetch_remote_references(self):
        document = base_document()
        with patch(
            "urllib.request.urlopen",
            side_effect=AssertionError("network access is not allowed"),
        ):
            self.assertEqual(VALIDATOR.validate_schema(document), [])

    def test_vendored_official_assets_match_pinned_hashes(self):
        expected = {
            "core-spec/osi-schema.json": (
                "8ce9f82aa92080265f9ae119e31cda5bef062f489674d3c467245c2d4c5ff264"
            ),
            "ontology/ontology.json": (
                "c0ce26ff658aff52307f01bdc564061d194c1987e930d61ff498e63456b9b41d"
            ),
            "validation/validate.py": (
                "dc3ef8914a283d0568f65843343ed7592377aa813230e1990c6adbb2241a2be3"
            ),
        }
        vendor_root = SKILL_ROOT / "assets" / "vendor" / "apache-ossie"
        for relative_path, expected_hash in expected.items():
            digest = hashlib.sha256(
                (vendor_root / relative_path).read_bytes()
            ).hexdigest()
            self.assertEqual(digest, expected_hash, relative_path)

    def test_schema_rejects_ai_context_inside_concept(self):
        document = base_document()
        document["ontology"][0]["ai_context"] = {"synonyms": ["客户"]}
        self.assertIn(
            "SCHEMA_ADDITIONAL_PROPERTY",
            {item["code"] for item in VALIDATOR.validate_schema(document)},
        )

    def test_schema_rejects_one_to_many(self):
        document = base_document()
        document["ontology"][1]["relationships"][0][
            "multiplicity"
        ] = "OneToMany"
        self.assertIn(
            "SCHEMA_ENUM",
            {item["code"] for item in VALIDATOR.validate_schema(document)},
        )

    def test_multiplicity_is_optional(self):
        document = base_document()
        del document["ontology"][1]["relationships"][0]["multiplicity"]
        self.assertEqual(VALIDATOR.validate_semantics(document), [])

    def test_one_to_one_is_binary_only(self):
        document = base_document()
        relationship = document["ontology"][1]["relationships"][0]
        relationship["roles"].append({"concept": "Date"})
        relationship["multiplicity"] = "OneToOne"
        self.assertIn(
            "ONE_TO_ONE_REQUIRES_BINARY",
            {item["code"] for item in VALIDATOR.validate_semantics(document)},
        )

    def test_value_type_must_reach_an_ontology_builtin(self):
        document = base_document()
        document["ontology"].append(
            {"concept": "local_time", "type": "ValueType", "extends": ["Time"]}
        )
        self.assert_codes(
            VALIDATOR.validate_semantics(document),
            "UNKNOWN_PARENT_CONCEPT",
            "VALUE_TYPE_WITHOUT_BUILTIN_BASE",
        )

    def test_repeated_role_concept_requires_a_role_name(self):
        document = base_document()
        document["ontology"].append(
            {
                "concept": "person",
                "type": "EntityType",
                "relationships": [
                    {
                        "name": "parent_of",
                        "roles": [{"concept": "person"}],
                        "verbalizes": ["{person} 是另一个 {person} 的父母"],
                    }
                ],
            }
        )
        codes = {
            item["code"] for item in VALIDATOR.validate_semantics(document)
        }
        self.assertIn("AMBIGUOUS_ROLE_NAME", codes)

    def test_identifier_must_reference_local_binary_relationship(self):
        document = base_document()
        document["ontology"][1]["identify_by"] = ["missing"]
        self.assertIn(
            "UNKNOWN_IDENTITY_RELATIONSHIP",
            {item["code"] for item in VALIDATOR.validate_semantics(document)},
        )


if __name__ == "__main__":
    unittest.main()
