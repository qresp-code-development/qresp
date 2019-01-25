import os
import unittest
import json
from project import app
from project.views import *
from flask import Flask, request, jsonify


class RouteTests(unittest.TestCase):
    ############################
    #### setup and teardown ####
    ############################

    # executed prior to each test
    def setUp(self):

        self.app = self.create_app()
        self.client = app.test_client()
        self.ctx = self.app.test_request_context()
        self.ctx.push()

        self.pagenames = ['/','qrespcurator','startfromscratch','details','server','project','curate','workflow','publish',
                          'acknowledgement','qrespexplorer','admin','search',
                          'searchWord?searchWord=&paperTitle=&tags=&doi=&collectionList=[]&authorsList=[]&publicationList=[]',
                          'paperdetails/5941869f1bd40fd44db0024a','chartworkflow?paperid=5941869f1bd40fd44db0024a&chartid=c0']

        postpagedicts = {'details':{'firstName':'John','middleName':'L','lastName':'Doe'},
                         'server':{'serverName':'testServer','username':'testuser','password':'testpassword','isDUOAuth':'No'},
                         'charts':{'caption':'cc','number':'1','files':'a,b','imageFile':'a.png','properties':'1,2','saveas':'c0'},
                         'tools':{'packageName':'West','version':'v0','facilityName':'Xray','measurement':'xray','saveas':'t0'},
                         'datasets':{'files':'a,b','readme':'readdata','saveas':'d0'},
                         'scripts':{'files':'a,b','readme':'readdata','saveas':'s0'},
                         'reference':{'DOI':'doi/10.123','title':'Test','page':'1','publishedAbstract':'Abs','volume':'1','year':2019},
                         'fetchReferenceDOI':{},
                         'documentation':{'readme':'read'},
                         'publish':{},
                         'download':{}}

        nameform = NameForm()
        nameform.firstName.data = 'John'
        nameform.middleName.data = 'L.'
        nameform.lastName.data = 'Doe'
        detailsform = DetailsForm(**postpagedicts['details'])
        serverform = ServerForm(**postpagedicts['server'])
        chartform = ChartForm(**postpagedicts['charts'])
        chartform.extraFields.entries = []
        toolform = ToolForm(**postpagedicts['tools'])
        toolform.extraFields.entries = []
        datasetform = DatasetForm(**postpagedicts['datasets'])
        datasetform.extraFields.entries = []
        scriptform = ScriptForm(**postpagedicts['scripts'])
        scriptform.extraFields.entries = []
        referenceform = ReferenceForm(**postpagedicts['reference'])
        referenceform.authors.entries = []
        referenceform.journal.abbrevName.data = 'JAbbr'
        referenceform.journal.fullName.data = 'JFull'
        documentationform = DocumentationForm(**postpagedicts['documentation'])
        self.postPageForms = {'details':detailsform,'server':serverform,'charts':chartform,'tools':toolform,
                              'datasets':datasetform,'scripts':scriptform,'fetchReferenceDOI':{'doi':'10.1021/nl903868w'},
                              'documentation':documentationform,'workflow':[['to','do'],['to','do']],
                              'publish':{},'download':{}}

    # executed after each test
    def create_app(self):
        app = Flask(__name__)
        app.secret_key = "secret"
        return app

    def tearDown(self):
        self.ctx.pop()

    def request(self,*args, **kwargs):
        return self.app.test_request_context(*args, **kwargs)

    def test_getMethods(self):
        for pagename in self.pagenames:
            response = self.client.get(pagename, follow_redirects=True)
            self.assertEquals(response.status_code,200)


    def test_postMethods(self):
        for pagename in self.postPageForms.keys():
            form = self.postPageForms[pagename]
            if 'fetchReferenceDOI' in pagename or 'workflow' in pagename or 'publish' in pagename or 'download' in pagename:
                response = self.client.post(pagename, data=json.dumps(form), content_type='application/json')
            else:
                response = self.client.post(pagename,data=form.data)
            if 'details' in pagename:
                self.assertEqual(response.status_code, 302)
            else:
                self.assertEqual(response.status_code, 200)



if __name__ == "__main__":
    unittest.main()
