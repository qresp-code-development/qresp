from mongoengine import *

class Person(DynamicEmbeddedDocument):
    """ Class mapping creators,PIs,authors of paper to mongo database
    """
    firstName = StringField(max_length=50, required= True)
    middleName = StringField(max_length=50)
    lastName = StringField(max_length=50, required= True)
    emailId = StringField(max_length=100)
    affiliation =StringField(max_length=100)

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

class ExtraFields(DynamicEmbeddedDocument):
    """ Extra fields
    """
    extrakey = StringField()
    extravalue = StringField()

class Charts(DynamicEmbeddedDocument):
    """ Class mapping Charts section of paper to mongo database
    """
    caption = StringField()
    id = StringField(required= True)
    imageFile = StringField(required= True)
    files = ListField()
    number = StringField()
    properties = ListField(required= True)
    extraFields = ListField()
    saveas = StringField()
    meta = {'strict': False}

class Tools(DynamicEmbeddedDocument):
    """ Class mapping Tools section of paper to mongo database
    """
    id = StringField()
    kind = StringField()
    packageName = StringField()
    version = StringField()
    programName = StringField()
    files = ListField()
    readme = StringField()
    facilityname = StringField()
    measurement = StringField()
    URLs = ListField()
    extraFields = ListField()
    saveas = StringField()
    meta = {'strict': False}

class Datasets(DynamicEmbeddedDocument):
    """ Class mapping Datasets section of paper to mongo database
    """
    id = StringField()
    files = ListField()
    readme = StringField()
    URLs = ListField()
    extraFields = ListField()
    saveas = StringField()
    meta = {'strict': False}

class Scripts(DynamicEmbeddedDocument):
    """ Class mapping Datasets section of paper to mongo database
    """
    id = StringField()
    files = ListField()
    readme = StringField()
    URLs = ListField()
    extraFields = ListField()
    saveas = StringField()
    meta = {'strict': False}

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
    meta = {'strict': False,
            'indexes':[
                {'title','unique'},
                'publishedAbstract'
            ]}

class Documentation(DynamicEmbeddedDocument):
    """ Class mapping Datasets section of paper to mongo database
    """
    readme = StringField()
    meta = {'strict': False}

class Heads(DynamicEmbeddedDocument):
    """ Class mapping Heads section of paper to mongo database
    """
    readme = StringField()
    files = ListField()
    URLs = ListField()
    saveas = StringField()
    meta = {'strict': False}


class Workflow(DynamicEmbeddedDocument):
    """ Class mapping Workflow section of paper to mongo database
    """
    edges = ListField(ListField())
    nodes = ListField()
    meta = {'strict': False}


class FilterQuerySet(QuerySet):
    """ Class to filter query on mongo database
    """

    def get_unique_values(self, field):
        """ fetches list of unique collections , journal names
        :param field: field to filter on in database
        :return: list of field values
        """
        unique_values = {str(v).lower(): v for v in self.distinct(field=field)}.values()
        return unique_values

    def get_unique_names(self, field):
        """ Fetches list of unique names
        :param field: str: filters on name
        :return: list : full names
        """
        unique_values = {str(v.firstName.lower()) + " " + str(v.lastName.lower()): v.firstName + " " + v.lastName for v
                         in self.distinct(field=field)}.values()
        return unique_values

class Paper(Document):
    """ Class to filter query on mongo database
    """
    version = LongField()
    PIs = ListField(EmbeddedDocumentField(Person))
    info = EmbeddedDocumentField(Info)
    charts = ListField(EmbeddedDocumentField(Charts))
    datasets = ListField(EmbeddedDocumentField(Datasets))
    tools = ListField(EmbeddedDocumentField(Tools))
    scripts = ListField(EmbeddedDocumentField(Scripts))
    reference = EmbeddedDocumentField(Reference)
    heads = ListField(EmbeddedDocumentField(Heads))
    workflow = EmbeddedDocumentField(Workflow)
    documentation = EmbeddedDocumentField(Documentation)
    collections = ListField(required= True)
    schema = StringField(required= True)
    tags = ListField(required= True)
    versions = ListField()
    meta = {'strict': False,
            'queryset_class': FilterQuerySet
            }