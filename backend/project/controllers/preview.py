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

    def generateId(self):
        '''
        Generate a new id for the preivew  of the paper
        '''
        id = uuid4().hex
        while("{}{}.json".format(self.id_prefix, id) in listdir(self.dir_prefix)):
            id = uuid4().hex

        return "{}{}".format(self.id_prefix, id)

    def getMetadata(self, id):
        '''
        Return the preview metadata for the id given

        Parameters
        -----------
        id: string
            The id associated to the metadata

        Return
        ------
        dict, if no error
        html error code, if error
        '''
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
        '''
        Generate a new link for the preview of the given metadata 

        Parameters
        -----------
        paper: dict
               The metadata for which the preview is to be generated

        Return
        ------
        string, if no error: New id for the preview paper
        html error code, if error
        '''
        id = self.generateId()
        try:
            with open("{}{}.json".format(self.dir_prefix, id), 'w') as f:
                json.dump(paper, f, ensure_ascii=False)
                return id
        except Exception as e:
            print(e, file=stderr)
            return 500
