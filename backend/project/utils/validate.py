from jsonschema import validate, ValidationError
from os import getcwd
from sys import stderr
import json
import re


class Validate:
    """
    Util class to validate incoming messages, papers specifically
    """

    @staticmethod
    def validatepaper(paper, schema):
        '''
        Validates the give paper with the latest schema
        '''
        try:
            validate(paper, schema)
            return True
        except ValidationError as e:
            print(e, file=stderr)
            msg = re.sub('\\s+', ' ', str(e))
            return msg
