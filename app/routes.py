import traceback

from flask import render_template, request, flash, redirect, url_for, jsonify, session
from datetime import timedelta
from app import csrf
from copy import deepcopy

from .modules.servers import *
from .paperdao import *
from .views import *
from .util import *

qresp_config = {}


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


@app.before_request
def make_session_permanent():
    session.permanent = True
    app.permanent_session_lifetime = timedelta(days=1)

# Fetches list of qresp servers
@app.route('/')
@app.route('/index')
def index():
    """
    Fetches the homepage
    :return:
    """
    return render_template('index.html')

# Fetches list of qresp servers for the explorer
@app.route('/qrespexplorer')
def qrespexplorer():
    """
    Fetches the explorer homepage
    """
    serverslist = Servers()
    return render_template('qrespexplorer.html', serverslist=serverslist.getServersList())

# Fetches the curator homepage
@app.route('/qrespcurator')
def qrespcurator():
    """
    Fetches the curator homepage
    """
    return render_template('qrespcurator.html')

# Fetches the curator homepage
@csrf.exempt
@app.route('/uploadFile',methods=['POST','GET'])
def uploadFile():
    """
    Upload file text
    """
    uploadJSON = json.loads(request.get_json())
    print(uploadJSON)
    paperform = PaperForm(**uploadJSON)
    print(paperform.data)
    session["paper"] = paperform.data
    session["details"] = paperform.info.insertedBy.data
    print(session.get("details"))
    # except Exception as e:
    #     flash("Could not parse JSON "+ str(e))
    return jsonify(out="done")


@app.route('/details', methods=['POST', 'GET'])
def details():
    """ This method helps in storing the details of the curator.
    :return:
    """
    form = DetailsForm(request.form)
    if request.method == 'POST' and form.validate():
        session["details"] = form.data
        return redirect(url_for('server'))
    elif session.get("details"):
        detailsForm = session.get("details")
        form = DetailsForm(**detailsForm)
    return render_template('details.html', form=form)

@app.route('/server', methods=['POST', 'GET'])
def server():
    """ This method helps in connecting to the server.
    :return:
    """
    form = ServerForm(request.form)
    if request.method == 'POST' and form.validate():
        print("details",session["details"])
        session["server"] = form.data
        return redirect(url_for('project'))
    elif session.get("server"):
        serverForm = session.get("server")
        form = ServerForm(**serverForm)
    return render_template('server.html', form=form)

@app.route('/project', methods=['POST', 'GET'])
def project():
    """ This method helps in connecting to the server.
    :return: template project.html
    """
    form = ProjectForm(request.form)
    if session.get("project"):
        projForm = session.get("project")
        projectForm = ProjectForm(**projForm)
        form = projectForm
    elif session.get("server"):
        listObjects = []
        serverForm = session.get("server")
        serverform = ServerForm(**serverForm)
        servername = serverform.serverName.data
        username = serverform.username.data
        password = serverform.password.data
        content_path = form.fileServerPath.data
        try:
            if content_path:
                if "/" in content_path:
                    form.ProjectName.data = content_path.rsplit("/", 1)[1]
                else:
                    form.ProjectName.data = content_path
                path =content_path
            else:
                path = "."
            openFileToReadConfig(str(path.rsplit("/", 1)[0]), "qresp.ini", servername, username, password, form)
        except Exception as e:
            flash("Could not connect to server "+str(e))
    return render_template('project.html', fileServerPath=form.fileServerPath.data,gitPath=form.gitPath.data, downloadPath=form.downloadPath.data)

@app.route('/getTreeInfo', methods=['POST', 'GET'])
def getTreeInfo():
    """
    Renders the Tree containing Project Information which is 'SSH'ed with the remote directory.
    :return:
    """
    path = request.get_json()
    listObjects = []
    try:
        sessionServerForm = session.get("server")
        serverform = ServerForm(**sessionServerForm)
        servername = serverform.serverName.data
        username = serverform.username.data
        password = serverform.password.data
        ssh = connectToServer(servername,username,password)
        ftp = ssh.open_sftp()
        for f in ftp.listdir_attr(path):
            dataFile = DirectoryTree()
            lstatout = str(f).split()[0]
            file = str(f).split()[8]
            if "qresp.ini" in file:
                projForm = session.get("project")
                projectForm = ProjectForm(**projForm)
                services = openFileToReadConfig(path, "qresp.ini", servername, username, password, projectForm)
            dataFile.title = file
            parent = path.split("/")
            parentName = parent[len(parent) - 1]
            dataFile.key = path + "/" + file
            dataFile.id = file
            relPath = str(path + "/" + file).split(parentName, 1)[1]
            dataFile.parent = parentName + "/" + relPath
            if 'd' in lstatout:
                prev = file
                dataFile.folder = "true"
                dataFile.lazy = 'true'
            listObjects.append(dataFile.__dict__)
        ssh.close()
    except Exception as e:
        flash("You have no access rights. Please recheck your credentials.")
        ssh.close()
    return jsonify(listObjects=listObjects)

