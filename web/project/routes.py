# system imports
import os
import uuid
import smtplib
import urllib.parse
import traceback
import sys
from datetime import timedelta, datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from flask import render_template, request, flash, redirect, url_for, jsonify, session,send_file, abort
from project import app
from project.paperdao import *
from project.util import *
from project.views import *
from project.db import *
from project import constants as CURATOR_FIELD
from project.config import Config
from copy import deepcopy

@app.before_request
def make_session_permanent():
    """
    Makes session values last for a day, session data is stored in the server
    """
    session.permanent = True
    app.permanent_session_lifetime = timedelta(days=1)

@app.route('/')
@app.route('/index')
def index():
    """
    Fetches the homepage
    """
    return render_template('index.html')

@app.route('/uploadFile',methods=['POST','GET'])
def uploadFile():
    """
    Renders and stores uploaded file text into session
    """
    try:
        uploadJSON = json.loads(request.get_json())

        # Converts list items to string for curator
        paperdata = ConvertField.convertToString(["files", "properties", "URLs", "patches"],
                                               [CURATOR_FIELD.CHARTS, CURATOR_FIELD.TOOLS, CURATOR_FIELD.DATASETS,
                                                CURATOR_FIELD.SCRIPTS, CURATOR_FIELD.HEADS],
                                               uploadJSON)
        paperform = PaperForm(**paperdata)

        # Stores curator information into session
        session[CURATOR_FIELD.DETAILS] = paperform.info.insertedBy.data

        # Stores server information into session
        projectform = ProjectForm(**paperform.info.data)
        session[CURATOR_FIELD.PROJECT] = projectform.data

        # Stores reference information into session
        referenceform = ReferenceForm(**paperform.reference.data)
        session[CURATOR_FIELD.REFERENCE] = referenceform.data

        # Stores project information into session
        infoform = InfoForm(**paperform.data)
        infoform.tags.data = ", ".join(paperform.tags.data)
        infoform.collections.data = ", ".join(paperform.collections.data)
        infoform.notebookFile.data = paperform.info.notebookFile.data
        session[CURATOR_FIELD.INFO] = infoform.data

        # Stores charts, tools, datasets, scripts, and workflows into session
        session[CURATOR_FIELD.CHARTS] = [form.data for form in paperform.charts.entries]
        session[CURATOR_FIELD.TOOLS] = [form.data for form in paperform.tools.entries]
        session[CURATOR_FIELD.DATASETS] = [form.data for form in paperform.datasets.entries]
        session[CURATOR_FIELD.SCRIPTS] = [form.data for form in paperform.scripts.entries]
        session[CURATOR_FIELD.HEADS] = [form.data for form in paperform.heads.entries]
        session[CURATOR_FIELD.EDGES] = [form.data for form in paperform.workflow.edges.entries]
        session[CURATOR_FIELD.WORKFLOW] = paperform.workflow.data

        # Stores in documentation
        session[CURATOR_FIELD.DOCUMENTATION] = paperform.documentation.data

        return jsonify(success="success"), 200
    except Exception as e:
        print(e)
        return jsonify(error=str(e)), 400

#@csrf.exempt
@app.route('/startfromscratch')
def startfromscratch():
    """
    Clears session and reloads page
    """
    session.clear()
    return redirect(url_for('qrespcurator'))

#@csrf.exempt
@app.route('/qrespcurator', methods=['GET'])
def qrespcurator():
    """
    Fetches the homepage of the curator
    """
    if request.method == 'GET':
        # Renders the details section
        detailsform = DetailsForm(**session.get(CURATOR_FIELD.DETAILS,request.form))
        # Renders the servers section
        serverform = ServerForm(**session.get(CURATOR_FIELD.SERVERS,request.form))
        serverslist = Servers()
        serverform.hostUrl.choices = [(qrespserver['http_server_url'].strip('/'), qrespserver['http_server_url'].strip('/')) for qrespserver in
                                serverslist.getHttpServersList()]

        # Renders the project section
        projectform = ProjectForm(**session.get(CURATOR_FIELD.PROJECT,request.form))

        # Renders the info section
        infoform = InfoForm(**session.get(CURATOR_FIELD.INFO,request.form))

        # Renders the reference section
        referenceform = ReferenceForm(**session.get(CURATOR_FIELD.REFERENCE,request.form))

        # Renders the charts section
        chartform = ChartForm(request.form)
        chartlist = deepcopy(session.get(CURATOR_FIELD.CHARTS, []))

        # Renders the tools section
        toolform = ToolForm(request.form)
        toollist = deepcopy(session.get(CURATOR_FIELD.TOOLS, []))

        # Renders the datasets section
        datasetform = DatasetForm(request.form)
        datasetlist = deepcopy(session.get(CURATOR_FIELD.DATASETS, []))

        # Renders the scripts section
        scriptform = ScriptForm(request.form)
        scriptlist = deepcopy(session.get(CURATOR_FIELD.SCRIPTS, []))

        # Renders documentation section
        documentationform = DocumentationForm(**session.get(CURATOR_FIELD.DOCUMENTATION,request.form))

        # Renders publish form
        publishform = PublishForm(request.form)
        serverslist = Servers()
        publishform.server.choices = [(qrespserver['qresp_server_url'], qrespserver['qresp_server_url']) for qrespserver in
                               serverslist.getServersList()]

        return render_template('curatordetails.html', detailsform=detailsform, serverform=serverform,
                               projectform=projectform, infoform=infoform, referenceform=referenceform, chartlistform=chartlist, chartform=chartform,
                               toollistform=toollist, toolform=toolform, datasetlistform=datasetlist,
                               datasetform=datasetform, scriptlistform=scriptlist, scriptform=scriptform,
                               documentationform=documentationform, publishform=publishform)


