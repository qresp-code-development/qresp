"""Figure captions from a paper's LaTeX source.

POST /api/curation/latex-captions reads LaTeX the curator provides (an
uploaded .tex / .zip / .tar.gz, or an arXiv identifier whose source is
fetched from arxiv.org) and returns every figure and table environment with
its \\includegraphics files, \\caption text and LaTeX number. Given the record's
figures, it also says which caption belongs to which figure: by image file
name first, by figure number second.

Read-only and in memory: archives are never extracted to disk, nothing is
stored, and no model is involved -- the caption is the paper's own text.
"""
import base64
import gzip
import io
import posixpath
import re
import tarfile
import unicodedata
import zipfile
from xml.etree import ElementTree

import requests

from project.auth import csrf_protect, get_current_user

MAX_UPLOAD_BYTES = 10 * 1024 * 1024        # what the browser may send
MAX_ARXIV_BYTES = 40 * 1024 * 1024         # what arxiv.org may send
MAX_TOTAL_TEXT = 20 * 1024 * 1024          # uncompressed .tex read in total
MAX_TEX_FILE = 4 * 1024 * 1024
MAX_MEMBERS = 5000
MAX_INPUT_DEPTH = 8
ARXIV_TIMEOUT = 30
ARXIV_HEADERS = {"User-Agent": "Qresp/2.0 (research data curation)"}

TEX_EXTENSIONS = (".tex", ".ltx")


class LatexError(Exception):
    """User-facing failure; the message is safe to return."""


# ---- reading sources ------------------------------------------------------------

