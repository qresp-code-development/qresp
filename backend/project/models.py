from mongoengine import *


class Person(DynamicEmbeddedDocument):
    """ Class mapping creators,PIs,authors of paper to mongo database

    Nothing a curator types is required to publish (schema.json), so a
    person may be stored with only part of a name.
    """
    firstName = StringField(max_length=50)
    middleName = StringField(max_length=50)
    lastName = StringField(max_length=50)
    emailId = StringField(max_length=100)
    affiliation = StringField(max_length=100)


class Info(DynamicEmbeddedDocument):
    """ Class mapping Info section of paper to mongo database
    """
    timeStamp = StringField()
    notebookPath = StringField()
    serverPath = StringField()
    notebookFile = StringField()
    insertedBy = EmbeddedDocumentField(Person)
    downloadPath = StringField()
    fileServerPath = StringField()
    isPublic = BooleanField()
    folderAbsolutePath = StringField()
    doi = StringField()
    meta = {'strict': False}


class ExtraFields(DynamicEmbeddedDocument):
    """ Extra fields
    """
    extrakey = StringField()
    extravalue = StringField()


class Charts(DynamicEmbeddedDocument):
    """ Class mapping Charts section of paper to mongo database
    """
    caption = StringField()
    id = StringField(required=True)
    # Optional, like everything a curator types: a figure may be published
    # before its image path or keywords are filled in.
    imageFile = StringField()
    files = ListField()
    number = StringField()
    properties = ListField()
    extraFields = ListField()
    saveas = StringField()
    meta = {'strict': False}


class Tools(DynamicEmbeddedDocument):
    """ Class mapping Tools section of paper to mongo database
    """
    id = StringField()
    kind = StringField()
    packageName = StringField()
    version = StringField()
    programName = StringField()
    files = ListField()
    readme = StringField()
    facilityname = StringField()
    measurement = StringField()
    URLs = ListField()
    extraFields = ListField()
    saveas = StringField()
    meta = {'strict': False}


class Datasets(DynamicEmbeddedDocument):
    """ Class mapping Datasets section of paper to mongo database
    """
    id = StringField()
    files = ListField()
    readme = StringField()
    # Descriptive tags for this artifact. A SEPARATE field from URLs, which
    # holds links: the two were conflated in the curator form for a long time
    # and must never share storage. Optional and absent-safe, so every record
    # written before it existed loads as an empty list with no migration.
    keywords = ListField()
    URLs = ListField()
    extraFields = ListField()
    saveas = StringField()
    meta = {'strict': False}


class Scripts(DynamicEmbeddedDocument):
    """ Class mapping Datasets section of paper to mongo database
    """
    id = StringField()
    files = ListField()
    readme = StringField()
    # Descriptive tags for this artifact. A SEPARATE field from URLs, which
    # holds links: the two were conflated in the curator form for a long time
    # and must never share storage. Optional and absent-safe, so every record
    # written before it existed loads as an empty list with no migration.
    keywords = ListField()
    URLs = ListField()
    extraFields = ListField()
    saveas = StringField()
    meta = {'strict': False}


class Journal(DynamicEmbeddedDocument):
    """ Class mapping Journal section of reference to mongo database
    """
    abbrevName = StringField()
    fullName = StringField()


class Reference(DynamicEmbeddedDocument):
    """ Class mapping Reference section of paper to mongo database
    """
    DOI = StringField()
    authors = ListField(EmbeddedDocumentField(Person))
    journal = EmbeddedDocumentField(Journal)
    kind = StringField()
    page = StringField()
    publishedAbstract = StringField()
    title = StringField()
    volume = StringField()
    year = DecimalField()
    meta = {'strict': False,
            'indexes': [
                {'title', 'unique'},
                'publishedAbstract'
            ]}


class Documentation(DynamicEmbeddedDocument):
    """ Class mapping Datasets section of paper to mongo database
    """
    readme = StringField()
    meta = {'strict': False}


class Heads(DynamicEmbeddedDocument):
    """ Class mapping Heads section of paper to mongo database

    An "external node" in the workflow: a reference to data that lives
    outside this paper. Deliberately NOT a Dataset -- Qresp does not hold the
    files, cannot check them, and must not present one as if it did.
    """
    # A short name for the node, so a graph can be read without expanding
    # every description. Optional: records written before V1 have none, and
    # the UI falls back to the description rather than inventing a label.
    label = StringField(max_length=200)
    readme = StringField()
    files = ListField()
    URLs = ListField()
    id = StringField()
    saveas = StringField()
    meta = {'strict': False}


