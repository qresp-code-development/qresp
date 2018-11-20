from .person import *


class Journal(DynamicEmbeddedDocument):
    """ Class mapping Journal section of reference to mongo database
    """
    abbrevName = StringField()
    fullName = StringField()


class Reference(DynamicEmbeddedDocument):
    """ Class mapping Reference section of paper to mongo database
    """
    DOI = StringField()
    authors = ListField(EmbeddedDocumentField(Person))
    journal = EmbeddedDocumentField(Journal)
    kind = StringField()
    page = StringField()
    publishedAbstract = StringField()
    title = StringField()
    volume = StringField()
    year = DecimalField()
    meta = {'strict': False}
