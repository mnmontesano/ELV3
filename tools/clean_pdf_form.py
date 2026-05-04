"""
Clean a LiveCycle/AcroForm PDF for machine readability:
  1. Promote each field's /TU tooltip to a flat, snake_case /T name
  2. Detach leaves from nested subform parents (flat AcroForm /Fields)
  3. Normalize checkbox /V to /Off when empty so unchecked is consistent
  4. Disambiguate name collisions with numeric suffixes
  5. Emit a JSON sidecar mapping new_name -> {old_full_name, type, page, label}
"""
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import pikepdf
from pikepdf import Dictionary, Name, Pdf, String


def slugify(text: str) -> str:
    s = re.sub(r"[^\w\s]+", "_", text)
    s = re.sub(r"\s+", "_", s.strip())
    s = re.sub(r"_+", "_", s)
    return s.strip("_").lower()


def get_full_name(field: Dictionary) -> str:
    parts = []
    cur = field
    while cur is not None:
        t = cur.get(Name.T)
        if t is not None:
            parts.append(str(t))
        cur = cur.get(Name.Parent)
    return ".".join(reversed(parts))


def walk_leaves(fields):
    for f in fields:
        if Name.Kids in f and Name.FT not in f:
            yield from walk_leaves(f.Kids)
        else:
            yield f


def page_index_for_field(pdf: Pdf, field: Dictionary) -> int | None:
    target_p = field.get(Name.P)
    if target_p is None:
        return None
    for i, page in enumerate(pdf.pages):
        if page.obj == target_p:
            return i + 1
    return None


def clean(input_path: Path, output_path: Path, mapping_path: Path) -> None:
    pdf = Pdf.open(str(input_path))
    acroform = pdf.Root.get(Name.AcroForm)
    if acroform is None or Name.Fields not in acroform:
        raise SystemExit("PDF has no AcroForm fields")

    leaves = list(walk_leaves(acroform.Fields))

    used_names: dict[str, int] = defaultdict(int)
    mapping: list[dict] = []

    for field in leaves:
        old_full = get_full_name(field)
        ft = field.get(Name.FT)
        tu = field.get(Name.TU)

        # Build base name from tooltip when present and meaningful
        base = None
        if tu is not None:
            tu_str = str(tu)
            if tu_str and not re.match(r"^(Text Field|TextField|CheckBox)\d*$", tu_str):
                base = slugify(tu_str)

        if not base:
            leaf_t = str(field.get(Name.T) or "field")
            base = slugify(re.sub(r"_\d+_?$|\[\d+\]$", "", leaf_t)) or "field"

        # Disambiguate
        used_names[base] += 1
        new_name = base if used_names[base] == 1 else f"{base}__{used_names[base]}"

        # Normalize checkbox value: empty -> /Off so unchecked is consistent
        if ft == Name.Btn:
            v = field.get(Name.V)
            if v is None or (isinstance(v, String) and str(v) == ""):
                field[Name.V] = Name("/Off")

        # Capture metadata BEFORE we detach
        mapping.append({
            "new_name": new_name,
            "old_full_name": old_full,
            "type": "checkbox" if ft == Name.Btn else ("text" if ft == Name.Tx else str(ft)),
            "page": page_index_for_field(pdf, field),
            "label": str(tu) if tu is not None else None,
        })

        # Rename and detach from parent
        field[Name.T] = String(new_name)
        if Name.Parent in field:
            del field[Name.Parent]

    # Replace AcroForm /Fields with the flat list of leaves
    acroform.Fields = pikepdf.Array(leaves)

    # Tell viewers we changed field names so they re-render appearances
    acroform[Name.NeedAppearances] = True

    pdf.save(str(output_path))

    mapping_path.write_text(json.dumps(mapping, indent=2))
    print(f"Wrote {output_path}")
    print(f"Wrote {mapping_path}")
    print(f"Renamed {len(leaves)} leaf fields")


if __name__ == "__main__":
    inp = Path(sys.argv[1])
    out = inp.with_name(inp.stem + ".cleaned.pdf")
    mp = inp.with_name(inp.stem + ".fields.json")
    clean(inp, out, mp)
