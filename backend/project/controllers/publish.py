from os import getcwd, listdir
from sys import stderr
import json
from uuid import uuid4

from project.utils.mail import mailClient


class Publish:
    """
    Controller for Publishing Papers to the MongoDB database
    Look at how publish works in dev_docs
    """

    def __init__(self):
        self.dir_prefix = getcwd() + '/papers/publish/'
        self.id_prefix = 'PUBLISH_'

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
            with open("{}{}.json".format(self.dir_prefix, id), 'r') as f:
                return json.load(f)
        except FileNotFoundError as e:
            print(e, file=stderr)
            return 400
        except Exception as e:
            print(e, file=stderr)
            return 500

    def publish(self, paper, server):
        '''
        Generate a new link to verify the identity of the user and then publish 

        Parameters
        -----------
        paper: dict
               The metadata to be published

        Return
        ------
        200, if no errors
        html error code, if error
        '''
        curatorDetails = paper['info']['insertedBy']

        name = "{} {} {}".format(curatorDetails['firstName'],
                                 curatorDetails['middleName'],
                                 curatorDetails['lastName'])
        name = name.replace("  ", " ")

        id = self.generateId()

        subject = 'Qresp Publish Verification'
        verifyLinkUrl = "{}verify/{}".format(server, id)
        html = '''
        <html>
            <body>
                <p>
                    Hello {0},<br>
                    Thank you, for publishing on Qresp. Here is the link to publish the paper below.<br>
                    Click on the link below or paste it in the browser <br>
                    <br>
                    <a href={1}>{1}</a><br><br>
                    Have a great day !<br>
                    The Qresp Team
                </p>
            </body>
        </html>
        '''.format(name, verifyLinkUrl)

        try:
            with open("{}{}.json".format(self.dir_prefix, id), 'w') as f:
                json.dump(paper, f, ensure_ascii=False)
                mailClient.send(subject, "", html, curatorDetails['emailId'])
                return 200
        except Exception as e:
            print(e, file=stderr)
            return 500