class Workflow(DynamicEmbeddedDocument):
    """ Class mapping Workflow section of paper to mongo database
    """
    # Edges hold BOTH shapes, which is why this is an untyped ListField and
    # not ListField(ListField()):
    #
    #   {"from": "s0", "to": "c0", "type": "generates"}   Workflow V1
    #   ["s0", "c0"]                                      every earlier record
    #
    # The typed form says what a connection MEANS; the pair form says only
    # that somebody drew a line. Legacy pairs are read, stored and rendered
    # exactly as they are -- nothing infers a type for one, because guessing
    # what an old curator intended is not something this code can do
    # honestly. `project/workflow.py` validates whichever shape arrives.
    edges = ListField()
    nodes = ListField()
    meta = {'strict': False}


class FilterQuerySet(QuerySet):
    """ Class to filter query on mongo database
    """

    def get_unique_values(self, field):
        """ fetches list of unique collections , journal names
        :param field: field to filter on in database
        :return: list of field values
        """
        unique_values = {
            str(v).lower(): v for v in self.distinct(field=field)}.values()
        return unique_values

    def get_unique_names(self, field):
        """ Fetches list of unique names
        :param field: str: filters on name
        :return: list : full names
        """
        unique_values = {str(v.firstName.lower()) + " " + str(v.lastName.lower()): v.firstName + " " + v.lastName for v
                         in self.distinct(field=field)}.values()
        return unique_values


# Kinds of work a record can curate. "paper" is a published paper -- every
# record from before this list existed.
WORK_TYPES = ("paper", "report", "software", "dataset", "other")


class Paper(Document):
    """ Class to filter query on mongo database
    """
    version = LongField()
    PIs = ListField(EmbeddedDocumentField(Person))
    info = EmbeddedDocumentField(Info)
    charts = ListField(EmbeddedDocumentField(Charts))
    datasets = ListField(EmbeddedDocumentField(Datasets))
    tools = ListField(EmbeddedDocumentField(Tools))
    scripts = ListField(EmbeddedDocumentField(Scripts))
    reference = EmbeddedDocumentField(Reference)
    heads = ListField(EmbeddedDocumentField(Heads))
    workflow = EmbeddedDocumentField(Workflow)
    documentation = EmbeddedDocumentField(Documentation)
    # Optional: mongoengine refuses an EMPTY list for a required ListField,
    # which used to make collections and keywords mandatory by accident.
    collections = ListField()
    schema = StringField(required=True)
    tags = ListField()
    # The institution associated with this RECORD, as typed by the curator --
    # e.g. "University of Chicago". Optional, and deliberately never derived:
    # not from an author's name or affiliation, not from `collections`, not
    # from the server's own hostname, not from an email domain, not from a
    # DOI. A record with several authors from several institutions is not a
    # claim that all of them belong to this one; it identifies the record,
    # not every person listed on it. Absent on every record published before
    # this field existed => no institution badge is shown, and nothing here
    # needs a migration to make that true.
    institution = StringField(max_length=200)
    versions = ListField()
    license = StringField(default="cc_by")
    # Verified identity (session email) of the account that published this
    # record; stamped at publish time (project/auth.py stamp_owner). Absent on
    # legacy records => "ownerless": readable by all, editable only by admins.
    # Distinct from info.insertedBy.emailId, which is curator-DECLARED, not
    # verified.
    owner_email = StringField(max_length=254)
    # Additional verified emails allowed to EDIT this record (not manage it:
    # deactivation, owner assignment and this list itself stay owner/admin
    # only). Absent on legacy records => no editors. Managed exclusively via
    # PUT /api/paper/{id}/editors; normalized lowercase there.
    editor_emails = ListField(StringField(max_length=254))
    # Soft-deactivation flag. Absent on legacy records => active; only an
    # explicit False hides a record from public search/explorer/detail. Owner
    # or admin can toggle it (project.api.set_paper_active). Preferred over
    # physical delete so published records are preserved and reversible.
    is_active = BooleanField(default=True)
    # What is being curated: a published paper, an unpublished paper or
    # report, a code repository, a dataset, or something else. Absent on
    # records published before the field existed => a published paper
    # (see work_type_of). Only a published paper must name a journal, volume
    # and page and have a figure (schema.json's work_type rules).
    work_type = StringField(choices=WORK_TYPES)
    # Private visibility. Absent on legacy records => public. A private
    # record never appears on public discovery surfaces (search, explorer,
    # related research, keyword vocabulary) and its detail/workflow pages are
    # readable only by the owner, editors, the accounts in viewer_emails, and
    # admins. Toggled via PUT /api/paper/{id}/visibility (owner/admin only).
    is_private = BooleanField(default=False)
    # Verified emails a private record is shared with for READ access only.
    # Managed exclusively via PUT /api/paper/{id}/viewers; normalized
    # lowercase there. Ignored while the record is public.
    viewer_emails = ListField(StringField(max_length=254))
    # Minimal audit trail, stamped server-side on every successful mutation
    # (edit / assign_owner / update_editors / deactivate / reactivate).
    # Absent on legacy records. edit_history entries are
    # {email, action, timestamp(iso)} dicts appended chronologically.
    updated_at = DateTimeField()
    updated_by_email = StringField(max_length=254)
    edit_history = ListField(DictField())
    meta = {'strict': False,
            'queryset_class': FilterQuerySet
            }