@app.route('/details', methods=['POST'])
def details():
    """
    Stores the details of the curator.
    """
    form = DetailsForm(request.form)
    if request.method == 'POST' and form.validate():
        session[CURATOR_FIELD.DETAILS] = form.data
        return jsonify(data=form.data), 200
    return jsonify(data=form.errors), 400

#
@app.route('/server', methods=['POST'])
def server():
    """
    Stores the server on which data lives
    """
    form = ServerForm(request.form)
    try:
        serverslist = Servers()
        form.hostUrl.choices = [(qrespserver['http_server_url'].strip('/'), qrespserver['http_server_url'].strip('/')) for qrespserver in
                                serverslist.getHttpServersList()]
    except Exception as e:
        raise InvalidUsage('Could not fetch serverlist, \n ' + str(e), status_code=410)
    if request.method == 'POST' and form.validate():
        session[CURATOR_FIELD.SERVERS] = form.data
        return jsonify(data=form.data), 200
    return jsonify(data=form.errors), 400


@app.route('/setproject', methods=['POST'])
def setproject():
    """
    Stores information about the project
    """
    form = ProjectForm(request.form)
    if request.method == 'POST':
        session[CURATOR_FIELD.PROJECT] = form.data
        return jsonify(data=form.data), 200
    return jsonify(data=form.errors), 400


@app.route('/getTreeInfo', methods=['POST', 'GET'])
def getTreeInfo():
    """
    Renders the Tree containing Project Information which is web scraped from the url
    """
    pathDetails = request.get_json()
    listObjects = []
    services = []
    try:
        content_path = pathDetails.get("treeUrl",session.get("project",{}).get("fileServerPath",""))
        dtree = Dtree(content_path)
        if 'zenodo' in content_path:
            listObjects = dtree.fetchForTreeFromZenodo()
        else:
            listObjects = dtree.fetchForTreeFromHttp()
            services = dtree.openFileToReadConfigFromHttp("qresp.ini")
    except Exception as e:
        jsonify(errors=str(e)), 400
    return jsonify({'listObjects': listObjects,'services':services}), 200



@app.route('/info', methods=['POST'])
def info():
    """
    Stores information about the project
    """
    infoform = InfoForm(request.form)
    if request.method == 'POST' and infoform.validate():
        session[CURATOR_FIELD.INFO] = infoform.data
        return jsonify(data=infoform.data), 200
    return jsonify(data=infoform.errors), 400


@app.route('/reference', methods=['POST'])
def reference():
    """
    Stores all references/information about the paper related to the project
    """
    referenceform = ReferenceForm(request.form)
    if request.method == 'POST' and referenceform.validate():
        session[CURATOR_FIELD.REFERENCE] = referenceform.data
        return jsonify(data=referenceform.data), 200
    return jsonify(data=referenceform.errors), 400


@app.route('/fetchReferenceDOI', methods=['POST', 'GET'])
def fetchReferenceDOI():
    """
    Fetches reference information via DOI.
    """
    reqDOI = request.get_json()
    try:
        fetchDOI = FetchDOI(reqDOI["doi"])
        refdata = fetchDOI.fetchFromDOI()
        referenceform = ReferenceForm(**refdata)
    except Exception as e:
        print(e)
        return jsonify(errors="Recheck your DOI "+str(e)), 400
    return jsonify(data=referenceform.data), 200


