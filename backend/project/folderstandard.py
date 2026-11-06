"""Qresp Folder Standard v1: structure detection and record boundaries.

Why this exists
---------------
The analyzer used to walk the whole tree and turn every matching FILE into a
candidate. On a real paper folder that produces hundreds of Charts, Scripts
and "Unclassified" rows, which is worse than no help at all.

A paper folder already carries the answer in its shape. One immediate child
of a role directory is ONE Qresp record, and everything beneath that child
belongs to it. So instead of guessing per file, we:

  1. decide whether the folder follows the standard, a known legacy layout,
     or neither;
  2. take record boundaries from immediate children;
  3. report anything we will not classify as GROUPED folder rows, never as a
     list of every path.

Nothing here fetches, writes, renames or migrates anything. It operates on a
relative-path inventory the caller already has, and every path it returns
stays relative to the selected paper root.
"""
import posixpath
import re

# ---- the standard ------------------------------------------------------------

ROLE_DATASETS = "datasets"
ROLE_CHARTS = "charts"
ROLE_SCRIPTS = "scripts"
ROLE_TOOLS = "tools"
ROLE_DOCS = "docs"

# The ONLY names a newly organized paper may use, exactly, in lower case.
STANDARD_ROLES = (ROLE_DATASETS, ROLE_CHARTS, ROLE_SCRIPTS, ROLE_TOOLS,
                  ROLE_DOCS)

# Legacy names seen across the public corpus (63 RCC paper folders). Matched
# case-insensitively. Adding a name here is the ONLY thing needed to support
# another historical layout — no path is ever renamed on the server.
LEGACY_ALIASES = {
    ROLE_DATASETS: (
        "data", "datasets", "dataset", "raw_data", "rawdata", "raw-data",
        "data_files", "datafiles",
    ),
    ROLE_CHARTS: (
        "charts", "chart", "figures_tables", "figures-tables", "figurestables",
        "figures", "figure", "figs", "fig", "plots",
    ),
    ROLE_SCRIPTS: (
        "scripts", "script", "plot_scripts", "plotscripts",
        "postprocessing_scripts", "postprocessingscripts", "code", "codes",
        "src",
    ),
    ROLE_DOCS: (
        "doc", "docs", "documentation", "tutorials", "tutorial", "manual",
    ),
    ROLE_TOOLS: ("tools", "tool", "software"),
}

# Root files that are expected and never a structure problem.
OPTIONAL_ROOT_FILES = ("main.ipynb", "readme.md", "readme", "readme.txt",
                       "readme.rst", "license", "license.txt", "license.md")

CHART_PREVIEW_EXTENSIONS = (".png", ".jpeg", ".jpg", ".gif", ".svg", ".pdf")

# Images that decorate a page rather than being the figure. A folder's own
# figure is never called any of these, and picking one would put a logo in a
# published record.
CHART_DECORATIVE_STEMS = frozenset((
    "logo", "logos", "icon", "icons", "favicon", "banner", "header",
    "footer", "screenshot", "screenshots", "thumbnail", "thumb",
    "graphical_abstract", "graphicalabstract", "graphical-abstract",
    "toc", "toc_graphic", "cover",
))
CHART_PREVIEW_STEM = "preview"
CHART_NOTEBOOK = "notebook.ipynb"
CHART_DATA_DIR = "data"

# A new artifact id must be safe in a URL and readable in a path.
ARTIFACT_ID_RE = re.compile(r"^[A-Za-z0-9._-]+$")

MODE_STANDARD = "standard"
MODE_LEGACY = "legacy"
MODE_INVALID = "invalid"

# Grouped reporting caps. These bound the RESPONSE, not the crawl.
MAX_GROUP_ROWS = 200
MAX_NAMES_PER_GROUP = 20
MAX_TREE_NODES = 200


def _normalized(name):
    return re.sub(r"[^a-z0-9]+", "", (name or "").lower())


def _alias_lookup():
    table = {}
    for role, names in LEGACY_ALIASES.items():
        for name in names:
            table[_normalized(name)] = role
    return table


