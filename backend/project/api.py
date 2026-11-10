# Connexion 3 handlers run inside the wrapped Flask app's request context, so
# the canonical Flask request proxy is used here (the old
# `from connexion import request, jsonifier` import is gone in Connexion 3;
# `jsonifier` was never used).
import re
from datetime import datetime

from flask import request
from mongoengine import Q as MongoQ
from mongoengine.errors import DoesNotExist, NotUniqueError, ValidationError as MongoValidationError

from project.auth import (can_edit_paper, can_manage_paper, can_view_paper,
                          csrf_protect, get_current_user, is_admin,
                          paper_role, public_profile, stamp_owner)
from project.models import CuratorDraft, Favorite, RelatedResearchCache
from project.paperdao import *
from project.util import Dtree
from project.workflow import WorkflowError, validate_workflow

from project.controllers.preview import Preview
from project.controllers.publish import Publish

# edit swagger.yml file for method changes


def healthz():
    """Report that the API process is serving requests.

    This deliberately avoids a database read so CI and container orchestration
    can verify the ASGI/API stack without reviving the retired Flask pages.
    """
    return {"status": "ok"}, 200


def search(searchWord=None, paperTitle=None, doi=None, tags=None, collectionList=None, authorsList=None, publicationList=None):
    """
    This function responds to a request for /api/search
    with the complete lists of papers

    :return list allpaperslist: A list of all papers
    """
    allpaperslist = []
    try:
        dao = PaperDAO()
        if tags:
            tags = tags.split(",")
        if collectionList:
            collectionList = collectionList.split(",")
        if authorsList:
            authorsList = authorsList.split(",")
        if publicationList:
            publicationList = publicationList.split(",")
        allpaperslist = dao.getAllFilteredSearchObjects(searchWord=searchWord, paperTitle=paperTitle, doi=doi,
                                                        tags=tags, collectionList=collectionList,
                                                        authorsList=authorsList, publicationList=publicationList)
    except Exception as e:
        msg = "Exception in search api " + str(e)
        print(msg)
        return msg, 400
    return allpaperslist, 200


def collections():
    """
    This function responds to a request for /api/collections
    with the complete lists of c

    :return list allcollectionlist: A list of all collections
    """
    allcollectionlist = []
    try:
        dao = PaperDAO()
        allcollectionlist = dao.getCollectionList()
    except Exception as e:
        msg = "Exception in collections api " + str(e)
        print(msg)
        return msg, 400
    return list(allcollectionlist), 200


def authors():
    """
    This function responds to a request for /api/authors
    with the complete lists of authors

    :return list allauthorlist: A list of all authors
    """
    allauthorlist = []
    try:
        dao = PaperDAO()
        allauthorlist = dao.getAuthorList()
    except Exception as e:
        msg = "Exception in authors api " + str(e)
        print(msg)
        return msg, 400
    return list(allauthorlist), 200


def publications():
    """
    This function responds to a request for /api/publications
    with the complete lists of publications

    :return list allpublist: A list of all publications
    """
    allpublist = []
    try:
        dao = PaperDAO()
        allpublist = dao.getPublicationList()
    except Exception as e:
        msg = "Exception in publications api " + str(e)
        print(msg)
        return msg, 400
    return list(allpublist), 200


def paper(id):
    """
    This function responds to a request for /api/paper/{id}
    with the details of paper given id

    :return object paperdetail: An object of paper with paper contents
    """
    paperdetail = None
    try:
        stored = Paper.objects.get(id=str(id))
    except Exception as e:
        msg = "Exception in paper api " + str(e)
        print(msg)
        return msg, 400

    # Deactivated records are hidden from the public detail view; only the
    # owner, editors or an admin may still load them (to review or
    # reactivate). Private records are additionally readable by the accounts
    # they are shared with. 404 either way, so ids cannot be probed.
    allowed, _ = can_view_paper(stored, get_current_user())
    if not allowed:
        return {"error": "This record is not available."}, 404

    try:
        dao = PaperDAO()
        paperdetail = dao.getPaperDetails(id)
    except Exception as e:
        msg = "Exception in paper api " + str(e)
        print(msg)
        return msg, 400
    return paperdetail, 200


