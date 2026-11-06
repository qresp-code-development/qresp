"""Code-repository analysis for assisted curation of a code record.

One endpoint (wired through swagger.yml):
- POST /api/curation/analyze-repo   inventory + classify a GitHub/GitLab repo

A repository is read FIGURE FIRST, the way a reader of the work would trace
it: every image (png, pdf, svg, jpg) is a candidate figure; every script and
notebook is read for the file names it saves (savefig, ggsave, gnuplot `set
output`, MATLAB saveas/print, ...), including names built with placeholders
(f"band_{i}.png", "fig%02d.pdf"); a script that writes a figure is linked to
it, the data files it names become datasets feeding it, and the packages it
imports become tools it uses (versioned from the repository's manifests).
Images no script writes and scripts that write no figure are listed but not
selected. The response uses the folder analysis's candidate format, so the
guided setup's import step consumes both unchanged.

The response is an ANALYSIS ONLY: nothing is stored, and nothing becomes a
record until the curator adds it in the browser.

Safety model:
- The browser sends a repository link; only github.com and gitlab.com are
  accepted, and only an `owner/name` path (GitLab: nested groups) made of
  safe characters is taken from it. Every URL fetched is built here.
- The repository is pinned to ONE commit: the tree, every text read and the
  file links handed back all use that commit, so the record keeps pointing
  at the code it was curated from even after the branch moves on.
- Discovery is bounded: tree entries, text reads, bytes per read, GitLab
  tree pages and a request timeout, with an explicit `truncated` flag.
- File contents are never logged.
"""
import json
import os
import posixpath
import re
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote, urlparse

import requests

from project import autocurate
from project import evidence as ev
from project import folderstandard as fs
from project.auth import csrf_protect, get_current_user
from project.curation import (
    HIGH,
    LOW,
    MEDIUM,
    NEEDS_INPUT,
    MAX_CANDIDATE_PATHS,
    MAX_TEXT_BYTES,
    REQUEST_TIMEOUT,
    _candidate,
    _script_header,
    _usable,
)

# ---- bounds -------------------------------------------------------------------

MAX_TREE_FILES = 5000
# Scripts are where the figure names live, so they are read generously: raw
# file reads are not counted against the host's API rate limit. Manifests
# are read on top of this.
MAX_SCRIPT_READS = 400
MAX_MANIFEST_READS = 20
READ_WORKERS = 8
MAX_GITLAB_PAGES = 50
MAX_FIGURES = 300
MAX_OTHER_SCRIPTS = 150
MAX_DATASETS = 150
MAX_TOOLS = 40
# How many figures one ambiguous name may link to before it says nothing.
MAX_FIGURES_PER_NAME = 6

# ---- what the repository holds --------------------------------------------------------

# Never part of the curated work: tooling, caches, vendored copies, build
# output, packaging. Any path with one of these folder names is left out.
IGNORED_SEGMENTS = frozenset((
    ".git", ".github", ".gitlab", ".circleci", ".vscode", ".idea",
    "node_modules", "bower_components", "vendor", "third_party",
    "venv", ".venv", "env", ".env", "__pycache__", ".ipynb_checkpoints",
    "build", "dist", "site-packages", ".tox", ".nox", ".eggs",
    ".mypy_cache", ".pytest_cache",
    "conda", "conda-recipe", "conda.recipe", "recipe", "docker", "ci",
    "packaging", "debian", "rpm",
    # Web/documentation chrome rather than figures.
    "_static", "_templates", "static", "icons", "badges", "favicon",
))
# Tests check the code rather than produce a result a reader reproduces
# (and their images are reference baselines, not figures).
TEST_SEGMENTS = frozenset(("test", "tests", "testing", "spec", "specs",
                           "test-suite", "test_suite", "testsuite",
                           "baseline_images"))
DOC_SEGMENTS = frozenset(("doc", "docs", "documentation", "manual", "site",
                          "website", "images", "img", "media", "assets",
                          "screenshots"))

FIGURE_EXTENSIONS = (".png", ".pdf", ".svg", ".jpg", ".jpeg")
SCRIPT_EXTENSIONS = (".py", ".ipynb", ".sh", ".bash", ".r", ".jl", ".m",
                     ".gp", ".gnu", ".gnuplot", ".plt", ".ncl")
# Files a script may read that are data, rather than code or a figure.
# (Configuration formats -- yaml, toml, ini -- are left out on purpose.)
DATA_EXTENSIONS = (
    ".csv", ".tsv", ".dat", ".txt", ".json", ".xyz", ".h5", ".hdf5", ".nc",
    ".npy", ".npz", ".pkl", ".pickle", ".mat", ".xlsx", ".xls", ".parquet",
    ".feather", ".cube", ".pdb", ".cif", ".out", ".in", ".vasp", ".traj",
    ".db", ".gz", ".bz2", ".xz", ".zip", ".log", ".xml",
)
# Configuring the project rather than producing anything.
SKIP_SCRIPTS = frozenset((
    "setup.py", "conftest.py", "noxfile.py", "fabfile.py", "tasks.py",
    "versioneer.py", "conf.py", "_version.py", "manage.py", "__init__.py",
    "__main__.py",
))
# Names that say nothing about which figure is meant.
GENERIC_STEMS = frozenset((
    "fig", "figure", "figures", "plot", "plots", "image", "img", "output",
    "out", "result", "results", "test", "temp", "tmp", "graph", "chart",
    "data", "file", "name", "new", "final", "main", "a", "b", "x", "y",
))
MANIFEST_RE = re.compile(
    r"(^|/)(requirements[\w.-]*\.txt|environment[\w.-]*\.ya?ml|pyproject\.toml|"
    r"setup\.py|setup\.cfg|Pipfile|DESCRIPTION|Project\.toml)$", re.IGNORECASE)