ALIAS_TABLE = _alias_lookup()


def top_level_dirs(files, dirs):
    """Top-level directory names present in the inventory."""
    tops = set()
    for path in list(dirs) + list(files):
        if "/" in path:
            tops.add(path.split("/", 1)[0])
    return sorted(tops)


def root_files(files):
    return sorted(path for path in files if "/" not in path)


def detect_structure(files, dirs):
    """Decide the analysis mode and map productive roots to roles.

    Returns (mode, roles, issues) where `roles` maps an ACTUAL top-level
    directory name to a standard role. Directories are never renamed; the
    mapping only tells the analyzer how to read them.
    """
    tops = top_level_dirs(files, dirs)
    roles = {}
    unknown = []

    for top in tops:
        if top in STANDARD_ROLES:
            roles[top] = top
            continue
        role = ALIAS_TABLE.get(_normalized(top))
        if role:
            roles[top] = role
        else:
            unknown.append(top)

    issues = []
    if not tops:
        # A flat folder of loose files: nothing to take a boundary from.
        return MODE_INVALID, {}, [{
            "path": "",
            "reason": "This folder has no top-level directories, so Qresp "
                      "cannot tell datasets from charts or scripts.",
        }]

    if unknown:
        return MODE_INVALID, roles, [
            {"path": name,
             "reason": "Not a Qresp Folder Standard role (datasets, charts, "
                       "scripts, tools, docs) and not a layout Qresp "
                       "recognizes."}
            for name in unknown
        ]

    # Every productive root is known. Standard only when every one of them is
    # already the exact lowercase name.
    if all(top == role for top, role in roles.items()):
        mode = MODE_STANDARD
    else:
        mode = MODE_LEGACY
        issues = [
            {"path": top,
             "reason": "Read as %s (Qresp Folder Standard name: %s). Nothing "
                       "on the file server is renamed." % (role, role)}
            for top, role in sorted(roles.items()) if top != role
        ]
    return mode, roles, issues


def validate_artifact_id(name):
    """True when a name is safe as a NEW artifact directory name."""
    return bool(name) and bool(ARTIFACT_ID_RE.match(name))


# ---- boundaries ---------------------------------------------------------------

def _children_of(root, files, dirs):
    """Immediate children of a top-level directory: (folders, files)."""
    prefix = root + "/"
    child_dirs, child_files = set(), []
    for path in dirs:
        if path.startswith(prefix):
            child_dirs.add(prefix + path[len(prefix):].split("/", 1)[0])
    for path in files:
        if not path.startswith(prefix):
            continue
        rest = path[len(prefix):]
        if "/" in rest:
            child_dirs.add(prefix + rest.split("/", 1)[0])
        else:
            child_files.append(path)
    return sorted(child_dirs), sorted(child_files)


def descendants_of(folder, files):
    prefix = folder + "/"
    return [path for path in files if path.startswith(prefix)]


def summarize_folder(folder, files):
    """A grouped row: what is in here, without listing everything."""
    contents = descendants_of(folder, files)
    extensions = {}
    for path in contents:
        ext = posixpath.splitext(path)[1].lower() or "(no extension)"
        extensions[ext] = extensions.get(ext, 0) + 1
    common = sorted(extensions.items(), key=lambda kv: (-kv[1], kv[0]))
    return {
        "path": folder,
        "name": posixpath.basename(folder) or folder,
        "file_count": len(contents),
        "extensions": [ext for ext, _ in common[:6]],
        # Names are for an EXPANDED row only, and bounded.
        "sample_names": [posixpath.basename(p) for p in contents[:MAX_NAMES_PER_GROUP]],
    }


