import os
import unittest
import json
from project import app
from project.views import *
from project.util import ConvertField
from project import constants as CURATOR_FIELD
from project.config import Config
import ast
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
        Config.initialize('project/config_mock.ini')
        self.pagenames = ['/','qrespcurator','startfromscratch','getTreeInfo','addToWorkflow','mint',
                          'preview/files_paper','previewchartworkflow?paperid=files_paper&chartid=c0',
                          'qrespexplorer','search?servers=https%3A%2F%2Fpaperstack.uchicago.edu','searchWord?searchWord=&paperTitle=&tags=&doi=&collectionList=[]&authorsList=[]&publicationList=[]',
                          'paperdetails/5941869f1bd40fd44db0024a','chartworkflow?paperid=5941869f1bd40fd44db0024a&chartid=c0',
                          'insertDOI?paperId=5941869f1bd40fd44db0024a&doi=25678','oauth2callback']

        __location__ = os.path.realpath(
            os.path.join(os.getcwd(), os.path.dirname(__file__)))
        with open(os.path.join(__location__, 'data.json')) as f:
            paperdata = json.load(f)
        paperdata = ConvertField.convertToString(["files", "properties", "URLs", "patches"],
                                                 [CURATOR_FIELD.CHARTS, CURATOR_FIELD.TOOLS, CURATOR_FIELD.DATASETS,
                                                  CURATOR_FIELD.SCRIPTS, CURATOR_FIELD.HEADS],
                                                 paperdata)
        paperform = PaperForm(**paperdata)
        detailsform = DetailsForm(**paperform.info.insertedBy.data)
        serverform = ServerForm(**{'hostUrl':'https://notebook.rcc.uchicago.edu/files'})
        chartform = {'id': 'c0', 'caption': 'chart 1', 'number': '1', 'files': 'charts/figure1/figure1.csv, charts/figure1/figure1.ipynb, charts/figure1/figure1.jpg', 'imageFile': 'charts/figure1/figure1.jpg', 'notebookFile': 'charts/figure1/figure1.ipynb', 'properties': 'potential energy, band gap'}
        toolform = {'id': 't0', 'kind': 'software', 'packageName': 'West', 'URLs': '', 'version': '3.0.0', 'programName': 'wstat.x', 'patches': 'tools/modded_qbox.diff', 'description': 'Modified west code', 'facilityName': '', 'measurement': ''}
        datasetform =  {'id': 'd0', 'files': 'datasets/datasetA.dat, datasets/datasetB.dat', 'readme': 'DAT files', 'URLs': ''}
        scriptform =  {'id': 'd0', 'files': 'datasets/datasetA.dat, datasets/datasetB.dat', 'readme': 'DAT files', 'URLs': ''}
        referenceform = {'kind': 'journal', 'DOI': '10.1021/jacs.6b00225', 'title': 'Photoelectron Spectra of Aqueous Solutions from First Principles', 'page': '6912-6915', 'publishedAbstract': 'We present a combined computational and experimental study of the photoelectron spectrum of a simple aqueous solution of NaCl. Measurements were conducted on microjets, and first-principles calculations were performed using hybrid functionals and many-body perturbation theory at the G0W0 level, starting with wave functions computed in ab initio molecular dynamics simulations. We show excellent agreement between theory and experiments for the positions of both the solute and solvent excitation energies on an absolute energy scale and for peak intensities. The best comparison was obtained using wave functions obtained with dielectric-dependent self-consistent and range-separated hybrid functionals. Our computational protocol opens the way to accurate, predictive calculations of the electronic properties of electrolytes, of interest to a variety of energy problems.', 'volume': '138', 'year': 2016, 'URLs': 'http://dx.doi.org/10.1021/jacs.6b00225', 'school': ''}
        documentationform = DocumentationForm(**paperform.documentation.data)
        adminform = {'hostname':'mongomock://localhost', 'port':27017,
                                          'username':None, 'password':None,
                                          'dbname':'mongoenginetest', 'collection':'paper'}
        self.postPageForms = {'uploadFile':paperform,'details':detailsform,'server':serverform,'charts':chartform,'charts/delete':chartform,
                              'tools':toolform,'tools/delete':toolform,'datasets':datasetform,'datasets/delete':datasetform,
                              'scripts':scriptform,'scripts/delete':scriptform,'reference':referenceform,'fetchReferenceDOI':{'doi':'10.1021/nl903868w'},
                              'documentation':documentationform,'addToWorkflow':{},'saveNodesAndEdges':[['t0','d0'],[{'id':'t0'},{'id':'d0'}]],
                              'publish':{},'download':{},'verifyPasscode':{'passcode':'123456'},'admin':adminform,'getDescriptor':{"metadata":paperform.data}}

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
            if 'insertDOI' in pagename:
                self.assertGreaterEqual(response.status_code,200)
            else:
                self.assertEquals(response.status_code,200)

    def test_postMethods(self):
        for pagename in self.postPageForms.keys():
            form = self.postPageForms[pagename]
            if 'charts' in pagename or 'tools' in pagename or 'scripts' in pagename or 'datasets' in pagename \
                    or 'reference' in pagename or 'addToWorkflow' in pagename or 'admin' in pagename \
                    or 'verifyPasscode' in pagename:
                response = self.client.post(pagename, data=form)
            elif 'uploadFile' in pagename:
                data = json.dumps(form.data).replace("''", '""')
                response = self.client.post(pagename, data=json.dumps(data), content_type='application/json')
            elif 'fetchReferenceDOI' in pagename or 'publish' in pagename or 'download' in pagename \
                or 'saveNodesAndEdges' in pagename or 'getDescriptor' in pagename:
                response = self.client.post(pagename, data=json.dumps(form), content_type='application/json')
            else:
                response = self.client.post(pagename,data=form.data)
            if 'reference' in pagename or 'publish' in pagename or 'verifyPasscode' in pagename:
                self.assertEqual(response.status_code, 400)
            else:
                self.assertEqual(response.status_code, 200)

if __name__ == "__main__":
    unittest.main()