@app.route('/curate', methods=['POST', 'GET'])
def curate():
    """ This method helps in connecting to the server.
    :return:
    """
    infoform = InfoForm(request.form)
    chartform = ChartForm(request.form)
    toolform = ToolForm(request.form)
    datasetform = DatasetForm(request.form)
    scriptform = ScriptForm(request.form)
    referenceform = ReferenceForm(request.form)
    chartlist = []
    toollist = []
    datasetlist = []
    scriptlist = []
    if session.get("info"):
        sessionInfoForm = session.get("info")
        infoform = InfoForm(**sessionInfoForm)
    if session.get("charts",[]):
        chartlist = deepcopy(session.get("charts",[]))
    if session.get("tools",[]):
        toollist = deepcopy(session.get("tools",[]))
    if session.get("datasets",[]):
        datasetlist = deepcopy(session.get("datasets",[]))
    if session.get("scripts",[]):
        scriptlist = deepcopy(session.get("scripts",[]))
    return render_template('curate.html',infoform=infoform,chartlistform=chartlist,chartform=chartform,
                           toollistform=toollist,toolform=toolform,datalistform=datasetlist,datasetform=datasetform,
                           scriptlistform=scriptlist,scriptform=scriptform,referenceform=referenceform)

@csrf.exempt
@app.route('/info', methods=['POST', 'GET'])
def info():
    """ This method helps in connecting to the server.
    :return:
    """
    infoform = InfoForm(request.form)
    if request.method == 'POST' and infoform.validate():
        session["info"] = infoform.data
        msg = "Info Saved"
        return jsonify(data=msg)
    return jsonify(data=infoform.errors)

@csrf.exempt
@app.route('/charts', methods=['POST', 'GET'])
def charts():
    """ This method helps in connecting to the server.
    :return:
    """
    chartform = ChartForm(request.form)
    chartform.id.data = chartform.saveas.data
    if request.method == 'POST' and chartform.validate():
        chartList = deepcopy(session.get("charts", []))
        print("len>>", len(chartList))
        print(chartList)
        if len(chartList) <  1:
            chartList.append(chartform.data)
            session["charts"] = deepcopy(chartList)
        else:
            idList = [eachchart['id'] for eachchart in chartList]
            id = chartform.id.data
            saveas = chartform.saveas.data
            if id not in idList:
                chartList.append(chartform.data)
                session["charts"] = deepcopy(chartList)
                print("here00>>",chartList)
                print("here11>>",session.get("charts"))
        return jsonify(chartList = chartList)
    return jsonify(data=chartform.errors)

@csrf.exempt
@app.route('/tools', methods=['POST', 'GET'])
def tools():
    """ This method helps in populating tools section in the curator.
    :return:
    """
    toolform = ToolForm(request.form)
    toolform.id.data = toolform.saveas.data
    if request.method == 'POST' and toolform.validate():
        toolList = deepcopy(session.get("tools", []))
        print(toolList)
        if len(toolList) <  1:
            toolList.append(toolform.data)
            session["tools"] = deepcopy(toolList)
        else:
            idList = [eachtool['id'] for eachtool in toolList]
            id = toolform.id.data
            saveas = toolform.saveas.data
            if id not in idList:
                toolList.append(toolform.data)
                session["tools"] = deepcopy(toolList)
                print("here00>>",toolList)
                print("here11>>",session.get("tools"))
        return jsonify(toolList = toolList)
    return jsonify(data=toolform.errors)

@csrf.exempt
@app.route('/datasets', methods=['POST', 'GET'])
def datasets():
    """ This method helps in populating datasets section in the curator.
    :return:
    """
    datasetform = DatasetForm(request.form)
    datasetform.id.data = datasetform.saveas.data
    if request.method == 'POST' and datasetform.validate():
        datasetList = deepcopy(session.get("datasets", []))
        print("len>>", len(datasetList))
        print(datasetList)
        if len(datasetList) <  1:
            datasetList.append(datasetform.data)
            session["datasets"] = deepcopy(datasetList)
        else:
            idList = [eachdataset['id'] for eachdataset in datasetList]
            id = datasetform.id.data
            saveas = datasetform.saveas.data
            if id not in idList:
                datasetList.append(datasetform.data)
                session["datasets"] = deepcopy(datasetList)
        return jsonify(datasetList = datasetList)
    return jsonify(data=datasetform.errors)