def _decode(raw):
    for encoding in ("utf-8", "latin-1"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", "replace")


class _Budget:
    def __init__(self):
        self.total = 0

    def take(self, size):
        if size > MAX_TEX_FILE:
            return False
        if self.total + size > MAX_TOTAL_TEXT:
            raise LatexError("The LaTeX source is too large to read.")
        self.total += size
        return True


def _from_zip(data):
    texts, budget = {}, _Budget()
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        members = archive.infolist()
        if len(members) > MAX_MEMBERS:
            raise LatexError("That archive has too many files.")
        for info in members:
            name = info.filename
            if info.is_dir() or not name.lower().endswith(TEX_EXTENSIONS):
                continue
            if budget.take(info.file_size):
                texts[_clean_path(name)] = _decode(archive.read(info))
    return texts


def _from_tar(data):
    texts, budget = {}, _Budget()
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:*") as archive:
        count = 0
        for info in archive:
            count += 1
            if count > MAX_MEMBERS:
                raise LatexError("That archive has too many files.")
            if not info.isfile() or not info.name.lower().endswith(TEX_EXTENSIONS):
                continue
            if budget.take(info.size):
                handle = archive.extractfile(info)
                if handle is not None:
                    texts[_clean_path(info.name)] = _decode(handle.read(MAX_TEX_FILE))
    return texts


def _clean_path(name):
    path = posixpath.normpath("/" + str(name).replace("\\", "/")).lstrip("/")
    return path


def read_source(filename, data):
    """{path: text} for every .tex file in an upload or an arXiv e-print."""
    name = (filename or "").lower()
    if not data:
        raise LatexError("The file is empty.")
    if data[:2] == b"PK":
        return _from_zip(data)
    if data[:2] == b"\x1f\x8b" or name.endswith((".tar.gz", ".tgz", ".tar")):
        try:
            return _from_tar(data)
        except tarfile.TarError:
            pass
        try:
            # arXiv serves a single-file submission as a gzipped .tex.
            raw = gzip.GzipFile(fileobj=io.BytesIO(data)).read(MAX_TEX_FILE + 1)
        except (OSError, EOFError):
            raise LatexError("That archive could not be opened.")
        if len(raw) > MAX_TEX_FILE:
            raise LatexError("The LaTeX source is too large to read.")
        return {"main.tex": _decode(raw)}
    if name.endswith((".pdf", ".docx", ".doc")):
        raise LatexError("That is not LaTeX source. Upload the .tex file or a "
                         ".zip of the project instead.")
    if len(data) > MAX_TEX_FILE:
        raise LatexError("That .tex file is too large to read.")
    text = _decode(data)
    if "\\" not in text:
        raise LatexError("That file does not look like LaTeX.")
    return {posixpath.basename(filename or "main.tex") or "main.tex": text}


# ---- arXiv ----------------------------------------------------------------------

_ARXIV_ID_RE = re.compile(
    r"(?:arxiv\.org/(?:abs|pdf|e-print|src)/|arxiv:\s*)?"
    r"(?P<id>\d{4}\.\d{4,5}(?:v\d+)?|[a-z\-]+(?:\.[A-Z]{2})?/\d{7}(?:v\d+)?)",
    re.IGNORECASE,
)


def arxiv_id(raw):
    """The arXiv identifier in an id, "arXiv:…" label or arxiv.org URL."""
    value = str(raw or "").strip()
    if not value:
        return None
    if "://" in value and "arxiv.org" not in value.lower():
        return None
    match = _ARXIV_ID_RE.search(value)
    if not match:
        return None
    ident = match.group("id")
    return re.sub(r"\.pdf$", "", ident, flags=re.IGNORECASE)


def fetch_arxiv(ident):
    url = "https://arxiv.org/e-print/" + ident
    try:
        response = requests.get(url, headers=ARXIV_HEADERS, timeout=ARXIV_TIMEOUT,
                                stream=True)
    except requests.RequestException:
        raise LatexError("arXiv could not be reached. Try again, or upload the "
                         "source instead.")
    if response.status_code == 404:
        raise LatexError("arXiv has no paper with that identifier.")
    if response.status_code != 200:
        raise LatexError("arXiv did not return the source (HTTP %d)."
                         % response.status_code)
    if "pdf" in (response.headers.get("Content-Type") or "").lower():
        raise LatexError("This arXiv paper was submitted as a PDF only, so it "
                         "has no LaTeX source.")
    chunks, size = [], 0
    for chunk in response.iter_content(64 * 1024):
        size += len(chunk)
        if size > MAX_ARXIV_BYTES:
            raise LatexError("That arXiv source is too large to read.")
        chunks.append(chunk)
    return b"".join(chunks)


# ---- finding a paper on arXiv ----------------------------------------------------

ARXIV_API = "https://export.arxiv.org/api/query"
_ATOM = "{http://www.w3.org/2005/Atom}"


def normalize_title(title):
    """Case, accents, punctuation and LaTeX-ish noise removed, for exact
    comparison ("An NV− center" == "An NV- center")."""
    text = unicodedata.normalize("NFKD", str(title or ""))
    text = re.sub(r"\\[A-Za-z]+|[$^_{}]", " ", text)
    return re.sub(r"[^a-z0-9]+", "", text.lower())


_STOP_WORDS = frozenset((
    "with", "from", "that", "this", "into", "their", "there", "these", "those",
    "using", "based", "over", "under", "between", "within", "through", "about",
    "than", "then", "when", "where", "which", "while", "have", "been", "were",
))


def search_arxiv(title):
    """The arXiv id whose title equals this one, or None. Never a near miss."""
    wanted = normalize_title(title)
    if len(wanted) < 12:
        return None
    # Distinctive words only: arXiv's search drops stop words, and an AND on
    # one of them matches nothing.
    words = [w for w in re.findall(r"[A-Za-z0-9]{4,}", str(title))
             if w.lower() not in _STOP_WORDS][:8]
    if not words:
        return None
    query = " AND ".join("ti:%s" % word for word in words)
    response = requests.get(ARXIV_API, params={"search_query": query, "max_results": 10},
                            headers=ARXIV_HEADERS, timeout=ARXIV_TIMEOUT)
    response.raise_for_status()
    feed = ElementTree.fromstring(response.content)
    for entry in feed.findall(_ATOM + "entry"):
        found = (entry.findtext(_ATOM + "title") or "")
        if normalize_title(found) == wanted:
            ident = arxiv_id(entry.findtext(_ATOM + "id") or "")
            if ident:
                return re.sub(r"v\d+$", "", ident)
    return None


@csrf_protect
def find_arxiv(body):
    """
    The arXiv preprint of a paper, matched on its exact title
    Handler for POST: /api/curation/find-arxiv
    """
    if not get_current_user():
        return {"error": "authentication required"}, 401
    title = str((body or {}).get("title") or "").strip()[:500]
    if not title:
        return {"error": "A title is required."}, 400
    try:
        ident = search_arxiv(title)
    except Exception as e:
        print("arXiv search failed (%s)" % type(e).__name__)
        return {"found": False, "error": "arXiv could not be searched."}, 200
    return ({"found": True, "arxiv": ident, "url": "https://arxiv.org/abs/" + ident}
            if ident else {"found": False}), 200


# ---- an arXiv paper's citation record ---------------------------------------------
#
# Every arXiv paper has the DOI 10.48550/arXiv.<id>, registered with DataCite.
# The browser looks it up through doi.org itself; this is the fallback for when
# that fails -- DataCite has not registered a new preprint yet, or the
# browser's request does not get through. It answers in CSL-JSON, the shape
# the browser already reads, from DataCite or else from arXiv's own API.

CSL_ACCEPT = "application/vnd.citationstyles.csl+json"
RECORD_TIMEOUT = 15


def _datacite_record(ident):
    response = requests.get("https://doi.org/10.48550/arXiv." + ident,
                            headers=dict(ARXIV_HEADERS, Accept=CSL_ACCEPT),
                            timeout=RECORD_TIMEOUT)
    if response.status_code != 200:
        return None
    try:
        record = response.json()
    except ValueError:
        return None
    return record if isinstance(record, dict) and record.get("title") else None


def _person(name):
    parts = re.sub(r"\s+", " ", str(name or "")).strip().rsplit(" ", 1)
    return {"given": parts[0], "family": parts[1]} if len(parts) == 2 else {"given": "", "family": parts[0]}


def _arxiv_api_record(ident):
    response = requests.get(ARXIV_API, params={"id_list": ident, "max_results": 1},
                            headers=ARXIV_HEADERS, timeout=RECORD_TIMEOUT)
    response.raise_for_status()
    feed = ElementTree.fromstring(response.content)
    entry = feed.find(_ATOM + "entry")
    if entry is None:
        return None
    title = re.sub(r"\s+", " ", entry.findtext(_ATOM + "title") or "").strip()
    # An unknown id comes back as an entry titled "Error".
    if not title or title.lower() == "error":
        return None
    year = (entry.findtext(_ATOM + "published") or "")[:4]
    return {
        "type": "article",
        "title": title,
        "author": [_person(a.findtext(_ATOM + "name"))
                   for a in entry.findall(_ATOM + "author")],
        "issued": {"date-parts": [[int(year)]]} if year.isdigit() else {},
        "abstract": re.sub(r"\s+", " ", entry.findtext(_ATOM + "summary") or "").strip(),
        "DOI": "10.48550/arXiv." + ident,
        "URL": "https://arxiv.org/abs/" + ident,
        "publisher": "arXiv",
    }


def arxiv_record(id):
    """
    An arXiv paper's citation record (CSL-JSON)
    Handler for GET: /api/curation/arxiv-record
    """
    ident = arxiv_id(id)
    if not ident:
        return {"error": "That is not an arXiv identifier or arxiv.org link."}, 400
    ident = re.sub(r"v\d+$", "", ident)
    for source, lookup in (("datacite", _datacite_record), ("arxiv", _arxiv_api_record)):
        try:
            record = lookup(ident)
        except Exception as e:
            print("arXiv record: %s lookup failed (%s)" % (source, type(e).__name__))
            continue
        if record:
            return {"record": record, "source": source}, 200
    return {"error": "No arXiv paper was found with that identifier."}, 404


# ---- parsing --------------------------------------------------------------------

def strip_comments(text):
    """Drop unescaped % comments, keeping line structure."""
    return re.sub(r"(?<!\\)%[^\n]*", "", text)


def _braced(text, start):
    """(content, end) for the {...} group opening at text[start]."""
    if start >= len(text) or text[start] != "{":
        return None, start
    depth, i = 0, start
    while i < len(text):
        ch = text[i]
        if ch == "\\":
            i += 2
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start + 1:i], i + 1
        i += 1
    return None, start


