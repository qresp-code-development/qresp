# Staging QA Checklist — auth/edit MVP (Qresp 2.0)

Target: **`qresp_staging` ONLY** (never `/home/sushant/qresp`, never the live
compose project). Access via the SSH tunnel: `https://localhost:8443`.
No secrets in this file or in compose files — inject everything via
environment variables on the staging backend container.

## Backend environment (staging only)

- [ ] `QRESP_ENABLE_DEV_LOGIN=1` (dev-login stays OFF everywhere it is unset)
- [ ] `QRESP_ADMIN_EMAILS=admin@example.com` (optional, comma-separated allowlist)
- [ ] `QRESP_GOOGLE_CLIENT_ID=...`
- [ ] `QRESP_GOOGLE_CLIENT_SECRET=...`
- [ ] `QRESP_GOOGLE_REDIRECT_URI=https://localhost:8443/api/auth/google/callback`
      (must match an authorized redirect URI on the Google OAuth client; use
      the public staging hostname instead if testing without the tunnel)
- [ ] `QRESP_PUBLISH_SKIP_EMAIL=1` (staging QA only: show the account
      confirmation link in the browser instead of sending SMTP email; never in
      production)
- [ ] `QRESP_OAUTHLIB_INSECURE_TRANSPORT=1` **only if** the callback is served
      over plain HTTP (not needed for the HTTPS tunnel; never in production)
- [ ] **Cleanup after this deploy:** CILogon was removed from the code.
      Delete `QRESP_CILOGON_CLIENT_ID` / `_CLIENT_SECRET` / `_REDIRECT_URI` /
      `_DISCOVERY_URL` and any CILogon-only `env_file` reference from the
      staging backend by hand. Nothing reads them any more; leaving them set
      is harmless but misleading. Do NOT delete `ExternalIdentity` rows —
      legacy `provider: "cilogon"` documents stay in place, unused.

## Microsoft Entra sign-in — pending app registration

- [ ] Env on staging backend (see [microsoft-entra-login.md](microsoft-entra-login.md)):
      `QRESP_MICROSOFT_CLIENT_ID`, `QRESP_MICROSOFT_CLIENT_SECRET`,
      `QRESP_MICROSOFT_REDIRECT_URI`
      (= `https://localhost:8443/api/auth/microsoft/callback`, exactly as
      registered); optional `QRESP_MICROSOFT_TENANT` (default organizations)
- [ ] Unconfigured: "Continue with Microsoft" → JSON 503; Google and
      dev-login unaffected
- [ ] Configured: button → Microsoft account picker → work/school sign-in →
      returns to the ORIGINATING page; header shows the name; `/account`
      shows "Signed in with Microsoft"
- [ ] Publish → verify → edit → drafts → (allowlisted email) admin surfaces
      all work through the Microsoft session
- [ ] Sign out, then sign in again → the account PICKER appears
      (select_account), allowing a different Microsoft account
- [ ] Personal (consumer) Microsoft accounts are rejected by the
      organizations authority
- [ ] Campus requiring admin consent shows Entra's approval screen (expected;
      that campus can use Google until consent is granted)

## Sign-in entry points (Microsoft + Google only)

- [ ] Header, signed out: exactly ONE **Sign in** control — no per-provider
      buttons, no "Dev sign in", no institution/CILogon wording anywhere
- [ ] It links to `/login?next=<the page you were on>` and returns you there
      after signing in
- [ ] Narrow the window to phone width: **Sign in** stays visible in the
      header bar, on one line, NOT hidden behind the hamburger; navigation
      links still collapse into the drawer
- [ ] Opening the drawer does not duplicate or relocate the Sign in control
- [ ] `/login` shows exactly two choices — "Continue with Microsoft" and
      "Continue with Google" — with no provider errors, config, API keys,
      Drive/Gmail permissions, dev-login, or CILogon
- [ ] `/login?next=https://evil.example.com/x` → the provider links fall back
      to `next=%2F` (never an external redirect)
- [ ] Visiting `/login` while already signed in redirects to `next`, or to
      `/account` when no `next` was given — it does not ask again
- [ ] Signed in: header shows the name (linking to `/account`), the admin
      label where applicable, and **Sign out**
- [ ] `/curator` while signed out: the gate shows a primary **Sign in to
      curate** button linking to `/login?next=/curator`, and returns to the
      curator afterwards
- [ ] `QRESP_ADMIN_EMAILS` matching the signed-in email grants the admin
      badge/surfaces
- [ ] `GET /api/auth/cilogon` and `/api/auth/cilogon/callback` → 404;
      `/api/ui/` lists only google/microsoft/me/logout/dev-login auth routes
- [ ] Legacy note: records owned by a DIFFERENT email are not visible to a
      new identity until an admin reassigns ownership or adds the new email
      as an editor (expected behavior)

### Google sign-in diagnosis (2026-07-28)

The OAuth flow itself was verified working on staging (`/api/auth/google`
302 → callback 302 → `/api/auth/me` 200). What failed afterwards was nginx:
a single server-wide `limit_req` throttled every request, so one page load's
`/_next/static` burst came back **503** and it looked like a login failure.

- [ ] Deploy the nginx config, then run `./nginx/ratelimit-check.sh
      https://localhost:8443` → **RESULT: PASS** (no 503/429 anywhere)
- [ ] Manually: sign out, click **Sign in** → Continue with Google → Google
      shows the **account chooser** (not a silent re-login), pick an account
      → land back on the page you started from, fully rendered, no 503
- [ ] Sign out and in again with a DIFFERENT Google account — possible now
      that `prompt=select_account` is sent
- [ ] Hard-reload `/`, `/login`, `/account`, `/curator` several times in a
      row → every asset 200/304, never 503
- [ ] Expensive endpoints still protected: fire ~30 rapid
      `POST /api/curation/analyze-folder` → later ones get **429**
      (not 503) and the app keeps working
