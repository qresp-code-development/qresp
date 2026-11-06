# Change Log

## v3.0.0 (2026/10/21)

Major Update

- Modernized the whole stack
  - Backend: Python 3.14 (3.11 also supported), Flask 3, Connexion 3 (ASGI, served by gunicorn with uvicorn workers), MongoEngine 0.29, PyMongo 4.17
  - Frontend: Next.js 16, React 19, MUI 9, React Hook Form 7, Jest 30, Node 24
  - MongoDB 4.4 (the server must be 4.0 or newer; 3.6 is no longer supported)
  - nginx: per-traffic-class rate limits, HTTP to HTTPS redirect
  - Configuration through `QRESP_*` environment variables (`.env.prod.example`) instead of editing `config.ini`
- Added accounts
  - Sign in with Google, Microsoft (work/school accounts), GitHub, or an email/password account confirmed by an emailed link
  - Account pages: profile (affiliation, ORCID, Google Scholar, website, avatar), My Records, drafts, favorites
  - Record ownership, editor and viewer roles, owner reassignment and an audit trail
  - Admin pages for all records and ownerless records
  - Owners and admins can deactivate, reactivate and permanently delete records
- Added private records, shared with chosen collaborators as viewers or editors
- Curate more than published papers: unpublished papers and reports, code repositories, datasets and other works
- Curator
  - Guided setup that fills in the record from a DOI, an arXiv link, a GitHub/GitLab repository or an RCC project folder
  - RCC folder analysis (Qresp Folder Standard v1) that proposes figures, datasets, scripts, tools and a workflow for review
  - Server-side drafts, unsaved-changes guards, editing of published records
  - Workflow built with buttons, shown as a left-to-right graph and described in words
  - Nothing a curator types is required to publish
  - Publishing is immediate for a signed-in curator; the per-record email verification link is gone (old links still work)
  - Optional, consent-gated Gemini suggestions for keywords and RCC descriptions
- Explorer
  - Filter by record type: published papers, unpublished papers and reports, code repositories, datasets, other works, or all (default)
  - Sort by title, author, year and journal; Advanced Search with node selector
  - Work-type badges, lock badges for private records, "Your record" / "Shared with you" labels
  - Related Research for each record
- Redesigned home, record, search and documentation pages; the full qresp.org manual is now part of the site
- CI on every push: backend tests on Python 3.11 and 3.14, frontend Jest tests
- Removed CILogon and the manuscript upload

## v2.0.5 (2021/02/21)

Patch Update

- Fixed typos, missing commas in list of collections
- Fixed missing middle names
- Fixed critical bug causing crashes on clicking external nodes in the workflow graph.
## v2.0.4 (2021/01/09)

Patch Update

- Fixed bug causing workflow graph to break on deleting nodes.
- Added new warnings when using start from scratch button to avoid accidental deletion of work.
## v2.0.3 (2020/11/27)

Patch Update

- Fixed missing download paths of papers after publishing on Qresp
- Fixed social preview link image display
- Other minor styling and stability improvements & bugfixes
- Dropped support for Python 3.5, only 3.6 and above supported now
## v2.0.2 (2020/11/16)

Patch Update

- Added new warnings/alerts when publishing on Qresp
- Fixed minor bug in the schema definition
- Other minor styling and stability improvements & bugfixes

## v2.0.1 (2020/10/21)

Patch Update

- Added Abbreviations for CC Licenses
- Added workaround for webp images on Safari (iOS + MacOS)
- Clarified error messages
- Requests get upgraded from http to https by default
- Other minor styling and stability improvements

## v2.0.0 (2020/10/19)

Major Update

- Added new frontend service, using NextJS(React)

  - Improved UI using Material UI
  - Updated outdated packages
  - Reduced external dependencies
  - Fixed search by tags
  - And added various small quality of life improvements for users

- Added new API routes, to publish and verify humans
- Updated schema from v1.1 to v1.2, added new License field.

## v1.2.2 (2020/09/25)

- Fixed bug impacting workflow hover info cards.
- Updated File server parser to make compatible with new file server.

## v1.2.1 (2020/05/26)

- Fixed bug causing edit workflow functionality to break.
- Fixed bugs breaking DOI minting.
- Fixed python's package version incompatibilities causing build to break.

## v1.2.0 (2019/09/20)

- Updated Curator UI
- Added Preview Functionality
- Added Share Functionality
- Changed configuration scheme
- Moved qresp schema to v1.1 from v1.0
- Added more sections into Qresp explorer
- Removed ssh connection and added Zenodo & HTTP connection
- New unit tests

## v1.1.0 (2019/01/25)

- Fixed bugs related to port number
- Fixed bugs related to DOI minting and search functionality
- Added REST API functionality - Swagger
- Added Docker file containing embedded Http server(Nginx) and Mongo DB
- Added unit test cases
- Added CI(Travis)

## v1.0.0 (2018/12/18)

- Initial Qresp release