def paper_curator(id):
    """GET /api/paper/{id}/curator — the curator's public account profile.

    The verified owner_email stamped at publish time wins. When there is no
    owner (legacy records, unpublished previews) or the owner has no saved
    profile, the account registered to the record's curator email is used.
    Only public profile fields are returned; never the email.
    """
    sid = str(id)
    if sid.startswith("PREVIEW_"):
        if not re.fullmatch(r"PREVIEW_[0-9a-f]{32}", sid):
            return {"error": "Paper not found."}, 404
        data = Preview().getMetadata(sid)
        if not isinstance(data, dict):
            return {"error": "Paper not found."}, 404
        email = str(data.get("emailId") or "").strip().lower()
        return {"profile": public_profile(email) if email else None}, 200

    try:
        stored = Paper.objects.get(id=sid)
    except Exception:
        return {"error": "Paper not found."}, 404

    allowed, _ = can_view_paper(stored, get_current_user())
    if not allowed:
        return {"error": "This record is not available."}, 404

    owner = (stored.owner_email or "").strip().lower()
    profile = public_profile(owner) if owner else None
    if not profile:
        inserted = getattr(getattr(stored, "info", None), "insertedBy", None)
        declared = str(getattr(inserted, "emailId", "") or "").strip().lower()
        if declared and declared != owner:
            profile = public_profile(declared)
    return {"profile": profile}, 200


def _unviewable_paper_error(id):
    """404 response when the record exists but the session may not read it
    (deactivated or private); None otherwise. A missing record is left to
    the caller's existing error path."""
    stored = Paper.objects(id=str(id)).first() if OBJECT_ID_PATTERN.match(str(id)) else None
    if stored is None:
        return None
    allowed, _ = can_view_paper(stored, get_current_user())
    if not allowed:
        return {"error": "This record is not available."}, 404
    return None


def workflow(id):
    """
    This function responds to a request for /api/workflow/{id}
    with the workflow given id

    :return:        workflow object
    """
    denied = _unviewable_paper_error(id)
    if denied:
        return denied
    workflowdetail = None
    try:
        dao = PaperDAO()
        workflowdetail = dao.getWorkflowDetails(id)
    except Exception as e:
        msg = "Exception in workflow api " + str(e)
        print(msg)
        return msg, 400
    return workflowdetail, 200


def chart(id, cid):
    """
    This function responds to a request for /api/paper/{id}/chart/{cid}
    with the chart given id

    :return:        chart object
    """
    denied = _unviewable_paper_error(id)
    if denied:
        return denied
    chartworkflowdetail = None
    try:
        dao = PaperDAO()
        chartworkflowdetail = dao.getWorkflowForChartDetails(id, cid)
    except Exception as e:
        msg = "Exception in chart api " + str(e)
        print(msg)
        return msg, 400
    return chartworkflowdetail, 200


def dircontents(req):
    """
    This function responds to the request for /api/dircont

    :return: structure object
    """
    link = req['link']
    src = req['src']
    service = req['service']
    services = {}

    try:
        structure = Dtree(link)
        if src == 'http':
            files = structure.fetchForTreeFromHttp()
            if service:
                services = structure.openFileToReadConfigFromHttp('qresp.ini')

        else:
            files = structure.fetchForTreeFromZenodo()
    except Exception as e:
        msg = "Exception in Directory Structure API "+str(e)
        print(msg)
        return msg, 500

    return {"files": files, "services": services}, 200


def generatePreview(paper):
    """
    Generate a preview of the metadata
    Handler for POST: /api/preview 

    :return : ID for the metadata to be previewed
    """
    result = Preview().generateLink(paper)
    if result == 400:
        return "Validation Error, incorrect paper supplied", 400

    if result == 500:
        return "Internal Server Error", 500

    return result, 200


def getPreview(id):
    """
    View the preview of the metadata
    Handler for GET: /api/preview/{id}

    :return: Metadata object using the id provided for the metadata
    """
    result = Preview().getMetadata(id)

    if result == 400:
        return "Preview does not exist, incorrect id", 400

    if result == 500:
        return "Internal Server Error", 500

    return result, 200


