from mongoengine import *


class Documentation(DynamicEmbeddedDocument):
    """ Class mapping Datasets section of paper to mongo database
    """
    readme = StringField()
    meta = {'strict': False}