def boundary_tree(root, files, dirs, depth=2):
    """A compact, selectable tree for choosing record boundaries by hand.

    Only folders, only a couple of levels, each with a file count — enough to
    answer "is this one dataset or several?" without rendering the corpus.
    """
    nodes = []
    prefix = root + "/"
    seen = set()
    for path in sorted(set(dirs)):
        if not path.startswith(prefix):
            continue
        relative = path[len(prefix):]
        level = relative.count("/") + 1
        if level > depth or path in seen:
            continue
        seen.add(path)
        summary = summarize_folder(path, files)
        summary["level"] = level
        summary["parent"] = posixpath.dirname(path)
        nodes.append(summary)
        if len(nodes) >= MAX_TREE_NODES:
            break
    return nodes


def group_unclassified(paths, files):
    """Grouped folder rows instead of a list of every path."""
    buckets = {}
    for path in paths:
        folder = posixpath.dirname(path)
        buckets.setdefault(folder, []).append(path)
    rows = []
    for folder, members in sorted(buckets.items()):
        extensions = {}
        for path in members:
            ext = posixpath.splitext(path)[1].lower() or "(no extension)"
            extensions[ext] = extensions.get(ext, 0) + 1
        common = sorted(extensions.items(), key=lambda kv: (-kv[1], kv[0]))
        rows.append({
            "path": folder,
            "name": folder or "folder root",
            "file_count": len(members),
            "extensions": [ext for ext, _ in common[:6]],
            "sample_names": [posixpath.basename(p)
                             for p in members[:MAX_NAMES_PER_GROUP]],
        })
    rows.sort(key=lambda row: (-row["file_count"], row["path"]))
    return rows[:MAX_GROUP_ROWS]


class BoundaryError(Exception):
    """A rejected boundary selection. The message is safe to show."""


class ChartPlanError(BoundaryError):
    """A rejected chart plan. The message is safe to show.

    A subclass of BoundaryError so every caller that already turns a rejected
    boundary into a 400 does the same for a rejected chart plan, rather than
    letting one of them fall through as a 500.
    """


def check_relative_path(path, noun="folder", error=BoundaryError):
    """Refuse anything that is not a plain relative POSIX path.

    Shared by the boundary selection and the chart plan so the two can never
    drift apart on what "relative" means: no URL, no absolute path, no
    backslash, no percent-encoding (which is how encoded traversal arrives),
    no `..` segment, and nothing that normalizes to something else.
    """
    if (path.startswith("/") or "\\" in path or "://" in path
            or "%" in path or ".." in path.split("/")):
        raise error("%r is not a relative %s inside this paper."
                    % (path[:80], noun))
    if path != posixpath.normpath(path):
        raise error("%r is not a normalized path." % path[:80])


def validate_boundaries(raw, roles, files, dirs):
    """Turn a browser-supplied boundary selection into trusted paths.

    A boundary says "treat THIS folder as one record" instead of the default
    immediate children. That is a lot of power to hand a request body, so
    every entry has to survive:

      * its role root must be one the analyzed tree actually has;
      * the path must be a relative POSIX path we SAW in this tree — not a
        URL, not absolute, no `..`, no backslash, no percent-encoding, and
        no path we never listed;
      * it must sit under the role root it was submitted for;
      * a parent and one of its descendants cannot both be selected, because
        the same files would end up in two records.

    Returns {role_root: [paths]} with duplicates collapsed, or raises
    BoundaryError. Nothing here fetches or writes anything.
    """
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        raise BoundaryError("Boundary selection must be an object.")

    known = set(dirs) | set(files)
    selected = {}

    for root, paths in raw.items():
        if root not in roles:
            raise BoundaryError(
                "%r is not a folder in this paper." % str(root)[:80])
        if not isinstance(paths, (list, tuple)):
            raise BoundaryError(
                "Boundaries for %s must be a list of folders." % root)

        cleaned = []
        for entry in paths:
            path = entry if isinstance(entry, str) else ""
            path = path.strip()
            if not path:
                raise BoundaryError("An empty boundary path was submitted.")
            check_relative_path(path, "folder", BoundaryError)
            if path != root and not path.startswith(root + "/"):
                raise BoundaryError(
                    "%r is not inside %s." % (path[:80], root))
            if path not in known:
                # Only paths this analysis actually listed. A boundary can
                # never point at something we never saw.
                raise BoundaryError(
                    "%r was not found in this folder." % path[:80])
            if path not in cleaned:
                cleaned.append(path)

        for path in cleaned:
            for other in cleaned:
                if other != path and path.startswith(other + "/"):
                    raise BoundaryError(
                        "%s and %s overlap — select the parent or the child, "
                        "not both." % (other, path))
        if cleaned:
            selected[root] = sorted(cleaned)

    return selected