def _skip_optional(text, i):
    while i < len(text) and text[i] in " \t\n":
        i += 1
    if i < len(text) and text[i] == "[":
        depth = 0
        while i < len(text):
            if text[i] == "[":
                depth += 1
            elif text[i] == "]":
                depth -= 1
                if depth == 0:
                    i += 1
                    break
            i += 1
    while i < len(text) and text[i] in " \t\n":
        i += 1
    return i


def _command_args(text, command):
    """Every {argument} of \\command[opt]{argument} in text, in order."""
    out = []
    for match in re.finditer(r"\\%s\*?(?![A-Za-z])" % re.escape(command), text):
        i = _skip_optional(text, match.end())
        content, _end = _braced(text, i)
        if content is not None:
            out.append(content)
    return out


def _main_file(texts):
    candidates = [p for p, t in texts.items() if "\\documentclass" in t]
    if not candidates:
        return sorted(texts)[0] if texts else None
    with_doc = [p for p in candidates if "\\begin{document}" in texts[p]]
    pool = with_doc or candidates

    def rank(path):
        stem = posixpath.splitext(posixpath.basename(path).lower())[0]
        return (bool(_SUPPLEMENT_NAME_RE.search(stem)), path.count("/"),
                stem not in ("main", "ms", "paper", "manuscript", "article"),
                -len(texts[path]))

    return sorted(pool, key=rank)[0]