@app.route('/charts', methods=['POST'])
def charts():
    """
    Stores information about the charts found in the project
    """
    chartform = ChartForm(request.form)
    if request.method == 'POST' and chartform.validate():
        # Add or append to list
        genid = GenerateId(CURATOR_FIELD.CHARTS)
        chartList = deepcopy(session.get(CURATOR_FIELD.CHARTS, []))
        chartList = [genid.addId(item) for item in chartList if item.get('id') not in chartform.id.data]
        chartList.append(genid.addId(chartform.data))
        session[CURATOR_FIELD.CHARTS] = deepcopy(chartList)
        return jsonify(chartList = chartList,fileServerPath=session.get(CURATOR_FIELD.PROJECT,{}).get("fileServerPath","")), 200
    return jsonify(data=chartform.errors), 400


@app.route('/charts/delete', methods=['POST'])
def chartsdelete():
    """
    Deletes information about a chart from the from the project
    """
    chartform = ChartForm(request.form)
    if request.method == 'POST' and chartform.validate():
        # Delete from list
        genid = GenerateId(CURATOR_FIELD.CHARTS)
        chartList = deepcopy(session.get(CURATOR_FIELD.CHARTS, []))
        chartList = [genid.addId(item) for item in chartList if item.get('id') not in chartform.id.data]
        session[CURATOR_FIELD.CHARTS] = deepcopy(chartList)
        return jsonify(chartList = chartList,fileServerPath=session.get(CURATOR_FIELD.PROJECT,{}).get("fileServerPath","")), 200
    return jsonify(data=chartform.errors), 400


@app.route('/tools', methods=['POST'])
def tools():
    """
    Stores information about the tools found in the project
    """
    toolform = ToolForm(request.form)
    if request.method == 'POST' and toolform.validate():
        # Add or append to list
        genid = GenerateId(CURATOR_FIELD.TOOLS)
        toolList = deepcopy(session.get(CURATOR_FIELD.TOOLS, []))
        toolList = [genid.addId(item) for item in toolList if item.get('id') not in toolform.id.data]
        toolList.append(genid.addId(toolform.data))
        session[CURATOR_FIELD.TOOLS] = deepcopy(toolList)
        return jsonify(toolList = toolList,fileServerPath=session.get(CURATOR_FIELD.PROJECT,{}).get("fileServerPath","")), 200
    return jsonify(data=toolform.errors), 400


@app.route('/tools/delete', methods=['POST'])
def toolsdelete():
    """
    Deletes information about a tool from the from the project
    """
    toolform = ToolForm(request.form)
    if request.method == 'POST' and toolform.validate():
        # Add or append to list
        genid = GenerateId(CURATOR_FIELD.TOOLS)
        toolList = deepcopy(session.get(CURATOR_FIELD.TOOLS, []))
        toolList = [genid.addId(item) for item in toolList if item.get('id') not in toolform.id.data]
        session[CURATOR_FIELD.TOOLS] = deepcopy(toolList)
        return jsonify(toolList=toolList, fileServerPath=session.get(CURATOR_FIELD.PROJECT, {}).get("fileServerPath", "")), 200
    return jsonify(data=toolform.errors), 400


@app.route('/datasets', methods=['POST'])
def datasets():
    """
    Stores information about the datasets found in the project
    """
    datasetform = DatasetForm(request.form)
    if request.method == 'POST' and datasetform.validate():
        genid = GenerateId(CURATOR_FIELD.DATASETS)
        datasetList = deepcopy(session.get(CURATOR_FIELD.DATASETS, []))
        datasetList = [genid.addId(item) for item in datasetList if item.get('id') not in datasetform.id.data]
        datasetList.append(genid.addId(datasetform.data))
        session[CURATOR_FIELD.DATASETS] = deepcopy(datasetList)
        return jsonify(datasetList = datasetList,fileServerPath=session.get(CURATOR_FIELD.PROJECT,{}).get("fileServerPath","")), 200
    return jsonify(data=datasetform.errors), 400


@app.route('/datasets/delete', methods=['POST'])
def datasetsdelete():
    """
    Deletes information about a dataset from the from the project
    """
    datasetform = DatasetForm(request.form)
    if request.method == 'POST' and datasetform.validate():
        # Delete from list
        genid = GenerateId(CURATOR_FIELD.DATASETS)
        datasetList = deepcopy(session.get(CURATOR_FIELD.DATASETS, []))
        datasetList = [genid.addId(item) for item in datasetList if item.get('id') not in datasetform.id.data]
        session[CURATOR_FIELD.DATASETS] = deepcopy(datasetList)
        return jsonify(datasetList = datasetList,fileServerPath=session.get(CURATOR_FIELD.PROJECT,{}).get("fileServerPath","")), 200
    return jsonify(data=datasetform.errors), 400