# A call that writes a figure, in the languages scientific code is written
# in. Literals on (or just after) one of these lines are figure names.
SAVE_RE = re.compile(
    r"savefig|save_fig|savePlot|save_plot|write_image|ggsave|saveas|"
    r"exportgraphics|export_fig|print\s*\(\s*['\"]?-d|set\s+output|imsave|"
    r"imwrite|\bpng\s*\(|\bpdf\s*\(|\bsvg\s*\(|dev\.copy|\.save\s*\(|"
    r"\.to_file\s*\(|output_file|plot_file|fig_?name|figpath|fig_?file|"
    r"outfile|out_file|filename",
    re.IGNORECASE)
SAVE_CONTEXT_LINES = 2

# A quoted string on one line; the prefix covers f-, r- and b-strings.
_LITERAL_RE = re.compile(r"""(?<![\w])[rRbBuUfF]{0,2}(["'])((?:\\.|(?!\1).)*?)\1""")
# Placeholders a figure name may be built with: Python format and f-string
# fields, printf-style %d, shell ${var} / $var, MATLAB/Julia string pieces.
_PLACEHOLDER_RE = re.compile(
    r"(\{[^{}]*\}|%[-+ 0#]*\d*(?:\.\d+)?[sdifgeExXr]|\$\{[^}]*\}|\$\(?[A-Za-z_]\w*\)?)")

_JSON_STRING_RE = re.compile(r'"((?:\\.|[^"\\])*)"')
_PY_IMPORT_RE = re.compile(r"^\s*(?:from\s+([A-Za-z_]\w*)[\w.]*\s+import|import\s+([A-Za-z_][\w., ]*))", re.MULTILINE)
_R_IMPORT_RE = re.compile(r"\b(?:library|require)\s*\(\s*['\"]?([A-Za-z][\w.]*)", re.MULTILINE)
_JL_IMPORT_RE = re.compile(r"^\s*(?:using|import)\s+([A-Za-z_][\w, ]*)", re.MULTILINE)

# The distribution an import name usually comes from, where they differ.
IMPORT_PACKAGES = {
    "sklearn": "scikit-learn", "skimage": "scikit-image", "cv2": "opencv-python",
    "PIL": "pillow", "yaml": "pyyaml", "mpl_toolkits": "matplotlib",
    "Bio": "biopython", "bs4": "beautifulsoup4", "dateutil": "python-dateutil",
    "attr": "attrs", "pylab": "matplotlib", "Image": "pillow",
}
try:
    import sys as _sys
    STDLIB = frozenset(_sys.stdlib_module_names) | {"__future__"}
except AttributeError:  # Python < 3.10
    STDLIB = frozenset(("os", "sys", "re", "json", "math", "time", "glob",
                        "itertools", "collections", "functools", "subprocess",
                        "argparse", "pathlib", "shutil", "random", "pickle",
                        "copy", "typing", "warnings", "logging", "string",
                        "datetime", "csv", "io", "__future__"))

USES_TOOL = "uses_tool"
GENERATES = "generates"
CONSUMES = "consumes"


def _ext(path):
    return posixpath.splitext(path)[1].lower()


def _stem(path):
    return posixpath.splitext(posixpath.basename(path))[0]


def _segments(path):
    return [s.lower() for s in path.split("/")[:-1]]


def _kept(path):
    folders = _segments(path)
    if any(s in IGNORED_SEGMENTS or s.startswith(".") or s.endswith(".egg-info")
           for s in folders):
        return False
    return True


def _is_test(path):
    name = posixpath.basename(path).lower()
    return (any(s in TEST_SEGMENTS for s in _segments(path))
            or name.startswith("test_") or name.endswith("_test.py"))


def _is_doc(path):
    return any(s in DOC_SEGMENTS for s in _segments(path))


def manifests_in(files):
    return sorted(p for p in files if MANIFEST_RE.search(p))


def inventory(files):
    """(figures, scripts, other files, notes) for one repository. Pure."""
    kept = [p for p in files if _kept(p)]
    tests = [p for p in kept if _is_test(p)]
    kept = [p for p in kept if not _is_test(p)]
    decorative = {fs._normalized(s) for s in fs.CHART_DECORATIVE_STEMS}
    figures = sorted(p for p in kept if _ext(p) in FIGURE_EXTENSIONS
                     and fs._normalized(_stem(p)) not in decorative
                     and not fs._normalized(_stem(p)).startswith("logo"))
    scripts = sorted(p for p in kept if _ext(p) in SCRIPT_EXTENSIONS
                     and posixpath.basename(p).lower() not in SKIP_SCRIPTS)
    notes = []
    if tests:
        notes.append("%d test file(s) were left out: tests check the code "
                     "rather than produce results." % len(tests))
    if len(figures) > MAX_FIGURES:
        notes.append("Only the first %d of %d images are listed."
                     % (MAX_FIGURES, len(figures)))
    return figures[:MAX_FIGURES], scripts, kept, notes