def chart_images(folder, files):
    """Every usable image directly inside `folder`, server spelling intact.

    Decorative images are dropped: a logo is never the figure, and proposing
    one puts it in a published record.
    """
    images = []
    for path in descendants_of(folder, files):
        if posixpath.dirname(path) != folder:
            continue
        stem, ext = posixpath.splitext(posixpath.basename(path))
        if ext.lower() not in CHART_PREVIEW_EXTENSIONS:
            continue
        if stem.lower().replace(" ", "_") in CHART_DECORATIVE_STEMS:
            continue
        images.append(path)
    return sorted(images)


def chart_notebooks(folder, files):
    """Every notebook directly inside `folder`, server spelling intact.

    A chart boundary may hold more than one. Returning all of them lets an
    image promoted to its own chart be matched against the whole set, rather
    than against whichever notebook the original chart happened to take.
    """
    return sorted(
        path for path in descendants_of(folder, files)
        if posixpath.dirname(path) == folder
        and posixpath.splitext(path)[1].lower() == ".ipynb"
    )


def notebook_for_image(image, notebooks):
    """The notebook that unambiguously belongs to `image`, or "".

    Unambiguous means the basenames match -- exactly, or differing only in
    case. A lone notebook with an unrelated name is NOT adopted: that is a
    guess, and guessing is what attached a notebook to a chart whose image we
    had just declined to choose.
    """
    stem = posixpath.splitext(posixpath.basename(image or ""))[0]
    if not stem:
        return ""
    for matches in (lambda other: other == stem,
                    lambda other: other.lower() == stem.lower()):
        hits = [path for path in notebooks
                if matches(posixpath.splitext(posixpath.basename(path))[0])]
        if len(hits) == 1:
            return hits[0]
    return ""


def pick_chart_image(folder, images):
    """The representative image for a chart folder, or "" when the choice is
    genuinely ambiguous.

    The old rule was `preview.png`, or a single image and nothing else. Real
    RCC folders name the figure after the folder -- figure_S1/figure_S1.png
    next to diagram.png -- so a two-image folder proposed no image at all
    while happily proposing its notebook. Named-after-the-folder comes first
    now, and an ambiguous folder proposes nothing rather than guessing.

    Returns (chosen, options): `options` is always EVERY image found, each
    with the reason it is there, so the curator can pick when we decline to
    and nothing is silently dropped from the review.
    """
    name = posixpath.basename(folder)

    def stem(path):
        return posixpath.splitext(posixpath.basename(path))[0]

    def described(chosen):
        """Every image, each labelled with why it is in the list."""
        listed = []
        for path in images:
            if stem(path) == name:
                reason = "filename matches the chart folder"
            elif stem(path).lower() == name.lower():
                reason = "filename matches the chart folder (different case)"
            elif stem(path).lower() == CHART_PREVIEW_STEM:
                reason = "standard preview image"
            elif len(images) == 1:
                reason = "the only image in this chart folder"
            else:
                reason = "image found in this chart folder"
            listed.append({"path": path, "reason": reason})
        return chosen, listed

    if not images:
        return "", []

    # 1. The folder's own name, spelled exactly.
    exact = [p for p in images if stem(p) == name]
    if len(exact) == 1:
        return described(exact[0])

    # 2. The same name in a different case. The SERVER's spelling is kept --
    #    the path has to resolve on a case-sensitive file server.
    lowered = [p for p in images if stem(p).lower() == name.lower()]
    if len(lowered) == 1:
        return described(lowered[0])

    # 3. The Folder Standard's own preview.png.
    preview = [p for p in images
               if stem(p).lower() == CHART_PREVIEW_STEM]
    if len(preview) == 1:
        return described(preview[0])

    # 4. One image and no ambiguity to resolve.
    if len(images) == 1:
        return described(images[0])

    # 5. Several images and nothing to choose between them: the curator
    #    picks, and every one of them is offered.
    return described("")