- [ ] `docker compose -p qresp_staging logs nginx | grep auth/google/callback`
      → shows `/api/auth/google/callback?[redacted]`, never `code=`/`state=`
- [ ] Backend log for the same request → also redacted; a cancelled sign-in
      shows a generic "did not complete" message to the user with the
      provider's error string only in the log
- [ ] No secret, token, provider response body, or stack trace appears in any
      user-visible error

## Email/password accounts — confirmation link

With `QRESP_PUBLISH_SKIP_EMAIL=1` the link is shown on the page ("Open
confirmation link") instead of being emailed.

- [ ] Create account with email → info message "We sent a confirmation link
      to …"; you are NOT signed in; the form is back in Sign in mode
- [ ] Sign in with that email/password before confirming → info message
      "Please confirm your email address first"; still not signed in
- [ ] Open the link → "Confirm your email" page → wrong password is refused,
      right password lands on `/account` signed in
- [ ] Open the same link again → "invalid or has expired"
- [ ] Create account again for an address already confirmed → "already
      exists. Please sign in instead."
- [ ] Production only (real email): the message arrives, and its link starts
      with `QRESP_PUBLIC_URL`

## API smoke (curl -k through the tunnel)

- [ ] `curl -k https://localhost:8443/api/auth/me` → 200, `authenticated:false`, a `csrf_token`
- [ ] `curl -k https://localhost:8443/api/search` → 200 (unchanged)
- [ ] dev-login round trip:
      `curl -k -c c.txt -X POST https://localhost:8443/api/auth/dev-login -H "Content-Type: application/json" -d '{"email":"owner@example.com"}'` → 200
      then `curl -k -b c.txt https://localhost:8443/api/auth/me` → `authenticated:true`
- [ ] mutation without `X-CSRF-Token` while logged in → 403 (e.g. logout)

## Browser (https://localhost:8443)

- [ ] Home/header/footer render like https://paperstack.uchicago.edu (commit `4af350f` repairs)
- [ ] Mobile-width header drawer opens and shows nav + auth controls (manual)
- [ ] "Dev sign in" logs in; header shows name and Sign out
- [ ] "Sign in with Google" → consent → returns to the ORIGINATING page; header shows Google name
- [ ] paperdetails shows the permission notice (anonymous: "Sign in to edit …")
- [ ] Owner (or admin): "Edit metadata" visible → edit tags on a **staging/test record only** → saves and reloads with new tags
- [ ] Non-owner signed in: no edit button; direct `PUT /api/paper/{id}` with their cookie+token → 403
- [ ] Anonymous `PUT /api/paper/{id}` → 401
- [ ] `/api/ui/` swagger page loads

## Explore record-type filter

- [ ] `/search` shows "All (n)" selected, then one button per type with its
      count; legacy records (no type) count as Published papers
- [ ] Each type shows only its records and the record count follows; All
      brings everything back
- [ ] Run an Advanced Search, then pick a type → the type narrows the
      search results

## Publish → account round trip

- [ ] Signed in, publish a staging test record → success dialog says "Your
      record is published" with a "View the record" button; no email, no
      verification link
- [ ] "View the record" opens the new record; the permission notice says you
      can edit it (owner)
- [ ] Header name → `/account`: profile shows name/email/provider (+admin
      badge if allowlisted); the new record appears under "My published
      records" with working View / Edit in Curator links
- [ ] "Local recovery draft" lists an in-progress curator draft with
      Resume/Clear (start typing in /curator create mode first)

## Account server drafts (signed in)

- [ ] In `/curator` create mode, fill a few fields (even incomplete, no
      charts/datasets) → "Save Draft" → name it → success dialog
- [ ] `/account` → "My drafts" lists it with an "Updated …" time
- [ ] Save a second draft → both appear (multiple drafts supported)
- [ ] Resume a draft → `/curator?draft=<id>` reloads exactly that draft's state
- [ ] Edit and Save Draft again → the SAME draft updates (no duplicate in the list)
- [ ] "Rename" a draft → title updates in the list
- [ ] "Delete" a draft → confirmation dialog first → confirm removes it
- [ ] "Start from Scratch" with unsaved work → dialog offers Cancel /
      Save Draft and Start Fresh / Discard and Start Fresh (no duplicate
      Dismiss); "Discard" truly blanks the form
- [ ] Navigating away with unsaved changes prompts Save Draft and Leave /
      Leave Without Saving / Stay
- [ ] Publishing from a resumed draft → success dialog offers "Delete the
      saved draft"; the account draft is only removed when you click it
- [ ] Export/Import Metadata (Upload Metadata / Export Metadata) still work and
      are independent of account drafts
- [ ] Anonymous: "Save Draft" prompts to sign in (no server draft is created)

## Publication Information (manual entry + DOI Fetch)

- [ ] Signed in, /curator → "Publication Information for This Paper" shows ONE
      canonical DOI field with its Fetch button and nothing else automated:
      no "Import Manuscript Source" card, no file picker, no
      "Selected source"/Clear controls, no `.pdf`/`.tex`/`.zip` anywhere
- [ ] The section offers NO AI action: no "Suggest missing publication
      details with AI", no AI dialog, no mention of Gemini
- [ ] "Qresp Curation Information" holds PIs / PaperStack / Keywords /
      notebook. "Suggest Keywords with AI" sits under the Keywords field —
      and NOT in Publication Information
- [ ] The keyword dialog names what it sends before anything leaves: the
      paper's own fields and the artifacts already added. It states that no
      file, notebook, image, path or RCC URL is sent. No manuscript-consent
      checkbox and no full-source option anywhere
- [ ] Suggestions arrive all unticked, tagged "Existing Qresp keyword" or
      "New suggestion"; Apply Selected Keywords APPENDS to what you typed
      (a keyword you already have is not duplicated, and your spelling wins)
- [ ] Applying keywords does not save or collapse Qresp Curation Information
- [ ] With the provider unconfigured the button explains that, without
      calling out; over quota it says so distinctly
- [ ] Fetch a DOI, do NOT press the section Save, press Save Draft, then
      Resume the draft: every fetched field comes back
- [ ] Apply AI keywords, do NOT press the section Save, press Save Draft,
      then Resume: the keywords come back
- [ ] Paste a real DOI → Fetch → Kind, Title, Authors, Journal Name, Volume,
      Page, Year, Abstract and URL fill in from the registry
- [ ] Fetch a DOI whose registry record lacks a journal or page → those
      inputs stay BLANK for manual entry; nothing is guessed
- [ ] A DOI whose registry record has no URL → the URL field shows exactly
      `https://doi.org/<normalized-doi>`
- [ ] Paste `doi:10.…` and `https://doi.org/10.…` → both normalize to the
      bare DOI in the field before fetching
- [ ] Fetch does NOT close, collapse or save the section — the edit form
      stays open with its values, and the Save button is still there
- [ ] Only the section "Save" button commits and switches to display mode
- [ ] Clearing Journal Name, Page, Abstract, Volume or Year and pressing Save
      shows "Required" and does not save (every asterisked field is required
      for Preprint, Journal and Dissertation alike)
- [ ] DOI and URL may be left empty and Save still succeeds
- [ ] Upload Metadata (JSON) import/export still works unchanged
- [ ] Drafts, edit mode and publish are unaffected


## RCC folder analysis (assisted curation)

Fixture folder (read-only, the design reference):
`https://notebook.rcc.uchicago.edu/files/10.1021.acs.jpcc.5c01077/` —
`data/{SE-RSH,VDOS,dipoles,short_traj/*.xyz,vlocal}`, `figures/*.png`,
`scripts/*.py`. See [rcc-folder-analysis.md](../curation/rcc-folder-analysis.md).

Staging environment for this section:

```sh
QRESP_FILESERVER_ROOTS=https://notebook.rcc.uchicago.edu/files
# ONLY while the RCC certificate is expired; unset once it is renewed:
QRESP_FILESERVER_INSECURE_TLS_HOSTS=notebook.rcc.uchicago.edu
```

Selection, saving, and type-specific import:

- [ ] Signed in, `/curator` → "Where is the paper": "Selected folder" reads
      "None yet" and there is no **Analyze RCC Folder** button
- [ ] Choose the RCC root → Search → the file tree opens; its confirmation
      button reads **Use**
- [ ] Pick the DOI folder and confirm → the dialog closes, the form STAYS
      OPEN, "Selected folder" shows the full path, and nothing was committed
      (the section did NOT collapse to the display card)
- [ ] The four RCC import buttons remain disabled until **Save File Server**
- [ ] Search again / cancel the tree → the previous selection is still shown
- [ ] With a folder already saved, click the pencil → the form opens with the
      saved path already in "Selected folder" (not empty); a search that
      fails (bad URL → error alert) does NOT erase it
- [ ] **Save File Server** is the only thing that commits: after clicking it
      the section switches to the display card with the saved path
- [ ] The File Server form and display card contain no folder-analysis action
- [ ] There is NO second URL box in either state
- [ ] Chart / dataset / script / tool / notebook pickers are unchanged: their
      file tree confirmation still reads **Save** and still fills their field

Artifact section actions and shared scan:

- [ ] Beside each manual Add action is exactly one matching action:
      **Import Charts/Datasets/Scripts/Tools from RCC**
- [ ] At desktop width the two actions share one row with equal widths; at
      phone width they stack without clipped text or horizontal scrolling
- [ ] Open **Import Charts from RCC** → the dialog contains Charts only: no
      Datasets/Scripts/Tools tabs or candidates
- [ ] Select/apply/cancel in a typed dialog affects only that artifact type
- [ ] After one import has scanned the folder, open a different type → the
      existing analysis is reused (Network shows no second default
      `/api/curation/analyze-folder` request)
- [ ] Rebuild proposals or use custom record boundaries → a fresh analysis
      request is made and the runtime cache is replaced
- [ ] Change and save the File Server path → the next import scans the new
      path instead of showing candidates from the old folder
- [ ] Save Draft / Export Metadata / Publish payloads contain no RCC analysis
      cache or raw analysis response

Folder picker layout (check at 1440×900, 900×800 and 390×844 — resize the
window or use the browser's device toolbar):

- [ ] With the picker open, **USE** and **CANCEL** sit in a fixed row at the
      BOTTOM of the dialog; the title and the **Current selection** line sit
      in a fixed area at the top. Only the folder tree scrolls, and there is
      exactly ONE scrollbar in the dialog
- [ ] USE is visible and disabled before anything is ticked
- [ ] Tick a folder → USE enables, and **nothing moves**: the dialog does not
      change size, the tree does not jump, and USE/CANCEL stay put. Untick →
      USE disables again
- [ ] Tick a different folder → the Current selection line shows only the new
      path; the previous one is gone
- [ ] Expand several levels and scroll to the bottom of a long tree → the
      action row stays visible the whole time
- [ ] A long folder name wraps onto the next line; its checkbox and expand
      chevron stay on the first line and never overlap the name, and the
      dialog never scrolls sideways
- [ ] The long selected path is truncated with `…` on ONE line (hover shows
      the full path) and never pushes USE/CANCEL out of the dialog
- [ ] Scroll the wheel over the dialog past the end of the tree → the page
      behind it does not move
- [ ] USE fills **Selected folder** in the form and closes only the picker:
      the "Where is the paper" section stays open and nothing is saved.
      CANCEL leaves the previous selection untouched
- [ ] Use a Dataset/Script "files" picker first (multi-select), then Search
      from File Server → the folder picker is back to ONE folder: the Current
      selection line is shown and ticking a second folder replaces the first

Deterministic results on the fixture folder:

Only directly evidenced values may be filled in. Everything else must be
blank and flagged — a generated-looking value is worse than an empty field.

- [ ] Charts tab lists `figures/*.png` with the exact image path filled in
- [ ] **Figure number is BLANK** on every chart — not 1, 2, 3 — and flagged
      as needing input. Switch tabs / re-run: it is still blank
- [ ] **Figure Caption is BLANK** on every chart, and its helper text says to
      use the paper's caption (or a concise description when the figure has
      none) — it is never labelled a generic "Description"
- [ ] **Keywords is BLANK.** Open Details: filename tokens appear there as
      `Filename hints (not metadata): …` and NOWHERE in a field
- [ ] The chart fields read **Figure Image, Figure Number, Figure Caption,
      Keywords, Input / Supporting Files, Reproduction Notebook** — the same
      labels the Add/Edit Chart form uses. Dataset and Script labels are
      unchanged
- [ ] Reproduction Notebook is filled only for a `.ipynb` in the SAME folder
      with the same basename, and Details says so; no chart has Extra Fields
- [ ] Datasets tab groups by directory — `data/short_traj` holds both `.xyz`
      files exactly, the **description is BLANK** (no "Files from …"), and
      there is NO invented URL
- [ ] Scripts tab: the **description is BLANK** even for a `.py` that has a
      module docstring; the docstring appears under Details as evidence
- [ ] Tools tab: entries appear ONLY for pinned manifest lines
      (`numpy==1.26.4`); an unpinned `scipy>=1.10` produces no Tool; imports
      appear only as the "possible dependencies … not added as tools" note.
      `Tools (0)` is a correct result for a folder with no manifest
- [ ] A `module load pkg/1.2.3` line in a run script, or a README stating
      "… v7.2", DOES produce a Tool with that exact version; prose with no
      version marker produces none
- [ ] Existing manually curated Tools records elsewhere in the form are
      untouched by an analysis
- [ ] Open **Edit Proposal**: each field carries its own evidence chip —
      `High evidence` on the detected image path, `Medium evidence` on a
      same-folder notebook, `Needs input` on figure number and caption. No
      field shows `High evidence` for something Qresp did not read
- [ ] Details lists **Filename hints — not verified metadata**; the tokens
      and any name-similar file in another folder appear ONLY there

Folder organization guide (Qresp Folder Standard v1):

- [ ] A **How to organize an RCC folder** button sits beside the File Server
      actions and opens a dialog; nothing is shown until you click it
- [ ] The example is a live icon tree (selectable text, scales with the
      window, scrolls rather than overflowing at phone width) — not an image.
      It shows `charts/figure-id/{preview.png, notebook.ipynb, data/}`
- [ ] The opening text says Qresp can inspect any folder inside the allowed
      file server roots, that proposals are deterministic for the standard and
      recognized legacy names, and that an unsupported structure is left as
      Needs reorganization / Unclassified rather than guessed at. It does NOT
      claim any folder is analyzed perfectly
- [ ] It says the five role folders are optional, that existing folders are
      never renamed or modified, and never asks for a YAML/JSON/Qresp-specific
      file
- [ ] It states the standard's Chart unit: **one `charts/<figure-id>/` folder
      is one Chart**, `preview.png` is the Figure Image, `notebook.ipynb` the
      Reproduction Notebook, the chart's `data/` its Input / Supporting Files,
      and each independent figure gets its own folder
- [ ] The several-images-in-one-folder guidance is in its OWN section, marked
      as compatibility review for folders that already exist — not as a second
      way to lay out a new paper
- [ ] It warns against storing secrets in an inspected folder
- [ ] Analyze a folder that follows NONE of the advice → it behaves exactly
      as before; the guide never validates, scores, or blocks anything
- [ ] No Experiment record is proposed anywhere
- [ ] `README.md` (or anything unmatched) appears under Unclassified

Record boundaries and grouping:

- [ ] The review dialog reports how the folder was read (`Qresp Standard`,
      `Legacy-compatible`, `Needs reorganization`) and names each recognized
      role root (`figures_tables` → charts, `data` → datasets, `doc` → docs);
      nothing on the file server is renamed
- [ ] `doc/` produces no Charts, Datasets, Scripts or Tools, and its files do
      NOT reappear as Unclassified noise
- [ ] A legacy tree offers **Choose record boundaries** for its dataset/script
      roots; **Rebuild proposals** re-runs the analysis and changes proposals
      only — nothing is added to the form, saved or published
- [ ] A figure folder named after one of its images (e.g.
      `figure_2/figure_2.png` beside `homo.png`, `lumo.png`) proposes **ONE**
      Chart by default, with `figure_2.png` as the Figure Image. The other
      images are NOT silently attached: they are listed in the Charts section
      of Record boundaries, marked `Review`, and create nothing until given a
      role
- [ ] In that Charts section, set `homo.png` to **Create Chart** → after
      Rebuild there are two independent Chart candidates, each with one Figure
      Image; set it to **Supporting File** instead → one Chart, with
      `homo.png` in its Input / Supporting Files; **Ignore** → nothing
- [ ] That folder's `figure_2.ipynb` is the Chart's Reproduction Notebook, NOT
      a separate Script, and it is attached only to the image whose basename
      matches
- [ ] `.sh` / `.py` / `.ipynb` under a Datasets role produce no Scripts;
      `.csv` / `.json` under a Scripts role produce no Datasets
- [ ] A logo/icon/TOC graphic is never a Chart
- [ ] The card chip reads `Medium evidence` (likely) rather than
      `High evidence` for an artifact — only FIELD chips say High

Unclassified readability:

- [ ] Unclassified is grouped by folder with a name and count per group;
      names appear as chips only after expanding a group
- [ ] The filter box narrows the groups and clearing it restores them
- [ ] No screen shows hundreds of paths as one continuous paragraph

Chart images:

- [ ] Apply a Chart from folder analysis with the folder SAVED → the PNG
      renders; the URL is `fileServerPath/figures/....png` with no double
      slash
- [ ] Before saving the File Server path, RCC import is disabled; a legacy or
      manually constructed chart with no saved path still shows "No file
      server path is saved yet" instead of a blank box
- [ ] A chart whose file was moved/deleted shows "could not be loaded from
      `<url>`" rather than an empty frame
- [ ] A manually curated chart (picked through the file tree) renders exactly
      as before
- [ ] A folder or file name containing a space still renders

Candidate visibility (the DOI folder has ~2000 files):

- [ ] Every tab count matches the real total; nothing is silently dropped
- [ ] A tab with more than 25 candidates shows the first 25, strongest
      evidence first, plus **Show all N candidates** and a line saying how
      many are collapsed *and not discarded*
- [ ] Click Show all → the full list renders and the button disappears
- [ ] Select a candidate near the end of a long list, then re-collapse →
      your selection is still visible

Review, apply, and non-destructiveness:

- [ ] Every typed dialog starts UNCHECKED and its "Add selected <type> to
      Curator" action is disabled until something is selected
- [ ] Edit a caption/description in the dialog → the edited value is what
      gets added
- [ ] Remove a candidate → its tab count drops and it cannot be added
- [ ] Add a chart by hand FIRST, then apply two analyzed charts → the manual
      chart is untouched and the ids are distinct (`c0`, `c1`, `c2` — no
      duplicate `c1`)
- [ ] Applied items appear in the normal Charts/Datasets/Scripts/Tools lists
      and are still editable with the existing Edit forms
- [ ] Applying makes NO save/publish request (Network shows only the
      analyze call) and the record is not published
- [ ] Manual FileTree selection, Add and Edit forms all still work unchanged
- [ ] Cancel applies nothing

Path safety (expect a clear 400 and NO outbound request):

- [ ] Temporarily point the saved path at another host / a parent path
      (`…/files/…/../../etc`) / an encoded traversal (`%2e%2e`) / an
      `http://` downgrade → "outside the file server roots" or the matching
      refusal, and the server log shows no listing attempt
- [ ] A very large or deep folder → the dialog shows "Only part of the
      folder was inspected" plus the specific cap warning (never a silent
      partial result)