@app.route('/scripts', methods=['POST'])
def scripts():
    """
    Stores information about the scripts found in the project
    """
    scriptform = ScriptForm(request.form)
    if request.method == 'POST' and scriptform.validate():
        genid = GenerateId(CURATOR_FIELD.SCRIPTS)
        scriptList = deepcopy(session.get(CURATOR_FIELD.SCRIPTS, []))
        scriptList = [genid.addId(item) for item in scriptList if item.get('id') not in scriptform.id.data]
        scriptList.append(genid.addId(scriptform.data))
        session[CURATOR_FIELD.SCRIPTS] = deepcopy(scriptList)
        return jsonify(scriptList = scriptList,fileServerPath=session.get(CURATOR_FIELD.PROJECT,{}).get("fileServerPath","")), 200
    return jsonify(data=scriptform.errors), 400


@app.route('/scripts/delete', methods=['POST'])
def scriptsdelete():
    """
    Deletes information about a script from the from the project
    """
    scriptform = ScriptForm(request.form)
    if request.method == 'POST' and scriptform.validate():
        genid = GenerateId(CURATOR_FIELD.SCRIPTS)
        scriptList = deepcopy(session.get(CURATOR_FIELD.SCRIPTS, []))
        scriptList = [genid.addId(item) for item in scriptList if item.get('id') not in scriptform.id.data]
        session[CURATOR_FIELD.SCRIPTS] = deepcopy(scriptList)
        return jsonify(scriptList = scriptList,fileServerPath=session.get(CURATOR_FIELD.PROJECT,{}).get("fileServerPath","")), 200
    return jsonify(data=scriptform.errors), 400


@app.route('/documentation', methods=['POST'])
def documentation():
    """ This method helps in adding documentation to the paper.
    """
    docform = DocumentationForm(request.form)
    if request.method == 'POST' and docform.validate():
        session[CURATOR_FIELD.DOCUMENTATION] = docform.data
        return jsonify(data=docform.data), 200
    return jsonify(data=docform.errors), 400




@app.route('/addToWorkflow', methods=['POST', 'GET'])
def addToWorkflow():
    """
    Adds nodes to workflow
    """
    nodesList = []
    edgeList = []
    workflow = WorkflowCreator(session.get(CURATOR_FIELD.PROJECT,{}).get("fileServerPath",""))
    for chart in session.get(CURATOR_FIELD.CHARTS, []):
        if chart.get("id"):
            nodesList.append(chart.get("id"))
            workflow.addChart(chart)
    for tool in session.get(CURATOR_FIELD.TOOLS, []):
        if tool.get("id"):
            nodesList.append(tool.get("id"))
            workflow.addTool(tool)
    for dataset in session.get(CURATOR_FIELD.DATASETS, []):
        if dataset.get("id"):
            nodesList.append(dataset.get("id"))
            workflow.addDataset(dataset)
    for script in session.get(CURATOR_FIELD.SCRIPTS, []):
        if script.get("id"):
            nodesList.append(script.get("id"))
            workflow.addScript(script)
    for head in session.get(CURATOR_FIELD.HEADS, []):
        if head.get("id"):
            nodesList.append(head.get("id"))
            workflow.addHead(head)
    for edge in session.get(CURATOR_FIELD.EDGES, []):
        workflow.addEdge(edge)
        edgeList.append(edge)
    nodesList = list(set(nodesList))
    workflowinfo = WorkflowForm(edges = edgeList,nodes=nodesList)
    session[CURATOR_FIELD.WORKFLOW] = workflowinfo.data
    return jsonify(data=workflow.__dict__), 200


@app.route('/saveNodesAndEdges', methods=['POST', 'GET'])
def saveNodesAndEdges():
    """
    Saves edges and head workflow
    """
    head_edge_data = request.get_json()
    if len(head_edge_data) > 0:
        if len(head_edge_data[0]) > 0: #check for edges
            edgeList = []
            for edge in head_edge_data[0]:
                edgeList.append(edge)
            session[CURATOR_FIELD.EDGES] = edgeList #save edge data
        if len(head_edge_data[1]) > 0: # check for nodes
            headsList = []
            for head_data in head_edge_data[1]:
                heads = HeadForm(**head_data)
                headsList.append(heads.data)
            session[CURATOR_FIELD.HEADS] = headsList
    return jsonify(data="saved"), 200



@app.route('/preview/<previewFolder>', methods=['GET'])
def preview(previewFolder):
    """
    Previews the metadata for user
    """
    data = None
    with open("papers/" + previewFolder + "/" + "data.json") as json_file:
        data = json.load(json_file)
    previewObj = ObjectsForPreview(PaperForm(**data))
    paperdetail = previewObj.getPaperDetails()
    workflowdetail = previewObj.getWorkflowDetails()
    return render_template('paperdetails.html', paperdetail=paperdetail, workflowdetail=workflowdetail, preview=True)