@csrf_protect
def publish(paper):
    """
    Validate the paper json and insert it as a new record
    Handler for POST: /api/publish

    :return: {"success": True, "id": <new record id>}
    """
    # Production ownership rule: every NEW record must have a verified owner,
    # so publishing now requires an authenticated session (Google in
    # production; dev-login on staging while its gate is enabled). Anonymous
    # browse/search/view and the non-persisting preview flow stay anonymous.
    user = get_current_user()
    if not user:
        return {"msg": "Authentication is required to publish."}, 401

    # The owner always comes from the SESSION; a client-provided value is
    # discarded before stamping. A graph that cannot be stored is refused
    # here, before anything is written. Legacy shapes and papers with no
    # workflow pass through untouched -- see project/workflow.py.
    try:
        validate_workflow(paper)
    except WorkflowError as e:
        return {"error": str(e)}, 400

    # The curator's email is optional on the form; it then defaults to the
    # signed-in account that is publishing.
    info = paper.setdefault("info", {})
    curator = info.get("insertedBy")
    if not isinstance(curator, dict):
        curator = info["insertedBy"] = {}
    if not str(curator.get("emailId") or "").strip():
        curator["emailId"] = user.get("email") or ""

    paper.pop("owner_email", None)
    stamp_owner(paper)
    # Inserted immediately: the session already proves who is publishing.
    result = Publish().publish(paper)
    if "code" in result:
        return {"msg": result['msg']}, result['code']
    return {"success": True, "id": result["id"]}, 200


def verify(id):
    """
    Add the paper specified by the ID provided from the wait list to the database
    Handler for GET: /api/verify

    Only for verification links emailed before publishing became immediate;
    new publishes never queue.

    :return: Object containing ID for the paper added in it
     Otherwise error,
    """
    result = Publish().verify(id)

    if isinstance(result, str):
        return {"id": result, "error": ""}, 200

    return {"id": '', "error": result['msg']}, result['code']


@csrf_protect
def update_paper(id, paper):
    """
    Update an existing record's metadata
    Handler for PUT: /api/paper/{id}

    Owner/admin only (auth.can_edit_paper). Top-level payload fields are
    merged into the stored document and re-validated by the Paper model;
    server-owned fields can never be changed through the payload.
    """
    user = get_current_user()
    try:
        existing = Paper.objects.get(id=str(id))
    except Exception as e:
        msg = "Exception in update paper api " + str(e)
        print(msg)
        return {"error": "Paper not found"}, 404

    allowed, reason = can_edit_paper(existing, user)
    if not allowed:
        return {"error": reason}, 401 if user is None else 403

    # Server-owned / immutable fields are never taken from the payload.
    # is_active is toggled ONLY through PUT /api/paper/{id}/active,
    # editor_emails ONLY through PUT /api/paper/{id}/editors, and
    # is_private/viewer_emails ONLY through /visibility and /viewers, so a
    # metadata edit can never change activation, sharing, or the audit trail.
    for blocked in ("id", "_id", "owner_email", "version", "versions",
                    "is_active", "editor_emails", "is_private",
                    "viewer_emails", "updated_at",
                    "updated_by_email", "edit_history"):
        paper.pop(blocked, None)

    try:
        data = existing.to_mongo().to_dict()
        data.pop("_id", None)
        data.update(paper)
        # Keep only defined model fields (constructor coercion + validation),
        # and force the verified owner + current activation/editor state from
        # the stored record so editing preserves them.
        data = {k: v for k, v in data.items() if k in Paper._fields}
        # Validated on the MERGED document: a payload may submit a workflow
        # whose artifacts come from the stored record, so neither half is
        # checkable on its own. Only when the PAYLOAD actually carries a
        # workflow -- editing a title must not be refused because a record
        # written years ago holds an edge V1 would not accept today.
        if "workflow" in paper:
            validate_workflow(data)
        data["owner_email"] = existing.owner_email
        data["is_active"] = existing.is_active
        data["editor_emails"] = list(existing.editor_emails or [])
        data["is_private"] = existing.is_private is True
        data["viewer_emails"] = list(existing.viewer_emails or [])
        # Minimal audit trail: who touched the record, when, and how.
        now = datetime.utcnow()
        actor = _session_email(user)
        data["updated_at"] = now
        data["updated_by_email"] = actor
        history = list(existing.edit_history or [])
        history.append(
            {"email": actor, "action": "edit", "timestamp": now.isoformat()})
        data["edit_history"] = history
        updated = Paper(**data)
        updated.id = existing.id
        updated.save()
    except Exception as e:
        msg = "Exception in update paper api " + str(e)
        print(msg)
        return {"error": "Invalid paper payload: " + str(e)}, 400

    return {"id": str(existing.id), "success": True}, 200