class ExternalIdentity(Document):
    """Durable account identity asserted by an external identity provider
    (Microsoft Entra work/school accounts, Google).

    Keyed by the IMMUTABLE OIDC pair issuer+subject — never by email, which
    institutions can change or reassign. The asserted email/name are stored
    for display and for the CURRENT email-based ownership/admin checks; the
    future ownership migration (owner_account_id) will reference this
    document's id instead. No provider tokens are ever stored here.
    """
    issuer = StringField(required=True)
    subject = StringField(required=True)
    # 'microsoft' | 'google'. Rows written by the retired CILogon broker
    # ('cilogon') may still exist and are simply left unused — nothing reads
    # them and no migration is performed.
    provider = StringField(required=True)
    email = StringField(max_length=254)    # normalized asserted email
    name = StringField()
    idp_name = StringField()               # e.g. the university name, if asserted
    created_at = DateTimeField()
    last_login_at = DateTimeField()
    meta = {
        'collection': 'external_identities',
        'indexes': [
            {'fields': ['issuer', 'subject'], 'unique': True},
            'email',
        ],
    }


class LocalAccount(Document):
    """Email/password account created directly on Qresp.

    The password is stored only as a Werkzeug-PBKDF2 hash; plaintext is never
    persisted. Email is the linking key — a LocalAccount and an
    ExternalIdentity with the same email share the same ownership records.
    """
    email = StringField(required=True, unique=True, max_length=254)
    password_hash = StringField(required=True)
    name = StringField(max_length=200, default="")
    created_at = DateTimeField()
    last_login_at = DateTimeField()
    # Email is the ownership key, so an account cannot sign in until the
    # address is proven by the emailed link. Accounts created before this
    # field existed load as unverified and get a link on their next sign-in.
    email_verified = BooleanField(default=False)
    # SHA-256 of the outstanding confirmation token (the token itself is only
    # ever in the email), and when it was sent (expiry + resend throttle).
    verify_token_hash = StringField()
    verify_sent_at = DateTimeField()
    meta = {
        'collection': 'local_accounts',
        'indexes': [{'fields': ['email'], 'unique': True}],
        # Some staging documents still carry profile fields that now live on
        # UserProfile; ignore them instead of failing to load the account.
        'strict': False,
    }


class UserProfile(Document):
    """Optional public profile for any sign-in provider, keyed by the
    lower-cased account email (the same linking key used for ownership).
    Shown on the user's account page and on records they own."""
    email = StringField(required=True, unique=True, max_length=254)
    name = StringField(max_length=200, default="")
    affiliation = StringField(max_length=300, default="")
    bio = StringField(max_length=500, default="")
    orcid_id = StringField(max_length=40, default="")
    google_scholar_url = StringField(max_length=500, default="")
    website_url = StringField(max_length=500, default="")
    avatar_b64 = StringField(default="")  # data:image/... URI
    updated_at = DateTimeField()
    meta = {
        'collection': 'user_profiles',
        'indexes': [{'fields': ['email'], 'unique': True}],
    }


class AssistUsage(Document):
    """Per-user daily counter for AI-assist requests (keyword suggestions).
    Persistent so one account cannot exhaust the provider quota; only the
    session email, day, and a count are stored — never request content."""
    email = StringField(required=True, max_length=254)
    day = StringField(required=True, max_length=10)  # YYYY-MM-DD (UTC)
    count = LongField(default=0)
    meta = {
        'collection': 'assist_usage',
        'indexes': [{'fields': ['email', 'day'], 'unique': True}],
    }


def work_type_of(paper):
    """The record's work type, treating legacy records (no field) and any
    unknown value as a published paper."""
    value = getattr(paper, "work_type", None)
    return value if value in WORK_TYPES else "paper"