- [ ] Server log for a successful run contains counts only — no file names,
      no directory contents, no manifest text

Responsive layout and partial results:

- [ ] At a normal desktop width a candidate card is one line: checkbox, label,
      chips, then **Details / Edit Proposal / Remove** on the right
- [ ] Narrow the dialog: the actions wrap to their own line as a group —
      "Edit Proposal" never breaks word by word, and nothing overflows
      horizontally
- [ ] Long relative paths in **Details** wrap instead of forcing a sideways
      scrollbar
- [ ] **Edit Proposal** opens the fields with clear vertical separation from
      the header/evidence (a divider), two columns on desktop and one column
      on narrow widths
- [ ] The DOI fixture folder reports `truncated` → an **info** (not error)
      notice says it is a partial view, how many files/folders were scanned,
      and which limits stopped it; the specific reason is listed below it
- [ ] Backend log shows ONE `TLS VERIFICATION DISABLED for
      notebook.rcc.uchicago.edu ...` line per analysis instead of hundreds of
      urllib3 `InsecureRequestWarning` lines; any OTHER host still warns
- [ ] `/login` renders as a fixed centered card — no accordion to expand
      before the provider buttons are usable

Optional AI descriptions (only with Gemini configured):

- [ ] Each candidate has its own **Enhance with AI** action; selecting several
      Add checkboxes does not batch them or alter which item is enhanced
