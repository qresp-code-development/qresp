from .charts import *
from .datasets import *
from .documentation import *
from .filterquery import *
from .heads import *
from .info import *
from .reference import *
from .scripts import *
from .tools import *
from .workflow import *


class Paper(Document):
    version = LongField()
    pis = ListField(EmbeddedDocumentField(Person))
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
    tags = ListField()
    versions = ListField()
    meta = {'strict': False,
            'queryset_class': FilterQuerySet}