@csrf_protect
def set_paper_active(id, body):
    """
    Activate or deactivate (soft delete) a published record
    Handler for PUT: /api/paper/{id}/active

    Owner/admin only (auth.can_manage_paper — editors are edit-only). Writes
    is_active plus the audit fields as an atomic update, so legacy documents
    that would fail full model validation are untouched. Deactivation is
    reversible and preserves the record.
    """
    user = get_current_user()
    try:
        existing = Paper.objects.get(id=str(id))
    except Exception as e:
        msg = "Exception in set paper active api " + str(e)
        print(msg)
        return {"error": "Paper not found"}, 404

    allowed, reason = can_manage_paper(existing, user)
    if not allowed:
        return {"error": reason}, 401 if user is None else 403

    active = (body or {}).get("active")
    if not isinstance(active, bool):
        return {"error": "active must be a boolean (true to reactivate, false to deactivate)"}, 400

    Paper.objects(id=existing.id).update(
        set__is_active=active,
        **_audit_update_kwargs(user, "reactivate" if active else "deactivate")
    )
    return {"id": str(existing.id), "is_active": active, "success": True}, 200


@csrf_protect
def delete_paper(id):
    """
    Permanently delete a published record
    Handler for DELETE: /api/paper/{id}

    Owner/admin only (auth.can_manage_paper -- the same rule as deactivate;
    editors are edit-only). Unlike deactivation this cannot be undone. The
    record's favorites and cached related-research results go with it, so
    nothing is left pointing at an id that no longer resolves. Recommendation
    feedback is kept: it is an evaluation signal, not part of the record.
    """
    user = get_current_user()
    try:
        existing = Paper.objects.get(id=str(id))
    except Exception as e:
        msg = "Exception in delete paper api " + str(e)
        print(msg)
        return {"error": "Paper not found"}, 404

    allowed, reason = can_manage_paper(existing, user)
    if not allowed:
        return {"error": reason}, 401 if user is None else 403

    paper_id = str(existing.id)
    Paper.objects(id=existing.id).delete()
    Favorite.objects(paper_id=paper_id).delete()
    RelatedResearchCache.objects(paper_id=paper_id).delete()
    print("Paper {} deleted by {} ({})".format(
        paper_id, (user or {}).get("email", ""), reason))
    return {"id": paper_id, "deleted": True, "success": True}, 200


@csrf_protect
def set_paper_editors(id, body):
    """
    Replace the record's editor list
    Handler for PUT: /api/paper/{id}/editors

    Owner/admin only (auth.can_manage_paper). Editors gain EDIT access only —
    they cannot deactivate the record, assign owners, or change this list.
    Emails are normalized (trimmed, lowercased) and deduplicated; the write is
    atomic so legacy documents are never re-validated wholesale.
    """
    user = get_current_user()
    try:
        existing = Paper.objects.get(id=str(id))
    except Exception as e:
        msg = "Exception in set paper editors api " + str(e)
        print(msg)
        return {"error": "Paper not found"}, 404

    allowed, reason = can_manage_paper(existing, user)
    if not allowed:
        return {"error": reason}, 401 if user is None else 403

    editors, error = _normalized_email_list(
        (body or {}).get("editor_emails"), "editor")
    if error:
        return {"error": error}, 400

    Paper.objects(id=existing.id).update(
        set__editor_emails=editors,
        **_audit_update_kwargs(user, "update_editors")
    )
    return {"id": str(existing.id), "editor_emails": editors,
            "success": True}, 200


def _normalized_email_list(raw, kind):
    """Trim, lowercase, validate and deduplicate a submitted email list.
    Returns (emails, None) or (None, error message)."""
    if not isinstance(raw, list):
        return None, "%s_emails must be a list of email addresses" % kind
    emails = []
    for item in raw:
        email = str(item or "").strip().lower()
        if not email:
            continue
        if not EMAIL_PATTERN.match(email):
            return None, "invalid %s email: %s" % (kind, email)
        if email not in emails:
            emails.append(email)
    return emails, None