def _read_priority(path):
    """Scripts most likely to write a figure are read first."""
    name = path.lower()
    hint = 0 if re.search(r"plot|fig|graph|draw|vis|make|paper|chart|image",
                          name) else 1
    notebook = 0 if name.endswith(".ipynb") else 1
    return (hint, notebook, _is_doc(path), path.count("/"), path)


def plan_repo_reads(files, limit=MAX_SCRIPT_READS):
    """Manifests, then scripts, most promising first. Pure and bounded."""
    _figures, scripts, kept, _notes = inventory(files)
    plan = manifests_in(kept)[:MAX_MANIFEST_READS]
    plan += sorted(scripts, key=_read_priority)[:limit]
    return plan


# ---- reading a script -------------------------------------------------------------------

def script_code(path, text):
    """The code in a script: a notebook's code cells, or the file itself."""
    if _ext(path) != ".ipynb":
        return text or ""
    try:
        cells = json.loads(text or "{}").get("cells") or []
    except Exception:
        # A notebook cut off at the read cap is not valid JSON, but the code
        # before the cut still is: decode its short JSON strings one by one
        # (embedded output images are long, and skipped).
        pieces = []
        for raw in _JSON_STRING_RE.findall(text or ""):
            if len(raw) > 2000:
                continue
            try:
                pieces.append(json.loads('"%s"' % raw))
            except Exception:
                continue
        return "".join(p if p.endswith("\n") else p + "\n" for p in pieces)
    code = []
    for cell in cells:
        if cell.get("cell_type") == "code":
            source = cell.get("source") or ""
            code.append("".join(source) if isinstance(source, list) else source)
    return "\n".join(code)


def _literals(code):
    """[(line_number, [literal, ...])] for every line with a quoted string."""
    # Comments are kept: a commented-out savefig still says which script
    # made the figure.
    out = []
    for number, line in enumerate((code or "").splitlines()):
        found = [m.group(2) for m in _LITERAL_RE.finditer(line)]
        if found:
            out.append((number, found))
    return out


def _save_lines(code):
    lines = (code or "").splitlines()
    marked = set()
    for number, line in enumerate(lines):
        if SAVE_RE.search(line):
            marked.update(range(number, number + SAVE_CONTEXT_LINES + 1))
    return marked


def _clean(value):
    value = value.strip().replace("\\\\", "/").replace("\\", "/")
    while value.startswith("./"):
        value = value[2:]
    return value


def _relative(value):
    """A literal without its leading ./ and ../, for matching as a suffix."""
    return re.sub(r"^(?:\.\.?/)+", "", value)


def _pattern(value):
    """(regex, fixed characters) for a name built with placeholders."""
    parts = _PLACEHOLDER_RE.split(value)
    if len(parts) == 1:
        return None, len(value)
    regex = "".join(re.escape(p) if i % 2 == 0 else r"[^/]*?"
                    for i, p in enumerate(parts))
    fixed = sum(len(p) for p in parts[::2])
    return regex, fixed


def _near(script, paths):
    """Of several equally named files, the ones nearest the script."""
    if len(paths) <= 1:
        return paths
    home = [s for s in posixpath.dirname(script).split("/") if s]
    best, best_score = [], -1
    for path in paths:
        there = [s for s in posixpath.dirname(path).split("/") if s]
        score = 0
        for a, b in zip(home, there):
            if a != b:
                break
            score += 1
        if score > best_score:
            best, best_score = [path], score
        elif score == best_score:
            best.append(path)
    return best


class _Index:
    """Lookups over the repository's files by name, stem and path suffix."""

    def __init__(self, paths):
        self.paths = list(paths)
        self.by_name, self.by_stem = {}, {}
        for path in self.paths:
            self.by_name.setdefault(posixpath.basename(path).lower(), []).append(path)
            self.by_stem.setdefault(_stem(path).lower(), []).append(path)

    def named(self, script, value):
        """Files a literal names: exact path, path suffix, or file name."""
        return self.named_how(script, value)[0]

    def named_how(self, script, value):
        """(files, whether the literal's folder matched too)."""
        value = _clean(value)
        if not value or value.endswith("/"):
            return [], False
        if "/" in value:
            joined = posixpath.normpath(posixpath.join(posixpath.dirname(script), value))
            if joined in self.by_path:
                return [joined], True
            suffix = "/".join(p for p in value.split("/") if p not in ("..", "."))
            hits = [p for p in self.by_name.get(posixpath.basename(value).lower(), [])
                    if p == suffix or p.endswith("/" + suffix)]
            if hits:
                return _near(script, hits), True
        # The folder it writes to is not in the repository (outputs are often
        # moved after they are made): fall back to the file name alone.
        return (_near(script, self.by_name.get(posixpath.basename(value).lower(), [])),
                "/" not in value)

    def matching(self, script, regex, has_dir):
        return self.matching_how(script, regex, has_dir)[0]

    def matching_how(self, script, regex, has_dir):
        """(files a placeholder pattern matches, whether its folder did too).

        A relative folder (../paper/) is matched as a path suffix; when no
        file sits under it, the file-name part alone is tried."""
        if has_dir:
            target = re.compile("(^|/)" + regex + "$", re.IGNORECASE)
            hits = [p for p in self.paths if target.search(p)]
            if hits:
                return _near(script, hits), True
            regex = regex.rsplit("/", 1)[-1]
        target = re.compile("^" + regex + "$", re.IGNORECASE)
        hits = [p for p in self.paths if target.search(posixpath.basename(p))]
        return _near(script, hits), not has_dir

    @property
    def by_path(self):
        if not hasattr(self, "_by_path"):
            self._by_path = set(self.paths)
        return self._by_path