- [ ] Clicking one candidate's action opens a CONSENT DIALOG that sends
      nothing: it names exactly that item, lists what travels (relative paths,
      file/folder names, README /
      docstring / manifest excerpts) and what does not (raw datasets, image
      bytes, notebook contents, credentials, account data)
- [ ] The consent checkbox is UNCHECKED and "Send and get suggestions" is
      disabled until it is ticked; Cancel makes no request (check the Network
      tab — only the analyze call appears)
- [ ] Run it once, then click Enhance again → consent is asked AFRESH, the
      box is unchecked again (no remembered blanket consent)
- [ ] Select an item Qresp classified with MEDIUM confidence → if the AI
      disagrees about the kind it says so as a NOTE ("reads this more like a
      dataset … nothing has been moved"); the candidate stays in its original
      tab and the tab counts do not change
- [ ] A HIGH-confidence candidate never gets a kind second-opinion
- [ ] Type your own description first, then run the AI → your text is still
      there; the proposal sits beside it marked "not applied" until you click
      to accept it
- [ ] Factual fields (image file, figure number, files, package name,
      version, executable, patches) are unchanged before and after the AI run
- [ ] After consent → suggestions appear in their own **AI suggestion** area
      with a `medium`/`low` label and a "Based on: …" reason. NO field is
      filled in, nothing is added, nothing is saved
- [ ] The AI label never reads `high`, and no numeric percentage (e.g. "92%")
      appears anywhere
- [ ] "Use as …" applies exactly one field; the candidate is NOT added to
      Curator by accepting
- [ ] Type your own text in a field first → the matching "Use as …" is
      DISABLED with "your text is kept — clear the field to use this instead"
- [ ] Factual fields are unchanged before and after: image file, figure
      number (still blank), files, notebook file, package name, version,
      executable, patches
- [ ] Network: the request body carries only `id/kind/name/paths/context`;
      no file contents, no image bytes, no email/account fields, and every
      path is relative
- [ ] Then the typed "Add selected <type> to Curator" action still adds the
      reviewed records
- [ ] With Gemini NOT configured → the folder analysis still completes in
      full and only the AI action reports "not configured on this server"

## Soft-deactivate published records (owner/admin)

Chosen design (documented): deactivated records are hidden from the PUBLIC
detail route for everyone, including the owner. Next SSR fetches
`/api/paper/{id}` server-side WITHOUT the browser session cookie, so an
owner's request is anonymous and correctly 404s. Therefore all owner/admin
management of deactivated records happens on `/account` (client-side,
authenticated), NOT on the public detail page. `is_active` is toggled only via
`PUT /api/paper/{id}/active`; metadata edits never change it.

- [ ] `/account` "My published records": an ACTIVE owned record shows
      View + Edit in Curator + **Deactivate**
- [ ] Click "Deactivate" → confirm dialog says it hides but does NOT delete
      (preserved, reversible) → confirm
- [ ] The record disappears from `/search`, `/explorer` and their filter
      dropdowns; its detail page 404s for anonymous/other users
- [ ] Back on `/account`, that record now shows a "deactivated" chip,
      **no View button** (it would 404), Edit in Curator, and **Reactivate**
- [ ] "Edit in Curator" on the deactivated record loads, Save Changes
      succeeds, and returns to `/account` (not a 404 detail page); the record
      stays deactivated (search still hides it)
- [ ] "Reactivate" → confirm dialog → record is public again in search/detail
- [ ] (Active record only) paperdetails still offers owner/admin Deactivate in
      the permission notice; after deactivating there, reloading the detail
      404s by design — manage it from `/account` thereafter

## Editors (edit-only co-authors) and audit

Roles: admin manages everything; owner edits + manages their record;
editor_emails edit ONLY (no deactivate/reactivate, no owner assignment, no
editor-list changes). `is_active`/editors/audit fields can never be changed
through the metadata PUT payload.

- [ ] As the owner on `/account`: "Editors" → add a second staging account's
      email (comma-separated) → Save
- [ ] As that editor: the record appears on `/account` with an "editor" chip,
      View + Edit in Curator only (no Deactivate, no Editors button)
- [ ] Editor edits via Edit in Curator → Save Changes succeeds
- [ ] Editor direct API checks: `PUT /api/paper/{id}/active` → 403;
      `PUT /api/paper/{id}/editors` → 403
- [ ] paperdetails as editor: notice says "you can edit this record (editor)",
      no Deactivate button
- [ ] Admin reassigns the owner (`PUT /api/paper/{id}/owner`, force) → the old
      owner loses edit unless first added to editors
- [ ] After an edit/deactivate/editors change, the stored record carries
      updated_at / updated_by_email and an appended edit_history entry
      (check via mongo shell or /raw as owner)

## Edit-mode unsaved changes guard

- [ ] In `/curator?edit=<id>`, change a field (or just TYPE in an open section
      form without pressing its save) and click a nav link → dialog offers
      Leave Without Saving / Stay only (no draft-save option, no Dismiss)
- [ ] "Stay" keeps you on the curator; "Leave Without Saving" navigates
- [ ] With no changes, navigation is not intercepted
- [ ] Save Changes then navigate → no prompt

## Admin: all records management

Two admin drawers on /account by design: "Ownerless records" is a short
migration helper (shows the curator-declared owner suggestion); "All records"
is the complete management surface over every stored record.

- [ ] As an allowlisted admin, `/account` shows "All records (admin)" listing
      every record — including deactivated, ownerless, and other users'
      records — with owner, editor list, status chips and last-updated info
- [ ] Active row: View / Edit in Curator / Editors / Reassign Owner /
      Deactivate; deactivated row: no View, Reactivate instead
- [ ] "Reassign Owner" → dialog explains the old owner loses edit unless kept
      as editor → confirm → row shows the new owner; the new owner can edit,
      the old owner cannot
- [ ] "Editors" / "Deactivate" / "Reactivate" work from this list and update
      the row in place
- [ ] Non-admin: section absent; `GET /api/admin/papers` with a non-admin
      cookie → 403, anonymous → 401

## Admin: ownerless records

- [ ] Signed in as an allowlisted admin, `/account` shows an
      "Ownerless records (admin)" section listing legacy records with no owner
- [ ] Each row shows the (unverified) suggested email; "Assign" sets the owner
      and the row disappears; a bad email shows the backend error inline
- [ ] Non-admins do not see the section; `GET /api/admin/ownerless-papers`
      with a non-admin cookie → 403

## Legacy verify links (emailed before publishing became immediate)

- [ ] Re-click an old verification link → still lands on the paper
      (idempotent), NOT an error, and no duplicate record is created
- [ ] A tampered/unknown `/verify/PUBLISH_bogus?server=…` → "couldn't finish
      publishing" page with a specific message and a Browse link (not a blank
      "contact the administrators")

