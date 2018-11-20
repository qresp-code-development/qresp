from .person import *


class Info(DynamicEmbeddedDocument):
    """ Class mapping Info section of paper to mongo database
    """
    timeStamp = StringField()
    notebookPath = StringField()
    serverPath = StringField()
    notebookFile = StringField()
    insertedBy = EmbeddedDocumentField(Person)
    downloadPath = StringField()
    fileServerPath = StringField()
    isPublic = BooleanField()
    folderAbsolutePath = StringField()
    doi = StringField()
    meta = {'strict': False}