def figures_written(script, code, figures):
    """{figure: (confidence, reason)} for the figures one script writes.

    In order of strength: a literal that IS a figure's file name or path; a
    name built with placeholders (f"band_{i}.png", "fig%02d.pdf") whose
    pattern matches; the bare stem on a line that saves a figure
    (savefig(name + ".png") after name = "bands"). Matching is by file
    name, narrowed by any folder the literal gives and then to the figures
    nearest the script, so one common name never links half the repository.
    """
    found = {}
    save_lines = _save_lines(code)
    saves_anything = bool(save_lines)

    def add(paths, confidence, reason):
        if not paths or len(paths) > MAX_FIGURES_PER_NAME:
            return
        for path in paths:
            current = found.get(path)
            if current is None or (current[0] != HIGH and confidence == HIGH):
                found[path] = (confidence, reason)

    for number, literals in _literals(code):
        on_save = number in save_lines
        # Pieces joined on one save line: "fig_" + str(i) + ".png".
        if on_save and len(literals) > 1:
            joined = _relative("{}".join(_clean(l) for l in literals))
            regex, fixed = _pattern(joined)
            if regex and fixed - 4 >= 3 and re.search(
                    r"\.(png|pdf|svg|jpe?g)$", joined, re.IGNORECASE):
                add(figures.matching(script, regex, "/" in joined), HIGH,
                    "writes %s" % joined.replace("{}", "…"))
        for literal in literals:
            value = _clean(literal)
            if not value or len(value) > 300:
                continue
            ext = _ext(value)
            regex, fixed = _pattern(value)
            if ext in FIGURE_EXTENSIONS:
                if regex is None:
                    paths, same_folder = figures.named_how(script, value)
                    strong = (on_save or saves_anything) and same_folder
                    add(paths, HIGH if strong else MEDIUM,
                        ("writes %s" if on_save else "names %s") % value
                        + ("" if same_folder else " (found in another folder)"))
                elif fixed - len(ext) >= 3:
                    regex, _fixed = _pattern(_relative(value))
                    paths, same_folder = figures.matching_how(
                        script, regex, "/" in _relative(value))
                    add(paths, HIGH if on_save and same_folder else MEDIUM,
                        "writes %s" % re.sub(_PLACEHOLDER_RE, "…", value)
                        + ("" if same_folder else " (found in another folder)"))
            elif on_save and "." not in posixpath.basename(value):
                stem = posixpath.basename(value)
                if regex is None and len(stem) >= 3 and stem.lower() not in GENERIC_STEMS:
                    add(_near(script, figures.by_stem.get(stem.lower(), [])), HIGH,
                        "saves %s" % value)
                elif regex and fixed >= 4:
                    add(figures.matching(script, regex + r"\.[a-z]+", "/" in value),
                        MEDIUM, "saves %s" % re.sub(_PLACEHOLDER_RE, "…", value))
    # A distinctive stem anywhere in a script that saves figures: the name is
    # assigned on one line and saved on another.
    if saves_anything:
        for _number, literals in _literals(code):
            for literal in literals:
                stem = _clean(literal)
                if ("/" in stem or "." in stem or len(stem) < 5
                        or stem.lower() in GENERIC_STEMS
                        or not re.search(r"[\d_\-]", stem)):
                    continue
                for path in _near(script, figures.by_stem.get(stem.lower(), [])):
                    if path not in found:
                        add([path], MEDIUM, "names %s" % stem)
    return found


def data_read(script, code, data):
    """{data file: reason} for the repository files a script names."""
    found = {}
    for _number, literals in _literals(code):
        for literal in literals:
            value = _clean(literal)
            if not value or _ext(value) not in DATA_EXTENSIONS:
                continue
            regex, fixed = _pattern(value)
            if regex is None:
                hits = data.named(script, value)
            elif fixed - len(_ext(value)) >= 3:
                regex, _fixed = _pattern(_relative(value))
                hits = data.matching(script, regex, "/" in _relative(value))
            else:
                continue
            if 0 < len(hits) <= MAX_FIGURES_PER_NAME:
                for path in hits:
                    found.setdefault(path, "reads %s" % value)
    return found


def imports_of(path, code):
    """Top-level module names a script imports."""
    ext, names = _ext(path), set()
    if ext in (".py", ".ipynb"):
        for match in _PY_IMPORT_RE.finditer(code or ""):
            if match.group(1):
                names.add(match.group(1))
            else:
                for part in match.group(2).split(","):
                    part = part.strip().split(" ")[0].split(".")[0]
                    if part:
                        names.add(part)
    elif ext == ".r":
        names.update(m.group(1) for m in _R_IMPORT_RE.finditer(code or ""))
    elif ext == ".jl":
        for match in _JL_IMPORT_RE.finditer(code or ""):
            names.update(p.strip().split(".")[0] for p in match.group(1).split(",") if p.strip())
    return names