@csrf.exempt
@app.route('/scripts', methods=['POST', 'GET'])
def scripts():
    """ This method helps in populating scripts section in the curator.
    :return:
    """
    scriptform = ScriptForm(request.form)
    scriptform.id.data = scriptform.saveas.data
    if request.method == 'POST' and scriptform.validate():
        scriptList = deepcopy(session.get("scripts", []))
        print(scriptList)
        if len(scriptList) <  1:
            scriptList.append(scriptform.data)
            session["scripts"] = deepcopy(scriptList)
        else:
            idList = [eachscript['id'] for eachscript in scriptList]
            id = scriptform.id.data
            saveas = scriptform.saveas.data
            if id not in idList:
                scriptList.append(scriptform.data)
                session["scripts"] = deepcopy(scriptList)
        return jsonify(scriptList = scriptList)
    return jsonify(data=scriptform.errors)

# @csrf.exempt
# @app.route('/workflow', methods=['POST', 'GET'])
# def workflow():
#     """Collects and Returns values needed for the Workflow section.
# 	:return: Information of the various nodes and edges - Dictionary
# 	"""
#
#     if request.method == 'GET':
#         return render_template('workflow.html')
#
#     workflowsave = request.json
#
#     c = -1
#     d = -1
#     s = -1
#     t = -1
#     h = -1
#
#     workflow = WorkflowCreator()
#
#
#     for chart in chartMap:
#             if pid in chart:
#                 charts = Chart("figure")
#                 charts = copy(chartMap[chart])
#                 charts = charts.__dict__
#                 c = c + 1
#                 caption = ""
#                 try:
#                     fileserverpathkey = 'fileServerPath' + str(pid)
#                     projkey = 'ProjectName' + str(pid)
#                     fileServerPath = store.get(fileserverpathkey)
#                     projectName = store.get(projkey)
#                     img = '<img src="' + fileServerPath + "/" + projectName + "/" + charts['desc'][
#                         'imageFile'] + '" width="250px;" height="250px;"/>'
#                     caption = "<b> Image: </b>" + img
#                 except:
#                     caption = ""
#                 workflow.addChart(charts['desc']['saveas'], caption)
#         for tool in toolsMap:
#             if pid in tool:
#                 tools = Tool("experiment")
#                 tools = copy(toolsMap[tool])
#                 tools = tools.__dict__
#                 t = t + 1
#                 pack = ""
#                 try:
#                     pack = "<b> Package Name: </b>" + tools['desc']['packageName']
#                 except(IndexError, KeyError, ValueError):
#                     try:
#                         pack = "<b> Facility Name: </b>" + tools['desc'][
#                             'facilityName'] + " <br/> <b>Measurement: </b>" + tools['desc']['measurement']
#                     except(IndexError, KeyError, ValueError):
#                         pack = ""
#                 workflow.addTool(tools['desc']['saveas'], pack)
#
#         for dataset in datasetsMap:
#             if pid in dataset:
#                 datasets = Dataset()
#                 datasets = copy(datasetsMap[dataset])
#                 datasets = datasets.__dict__
#                 d = d + 1
#                 readme = ""
#                 try:
#                     readme = "<b> ReadMe: </b>" + datasets['desc']['readme']
#                 except(IndexError, KeyError, ValueError):
#                     readme = ""
#                 workflow.addDataset(datasets['desc']['saveas'], readme)
#
#         for script in scriptsMap:
#             if pid in script:
#                 scripts = Script()
#                 scripts = copy(scriptsMap[script])
#                 scripts = scripts.__dict__
#
#                 s = s + 1
#                 readme = ""
#                 try:
#                     readme = "<b> ReadMe: </b>" + scripts['desc']['readme']
#                 except(IndexError, KeyError, ValueError):
#                     readme = ""
#                 workflow.addScript(scripts['desc']['saveas'], readme)
#
#         for head in headMap:
#             if pid in head:
#                 heads = Head()
#                 heads = copy(headMap[head])
#                 heads = heads.__dict__
#                 h = h + 1
#                 readme = ""
#                 try:
#                     readme = "<b>ReadMe:</b>" + heads['desc']['readme']
#                 except(IndexError, KeyError, ValueError):
#                     readme = ""
#                 saveas = head.split("*")
#                 if 'URLs' in heads['desc'] and stripWord(heads['desc']['URLs']):
#                     workflow.addHead(saveas[0], readme, stripWord(heads['desc']['URLs']))
#                 else:
#                     workflow.addHead(saveas[0], readme)
#
#         if pid in edgeMap:
#             listedges = edgeMap[pid]
#             for edges in listedges:
#                 workflow.addEdge(edges)
#
#     if "POST" in type:
#         headMap.clear()
#         try:
#             listConn = str(workflowsave[2])
#             edgeMap[str(pid)] = workflowsave[2]
#             for edges in workflowsave[2]:
#                 workflow.addEdge(edges)
#
#         except(IndexError, KeyError, ValueError):
#             listConn = ""
#         try:
#             headInfo = str(workflowsave[3])
#             for head in ast.literal_eval(headInfo):
#                 headers = Head()
#                 hinfo = head.split("*")
#                 try:
#                     if hinfo[1] and not hinfo[1].isspace():
#                         headers.addReadme(str(hinfo[1]).strip('b>'))
#                 except(IndexError, KeyError, ValueError):
#                     print("No readme")
#                 try:
#                     if hinfo[2] and not hinfo[2].isspace():
#                         if "," in hinfo[2]:
#                             for info in hinfo[2].split(","):
#                                 headers.addURL(str(info).strip())
#                         else:
#                             headers.addURL(str(hinfo[2]).strip())
#                 except(IndexError, KeyError, ValueError):
#                     print("No Url")
#                 headMap[str(hinfo[0]) + "*" + str(pid)] = headers
#         except(IndexError, KeyError, ValueError):
#             headInfo = ""
#         workflowMap[str(pid)] = listConn + "**" + headInfo
#     return jsonify({'workflow': workflow.__dict__})