@csrf_protect
def set_paper_visibility(id, body):
    """
    Make a record private or public
    Handler for PUT: /api/paper/{id}/visibility

    Owner/admin only (auth.can_manage_paper). A private record is hidden from
    every public discovery surface and readable only by the owner, editors,
    admins and the accounts in viewer_emails. Optionally replaces
    viewer_emails and/or editor_emails in the same atomic write, so the Share
    dialog saves visibility and every collaborator's role at once. An email
    in both lists is an editor (editing includes viewing); the owner's own
    email is dropped from both. Making a record public keeps the viewer list,
    so switching back to private restores the same sharing.
    """
    user = get_current_user()
    try:
        existing = Paper.objects.get(id=str(id))
    except Exception as e:
        msg = "Exception in set paper visibility api " + str(e)
        print(msg)
        return {"error": "Paper not found"}, 404

    allowed, reason = can_manage_paper(existing, user)
    if not allowed:
        return {"error": reason}, 401 if user is None else 403

    private = (body or {}).get("is_private")
    if not isinstance(private, bool):
        return {"error": "is_private must be a boolean"}, 400

    body = body or {}
    owner = (existing.owner_email or "").strip().lower()
    editors = list(existing.editor_emails or [])
    if "editor_emails" in body:
        editors, error = _normalized_email_list(body["editor_emails"], "editor")
        if error:
            return {"error": error}, 400
    viewers = list(existing.viewer_emails or [])
    if "viewer_emails" in body:
        viewers, error = _normalized_email_list(body["viewer_emails"], "viewer")
        if error:
            return {"error": error}, 400
    editors = [e for e in editors if e != owner]
    viewers = [e for e in viewers if e != owner and e not in editors]

    update = {"set__is_private": private}
    if "editor_emails" in body:
        update["set__editor_emails"] = editors
    if "viewer_emails" in body or "editor_emails" in body:
        update["set__viewer_emails"] = viewers

    Paper.objects(id=existing.id).update(
        **update,
        **_audit_update_kwargs(user, "make_private" if private else "make_public")
    )
    return {"id": str(existing.id), "is_private": private,
            "viewer_emails": viewers, "editor_emails": editors,
            "success": True}, 200


@csrf_protect
def set_paper_viewers(id, body):
    """
    Replace the list of accounts a private record is shared with
    Handler for PUT: /api/paper/{id}/viewers

    Owner/admin only (auth.can_manage_paper). Viewers get READ access to the
    record while it is private -- no editing, no management. Emails are
    normalized and deduplicated; the write is atomic.
    """
    user = get_current_user()
    try:
        existing = Paper.objects.get(id=str(id))
    except Exception as e:
        msg = "Exception in set paper viewers api " + str(e)
        print(msg)
        return {"error": "Paper not found"}, 404

    allowed, reason = can_manage_paper(existing, user)
    if not allowed:
        return {"error": reason}, 401 if user is None else 403

    viewers, error = _normalized_email_list(
        (body or {}).get("viewer_emails"), "viewer")
    if error:
        return {"error": error}, 400

    Paper.objects(id=existing.id).update(
        set__viewer_emails=viewers,
        **_audit_update_kwargs(user, "update_viewers")
    )
    return {"id": str(existing.id), "viewer_emails": viewers,
            "success": True}, 200


def raw_paper(id):
    """
    Return the stored record document for editing in the curator
    Handler for GET: /api/paper/{id}/raw

    Owner/admin only (same gate as updates) -- this is the edit flow's data
    source. The public, display-shaped read stays GET /api/paper/{id}.
    Server-owned fields are stripped from the response.
    """
    user = get_current_user()
    try:
        existing = Paper.objects.get(id=str(id))
    except Exception as e:
        msg = "Exception in raw paper api " + str(e)
        print(msg)
        return {"error": "Paper not found"}, 404

    allowed, reason = can_edit_paper(existing, user)
    if not allowed:
        return {"error": reason}, 401 if user is None else 403

    data = existing.to_mongo().to_dict()
    data.pop("_id", None)
    data.pop("owner_email", None)
    return {"id": str(existing.id), "paper": data}, 200


def _paper_summary(paper):
    """Compact record listing entry shared by the admin ownerless inventory
    and the account page."""
    reference = getattr(paper, "reference", None)
    authors = []
    if reference is not None and reference.authors:
        for author in reference.authors:
            name = "%s %s" % (author.firstName or "", author.lastName or "")
            authors.append(name.strip())
    year = None
    if reference is not None and reference.year:
        try:
            year = int(reference.year)
        except (TypeError, ValueError):
            year = None
    return {
        "id": str(paper.id),
        "title": reference.title if reference is not None else "",
        "owner_email": paper.owner_email or None,
        "authors": ", ".join(authors),
        "year": year,
        "tags": list(paper.tags or []),
        "collections": list(paper.collections or []),
        "is_active": paper.is_active is not False,
        "editor_emails": list(paper.editor_emails or []),
        "is_private": paper.is_private is True,
        "viewer_emails": list(paper.viewer_emails or []),
        "updated_at": paper.updated_at.isoformat() if paper.updated_at else None,
        "updated_by_email": paper.updated_by_email or None,
    }


