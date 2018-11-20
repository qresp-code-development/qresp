import traceback

from flask import render_template, request, flash, redirect, url_for, jsonify

from .modules.servers import *
from .paperdao import *
from .views import *


class InvalidUsage(Exception):
    status_code = 400

    def __init__(self, message, status_code=None, payload=None):
        Exception.__init__(self)
        self.message = message
        if status_code is not None:
            self.status_code = status_code
        self.payload = payload

    def to_dict(self):
        rv = dict(self.payload or ())
        rv['message'] = self.message
        return rv


@app.errorhandler(InvalidUsage)
def handle_invalid_usage(error):
    response = jsonify(error.to_dict())
    response.status_code = error.status_code
    return response


# Fetches list of qresp servers
@app.route('/')
@app.route('/index')
def index():
    serverslist = Servers()
    return render_template('index.html', serverslist=serverslist.getServersList())


# Fetches list of qresp servers
@app.route('/test')
def test():
    return render_template('test.html')


# Fetches list of qresp admin
@app.route('/admin', methods=['POST', 'GET'])
def admin():
    """ This method helps in connecting to the mongo database.
    :return:
    """
    form = AdminForm(request.form)
    if request.method == 'POST' and form.validate():
        flash('Connected')
        try:
            dbAdmin = MongoDBConnection(hostname=form.hostname.data, port=int(form.port.data),
                                        username=form.username.data, password=form.password.data,
                                        dbname=form.dbname.data, collection=form.collection.data, isssl=form.isSSL.data)
            return redirect(url_for('index'))
        except ConnectionError as e:
            raise InvalidUsage('Could not connect to server, \n ' + str(e), status_code=410)

    ##### To be removed ###########
    form.hostname.data = "paperstack.uchicago.edu"
    form.port.data = "27017"
    form.username.data = "qresp_user_explorer"
    form.password.data = "qresp_pwd"
    form.dbname.data = "explorer"
    form.collection.data = "paper"
    return render_template('admin.html', form=form)


# Fetches search options after selecting server
@app.route('/search', methods=['POST', 'GET'])
def search():
    """  This method helps in filtering paper content
    :return: template: search.html
    """
    try:
        db = MongoDBConnection(hostname="paperstack.uchicago.edu", port=int("27017"), username="qresp_user_explorer",
                               password="qresp_pwd", dbname="explorer", collection="paper", isssl="No")
        dao = PaperDAO()
        return render_template('search.html',
                               collectionlist=dao.getCollectionList(), authorslist=dao.getAuthorList(),
                               publicationlist=dao.getPublicationList(), allPapersSize=len(dao.getAllSearchObjects()))
    except Exception as e:
        print(e)
        print(traceback.format_exc())
        flash('Error in search. ' + str(e))
        return render_template('search.html')


# Fetches search word options after selecting server
@app.route('/searchWord', methods=['POST', 'GET'])
def searchWord():
    """  This method helps in filtering paper content
    :return: object: allpaperlist
    """
    try:
        dao = PaperDAO()
        searchWord = request.args.get('searchWord', type=str)
        paperTitle = request.args.get('paperTitle', type=str)
        doi = request.args.get('doi', type=str)
        tags = request.args.get('tags', type=str)
        collectionList = json.loads(request.args.get('collectionList'))
        authorsList = json.loads(request.args.get('authorsList'))
        publicationList = json.loads(request.args.get('publicationList'))
        print("Items>>", searchWord, "items1>>", paperTitle, "items2>>", doi, "items3>>", tags, "items4>>",
              collectionList, "items5>>", authorsList, "items6>>", publicationList)
        allpaperslist = dao.getAllFilteredSearchObjects(searchWord, paperTitle, doi, tags, collectionList, authorsList,
                                                        publicationList)
        return jsonify(allpaperslist=allpaperslist)
    except Exception as e:
        print(e)
        print(traceback.format_exc())
        flash('Error in search. ' + str(e))


# Fetches details of chart based on user click
@app.route('/paperdetails/<paperid>', methods=['POST', 'GET'])
def paperdetails(paperid):
    """  This method helps in fetching papers details content
    :return: template: paperdetails.html
    """
    try:
        dao = PaperDAO()
        paperdetail = dao.getPaperDetails(paperid)
        workflowdetail = dao.getWorkflowDetails(paperid)
        return render_template('paperdetails.html', paperdetail=paperdetail, workflowdetail=workflowdetail)
    except Exception as e:
        print(e)
        flash('Error in paperdetails. ' + str(e))


# Fetches workflow of chart based on user click
@app.route('/charworkflow', methods=['POST', 'GET'])
def charworkflow():
    """  This method helps in fetching chart workflow content
    :return: object: chartworkflow
    """
    try:
        dao = PaperDAO()
        paperid = request.args.get('paperid', 0, type=str)
        paperid = str(paperid).strip()
        chartid = request.args.get('chartid', 0, type=str)
        chartid = str(chartid).strip()
        chartworkflowdetail = dao.getWorkflowForChartDetails(paperid, chartid)
        return jsonify(chartworkflowdetail=chartworkflowdetail)
    except Exception as e:
        print(e)
        flash('Error in paperdetails. ' + str(e))