# ---- dependency versions --------------------------------------------------------------------

_REQUIREMENT_SPEC_RE = re.compile(
    r"""(?:^|["'\s,\[-])([A-Za-z][A-Za-z0-9_.\-]*)\s*(?:\[[^\]]*\])?\s*"""
    r"""(===|==|>=|<=|~=|!=|>|<|=)\s*([0-9][\w.\-*+]*)""")


def _normal(name):
    return re.sub(r"[-_.]+", "-", (name or "").lower())


def declared_versions(manifests):
    """{normalized package: (name, version or spec, manifest)} from manifests."""
    found = {}
    for path, text in sorted((manifests or {}).items()):
        for line in (text or "").splitlines():
            line = line.split("#", 1)[0]
            for name, op, version in _REQUIREMENT_SPEC_RE.findall(line):
                if name.lower() in ("python", "version", "requires-python"):
                    continue
                key = _normal(name)
                exact = op in ("==", "===", "=")
                spec = version if exact else "%s%s" % (op, version)
                current = found.get(key)
                # A pinned version beats a range.
                if current is None or (exact and not current[3]):
                    found[key] = (name, spec, path, exact)
    return {k: (n, s, p) for k, (n, s, p, _e) in found.items()}


# ---- the analysis -----------------------------------------------------------------------------

