# Change Log

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