def _session_email(user):
    return ((user or {}).get("email") or "").strip().lower()


def _audit_update_kwargs(user, action):
    """Atomic-update kwargs stamping the minimal audit trail on a mutation.
    Used with Paper.objects(...).update(...) so legacy documents that would
    fail full model validation are never re-saved wholesale."""
    now = datetime.utcnow()
    email = _session_email(user)
    return {
        "set__updated_at": now,
        "set__updated_by_email": email,
        "push__edit_history": {
            "email": email,
            "action": action,
            "timestamp": now.isoformat(),
        },
    }


def account_papers():
    """
    List records owned by the current session user
    Handler for GET: /api/account/papers

    Powers the /account page. Anonymous requests get 401; admins see only
    THEIR OWN records here (the ownerless inventory is a separate admin
    endpoint). Lists records the user OWNS, records where they are a listed
    editor, and private records shared with them (viewer), with the role
    marked per record. Viewers never see the editor/viewer lists, and a
    record shared with them only counts while it is private and active.
    """
    user = get_current_user()
    if not user:
        return {"error": "authentication required"}, 401

    email = _session_email(user)
    related = Paper.objects(
        MongoQ(owner_email=email) | MongoQ(editor_emails=email)
        | MongoQ(viewer_emails=email, is_private=True, is_active__ne=False)
    )
    papers = []
    for paper in related:
        summary = _paper_summary(paper)
        if (paper.owner_email or "").strip().lower() == email:
            summary["role"] = "owner"
        elif email in {(e or "").strip().lower()
                       for e in (paper.editor_emails or [])}:
            summary["role"] = "editor"
        else:
            summary["role"] = "viewer"
            summary["editor_emails"] = []
            summary["viewer_emails"] = []
        papers.append(summary)
    return {"papers": papers, "count": len(papers)}, 200


def _draft_display_title(state, given_title):
    """Explicit title if provided, otherwise derived from the draft content."""
    if given_title and str(given_title).strip():
        return str(given_title).strip()
    state = state or {}
    # referenceInfo is the canonical primary-paper bibliography; a short-lived
    # intermediate draft shape stored it under publicationInfo instead.
    reference = state.get("referenceInfo") or {}
    if reference.get("title"):
        return reference["title"]
    publication = state.get("publicationInfo") or {}
    if publication.get("title"):
        return publication["title"]
    paper_info = state.get("paperInfo") or {}
    tags = paper_info.get("tags") or []
    if tags:
        return ", ".join(str(tag) for tag in tags[:5])
    return "Untitled draft"


def _draft_summary(draft):
    return {
        "id": str(draft.id),
        "title": draft.title or "Untitled draft",
        "created_at": draft.created_at.isoformat() if draft.created_at else None,
        "updated_at": draft.updated_at.isoformat() if draft.updated_at else None,
        "owner_email": draft.owner_email,
    }


def _own_draft_or_error(id):
    """Owner-scoped draft lookup. Returns (draft, None) or (None, response)."""
    user = get_current_user()
    if not user:
        return None, ({"error": "authentication required"}, 401)
    email = (user.get("email") or "").strip().lower()
    try:
        draft = CuratorDraft.objects.get(id=str(id))
    except Exception:
        return None, ({"error": "Draft not found"}, 404)
    if (draft.owner_email or "").lower() != email:
        # 404, not 403: draft ids must not be probeable across accounts.
        return None, ({"error": "Draft not found"}, 404)
    return draft, None


def account_drafts():
    """
    List the session user's curator drafts
    Handler for GET: /api/account/drafts
    """
    user = get_current_user()
    if not user:
        return {"error": "authentication required"}, 401
    email = (user.get("email") or "").strip().lower()
    drafts = CuratorDraft.objects(owner_email=email).order_by("-updated_at")
    return {"drafts": [_draft_summary(d) for d in drafts],
            "count": drafts.count()}, 200