def _resolve(texts, base_dir, name):
    name = name.strip()
    for candidate in (name, name + ".tex"):
        for path in (posixpath.normpath(posixpath.join(base_dir, candidate)),
                     posixpath.normpath(candidate)):
            if path in texts:
                return path
    return None


def flatten(texts, path, depth=0, seen=None):
    """The document as one string, with \\input/\\include inlined in place."""
    seen = seen if seen is not None else set()
    if path is None or path in seen or depth > MAX_INPUT_DEPTH:
        return ""
    seen.add(path)
    text = strip_comments(texts.get(path, ""))
    base = posixpath.dirname(path)

    def replace(match):
        target = _resolve(texts, base, match.group(2))
        return flatten(texts, target, depth + 1, seen) if target else ""

    return re.sub(r"\\(input|include|subfile)\s*\{([^}]*)\}", replace, text)


_ENV_RE = re.compile(
    r"\\begin\{(figure\*?|table\*?|wrapfigure|wraptable|SCfigure|sidewaysfigure|sidewaystable)\}"
)
_COUNTER_RE = re.compile(
    r"\\setcounter\{(figure|table)\}\{(\d+)\}"
    r"|\\renewcommand\*?\{?\\the(figure|table)\}?\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}"
    r"|\\captionsetup\[(figure|table)\]\{[^}]*name\s*=\s*(Supplementary|Supporting|Extended)"
)


def _prefix_from(definition):
    """\\renewcommand{\\thefigure}{S\\arabic{figure}} -> "S"."""
    head = re.split(r"\\(?:arabic|Roman|roman|Alph|alph)\b", definition)[0]
    return re.sub(r"[{}\\\s]", "", head)


_SYMBOLS = {
    "alpha": "α", "beta": "β", "gamma": "γ", "Gamma": "Γ", "delta": "δ",
    "Delta": "Δ", "epsilon": "ε", "varepsilon": "ε", "theta": "θ",
    "lambda": "λ", "mu": "μ", "nu": "ν", "pi": "π", "rho": "ρ", "sigma": "σ",
    "Sigma": "Σ", "tau": "τ", "phi": "φ", "varphi": "φ", "chi": "χ",
    "psi": "ψ", "omega": "ω", "Omega": "Ω", "eta": "η", "kappa": "κ",
    "xi": "ξ", "zeta": "ζ", "times": "×", "pm": "±", "approx": "≈",
    "sim": "~", "le": "≤", "leq": "≤", "ge": "≥", "geq": "≥", "neq": "≠",
    "cdot": "·", "circ": "°", "degree": "°", "infty": "∞", "AA": "Å",
    "rightarrow": "→", "to": "→", "leftarrow": "←", "uparrow": "↑",
    "downarrow": "↓", "hbar": "ħ", "partial": "∂", "nabla": "∇",
    "langle": "⟨", "rangle": "⟩", "propto": "∝",
}


def _two_args(match):
    command = match.group(0)[1:].split("{", 1)[0].split("[", 1)[0].rstrip("*")
    first, second = match.group(1), match.group(2)
    if command in ("frac", "dfrac", "tfrac"):
        return "%s/%s" % (first, second)
    if command in ("textcolor", "href", "colorbox", "texorpdfstring"):
        return second if command != "texorpdfstring" else first
    return first + second


