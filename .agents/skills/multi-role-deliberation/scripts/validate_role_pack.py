#!/usr/bin/env python3
"""Validate deliberation role-pack YAML files without executing them."""
import argparse
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml

ID_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
SKILL_RE = re.compile(r"^[a-z0-9][a-z0-9._-]*(?::[a-z0-9][a-z0-9._-]*)?$")
EXTRA_RE = re.compile(r"^[a-z0-9_]+$")
FIXED_SECTIONS = [
    "position",
    "evidence",
    "risks_and_unknowns",
    "questions_to_other_roles",
    "recommendation",
]
TOP_FIELDS = {
    "schema_version",
    "id",
    "name",
    "description",
    "mission",
    "perspective",
    "focus_questions",
    "required_evidence",
    "constraints",
    "review_lens",
    "skill_bindings",
    "preset",
    "output_contract",
}
REQUIRED_FIELDS = TOP_FIELDS - {"preset"}


class RolePackError(Exception):
    """Raised when one or more role packs are invalid."""


def _error(source, message):
    return "{0}: {1}".format(source, message)


def _check_string_list(data, field, source, errors):
    if field not in data:
        return
    value = data[field]
    if not isinstance(value, list):
        errors.append(_error(source, "{0} must be a list".format(field)))
        return
    if len(value) > 10:
        errors.append(_error(source, "{0} must contain at most 10 items".format(field)))
    seen = set()
    for index, item in enumerate(value):
        if not isinstance(item, str) or not item.strip():
            errors.append(
                _error(source, "{0}[{1}] must be a non-empty string".format(field, index))
            )
        elif len(item) > 500:
            errors.append(
                _error(source, "{0}[{1}] exceeds 500 characters".format(field, index))
            )
        else:
            if item in seen:
                errors.append(
                    _error(source, "{0} has duplicates".format(field))
                )
            seen.add(item)