def active_papers():
    """Queryset of records visible to the public: legacy records without the
    flags (fields absent) and explicitly active, non-private ones. An explicit
    is_active=False or is_private=True hides a record from public discovery
    surfaces."""
    return Paper.objects(is_active__ne=False, is_private__ne=True)


class RelatedResearchCache(Document):
    """External Related Research results for one record, kept OUT of the
    canonical Paper document.

    Recommendations are a derived, perishable view: pinning them into Paper
    would freeze them at curation time and make a read look like an edit.
    They live here instead, keyed by paper id, with an explicit expiry so a
    later follow-up study can appear on its own.

    Stored: only the provider's public bibliographic metadata for the top
    `EXTERNAL_MAX_RESULTS` candidates Qresp's deterministic score ranked
    highest, plus the reasons Qresp computed for each. NOT "candidates that
    passed Qresp's quality gate" -- the gate no longer decides which external
    candidates are stored or shown (see `related.ALGORITHM_VERSION` and
    `relatedness.rerank_external`); it still runs on every candidate and its
    verdict rides along as a diagnostic, but a candidate with weak or zero
    evidence can be stored here if the provider proposed it and it ranked in
    the top 25. Never stored: the API key, any header, any provider error
    body, any session/user/owner data, any RCC URL or file path, any file
    content. `results` is empty for a `status` other than 'ok'.

    `last_success_at` outlives a failed refresh on purpose: it is what lets a
    stale-but-real answer be served when the provider is unreachable.
    """
    # The record this entry is about, ACROSS servers
    # (project.federation.cache_key). A record on this server keeps its bare
    # id, so every entry written before federation existed is still a hit and
    # no migration is needed; a record read from a federated peer is prefixed
    # with that peer's canonical origin, so two servers that happen to issue
    # the same ObjectId can never serve each other's recommendations.
    paper_id = StringField(required=True, unique=True, max_length=320)
    # SHA-256 of the record's public scientific metadata at the moment these
    # results were computed (project.relatedness.metadata_fingerprint). An
    # entry whose fingerprint no longer matches the record is a MISS whatever
    # its expiry says, so editing a title or an abstract refreshes the answer
    # instead of waiting out the TTL. Absent on entries written before this
    # field existed => also a miss, which is why no migration is needed.
    fingerprint = StringField(max_length=64)
    # Which version of the scoring rules produced `results`. An entry computed
    # under an older algorithm is a MISS whatever its expiry says, so
    # tightening the quality gate immediately stops the weak and empty answers
    # the old gate produced from being served. Absent on entries written
    # before this field existed => also a miss, which is the whole migration.
    algorithm_version = StringField(max_length=16)
    # Why the list is what it is: `ok`, `provider_returned_no_candidates`,
    # `no_valid_candidates_after_dedupe`, `provider_rate_limited`, ... Kept so
    # "the external list is empty" can be diagnosed from the cache without
    # re-asking the provider. A code, never a provider message.
    #
    # `no_valid_candidates_after_dedupe` replaced the old
    # `all_candidates_below_quality_gate`: the evidence gate can no longer
    # empty this list by itself (external results are re-ranked, not
    # gate-filtered -- see related.py), so the only way a non-empty provider
    # answer still yields zero results is that nothing survived normalization
    # and de-duplication. A stored `all_candidates_below_quality_gate` is
    # simply a value from before the algorithm-version bump that invalidated
    # it; nothing here still writes or interprets it as current.
    reason = StringField(max_length=64)
    # Where the provider's candidates went: booleans, a status string and
    # counts, and nothing else -- no title, no abstract, no provider body, no
    # credential. Stored so a cached answer can explain itself exactly as the
    # live one did. Absent on entries written before this field existed, which
    # is why every reader treats it as optional.
    pipeline = DictField()
    # WHICH provider endpoint produced `results`: 'recommendations' (the
    # primary source) or 'citations' (the fallback, used only when
    # recommendations answered with nothing).
    #
    # Stored as a field of its own rather than left inside `pipeline` so the
    # two can never be confused for one another by a reader, a query, or a
    # future refresh: an entry states the source it was built from, and one
    # written before this field existed has none and is a miss anyway, because
    # the algorithm version moved in the same change.
    source_kind = StringField(max_length=32)
    provider = StringField(max_length=64)
    # 'ok' (provider answered), 'unresolved' (this paper could not be
    # identified confidently enough to ask), 'unavailable' (provider failed).
    status = StringField(max_length=32)
    results = ListField(DictField())
    fetched_at = DateTimeField()
    last_success_at = DateTimeField()
    expires_at = DateTimeField()
    meta = {
        'collection': 'related_research_cache',
        'indexes': ['paper_id', 'expires_at'],
    }


