from os import getcwd, listdir, makedirs
from sys import stderr
import json
import traceback
from uuid import uuid4

from mongoengine.errors import FieldDoesNotExist, ValidationError

from project.utils.validate import Validate
from project.paperdao import PaperDAO


# Written into a queue file once its link has been verified, so the same link
# resolves to the same record however many times it is clicked.
PUBLISHED_ID_KEY = '_published_id'


class Publish:
    """
    Controller for Publishing Papers to the MongoDB database
    See docs/curation/publishing.md for how publishing works
    """

    def __init__(self):
        self.dir_prefix = getcwd() + '/papers/publish/'
        self.id_prefix = 'PUBLISH_'
        # Pending verification records are runtime state, not source files.
        # Make the directory on demand because Git does not retain it empty.
        makedirs(self.dir_prefix, exist_ok=True)

    def generateId(self):
        '''
        Generate a new tmp id for the paper to be published
        '''
        id = uuid4().hex
        while("{}{}.json".format(self.id_prefix, id) in listdir(self.dir_prefix)):
            id = uuid4().hex

        return "{}{}".format(self.id_prefix, id)

    def verify(self, id):
        '''
        Verify the user's and return the id of the new published paper

        Parameters
        -----------
        id: string
            The id associated to the metadata

        Return
        ------
        id, string, if no error
        html error code, if error
        '''
        try:
            path = "{}{}.json".format(self.dir_prefix, id)
            with open(path, 'r') as f:
                paper = json.load(f)
            dao = PaperDAO()
            # Idempotent per LINK, not per paper: a second click on the same
            # verification link lands on the record that link created. The
            # paper's title or DOI is never the key -- another curator's
            # record of the same paper is a separate record, not this one.
            published_id = paper.pop(PUBLISHED_ID_KEY, None)
            if published_id and dao.paperExists(published_id):
                return published_id
            new_id = dao.insertIntoPapers(paper)
            paper[PUBLISHED_ID_KEY] = new_id
            with open(path, 'w') as f:
                json.dump(paper, f, ensure_ascii=False)
            return new_id
        except FileNotFoundError as e:
            print(e, file=stderr)
            return {"msg": "This verification link is invalid or has already been used. If you just published, your paper may already be in the database.", "code": 404}
        except Exception as e:
            print(e, file=stderr)
            return {"msg": "Internal Server Error", "code": 500}

    def publish(self, paper):
        '''
        Validate the metadata and insert it as a new record straight away.

        Publishing needs a signed-in session (api.publish), and every sign-in
        provider has already proven the account's email -- email/password
        accounts confirm theirs once, at sign-up -- so there is no second,
        per-record email link any more. verify() stays for links that were
        emailed before this change.

        Parameters
        -----------
        paper: dict
               The metadata to be published

        Return
        ------
        {"id": new record id}, if no errors
        {"msg", "code"}, if error
        '''

        try:
            with open(getcwd()+"/project/schema.json") as f:
                schema = json.load(f)
                errors = Validate.validatepaper(paper, schema)
                if errors != True:
                    return {'msg': errors, 'code': 400}
        except FileNotFoundError as e:
            print(e, file=stderr)
            return {'msg': 'Schema not found, Internal Server Error', 'code': 500}

        try:
            return {"id": PaperDAO().insertIntoPapers(paper)}
        except (ValidationError, FieldDoesNotExist) as e:
            return {"msg": "The record could not be saved: %s" % e, "code": 400}
        except Exception:
            traceback.print_exc(file=stderr)
            return {"msg": "The record could not be saved. Please try again.",
                    "code": 500}
