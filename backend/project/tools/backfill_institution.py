"""One-time Institution backfill, as a reviewed data correction.

WHAT THIS IS NOT
================
It is not a feature, not a migration, and not inference. `Paper.institution`
is curator-entered metadata and is deliberately never derived from anything --
not the server's hostname, not an author's affiliation, not a collection, not
an email domain, not a DOI prefix. Nothing in the running application calls
this module, and nothing runs it at startup.

It exists because a person established a fact about a specific corpus -- that
every published record on the UChicago node belongs to the University of
Chicago -- and asked for that fact to be written down once, on the records
that have no value yet. That is a curator correcting data by hand, with a
tool to save the typing. The judgement stays with the person: the tool prints
exactly what it would touch and changes nothing until told to.

HOW IT DECIDES
==============
The selection is deliberately narrow and every clause excludes rather than
includes. A record is a candidate only when ALL of these hold:

  * it has no `institution` value already -- an existing value is NEVER
    overwritten, whatever it says, because somebody typed it;
  * it has a title and a DOI, which is what a published record has and a
    half-finished draft does not;
  * its title does not look like a staging or QA artefact (see
    `_LOOKS_LIKE_TEST`);
  * it is not excluded by hand via --exclude-id.

There is no hostname check anywhere in this file. Which database the tool is
pointed at is the operator's decision, made with --mongodb-uri, and the
manifest is what lets them confirm they pointed it at the right one before
anything is written.

USAGE
=====
    # 1. Look. This is the default and it writes nothing.
    python -m project.tools.backfill_institution \\
        --mongodb-uri "mongodb://localhost:27017/qresp" \\
        --institution "University of Chicago"

    # 2. Keep the manifest for review, and read it.
    python -m project.tools.backfill_institution \\
        --mongodb-uri "..." --institution "University of Chicago" \\
        --manifest /tmp/institution-backfill.json

    # 3. Only after a person has read that manifest.
    python -m project.tools.backfill_institution \\
        --mongodb-uri "..." --institution "University of Chicago" \\
        --manifest /tmp/institution-backfill.json --execute

Running it twice is safe: the second run finds nothing to do, because every
record it touched now has a value and a record with a value is never a
candidate.
"""

import argparse
import io
import json
import re
import sys

import mongoengine

from project.models import Paper


# Titles that belong to staging exercises rather than to published research.
# Matched case-insensitively against the whole title. Deliberately blunt: a
# false positive costs one record that a curator can set by hand, while a
# false negative writes an institution onto a test fixture.
_LOOKS_LIKE_TEST = re.compile(
    r"(staging|^test\b|\btest record\b|\bqa\b|\bdummy\b|\bsample record\b"
    r"|lorem ipsum|\bdelete me\b|\bplaceholder\b)",
    re.IGNORECASE,
)


def _title_of(paper):
    reference = getattr(paper, "reference", None)
    return str(getattr(reference, "title", "") or "").strip()


def _doi_of(paper):
    reference = getattr(paper, "reference", None)
    return str(getattr(reference, "DOI", "") or "").strip()


def classify(paper, excluded_ids=frozenset()):
    """Why this record is or is not a candidate. Returns (eligible, reason).

    The reason is reported for EVERY record, not only the chosen ones, so a
    reviewer can see what was passed over and disagree with it.
    """
    paper_id = str(paper.id)
    if paper_id in excluded_ids:
        return False, "excluded by --exclude-id"
    existing = str(getattr(paper, "institution", "") or "").strip()
    if existing:
        return False, "already has an institution: %s" % existing
    title = _title_of(paper)
    if not title:
        return False, "no title (not a published record)"
    if not _doi_of(paper):
        return False, "no DOI (not a published record)"
    if _LOOKS_LIKE_TEST.search(title):
        return False, "title looks like a staging/QA record"
    return True, "eligible"


def plan(papers, excluded_ids=frozenset()):
    """Split a queryset into (eligible, skipped) manifest rows."""
    eligible, skipped = [], []
    for paper in papers:
        ok, reason = classify(paper, excluded_ids)
        row = {
            "id": str(paper.id),
            "title": _title_of(paper),
            "doi": _doi_of(paper),
            "existing_institution":
                str(getattr(paper, "institution", "") or ""),
            "reason": reason,
        }
        (eligible if ok else skipped).append(row)
    return eligible, skipped


def apply_backfill(institution, excluded_ids=frozenset(), execute=False):
    """Returns (eligible, skipped, written). Writes only when `execute`."""
    papers = list(Paper.objects())
    eligible, skipped = plan(papers, excluded_ids)
    written = 0
    if execute:
        chosen = {row["id"] for row in eligible}
        for paper in papers:
            if str(paper.id) not in chosen:
                continue
            # Written field-by-field rather than through a bulk update so the
            # guard above is the ONLY thing that decides, and so a record that
            # changed underneath us is re-read by the caller's next run.
            paper.institution = institution
            paper.save()
            written += 1
    return eligible, skipped, written


def _print_report(institution, eligible, skipped, written, execute):
    print("Institution backfill")
    print("  value to set     %s" % institution)
    print("  mode             %s" % ("EXECUTE" if execute else "dry run"))
    print("  eligible         %d" % len(eligible))
    print("  skipped          %d" % len(skipped))
    if execute:
        print("  written          %d" % written)
    print("")
    print("WOULD SET" if not execute else "SET")
    for row in eligible:
        print("  %s  %s" % (row["id"], row["title"][:76]))
    if skipped:
        print("")
        print("SKIPPED")
        for row in skipped:
            print("  %s  %-40s  %s"
                  % (row["id"], row["title"][:40], row["reason"]))
    if not execute:
        print("")
        print("Nothing was written. Re-run with --execute after a person has")
        print("read the list above.")


def main(argv=None):
    parser = argparse.ArgumentParser(
        prog="python -m project.tools.backfill_institution",
        description="One-time, reviewed Institution backfill. Dry run by "
                    "default; writes only with --execute.")
    parser.add_argument("--mongodb-uri", required=True,
                        help="Database to read. The operator chooses this; "
                             "the tool never guesses a host.")
    parser.add_argument("--institution", required=True,
                        help='Exact value to set, e.g. "University of Chicago".')
    parser.add_argument("--exclude-id", action="append", default=[],
                        help="Record id to leave alone. Repeatable.")
    parser.add_argument("--manifest",
                        help="Write the full plan here as JSON, for review.")
    parser.add_argument("--execute", action="store_true",
                        help="Actually save. Without it nothing is written.")
    args = parser.parse_args(argv)

    institution = args.institution.strip()
    if not institution:
        parser.error("--institution must not be blank")

    mongoengine.connect(host=args.mongodb_uri)
    try:
        eligible, skipped, written = apply_backfill(
            institution, frozenset(args.exclude_id), args.execute)
    finally:
        mongoengine.disconnect()

    if args.manifest:
        with io.open(args.manifest, "w", encoding="utf-8") as handle:
            json.dump({"institution": institution,
                       "executed": bool(args.execute),
                       "written": written,
                       "eligible": eligible,
                       "skipped": skipped},
                      handle, indent=2, ensure_ascii=False)
        print("Manifest written to %s" % args.manifest)

    _print_report(institution, eligible, skipped, written, args.execute)
    return 0


if __name__ == "__main__":
    sys.exit(main())