class RecommendationFeedback(Document):
    """One reader's 1-5 rating of the Related Research list on one record.

    Kept OUT of the Paper document for the same reason the recommendation
    cache is: an opinion about a derived view is not part of the record, and a
    read must never look like an edit.

    WHAT IS AND IS NOT STORED
    -------------------------
    Stored: the rating, the optional reason codes and free-text comment, which
    record and which list was being rated, and the minimum context an analysis
    needs -- how many results were on screen, which page the reader was on
    when they submitted, and how many pages they had looked at.

    NEVER stored: the IP address, the user agent, any request header, the
    recommendation scores or gate reasons the reader was shown, the titles or
    DOIs of the recommended papers, or anything from a third-party analytics
    SDK (there is none on this path).

    `respondent` is a KEYED HASH of the durable ACCOUNT identifier, never an
    address and never a session. It exists only so a person can change their
    mind -- the same reader rating the same list twice updates one row instead
    of voting twice -- and it is derived through `feedback.respondent_key`,
    which is an HMAC under the deployment's secret. Nothing can read an
    account or an email back out of it, and no endpoint ever returns it.

    Rating requires an account. Keyed on anything a reader can reset, "one
    opinion per reader" is not true, and there is no way to key an anonymous
    reader durably without collecting something this feature has no business
    collecting.
    """
    # Record + source server, namespaced exactly as RelatedResearchCache is
    # (project.federation.cache_key), so the same 24-hex id on two Qresp
    # servers can never pool its ratings.
    paper_id = StringField(required=True, max_length=320)
    # How the respondent was identified. Only 'account' is ever written now.
    #
    # Rating was briefly open to anonymous readers, keyed by a per-session
    # token -- which a reader could reset at will, so those rows were never
    # one-per-person. They are left in place rather than deleted, and the
    # summary counts only `account` rows: a row with no value here is not
    # part of any number, so the old defect cannot leak into the new figure
    # and nothing has to be migrated.
    respondent_kind = StringField(max_length=32)
    # Which list was rated: 'external' (Semantic Scholar candidates that
    # passed the gate) or 'internal' (Related Qresp Records). Ratings of two
    # different lists are two different measurements and never averaged
    # together.
    source = StringField(required=True, max_length=32)
    respondent = StringField(required=True, max_length=64)
    rating = IntField(required=True, min_value=1, max_value=5)
    # Offered only for a 1 or a 2, and optional even then.
    reasons = ListField(StringField(max_length=64))
    comment = StringField(max_length=1000, default="")
    # Analysis context, counts only.
    results_shown = IntField(min_value=0)
    page_at_submit = IntField(min_value=1)
    pages_viewed = IntField(min_value=0)
    created_at = DateTimeField()
    updated_at = DateTimeField()
    meta = {
        'collection': 'recommendation_feedback',
        'indexes': [
            # The upsert key. One opinion per reader per list per record: a
            # reader who changes 2 to 4 has changed their mind, and counting
            # both would let one person move the average twice.
            {'fields': ['respondent', 'paper_id', 'source'], 'unique': True},
            'paper_id',
        ],
    }


class CuratorDraft(Document):
    """Account-owned curator draft saved explicitly from /curator.

    `state` is the raw serialized curator state and is deliberately NOT
    publish/schema-validated — a draft may be arbitrarily incomplete. Drafts
    are private to their owner (looked up by the verified session email).
    """
    owner_email = StringField(required=True, max_length=254)
    title = StringField(default="")
    state = DictField()
    created_at = DateTimeField()
    updated_at = DateTimeField()
    meta = {
        'collection': 'curator_drafts',
        'indexes': ['owner_email'],
    }


class Favorite(Document):
    """One user's bookmark of one published paper.

    Papers live on remote Qresp servers, so paper_id alone is not enough to
    look up metadata later. server_url records which node owns this paper.
    title/authors/year are cached at favorite-time so the account page can
    render without making cross-server requests.
    """
    owner_email = StringField(required=True, max_length=254)
    paper_id = StringField(required=True, max_length=24)
    server_url = StringField(max_length=500, default="")
    title = StringField(max_length=500, default="")
    authors = StringField(max_length=1000, default="")
    year = IntField()
    created_at = DateTimeField()
    meta = {
        'collection': 'favorites',
        'indexes': [
            {'fields': ['owner_email', 'paper_id'], 'unique': True},
            'owner_email',
        ],
    }
