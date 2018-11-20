from mongoengine import *


class Datasets(DynamicEmbeddedDocument):
    """ Class mapping Datasets section of paper to mongo database
    """
    id = StringField()
    files = ListField()
    readme = StringField()
    URLs = ListField()
    saveas = StringField()
    extraFields = DictField()
    meta = {'strict': False}