@app.route('/previewchartworkflow', methods=['GET'])
def previewchartworkflow():
    """
    Previews the chart workflow metadata for user
    """
    # try:
    paperid = request.args.get('paperid', 0, type=str).strip()
    chartid = request.args.get('chartid', 0, type=str).strip()
    data = None
    chartworkflowdetail = []
    with open("papers/" + paperid + "/" + "data.json") as json_file:
        data = json.load(json_file)
    previewObj = ObjectsForPreview(PaperForm(**data))
    chartworkflowdetail = previewObj.getWorkflowForChartDetails(chartid)
    return jsonify(chartworkflowdetail=chartworkflowdetail), 200


@app.route('/download', methods=['POST', 'GET'])
def download():
    """
    Downloads the created metadata
    """
    #fill paper form
    PIs = session.get(CURATOR_FIELD.INFO,{}).get("PIs",[])
    charts = session.get(CURATOR_FIELD.CHARTS,[])
    collections = session.get(CURATOR_FIELD.INFO,{}).get("collections","")
    datasets = session.get(CURATOR_FIELD.DATASETS,[])
    reference = session.get(CURATOR_FIELD.REFERENCE,{})
    scripts = session.get(CURATOR_FIELD.SCRIPTS,[])
    tools = session.get(CURATOR_FIELD.TOOLS,[])
    tags = session.get(CURATOR_FIELD.INFO,{}).get("tags","")
    versions = session.get(CURATOR_FIELD.VERSIONS,[])
    workflow = session.get(CURATOR_FIELD.WORKFLOW,{})
    heads = session.get(CURATOR_FIELD.HEADS,[])
    documentation = session.get(CURATOR_FIELD.DOCUMENTATION,{})

    #fill other parts of project form
    pubdate = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    fileServerPath = session.get(CURATOR_FIELD.PROJECT,{}).get("fileServerPath","")
    notebookPath = session.get(CURATOR_FIELD.PROJECT,{}).get("notebookPath","")
    downloadPath = session.get(CURATOR_FIELD.PROJECT,{}).get("downloadPath","")
    gitPath = session.get(CURATOR_FIELD.PROJECT,{}).get("gitPath","")
    insertedBy = session.get(CURATOR_FIELD.DETAILS,{})
    notebookFile = session.get(CURATOR_FIELD.INFO,{}).get("notebookFile","")
    doi = session.get(CURATOR_FIELD.INFO,{}).get("doi","")
    tempName = uuid.uuid4().hex
    try:
        serverpathList = fileServerPath.rsplit("/", 2)
        projectName = serverpathList[len(serverpathList)-1]
        if not projectName:
            projectName = tempName
            previewFolder = tempName
        else:
            previewFolder = serverpathList[len(serverpathList)-2] + "_" + serverpathList[len(serverpathList)-1]
    except:
        projectName = tempName
        previewFolder = tempName
    projectForm = ProjectForm(downloadPath = downloadPath, fileServerPath = fileServerPath, notebookPath = notebookPath,
                              ProjectName = projectName, gitPath = gitPath, insertedBy = insertedBy,
                              isPublic = True, timeStamp = pubdate,
                              notebookFile = notebookFile, doi = doi)

    paperform = PaperForm(PIs = PIs, charts = charts, collections=ConvertField.convertToList([],[],collections), datasets = datasets, info = projectForm.data,
                          reference = reference, scripts = scripts, tools = tools,
                          tags = ConvertField.convertToList([],[],tags),versions = versions, workflow=workflow, heads=heads,
                          schema='http://paperstack.uchicago.edu/v1_1.json',version=2, documentation=documentation)
    #make fields to list
    paperdata = ConvertField.convertToList(["files","properties","URLs","patches"],
                                   [CURATOR_FIELD.CHARTS,CURATOR_FIELD.TOOLS,CURATOR_FIELD.DATASETS,CURATOR_FIELD.SCRIPTS,CURATOR_FIELD.HEADS],
                                    paperform.data)
    if not os.path.exists("papers/"+previewFolder):
        os.makedirs("papers/"+previewFolder)
    with open("papers/"+previewFolder+"/"+"data.json", "w") as outfile:
        json.dump(paperdata, outfile, default=lambda o: o.__dict__, separators=(',', ':'), sort_keys=True, indent=3)
    return jsonify(paper=paperdata, previewFolder=previewFolder), 200


