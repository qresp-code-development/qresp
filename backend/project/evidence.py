"""Per-candidate evidence for the RCC folder-candidate AI.

Why this exists
---------------
The folder analysis already reads a bounded set of text files off the file
server, but only Tool candidates ever looked at them: a Dataset's own
README, a Script's module docstring and a Chart notebook's markdown were
fetched (or, for notebooks, not even fetched) and then thrown away. The AI
action therefore received the candidate's NAME, its RELATIVE PATHS and the
analyzer's own structural sentences -- and, from the browser, whatever the
curator had already typed into the same field it was being asked to fill.

This module turns the inventory plus that bounded text into a STRUCTURED,
per-candidate evidence bundle:

    {"type": "readme", "path": "scripts/a/README.md", "excerpt": "..."}
    {"type": "docstring", "path": "scripts/a/run.py", "excerpt": "..."}
    {"type": "python_symbols", "path": "scripts/a/run.py",
     "names": ["load_data", "plot_band_structure"]}

Hard rules, all enforced here rather than trusted to a prompt:

* Evidence NEVER crosses a candidate boundary. A source is admitted only when
  its path is inside the candidate's own boundary, so a sibling dataset's
  README can never describe this one.
* Raw data content is never read. No CSV/JSON/HDF5 values, no image bytes, no
  notebook code cells, outputs or attachments, no function bodies, no string
  literals -- only top-level `def`/`class` NAMES, via `ast`, and only when the
  file actually parses.
* Everything is untrusted text. Credential-shaped values are redacted before
  the bundle is built, and every excerpt is length-capped.
* Budgets are explicit and deterministic: per source, per candidate, and per
  candidate file count.

Nothing here fetches, writes, renames or stores anything. It is a pure
function of the inventory and the text the caller already has.
"""
import ast
import json
import posixpath
import re

# ---- budgets (explicit, tested) ---------------------------------------------
#
# A source that runs past its cap is TRUNCATED, never dropped: half a README
# still says what a folder is about. A candidate that runs past its total
# budget stops admitting further sources, lower-priority ones first, so the
# highest-value evidence is the evidence that survives.

MAX_EXCERPT_CHARS = 1200        # one README/docstring/notebook-markdown block
MAX_CANDIDATE_EVIDENCE_CHARS = 3000   # all excerpts for one candidate
MAX_SOURCES_PER_CANDIDATE = 8
MAX_SYMBOLS = 12
MAX_SYMBOL_CHARS = 60
MAX_NOTEBOOK_MARKDOWN_CELLS = 8
MAX_NOTEBOOK_BYTES = 400000
MAX_SAMPLE_NAMES = 8
MAX_INVENTORY_EXTENSIONS = 6
MAX_MANIFEST_LINES = 12

# How many files of ONE candidate the caller may spend a text read on. Without
# this a single 400-file script folder consumes the whole global read budget
# and every other candidate's README goes unread.
MAX_READS_PER_CANDIDATE = 4

README_NAMES = ("readme", "readme.md", "readme.txt", "readme.rst")
PYTHON_EXTENSIONS = (".py",)
NOTEBOOK_EXTENSIONS = (".ipynb",)
# Languages whose leading comment block we will read. A `#`/`//`/`%`/`!`
# comment at the top of a file is a human writing down what it does.
COMMENT_EXTENSIONS = (".sh", ".bash", ".r", ".jl", ".m", ".f90", ".f")
MANIFEST_NAMES = (
    "requirements.txt", "requirements.lock.txt", "environment.yml",
    "environment.yaml", "pyproject.toml", "setup.py", "package.json",
    "qresp.ini",
)

# ---- redaction ---------------------------------------------------------------
#
# RCC text is untrusted and occasionally contains a key someone pasted into a
# run script. Redaction happens BEFORE anything is bundled, so a secret is
# never in the object that a later cap might or might not truncate away.

