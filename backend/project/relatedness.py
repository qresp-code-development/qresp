"""Deterministic relatedness scoring for Related Research.

This module is PURE: no database, no network, no clock, no environment, no
language model. It takes plain dictionaries in and returns evidence out, so
every threshold below is unit-testable in isolation (see
`tests/test_relatedness.py`).

Why it exists
-------------
"Semantic Scholar returned it" and "same journal, same year" are not reasons.
A recommendation is only shown when Qresp can NAME the overlap it found in the
two records' own scientific metadata. Everything the user reads under
"Why related" is generated here, from the evidence that actually fired -- no
sentence is written by a model, and no DOI, paper title or material name is
hardcoded anywhere in this file.

The gate -- and who it applies to
---------------------------------
A candidate PASSES if it has

  * at least one STRONG piece of evidence, or
  * at least two MEDIUM pieces of evidence from INDEPENDENT families.

"Independent" means different signal families (terms / text / methods /
citation): two mediums derived from the same overlap are one observation, not
two. Every one of those families is about SUBJECT MATTER.

The gate is a FILTER only for **Related Qresp Records** (`rank()`, below): a
candidate that does not pass is dropped, and at most MAX_RESULTS (3) of the
ones that do are shown, never padded to reach it.

**Recommended External Papers does not use the gate as a filter at all.**
Semantic Scholar supplies the candidate list; `rerank_external()` computes the
exact same `assess()` verdict for every candidate, but only to ORDER them --
`assessment.passes` is carried on the result for diagnostics and is never
read to decide whether a candidate is returned. A candidate with weak or even
zero evidence can still appear, usually near the tail of the (at most 25)
results, because Semantic Scholar proposed it and nothing here removes a
proposal for lacking Qresp's evidence. See `related.py` for where the two
policies split.

Deliberately NOT read at all
----------------------------
AUTHORS and COLLECTIONS. They are metadata a record carries and a reader is
shown; they take no part in the gate, the score, the reasons, the order or
the tie-break, and `build_internal_profile` does not read `collections` at
all. Removing every author from both records, or replacing them with
strangers, cannot change which candidates come back or the order they come in
-- `tests/test_relatedness_neutrality.py` asserts exactly that. Authors
survive on the Profile for ONE purpose: `related._result` renders them beside
the recommendation.

Deliberately NOT evidence, alone or together
--------------------------------------------
Same journal, adjacent publication years, a single broad field, generic words
("study", "data", "analysis", "simulation"), and the provider's own ranking.
None of them produce an Evidence object at all, so none of them can push a
candidate through the gate.

Specificity comes from the Qresp corpus itself: a term that appears in a large
share of the corpus is a field label, not a fingerprint, and is weighted (and
gated) accordingly.
"""
import hashlib
import json
import math
import re
from collections import Counter

# ---------------------------------------------------------------- vocabulary

# Ordinary English function words. Removed before anything is measured.
STOPWORDS = frozenset("""
a about above after again against all also am an and any are as at be because
been before being below between both but by can cannot could did do does
doing down during each few for from further had has have having he her here
hers herself him himself his how however i if in into is it its itself me more
most much must my myself no nor not of off on once only or other ought our
ours ourselves out over own same she should so some such than that the their
theirs them themselves then there these they this those through to too under
until up very was we were what when where which while who whom why with would
you your yours yourself yourselves via can't don't within upon whereas thus
hence therefore among across per towards toward given onto whose
""".split())

# Words that are true of almost every scientific record and therefore cannot
# distinguish one from another. They are never counted as a specific research
# term, no matter how rare the corpus makes them look. The first four are
# named in the product requirement; the rest are the same kind of word.
GENERIC_TERMS = frozenset("""
study studies data analysis analyses simulation simulations result results
method methods methodology approach approaches paper papers article research
researches work works investigation investigations experiment experiments
experimental theoretical computational numerical calculation calculations
model models modeling modelling framework frameworks technique techniques
new novel recent present presented show shown shows report reported using use
used useful important significant various different several many high low
large small value values case cases set sets number numbers type types kind
figure figure1 table section supporting information dataset datasets script
scripts software tool tools code codes file files version versions readme
project projects sample samples system systems process processes property
properties effect effects behavior behaviour performance
compute computed computes computing calculate calculated calculates
determine determined determines obtain obtained observe observed observation
observations measure measured measurement measurements predict predicted
prediction predictions characterize characterized characterization reveal
revealed reveals describe described compare compared comparison comparisons
investigate investigated examine examined propose proposed demonstrate
demonstrated develop developed apply applied application applications
provide provided perform performed consider considered include included
allow allows enable enables find finds obtained combined based
""".split())

# Ordinary English, academic boilerplate and web/file vocabulary that a SMALL
# corpus can make look rare. This list is the answer to a specific failure: on
# a 65-record server, `python`, `http`, `user`, `another`, `related`,
# `discussed`, `play`, `will`, `proper`, `class`, `comparing`, `particular`,
# `region` and `yield` were all being reported to readers as "specific
# research terms", because document frequency was the only thing deciding.
#
# Nothing here is domain vocabulary: no material, method, facility, element or
# field name appears, and none may ever be added. These are words that are
# equally at home in any paper on any subject, which is exactly why sharing
# one says nothing about two records being related.
NON_TECHNICAL_TERMS = frozenset("""
another other others related relating relate relates discussed discuss
discusses discussion discussions mentioned mentioning note noted notes
particular particularly especially specifically respectively additionally
furthermore moreover overall generally typically usually often sometimes
always never likely unlikely possible possibly probable probably able unable
will shall may might would could should must can play plays played playing
role roles proper properly appropriate suitable reasonable relevant
comparing compares comparable similar similarly different differently
region regions area areas position positions place places part parts side
yield yields yielded give gives given giving take takes taken taking
make makes made making get gets got put puts keep keeps hold holds
class classes group groups kind kinds sort sorts form forms level levels
range ranges scale scales amount amounts quantity quantities degree degrees
first second third last next previous following above below here there
main major minor primary secondary basic simple complex complicated
good better best bad worse worst great greater greatest less least more
increase increases increased increasing decrease decreases decreased
change changes changed changing remain remains remained
account accounts including included follow follows followed
finding findings indicate indicates indicated highlight highlights
suggest suggests suggested imply implies implied conclude concluded
conclusion conclusions summary abstract introduction discussion references
acknowledgment acknowledgments appendix supplementary supporting
detail details detailed brief briefly full fully partial partially
excellent good accurate accuracy precise precision correct correctness
exact exactly approximate approximately estimate estimated estimation
current currently recently previously earlier later future
python http https www html htm json xml csv txt pdf zip tar gzip
url uri link links website web page pages site sites server servers
user users username password login account folder directory path paths
filename filepath download upload input output config configuration
readme license copyright github gitlab repository repo commit branch
notebook notebooks jupyter script scripts python2 python3 pip conda
condition conditions environment environments situation situations
technology technologies requirement requirements capability capabilities
opportunity opportunities challenge challenges advantage advantages
limitation limitations motivation background consequence consequences
importance presence absence addition description evaluation evaluations
implementation implementations contribution contributions experience
knowledge understanding attention interest community literature
reference references publication publications author authors journal
represent represents representing representative detrimental beneficial
investigating examining exploring assessing addressing enabling
difference differences parameter parameters criterion criteria
formation variation variations selection selection combination
contain contains container relative relatively individual individuals
principal principle principles conventional conventionally extensive
highlighting represented positioned containing
""".split())

