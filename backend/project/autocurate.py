"""Suggestions that let the Curator's guided setup pre-fill a record.

Pure functions over a folder analysis (no network, no state). Everything here
is a SUGGESTION shown to the curator before anything is added:

- a figure number read off an image's file name ("SI_Figure3.pdf" -> "S3");
- links between the analysis candidates, each with the reason it was made:
  * dataset -> figure when the dataset folder is named after the figure
    ("Data/Figure_2_data" and "Figures_Tables/Figure2.pdf");
  * dataset -> script when the script's source names a file inside that
    dataset ("np.loadtxt('./singlet_ccd_qeff')");
  * script -> figure when the script names the figure's image or the
    script's own folder is named after the figure, or (medium confidence)
    when the script reads data that feeds that figure.
"""
import posixpath
import re

HIGH = "high"
MEDIUM = "medium"

CONSUMES = "consumes"
GENERATES = "generates"

# "Figure2", "fig_2b", "SI_Figure3", "FigureS3", "Table_2_data", "figure-S1".
# The look-behind keeps "config2" from being read as "fig 2".
_LABEL_RE = re.compile(
    r"(?<![a-z0-9])"
    r"(?P<si>si|supp|supplementary|extended)?[ _.-]*"
    r"(?P<kind>figure|fig|table|tab)[ _.-]*"
    r"(?P<s>s)?[ _.-]*"
    r"(?P<num>\d{1,3})"
    r"(?P<panel>[a-h](?![a-z]))?"
    r"(?![0-9])",
    re.IGNORECASE,
)

# String literals in source code; long enough to be a file name.
_LITERAL_RE = re.compile(r"""['"]([^'"\n\r]{3,240})['"]""")

# Names too generic to tie a script to one dataset.
_GENERIC_NAMES = frozenset((
    "data", "input", "output", "results", "result", "out", "in", "tmp",
    "temp", "test", "config", "readme", "readme.md", "main", "run",
))


def figure_label(path):
    """(kind, supplementary, number, panel) for a figure-ish name, or None."""
    stem = posixpath.splitext(posixpath.basename(str(path or "").rstrip("/")))[0]
    match = _LABEL_RE.search(stem.lower())
    if not match:
        return None
    kind = "table" if match.group("kind").startswith("tab") else "figure"
    supplementary = bool(match.group("si") or match.group("s"))
    return kind, supplementary, str(int(match.group("num"))), match.group("panel") or ""


def _match_key(label):
    """Matching ignores the panel: Figure_2_data feeds Figure2a and Figure2b."""
    kind, supplementary, number, _panel = label
    return "%s:%s%s" % (kind, "S" if supplementary else "", number)


def suggest_number(path):
    """The display number for a figure image, or "" when the name has none."""
    label = figure_label(path)
    if not label:
        return ""
    kind, supplementary, number, panel = label
    value = "%s%s%s" % ("S" if supplementary else "", number, panel)
    return "Table %s" % value if kind == "table" else value


def _boundary(candidate):
    files = (candidate.get("proposal") or {}).get("files") or []
    return str(files[0]).rstrip("/") if files else ""


def _members(boundary, files):
    if not boundary:
        return []
    prefix = boundary + "/"
    return [path for path in files if path == boundary or path.startswith(prefix)]


def _literal_names(text):
    """Basenames of every file-like string literal in a source file."""
    names = set()
    for literal in _LITERAL_RE.findall(text or ""):
        value = literal.strip().rstrip("/")
        if not value or " " in value or "\\n" in value:
            continue
        base = posixpath.basename(value)
        if len(base) >= 4 and re.search(r"[A-Za-z]", base) and \
                base.lower() not in _GENERIC_NAMES:
            names.add(base)
    return names


def suggestions(result, files, texts):
    """{"numbers": {chart_id: "2"}, "links": [...]} for one analysis."""
    charts = result.get("charts") or []
    datasets = result.get("datasets") or []
    scripts = result.get("scripts") or []
    files = list(files or [])
    texts = texts or {}

    numbers = {}
    charts_by_key = {}
    charts_by_name = {}
    for chart in charts:
        image = (chart.get("proposal") or {}).get("imageFile") or ""
        number = suggest_number(image)
        if number:
            numbers[chart["id"]] = number
        label = figure_label(image)
        if label:
            charts_by_key.setdefault(_match_key(label), []).append(chart)
        base = posixpath.basename(image)
        if base:
            charts_by_name.setdefault(base.lower(), []).append(chart)
            charts_by_name.setdefault(
                posixpath.splitext(base)[0].lower(), []).append(chart)

    links = {}

    def add(source, target, kind, reason, confidence):
        key = (source["id"], target["id"], kind)
        existing = links.get(key)
        if existing and existing["confidence"] == HIGH:
            return
        links[key] = {"from": source["id"], "to": target["id"], "type": kind,
                      "reason": reason, "confidence": confidence}

    def charts_for(path):
        label = figure_label(path)
        return charts_by_key.get(_match_key(label), []) if label else []

    # dataset -> figure, by name; and an index of which dataset owns a file.
    owner = {}
    data_to_charts = {}
    for dataset in datasets:
        boundary = _boundary(dataset)
        name = posixpath.basename(boundary)
        for chart in charts_for(boundary):
            add(dataset, chart, CONSUMES,
                "The data folder %s is named after %s." % (
                    name, posixpath.basename(chart["proposal"]["imageFile"])),
                HIGH)
            data_to_charts.setdefault(dataset["id"], []).append(chart)
        for path in _members(boundary, files):
            owner.setdefault(posixpath.basename(path), set()).add(dataset["id"])
        if name:
            owner.setdefault(name, set()).add(dataset["id"])
    datasets_by_id = {dataset["id"]: dataset for dataset in datasets}

    for script in scripts:
        boundary = _boundary(script)
        sname = posixpath.basename(boundary)

        for chart in charts_for(boundary):
            add(script, chart, GENERATES,
                "The script %s is named after %s." % (
                    sname, posixpath.basename(chart["proposal"]["imageFile"])),
                HIGH)

        names = set()
        for path in _members(boundary, files):
            if path in texts:
                names |= _literal_names(texts[path])

        read = set()
        for name in sorted(names):
            for chart in charts_by_name.get(name.lower(), []):
                add(script, chart, GENERATES,
                    "%s writes %s." % (sname, name), HIGH)
            for chart in charts_for(name):
                add(script, chart, GENERATES,
                    "%s refers to %s." % (sname, name), HIGH)
            owners = owner.get(name) or set()
            # A file name found in several datasets says nothing about which
            # one the script reads.
            if len(owners) == 1:
                dataset_id = next(iter(owners))
                dataset = datasets_by_id[dataset_id]
                add(dataset, script, CONSUMES,
                    "%s reads %s, which is in %s." % (
                        sname, name, posixpath.basename(_boundary(dataset))),
                    HIGH)
                read.add(dataset_id)

        for dataset_id in sorted(read):
            for chart in data_to_charts.get(dataset_id, []):
                add(script, chart, GENERATES,
                    "%s reads the data behind %s." % (
                        sname, posixpath.basename(chart["proposal"]["imageFile"])),
                    MEDIUM)

    return {"numbers": numbers, "links": list(links.values())}
