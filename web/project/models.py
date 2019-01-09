from mongoengine import *

class Person(DynamicEmbeddedDocument):
    """ Class mapping creators,PIs,authors of paper to mongo database
    """
    firstName = StringField(max_length=50)
    middleName = StringField(max_length=50)
    lastName = StringField(max_length=50)
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
    id = StringField()
    imageFile = StringField()
    files = ListField()
    number = StringField()
    properties = ListField()
    saveas = StringField()
    extraFields = ListField()
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
    saveas = StringField()
    extraFields = ListField()
    meta = {'strict': False}

class Datasets(DynamicEmbeddedDocument):
    """ Class mapping Datasets section of paper to mongo database
    """
    id = StringField()
    files = ListField()
    readme = StringField()
    URLs = ListField()
    saveas = StringField()
    extraFields = ListField()
    meta = {'strict': False}

class Scripts(DynamicEmbeddedDocument):
    """ Class mapping Datasets section of paper to mongo database
    """
    id = StringField()
    files = ListField()
    readme = StringField()
    URLs = ListField()
    saveas = StringField()
    extraFields = ListField()
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
    meta = {'strict': False}

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
    collections = ListField()
    schema = StringField()
    tags = ListField()
    versions = ListField()
    meta = {'strict': False,
            'queryset_class': FilterQuerySet}

class Search(object):
    def __init__(self):
        self.id = ""
        self.title = ""
        self.tags = []
        self.collections = []
        self.authors = []
        self.publication = ""
        self.abstract = ""
        self.doi = ""
        self.serverPath = ""
        self.folderAbsolutePath = ""
        self.fileServerPath = ""
        self.downloadPath = ""
        self.notebookPath = ""
        self.notebookFile = ""
        self.year = 0

    @property
    def id(self):
        return self.__id

    @id.setter
    def id(self, val):
        self.__id = val

    @property
    def title(self):
        return self.__title

    @title.setter
    def title(self, val):
        self.__title = val

    @property
    def tags(self):
        return self.__tags

    @tags.setter
    def tags(self, val):
        self.__tags = val

    @property
    def collections(self):
        return self.__collections

    @collections.setter
    def collections(self, val):
        self.__collections = val

    @property
    def authors(self):
        return self.__authors

    @authors.setter
    def authors(self, val):
        self.__authors = val

    @property
    def publication(self):
        return self.__publication

    @publication.setter
    def publication(self, val):
        self.__publication = val

    @property
    def abstract(self):
        return self.__abstract

    @abstract.setter
    def abstract(self, val):
        self.__abstract = val

    @property
    def doi(self):
        return self.__doi

    @doi.setter
    def doi(self, val):
        self.__doi = val

    @property
    def serverPath(self):
        return self.__serverPath

    @serverPath.setter
    def serverPath(self, val):
        self.__serverPath = val

    @property
    def folderAbsolutePath(self):
        return self.__folderAbsolutePath

    @folderAbsolutePath.setter
    def folderAbsolutePath(self, val):
        self.__folderAbsolutePath = val

    @property
    def fileServerPath(self):
        return self.__fileServerPath

    @fileServerPath.setter
    def fileServerPath(self, val):
        self.__fileServerPath = val

    @property
    def downloadPath(self):
        return self.__downloadPath

    @downloadPath.setter
    def downloadPath(self, val):
        self.__downloadPath = val

    @property
    def notebookPath(self):
        return self.__notebookPath

    @notebookPath.setter
    def notebookPath(self, val):
        self.__notebookPath = val

    @property
    def notebookFile(self):
        return self.__notebookFile

    @notebookFile.setter
    def notebookFile(self, val):
        self.__notebookFile = val

    @property
    def year(self):
        return self.__year

    @year.setter
    def year(self, val):
        self.__year = val

    def __hash__(self):
        return hash(self.__title)

    def __eq__(self, other):
        return self.__title == other.__title