# ------------------------------------------------------------- term provenance
#
# WHERE a term came from decides what it is allowed to prove. This is the
# structural answer to a failure that no blocklist could fix: `chalcogenide`
# and `conventional` are both plain lowercase words of eleven-ish letters, and
# nothing about the STRING tells them apart. What tells them apart is that one
# of them is in somebody's title.
SOURCE_TITLE = "title"            # the paper's own title
SOURCE_CURATED = "curated"        # tag, chart property, artifact keyword
SOURCE_ABSTRACT = "abstract"      # the published abstract
SOURCE_PROSE = "prose"            # chart captions, dataset/script/tool readmes
SOURCE_SOFTWARE = "software"      # packageName / programName
SOURCE_METHOD = "method"          # measurement
SOURCE_ORGANIZATION = "organization"   # facilityName and the like

# Sources in which a human DELIBERATELY states what the record is about. A
# title is the most considered sentence a paper has, and a curated tag is
# somebody typing the subject on purpose. Everything else is prose: useful for
# similarity, never proof on its own that a word is subject vocabulary.
DELIBERATE_TOPIC_SOURCES = frozenset((SOURCE_TITLE, SOURCE_CURATED))

# Document furniture. `fig4`, `figure_2`, `table1`, `panel-a`, `Slide 3` are
# about the SHAPE of a document, not its subject, and they used to qualify as
# technical purely because they carry a digit or a hyphen.
_STRUCTURAL_TOKEN_RE = re.compile(
    r"^(?:fig|figs|figure|figures|tab|table|tables|panel|panels|page|pages"
    r"|slide|slides|sec|section|sections|eq|eqn|eqns|equation|equations"
    r"|ref|refs|chapter|appendix|supp|supplement|supplementary|note|notes"
    r"|inset|insets|scheme|schemes|movie|video|sheet|col|row|item)"
    r"[-_]?[0-9]*[a-z]?$")

# Organisations. A shared employer is not a shared subject: two groups at the
# same national laboratory study whatever they study. `facilityName` was being
# read as a METHOD, so "argonne national lab" opened the strongest gate there
# is -- "Same method or tool ... on a related topic".
_ORGANIZATION_RE = re.compile(
    r"\b(?:universit\w*|univ|institut\w*|laborator\w*|lab|labs|college"
    r"|department|dept|school|faculty|academy|akademie|foundation|fondation"
    r"|consortium|centre|center|hospital|clinic|museum|observatory"
    r"|administration|agency|ministry|bureau|council|society|association"
    r"|corporation|corp|company|inc|llc|ltd|gmbh|nv|sa|ag|plc"
    r"|argonne|fermilab|brookhaven|oak ridge|los alamos|sandia|lawrence"
    r"|berkeley lab|national lab\w*|national accelerator)\b", re.IGNORECASE)

# General-purpose software: real tools, but ones whose presence says nothing
# about a subject. Kept SHORT and non-domain on purpose -- the structural rule
# is that software is never strong evidence (see `assess`); this list only
# stops the most obviously meaningless names from being NAMED to a reader.
GENERIC_SOFTWARE = frozenset("""
microsoft powerpoint word excel office adobe acrobat illustrator photoshop
matlab mathematica origin igor kaleidagraph gnuplot xmgrace excel2010
python python2 python3 anaconda conda pip jupyter notebook ipython
numpy scipy matplotlib pandas bash shell perl java javascript fortran
git github gitlab docker singularity linux windows macos ubuntu centos
vim emacs vscode texshop latex overleaf zotero mendeley endnote
""".split())

# Ordinary English endings. Stripping them and re-testing against the lists
# above catches the participles and adverbs of ordinary verbs -- `highlighting`
# -> `highlight`, `represented` -> `represent`, `positioned` -> `position` --
# without anybody having to enumerate every inflection of every common word.
# No technical term is lost: real subject vocabulary does not become ordinary
# when you remove `-ing`.
_ORDINARY_SUFFIXES = ("ingly", "edly", "ing", "ed", "ly")

# Tokens shorter than this are noise ("of", "we", "eV" units, indices).
MIN_TOKEN_LENGTH = 3
# A single word must be at least this long to count as a *specific* research
# term. Multi-word keyword phrases are exempt -- "spin coating" is specific
# even though neither half is long.
MIN_SPECIFIC_LENGTH = 4
# There is deliberately NO "a long word is a technical word" rule any more.
#
# It used to be `LONG_TECHNICAL_LENGTH = 9`: a plain lowercase word of nine or
# more letters was treated as subject vocabulary. On the real corpus that
# promoted `represented`, `positioned`, `individual`, `principal`,
# `conventional` and `highlighting` to "specific research terms" and printed
# them to readers as the reason two papers were related.
#
# The rule could not be fixed by tuning the number, because the string itself
# carries no signal: `chalcogenide` (12) and `conventional` (12) are the same
# shape, and both are equally rare on a 65-record server. What separates them
# is not the word, it is WHERE IT CAME FROM -- one of them is in somebody's
# title. That is what `DELIBERATE_TOPIC_SOURCES` and `Profile.term_sources`
# record, and what `pair_specific_terms` now requires.

# ---------------------------------------------------------------- thresholds
#
# Every number here is a judgement call, so each one records what it is for.
# They are module constants (not magic literals) precisely so a domain expert
# can retune them from the QA table without reading the algorithm.

# A term carried by more than this share of the Qresp corpus is a FIELD LABEL
# ("photoemission" in a photoemission-heavy corpus), not a fingerprint. Above
# the line a term still contributes to similarity, but never as "specific".
SPECIFIC_DOCUMENT_FREQUENCY_RATIO = 0.15

# "Several rare, specific shared research terms" -> strong. Two shared rare
# terms happen by coincidence often enough (a shared instrument plus a shared
# element); three distinct ones do not. The weight floor stops three merely
# uncommon terms from clearing a bar meant for genuinely rare ones.
STRONG_SHARED_TERM_COUNT = 3
STRONG_SHARED_TERM_WEIGHT = 4.5