@csrf_protect
def create_account_draft(body):
    """
    Save a NEW curator draft for the session user
    Handler for POST: /api/account/drafts

    Accepts arbitrarily incomplete curator state — drafts are never
    publish/schema-validated.
    """
    user = get_current_user()
    if not user:
        return {"error": "authentication required"}, 401
    email = (user.get("email") or "").strip().lower()

    state = (body or {}).get("state") or {}
    if not isinstance(state, dict):
        return {"error": "state must be an object"}, 400
    now = datetime.utcnow()
    draft = CuratorDraft(
        owner_email=email,
        title=_draft_display_title(state, (body or {}).get("title")),
        state=state,
        created_at=now,
        updated_at=now,
    )
    draft.save()
    return _draft_summary(draft), 200


def account_draft(id):
    """
    Return one of the session user's drafts, including its full state
    Handler for GET: /api/account/drafts/{id}
    """
    draft, error = _own_draft_or_error(id)
    if error:
        return error
    summary = _draft_summary(draft)
    summary["state"] = draft.state or {}
    return summary, 200


@csrf_protect
def update_account_draft(id, body):
    """
    Update one of the session user's drafts (title and/or state)
    Handler for PUT: /api/account/drafts/{id}
    """
    draft, error = _own_draft_or_error(id)
    if error:
        return error

    body = body or {}
    if "state" in body:
        if not isinstance(body["state"], dict):
            return {"error": "state must be an object"}, 400
        draft.state = body["state"]
    if "title" in body:
        draft.title = _draft_display_title(draft.state, body["title"])
    elif not draft.title:
        draft.title = _draft_display_title(draft.state, None)
    draft.updated_at = datetime.utcnow()
    draft.save()
    return _draft_summary(draft), 200


@csrf_protect
def delete_account_draft(id):
    """
    Delete one of the session user's drafts
    Handler for DELETE: /api/account/drafts/{id}
    """
    draft, error = _own_draft_or_error(id)
    if error:
        return error
    draft.delete()
    return {"success": True}, 200


def _require_admin():
    """Shared guard for admin-only endpoints. Returns None when the session
    user is an admin, otherwise the (body, status) error response."""
    user = get_current_user()
    if not user:
        return {"error": "authentication required"}, 401
    if not is_admin(user):
        return {"error": "only an admin may perform this action"}, 403
    return None


def admin_papers():
    """
    List ALL published records for admin management
    Handler for GET: /api/admin/papers

    Admin only. Unlike the public search (which hides deactivated records)
    and /account/papers (owner/editor scoped), this returns every stored
    record — active, deactivated, ownerless, and other users' — so admins can
    reassign owners, manage editors, and toggle activation from /account.
    Legacy fields are normalized by _paper_summary (missing is_active =>
    active, missing editor_emails => [], missing owner_email => ownerless).
    """
    denied = _require_admin()
    if denied:
        return denied

    papers = [_paper_summary(paper) for paper in Paper.objects()]
    return {"papers": papers, "count": len(papers)}, 200


def ownerless_papers():
    """
    List legacy records that have no verified owner yet
    Handler for GET: /api/admin/ownerless-papers

    Admin only. Returns a compact list for the assign-owner workflow,
    including the curator-declared insertedBy email as a SUGGESTION (it is
    unverified and must be confirmed by the admin).
    """
    denied = _require_admin()
    if denied:
        return denied

    ownerless = Paper.objects(
        MongoQ(owner_email__exists=False)
        | MongoQ(owner_email=None)
        | MongoQ(owner_email="")
    )

    papers = []
    for paper in ownerless:
        summary = _paper_summary(paper)
        inserted_by = getattr(getattr(paper, "info", None), "insertedBy", None)
        summary["suggested_owner_email"] = (
            getattr(inserted_by, "emailId", None) or None
        )
        papers.append(summary)

    return {"papers": papers, "count": len(papers)}, 200


EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
OBJECT_ID_PATTERN = re.compile(r"^[0-9a-fA-F]{24}$")


