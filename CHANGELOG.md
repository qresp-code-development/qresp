# Change Log

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