@app.route('/publish', methods=['POST', 'GET'])
def publish():
    """
    Published the created metadata
    """
    form = PublishForm(request.form)
    serverslist = Servers()
    try:
        form.server.choices = [(qrespserver['qresp_server_url'], qrespserver['qresp_server_url']) for qrespserver in
                           serverslist.getServersList()]
    except Exception as e:
        print(e)
        raise InvalidUsage('Could not fetch serverlist, \n ' + str(e), status_code=410)
    if request.method == 'POST' and form.validate():
        fileServerPath = session.get(CURATOR_FIELD.PROJECT, {}).get("fileServerPath", "")
        serverpathList = fileServerPath.rsplit("/", 2)
        previewFolder = serverpathList[len(serverpathList)-2] + "_" + serverpathList[len(serverpathList)-1]
        error = []
        try:
            with open("papers/"+previewFolder+"/data.json", "r") as jsonData:
                error = serverslist.validateSchema(json.load(jsonData))
        except:
            error.append("No server found. Place files in a publicly accessible server.")
        if len(error)>0:
            return jsonify(error=error), 200
        else:
            session['publishserver'] = form.server.data
            session['emailAddress'] = form.emailId.data
            for item in serverslist.getServersList():
                if form.server.data in item['qresp_server_url']:
                    session['maintaineraddresses'] = item['qresp_maintainer_emails']
            googleauth = GoogleAuth(Config.get_setting('PROD','GOOGLE_CLIENT_ID'), Config.get_setting('PROD','REDIRECT_URI'), Config.get_setting('GOOGLE_API','SCOPE'))
            google = googleauth.getGoogleAuth()
            auth_url, state = google.authorization_url(Config.get_setting('GOOGLE_API','AUTH_URI'), access_type='offline')
            session['oauth_state'] = state
        return jsonify(data=auth_url),200
    return jsonify(error=form.errors), 400



@app.route('/oauth2callback')
def authorized():
    """
    Callback for authorization
    """
    form = PublishForm()
    serverslist = Servers()
    form.server.choices = [(qrespserver['qresp_server_url'], qrespserver['qresp_server_url']) for qrespserver in
                           serverslist.getServersList()]
    if 'error' in request.args:
        if request.args.get('error') == 'access_denied':
            print('denied access.')
        return redirect(url_for('qrespcurator'))
    if 'code' not in request.args and 'state' not in request.args:
        print('denied access.')
        return redirect(url_for('qrespcurator'))
    googleauth = GoogleAuth(Config.get_setting('PROD','GOOGLE_CLIENT_ID'), Config.get_setting('PROD','REDIRECT_URI'))
    google = googleauth.getGoogleAuth(state=session.get('oauth_state'))
    try:
        token = google.fetch_token(
            Config.get_setting('GOOGLE_API', 'TOKEN_URI'),
            client_secret=Config.get_setting('PROD','GOOGLE_CLIENT_SECRET'),
            authorization_response=request.url)
    except Exception as e:
        print(e)
        return 'HTTP Error occurred.'
    try:
        google = googleauth.getGoogleAuth(token=token)
        resp = google.get(Config.get_setting('GOOGLE_API','USER_INFO'))
        if resp.status_code == 200:
            user_data = resp.json()
            emailAddress = session.get('emailAddress')
            server = session.get("publishserver")
            if user_data['email'] in emailAddress:
                try:
                    fileServerPath = session.get(CURATOR_FIELD.PROJECT, {}).get("fileServerPath", "")
                    serverpathList = fileServerPath.rsplit("/", 2)
                    previewFolder = serverpathList[len(serverpathList) - 2] + "_" + serverpathList[len(serverpathList) - 1]
                    with open("papers/" + previewFolder + "/data.json", "r") as jsonData:
                        senddescriptor = SendDescriptor(server)
                        jsondata = json.load(jsonData)
                        response = senddescriptor.sendDescriptorToServer(jsondata)
                        if response.status_code == 400:
                           flash("Paper already exists")
                           return redirect(url_for('qrespcurator'))
                        else:
                            try:
                                paperdata = response.json()
                                maintaineraddresses = session.get('maintaineraddresses')
                                body =  'The user ' + str(jsondata['info']['insertedBy']['firstName']) + ' with email address ' + emailAddress + ' has inserted paper with paper id ' + str(paperdata["paperid"])
                                fromx = Config.get_setting('GLOBAL','MAIL_ADDR')
                                to = maintaineraddresses
                                msg = MIMEMultipart()
                                msg['Subject'] = 'New paper inserted into Qresp ecosystem'
                                msg['From'] = fromx
                                msg['To'] = ", ".join(to)
                                msg.attach(MIMEText(body,'plain'))
                                mailserver = smtplib.SMTP('smtp.gmail.com', 587)
                                mailserver.starttls()
                                mailserver.login(Config.get_setting('GLOBAL','MAIL_ADDR'), Config.get_setting('SECRETS','MAIL_PWD'))
                                mailserver.sendmail(fromx, to, msg.as_string())
                                mailserver.close()
                                return redirect(server + "/paperdetails/" + paperdata["paperid"])
                            except Exception as e:
                                print(traceback.format_exc())
                                flash('Could not email your administrator'+str(e))
                                flash('Published')
                                return redirect(url_for('qrespcurator'))
                except Exception as e:
                    print(e)
                    flash('No paper found')
                    return redirect(url_for('qrespcurator'))
            else:
                flash('Unauthorized access. Could not verify your email address')
                return redirect(url_for('qrespcurator'))
    except Exception as e:
        print(e)
        flash('Unauthorized access. Could not verify your email address')
        return redirect(url_for('qrespcurator'))
    flash('Published')
    return redirect(url_for('qrespcurator'))