def validate_role(data, source, expected_id=None):
    """Return field-specific validation errors without executing any value."""
    errors = []
    if not isinstance(data, dict):
        return [_error(source, "role pack must be a mapping")]

    unknown = sorted((set(data.keys()) - TOP_FIELDS), key=str)
    if unknown:
        errors.append(
            _error(source, "unknown fields: {0}".format(", ".join(map(str, unknown))))
        )
    missing = sorted(REQUIRED_FIELDS - set(data.keys()))
    if missing:
        errors.append(_error(source, "missing fields: {0}".format(", ".join(missing))))

    schema_version = data.get("schema_version")
    if type(schema_version) is not int or schema_version != 1:
        errors.append(_error(source, "schema_version must be integer 1"))

    role_id = data.get("id")
    if not isinstance(role_id, str) or not ID_RE.fullmatch(role_id) or len(role_id) > 64:
        errors.append(
            _error(source, "id must match ^[a-z0-9]+(?:-[a-z0-9]+)*$ and be <=64 characters")
        )
    elif expected_id is not None and role_id != expected_id:
        errors.append(
            _error(
                source,
                "id {0!r} does not match filename {1!r}".format(role_id, expected_id),
            )
        )

    limits = {"name": 80, "description": 500, "mission": 500}
    for field, limit in limits.items():
        value = data.get(field)
        if not isinstance(value, str) or not value.strip():
            errors.append(_error(source, "{0} must be a non-empty string".format(field)))
        elif len(value) > limit:
            errors.append(_error(source, "{0} exceeds {1} characters".format(field, limit)))

    for field in (
        "perspective",
        "focus_questions",
        "required_evidence",
        "constraints",
        "review_lens",
    ):
        _check_string_list(data, field, source, errors)

    if "skill_bindings" in data:
        bindings = data["skill_bindings"]
        if not isinstance(bindings, list):
            errors.append(_error(source, "skill_bindings must be a list"))
        elif len(bindings) > 8:
            errors.append(_error(source, "skill_bindings must contain at most 8 items"))
        else:
            seen_skills = set()
            for index, binding in enumerate(bindings):
                prefix = "skill_bindings[{0}]".format(index)
                if not isinstance(binding, dict):
                    errors.append(_error(source, prefix + " must be a mapping"))
                    continue
                unknown_binding = sorted(
                    set(binding.keys()) - {"skill", "purpose", "required"}, key=str
                )
                if unknown_binding:
                    errors.append(
                        _error(
                            source,
                            prefix
                            + " has unknown fields: "
                            + ", ".join(map(str, unknown_binding)),
                        )
                    )
                skill = binding.get("skill")
                if (
                    not isinstance(skill, str)
                    or not SKILL_RE.fullmatch(skill)
                    or len(skill) > 128
                ):
                    errors.append(
                        _error(
                            source,
                            prefix + ".skill must be skill-name or plugin-name:skill-name",
                        )
                    )
                elif skill in seen_skills:
                    errors.append(_error(source, "duplicate skill binding: " + skill))
                else:
                    seen_skills.add(skill)
                purpose = binding.get("purpose")
                if (
                    not isinstance(purpose, str)
                    or not purpose.strip()
                    or len(purpose) > 300
                ):
                    errors.append(
                        _error(
                            source,
                            prefix + ".purpose must be a non-empty string <=300 characters",
                        )
                    )
                required = binding.get("required", True)
                if type(required) is not bool:
                    errors.append(_error(source, prefix + ".required must be a boolean"))

    if "preset" in data:
        preset = data["preset"]
        if not isinstance(preset, str):
            errors.append(_error(source, "preset must be a string"))
        elif len(preset) > 4000:
            errors.append(_error(source, "preset exceeds 4000 characters"))

    if "output_contract" in data:
        contract = data["output_contract"]
        if not isinstance(contract, dict):
            errors.append(_error(source, "output_contract must be a mapping"))
        else:
            unknown_contract = sorted(
                set(contract.keys()) - {"required_sections", "extra_sections"}, key=str
            )
            if unknown_contract:
                errors.append(
                    _error(
                        source,
                        "output_contract has unknown fields: "
                        + ", ".join(map(str, unknown_contract)),
                    )
                )
            sections = contract.get("required_sections")
            if not isinstance(sections, list):
                errors.append(
                    _error(source, "output_contract.required_sections must be a list")
                )
            else:
                missing_sections = [item for item in FIXED_SECTIONS if item not in sections]
                if missing_sections:
                    errors.append(
                        _error(
                            source,
                            "output_contract.required_sections missing: "
                            + ", ".join(missing_sections),
                        )
                    )
                string_sections = [item for item in sections if isinstance(item, str)]
                if len(string_sections) != len(set(string_sections)):
                    errors.append(
                        _error(source, "output_contract.required_sections has duplicates")
                    )
                for index, item in enumerate(sections):
                    if not isinstance(item, str) or not item.strip():
                        errors.append(
                            _error(
                                source,
                                "output_contract.required_sections[{0}] must be a non-empty string".format(
                                    index
                                ),
                            )
                        )
            extra = contract.get("extra_sections")
            if not isinstance(extra, list):
                errors.append(
                    _error(source, "output_contract.extra_sections must be a list")
                )
            else:
                if len(extra) > 5:
                    errors.append(
                        _error(
                            source,
                            "output_contract.extra_sections supports at most 5 items",
                        )
                    )
                string_extra = [item for item in extra if isinstance(item, str)]
                if len(string_extra) != len(set(string_extra)):
                    errors.append(
                        _error(source, "output_contract.extra_sections has duplicates")
                    )
                for index, item in enumerate(extra):
                    if (
                        not isinstance(item, str)
                        or not EXTRA_RE.fullmatch(item)
                        or len(item) > 64
                    ):
                        errors.append(
                            _error(
                                source,
                                "output_contract.extra_sections[{0}] must match ^[a-z0-9_]+$".format(
                                    index
                                ),
                            )
                        )
    return errors


