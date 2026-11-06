"""DOI lookup: Crossref metadata for a DOI the curator pasted.

One authenticated, CSRF-protected endpoint (wired through swagger.yml):
- POST /api/import/doi   Crossref metadata for a pasted DOI

It PROPOSES metadata only — nothing is published, saved or overwritten here.
The frontend fills the Publication Information inputs with what comes back,
and the curator still has to press Save.

The registry is the only automated source of publication metadata in Qresp.
A value Crossref does not supply is left blank for the curator to type; it is
never inferred, and no language model is involved in bibliography.
"""
import re
from urllib.parse import quote

import requests

from project.auth import csrf_protect, get_current_user

CROSSREF_API = "https://api.crossref.org/works/"
CROSSREF_TIMEOUT = 8
# Identifies Qresp politely to Crossref (no key, no secret).
CROSSREF_HEADERS = {"User-Agent": "Qresp/2.0 (research data curation)"}

DOI_RE = re.compile(r"^10\.\d{4,9}/\S+$")

MAX_TAGS = 15


def _require_session():
    user = get_current_user()
    if not user:
        return {"error": "authentication required"}, 401
    return None


# ---------------------------------------------------------------- DOI layer

def normalize_doi(raw):
    """Strip common prefixes/whitespace and validate the DOI shape.
    Returns the normalized (lowercased) DOI or None."""
    value = (raw or "").strip()
    value = re.sub(r"^https?://(dx\.)?doi\.org/", "", value,
                   flags=re.IGNORECASE)
    value = re.sub(r"^doi:\s*", "", value, flags=re.IGNORECASE)
    value = value.strip().strip(".,;")
    if not value or not DOI_RE.match(value):
        return None
    return value.lower()


def _split_person(full_name):
    """'First [Middles] Last' -> the curator person triple (same convention
    as the frontend namesUtil)."""
    parts = [p for p in (full_name or "").split() if p]
    if not parts:
        return None
    person = {"firstName": parts[0], "middleName": "", "lastName": ""}
    if len(parts) >= 3:
        person["middleName"] = " ".join(parts[1:-1])
        person["lastName"] = parts[-1]
    elif len(parts) == 2:
        person["lastName"] = parts[1]
    return person


def _strip_jats(text):
    """Crossref abstracts arrive as JATS XML; keep the plain text only."""
    text = re.sub(r"<[^>]+>", " ", text or "")
    return re.sub(r"\s+", " ", text).strip()


# Crossref work types -> the curator's reference "kind" radio values.
# Unmapped types simply propose no kind — nothing is invented.
CROSSREF_KIND_MAP = {
    "journal-article": "journal",
    "proceedings-article": "journal",
    "posted-content": "preprint",
    "dissertation": "dissertation",
}


def _crossref_fields(message):
    """Map a Crossref work message onto proposal fields. Optional metadata
    may be missing — never fail because of it."""
    fields = {}
    kind = CROSSREF_KIND_MAP.get(
        (message.get("type") or "").strip().lower())
    if kind:
        fields["kind"] = kind
    titles = message.get("title") or []
    if titles and str(titles[0]).strip():
        fields["title"] = re.sub(r"\s+", " ", str(titles[0])).strip()

    authors = []
    for author in message.get("author") or []:
        given = (author.get("given") or "").strip()
        family = (author.get("family") or "").strip()
        if not given and not family:
            continue
        given_parts = given.split()
        authors.append({
            "firstName": given_parts[0] if given_parts else "",
            "middleName": " ".join(given_parts[1:]) if len(given_parts) > 1
                          else "",
            "lastName": family,
        })
    if authors:
        fields["authors"] = authors

    containers = message.get("container-title") or []
    if containers and str(containers[0]).strip():
        fields["journal"] = str(containers[0]).strip()

    issued = (message.get("issued") or {}).get("date-parts") or []
    if issued and issued[0] and issued[0][0]:
        try:
            fields["year"] = int(issued[0][0])
        except (TypeError, ValueError):
            pass

    for source_key, target in (("volume", "volume"), ("issue", "issue"),
                               ("page", "pages")):
        value = message.get(source_key)
        if value is not None and str(value).strip():
            fields[target] = str(value).strip()

    abstract = _strip_jats(message.get("abstract") or "")
    if abstract:
        fields["abstract"] = abstract

    if message.get("DOI"):
        fields["doi"] = str(message["DOI"]).strip().lower()
    if message.get("URL"):
        fields["url"] = str(message["URL"]).strip()

    subjects = [str(s).strip() for s in (message.get("subject") or [])
                if str(s).strip()]
    if subjects:
        fields["tags"] = subjects[:MAX_TAGS]
    return fields


def _crossref_lookup(doi):
    """Fetch Crossref metadata. Returns (fields, None) on success or
    (None, (message, status)) on failure. Provider error bodies are never
    surfaced to the client."""
    try:
        response = requests.get(CROSSREF_API + quote(doi, safe="/()"),
                                timeout=CROSSREF_TIMEOUT,
                                headers=CROSSREF_HEADERS)
    except Exception as e:
        print("DOI provider unreachable: %s" % type(e).__name__)
        return None, ("The DOI lookup service could not be reached, please "
                      "try again later.", 502)
    if response.status_code == 404:
        return None, ("This DOI was not found in the scholarly metadata "
                      "registry.", 404)
    if response.status_code != 200:
        print("DOI provider error: HTTP %s" % response.status_code)
        return None, ("The DOI lookup service returned an error, please try "
                      "again later.", 502)
    try:
        message = response.json().get("message") or {}
    except Exception:
        return None, ("The DOI lookup service returned an unreadable "
                      "response.", 502)
    return _crossref_fields(message), None


@csrf_protect
def lookup_doi(body):
    """
    Propose bibliographic metadata for a DOI
    Handler for POST: /api/import/doi
    """
    denied = _require_session()
    if denied:
        return denied

    doi = normalize_doi((body or {}).get("doi"))
    if not doi:
        return {"error": "That does not look like a valid DOI (expected "
                         "something like 10.1234/abcd)."}, 400

    fields, failure = _crossref_lookup(doi)
    if failure:
        message, status = failure
        return {"error": message}, status

    # A DOI resolves to exactly one address, so when the registry record
    # carries no URL of its own the canonical form is computed. It is never
    # guessed, and never asked of a model.
    if not fields.get("url"):
        fields["url"] = "https://doi.org/%s" % doi

    return {
        "doi": doi,
        "proposal": fields,
        "provenance": {key: "crossref" for key in fields},
        "alternatives": {},
        "warnings": [],
    }, 200