@app.route('/mint', methods=['POST','GET'])
def mint():
    """
    Fetches the mint page
    """
    return render_template('mint.html')

@app.route('/insertDOI', methods=['POST','GET'])
def insertDOI():
    """
    Inserts DOI to database
    """
    try:
        paperid = request.args.get('paperId', 0, type=str)
        paperid = str(paperid).strip()
        doi = request.args.get('doi', 0, type=str)
        doi = str(doi).strip()
        dao = PaperDAO()
        if paperid and doi:
            dao.insertDOI(paperid,doi)
    except Exception as e:
        print(e)
        content = {'Failed': 'Could Not Insert'}
        return jsonify(content), 400
    content = {'Success': 'Inserted'}
    return jsonify(content), 200

@app.route('/downloads/<file>')
def downloadfile(file=None):
    """ Download file from server """
    if file:
        try:
            path = 'downloads/'+file
            return send_file(path, as_attachment=True)
        except Exception as e:
            print(e)
            msg = {"Content":"Not Found"}
            return jsonify(msg),400



########################################EXPLORER#############################################################################


@app.route('/verifyPasscode',methods=['POST'])
def verifypasscode():
    """
    This method verifies with input passcode of flask connection.
    """
    form = PassCodeForm(request.form)
    confirmpasscode = Config.get_setting('PROD','QRESP_DB_SECRET_KEY')
    if request.method == 'POST' and form.validate():
        if confirmpasscode == form.passcode.data:
            return jsonify(msg="success"),200
    return jsonify(msg="failed"),400

# Fetches list of qresp admin

@app.route('/admin', methods=['POST', 'GET'])
def admin():
    """
    This method helps in connecting to the mongo database.
    """
    form = AdminForm(request.form)
    form.port.data = 27017
    verifyform = PassCodeForm(request.form)
    if request.method == 'POST' and form.validate():
        try:
            dbAdmin = MongoDBConnection.getDB(hostname=form.hostname.data, port=int(form.port.data),
                                        username=form.username.data, password=form.password.data,
                                        dbname=form.dbname.data)
        except Exception as e:
            flash('Could not connect to server, \n ' + str(e))
            raise InvalidUsage('Could not connect to server, \n ' + str(e), status_code=410)
        flash('Connected')
        SetLocalHost(str(request.host_url).strip("/"))
        return redirect(url_for('qrespexplorer'))
    return render_template('admin.html', form=form,verifyform =verifyform )


@app.route('/qrespexplorer',methods=['GET','POST'])
def qrespexplorer():
    """
    Fetches the explorer homepage
    """
    form = QrespServerForm()
    serverslist = Servers()
    form.serverList = [qrespserver['qresp_server_url'] for qrespserver in
                           serverslist.getServersList()]
    if request.method == 'POST':
        if request.form.getlist('serversList'):
            selectedservers = request.form.getlist('serversList')
        else:
            selectedservers = form.serverList
        return redirect(url_for('search',servers=','.join(selectedservers)))
    return render_template('qrespexplorer.html', form=form)


@app.route('/search', methods=['GET'])
def search():
    """
    This method helps in filtering paper content
    """
    try:
        selected_servers = urllib.parse.unquote(request.args.get('servers', type=str, default=''))
        fetchdata = FetchDataFromAPI(selected_servers, str(request.host_url).strip("/") if Config.get_setting('PROD', 'MONGODB_HOST') else None)
        allpaperslist = fetchdata.fetchOutput('/api/search')
        collectionlist = fetchdata.fetchOutput('/api/collections')
        authorslist = fetchdata.fetchOutput('/api/authors')
        publicationlist = fetchdata.fetchOutput('/api/publications')
        allPapersSize = len(allpaperslist)
    except Exception as e:
        print(e)
        flash('Error in search. ' + str(e))
        return render_template('search.html', allpaperslist=allpaperslist)
    return render_template('search.html',allpaperslist=allpaperslist,collectionlist=collectionlist,authorslist=authorslist,
                           publicationlist=publicationlist,allPapersSize=allPapersSize)