def analyze_repo_tree(files, texts, repo=None):
    """Figure-first classification of one repository -- the unit under test.

    1. Every image (png, pdf, svg, jpg) is a figure.
    2. Every script is read for the figure names it writes; a script that
       writes a figure is a Script record linked to it (generates).
    3. The data files those scripts name are Dataset records linked to them
       (consumes).
    4. The packages they import are Tools linked to them (uses_tool),
       versioned from the repository's manifests; the repository itself is
       a Tool too.
    Images no script writes, and scripts that write no figure, are still
    listed, but not selected, so the curator decides about them.
    """
    repo = repo or {}
    texts = texts or {}
    figure_paths, script_paths, kept, notes = inventory(files)
    figures = _Index(figure_paths)
    claimed = set(figure_paths) | set(script_paths)
    data = _Index([p for p in kept if p not in claimed
                   and _ext(p) in DATA_EXTENSIONS and not ev.is_readme(p)])
    local_modules = ({_stem(p) for p in kept if _ext(p) == ".py"}
                     | {p.split("/")[-2] for p in kept
                        if p.endswith("/__init__.py") and "/" in p})

    read = [p for p in script_paths if p in texts]
    unread = len(script_paths) - len(read)
    if unread:
        notes.append("%d of %d scripts were read for figure names; the rest "
                     "are not listed." % (len(read), len(script_paths)))

    writes, reads, imports = {}, {}, {}
    for path in read:
        code = script_code(path, texts[path])
        writes[path] = figures_written(path, code, figures)
        reads[path] = data_read(path, code, data)
        imports[path] = {m for m in imports_of(path, code)
                         if m not in STDLIB and m not in local_modules}

    producers = [p for p in read if writes[p]]
    others = [p for p in read if not writes[p]][:MAX_OTHER_SCRIPTS]
    made = {}
    for path in producers:
        for figure, (confidence, reason) in writes[path].items():
            made.setdefault(figure, []).append((path, confidence, reason))

    charts, datasets, scripts, tools, links = [], [], [], [], []
    ids = {}

    # Figures.
    for path in figure_paths:
        makers = made.get(path, [])
        notebook = next((m for m, _c, _r in makers if m.endswith(".ipynb")), "")
        number = autocurate.suggest_number(path) or ""
        evidence = (["Written by %s (%s)." % (m, r) for m, _c, r in makers]
                    or ["No script in the repository was found to write this "
                        "image, so it is not selected."])
        charts.append(_candidate(
            "chart", len(charts),
            {"imageFile": path, "files": [], "notebookFile": notebook,
             "number": number, "caption": "", "properties": [],
             "extraFields": []},
            evidence, HIGH if makers else LOW, [path],
            needs_input=["caption", "properties"] + ([] if number else ["number"]),
            field_evidence={"imageFile": HIGH, "files": NEEDS_INPUT,
                            "notebookFile": HIGH if notebook else NEEDS_INPUT,
                            "number": LOW if number else NEEDS_INPUT,
                            "caption": NEEDS_INPUT, "properties": NEEDS_INPUT},
            label=path, file_count=1,
            ai_sources=[]))
        # Made by a script, or an image outside the documentation: selected.
        charts[-1]["selected"] = bool(makers) or not _is_doc(path)
        ids[("chart", path)] = charts[-1]["id"]

    # Scripts.
    for path in producers + others:
        code = script_code(path, texts[path])
        header = _script_header(path, code) if _ext(path) != ".ipynb" else ""
        made_here = sorted(writes.get(path, {}))
        sources = ev.build_sources("script", path, [path], texts)
        evidence = ([("Writes %s." % ", ".join(made_here[:6])
                      + (" and %d more" % (len(made_here) - 6)
                         if len(made_here) > 6 else ""))] if made_here
                    else ["Writes no figure in the repository, so it is not "
                          "selected."])
        if header:
            evidence.append("Header: %s" % header)
        scripts.append(_candidate(
            "script", len(scripts),
            {"files": [path], "readme": "", "URLs": [], "extraFields": []},
            evidence, HIGH if made_here else LOW, [path],
            needs_input=["readme"],
            field_evidence={"files": HIGH, "readme": NEEDS_INPUT,
                            "URLs": NEEDS_INPUT},
            label=path, file_count=1, ai_sources=sources))
        scripts[-1]["selected"] = bool(made_here)
        ids[("script", path)] = scripts[-1]["id"]

    for figure, makers in made.items():
        for script, confidence, reason in makers:
            links.append({"from": ids[("script", script)],
                          "to": ids[("chart", figure)], "type": GENERATES,
                          "reason": "%s %s." % (posixpath.basename(script), reason),
                          "confidence": confidence})

    # Datasets: what the figure scripts read, then (unselected) what the
    # other listed scripts read.
    used = {}
    for path in producers + others:
        for data_path, reason in reads.get(path, {}).items():
            used.setdefault(data_path, []).append((path, reason))
    ordered = sorted(used, key=lambda d: (not any(s in producers for s, _r in used[d]), d))
    for data_path in ordered[:MAX_DATASETS]:
        users = used[data_path]
        selected = any(s in producers for s, _r in users)
        datasets.append(_candidate(
            "dataset", len(datasets),
            {"files": [data_path], "readme": "", "URLs": [], "extraFields": []},
            ["Read by %s (%s)." % (s, r) for s, r in users[:4]],
            HIGH if selected else LOW, [data_path], needs_input=["readme"],
            field_evidence={"files": HIGH, "readme": NEEDS_INPUT,
                            "URLs": NEEDS_INPUT},
            label=data_path, file_count=1, ai_sources=[]))
        datasets[-1]["selected"] = selected
        for script, reason in users:
            links.append({"from": datasets[-1]["id"],
                          "to": ids[("script", script)], "type": CONSUMES,
                          "reason": "%s %s." % (posixpath.basename(script), reason),
                          "confidence": HIGH})
    if len(used) > MAX_DATASETS:
        notes.append("Only the first %d of %d data files are listed."
                     % (MAX_DATASETS, len(used)))

    # Tools: the repository, then what the listed scripts import.
    name = (repo.get("name") or "").strip()
    if name:
        version = (repo.get("version") or "").strip()
        tools.append(_candidate(
            "tool", 0,
            {"kind": "software", "packageName": name, "version": version,
             "executableName": "", "patches": [], "description": "",
             "urls": repo.get("url") or "", "extraFields": []},
            ["The code in this repository."]
            + (["Version %s is its latest release or tag." % version] if version
               else ["The repository has no release or tag, so the version "
                     "is left for you to fill in (e.g. the commit)."]),
            HIGH, [repo.get("url") or name],
            needs_input=["description"] + ([] if version else ["version"]),
            field_evidence={"packageName": HIGH,
                            "version": HIGH if version else NEEDS_INPUT,
                            "executableName": NEEDS_INPUT,
                            "description": NEEDS_INPUT, "urls": HIGH,
                            "patches": NEEDS_INPUT},
            label="%s %s" % (name, version) if version else name))
        tools[-1]["selected"] = True
        for script in producers:
            links.append({"from": tools[0]["id"], "to": ids[("script", script)],
                          "type": USES_TOOL,
                          "reason": "%s is part of the %s repository."
                                    % (posixpath.basename(script), name),
                          "confidence": MEDIUM})

    declared = declared_versions({p: texts[p] for p in manifests_in(kept)
                                  if p in texts})
    users_of = {}
    for path in producers + others:
        for module in imports.get(path, ()):
            users_of.setdefault(module, []).append(path)
    ranked = sorted(users_of, key=lambda m: (
        not any(s in producers for s in users_of[m]), -len(users_of[m]), m.lower()))
    tool_for = {}
    for module in ranked:
        package = IMPORT_PACKAGES.get(module, module)
        if name and _normal(package) == _normal(name):
            continue
        # Several import names, one package (matplotlib, mpl_toolkits, pylab).
        if _normal(package) in tool_for:
            tool = tool_for[_normal(package)]
            for script in users_of[module]:
                if not any(l["from"] == tool["id"] and l["to"] == ids[("script", script)]
                           for l in links):
                    links.append({"from": tool["id"], "to": ids[("script", script)],
                                  "type": USES_TOOL,
                                  "reason": "%s imports %s."
                                            % (posixpath.basename(script), module),
                                  "confidence": HIGH})
                if script in producers:
                    tool["selected"] = True
            continue
        if len(tools) >= MAX_TOOLS:
            notes.append("Only the first %d tools are listed." % MAX_TOOLS)
            break
        entry = declared.get(_normal(package)) or declared.get(_normal(module))
        version = entry[1] if entry else ""
        users = users_of[module]
        selected = any(s in producers for s in users)
        tools.append(_candidate(
            "tool", len(tools),
            {"kind": "software", "packageName": entry[0] if entry else package,
             "version": version, "executableName": "", "patches": [],
             "description": "", "urls": "", "extraFields": []},
            ["Imported by %s." % ", ".join(users[:4])
             + (" and %d more" % (len(users) - 4) if len(users) > 4 else "")]
            + (["Version %s from %s." % (version, entry[2])] if entry
               else ["No version is declared in the repository; fill it in."]),
            MEDIUM if selected else LOW, users[:MAX_CANDIDATE_PATHS],
            needs_input=["description"] + ([] if version else ["version"]),
            field_evidence={"packageName": MEDIUM,
                            "version": HIGH if entry else NEEDS_INPUT,
                            "executableName": NEEDS_INPUT,
                            "description": NEEDS_INPUT, "urls": NEEDS_INPUT,
                            "patches": NEEDS_INPUT},
            label=("%s %s" % (entry[0] if entry else package, version)).strip()))
        tools[-1]["selected"] = selected
        tool_for[_normal(package)] = tools[-1]
        for script in users:
            links.append({"from": tools[-1]["id"], "to": ids[("script", script)],
                          "type": USES_TOOL,
                          "reason": "%s imports %s."
                                    % (posixpath.basename(script), module),
                          "confidence": HIGH})

    groups = {"charts": charts, "datasets": datasets, "scripts": scripts,
              "tools": tools}
    for kind in groups:
        groups[kind] = [c for c in groups[kind] if _usable(c)]
    numbers = {c["id"]: c["proposal"]["number"] for c in charts
               if c["proposal"]["number"]}
    if figure_paths and not producers:
        notes.append("No script was found that writes one of the repository's "
                     "images; the images are listed so you can link them by "
                     "hand.")
    return groups, {"numbers": numbers, "links": links}, notes