def to_plain(latex):
    """A caption's LaTeX as readable text. Math is kept, minus delimiters."""
    text = latex
    text = re.sub(r"\\(label|cite[a-zA-Z]*|ref|eqref|autoref|cref|Cref)\*?(\[[^\]]*\])*\{[^}]*\}",
                  lambda m: "" if m.group(1) == "label" or m.group(1).startswith("cite") else "?",
                  text)
    for _ in range(4):
        text = re.sub(r"\\(?:textbf|textit|emph|textrm|textsf|texttt|mathrm|mathbf|mathit|"
                      r"text|textsc|underline|mbox|hbox|footnotesize|small)\s*\{([^{}]*)\}",
                      r"\1", text)
    for command, symbol in _SYMBOLS.items():
        text = re.sub(r"\\%s(?![A-Za-z])" % command, symbol, text)
    # Any remaining one-argument wrapper (\textcolor{red}{x}, \rev{x}) keeps
    # its text; bare commands (\justifying, \small) are dropped.
    for _ in range(4):
        text = re.sub(r"\\[A-Za-z]+\*?(?:\[[^\]]*\])?\{([^{}]*)\}\{([^{}]*)\}",
                      _two_args,
                      text)
        text = re.sub(r"\\[A-Za-z]+\*?(?:\[[^\]]*\])?\{([^{}]*)\}", r"\1", text)
    text = text.replace("\\%", "%").replace("\\&", "&").replace("\\_", "_")
    text = text.replace("~", " ").replace("\\,", " ").replace("\\;", " ").replace("\\ ", " ")
    text = text.replace("``", '"').replace("''", '"').replace("--", "–")
    text = re.sub(r"(?<!\\)\$", "", text)
    text = re.sub(r"\\(?:centering|noindent|newline|linebreak|par|hfill|vspace\{[^}]*\}|hspace\{[^}]*\})", " ", text)
    text = re.sub(r"\\\\", " ", text)
    text = re.sub(r"\\[A-Za-z]+\*?", " ", text)
    text = text.replace("{", "").replace("}", "")
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\s+([,.;:)])", r"\1", text)
    return text.strip()


def _roots(texts):
    """The main document first, then any other standalone document (often the
    supplementary information), each read with its own counters."""
    main = _main_file(texts)
    others = sorted(p for p, t in texts.items()
                    if p != main and "\\documentclass" in t)
    return main, [main] + others if main else []


_SUPPLEMENT_NAME_RE = re.compile(r"(^|[^a-z])(si|supp|supplement|supplementary|supporting)([^a-z]|$)")


def _figures_in(document, default_prefix=""):
    events = [(m.start(), "env", m) for m in _ENV_RE.finditer(document)]
    events += [(m.start(), "counter", m) for m in _COUNTER_RE.finditer(document)]
    events.sort(key=lambda e: e[0])

    counters = {"figure": 0, "table": 0}
    prefixes = {"figure": default_prefix, "table": default_prefix}
    figures = []
    for _pos, kind, match in events:
        if kind == "counter":
            if match.group(1):
                counters[match.group(1)] = int(match.group(2))
            elif match.group(3):
                # \arabic alone keeps a supplementary document supplementary.
                prefixes[match.group(3)] = _prefix_from(match.group(4)) or default_prefix
            else:
                # "Supplementary Figure 1" is S1.
                default_prefix = default_prefix or "S"
                prefixes[match.group(5)] = prefixes[match.group(5)] or "S"
            continue
        env = match.group(1)
        end = re.compile(r"\\end\{%s\}" % re.escape(env)).search(document, match.end())
        body = document[match.end(): end.start() if end else len(document)]
        counter = "table" if "table" in env else "figure"
        captions = _command_args(body, "caption")
        graphics = _command_args(body, "includegraphics")
        if not captions and not graphics:
            continue
        counters[counter] += 1
        labels = _command_args(body, "label")
        figures.append({
            "kind": counter,
            "number": "%s%d" % (prefixes[counter], counters[counter]),
            "graphics": [g.strip() for g in graphics if g.strip()],
            "caption": to_plain(captions[-1]) if captions else "",
            "label": labels[0].strip() if labels else "",
        })
    return figures


def extract_figures(texts):
    """Every figure/table environment, in document order, numbered as LaTeX
    would number it. Returns (main_path, figures)."""
    main, roots = _roots(texts)
    if main is None:
        return None, []
    figures = []
    for root in roots:
        document = flatten(texts, root)
        prefix = ""
        if root != main and (
                _SUPPLEMENT_NAME_RE.search(posixpath.basename(root).lower())
                or re.search(r"name\s*=\s*(Supplementary|Supporting)", document)):
            prefix = "S"
        for figure in _figures_in(document, prefix):
            figure["document"] = root
            figures.append(figure)
    return main, figures


MAX_ABSTRACT_CHARS = 6000