def load_yaml(path):
    """Safely load one regular YAML file."""
    if path.is_symlink():
        raise RolePackError(_error(str(path), "symbolic links are not allowed"))
    if not path.exists() or not path.is_file():
        raise RolePackError(_error(str(path), "not a regular file"))
    if path.suffix != ".yaml":
        raise RolePackError(_error(str(path), "role pack must use the .yaml extension"))
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise RolePackError(_error(str(path), "file is not valid UTF-8: {0}".format(exc)))
    except OSError as exc:
        raise RolePackError(_error(str(path), "cannot read file: {0}".format(exc)))
    try:
        data = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        raise RolePackError(_error(str(path), "invalid YAML: {0}".format(exc)))
    if not isinstance(data, dict):
        raise RolePackError(_error(str(path), "role pack must be a mapping"))
    return data


def validate_file(path, expected_id=None):
    """Validate a single role-pack file and return parsed data."""
    if ".." in path.parts:
        raise RolePackError(_error(str(path), "parent path components are not allowed"))
    data = load_yaml(path)
    target_id = expected_id if expected_id is not None else path.stem
    errors = validate_role(data, str(path), target_id)
    if errors:
        raise RolePackError("\n".join(errors))
    return data


def load_role_directory(path):
    """Return validated first-level role packs with their concrete source files."""
    if path.is_symlink():
        raise RolePackError(_error(str(path), "symbolic links are not allowed"))
    if not path.exists() or not path.is_dir():
        raise RolePackError(_error(str(path), "not a directory"))

    results = []
    errors = []
    seen = {}
    for item in sorted(path.iterdir(), key=lambda value: value.name):
        if not item.name.endswith(".yaml"):
            continue
        if item.is_symlink():
            errors.append(_error(str(item), "symbolic links are not allowed"))
            continue
        if not item.is_file():
            errors.append(_error(str(item), "not a regular file"))
            continue
        try:
            data = load_yaml(item)
        except RolePackError as exc:
            errors.append(str(exc))
            continue
        item_errors = validate_role(data, str(item), None)
        role_id = data.get("id")
        if isinstance(role_id, str) and item.stem != role_id:
            item_errors.append(
                _error(
                    str(item),
                    "id {0!r} does not match filename {1!r}".format(role_id, item.stem),
                )
            )
        if isinstance(role_id, str):
            if role_id in seen:
                item_errors.append(
                    _error(
                        str(path),
                        "duplicate role id {0!r} in {1} and {2}".format(
                            role_id, seen[role_id], item
                        ),
                    )
                )
            else:
                seen[role_id] = item
        if item_errors:
            errors.extend(item_errors)
        else:
            results.append((item, data))
    if errors:
        raise RolePackError("\n".join(errors))
    return results


def validate_directory(path):
    """Validate first-level role packs and reject duplicate role IDs."""
    return [data for _, data in load_role_directory(path)]


def main(argv=None):
    """Run the command-line validator."""
    parser = argparse.ArgumentParser(description="Validate deliberation role-pack YAML files")
    parser.add_argument("file", nargs="?", help="single role-pack YAML file")
    parser.add_argument("--directory", help="directory containing role-pack YAML files")
    parser.add_argument("--expected-id", help="expected role id when validating a temporary filename")
    args = parser.parse_args(argv)
    if bool(args.file) == bool(args.directory):
        parser.error("provide exactly one of FILE or --directory")
    if args.expected_id and args.directory:
        parser.error("--expected-id is only valid with FILE")

    try:
        if args.file:
            path = Path(args.file)
            role = validate_file(path, expected_id=args.expected_id)
            bindings = role.get("skill_bindings") or []
            print(
                "OK {0} ({1}): {2} skill bindings".format(
                    role["id"], path, len(bindings)
                )
            )
        else:
            path = Path(args.directory)
            roles = load_role_directory(path)
            for role_path, role in roles:
                bindings = role.get("skill_bindings") or []
                print(
                    "OK {0} ({1}): {2} skill bindings".format(
                        role["id"], role_path, len(bindings)
                    )
                )
    except RolePackError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
