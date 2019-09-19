import unittest
from project.paperdao import PaperDAO,MongoDBConnection,Paper
import os
import json
def warn(*args, **kwargs):
    pass
import warnings
warnings.warn = warn

class TestPaperDAO(unittest.TestCase):

    def setUp(self):
        """
        Sets up database to test
        """
        MongoDBConnection.getDB(hostname='mongomock://localhost', port=int('27017'),
                                          username=None, password=None,
                                          dbname='mongoenginetest', collection='paper',
                                          isssl='No')
        __location__ = os.path.realpath(
            os.path.join(os.getcwd(), os.path.dirname(__file__)))
        with open(os.path.join(__location__, 'data.json')) as f:
            paperdata = json.load(f)
        paper = Paper(**paperdata)
        paper.save()

    def tearDown(self):
        """
        Sets up database to test
        """
        paper = Paper()
        paper.drop_collection()


    def test_getCollectionList(self):
        """
        Tests if all collections exist
        """
        dao = PaperDAO()
        allcollectionlist = dao.getCollectionList()
        self.assertEquals(1,len(list(allcollectionlist)))

    def test_getPublicationList(self):
        """
        Tests for publications
        """
        dao = PaperDAO()
        allpublicationlist = dao.getPublicationList()
        self.assertEquals(1,len(list(allpublicationlist)))

    # def test_getAuthorList(self):
    #     """
    #     Tests for authors
    #     """
    #     dao = PaperDAO()
    #     allauthorslist = dao.getAuthorList()
    #     self.assertEquals(0,len(list(allauthorslist)))

    def test_getAllPapers(self):
        """
        Tests for all papers
        """
        dao = PaperDAO()
        allpapers = dao.getAllPapers()
        self.assertEquals(1,len(list(allpapers)))

    def test_getAllFilteredSearchObjects(self):
        """
        Tests for all search Objects
        """
        dao = PaperDAO()
        allSearchObjects = dao.getAllFilteredSearchObjects()
        self.assertEquals(1,len(list(allSearchObjects)))

    def test_getFilteredPaperObjectsForSearchWord(self):
        """
        Tests for all search Objects with name
        """
        dao = PaperDAO()
        allSearchObjects = dao.getAllFilteredSearchObjects(searchWord='photo')
        self.assertEquals(1,len(list(allSearchObjects)))

    def test_getFilteredPaperObjectsForTitle(self):
        """
        Tests for all search Objects with name
        """
        dao = PaperDAO()
        allSearchObjects = dao.getAllFilteredSearchObjects(paperTitle='photo')
        self.assertEquals(1,len(list(allSearchObjects)))

    def test_getFilteredPaperObjectsForDOI(self):
        """
        Tests for all search Objects with doi
        """
        dao = PaperDAO()
        allSearchObjects = dao.getAllFilteredSearchObjects(doi='10.1021/jacs.6b00225')
        self.assertEquals(1,len(list(allSearchObjects)))

    def test_getFilteredPaperObjectsForTags(self):
        """
        Tests for all search Objects with tags
        """
        dao = PaperDAO()
        allSearchObjects = dao.getAllFilteredSearchObjects(tags=['DFT'])
        self.assertEquals(1,len(list(allSearchObjects)))

    def test_getFilteredPaperObjectsForCollections(self):
        """
        Tests for all search Objects with collections
        """
        dao = PaperDAO()
        allSearchObjects = dao.getAllFilteredSearchObjects(collectionList=['MICCOM'])
        self.assertEquals(1,len(list(allSearchObjects)))

    def test_getFilteredPaperObjectsForAuthors(self):
        """
        Tests for all search Objects with authors
        """
        dao = PaperDAO()
        allSearchObjects = dao.getAllFilteredSearchObjects(authorsList=[])
        self.assertEquals(1,len(list(allSearchObjects)))

    def test_getFilteredPaperObjectsForPublication(self):
        """
        Tests for all search Objects with name
        """
        dao = PaperDAO()
        allSearchObjects = dao.getAllFilteredSearchObjects(publicationList=['Journal of the American Chemical Society'])
        self.assertEquals(1,len(list(allSearchObjects)))

    def test_getAllSearchObjects(self):
        """
        Tests for all search Objects
        """
        dao = PaperDAO()
        allSearchObjects = dao.getAllSearchObjects()
        self.assertEquals(1,len(list(allSearchObjects)))

    def test_insertIntoPapers(self):
        """
        Insert Tests for all search Objects
        """
        dao = PaperDAO()
        __location__ = os.path.realpath(
            os.path.join(os.getcwd(), os.path.dirname(__file__)))
        with open(os.path.join(__location__, 'data.json')) as f:
            paperdata = json.load(f)
        paperid = dao.insertIntoPapers(paperdata)
        self.assertIsNone(paperid)


    def test_insertDOI(self):
        """
        Tests for insertion of DOI
        """
        dao = PaperDAO()
        allSearchObjects = dao.getAllFilteredSearchObjects(tags=['DFT'])
        paper = dao.insertDOI(allSearchObjects[0]['_Search__id'],'123')
        self.assertEquals(1, paper)


    def test_getPaperDetails(self):
        """
        Tests Paper details given paper id
        """
        dao = PaperDAO()
        allSearchObjects = dao.getAllFilteredSearchObjects(tags=['DFT'])
        paperDetails = dao.getPaperDetails(allSearchObjects[0]['_Search__id'])
        self.assertEquals(allSearchObjects[0]['_Search__id'], paperDetails['id'])


    def test_getWorkflowDetails(self):
        """
        Tests workflow details given paper id
        """
        dao = PaperDAO()
        allSearchObjects = dao.getAllFilteredSearchObjects(tags=['DFT'])
        workflowdetails = dao.getWorkflowDetails(allSearchObjects[0]['_Search__id'])
        self.assertEquals(workflowdetails['paperTitle'],allSearchObjects[0]['_Search__title'])


    def test_getWorkflowForChartDetails(self):
        """
        Tests workflow details given chart id and paper id
        :return:
        """
        dao = PaperDAO()
        allSearchObjects = dao.getAllFilteredSearchObjects(tags=['DFT'])
        paperDetails = dao.getPaperDetails(allSearchObjects[0]['_Search__id'])
        chartid = paperDetails['charts'][0].id
        workflowchartdetails = dao.getWorkflowForChartDetails(paperDetails['id'],chartid)
        self.assertEquals(workflowchartdetails['paperTitle'],allSearchObjects[0]['_Search__title'])

if __name__ == "__main__":
    unittest.main()