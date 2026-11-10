import io
import os
import re
import unittest

# Dependency CONTRACT tests.
#
# A deploy breaks when a declared dependency is not actually installed by the
# image that runs. The unit tests cannot catch that on their own, because they
# pass whenever the package happens to be present in the developer's
# environment. What they CAN pin is that the Docker build path installs from
# the declared files at all.

BACKEND = os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__))))


def read(*parts):
    with io.open(os.path.join(BACKEND, *parts), encoding="utf-8") as handle:
        return handle.read()


class TestDockerInstallsDeclaredDependencies(unittest.TestCase):
    def test_both_docker_images_install_from_those_files(self):
        production = read("Dockerfile")
        self.assertIn("COPY requirements.lock.txt", production)
        self.assertRegex(production,
                         r"pip install[^\n]*\brequirements\.lock\.txt")

        dev = read("Dockerfile.dev")
        self.assertIn("COPY requirements.txt", dev)
        self.assertRegex(dev,
                         r"pip install[^\n]*\brequirements\.txt")


class TestLockFileFreshness(unittest.TestCase):
    """Every package in requirements.txt must appear in requirements.lock.txt.

    Catches the common mistake of adding a dep to requirements.txt and
    forgetting to regenerate the lock.
    """

    def _names(self, text):
        names = set()
        for line in text.splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            # Strip extras, version specifiers, environment markers:
            #   "connexion[flask]>=3.3; python_version>'3'" -> "connexion"
            name = re.split(r"[>=<!;\[\s]", line)[0].lower().replace("-", "_")
            if name:
                names.add(name)
        return names

    def test_lock_includes_every_requirements_txt_package(self):
        req = self._names(read("requirements.txt"))
        lock = self._names(read("requirements.lock.txt"))
        missing = req - lock
        self.assertEqual(
            set(), missing,
            f"Declared in requirements.txt but absent from the lock: {missing}",
        )


class TestRemovedDependencies(unittest.TestCase):
    """pypdf came in only for the manuscript PDF import, which is gone."""

    def test_pypdf_is_no_longer_declared(self):
        for name in ("requirements.txt", "requirements.lock.txt"):
            self.assertNotIn("pypdf", read(name), name)
