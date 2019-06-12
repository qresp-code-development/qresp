# Contributing to the source

Contributions are welcomed via pull requests. Contact the **Qresp** developers before starting work to ensure it meshes well with the planned development direction and standards set for the project.

## Version control

All changes in a pull request should be closely related. Multiple change sets that are loosely coupled should be proposed in separate pull requests. Use a consistent style for writing code. The pull request should be merged in the `develop` branch. 

The respository can be cloned and Qresp can be installed in this way:

```bash
$ git clone https://github.com/qresp-code-development/qresp.git
$ cd qresp/web
$ pip install -r requirements.txt
```

Note: **Qresp** needs at least Python 3.4 and pip

## Features

New features should be applicable to a variety of use-cases. The **Qresp** developers can assist you in designing flexible interfaces.

## Testing

Add tests for all new functionality.
Run `nose2 -v` to run all tests.

## Release

We use [semantic versioning](https://semver.org/), i.e. version labels have the form v`<major>`.`<minor>`.`<patch>`

 - Patch release: v0.0.0 to v0.0.1, only bug fixes
 - Minor release: v0.0.0 to v0.1.0, bug fixes and new features that maintain backwards compatibility
 - Major release: v0.0.0 to v1.0.0, bug fixes and new features that break backwards compatibility

# Contributing to the documentation

Comment complex sections of code so that other developers can understand them.
Add demonstrations of new functionality, e.g. using Jupyter notebooks.
