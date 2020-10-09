from os import getcwd, listdir
from sys import stderr
import json
from uuid import uuid4


class Preview:
    """
    Controller for Metadata Previews
    GET and GENERATE
    """

    def __init__(self):
        self.dir_prefix = getcwd() + '/papers/previews/'
        self.id_prefix = 'PREVIEW_'

    def getMetadata(self, id):
        try:
            with open("{}{}.json".format(self.dir_prefix, id), 'r') as f:
                return json.load(f)
        except FileNotFoundError as e:
            print(e, file=stderr)
            return 400
        except Exception as e:
            print(e, file=stderr)
            return 500

    def generateLink(self, paper):
        id = uuid4().hex

        while("{}.json".format(id) in listdir(self.dir_prefix)):
            id = uuid4().hex

        try:
            with open("{}{}.json".format(self.dir_prefix, id), 'w') as f:
                json.dump(paper, f, ensure_ascii=False)
                return id
        except Exception as e:
            print(e, file=stderr)
            return 500