# ---- the repository host ------------------------------------------------------------

class RepoError(Exception):
    """A user-facing reason the repository could not be analyzed."""

    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


_SEGMENT_RE = re.compile(r"^[A-Za-z0-9_.-]+$")
_HEADERS = {"User-Agent": "Qresp/2.0 (curation repository analysis)"}


def parse_repo_url(raw):
    """(host, path) for a GitHub or GitLab repository link, or RepoError.

    Accepts the usual ways of writing one: https URL with or without a
    trailing /tree/..., a `git@host:path.git` remote, or a bare host/path.
    """
    value = str(raw or "").strip()
    if not value:
        raise RepoError("Enter the repository link first.")
    ssh = re.match(r"^git@([^:]+):(.+)$", value)
    if ssh:
        value = "https://%s/%s" % ssh.groups()
    if "://" not in value:
        value = "https://" + value
    parsed = urlparse(value)
    host = (parsed.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    if parsed.username or parsed.password or parsed.port:
        raise RepoError("That link does not look like a repository.")
    segments = [s for s in parsed.path.split("/") if s]
    if host == "github.com":
        segments = segments[:2]
    elif host == "gitlab.com":
        if "-" in segments:
            segments = segments[:segments.index("-")]
    else:
        raise RepoError("Only GitHub and GitLab repositories can be read. For "
                        "code elsewhere, choose \"RCC file server\" and point "
                        "Qresp at its folder.")
    if segments and segments[-1].endswith(".git"):
        segments[-1] = segments[-1][:-4]
    if len(segments) < 2 or not all(
            _SEGMENT_RE.match(s) and s not in (".", "..") for s in segments):
        raise RepoError("That link does not look like a repository.")
    return host, "/".join(segments)


def _get(url, headers=None, params=None):
    response = requests.get(url, headers=dict(_HEADERS, **(headers or {})),
                            params=params, timeout=REQUEST_TIMEOUT)
    if response.status_code == 404:
        raise RepoError("No public repository was found at that link.", 404)
    if response.status_code in (403, 429):
        raise RepoError("The repository host is limiting requests from this "
                        "server. Try again in a while; an administrator can "
                        "raise the limit with QRESP_GITHUB_TOKEN.", 503)
    response.raise_for_status()
    return response


def _github_headers():
    token = os.environ.get("QRESP_GITHUB_TOKEN", "").strip()
    headers = {"Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    return headers


def fetch_github(path):
    api = "https://api.github.com/repos/" + path
    headers = _github_headers()
    info = _get(api, headers).json()
    branch = info.get("default_branch") or "main"
    sha = _get("%s/commits/%s" % (api, quote(branch, safe="")),
               dict(headers, Accept="application/vnd.github.sha")).text.strip()
    if not re.match(r"^[0-9a-f]{40}$", sha):
        raise RepoError("The repository's latest commit could not be read.",
                        502)
    tree = _get("%s/git/trees/%s" % (api, sha), headers,
                params={"recursive": "1"}).json()
    files = [entry["path"] for entry in tree.get("tree") or []
             if entry.get("type") == "blob"]
    version = ""
    try:
        version = (_get(api + "/releases/latest", headers).json()
                   .get("tag_name") or "")
    except RepoError:
        pass
    if not version:
        # Many scientific codes tag versions without publishing a release.
        try:
            tags = _get(api + "/tags", headers, params={"per_page": 1}).json()
            version = (tags[0].get("name") or "") if tags else ""
        except RepoError:
            pass  # Neither: the version is left for the curator.
    return {
        "host": "github",
        "path": path,
        "name": info.get("name") or path.split("/")[-1],
        "url": info.get("html_url") or "https://github.com/" + path,
        "branch": branch,
        "commit": sha,
        "version": version,
        "files": files[:MAX_TREE_FILES],
        "truncated": bool(tree.get("truncated")) or len(files) > MAX_TREE_FILES,
        "files_base": "https://github.com/%s/blob/%s" % (path, sha),
        "raw_base": "https://raw.githubusercontent.com/%s/%s" % (path, sha),
    }


def fetch_gitlab(path):
    api = "https://gitlab.com/api/v4/projects/" + quote(path, safe="")
    info = _get(api).json()
    branch = info.get("default_branch") or "main"
    sha = (_get("%s/repository/commits/%s" % (api, quote(branch, safe="")))
           .json().get("id") or "")
    if not re.match(r"^[0-9a-f]{40}$", sha):
        raise RepoError("The repository's latest commit could not be read.",
                        502)
    files, page, truncated = [], 1, False
    while page:
        if page > MAX_GITLAB_PAGES or len(files) >= MAX_TREE_FILES:
            truncated = True
            break
        response = _get(api + "/repository/tree", params={
            "recursive": "true", "per_page": 100, "ref": sha, "page": page})
        files += [entry["path"] for entry in response.json()
                  if entry.get("type") == "blob"]
        page = int(response.headers.get("X-Next-Page") or 0)
    version = ""
    try:
        releases = _get(api + "/releases", params={"per_page": 1}).json()
        version = (releases[0].get("tag_name") or "") if releases else ""
        if not version:
            tags = _get(api + "/repository/tags",
                        params={"per_page": 1}).json()
            version = (tags[0].get("name") or "") if tags else ""
    except RepoError:
        pass
    return {
        "host": "gitlab",
        "path": path,
        "name": info.get("name") or path.split("/")[-1],
        "url": info.get("web_url") or "https://gitlab.com/" + path,
        "branch": branch,
        "commit": sha,
        "version": version,
        "files": files[:MAX_TREE_FILES],
        "truncated": truncated,
        "files_base": "https://gitlab.com/%s/-/blob/%s" % (path, sha),
        "raw_base": "https://gitlab.com/%s/-/raw/%s" % (path, sha),
    }


FETCHERS = {"github.com": fetch_github, "gitlab.com": fetch_gitlab}


# Notebooks carry their output images inline, so their code needs more room.
MAX_NOTEBOOK_BYTES = 3000000


def _read_text(url):
    response = requests.get(url, headers=_HEADERS, timeout=REQUEST_TIMEOUT,
                            stream=True)
    response.raise_for_status()
    limit = MAX_NOTEBOOK_BYTES if url.lower().endswith(".ipynb") else MAX_TEXT_BYTES
    content = response.raw.read(limit, decode_content=True) or b""
    return content.decode("utf-8", errors="replace")


def analyze_repo_url(raw, fetchers=None, read_text=None):
    """Fetch, read and classify one repository. Network calls are injectable
    so the whole flow is testable offline."""
    host, path = parse_repo_url(raw)
    repo = (fetchers or FETCHERS)[host](path)
    read_text = read_text or _read_text
    if not repo["files"]:
        raise RepoError("The repository has no files.", 404)

    # Read in parallel: a repository's scripts are where its figure names
    # are, and hundreds of small raw-file reads one at a time would be slow.
    wanted = plan_repo_reads(repo["files"])
    urls = {p: "%s/%s" % (repo["raw_base"], quote(p)) for p in wanted}

    def fetch(path):
        try:
            return path, read_text(urls[path])
        except Exception:
            # One unreadable file skips its own evidence and nothing else.
            return path, None

    with ThreadPoolExecutor(max_workers=READ_WORKERS) as pool:
        results = list(pool.map(fetch, wanted))
    texts = {p: t for p, t in results if t is not None}
    notes = []
    skipped = len(wanted) - len(texts)
    if skipped:
        print("Repository reads skipped: %d" % skipped)
    if repo["truncated"]:
        notes.append("The repository is large; only the first %d files were "
                     "looked at." % len(repo["files"]))

    groups, suggestions, more_notes = analyze_repo_tree(
        repo["files"], texts, repo)
    notes += more_notes
    counts = {key: len(value) for key, value in groups.items()}
    print("Repository analysis: host=%s files=%d read=%d candidates=%s"
          % (repo["host"], len(repo["files"]), len(texts), counts))
    return {
        # Every record path is relative to this, exactly as a paper's are to
        # its file-server folder: the curator's form stores it as the
        # record's file server path, so each file links to this commit.
        "root": repo["files_base"],
        "repo": {key: repo[key] for key in (
            "host", "path", "name", "url", "branch", "commit", "version",
            "files_base")},
        "counts": dict(counts, files=len(repo["files"])),
        "truncated": repo["truncated"],
        "warnings": notes,
        "candidates": groups,
        "suggestions": suggestions,
    }


@csrf_protect
def analyze_repo(body):
    """
    Inventory and classify a GitHub or GitLab repository
    Handler for POST: /api/curation/analyze-repo

    Read-only: nothing is stored, published, or logged beyond counts.
    """
    if not get_current_user():
        return {"error": "authentication required"}, 401
    try:
        return analyze_repo_url((body or {}).get("url")), 200
    except RepoError as e:
        return {"error": str(e)}, e.status
    except requests.exceptions.RequestException as e:
        print("Repository analysis failed: %s" % type(e).__name__)
        return {"error": "The repository could not be read. Check the link "
                         "and try again."}, 502