@app.route('/searchWord', methods=['GET'])
def searchWord():
    """
    Filtering paper content
    """
    allpaperslist = []
    try:
        searchWord = ""
        paperTitle = request.args.get('paperTitle', type=str)
        doi = request.args.get('doi', type=str)
        tags = request.args.get('tags', type=str)
        collectionList = json.loads(request.args.get('collectionList'))
        authorsList = json.loads(request.args.get('authorsList'))
        publicationList = json.loads(request.args.get('publicationList'))
        selected_servers = urllib.parse.unquote(request.args.get('servers', type=str, default=''))
        fetchdata = FetchDataFromAPI(selected_servers, str(request.host_url).strip("/") if Config.get_setting('PROD', 'MONGODB_HOST') else None)
        url = '/api/search'+"?searchWord="+searchWord+"&paperTitle="+paperTitle+"&doi="+doi+"&tags="+tags+"&collectionList="+",".join(collectionList) + \
              "&authorsList="+",".join(authorsList)+"&publicationList="+",".join(publicationList)
        allpaperslist = fetchdata.fetchOutput(url)
        return jsonify(allpaperslist=allpaperslist), 200
    except Exception as e:
        print(e)
        flash('Error in search. ' + str(e))
        return jsonify(allpaperslist=allpaperslist), 400


@app.route('/paperdetails/<paperid>', methods=['GET'])
def paperdetails(paperid):
    """
    Fetching papers details content
    """
    paperdetail = []
    workflowdetail = []
    try:
        selected_servers = urllib.parse.unquote(request.args.get('servers', type=str, default=''))
        fetchdata = FetchDataFromAPI(selected_servers, str(request.host_url).strip("/") if Config.get_setting('PROD', 'MONGODB_HOST') else None)
        url = '/api/paper/'+paperid
        paperdetail = fetchdata.fetchOutput(url)
        url = '/api/workflow/'+paperid
        workflowdetail = fetchdata.fetchOutput(url)
        return render_template('paperdetails.html', paperdetail=paperdetail, workflowdetail=workflowdetail, preview=False)
    except Exception as e:
        print(e)
        flash('Error in paperdetails. ' + str(e))
        return render_template('paperdetails.html', paperdetail=paperdetail, workflowdetail=workflowdetail, preview=False)



# Fetches workflow of chart based on user click

@app.route('/chartworkflow', methods=['GET'])
def chartworkflow():
    """
    Fetching chart workflow content
    """
    chartworkflowdetail = []
    try:
        paperid = request.args.get('paperid', 0, type=str)
        paperid = str(paperid).strip()
        chartid = request.args.get('chartid', 0, type=str)
        chartid = str(chartid).strip()
        selected_servers = urllib.parse.unquote(request.args.get('servers', type=str, default=''))
        fetchdata = FetchDataFromAPI(selected_servers, str(request.host_url).strip("/") if Config.get_setting('PROD', 'MONGODB_HOST') else None)
        url = '/api/paper/' + paperid + '/chart/' + chartid
        chartworkflowdetail = fetchdata.fetchOutput(url)
        return jsonify(chartworkflowdetail=chartworkflowdetail), 200
    except Exception as e:
        print(e)
        flash('Error in chartdetails. ' + str(e))
        return jsonify(chartworkflowdetail=chartworkflowdetail), 400


@app.route('/getDescriptor', methods=['POST','GET'])
def getDescriptor():
    """
    Inserts and fetches the metadata into papers collections
    """
    try:
        data = request.get_json()
        paper = data.get("metadata")
        try:
            dao = PaperDAO()
            paperid = dao.insertIntoPapers(paper)
            if not paperid:
                content = {"Error":"Paper already exists"}
                return jsonify(content),400
            else:
                content = {"paperid": paperid}
                return jsonify(content), 200
        except Exception as e:
            print("Exception in insertion,", e)
            content = {'Error': 'Could not insert'}
            return jsonify(content)
        content = {'Success': 'Inserted'}
        return jsonify(content),200
    except Exception as e:
        print("Cannot get descriptor", e)
        content = {'Error':'Could not insert, Cannot get descriptor'}
        return jsonify(content),400
    return jsonify(content),200