#######################################EXPLORER#########################################################################




@csrf.exempt
@app.route('/verifyPasscode',methods=['POST','GET'])
def verifypasscode():
    """ This method verifies with input passcode of flask connection.
    :return:
    """
    form = PassCodeForm(request.form)
    confirmpasscode = app.config['passkey']
    if request.method == 'POST' and form.validate():
        print("here>",confirmpasscode)
        print("here1>",form.passcode.data)
        if confirmpasscode == form.passcode.data:
            return jsonify(msg="success")
    else:
        print("why")
    return jsonify(msg="failed")

# Fetches list of qresp admin
@csrf.exempt
@app.route('/admin', methods=['POST', 'GET'])
def admin():
    """ This method helps in connecting to the mongo database.
    :return:
    """
    form = AdminForm(request.form)
    verifyform = PassCodeForm(request.form)
    if request.method == 'POST' and form.validate():
        flash('Connected')
        try:
            dbAdmin = MongoDBConnection(hostname=form.hostname.data, port=int(form.port.data),
                                        username=form.username.data, password=form.password.data,
                                        dbname=form.dbname.data, collection=form.collection.data, isssl=form.isSSL.data)
            return redirect(url_for('config'))
        except ConnectionError as e:
            raise InvalidUsage('Could not connect to server, \n ' + str(e), status_code=410)

    ##### To be removed ###########
    form.hostname.data = "paperstack.uchicago.edu"
    form.port.data = "27017"
    form.username.data = "qresp_user_explorer"
    form.password.data = "qresp_pwd"
    form.dbname.data = "explorer"
    form.collection.data = "paper"
    return render_template('admin.html', form=form,verifyform =verifyform )

# Fetches list of qresp admin
@app.route('/config', methods=['POST', 'GET'])
def config():
    """ This method helps in connecting to the mongo database.
    :return:
    """
    global qresp_config
    form = AdminForm(request.form)
    ##### To be removed ###########
    form.hostname.data = "paperstack.uchicago.edu"
    form.port.data = "27017"
    form.username.data = "qresp_user_explorer"
    form.password.data = "qresp_pwd"
    form.dbname.data = "explorer"
    form.collection.data = "paper"
    return render_template('qrespconfig.html', form=form)


# Fetches search options after selecting server
@csrf.exempt
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
@csrf.exempt
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
        allpaperslist = dao.getAllFilteredSearchObjects(searchWord, paperTitle, doi, tags, collectionList, authorsList,
                                                        publicationList)
        return jsonify(allpaperslist=allpaperslist)
    except Exception as e:
        print(e)
        print(traceback.format_exc())
        flash('Error in search. ' + str(e))


# Fetches details of chart based on user click
@csrf.exempt
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
@csrf.exempt
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