_SECRET_PATTERNS = (
    # key = "value" / token: value / password=... — the assignment form.
    re.compile(
        r"(?i)\b(api[_-]?key|apikey|secret|token|password|passwd|pwd|"
        r"access[_-]?key|secret[_-]?key|client[_-]?secret|auth[_-]?token)\b"
        r"\s*[:=]\s*[\"']?([^\s\"',;]{4,})"),
    # Authorization: Bearer <...>
    re.compile(r"(?i)\b(authorization)\s*[:=]\s*[\"']?"
               r"((?:bearer|basic|token)\s+)?([^\s\"',;]{4,})"),
    # PEM private key blocks.
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?"
               r"-----END [A-Z ]*PRIVATE KEY-----", re.DOTALL),
    # Provider-shaped standalone credentials.
    re.compile(r"\b(?:sk|pk|rk)-[A-Za-z0-9_-]{12,}\b"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{16,}\b"),
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    re.compile(r"\bAIza[0-9A-Za-z_-]{20,}\b"),
    # https://user:password@host — credentials in a URL.
    re.compile(r"(?i)\b([a-z][a-z0-9+.-]*://)[^/\s:@]+:[^/\s:@]+@"),
)

REDACTED = "[redacted]"


def redact(text):
    """Remove credential-shaped values from untrusted text.

    Conservative on purpose: it is far better to send `api_key=[redacted]`
    than to reason about whether a particular string really was a secret. The
    KEY NAME is deliberately kept, because "this script takes an API key" is
    itself useful context; only the value goes.
    """
    value = str(text or "")
    if not value:
        return ""
    for pattern in _SECRET_PATTERNS:
        if pattern.groups == 0:
            value = pattern.sub(REDACTED, value)
        elif pattern.pattern.startswith("(?i)\\b(authorization)"):
            value = pattern.sub(lambda m: "%s: %s%s"
                                % (m.group(1), m.group(2) or "", REDACTED),
                                value)
        elif "://" in pattern.pattern:
            value = pattern.sub(lambda m: "%s%s@" % (m.group(1), REDACTED),
                                value)
        else:
            value = pattern.sub(lambda m: "%s=%s" % (m.group(1), REDACTED),
                                value)
    return value


def _clean(text, limit=MAX_EXCERPT_CHARS):
    """Redact, collapse whitespace, and cap. The one way text becomes an
    excerpt, so no path can skip the redaction step."""
    return re.sub(r"\s+", " ", redact(text)).strip()[:limit]


# ---- extractors ---------------------------------------------------------------

def python_docstring(text):
    """The module docstring of a Python file, or "".

    Parsed with `ast`, so a docstring is only ever reported when the file
    genuinely has one. A file that does not parse yields nothing here: the
    leading-comment reader below is the fallback, and there is deliberately no
    regex that "finds" a docstring in broken source.
    """
    try:
        module = ast.parse(str(text or ""))
    except (SyntaxError, ValueError, RecursionError, MemoryError):
        return ""
    return _clean(ast.get_docstring(module) or "")


def leading_comment(text):
    """The leading comment block of a non-Python source file, or "".

    Stops at the first line that is not blank, not a shebang and not a
    comment: what follows is code, and code is not evidence.
    """
    lines = []
    for line in str(text or "").splitlines():
        stripped = line.strip()
        if not stripped:
            if lines:
                break
            continue
        if stripped.startswith("#!"):
            continue
        match = re.match(r"^(#+|//+|%+|!+|;+|--)\s?(.*)$", stripped)
        if not match:
            break
        lines.append(match.group(2).strip())
        if len(lines) >= 40:
            break
    return _clean(" ".join(lines))


