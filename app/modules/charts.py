from mongoengine import *


class Charts(DynamicEmbeddedDocument):
    """ Class mapping Charts section of paper to mongo database
    """
    caption = StringField()
    id = StringField()
    imageFile = StringField()
    files = ListField()
    kind = StringField()
    number = StringField()
    properties = ListField()
    saveas = StringField()
    extraFields = DictField()
    meta = {'strict': False}