Identity model (documented, not configurable in UI): the sign-in (Google,
Microsoft, GitHub, a confirmed email/password account, or staging dev-login)
provides the verified identity and owner_email, and publishing inserts the
record at once. No Google Drive/Gmail scopes anywhere.

## Related Research (Related Literature Explorer prototype)

Full design, thresholds and rationale: [related-research.md](../product/related-research.md).
**Off by default.** Everything below assumes you turned it on deliberately.

### Environment (staging backend only)

**Recommended first pass — internal only, zero outbound traffic:**

```sh
QRESP_RELATED_RESEARCH_ENABLED=1     # master switch
QRESP_RELATED_EXTERNAL_ENABLED=      # unset/empty: no provider call at all
```

In this mode Related Qresp Records is computed and shown, the external
provider is never contacted, the external cache is neither read nor written,
the API answers `external.status: "disabled"`, and the frontend renders the
internal section alone with no external heading.

**Second pass — add the external half:**

```sh
QRESP_RELATED_RESEARCH_ENABLED=1
QRESP_RELATED_EXTERNAL_ENABLED=1
# OPTIONAL — Semantic Scholar serves this API without a key at a lower rate
# limit. Leave it unset for the first pass; that path must work too.
QRESP_SEMANTIC_SCHOLAR_API_KEY=...
# Optional, bounded server-side (timeout ≤ 30s, cache ≤ 90 days):
QRESP_SEMANTIC_SCHOLAR_TIMEOUT_SECONDS=8
QRESP_RELATED_RESEARCH_CACHE_DAYS=7
```

