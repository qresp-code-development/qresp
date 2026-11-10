from unittest import mock

from project.controllers.preview import Preview
from project.models import UserProfile
from project.tests.test_permissions import OWNER, PermissionTestBase

DECLARED = "john.doe@company.com"  # info.insertedBy.emailId in data.json


class PaperCuratorTest(PermissionTestBase):
    def tearDown(self):
        UserProfile.drop_collection()
        super().tearDown()

    def curator(self, paper_id):
        response = self.client.get(f"/api/paper/{paper_id}/curator")
        self.assertEqual(200, response.status_code, response.text)
        return response.json()["profile"]

    def test_owner_profile_wins(self):
        UserProfile(email=OWNER, name="Owner", bio="Owner bio").save()
        UserProfile(email=DECLARED, name="John", bio="Declared bio").save()
        self.assertEqual("Owner bio", self.curator(self.owned_id)["bio"])

    def test_falls_back_to_curator_email_account(self):
        UserProfile(email=DECLARED, name="John Doe", bio="Spin defects.",
                    website_url="https://example.edu/john").save()
        for paper_id in (self.owned_id, self.ownerless_id):
            profile = self.curator(paper_id)
            self.assertEqual("Spin defects.", profile["bio"])
            self.assertEqual("https://example.edu/john", profile["website_url"])
            self.assertNotIn("email", profile)

    def test_no_account_is_null(self):
        self.assertIsNone(self.curator(self.ownerless_id))

    def test_preview_uses_curator_email(self):
        UserProfile(email=DECLARED, name="John Doe", bio="Previewing.").save()
        with mock.patch.object(Preview, "getMetadata",
                               return_value={"emailId": "John.Doe@company.com"}):
            profile = self.curator("PREVIEW_" + "a" * 32)
        self.assertEqual("Previewing.", profile["bio"])

    def test_bad_preview_id_is_404(self):
        response = self.client.get("/api/paper/PREVIEW_nope/curator")
        self.assertEqual(404, response.status_code)
        with mock.patch.object(Preview, "getMetadata", return_value=400):
            response = self.client.get("/api/paper/PREVIEW_" + "b" * 32 + "/curator")
        self.assertEqual(404, response.status_code)
