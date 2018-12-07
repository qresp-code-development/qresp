from mongoengine import *


class Heads(DynamicEmbeddedDocument):
    """ Class mapping Heads section of paper to mongo database
    """
    readme = StringField()
    files = ListField()
    URLs = ListField()
    saveas = StringField()
    meta = {'strict': False}
