from mongoengine import *


class Workflow(DynamicEmbeddedDocument):
    """ Class mapping Workflow section of paper to mongo database
    """
    edges = ListField(ListField())
    nodes = ListField()
    meta = {'strict': False}