Setting `QRESP_RELATED_EXTERNAL_ENABLED` **without** the master switch does
nothing at all — verify that too.

No `config.ini` key exists for any of these, by design.

Compose bind-mounts `./backend`, so a `build` does **not** pick these up —
recreate the container and confirm with booleans (never echo the key):

```sh
cd ~/qresp_staging && git pull
docker compose up -d --force-recreate --no-deps backend
docker compose exec backend python -c "import os; print('enabled:', \
  bool(os.environ.get('QRESP_RELATED_RESEARCH_ENABLED')), 'key set:', \
  bool(os.environ.get('QRESP_SEMANTIC_SCHOLAR_API_KEY')))"
```

> ℹ️ **What to expect from the external list.** Measured over 18 real Qresp
> records, the pool production uses returns candidates for **15 of 18**
> (300 candidates, 74 % of them clearing the gate), and they look on-topic.
> An `external.status: "ok"` with `count: 0` on a given record is still a
> perfectly normal answer — some records simply have no match — so it is not
> by itself a fault.
>
> An earlier version of this note said the external list would always be
> empty. That was drawn from two hand-picked DOIs and is **retracted**; see
> [related-research.md](../product/related-research.md) § "Correction".
>
> **Precision is still unknown** — there are no human labels yet, and
> plausible-looking is not the same as relevant. The open question is the
> opposite one: the gate accepts ~71 % of candidate pairs, which may be too
> permissive. Resolve that with the labelling pass below, not by eye.

