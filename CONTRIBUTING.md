# Contributing to the source

Contributions are welcomed via pull requests. Contact the **Qresp** developers before starting work to ensure it meshes well with the planned development direction and standards set for the project.

## Version control

All changes in a pull request should be closely related. Multiple change sets that are loosely coupled should be proposed in separate pull requests. Use a consistent style for writing code. The pull request should be merged in the `develop` branch; releases are merged from `develop` into `master` and tagged.

The repository can be cloned and set up in this way (see the [Quickstart](docs/guides/quickstart.md) for details):

```bash
$ git clone https://github.com/qresp-code-development/qresp.git
$ cd qresp/backend
$ pip install -r requirements.lock.txt
$ cd ../frontend
$ yarn install
```

Note: the **Qresp** backend needs Python 3.11 or newer; the frontend needs Node.js 24 and Yarn 1.

## Features

New features should be applicable to a variety of use-cases. The **Qresp** developers can assist you in designing flexible interfaces.

## Testing

Add tests for all new functionality.
Run `python -m nose2 -v` in `backend/` and `yarn test` in `frontend/` to run all tests. CI runs both on every push.

## Release

We use [semantic versioning](https://semver.org/), i.e. version labels have the form v`<major>`.`<minor>`.`<patch>`

 - Patch release: v0.0.0 to v0.0.1, only bug fixes
 - Minor release: v0.0.0 to v0.1.0, bug fixes and new features that maintain backwards compatibility
 - Major release: v0.0.0 to v1.0.0, bug fixes and new features that break backwards compatibility

The version appears in `frontend/package.json`, `backend/setup.py`, `backend/project/swagger.yml`, the documentation pages (`frontend/pages/documentation/download.js`, `curation-and-exploration.js`) and `CHANGELOG.md`; update all of them together.

# Contributing to the documentation

Comment complex sections of code so that other developers can understand them.
Add demonstrations of new functionality, e.g. using Jupyter notebooks.