def chart_parts(folder, files):
    """preview / data / notebook inside one charts/<child> folder."""
    contents = descendants_of(folder, files)
    images = chart_images(folder, files)
    preview, _options = pick_chart_image(folder, images)

    notebook = ""
    for path in contents:
        if posixpath.basename(path).lower() == CHART_NOTEBOOK:
            notebook = path
            break
    if not notebook:
        name = posixpath.basename(folder)
        notebooks = [p for p in contents
                     if p.lower().endswith(".ipynb")
                     and posixpath.dirname(p) == folder]
        # Exact name first, then the same name in a different case. A lone
        # notebook with an unrelated name is NOT adopted: that is a guess,
        # and it is the guess that attached a notebook to a chart whose
        # image we had just declined to choose.
        for match in (lambda stem: stem == name,
                      lambda stem: stem.lower() == name.lower()):
            hits = [p for p in notebooks
                    if match(posixpath.splitext(posixpath.basename(p))[0])]
            if len(hits) == 1:
                notebook = hits[0]
                break

    data_dir = "%s/%s" % (folder, CHART_DATA_DIR)
    if any(p.startswith(data_dir + "/") for p in contents):
        data = [data_dir]
    else:
        data = sorted(
            p for p in contents
            if p not in (preview, notebook)
            and posixpath.dirname(p) == folder
            and posixpath.splitext(p)[1].lower() not in CHART_PREVIEW_EXTENSIONS
        )
    return preview, data, notebook


# ---- chart images, and the plan the curator makes from them -------------------
#
# A Dataset or a Script boundary is a FOLDER. A Chart is not: a Chart record
# holds exactly ONE image, so the unit a curator has to decide about is the
# image file itself. `chart_image_groups` reports every image a Chart could be
# built from, grouped by the folder it really sits in, and `validate_chart_plan`
# turns the curator's decision about those images into trusted entries.
#
# Nothing here fetches, writes or renames anything, and no plan entry may name
# a path this analysis did not itself list.

# The three roles an image may be given. There is no fourth: "no opinion" is
# expressed by leaving the image out of the plan, or by `ignore`.
CHART_ACTIONS = ("chart", "supporting", "ignore")

# A plan describes images the analysis already found, and the crawl is capped
# at MAX_FILES, so a plan larger than this cannot be about this folder.
MAX_CHART_PLAN = 1000


def chart_image_groups(files, dirs, roles, selected=None):
    """Every image a Chart record could be built from, grouped by its folder.

    A group's `folder` is the REAL folder the images sit in, spelling and case
    preserved, so the browser never has to reconstruct it from a candidate's
    internals. `suggested_action` is advisory and only ever "chart" (the one
    image the deterministic rule would have picked) or "review" (an image the
    curator must decide about) — it is not itself a decision, and nothing is
    created from it until a plan says so.

    Decorative images (logos, banners, screenshots) are not offered: they are
    never the figure, and the same rule already keeps them out of a proposal.
    """
    selected = selected or {}
    known_dirs, known_files = set(dirs), set(files)
    groups = []

    for top, role in sorted((roles or {}).items()):
        if role != ROLE_CHARTS:
            continue
        child_dirs, child_files = _children_of(top, files, dirs)
        chosen = selected.get(top)
        if chosen is not None:
            child_dirs = [p for p in chosen if p in known_dirs]
            child_files = [p for p in chosen if p in known_files]

        folders = list(child_dirs)
        # Loose images directly under the role root are their own group: the
        # role root IS their real folder.
        if any(posixpath.splitext(p)[1].lower() in CHART_PREVIEW_EXTENSIONS
               for p in child_files):
            folders.append(top)

        for folder in sorted(set(folders)):
            images = chart_images(folder, files)
            if not images:
                continue
            suggested, described = pick_chart_image(folder, images)
            groups.append({
                "folder": folder,
                "role_root": top,
                "images": [{
                    "path": option["path"],
                    "reason": option["reason"],
                    "suggested_action": ("chart" if option["path"] == suggested
                                         else "review"),
                } for option in described],
                # Informational: a notebook is an attachment of the Chart it
                # matches by name, never a Chart of its own.
                "notebooks": [{"path": path}
                              for path in chart_notebooks(folder, files)],
            })
    return groups


