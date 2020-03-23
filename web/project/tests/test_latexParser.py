import pytest
import spacy
from project.util import LatexParser
import os


class TestLatexParser:
    """
    Class to test Latex Parser Functions
    """

    # def __init__(self):
    #     self.language_model = spacy.load("en_core_web_md", disable=[
    #         "tagger", "parser", "tokenizer", "textcat"])

    def test_get_authors(self, file_name='TexSamples/1.tex'):

        __location__ = os.path.realpath(
            os.path.join(os.getcwd(), os.path.dirname(__file__)))

        with open(os.path.join(__location__, file_name)) as f:
            tex = f.read()

        parser = LatexParser(tex)
        authors = parser.formatNames(parser.getAuthors())
        print(authors)
        assert 1 == 2

# if __name__ == "__main__":
#     tester = TestLatexParser()
#     for i in range(3):
#         tester.test_get_authors('TexSamples/{}.tex'.format(i+1))
