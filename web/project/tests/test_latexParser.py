import pytest
import spacy
from project.util import LatexParser
import os
import json


class TestLatexParser:
    """
    Class to test Latex Parser Functions
    """
    @pytest.fixture(scope="module")
    def language_model(self):
        return spacy.load("en_core_web_md", disable=[
            "tagger", "parser", "tokenizer", "textcat"])

    @pytest.fixture(scope="module")
    def inputData(self):
        location = os.path.realpath(
            os.path.join(os.getcwd(), os.path.dirname(__file__)))

        data = {"1": "", "2": "", "3": ""}
        for i in range(3):
            with open(os.path.join(location, 'TexSamples/{}.tex'.format(i+1))) as f:
                data[str(i+1)] = f.read()

        return data

    @pytest.fixture(scope="module")
    def results(self):
        location = os.path.realpath(
            os.path.join(os.getcwd(), os.path.dirname(__file__)))

        with open(os.path.join(location, 'TexSamples/Results.json')) as f:
            data = f.read()

        results = json.loads(data)

        return results

    def test_get_authors(self, language_model, inputData, results):
        test_results = {}
        for i in range(3):
            parser = LatexParser(
                inputData[str(i+1)], language_model=language_model)
            test_results[str(i+1)] = parser.formatNames(parser.getAuthors())

        assert test_results == results['authors']

    def test_get_title(self, language_model, inputData, results):
        test_results = {}
        for i in range(3):
            parser = LatexParser(
                inputData[str(i+1)], language_model=language_model)
            test_results[str(i+1)] = parser.getTitle()

        assert test_results == results['titles']

    def test_get_abstract(self, language_model, inputData, results):
        test_results = {}
        for i in range(3):
            parser = LatexParser(
                inputData[str(i+1)], language_model=language_model)
            test_results[str(i+1)] = parser.getAbstract()

        assert test_results == results['abstracts']

    def test_get_figures(self, language_model, inputData, results):
        test_results = {}
        for i in range(3):
            parser = LatexParser(
                inputData[str(i+1)], language_model=language_model)

            test_results[str(i+1)] = parser.getFigures()

        assert test_results == results['figures']
    