def validate_chart_plan(raw, groups):
    """Turn a browser-supplied chart plan into trusted entries.

    A plan says, per IMAGE: make this one a Chart, attach that one to a Chart
    as a supporting file, or ignore it. That decides what records get proposed,
    so every entry has to survive:

      * the path must be an image THIS analysis discovered (see
        `chart_image_groups`) — not a URL, not absolute, no `..`, no
        backslash, no percent-encoding, and no path we never listed;
      * the action must be one of chart / supporting / ignore;
      * no image may appear twice, so it can never hold two roles;
      * a supporting file must name a target whose action is `chart` and
        which sits in the SAME chart folder — an image can therefore never be
        both a Chart's own image and a supporting file.

    Returns a list of {path, action, target} sorted by path (so the same plan
    always produces the same candidates in the same order), or raises
    ChartPlanError. Nothing here fetches or writes anything.
    """
    if raw is None:
        return []
    if not isinstance(raw, (list, tuple)):
        raise ChartPlanError("The chart plan must be a list of images.")
    if len(raw) > MAX_CHART_PLAN:
        raise ChartPlanError(
            "The chart plan is larger than this folder can be.")

    folder_of = {}
    for group in groups or []:
        for image in group.get("images") or []:
            folder_of[image["path"]] = group["folder"]

    cleaned, seen = [], set()
    for entry in raw:
        if not isinstance(entry, dict):
            raise ChartPlanError("Each chart plan entry must be an object.")

        path = entry.get("path")
        path = path.strip() if isinstance(path, str) else ""
        if not path:
            raise ChartPlanError("An empty chart image path was submitted.")
        check_relative_path(path, "image", ChartPlanError)
        if path not in folder_of:
            raise ChartPlanError(
                "%r is not an image found in this folder." % path[:80])
        if path in seen:
            raise ChartPlanError(
                "%r was given more than one role." % path[:80])
        seen.add(path)

        action = entry.get("action")
        action = action.strip().lower() if isinstance(action, str) else ""
        if action not in CHART_ACTIONS:
            raise ChartPlanError(
                "%r is not a chart role (chart, supporting, ignore)."
                % str(entry.get("action"))[:40])

        target = entry.get("target")
        target = target.strip() if isinstance(target, str) else ""
        if action == "supporting":
            if not target:
                raise ChartPlanError(
                    "%r is a supporting file with no Chart to attach it to."
                    % path[:80])
            check_relative_path(target, "image", ChartPlanError)
            if target not in folder_of:
                raise ChartPlanError(
                    "%r is not an image found in this folder." % target[:80])
        elif target:
            raise ChartPlanError(
                "Only a supporting file may name a target Chart.")

        cleaned.append({
            "path": path,
            "action": action,
            "target": target if action == "supporting" else "",
        })

    charts = {entry["path"] for entry in cleaned if entry["action"] == "chart"}
    for entry in cleaned:
        if entry["action"] != "supporting":
            continue
        if entry["target"] not in charts:
            raise ChartPlanError(
                "%r must attach to an image whose role is Chart."
                % entry["path"][:80])
        if folder_of[entry["target"]] != folder_of[entry["path"]]:
            raise ChartPlanError(
                "%r and %r are not in the same chart folder."
                % (entry["path"][:80], entry["target"][:80]))

    return sorted(cleaned, key=lambda entry: entry["path"])