class PaperDetails(object):
    def __init__(self):
        self.id = ""
        self.title = ""
        self.tags = []
        self.collections = []
        self.authors = []
        self.publication = ""
        self.abstract = ""
        self.doi = ""
        self.serverPath = ""
        self.folderAbsolutePath = ""
        self.fileServerPath = ""
        self.downloadPath = ""
        self.notebookPath = ""
        self.notebookFile = ""
        self.cite = ""
        self.heads = ""
        self.charts = []
        self.datasets = []
        self.workflows = []
        self.scripts = []
        self.tools = []
        self.year = 0
        self.timeStamp = ""

    @property
    def id(self):
        return self.__id

    @id.setter
    def id(self, val):
        self.__id = val

    @property
    def title(self):
        return self.__title

    @title.setter
    def title(self, val):
        self.__title = val

    @property
    def tags(self):
        return self.__tags

    @tags.setter
    def tags(self, val):
        self.__tags = val

    @property
    def collections(self):
        return self.__collections

    @collections.setter
    def collections(self, val):
        self.__collections = val

    @property
    def authors(self):
        return self.__authors

    @authors.setter
    def authors(self, val):
        self.__authors = val

    @property
    def publication(self):
        return self.__publication

    @publication.setter
    def publication(self, val):
        self.__publication = val

    @property
    def abstract(self):
        return self.__abstract

    @abstract.setter
    def abstract(self, val):
        self.__abstract = val

    @property
    def doi(self):
        return self.__doi

    @doi.setter
    def doi(self, val):
        self.__doi = val

    @property
    def serverPath(self):
        return self.__serverPath

    @serverPath.setter
    def serverPath(self, val):
        self.__serverPath = val

    @property
    def folderAbsolutePath(self):
        return self.__folderAbsolutePath

    @folderAbsolutePath.setter
    def folderAbsolutePath(self, val):
        self.__folderAbsolutePath = val

    @property
    def fileServerPath(self):
        return self.__fileServerPath

    @fileServerPath.setter
    def fileServerPath(self, val):
        self.__fileServerPath = val

    @property
    def downloadPath(self):
        return self.__downloadPath

    @downloadPath.setter
    def downloadPath(self, val):
        self.__downloadPath = val

    @property
    def notebookPath(self):
        return self.__notebookPath

    @notebookPath.setter
    def notebookPath(self, val):
        self.__notebookPath = val

    @property
    def notebookFile(self):
        return self.__notebookFile

    @notebookFile.setter
    def notebookFile(self, val):
        self.__notebookFile = val

    @property
    def year(self):
        return self.__year

    @year.setter
    def year(self, val):
        self.__year = val

    @property
    def cite(self):
        return self.__cite

    @cite.setter
    def cite(self, val):
        self.__cite = val

    @property
    def imageFile(self):
        return self.__imageFile

    @imageFile.setter
    def imageFile(self, val):
        self.__imageFile = val

    @property
    def charts(self):
        return self.__charts

    @charts.setter
    def charts(self, val):
        self.__charts = val

    @property
    def datasets(self):
        return self.__datasets

    @datasets.setter
    def datasets(self, val):
        self.__datasets = val

    @property
    def scripts(self):
        return self.__scripts

    @scripts.setter
    def scripts(self, val):
        self.__scripts = val

    @property
    def tools(self):
        return self.__tools

    @tools.setter
    def tools(self, val):
        self.__tools = val

    @property
    def workflows(self):
        return self.__workflows

    @workflows.setter
    def workflows(self, val):
        self.__workflows = val

    @property
    def heads(self):
        return self.__heads

    @heads.setter
    def heads(self, val):
        self.__heads = val

    @property
    def timeStamp(self):
        return self.__timeStamp

    @timeStamp.setter
    def timeStamp(self, val):
        self.__timeStamp = val

class WorkflowInfo:
    """Collects info for workflow
    """
    paperTitle = ""
    edges = []
    nodes = {}
    workflowType = ""

class WorkflowNodeInfo:
    """Collects node info
    """
    toolTip = ""
    details = []
    notebookFile = ""
    fileServerPath = ""
    nodelabel = ""
    hasNotebookFile = False