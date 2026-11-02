#!/usr/bin/env python3
"""Resolve built-in, personal, project, and one-shot role packs by precedence."""
import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from validate_role_pack import (  # noqa: E402
    RolePackError,
    load_role_directory,
    validate_file,
    validate_role,
)

DEFAULT_BUILTIN = SCRIPT_DIR.parent / "references" / "built-in-roles.md"
YAML_BLOCK_RE = re.compile(r"```yaml\n(.*?)```", re.S)


def load_builtin_roles(path):
    """Load and validate YAML role blocks from the built-in markdown file."""
    path = Path(path)
    if path.is_symlink():
        raise RolePackError("{0}: symbolic links are not allowed".format(path))
    if not path.exists() or not path.is_file():
        raise RolePackError("{0}: not a regular file".format(path))
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise RolePackError("{0}: file is not valid UTF-8: {1}".format(path, exc))
    except OSError as exc:
        raise RolePackError("{0}: cannot read file: {1}".format(path, exc))

    blocks = YAML_BLOCK_RE.findall(text)
    if not blocks:
        raise RolePackError("{0}: no YAML role blocks found".format(path))
    roles = []
    seen = set()
    for index, block in enumerate(blocks):
        try:
            data = yaml.safe_load(block)
        except yaml.YAMLError as exc:
            raise RolePackError(
                "{0}: invalid YAML block {1}: {2}".format(path, index + 1, exc)
            )
        if not isinstance(data, dict):
            raise RolePackError(
                "{0}: YAML block {1} must be a mapping".format(path, index + 1)
            )
        role_id = data.get("id")
        errors = validate_role(data, str(path), role_id if isinstance(role_id, str) else None)
        if errors:
            raise RolePackError("\n".join(errors))
        if role_id in seen:
            raise RolePackError("{0}: duplicate built-in role id {1}".format(path, role_id))
        seen.add(role_id)
        roles.append(data)
    return roles


def _add_layer(
    resolved,
    layer,
    role_sources,
):
    for source_path, data in role_sources:
        selected = dict(data)
        selected["source_layer"] = layer
        selected["source_path"] = str(source_path)
        resolved[data["id"]] = selected


def resolve_role_layers(
    builtin_file,
    personal_dir=None,
    project_dir=None,
    override_file=None,
    override_id=None,
):
    """Return roles after full replacement in fixed precedence order."""
    resolved = {}
    builtin_path = Path(builtin_file)
    _add_layer(
        resolved,
        "builtin",
        [(builtin_path, role) for role in load_builtin_roles(builtin_path)],
    )

    if personal_dir is not None:
        personal_path = Path(personal_dir)
        _add_layer(resolved, "personal", load_role_directory(personal_path))

    if project_dir is not None:
        project_path = Path(project_dir)
        _add_layer(resolved, "project", load_role_directory(project_path))

    if override_file is not None:
        override_path = Path(override_file)
        override_role = validate_file(override_path, expected_id=override_id)
        _add_layer(resolved, "override", [(override_path, override_role)])

    return [resolved[role_id] for role_id in sorted(resolved)]


def main(argv=None):
    """Resolve role layers and print JSON."""
    parser = argparse.ArgumentParser(description="Resolve deliberation role packs by precedence")
    parser.add_argument("--builtin", default=str(DEFAULT_BUILTIN), help="built-in roles markdown")
    parser.add_argument("--personal", help="personal role-pack directory")
    parser.add_argument("--project", help="project role-pack directory")
    parser.add_argument("--override", help="one-shot role-pack file")
    parser.add_argument("--override-id", help="expected role id for a temporary override file")
    args = parser.parse_args(argv)
    if args.override_id and not args.override:
        parser.error("--override-id is only valid with --override")

    try:
        roles = resolve_role_layers(
            args.builtin,
            personal_dir=args.personal,
            project_dir=args.project,
            override_file=args.override,
            override_id=args.override_id,
        )
    except RolePackError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    print(json.dumps(roles, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