### Switch and degradation

- [ ] **Unset** `QRESP_RELATED_RESEARCH_ENABLED` → detail pages render exactly
      as before, **no** "Suggested Related Papers" section anywhere; `curl -k
      https://localhost:8443/api/paper/<id>/related` → 200 with
      `"enabled": false` and both lists empty; **no** outbound request in the
      backend log
- [ ] Master **off** but `QRESP_RELATED_EXTERNAL_ENABLED=1` → identical to the
      line above. Nothing is rendered and nothing is fetched: the external
      switch alone must never activate anything
- [ ] Master **on**, external **off** → the section appears with **only**
      Related Qresp Records; there is NO "Related External Papers" heading at
      all; `external.status` is `disabled`; the backend log shows no outbound
      request; `db.related_research_cache.count()` does not change (not even a
      read)
- [ ] Master **on**, external **on** → the section appears with BOTH
      Related Qresp Records and Related External Papers
- [ ] **No API key set** → the internal list still works and external results
      still load (or degrade cleanly); nothing in the logs mentions a key
- [ ] Block outbound network (`docker compose exec backend sh -c "echo
      '127.0.0.1 api.semanticscholar.org' >> /etc/hosts"`) → the page still
      renders, internal results intact, external section reads "External
      recommendations are unavailable right now"; **no 500**. Undo with
      `docker compose up -d --force-recreate --no-deps backend`
- [ ] A record whose DOI is not in the provider's index → external section
      reads "could not be matched in the external index"; internal unaffected

### Provider status must not be collapsed

The distinction below is the point of the hardening pass: a **non-answer**
must never be recorded as a fact about the record.

- [ ] Outbound blocked → `external.status == "unavailable"`, and the cache
      entry's `expires_at` is **within the hour**, not seven days:
      `db.related_research_cache.find({}, {status:1, expires_at:1})`
- [ ] A genuine 404 (a record whose DOI the provider does not know) →
      `external.status == "unresolved"` and `expires_at` **is** ~7 days out
- [ ] After an outage, restore the network → the next load refetches
      (the hour-long entry expires) rather than staying blank for a week
- [ ] Without an API key, expect occasional `unavailable` from 429 on the
      shared pool; it must clear by itself within the hour

### Edited metadata must invalidate the external cache

- [ ] Load a record (cache filled), then edit its **title** in the curator and
      reload the detail page → the provider is queried again immediately and
      `related_research_cache.fingerprint` changes, **without** waiting out the
      TTL and **without** any migration step
- [ ] Same for abstract, tags, collections, authors, and any chart/dataset/
      script/tool description or keyword
- [ ] Changing **owner, editors or the file-server path** does NOT trigger a
      refetch (those are not part of the fingerprint, and must not be)
- [ ] `db.related_research_cache.findOne()` → `fingerprint` is a 64-character
      hex digest, and contains no title, DOI, email, path or key

### Content quality

- [ ] The section is headed **Suggested Related Papers** and always carries
      the notice "These suggestions are generated automatically from
      publication metadata and research-similarity signals…", in every state
      (loading, results, empty)
- [ ] The UI **never** says "AI", "AI-assisted" or "AI recommendations": no
      language model runs in the serving path, and claiming one would
      misdescribe how the answer was produced
- [ ] Each list shows **at most 5** and is **not padded** — a record with one
      good neighbour shows one, not five
- [ ] A record with nothing related shows exactly
      `No sufficiently related papers were found.`
- [ ] Every result shows title, authors, year, DOI/link and **Why related**
      with at most 3 reasons
- [ ] Reasons name something you can verify in both records (a shared keyword,
      a shared author, a shared tool, a similarity number) — never "recommended
      by Semantic Scholar" as a reason
- [ ] External results carry the **Recommended by Semantic Scholar** chip;
      internal results do NOT
- [ ] The current paper never appears in its own lists, and no title or DOI
      appears twice
- [ ] A **deactivated** record never appears in anyone's Related Qresp Records
      (deactivate one that was showing, reload → it is gone immediately)
- [ ] A **newly published** record appears in a related record's list on the
      next page load, with no cache clearing
- [ ] Internal result links open the Qresp detail page (with `?server=`);
      external result links open `https://doi.org/…` in a new tab

**Reference sample:** a record with DOI `10.1021/acs.nanolett.7b00283`
exercises the DOI-first resolution and returns a non-trivial external set.

### Cache

- [ ] Load a detail page twice; the second load makes **no** provider request
      (backend log quiet)