# A shared *explicit keyword* (a curated tag, chart property or artifact
# keyword) is a deliberate statement about the record, so one is enough for a
# medium. A shared word merely pulled out of an abstract is not: a single one
# ("functional", "spectrum") is a coincidence between neighbouring fields, so
# free-text overlap needs at least two before it counts as anything.
MEDIUM_SHARED_TERM_COUNT = 2

# Concepts BOTH titles carry. Two is enough to be strong on its own: a title
# is a deliberate summary, so two independent technical terms appearing in
# both is a much stronger statement than the same pair found in two abstracts.
STRONG_SHARED_TITLE_COUNT = 2

# How many of each list a reader is shown. Three, not five: on a real corpus
# five slots were filled by relaxing what counted as evidence, and the fifth
# was routinely the least convincing. The lists are capped AFTER the gate and
# the sort, never padded to reach this number.
MAX_RESULTS = 3

# IDF-weighted cosine over title+abstract (+ artifact descriptions). At or
# above this, the two abstracts are describing the same system or the same
# measurement, and that is strong evidence on its own.
#
# There is no second, lower bar any more. A `MODERATE_TEXT_SIMILARITY` of 0.16
# used to mean "plausibly adjacent", and existed to corroborate two things
# that are no longer evidence: a shared research area, and a shared tool on a
# related topic. Both were removed when the gate was tightened, and the
# constant went with them rather than sitting unused for a later change to
# reach for.
HIGH_TEXT_SIMILARITY = 0.34

# Evidence strengths.
STRONG = "strong"
MEDIUM = "medium"

# Independent signal families. Two mediums must come from two of these, and
# every one of them is about SUBJECT MATTER.
FAMILY_CITATION = "citation"
FAMILY_TERMS = "terms"
FAMILY_TEXT = "text"
FAMILY_METHODS = "methods"
# There is deliberately no author family. Authors are display metadata: they
# take no part in the gate, the score, the evidence, the order or the
# tie-break, so there is no family for them to belong to. See the note in
# `assess` for the history.

# Display order when trimming to the three reasons the UI shows.
FAMILY_PRIORITY = (FAMILY_CITATION, FAMILY_TERMS, FAMILY_METHODS,
                   FAMILY_TEXT)

STRENGTH_WEIGHT = {STRONG: 3.0, MEDIUM: 1.0}

# How many shared terms to name in a reason sentence before "and N more".
MAX_TERMS_IN_REASON = 3

_WORD_RE = re.compile(r"[a-z0-9]+(?:[-'][a-z0-9]+)*")
_NUMERIC_RE = re.compile(r"^[0-9]+$")

# What a technical token LOOKS like, in any field, before it is lowercased:
# an acronym (DFT, GW, MBPT, WEST), a formula or named method carrying a digit
# (G0W0, BiVO4, C60), or an internal capital (BiVO4, NaCl, TiO2).
#
# This is how a SHORT real term gets in without a domain dictionary. It reads
# the author's own typography rather than guessing at meaning.
_SURFACE_TECHNICAL_RE = re.compile(
    r"\b(?:[A-Z]{2,}[A-Za-z0-9]*"          # DFT, MBPT, WEST
    r"|[A-Za-z]+[0-9]+[A-Za-z0-9]*"        # G0W0, C60, BiVO4
    r"|[A-Z][a-z]*[A-Z][A-Za-z0-9]*)\b")   # NaCl, BiVO4


# ------------------------------------------------------------- normalization