def extract_abstract(texts):
    """The paper's abstract as plain text, from the main document:
    \\begin{abstract}...\\end{abstract}, or \\abstract{...} (some journal
    classes). "" when there is none."""
    main = _main_file(texts)
    if main is None:
        return ""
    document = flatten(texts, main)
    match = re.search(r"\\begin\{abstract\}(.*?)\\end\{abstract\}", document, re.S)
    raw = match.group(1) if match else ""
    if not raw:
        args = _command_args(document, "abstract")
        raw = args[0] if args else ""
    return to_plain(raw)[:MAX_ABSTRACT_CHARS]


# ---- matching to the record's figures -------------------------------------------

def _stem(path):
    base = posixpath.basename(str(path or "").strip().replace("\\", "/"))
    stem, ext = posixpath.splitext(base)
    if ext.lower() in (".pdf", ".png", ".jpg", ".jpeg", ".eps", ".svg", ".gif", ".ps"):
        base = stem
    return base.lower()


def _number_key(kind, number):
    return "%s:%s" % (kind, str(number or "").strip().upper())


def _record_number_key(number):
    """A chart's number as stored ("2", "S3", "Table 1") -> matching key."""
    value = str(number or "").strip()
    if not value:
        return None
    match = re.match(r"^table\s+(.+)$", value, re.IGNORECASE)
    if match:
        return _number_key("table", match.group(1))
    return _number_key("figure", value)


def match_captions(figures, charts):
    """[{id, caption, number, how, label}] for the charts a caption fits."""
    by_stem, by_number = {}, {}
    for figure in figures:
        if not figure["caption"]:
            continue
        for graphic in figure["graphics"]:
            by_stem.setdefault(_stem(graphic), figure)
        by_number.setdefault(_number_key(figure["kind"], figure["number"]), figure)

    out = []
    for chart in charts or []:
        figure, how = by_stem.get(_stem(chart.get("imageFile"))), "file"
        if figure is None:
            key = _record_number_key(chart.get("number"))
            figure, how = (by_number.get(key), "number") if key else (None, None)
        if figure is None:
            continue
        display = figure["number"] if figure["kind"] == "figure" else "Table " + figure["number"]
        out.append({"id": chart.get("id"), "caption": figure["caption"],
                    "number": display, "label": figure["label"], "how": how})
    return out


# ---- endpoint -------------------------------------------------------------------

def _overleaf(value):
    return "overleaf.com" in str(value or "").lower()


@csrf_protect
def latex_captions(body):
    """
    Captions for the record's figures from the paper's LaTeX source
    Handler for POST: /api/curation/latex-captions
    """
    if not get_current_user():
        return {"error": "authentication required"}, 401
    body = body or {}
    charts = body.get("charts") or []
    try:
        if body.get("arxiv"):
            if _overleaf(body["arxiv"]):
                raise LatexError(
                    "Overleaf projects cannot be read from a link. In Overleaf, "
                    "open Menu > Download > Source, then upload the .zip here.")
            ident = arxiv_id(body["arxiv"])
            if not ident:
                raise LatexError("That is not an arXiv identifier or arxiv.org "
                                 "link (e.g. 2301.01234).")
            texts = read_source("arxiv.tar.gz", fetch_arxiv(ident))
            source = "arXiv:" + ident
        elif body.get("content_b64"):
            try:
                data = base64.b64decode(body["content_b64"], validate=False)
            except Exception:
                raise LatexError("The file could not be read.")
            if len(data) > MAX_UPLOAD_BYTES:
                raise LatexError("That file is larger than 10 MB. Upload just the "
                                 ".tex files, or a .zip without the images.")
            texts = read_source(body.get("filename") or "", data)
            source = body.get("filename") or "upload"
        else:
            raise LatexError("Provide a LaTeX file or an arXiv identifier.")
        if not texts:
            raise LatexError("No .tex files were found in that source.")
        main, figures = extract_figures(texts)
    except LatexError as e:
        return {"error": str(e)}, 400
    except (zipfile.BadZipFile, tarfile.TarError):
        return {"error": "That archive could not be opened."}, 400

    matches = match_captions(figures, charts)
    abstract = extract_abstract(texts)
    print("LaTeX captions: files=%d figures=%d matched=%d"
          % (len(texts), len(figures), len(matches)))
    return {
        "source": source,
        "main": main,
        "tex_files": len(texts),
        "figures": figures,
        "matches": matches,
        # The paper's own abstract, for records whose DOI lookup had none.
        "abstract": abstract,
    }, 200