def python_symbols(text):
    """TOP-LEVEL function and class NAMES only.

    Names, never bodies: `ast` gives us the definition nodes and we take
    `.name` off each one, so no statement, string literal, default argument or
    numeric constant from inside a function can reach the payload. A file with
    a syntax error yields nothing -- guessing function names out of broken
    source with a regex would report definitions that do not exist.
    """
    try:
        module = ast.parse(str(text or ""))
    except (SyntaxError, ValueError, RecursionError, MemoryError):
        return []
    names = []
    for node in module.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef,
                             ast.ClassDef)):
            name = str(node.name or "").strip()[:MAX_SYMBOL_CHARS]
            # A private helper says nothing about what the script is for.
            if name and not name.startswith("_") and name not in names:
                names.append(name)
        if len(names) >= MAX_SYMBOLS:
            break
    return names


def notebook_markdown(text):
    """Markdown cell text from a .ipynb, bounded. Never code or output.

    Only `cell_type == "markdown"` is read, and only its `source`. Code cells,
    `outputs`, `attachments`, `execution_count` and notebook metadata are
    structurally never touched -- a notebook output can hold a base64 image or
    a full result table, and neither belongs in a description prompt.

    A corrupt or oversized notebook yields "" rather than raising: one
    unreadable file must not fail the analysis of a whole folder.
    """
    raw = str(text or "")
    if not raw.strip() or len(raw) > MAX_NOTEBOOK_BYTES:
        return ""
    try:
        document = json.loads(raw)
    except (ValueError, RecursionError, MemoryError):
        return ""
    if not isinstance(document, dict):
        return ""
    cells = document.get("cells")
    if not isinstance(cells, list):
        return ""
    blocks = []
    for cell in cells:
        if not isinstance(cell, dict):
            continue
        if cell.get("cell_type") != "markdown":
            continue
        source = cell.get("source")
        if isinstance(source, list):
            source = "".join(part for part in source if isinstance(part, str))
        if not isinstance(source, str):
            continue
        block = source.strip()
        if block:
            blocks.append(block)
        if len(blocks) >= MAX_NOTEBOOK_MARKDOWN_CELLS:
            break
    return _clean("\n".join(blocks))


def manifest_lines(text):
    """Declaration-shaped lines of a manifest, bounded, comments dropped."""
    kept = []
    for line in str(text or "").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        kept.append(stripped)
        if len(kept) >= MAX_MANIFEST_LINES:
            break
    return _clean(" | ".join(kept))


# ---- inventory ----------------------------------------------------------------

def inventory(paths):
    """File-kind and count summary for one candidate: never the whole list.

    `sample_names` are BASENAMES: a representative handful so "12 .cube files
    named vlocal_*" is visible without shipping 4000 paths.
    """
    paths = [p for p in paths or [] if p]
    extensions = {}
    for path in paths:
        ext = posixpath.splitext(path)[1].lower() or "(no extension)"
        extensions[ext] = extensions.get(ext, 0) + 1
    ordered = sorted(extensions.items(), key=lambda kv: (-kv[1], kv[0]))
    return {
        "file_count": len(paths),
        "extensions": [{"extension": ext, "count": count}
                       for ext, count in ordered[:MAX_INVENTORY_EXTENSIONS]],
        "sample_names": [posixpath.basename(p)
                         for p in sorted(paths)[:MAX_SAMPLE_NAMES]],
    }


# ---- boundary ------------------------------------------------------------------

def within(path, boundary):
    """True when `path` is the boundary itself or sits inside it.

    The single containment rule for the whole module. A candidate whose
    boundary is one FILE admits only that file; a candidate whose boundary is
    a FOLDER admits its descendants. `scripts/analysis2` is not inside
    `scripts/analysis`, which the naive `startswith` this replaced got wrong.
    """
    if not path or not boundary:
        return False
    return path == boundary or path.startswith(boundary.rstrip("/") + "/")


def _basename_lower(path):
    return posixpath.basename(path or "").lower()


def is_readme(path):
    return _basename_lower(path) in README_NAMES


def is_manifest(path):
    return _basename_lower(path) in MANIFEST_NAMES