@csrf_protect
def assign_paper_owner(id, body):
    """
    Assign (or with force=true, replace) a record's verified owner
    Handler for PUT: /api/paper/{id}/owner

    Admin only. Sets ONLY owner_email — the write is an atomic field update,
    so legacy documents that would no longer pass full model validation are
    never touched beyond this one field.
    """
    denied = _require_admin()
    if denied:
        return denied

    email = ((body or {}).get("owner_email") or "").strip().lower()
    if not EMAIL_PATTERN.match(email):
        return {"error": "owner_email must be a valid email address"}, 400

    try:
        existing = Paper.objects.get(id=str(id))
    except Exception as e:
        msg = "Exception in assign owner api " + str(e)
        print(msg)
        return {"error": "Paper not found"}, 404

    current = (existing.owner_email or "").strip().lower()
    if current and current != email and not bool((body or {}).get("force")):
        return {
            "error": "record already has owner %s; pass force=true to replace"
                     % current
        }, 409

    Paper.objects(id=existing.id).update(
        set__owner_email=email,
        **_audit_update_kwargs(get_current_user(), "assign_owner")
    )
    return {"id": str(existing.id), "owner_email": email, "success": True}, 200


def paper_permissions(id):
    """
    Report whether the current session may edit the given record
    Handler for GET: /api/paper/{id}/permissions

    :return: permission decision for the frontend to show/hide edit controls;
     the same can_edit_paper rule will guard the future update/deactivate APIs
    """
    user = get_current_user()
    try:
        paper = Paper.objects.get(id=str(id))
    except Exception as e:
        msg = "Exception in paper permissions api " + str(e)
        print(msg)
        return {"error": "Paper not found"}, 404

    # A private record's permissions (owner email included) are as hidden as
    # the record itself.
    if paper.is_private is True and not can_view_paper(paper, user)[0]:
        return {"error": "Paper not found"}, 404

    allowed, reason = can_edit_paper(paper, user)
    manage_allowed, _ = can_manage_paper(paper, user)
    response = {
        "can_edit": allowed,
        "reason": reason,
        "owner_email": paper.owner_email,
        "authenticated": user is not None,
        "is_admin": is_admin(user),
        "is_active": paper.is_active is not False,
        "is_private": paper.is_private is True,
        "role": paper_role(paper, user) or "none",
        "can_manage": manage_allowed,
    }
    # The editor list is management data: only expose it to those who can
    # change it (owner/admin), not to editors or the public.
    if manage_allowed:
        response["editor_emails"] = list(paper.editor_emails or [])
        response["viewer_emails"] = list(paper.viewer_emails or [])
    return response, 200


def account_favorites():
    """
    List papers favorited by the current session user.
    Metadata is returned from the stored Favorite document (cached at
    favorite-time) so no cross-server lookups are needed.
    Handler for GET: /api/account/favorites
    """
    user = get_current_user()
    if not user:
        return {"error": "authentication required"}, 401

    email = _session_email(user)
    favs = Favorite.objects(owner_email=email).order_by("-created_at")
    papers = [
        {
            "id": f.paper_id,
            "server_url": f.server_url or "",
            "title": f.title or "",
            "authors": f.authors or "",
            "year": f.year,
        }
        for f in favs
    ]
    return {"favorites": papers, "count": len(papers)}, 200


@csrf_protect
def add_favorite(body):
    """
    Favorite a paper (idempotent).
    Papers live on remote Qresp servers, so we accept server_url and cached
    metadata (title, authors, year) from the frontend instead of doing a local
    Paper lookup.
    Handler for POST: /api/account/favorites
    """
    user = get_current_user()
    if not user:
        return {"error": "authentication required"}, 401

    b = body or {}
    paper_id = b.get("paper_id", "")
    if not paper_id:
        return {"error": "paper_id is required"}, 400

    email = _session_email(user)
    try:
        fav = Favorite(
            owner_email=email,
            paper_id=str(paper_id),
            server_url=(b.get("server_url") or "").strip().rstrip("/"),
            title=(b.get("title") or "")[:500],
            authors=(b.get("authors") or "")[:1000],
            year=b.get("year") or None,
            created_at=datetime.utcnow(),
        )
        fav.save()
    except NotUniqueError:
        pass  # already favorited — idempotent

    return {"paper_id": str(paper_id), "favorited": True}, 200


@csrf_protect
def remove_favorite(paper_id):
    """
    Unfavorite a paper
    Handler for DELETE: /api/account/favorites/{paper_id}
    """
    user = get_current_user()
    if not user:
        return {"error": "authentication required"}, 401

    email = _session_email(user)
    Favorite.objects(owner_email=email, paper_id=str(paper_id)).delete()
    return {"paper_id": str(paper_id), "favorited": False}, 200
