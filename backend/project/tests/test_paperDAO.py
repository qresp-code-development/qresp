import warnings
import unittest
import mongoengine
import mongomock
from project.paperdao import PaperDAO, MongoDBConnection, Paper
import os
import json


def warn(*args, **kwargs):
    pass


warnings.warn = warn


class TestPaperDAO(unittest.TestCase):

    def setUp(self):
        """
        Sets up database to test
        """
        # MongoEngine >=0.27 removed the "mongomock://" URI; connect an in-memory
        # mongomock directly via mongo_client_class (modern API).
        mongoengine.disconnect_all()
        mongoengine.connect('mongoenginetest',
                            mongo_client_class=mongomock.MongoClient)
        __location__ = os.path.realpath(
            os.path.join(os.getcwd(), os.path.dirname(__file__)))
        with open(os.path.join(__location__, 'data.json')) as f:
            paperdata = json.load(f)
        paper = Paper(**paperdata)
        paper.save()

    def tearDown(self):
        """
        Tears down the test database
        """
        paper = Paper()
        paper.drop_collection()
        mongoengine.disconnect_all()

    def test_getCollectionList(self):
        """
        Tests if all collections exist
        """
        dao = PaperDAO()
        allcollectionlist = dao.getCollectionList()
        self.assertEqual(1, len(list(allcollectionlist)))

    def test_getPublicationList(self):
        """
        Tests for publications
        """
        dao = PaperDAO()
        allpublicationlist = dao.getPublicationList()
        self.assertEqual(1, len(list(allpublicationlist)))

    def test_getAllPapers(self):
        """
        Tests for all papers
        """
        dao = PaperDAO()
        allpapers = dao.getAllPapers()
        self.assertEqual(1, len(list(allpapers)))

    def test_getAllFilteredSearchObjects(self):
        """
        Tests for all search Objects
        """
        dao = PaperDAO()
        allSearchObjects = dao.getAllFilteredSearchObjects()
        self.assertEqual(1, len(list(allSearchObjects)))

    def test_getFilteredPaperObjectsForSearchWord(self):
        """
        Tests for all search Objects with name
        """
        dao = PaperDAO()
        allSearchObjects = dao.getAllFilteredSearchObjects(searchWord='photo')
        self.assertEqual(1, len(list(allSearchObjects)))

    def test_getFilteredPaperObjectsForTitle(self):
        """
        Tests for all search Objects with name
        """
        dao = PaperDAO()
        allSearchObjects = dao.getAllFilteredSearchObjects(paperTitle='photo')
        self.assertEqual(1, len(list(allSearchObjects)))

    def test_getFilteredPaperObjectsForDOI(self):
        """
        Tests for all search Objects with doi
        """
        dao = PaperDAO()
        allSearchObjects = dao.getAllFilteredSearchObjects(
            doi='10.1021/jacs.6b00225')
        self.assertEqual(1, len(list(allSearchObjects)))

    def test_getFilteredPaperObjectsForTags(self):
        """
        Tests for all search Objects with tags
        """
        dao = PaperDAO()
        allSearchObjects = dao.getAllFilteredSearchObjects(tags=['DFT'])
        self.assertEqual(1, len(list(allSearchObjects)))

    def test_getFilteredPaperObjectsForCollections(self):
        """
        Tests for all search Objects with collections
        """
        dao = PaperDAO()
        allSearchObjects = dao.getAllFilteredSearchObjects(
            collectionList=['MICCOM'])
        self.assertEqual(1, len(list(allSearchObjects)))

    def test_getFilteredPaperObjectsForAuthors(self):
        """
        Tests for all search Objects with authors
        """
        dao = PaperDAO()
        allSearchObjects = dao.getAllFilteredSearchObjects(authorsList=[])
        self.assertEqual(1, len(list(allSearchObjects)))

    def test_getFilteredPaperObjectsForPublication(self):
        """
        Tests for all search Objects with name
        """
        dao = PaperDAO()
        allSearchObjects = dao.getAllFilteredSearchObjects(
            publicationList=['Journal of the American Chemical Society'])
        self.assertEqual(1, len(list(allSearchObjects)))

    def test_getAllSearchObjects(self):
        """
        Tests for all search Objects
        """
        dao = PaperDAO()
        allSearchObjects = dao.getAllSearchObjects()
        self.assertEqual(1, len(list(allSearchObjects)))

    def test_insertIntoPapers(self):
        """
        A second record of an already-curated paper (same title, same DOI)
        is a new record beside the first -- never refused, never a replacement.
        """
        dao = PaperDAO()
        __location__ = os.path.realpath(
            os.path.join(os.getcwd(), os.path.dirname(__file__)))
        with open(os.path.join(__location__, 'data.json')) as f:
            paperdata = json.load(f)
        before = dao.getAllFilteredSearchObjects(
            paperTitle=paperdata['reference']['title'])
        paperid = dao.insertIntoPapers(paperdata)
        self.assertIsNotNone(paperid)
        after = dao.getAllFilteredSearchObjects(
            paperTitle=paperdata['reference']['title'])
        self.assertEqual(len(before) + 1, len(after))
        self.assertIn(paperid, [p['_Search__id'] for p in after])
        for p in before:
            self.assertIn(p['_Search__id'], [q['_Search__id'] for q in after])

    def test_insertDOI(self):
        """
        Tests for insertion of DOI
        """
        dao = PaperDAO()
        allSearchObjects = dao.getAllFilteredSearchObjects(tags=['DFT'])
        paper = dao.insertDOI(allSearchObjects[0]['_Search__id'], '123')
        self.assertEqual(1, paper)

    def test_getPaperDetails(self):
        """
        Tests Paper details given paper id
        """
        dao = PaperDAO()
        allSearchObjects = dao.getAllFilteredSearchObjects(tags=['DFT'])
        paperDetails = dao.getPaperDetails(allSearchObjects[0]['_Search__id'])
        self.assertEqual(
            allSearchObjects[0]['_Search__id'], paperDetails['id'])

    def test_getWorkflowDetails(self):
        """
        Tests workflow details given paper id
        """
        dao = PaperDAO()
        allSearchObjects = dao.getAllFilteredSearchObjects(tags=['DFT'])
        workflowdetails = dao.getWorkflowDetails(
            allSearchObjects[0]['_Search__id'])
        self.assertEqual(
            workflowdetails['paperTitle'], allSearchObjects[0]['_Search__title'])

    def test_search_institution_is_empty_on_a_legacy_record(self):
        """`data.json` predates the `institution` field. A record published
        before it existed must still load and search without a migration --
        it simply carries no institution badge."""
        dao = PaperDAO()
        allSearchObjects = dao.getAllFilteredSearchObjects()
        self.assertEqual("", allSearchObjects[0]["_Search__institution"])

    def test_paper_details_institution_is_empty_on_a_legacy_record(self):
        dao = PaperDAO()
        allSearchObjects = dao.getAllFilteredSearchObjects()
        paperDetails = dao.getPaperDetails(
            allSearchObjects[0]['_Search__id'])
        self.assertEqual("", paperDetails['institution'])

    def test_institution_round_trips_through_search_and_details(self):
        """A NEW record carrying an optional institution reports the exact
        curator-entered value from both public read paths -- never
        abbreviated, never inferred from anything else on the record."""
        dao = PaperDAO()
        __location__ = os.path.realpath(
            os.path.join(os.getcwd(), os.path.dirname(__file__)))
        with open(os.path.join(__location__, 'data.json')) as f:
            paperdata = json.load(f)
        paperdata['reference']['title'] = "A distinct title for institution"
        paperdata['institution'] = "University of Chicago"
        paperid = dao.insertIntoPapers(paperdata)
        self.assertIsNotNone(paperid)

        allSearchObjects = dao.getAllFilteredSearchObjects(
            paperTitle='A distinct title for institution')
        self.assertEqual(1, len(allSearchObjects))
        self.assertEqual("University of Chicago",
                         allSearchObjects[0]["_Search__institution"])

        paperDetails = dao.getPaperDetails(
            allSearchObjects[0]['_Search__id'])
        self.assertEqual("University of Chicago", paperDetails['institution'])

    def test_the_curator_affiliation_is_not_the_record_institution(self):
        """Two fields, two levels, two meanings.

        `info.insertedBy.affiliation` is where the PERSON doing the curating
        works -- a `Person` attribute, shared with PIs and authors.
        `institution` is a `Paper` attribute about the RECORD. A curator at
        Duke can perfectly well curate a paper from UChicago, so neither may
        ever be filled in from the other.
        """
        dao = PaperDAO()
        __location__ = os.path.realpath(
            os.path.join(os.getcwd(), os.path.dirname(__file__)))
        with open(os.path.join(__location__, 'data.json')) as f:
            paperdata = json.load(f)
        paperdata['reference']['title'] = "Affiliation is not institution"
        paperdata['info']['insertedBy']['affiliation'] = "Duke University"
        # Deliberately NOT setting `institution`.
        paperid = dao.insertIntoPapers(paperdata)
        self.assertIsNotNone(paperid)

        allSearchObjects = dao.getAllFilteredSearchObjects(
            paperTitle='Affiliation is not institution')
        self.assertEqual(1, len(allSearchObjects))
        # A curator WITH an affiliation does not give the record one.
        self.assertEqual("", allSearchObjects[0]["_Search__institution"])

        details = dao.getPaperDetails(allSearchObjects[0]['_Search__id'])
        self.assertEqual("", details['institution'])
        # ...and the curator's own affiliation is untouched by any of this.
        # `PaperDetails` flattens insertedBy, so it is a sibling key here --
        # which is exactly why the two must not share a name or a value.
        self.assertEqual("Duke University", details['affiliation'])
        self.assertNotEqual(details['affiliation'], details['institution'])

    def test_getWorkflowForChartDetails(self):
        """
        Tests workflow details given chart id and paper id
        :return:
        """
        dao = PaperDAO()
        allSearchObjects = dao.getAllFilteredSearchObjects(tags=['DFT'])
        paperDetails = dao.getPaperDetails(allSearchObjects[0]['_Search__id'])
        chartid = paperDetails['charts'][0].id
        workflowchartdetails = dao.getWorkflowForChartDetails(
            paperDetails['id'], chartid)
        self.assertEqual(
            workflowchartdetails['paperTitle'], allSearchObjects[0]['_Search__title'])


if __name__ == "__main__":
    unittest.main()