def normalize_text(value):
    """Lowercase, unify separators, collapse whitespace."""
    text = str(value or "").lower()
    text = re.sub(r"[‐-―−]", "-", text)
    text = re.sub(r"[^a-z0-9\-'\s]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _singular(token):
    """Very conservative plural folding, so 'nanowires' meets 'nanowire'.
    Deliberately not a stemmer: aggressive stemming merges distinct terms."""
    if len(token) > 4 and token.endswith("s") and not token.endswith(
            ("ss", "us", "is", "as", "os")):
        return token[:-1]
    return token


def _fold_variants(words):
    """Add the singular-folded spelling of every listed word.

    `tokenize` folds plurals before anything else sees a token, so a blocklist
    entry written in the plural would never match: "technologies" arrives as
    "technologie". Folding the lists themselves means an entry can be written
    either way and still work, instead of the list silently having a hole.
    """
    folded = set(words)
    folded.update(_singular(word) for word in words)
    return frozenset(folded)


STOPWORDS = _fold_variants(STOPWORDS)
GENERIC_TERMS = _fold_variants(GENERIC_TERMS)
NON_TECHNICAL_TERMS = _fold_variants(NON_TECHNICAL_TERMS)


def tokenize(value):
    """Content tokens of a free-text field, stopwords and numbers removed."""
    tokens = []
    for match in _WORD_RE.finditer(normalize_text(value)):
        token = match.group(0).strip("-'")
        if len(token) < MIN_TOKEN_LENGTH or _NUMERIC_RE.match(token):
            continue
        if token in STOPWORDS:
            continue
        token = _singular(token)
        if len(token) < MIN_TOKEN_LENGTH or token in STOPWORDS:
            continue
        tokens.append(token)
    return tokens


def normalize_phrase(value):
    """A keyword/tool name as one comparable term ('Spin Coating' ->
    'spin coating'). Stopword-only or empty phrases return ''."""
    tokens = tokenize(value)
    return " ".join(tokens)


def _in_ordinary_lists(term):
    return (term in STOPWORDS or term in GENERIC_TERMS
            or term in NON_TECHNICAL_TERMS)


def is_ordinary(term):
    """Is this a word any paper on any subject could use?

    The lists are checked against the word AND against its stem, so an
    inflection nobody thought to list (`highlighting`, `represented`,
    `positioned`, `relatively`) is caught by the entry that is already there
    (`highlight`, `represent`, `position`, `relative`). Growing the lists one
    participle at a time is how they got long and still had holes.
    """
    if not term:
        return True
    if " " in term:
        return all(_in_ordinary_lists(part) for part in term.split())
    if _in_ordinary_lists(term):
        return True
    for suffix in _ORDINARY_SUFFIXES:
        if len(term) > len(suffix) + 2 and term.endswith(suffix):
            stem = term[: -len(suffix)]
            for candidate in (stem, stem + "e", stem.rstrip("aeiou")):
                if len(candidate) > 2 and _in_ordinary_lists(candidate):
                    return True
    return False


def is_structural(term):
    """Document furniture: fig4, figure_2, table1, panel-a, slide 3.

    A digit or a hyphen is what makes `g0w0` and `bethe-salpeter` technical,
    and it is exactly what made these qualify too. They are ruled out by NAME
    rather than by shape, so the shape rule stays available to real terms.
    """
    if not term:
        return False
    for part in term.split():
        if _STRUCTURAL_TOKEN_RE.match(part):
            return True
    return False


def is_organizational(value):
    """A university, laboratory, institute, agency or company name.

    Never a subject. Two groups at the same national laboratory study whatever
    they study, so a shared employer must not reach the gate, the score, or a
    reason sentence.
    """
    return bool(_ORGANIZATION_RE.search(str(value or "")))


def is_generic_software(term):
    """Software whose presence says nothing about a subject."""
    if not term:
        return False
    parts = term.split()
    return bool(parts) and all(part in GENERIC_SOFTWARE for part in parts)


def has_technical_shape(term):
    """Could this term identify a SUBJECT judged from the string alone?

    The shapes a person coins vocabulary in, none of them domain-specific: a
    multi-word phrase with a non-ordinary part, a digit inside the token
    (`g0w0`, `c60`, `bivo4`), or an internal hyphen (`bethe-salpeter`).

    A plain lowercase word has NO shape that proves anything, which is why
    there is no length rule here any more. Such a word can still be subject
    vocabulary -- it just has to be sourced from a title or a curated tag
    instead of asserted from its spelling.
    """
    if not term or is_ordinary(term) or is_structural(term):
        return False
    if " " in term:
        return any(not is_ordinary(part) for part in term.split())
    if not any(character.isalpha() for character in term):
        return False
    return any(character.isdigit() for character in term) or "-" in term


def is_intrinsically_technical(term):
    """Backwards-compatible name for the SHAPE test.

    Kept because callers and tests use it. It no longer answers the whole
    question: a term also qualifies by PROVENANCE (see `pair_specific_terms`),
    which is the half that a string cannot express.
    """
    return has_technical_shape(term)


def surface_technical_terms(value):
    """Normalized tokens that were written as an acronym, a formula or a
    mixed-case name in the ORIGINAL text."""
    found = set()
    for match in _SURFACE_TECHNICAL_RE.finditer(str(value or "")):
        for token in tokenize(match.group(0)):
            if not is_ordinary(token):
                found.add(token)
    return found


def normalize_doi(value):
    """Comparable DOI form: no scheme, no doi: prefix, lowercased."""
    doi = str(value or "").strip()
    doi = re.sub(r"^https?://(dx\.)?doi\.org/", "", doi, flags=re.IGNORECASE)
    doi = re.sub(r"^doi:\s*", "", doi, flags=re.IGNORECASE)
    return doi.strip().strip(".,;").lower()


def normalize_title_key(value):
    """Order-insensitive comparable form of a title, for de-duplication."""
    return " ".join(sorted(set(tokenize(value))))


# ------------------------------------------------------------------ profiles

class Profile(object):
    """Everything relatedness is allowed to look at, for one paper.

    Only public scientific metadata reaches this object. There is deliberately
    no field for owner/editor/account data, RCC URLs, file paths, file
    contents, drafts or session state -- they are not read into a Profile, so
    they cannot be scored, cached, or sent anywhere.
    """

    __slots__ = ("key", "title", "doi", "year", "authors", "url", "source",
                 "text_counts", "keyword_terms", "method_terms", "title_key",
                 "surface_terms", "title_terms", "term_sources",
                 "software_terms", "organization_terms", "provider_rank")

    def __init__(self, key, title="", doi="", year=None, authors=(), url="",
                 source="internal", provider_rank=None):
        self.key = key
        # 0-based position in the PROVIDER's own answer. None for every
        # internal profile -- this server never asks anybody to rank its own
        # corpus. For an external profile it is the tie-break
        # `rerank_external()` falls back to when two candidates score
        # identically; it is never itself a component of the score, and
        # `assess()` never reads it.
        self.provider_rank = provider_rank
        self.title = title or ""
        self.doi = normalize_doi(doi)
        self.year = year
        self.authors = list(authors or [])
        self.url = url or ""
        self.source = source
        self.text_counts = Counter()
        self.keyword_terms = set()
        self.method_terms = set()
        # term -> the set of SOURCE_* it was seen in. This is the record of
        # where a word came from, and it is what decides whether the word is
        # allowed to be called a research term at all.
        self.term_sources = {}
        # Tool/package names. Bounded to MEDIUM evidence for ever: running the
        # same program is a lab habit, not a shared subject.
        self.software_terms = set()
        # Universities, laboratories, agencies. Recorded ONLY so they can be
        # excluded -- nothing reads this for scoring.
        self.organization_terms = set()
        # Tokens the author wrote as an acronym, a formula or a mixed-case
        # name. Kept apart from text_counts because case is destroyed by
        # normalization, and it is the only evidence that a SHORT token is
        # technical rather than ordinary.
        self.surface_terms = set()
        # Terms from the title specifically. A title is the most deliberate
        # sentence in a record, so an overlap there is worth more than the
        # same overlap buried in an abstract.
        self.title_terms = set()
        self.title_key = normalize_title_key(self.title)

    def _note(self, term, source):
        if term:
            self.term_sources.setdefault(term, set()).add(source)

    def add_text(self, value, weight=1, is_title=False,
                 source=SOURCE_ABSTRACT):
        # Ordinary words are dropped HERE rather than only at the specificity
        # check, so they cannot inflate text similarity either. Two abstracts
        # that share nothing but "study", "data", "analysis", "particular" and
        # "discussed" must measure as unrelated, not as a strong match.
        #
        # Structural tokens (`fig4`, `table1`) go the same way, and for the
        # same reason: they are furniture, and two papers both having a
        # Figure 4 is not a relationship.
        if is_organizational(value):
            # An organisation line contributes NOTHING -- not a term, not a
            # similarity token. Tokenizing it would leak "wisconsin" and
            # "argonne" into the text bag, where they would be rare and
            # therefore heavily weighted.
            for token in tokenize(value):
                self.organization_terms.add(token)
            return
        if is_title:
            source = SOURCE_TITLE
        self.surface_terms |= surface_technical_terms(value)
        for token in tokenize(value):
            if is_ordinary(token) or is_structural(token):
                continue
            self.text_counts[token] += weight
            self._note(token, source)
            if is_title:
                self.title_terms.add(token)

    def add_keyword(self, value):
        """A curated tag, chart property or artifact keyword: somebody typing
        the subject on purpose."""
        phrase = normalize_phrase(value)
        if not phrase or is_structural(phrase) or is_organizational(value):
            return
        self.keyword_terms.add(phrase)
        self._note(phrase, SOURCE_CURATED)
        self.add_text(value, source=SOURCE_CURATED)

    def add_software(self, value):
        """A package or program name. Never strong evidence."""
        phrase = normalize_phrase(value)
        if not phrase or is_organizational(value):
            return
        self.software_terms.add(phrase)
        self.method_terms.add(phrase)
        self._note(phrase, SOURCE_SOFTWARE)
        self.add_text(value, source=SOURCE_SOFTWARE)

    def add_method(self, value):
        """A measurement or technique. Never strong evidence either -- see the
        methods branch of `assess`."""
        phrase = normalize_phrase(value)
        if not phrase or is_structural(phrase) or is_organizational(value):
            return
        self.method_terms.add(phrase)
        self._note(phrase, SOURCE_METHOD)
        self.add_text(value, source=SOURCE_METHOD)

    def add_organization(self, value):
        """A facility, university or laboratory name. Recorded and then
        ignored: it is read only so that it is visibly NOT scored."""
        for token in tokenize(value):
            self.organization_terms.add(token)

    def sources_of(self, term):
        return self.term_sources.get(term, frozenset())

    @property
    def deliberate_terms(self):
        """Terms this record puts forward as its subject ON PURPOSE -- in its
        title, or in a curated tag/property/keyword."""
        return {term for term, sources in self.term_sources.items()
                if sources & DELIBERATE_TOPIC_SOURCES}

    @property
    def all_terms(self):
        terms = set(self.text_counts)
        terms |= self.keyword_terms
        terms |= self.method_terms
        return terms

    @property
    def technical_terms(self):
        """The terms of this record that could identify a SUBJECT.

        Two ways in, and neither is "this word is long":

          * SHAPE -- a formula, a hyphenated coinage, or a token the author
            wrote as an acronym/mixed-case name (`DFT`, `BiVO4`);
          * PROVENANCE -- the record's own title, or a curated tag, chart
            property or artifact keyword.

        A word that appears only in abstract or readme PROSE is deliberately
        absent. It still counts toward text similarity; it is simply not
        allowed to be named to a reader as a specific research term, because
        nothing distinguishes it from `conventional`.
        """
        terms = {t for t in self.all_terms if has_technical_shape(t)}
        terms |= {t for t in self.surface_terms
                  if not is_ordinary(t) and not is_structural(t)}
        for term in self.deliberate_terms:
            if is_ordinary(term) or is_structural(term):
                continue
            if term in self.organization_terms:
                continue
            if " " in term or len(term) >= MIN_SPECIFIC_LENGTH:
                terms.add(term)
        return {t for t in terms if t not in self.organization_terms}


def _people(entries):
    """['{firstName,middleName,lastName}'|'name'|'plain string'] -> names."""
    names = []
    for entry in entries or []:
        if isinstance(entry, dict):
            name = " ".join(str(entry.get(part) or "").strip()
                            for part in ("firstName", "middleName",
                                         "lastName")).strip()
            if not name:
                name = str(entry.get("name") or "").strip()
        else:
            name = str(entry or "").strip()
        name = re.sub(r"\s+", " ", name)
        if name:
            names.append(name)
    return names


def build_internal_profile(record):
    """Profile of a stored Qresp record, from its published scientific
    metadata only.

    `record` is a plain dict (``Paper.to_mongo().to_dict()`` shaped). Read,
    and this list is exhaustive:

      * `reference.title` and `reference.publishedAbstract`;
      * `tags`;
      * `charts[].caption` and `charts[].properties`;
      * `datasets[].readme` / `keywords` and `scripts[].readme` / `keywords`;
      * `tools[].packageName` / `programName` (software), `measurement`
        (technique) and `facilityName` (recorded ONLY so that organisations
        can be excluded -- it never becomes a term).

    `reference.authors` is copied onto the Profile WITHOUT being scored, for
    the single purpose of rendering the names beside a recommendation
    (`related._result`). Nothing reads them afterwards.

    `collections` is NOT read. A collection is the programme a record belongs
    to, which large parts of a corpus share; it decided nothing once the
    quality gate was tightened, so it is no longer looked at.

    Never read: info.serverPath / fileServerPath / folderAbsolutePath /
    downloadPath / notebookPath (RCC URLs and file paths), any file listing or
    file content, owner_email / editor_emails / insertedBy / edit_history
    (account data), drafts, or activation bookkeeping.
    """
    reference = record.get("reference") or {}
    year = reference.get("year")
    try:
        year = int(year) if year is not None else None
    except (TypeError, ValueError):
        year = None

    profile = Profile(
        key=str(record.get("_id") or record.get("id") or ""),
        title=str(reference.get("title") or "").strip(),
        doi=reference.get("DOI") or "",
        year=year,
        authors=_people(reference.get("authors")),
        source="internal",
    )
    # The title carries more signal per word than the abstract does.
    profile.add_text(profile.title, weight=2, is_title=True)
    profile.add_text(reference.get("publishedAbstract"))

    for tag in record.get("tags") or []:
        profile.add_keyword(tag)
    # `collections` is deliberately NOT read. A collection is the programme a
    # record belongs to, which large parts of a corpus share; it decided
    # nothing after the quality rework, and reading it only invited a future
    # change to make it decide something.

    for chart in record.get("charts") or []:
        chart = chart or {}
        profile.add_text(chart.get("caption"), source=SOURCE_PROSE)
        for prop in chart.get("properties") or []:
            profile.add_keyword(prop)

    for artifacts in (record.get("datasets"), record.get("scripts")):
        for artifact in artifacts or []:
            artifact = artifact or {}
            profile.add_text(artifact.get("readme"), source=SOURCE_PROSE)
            for keyword in artifact.get("keywords") or []:
                profile.add_keyword(keyword)

    for tool in record.get("tools") or []:
        tool = tool or {}
        # Package/program names are SOFTWARE: capped at medium evidence.
        for field in ("packageName", "programName"):
            profile.add_software(tool.get(field))
        # A measurement is a genuine technique, still capped at medium.
        profile.add_method(tool.get("measurement"))
        # A facility name is an ORGANISATION. It is read only to be excluded:
        # "Argonne National Lab" used to arrive as a method term and open the
        # strongest gate there is.
        for field in ("facilityname", "facilityName"):
            profile.add_organization(tool.get(field))
        profile.add_text(tool.get("readme"), source=SOURCE_PROSE)

    return profile


# Bumped whenever the ALLOWLIST below changes -- in either direction. A
# deployment that starts reading a new field must invalidate answers computed
# without it, and one that stops reading a field must not go on comparing new
# digests against old ones that can never match.
FINGERPRINT_VERSION = "3"


def _artifact_fingerprint(artifacts, keys):
    return [[_text(artifact, key) for key in keys]
            for artifact in (artifacts or []) if isinstance(artifact, dict)]


def _text(source, key):
    value = (source or {}).get(key)
    if isinstance(value, (list, tuple)):
        return [str(item) for item in value]
    return "" if value is None else str(value)


def metadata_fingerprint(record):
    """A stable digest of exactly the public scientific metadata that decides
    a recommendation.

    This is what lets a cached external answer be thrown away the moment the
    record it describes is edited, without waiting out the TTL and without a
    migration: an entry whose fingerprint does not match (or which predates
    the field entirely) is simply a miss.

    The allowlist is the same set `build_internal_profile` reads, so the two
    cannot drift apart silently. RAW values are hashed, not normalized ones:
    the question is "did the curator change this record", not "did the change
    survive tokenization".

    AUTHORS and COLLECTIONS are deliberately absent, and their absence is the
    point. Neither reaches the gate, the score, the reasons or the order --
    `build_internal_profile` does not even read `collections` -- so hashing
    them threw away a cached provider answer, and paid for a fresh Semantic
    Scholar request, every time somebody corrected the spelling of a name or
    filed a record under a second programme. A cache key must track what can
    change the answer, and nothing else.

    A FACILITY name is still hashed even though it never becomes a term: it
    decides which terms are excluded as organisational, so editing one can
    change an answer.

    Also deliberately NOT included -- and therefore unable to invalidate a
    cache entry or to appear in one: owner_email, editor_emails, edit_history,
    info.insertedBy (curator name/email/affiliation), any RCC URL or file
    path (serverPath, fileServerPath, folderAbsolutePath, downloadPath,
    notebookPath), any `files` list or file content, drafts, sessions, CSRF
    tokens, and activation/audit bookkeeping.
    """
    record = record or {}
    reference = record.get("reference") or {}
    payload = [
        FINGERPRINT_VERSION,
        _text(reference, "DOI"),
        _text(reference, "title"),
        _text(reference, "publishedAbstract"),
        [str(tag) for tag in (record.get("tags") or [])],
        _artifact_fingerprint(record.get("charts"),
                              ("caption", "properties")),
        _artifact_fingerprint(record.get("datasets"), ("readme", "keywords")),
        _artifact_fingerprint(record.get("scripts"), ("readme", "keywords")),
        _artifact_fingerprint(record.get("tools"),
                              ("packageName", "programName", "facilityname",
                               "facilityName", "measurement", "readme")),
    ]
    encoded = json.dumps(payload, ensure_ascii=False,
                         separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def build_external_profile(paper):
    """Profile of one external provider result.

    `paper` is the provider's already-normalized dict: title, abstract, year,
    authors (names), doi, url, fields (broad research areas). Nothing else
    from the provider payload is read -- ranking position included.
    """
    profile = Profile(
        key=str(paper.get("key") or paper.get("doi") or paper.get("title")
                or ""),
        title=str(paper.get("title") or "").strip(),
        doi=paper.get("doi") or "",
        year=paper.get("year"),
        authors=paper.get("authors") or [],
        url=paper.get("url") or "",
        source="external",
        provider_rank=paper.get("provider_rank"),
    )
    profile.add_text(profile.title, weight=2, is_title=True)
    profile.add_text(paper.get("abstract"))
    # The provider's broad `fields` are read no further than this: they are
    # the external equivalent of a collection, and equally undecisive.
    return profile


# -------------------------------------------------------------------- corpus

class CorpusStats(object):
    """Document frequencies over the Qresp corpus.

    This is what makes a shared term mean something: rarity is measured
    against the records this server actually holds, so no vocabulary, field,
    material or method is hardcoded.
    """

    def __init__(self, profiles):
        profiles = list(profiles)
        self.document_count = len(profiles)
        self.document_frequency = Counter()
        for profile in profiles:
            for term in profile.all_terms:
                self.document_frequency[term] += 1

    def idf(self, term):
        """Smoothed inverse document frequency; unseen terms score highest
        without dividing by zero, and a one-record corpus stays finite."""
        df = self.document_frequency.get(term, 0)
        return math.log((self.document_count + 1.0) / (df + 1.0)) + 1.0

    def is_rare_enough(self, term):
        """Is this term still a fingerprint on THIS corpus, or has it become a
        field label? Rarity is necessary, never sufficient."""
        # Floor of 2, not 1: a term carried by exactly the two records being
        # compared and nobody else is the *most* specific overlap there is.
        # A ratio-only ceiling would rule it out on any corpus smaller than
        # ~14 records, which is every new Qresp instance.
        ceiling = max(2.0,
                      SPECIFIC_DOCUMENT_FREQUENCY_RATIO * self.document_count)
        return self.document_frequency.get(term, 0) <= ceiling

    def pair_specific_terms(self, left, right):
        """The shared terms that may be NAMED as research terms for this pair.

        Specificity is decided per PAIR, not per record, because the deciding
        fact is provenance and provenance is asymmetric: a word can be in one
        paper's title and the other's abstract. That is the "clear technical
        concept confirmed between a title and an abstract" case, and judging
        each record alone would throw it away.

        A shared term qualifies when it is
          * not ordinary, not document furniture, not an organisation name;
          * still rare on this corpus; and
          * either technically SHAPED, or stated deliberately (title/curated)
            by at least one of the two records.

        The last clause is the whole fix. `conventional` and `chalcogenide`
        are the same shape and the same rarity; only one of them is ever in
        somebody's title.
        """
        shared = (left.all_terms & right.all_terms)
        qualified = set()
        for term in shared:
            if is_ordinary(term) or is_structural(term):
                continue
            if term in left.organization_terms or term in right.organization_terms:
                continue
            # Sharing PowerPoint, Python or Git is a fact about two laptops.
            # Excluded here rather than only at naming time, so it cannot pad
            # the count that STRONG_SHARED_TERM_COUNT measures either.
            if is_generic_software(term):
                continue
            if not self.is_rare_enough(term):
                continue
            if has_technical_shape(term):
                qualified.add(term)
            elif term in left.deliberate_terms or term in right.deliberate_terms:
                qualified.add(term)
        return qualified

    def is_specific(self, term):
        """A term precise enough to justify a recommendation on its own merit,
        judged from the STRING and the corpus only.

        Kept for callers that have no pair in hand. It is now the conservative
        half of the test: shape plus rarity. Provenance -- the half a string
        cannot express -- is applied by `pair_specific_terms`.
        """
        if not has_technical_shape(term):
            return False
        return self.is_rare_enough(term)

    def specific_terms(self, profile):
        """The subject vocabulary of one record, as this corpus sees it."""
        return {t for t in profile.technical_terms
                if not is_ordinary(t) and not is_structural(t)
                and t not in profile.organization_terms
                and self.is_rare_enough(t)}

    def similarity(self, left, right):
        """IDF-weighted cosine over the two text bags. 0.0 when either side
        has no usable text."""
        if not left.text_counts or not right.text_counts:
            return 0.0
        shared = set(left.text_counts) & set(right.text_counts)
        if not shared:
            return 0.0
        dot = sum(left.text_counts[t] * right.text_counts[t] * (self.idf(t) ** 2)
                  for t in shared)
        left_norm = math.sqrt(sum((c * self.idf(t)) ** 2
                                  for t, c in left.text_counts.items()))
        right_norm = math.sqrt(sum((c * self.idf(t)) ** 2
                                   for t, c in right.text_counts.items()))
        if not left_norm or not right_norm:
            return 0.0
        return dot / (left_norm * right_norm)


# ------------------------------------------------------------------ evidence

class Evidence(object):
    """One named, grounded observation. `text` is what the user reads under
    "Why related"; it is assembled from the overlap that fired, never written
    by a model."""

    __slots__ = ("family", "strength", "text")

    def __init__(self, family, strength, text):
        self.family = family
        self.strength = strength
        self.text = text

    def as_dict(self):
        return {"family": self.family, "strength": self.strength,
                "text": self.text}

    def __repr__(self):  # pragma: no cover - debugging aid
        return "Evidence(%s, %s, %r)" % (self.family, self.strength, self.text)


class Assessment(object):
    """Verdict for one candidate."""

    __slots__ = ("passes", "score", "evidence", "similarity",
                 "shared_terms", "shared_weight")

    def __init__(self, passes, score, evidence, similarity, shared_terms,
                 shared_weight=0.0):
        self.passes = passes
        self.score = score
        self.evidence = evidence
        self.similarity = similarity
        self.shared_terms = shared_terms
        # Combined IDF of the shared specific terms. Carried so a verdict can
        # be EXPLAINED (how far short of the strong bar was it?) without
        # anything having to recompute -- and therefore risk disagreeing with
        # -- the gate.
        self.shared_weight = shared_weight

    def reasons(self, limit=3):
        """The (at most) `limit` strongest reasons, strongest family first."""
        ordered = sorted(
            self.evidence,
            key=lambda e: (0 if e.strength == STRONG else 1,
                           FAMILY_PRIORITY.index(e.family)
                           if e.family in FAMILY_PRIORITY else len(FAMILY_PRIORITY)))
        return [e.text for e in ordered[:limit]]


def independent_terms(terms):
    """Collapse a shared overlap to its INDEPENDENT observations.

    One shared two-word keyword arrives as three matching terms -- the phrase
    and each of its words -- which would let a single tag clear a bar meant
    for several unrelated ones. A word that only appears because a shared
    phrase contains it is therefore not counted again on its own.
    """
    covered = set()
    for term in terms:
        if " " in term:
            covered |= set(term.split())
    return {t for t in terms if " " in t or t not in covered}


def _term_list(terms, stats):
    """Rarest first, capped, rendered for a reason sentence.

    Equally rare terms are broken by length: on a small corpus every shared
    term has the same document frequency, and "photoemission" tells the
    reader far more about the overlap than "body" (the tail of "many body")
    does.
    """
    ordered = sorted(terms, key=lambda t: (-stats.idf(t), -len(t), t))
    shown = ordered[:MAX_TERMS_IN_REASON]
    text = ", ".join(shown)
    remaining = len(ordered) - len(shown)
    if remaining > 0:
        text += " and %d more" % remaining
    return text


def assess(current, candidate, stats, citation_dois=frozenset()):
    """Evidence and verdict for one (current paper, candidate) pair.

    `citation_dois` is the set of normalized DOIs the current paper is known
    to cite. It is optional: when no citation source is available it is empty
    and no citation evidence can fire -- it is never inferred.
    """
    evidence = []

    # Specificity is decided for the PAIR, so a term stated deliberately by
    # either side counts for both. See `CorpusStats.pair_specific_terms`.
    shared_specific = independent_terms(
        stats.pair_specific_terms(current, candidate))
    current_specific = shared_specific
    candidate_specific = shared_specific
    shared_weight = sum(stats.idf(t) for t in shared_specific)
    similarity = stats.similarity(current, candidate)
    # Curated overlap is filtered through the SAME specific-term test as free
    # text, so a tag can never smuggle in an ordinary word that prose could
    # not. Short curated terms still qualify -- a tag is a deliberate
    # statement, which is why `Profile.technical_terms` admits them.
    # Tool overlap has its OWN admission test, not the topic one. A package
    # name is usually a plain word (`rarepackage`, `pycce`), so requiring it
    # to look like subject vocabulary would silence tool evidence entirely --
    # and tool evidence is still worth a medium once a topic corroborates it.
    # What it must NOT be: an organisation, document furniture, generic
    # tooling, or a word so common on this corpus that everybody shares it.
    shared_methods = {
        t for t in current.method_terms & candidate.method_terms
        if not is_ordinary(t) and not is_structural(t)
        and not is_generic_software(t)
        and t not in current.organization_terms
        and t not in candidate.organization_terms
        and stats.is_rare_enough(t)}
    shared_keywords = {t for t in current.keyword_terms & candidate.keyword_terms
                       if t in current_specific and t in candidate_specific}
    # Concepts both records put in their TITLE. A title is the most deliberate
    # sentence a record has, so an overlap there is a much stronger statement
    # than the same overlap buried in an abstract.
    shared_titles = independent_terms(
        {t for t in shared_specific
         if t in current.title_terms and t in candidate.title_terms})
    # Shared terms that BOTH records state on purpose (title or curated tag).
    # This is what a STRONG term verdict requires: an overlap found only in
    # two abstracts is prose agreement, and prose agreement is a medium.
    shared_deliberate = independent_terms(
        {t for t in shared_specific
         if t in current.deliberate_terms and t in candidate.deliberate_terms})
    # Software both records name. Capped at MEDIUM for ever, and generic
    # tooling is not even named -- sharing PowerPoint or Python is a fact
    # about a laptop.
    shared_software = {t for t in current.software_terms & candidate.software_terms
                       if t in shared_methods}

    # -- strong ------------------------------------------------------------
    if candidate.doi and candidate.doi in citation_dois:
        evidence.append(Evidence(
            FAMILY_CITATION, STRONG,
            "Directly cited by this paper"))

    # STRONG by terms now requires a DELIBERATE anchor: at least one of the
    # shared terms has to be in both records' titles or curated tags. Three
    # words that co-occur in two abstracts are a coincidence between
    # neighbouring fields; three words two authors both chose to put in their
    # titles are a subject.
    if (len(shared_specific) >= STRONG_SHARED_TERM_COUNT
            and shared_weight >= STRONG_SHARED_TERM_WEIGHT
            and shared_deliberate):
        evidence.append(Evidence(
            FAMILY_TERMS, STRONG,
            "Shares %d specific research terms: %s"
            % (len(shared_specific), _term_list(shared_specific, stats))))

    if similarity >= HIGH_TEXT_SIMILARITY:
        evidence.append(Evidence(
            FAMILY_TEXT, STRONG,
            "High title and abstract similarity (%.2f)" % similarity))

    # NOTE: there is deliberately NO strong method evidence any more.
    #
    # "Same method or tool (...) on a related topic" was the strongest gate
    # there is, and `facilityName` reached it: "argonne national lab" and
    # "university wisconsin-madison" were being read as methods and printed to
    # readers as the reason two papers were related. Facilities are now
    # excluded entirely (`add_organization`) and software is capped at medium
    # (below), so running the same program can corroborate a subject overlap
    # but can never establish one.

    if len(shared_titles) >= STRONG_SHARED_TITLE_COUNT:
        evidence.append(Evidence(
            FAMILY_TERMS, STRONG,
            "Both titles are about %s"
            % _term_list(shared_titles, stats)))

    # -- medium ------------------------------------------------------------
    if shared_keywords:
        evidence.append(Evidence(
            FAMILY_TERMS, MEDIUM,
            "Shared specific keywords: %s"
            % _term_list(shared_keywords, stats)))
    elif len(shared_specific) >= MEDIUM_SHARED_TERM_COUNT:
        evidence.append(Evidence(
            FAMILY_TERMS, MEDIUM,
            "Shares %d specific research terms: %s"
            % (len(shared_specific), _term_list(shared_specific, stats))))

    # NOTE: there is deliberately NO author evidence, and no author
    # arithmetic of any kind.
    #
    # A shared author says who did the work, not what it was about. On a real
    # server one PI co-authors half the corpus, so "shared author" fired
    # almost everywhere and, paired with any second weak signal, pushed
    # unrelated subjects through the gate. It was then kept as a tie-break,
    # which was the same problem one step later: the gate was topic-only but
    # the ORDER was not, so a common supervisor still decided which three a
    # reader saw. Nothing in this module reads an author now.

    # NOTE: a shared COLLECTION is deliberately not evidence, and is not even
    # read. "Same research area (MICCOM)" says two records live in the same
    # programme, which is true of large parts of a corpus; paired with any one
    # other weak signal it was opening the gate.

    if shared_methods or shared_software:
        # A shared technique or program, and never more than a medium: it
        # needs an independent topic anchor from another family before the
        # gate opens, which is exactly what "two mediums from two families"
        # already means.
        named = shared_methods | shared_software
        evidence.append(Evidence(
            FAMILY_METHODS, MEDIUM,
            "Shared specific tool or technique (%s)"
            % _term_list(named, stats)))

    # One observation per family: the same overlap must not be counted twice.
    strongest = {}
    for item in evidence:
        held = strongest.get(item.family)
        if held is None or (held.strength == MEDIUM and item.strength == STRONG):
            strongest[item.family] = item
    evidence = [strongest[f] for f in FAMILY_PRIORITY if f in strongest]

    # The gate is TOPIC-ONLY. Every family that can contribute is a statement
    # about subject matter; there is no family here that a person's name can
    # reach, so removing every author from both records cannot change this
    # verdict. `test_relatedness_quality.py` asserts exactly that.
    strong_count = sum(1 for e in evidence if e.strength == STRONG)
    medium_families = {e.family for e in evidence if e.strength == MEDIUM}
    passes = strong_count >= 1 or len(medium_families) >= 2

    score = sum(STRENGTH_WEIGHT[e.strength] for e in evidence)
    score += similarity
    score += min(shared_weight, 10.0) / 10.0

    return Assessment(passes, round(score, 6), evidence, similarity,
                      sorted(shared_specific), shared_weight)


def rank(current, candidates, stats, citation_dois=frozenset(),
         limit=MAX_RESULTS):
    """Assess every candidate, drop the ones that fail the gate, and return
    at most `limit` of them as (profile, assessment), best first.

    Order of operations, and it matters: **gate, then sort, then cut**. The
    cut is the last thing that happens, so a short list -- including an empty
    one -- is what a reader gets when nothing else clears the bar. Nothing
    here relaxes the gate to reach `limit`.

    Ties are broken by the newer paper and then by the title. Both are
    properties of the WORK: no author, no collection and no provider ranking
    is consulted here, or anywhere else in this module.
    """
    scored = []
    for candidate in candidates:
        if not candidate.title:
            continue
        assessment = assess(current, candidate, stats, citation_dois)
        if not assessment.passes:
            continue
        scored.append((candidate, assessment))
    # Sorted on SUBJECT only. A shared-author count used to break ties here,
    # which meant a supervisor or a common PI could lift an unrelated paper
    # into the three slots a reader actually sees -- the gate was topic-only,
    # but the ranking was not, so authorship still decided what got shown.
    # Ties fall to the newer paper and then to the title, both properties of
    # the work.
    scored.sort(key=lambda pair: (-pair[1].score,
                                  -(pair[0].year or 0),
                                  pair[0].title.lower()))
    return scored[:limit]


def rerank_external(current, candidates, stats, citation_dois=frozenset(),
                    limit=None):
    """Score every candidate and order them -- WITHOUT the gate.

    This is `rank()`'s twin for **Recommended External Papers**, and the two
    must never be merged: `rank()` drops a candidate that fails `assess()`;
    this function drops nothing. Every candidate Semantic Scholar proposed
    (after de-duplication, upstream of this call) is assessed, and the
    ordering is:

        Qresp's deterministic score, descending
        provider_rank, ascending  -- the ONLY tie-break

    `assessment.passes` is computed exactly as it is for Related Qresp
    Records -- the evidence rule is not weakened or strengthened here -- but
    it is carried on the result purely as a diagnostic (`gate_decision` in the
    evaluator, `qresp_match` if a caller wants it); nothing in this function
    reads it to decide whether a candidate is returned.

    A candidate missing a title is still dropped: that is a data-quality
    floor (`rank()` applies the same one), not a relatedness judgement.

    `limit=None` returns every scored candidate, in order, so a caller can
    report how many there were before its own cap is applied -- exactly the
    convention `rank()` and `external_recommendations()` already use.
    """
    scored = []
    for candidate in candidates:
        if not candidate.title:
            continue
        assessment = assess(current, candidate, stats, citation_dois)
        scored.append((candidate, assessment))
    # Ties are near-guaranteed here (many candidates score 0.0 -- no shared
    # evidence at all), which is exactly why the provider's own order is the
    # tie-break rather than year/title as `rank()` uses: those would impose an
    # opinion neither Qresp nor Semantic Scholar actually holds, where falling
    # back to "the order the provider judged these in" does not.
    missing_rank = len(scored) + 1
    scored.sort(key=lambda pair: (
        -pair[1].score,
        pair[0].provider_rank if pair[0].provider_rank is not None
        else missing_rank))
    if limit is None:
        return scored
    return scored[:limit]