def _ext(path):
    return posixpath.splitext(path or "")[1].lower()


# ---- the read plan -------------------------------------------------------------
#
# Which files are worth spending a file-server request on, and in what order.
# Per-candidate first, so the global cap is shared FAIRLY: every candidate gets
# its README before any candidate gets its fourth script.

def _read_priority(path):
    """Lower sorts earlier. README first: it is the one file written for a
    human reader, and it is what the old plan never used."""
    if is_readme(path):
        return 0
    ext = _ext(path)
    if ext in PYTHON_EXTENSIONS:
        return 1
    if ext in NOTEBOOK_EXTENSIONS:
        return 2
    if is_manifest(path):
        return 3
    if ext in COMMENT_EXTENSIONS:
        return 4
    return 9


def readable(path):
    return _read_priority(path) < 9


def plan_reads(boundaries, limit):
    """Deterministic, fair read plan across candidate boundaries.

    `boundaries` is an ordered sequence of (boundary_path, member_paths). Each
    boundary contributes at most MAX_READS_PER_CANDIDATE files, chosen by
    priority then path; the boundaries are then interleaved ROUND ROBIN so the
    global `limit` is spent one file per candidate at a time.

    That interleaving is the whole point. Reading greedily boundary by
    boundary meant a single large script folder used the entire budget and
    every later dataset's README went unread -- silently, because a candidate
    with no evidence looks exactly like a candidate whose evidence was never
    fetched.
    """
    per_boundary = []
    for _boundary, members in boundaries:
        wanted = sorted((p for p in members or [] if readable(p)),
                        key=lambda p: (_read_priority(p), p))
        if wanted:
            per_boundary.append(wanted[:MAX_READS_PER_CANDIDATE])

    planned, seen = [], set()
    for round_index in range(MAX_READS_PER_CANDIDATE):
        for wanted in per_boundary:
            if round_index >= len(wanted):
                continue
            path = wanted[round_index]
            if path in seen:
                continue
            seen.add(path)
            planned.append(path)
            if len(planned) >= limit:
                return planned
    return planned


# ---- the bundle -----------------------------------------------------------------

# Which source types each record kind may carry, in the order they are
# admitted. This IS the per-kind contract, and it is a closed list: a Dataset
# never gets a docstring or notebook markdown, a Chart never gets anything but
# text a human wrote about it, and NO kind gets raw data content or image
# bytes -- not by policy, but because no extractor for them exists in this
# module.
#
# Two things a kind carries that are NOT here, because they are not read from
# a file by these extractors: a Chart's supporting/input FILE NAMES (they
# arrive in `inventory`), and a Tool's pinned package/version pairs (parsed by
# curation.parse_manifest / parse_module_loads and appended as a
# `declarations` source).
KIND_SOURCES = {
    "chart": ("readme", "notebook_markdown"),
    "dataset": ("readme", "manifest"),
    "script": ("readme", "docstring", "python_symbols", "comment_header"),
    "tool": ("readme", "manifest", "comment_header"),
}

# Source types a kind carries that the extractors above do NOT produce.
# `declarations` is parsed by curation.parse_manifest / parse_module_loads
# from the same texts and appended to the Tool bundle there.
APPENDED_SOURCES = {
    "tool": ("declarations",),
}


def accepted_source_types(kind):
    """Every source type this record kind may carry — the ONE table.

    Both directions read it: `build_sources` uses `KIND_SOURCES` to decide
    what to extract, and the endpoint uses this to decide what to ACCEPT back
    from the browser. They have to be the same list. A Chart has no docstring
    and a Dataset has no function names, so a bundle that arrives carrying one
    did not come from this analyzer, and it is not evidence about that
    candidate whatever it says.
    """
    return tuple(KIND_SOURCES.get(kind, ())) + tuple(
        APPENDED_SOURCES.get(kind, ()))


