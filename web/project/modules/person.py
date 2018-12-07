from mongoengine import *


class Person(DynamicEmbeddedDocument):
    """ Class mapping creators,PIs,authors of paper to mongo database
    """
    firstName = StringField(max_length=50)
    middleName = StringField(max_length=50)
    lastName = StringField(max_length=50)
    emailId = StringField(max_length=100)
    affiliation =StringField(max_length=100)