- [ ] `db.related_research_cache.find()` on staging Mongo: entries exist,
      keyed by paper id, and contain **no** API key, header, provider error
      body, email, RCC path or file content
- [ ] `db.papers.findOne({_id: …})` for the same record: **unchanged** — no
      recommendations, no `related*` field, no new timestamp
- [ ] Force expiry (`db.related_research_cache.updateOne({paper_id: "<id>"},
      {$set: {expires_at: new Date("2000-01-01")}})`) with the provider
      reachable → refreshed, `stale: false`
- [ ] Force expiry with outbound network blocked → the last successful results
      still show, with the dated "Showing the last successful external
      results…" warning (`stale: true`)

### Federated records (opened from the Explorer with `?server=`)

This is what the first staging pass got wrong: a record opened from another
Qresp server made the browser ask the LOCAL backend about an id only that
server has, which could only answer 404 — and the section then hid itself.

- [ ] Open a record on a federated server through the Explorer
      (`/paperdetails/<their id>?server=<their origin>`). The browser request
      is `GET /api/paper/<their id>/related?server=<url-encoded origin>` — the
      `server` parameter must be present (DevTools → Network)
- [ ] That request → **200**, `enabled: true`, `source_server` equal to that
      origin, `internal.status: "ok"`. Not 404
- [ ] The Suggested Related Papers section renders, and its Related Qresp
      Records are records **from that server** — cross-check two of them
      against that server's own Explorer listing
- [ ] Each internal result's link goes to `?server=<their origin>`, and
      following it loads that record on that server (not a local 404)
- [ ] Backend log shows exactly two reads of the peer per uncached request:
      `/api/paper/<id>` and `/api/search`. No other outbound host
- [ ] `db.papers.count()` is unchanged after loading several federated
      records — the remote record is scored and discarded, never stored
- [ ] `db.related_research_cache.find({}, {paper_id: 1})`: the federated entry
      is keyed `<origin>|<id>`, and any pre-existing local entry still has its
      bare id (no migration, no duplicate)
- [ ] A local record still works exactly as before: no `server` parameter on
      the request, `source_server: ""`, and no outbound peer request at all
- [ ] `?server=https://localhost:8443` (the tunnel itself) is answered locally
      — no outbound request

**Refused servers** — each of these → **400**
`{"error": "This Qresp server is not available."}`, and **no** outbound
request appears in the backend log:

- [ ] `?server=https://not-in-the-registry.example.net`
- [ ] `?server=http://<a registry server>` (plaintext)
- [ ] `?server=https://169.254.169.254` and `?server=https://10.0.0.5`
- [ ] `?server=https://user:pw@<a registry server>`
- [ ] `?server=https://<a registry server>@evil.example.net`
- [ ] `?server=https://<a registry server>.evil.example.net`
- [ ] `?server=https://<a registry server>/../admin` and `…?x=1`
- [ ] `?server=file:///etc/passwd`
- [ ] Asking for a **local** id with a refused `?server=` → 400, and the
      response body does NOT contain the local record's title (no silent
      fallback to the local database)

**Peer failures** — the section must say so, not claim nothing is related:

- [ ] Block outbound access to the peer, reload a federated record → 200 with
      `internal.status: "unavailable"`, the UI shows "Related research is
      unavailable right now…" **with a Try again button**, and the rest of the
      detail page is intact
- [ ] Click **Try again** with access restored → the lists appear
- [ ] A federated id the peer does not have → 404, same body as a local miss

### Read-only and access

- [ ] `GET /api/paper/<deactivated id>/related` signed out → 404
      `{"error": "This record is not available."}`; as its owner/admin → 200
- [ ] `GET /api/paper/000000000000000000000000/related` → 404, same body
- [ ] Hitting the endpoint repeatedly changes nothing: record, drafts,
      ownership, editors, publish state and curation state all unchanged
- [ ] `nginx -t` passes and `GET /api/paper/<id>/related` is limited by the
      `api_related` zone (see `nginx/ratelimit-check.sh`); ordinary browsing
      of 10 detail pages in a minute is NOT throttled

### Layout

- [ ] 1440×900, 900×800 and 390×844: no horizontal page scroll; long titles,
      long author lists, DOIs and the provenance chip wrap instead of
      overflowing; nothing overlaps
- [ ] Loading state ("Looking for related research…") is visible on a slow
      connection and is replaced, not stacked

### Domain relevance (the actual gate on enabling this anywhere public)

Staging holds too few usable records to judge relevance (2 active, one with a
title/DOI/abstract mismatch and one tagged `asdf`). Use the evaluation CLI
against a Qresp instance with a real corpus instead — it is read-only and
never touches the related endpoint, its cache or its quota.

```sh
cd backend
python -m project.tools.related_eval collect \
  --api-base https://<a-qresp-instance-with-real-records> \
  --sample-size 18 --output-dir ../related-eval-out --live
# ...rate human_rating in ../related-eval-out/human-review.tsv, then:
python -m project.tools.related_eval summarize --output-dir ../related-eval-out
```

- [ ] `collect` run; `summary.json` reviewed for per-pool coverage and the
      gate pass rate
- [ ] A domain expert has filled in `human_rating`
      (`related` / `partial` / `unrelated`) for 15–20 records' worth of rows,
      **including the rejected near-misses** — those are the only way false
      negatives surface
- [ ] `summarize` run; precision@5, false positives and false negatives
      recorded
- [ ] Only THEN decide whether any gate threshold moves. A pass rate of ~71 %
      on unlabelled data is a question, not a verdict — see
      [related-research.md](../product/related-research.md) § Known limitations

## After QA

- [ ] Note any UI deltas vs production in [full-stack-modernization-report.md](../archive/modernization/full-stack-modernization-report.md) §8
- [ ] Do NOT leave `QRESP_ENABLE_DEV_LOGIN` set on anything production-facing
- [ ] Do NOT leave `QRESP_RELATED_RESEARCH_ENABLED` set on anything
      production-facing until the domain relevance table above is filled in
