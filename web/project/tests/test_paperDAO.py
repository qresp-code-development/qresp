import unittest
from unittest import TestCase
from project.paperdao import *
import os
import mongomock
import json
def warn(*args, **kwargs):
    pass
import warnings
warnings.warn = warn

class TestPaperDAO(TestCase):
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
        #paperdata = json.loads(paperdata)
        paper = Paper(**paperdata)
        paper.save()

    def test_getCollectionList(self):
        """
        Tests if all collections exist
        """
        dao = PaperDAO()
        allcollectionlist = dao.getCollectionList()
        self.assertTrue(list(allcollectionlist))

    def test_getPublicationList(self):
        """
        Tests for publications
        """
        dao = PaperDAO()
        allpublicationlist = dao.getPublicationList()
        self.assertTrue(list(allpublicationlist))

    def test_getAllPapers(self):
        """
        Tests for all papers
        """
        dao = PaperDAO()
        allpapers = dao.getAllPapers()
        self.assertTrue(list(allpapers))

    # def test_getAllFilteredSearchObjects(self):
    #     self.fail()
    #
    # def test_getAllSearchObjects(self):
    #     self.fail()
    #
    # def test_insertIntoPapers(self):
    #     self.fail()
    #
    # def test_getPaperDetails(self):
    #     self.fail()
    #
    # def test_getWorkflowDetails(self):
    #     self.fail()
    #
    # def test_getWorkflowForChartDetails(self):
    #     self.fail()

if __name__ == "__main__":
    unittest.main()