def all_source_types():
    """The union across kinds, for the coarse global allowlist."""
    seen = []
    for kind in KIND_SOURCES:
        for source_type in accepted_source_types(kind):
            if source_type not in seen:
                seen.append(source_type)
    return tuple(seen)


def _source(kind, path, excerpt="", names=None):
    source = {"type": kind, "path": path}
    if names is not None:
        source["names"] = names
    else:
        source["excerpt"] = excerpt
    return source


def _script_sources(members, texts):
    """docstring / python_symbols / comment_header, per source file."""
    sources = []
    for path in sorted(members):
        text = texts.get(path)
        if text is None:
            continue
        ext = _ext(path)
        if ext in PYTHON_EXTENSIONS:
            doc = python_docstring(text)
            if doc:
                sources.append(_source("docstring", path, excerpt=doc))
            names = python_symbols(text)
            if names:
                sources.append(_source("python_symbols", path, names=names))
        elif ext in COMMENT_EXTENSIONS:
            header = leading_comment(text)
            if header:
                sources.append(_source("comment_header", path,
                                       excerpt=header))
    return sources


def _readme_sources(members, texts):
    sources = []
    for path in sorted(members):
        if not is_readme(path):
            continue
        excerpt = _clean(texts.get(path))
        if excerpt:
            sources.append(_source("readme", path, excerpt=excerpt))
    return sources


def _manifest_sources(members, texts):
    sources = []
    for path in sorted(members):
        if not is_manifest(path):
            continue
        excerpt = manifest_lines(texts.get(path))
        if excerpt:
            sources.append(_source("manifest", path, excerpt=excerpt))
    return sources


def _notebook_sources(members, texts):
    sources = []
    for path in sorted(members):
        if _ext(path) not in NOTEBOOK_EXTENSIONS:
            continue
        excerpt = notebook_markdown(texts.get(path))
        if excerpt:
            sources.append(_source("notebook_markdown", path,
                                   excerpt=excerpt))
    return sources


def _cost(source):
    """What a source spends against the candidate's character budget."""
    if "names" in source:
        return sum(len(name) for name in source["names"])
    return len(source.get("excerpt") or "")


def build_sources(kind, boundary, members, texts, extra_paths=None):
    """The ordered, bounded, boundary-confined evidence for ONE candidate.

    `boundary` is the candidate's own folder (or its single file) and is the
    ONLY containment rule: a path outside it is dropped even when the caller
    passed it in, which is what keeps a sibling's README out of this
    candidate's bundle. `extra_paths` lets a Chart admit its matched notebook
    when that notebook sits beside, rather than under, the image -- and it is
    boundary-checked exactly like everything else.

    Sources are admitted in KIND_SOURCES order until either the source count
    or the character budget runs out, so when something has to go it is the
    lowest-priority evidence that goes.
    """
    allowed = KIND_SOURCES.get(kind, ())
    candidates = list(members or []) + list(extra_paths or [])
    inside = sorted({p for p in candidates if within(p, boundary)})

    by_type = {
        "readme": lambda: _readme_sources(inside, texts),
        "manifest": lambda: _manifest_sources(inside, texts),
        "notebook_markdown": lambda: _notebook_sources(inside, texts),
        "docstring": lambda: [s for s in _script_sources(inside, texts)
                              if s["type"] == "docstring"],
        "python_symbols": lambda: [s for s in _script_sources(inside, texts)
                                   if s["type"] == "python_symbols"],
        "comment_header": lambda: [s for s in _script_sources(inside, texts)
                                   if s["type"] == "comment_header"],
    }

    sources, budget = [], MAX_CANDIDATE_EVIDENCE_CHARS
    for source_type in allowed:
        for source in by_type[source_type]():
            if len(sources) >= MAX_SOURCES_PER_CANDIDATE:
                return sources
            cost = _cost(source)
            if cost > budget:
                continue
            budget -= cost
            sources.append(source)
    return sources
