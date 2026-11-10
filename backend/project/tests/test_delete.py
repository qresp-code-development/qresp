from project.models import Favorite, RelatedResearchCache
from project.paperdao import Paper
from project.tests.test_permissions import (
    ADMIN,
    OTHER,
    OWNER,
    PermissionTestBase,
)

EDITOR = "editor@example.com"


class TestDeletePaper(PermissionTestBase):
    """DELETE /api/paper/{id}: permanent removal, owner/admin only -- the same
    rule as deactivation. Editors can edit but never delete."""

    def tearDown(self):
        Favorite.drop_collection()
        RelatedResearchCache.drop_collection()
        super().tearDown()

    def _delete(self, paper_id):
        return self.client.delete(
            f"/api/paper/{paper_id}",
            headers={"X-CSRF-Token": self.csrf},
        )

    def _exists(self, paper_id):
        return Paper.objects(id=paper_id).first() is not None

    # ---- authorization -----------------------------------------------------

    def test_anonymous_cannot_delete(self):
        response = self.client.delete(f"/api/paper/{self.owned_id}")
        self.assertIn(response.status_code, (401, 403))
        self.assertTrue(self._exists(self.owned_id))

    def test_non_owner_cannot_delete(self):
        self.login(OTHER)
        self.assertEqual(403, self._delete(self.owned_id).status_code)
        self.assertTrue(self._exists(self.owned_id))

    def test_editor_cannot_delete(self):
        Paper.objects(id=self.owned_id).update(set__editor_emails=[EDITOR])
        self.login(EDITOR)
        self.assertEqual(403, self._delete(self.owned_id).status_code)
        self.assertTrue(self._exists(self.owned_id))

    def test_non_admin_cannot_delete_an_ownerless_record(self):
        self.login(OTHER)
        self.assertEqual(403, self._delete(self.ownerless_id).status_code)
        self.assertTrue(self._exists(self.ownerless_id))

    def test_owner_can_delete_their_record(self):
        self.login(OWNER)
        response = self._delete(self.owned_id)
        self.assertEqual(200, response.status_code, response.text)
        self.assertTrue(response.json()["deleted"])
        self.assertFalse(self._exists(self.owned_id))
        # Only that record: the other one is untouched.
        self.assertTrue(self._exists(self.ownerless_id))

    def test_admin_can_delete_any_record(self):
        self.login(ADMIN)
        self.assertEqual(200, self._delete(self.ownerless_id).status_code)
        self.assertFalse(self._exists(self.ownerless_id))

    def test_unknown_record_is_404(self):
        self.login(ADMIN)
        self.assertEqual(404, self._delete("000000000000000000000000").status_code)

    # ---- what goes with it -------------------------------------------------

    def test_deleted_record_is_gone_from_search_and_details(self):
        self.login(OWNER)
        self._delete(self.owned_id)
        ids = [p["_Search__id"] for p in self.client.get("/api/search").json()]
        self.assertNotIn(self.owned_id, ids)
        self.assertNotEqual(
            200, self.client.get(f"/api/paper/{self.owned_id}").status_code)

    def test_favorites_and_related_cache_are_removed(self):
        Favorite(owner_email=OTHER, paper_id=self.owned_id).save()
        Favorite(owner_email=OTHER, paper_id=self.ownerless_id).save()
        RelatedResearchCache(paper_id=self.owned_id).save()
        self.login(OWNER)
        self._delete(self.owned_id)
        self.assertEqual(0, Favorite.objects(paper_id=self.owned_id).count())
        self.assertEqual(1, Favorite.objects(paper_id=self.ownerless_id).count())
        self.assertEqual(
            0, RelatedResearchCache.objects(paper_id=self.owned_id).count())
