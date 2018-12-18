import os
from datetime import timedelta, datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


import schedule
from flask import render_template, request, flash, redirect, url_for, jsonify, session,send_file
from project import csrf
from project import app
from project import ext
import smtplib

from flask_cors import CORS

from .paperdao import *
from .util import *
from .views import *

qresp_config = {}
ftp_dict = {}




class InvalidUsage(Exception):
    """ Invalid page
    """
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

def closeConnection():
    """closes ssh connection"""
    for username in list(ftp_dict.keys()):
        if username not in session:
            del ftp_dict[username]

schedule.every(23).hours.do(closeConnection)



@app.errorhandler(InvalidUsage)
def handle_invalid_usage(error):
    """ Returns error code
    """
    response = jsonify(error.to_dict())
    response.status_code = error.status_code
    return response


@app.before_request
def make_session_permanent():
    """ makes session values last for a day
    """
    session.permanent = True
    app.permanent_session_lifetime = timedelta(days=1)

# Fetches list of qresp servers
@app.route('/')
@app.route('/index')
def index():
    """ Fetches the homepage
    """
    dbAdmin = MongoDBConnection.getDB()
    return render_template('index.html')

@ext.register_generator
def index():
    # Not needed if you set SITEMAP_INCLUDE_RULES_WITHOUT_PARAMS=True
    yield 'index', {}
    yield 'qrespexplorer', {}
    yield 'paperdetails', {'paperid': '594186a91bd40fd4f2ce1aa0'}, {}
    yield 'paperdetails', {'paperid': '5bb12835096ace7a9d8eb97d'}, {}
    yield 'paperdetails', {'paperid': '5b3441242986382db00fab92'}, {}
    yield 'paperdetails', {'paperid': '5b33a02629863800f82e297c'}, {}
    yield 'paperdetails', {'paperid': '5b339eb029863800f82e297b'}, {}
    yield 'paperdetails', {'paperid': '5b0ef8381f87c63760acb909'}, {}
    yield 'paperdetails', {'paperid': '5a5e4e933a2c122ca8e9cd92'}, {}
    yield 'paperdetails', {'paperid': '5ad8df0650cefd3974d05a83'}, {}
    yield 'paperdetails', {'paperid': '5a5e437e3a2c122ca8e9cd75'}, {}
    yield 'paperdetails', {'paperid': '5950fbfc1bd40f6cb67fb939'}, {}
    yield 'paperdetails', {'paperid': '5992072a7590617df5a88a85'}, {}
    yield 'paperdetails', {'paperid': '5983afce759061384c1aae48'}, {}
    yield 'paperdetails', {'paperid': '594c507f1bd40f5ebf185fde'}, {}
    yield 'paperdetails', {'paperid': '594c50671bd40f5e9b5c043b'}, {}
    yield 'paperdetails', {'paperid': '594c504a1bd40f5e7819a0aa'}, {}


@app.route('/downloads/<file>')
def downloadfile(file=None):
    if file:
        try:
            path = 'downloads/'+file
            return send_file(path, as_attachment=True)
        except Exception as e:
            print(e)
            msg = {"Content":"Not Found"}
            return jsonify(msg),400



@app.route('/qrespexplorer')
def qrespexplorer():
    """ Fetches the explorer homepage
    """
    serverslist = Servers()
    return render_template('qrespexplorer.html', serverslist=serverslist.getServersList())

@app.route('/qrespcurator')
def qrespcurator():
    """ Fetches the curator homepage
    """
    return render_template('qrespcurator.html')

@csrf.exempt
@app.route('/uploadFile',methods=['POST','GET'])
def uploadFile():
    """ Renders and stores uploaded file text
    """
    try:
        uploadJSON = json.loads(request.get_json())
        paperform = PaperForm(**uploadJSON)
        session["paper"] = paperform.data
        session["insertedBy"] = paperform.info.insertedBy.data
        session["serverPath"] = paperform.info.serverPath.data
        session["fileServerPath"] = paperform.info.fileServerPath.data
        session["downloadPath"] = paperform.info.downloadPath.data
        session["gitService"] = paperform.info.gitPath.data
        session["notebookPath"] = paperform.info.notebookPath.data
        session["notebookFile"] = paperform.info.notebookFile.data
        session["doi"] = paperform.info.doi.data
        session["folderAbsolutePath"] = paperform.info.folderAbsolutePath.data
        session["isPublic"] = paperform.info.isPublic.data
        if paperform.info.folderAbsolutePath.data:
            projectName = paperform.info.folderAbsolutePath.data.rsplit("/",1)[1]
            session["ProjectName"] = projectName

        chartList = []
        for eachchartdata in paperform.charts.entries:
            eachchart = eachchartdata.data
            if not eachchart.get("saveas"):
                eachchart["saveas"] = eachchart.get("id")
            chartList.append(eachchart)
        session["charts"] = chartList

        toolList = []
        for eachtooldata in paperform.tools.entries:
            eachtool = eachtooldata.data
            if not eachtool.get("saveas"):
                eachtool["saveas"] = eachtool.get("id")
            toolList.append(eachtool)
        session["tools"] = toolList

        datasetList = []
        for eachdatasetdata in paperform.datasets.entries:
            eachdataset = eachdatasetdata.data
            if not eachdataset.get("saveas"):
                eachdataset["saveas"] = eachdataset.get("id")
            datasetList.append(eachdataset)
        session["datasets"] = datasetList

        scriptList = []
        for eachscriptdata in paperform.scripts.entries:
            eachscript = eachscriptdata.data
            if not eachscript.get("saveas"):
                eachscript["saveas"] = eachscript.get("id")
            scriptList.append(eachscript)
        session["scripts"] = scriptList

        referenceform = ReferenceForm(**paperform.reference.data)
        session["reference"] = referenceform.data

        session["heads"] = [form.data for form in paperform.heads.entries]
        session["edges"] = [form.data for form in paperform.workflow.edges.entries]
        session["nodes"] = [form for form in paperform.workflow.nodes.data]
        infoform = InfoForm(**paperform.data)
        infoform.tags.data = ", ".join(paperform.tags.data)
        infoform.collections.data = ", ".join(paperform.collections.data)
        session["info"] = infoform.data
        session["PIs"] = [form.data for form in infoform.PIs.entries]
        session["tags"] = [form for form in paperform.tags.data]
        session["collections"] = [form for form in paperform.collections.data]
        session["workflow"] = paperform.workflow.data
        return jsonify(out="Processed text")
    except:
        return jsonify(error="Could not process json file")


@app.route('/details', methods=['POST', 'GET'])
def details():
    """ This method helps in storing the details of the person using the curator.
    """
    form = DetailsForm(request.form)
    if request.method == 'POST' and form.validate():
        session["insertedBy"] = form.data
        return redirect(url_for('server'))
    elif session.get("insertedBy"):
        detailsForm = session.get("insertedBy")
        form = DetailsForm(**detailsForm)
    return render_template('details.html', form=form)

@csrf.exempt
@app.route('/server', methods=['POST', 'GET'])
def server():
    """ This method helps in connecting to the remote server for the data tree.
    """
    form = ServerForm(request.form)
    if request.method == 'POST' and form.validate():
        try:
            if ftp_dict.get(form.username.data):
                ftp_dict.get(form.username.data).close()
                del ftp_dict[form.username.data]
            sftp = ConnectToServer(form.serverName.data,form.username.data,form.password.data,form.isDUOAuth.data,"1")
            session["sftpclient"] = form.username.data
            ftp_dict[form.username.data] = sftp.getSftp()
            return redirect(url_for('project'))
        except Exception as e:
            flash("Could not connect to server. Plase try again!"+str(e))
            render_template('server.html', form=form)
    return render_template('server.html', form=form)


@csrf.exempt
@app.route('/project', methods=['POST', 'GET'])
def project():
    """ This method helps in populating the project form.
    """
    form = ProjectForm(request.form)
    # absPath = ""
    if request.method == 'GET':
        if session.get("folderAbsolutePath"):
            form.folderAbsolutePath.data = session.get("folderAbsolutePath")
        else:
            form.folderAbsolutePath.data = "."
        return render_template('project.html', form=form)

@csrf.exempt
@app.route('/setproject', methods=['POST', 'GET'])
def setproject():
    """ Sets server services available
    """
    absPath = ""
    isConfig = "N"
    services = []
    try:
        if request.method == 'POST':
            pathDetails = request.get_json()
            absPath = pathDetails['folderAbsolutePath']
            ftpclient = session.get("sftpclient")
            ftp = ftp_dict[ftpclient]
            dtree = Dtree(ftp, absPath.rsplit("/", 1)[0], session)
            dtree.openFileToReadConfig("qresp.ini")
            services = dtree.fetchServices()
            isConfig = dtree.checkIsConfigFile()
            session["folderAbsolutePath"] = absPath
            session["ProjectName"] = absPath.rsplit("/",1)[1]
            return jsonify(folderAbsolutePath=absPath,isConfigFile=isConfig,services=services)
    except Exception as e:
        flash("Could not connect to server. Plase try again!" + str(e))
        return jsonify(folderAbsolutePath=absPath, isConfigFile=isConfig, services=services)


@csrf.exempt
@app.route('/getTreeInfo', methods=['POST', 'GET'])
def getTreeInfo():
    """   Renders the Tree containing Project Information which is 'SSH'ed with the remote directory.
    """
    pathDetails = request.get_json()
    listObjects = []
    services = []
    ftpclient = session.get("sftpclient")
    ftp = ftp_dict[ftpclient]
    if 'folderAbsolutePath' in pathDetails:
        content_path = pathDetails['folderAbsolutePath']
    else:
        content_path = session.get("folderAbsolutePath")
    try:
        dtree = Dtree(ftp,content_path,session)
        listObjects = dtree.fetchForTree()
        services = dtree.fetchServices()
    except Exception as e:
        print(e)
    return jsonify({'listObjects': listObjects, 'services': services})

@app.route('/curate', methods=['POST', 'GET'])
def curate():
    """ This method populates the curator form.
    """
    infoform = InfoForm(request.form)
    chartform = ChartForm(request.form)
    toolform = ToolForm(request.form)
    datasetform = DatasetForm(request.form)
    scriptform = ScriptForm(request.form)
    referenceform = ReferenceForm(request.form)
    documentationform = DocumentationForm(request.form)
    chartlist = []
    toollist = []
    datasetlist = []
    scriptlist = []
    projectName = ""
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
    if session.get("folderAbsolutePath"):
        if "/" in session.get("folderAbsolutePath"):
            projectName = session.get("folderAbsolutePath").rsplit("/", 1)[1]
        else:
            projectName = session.get("folderAbsolutePath")
    if session.get("reference"):
        referenceForm = session.get("reference")
        referenceform = ReferenceForm(**referenceForm)
    return render_template('curate.html',infoform=infoform,chartlistform=chartlist,chartform=chartform,
                           toollistform=toollist,toolform=toolform,datalistform=datasetlist,datasetform=datasetform,
                           scriptlistform=scriptlist,scriptform=scriptform,referenceform=referenceform,projName=projectName,documentationform=documentationform)

@csrf.exempt
@app.route('/info', methods=['POST', 'GET'])
def info():
    """ This method helps in connecting to the server.
    """
    infoform = InfoForm(request.form)
    if request.method == 'POST' and infoform.validate():
        session["info"] = infoform.data
        session["PIs"] = [form.data for form in infoform.PIs.entries]
        session["tags"] = infoform.tags.data.split(",")
        session["collections"] = infoform.collections.data.split(",")
        session["notebookFile"] = infoform.mainnotebookfile.data
        msg = "Info Saved"
        return jsonify(data=msg)
    return jsonify(data=infoform.errors)

@csrf.exempt
@app.route('/charts', methods=['POST', 'GET'])
def charts():
    """ This method helps in connecting to the server.
    """
    chartform = ChartForm(request.form)
    if request.method == 'POST' and chartform.validate():
        chartList = deepcopy(session.get("charts", []))
        if len(chartList) <  1:
            chartList.append(chartform.data)
            session["charts"] = deepcopy(chartList)
        else:
            idList = [eachchart['saveas'] if eachchart['saveas'] else eachchart['id'] for eachchart in chartList]
            id = chartform.id.data
            saveas = chartform.saveas.data
            if id not in idList and saveas not in idList:
                chartList.append(chartform.data)
                session["charts"] = deepcopy(chartList)
            else:
                chartList = [item for item in chartList if item['saveas'] not in chartform.saveas.data]
                chartList.append(chartform.data)
                session["charts"] = deepcopy(chartList)
        return jsonify(chartList = chartList)
    return jsonify(data=chartform.errors)

@csrf.exempt
@app.route('/tools', methods=['POST', 'GET'])
def tools():
    """ This method helps in populating tools section in the curator.
    """
    toolform = ToolForm(request.form)
    if request.method == 'POST' and toolform.validate():
        toolList = deepcopy(session.get("tools", []))
        if len(toolList) <  1:
            toolList.append(toolform.data)
            session["tools"] = deepcopy(toolList)
        else:
            idList = [eachtool['saveas'] if eachtool['saveas'] else eachtool['id'] for eachtool in toolList]
            id = toolform.id.data
            saveas = toolform.saveas.data
            if id not in idList and saveas not in idList:
                toolList.append(toolform.data)
                session["tools"] = deepcopy(toolList)
            else:
                toolList = [item for item in toolList if item['saveas'] not in toolform.saveas.data]
                toolList.append(toolform.data)
                session["tools"] = deepcopy(toolList)
        return jsonify(toolList = toolList)
    return jsonify(errors=toolform.errors)

@csrf.exempt
@app.route('/datasets', methods=['POST', 'GET'])
def datasets():
    """ This method helps in populating datasets section in the curator.
    """
    datasetform = DatasetForm(request.form)
    if request.method == 'POST' and datasetform.validate():
        datasetList = deepcopy(session.get("datasets", []))
        if len(datasetList) <  1:
            datasetList.append(datasetform.data)
            session["datasets"] = deepcopy(datasetList)
        else:
            idList = [eachdataset['saveas'] if eachdataset['saveas'] else eachdataset['id'] for eachdataset in datasetList]
            id = datasetform.id.data
            saveas = datasetform.saveas.data
            if id not in idList and saveas not in idList:
                datasetList.append(datasetform.data)
                session["datasets"] = deepcopy(datasetList)
            else:
                datasetList = [item for item in datasetList if item['saveas'] not in datasetform.saveas.data]
                datasetList.append(datasetform.data)
                session["datasets"] = deepcopy(datasetList)
        return jsonify(datasetList = datasetList)
    return jsonify(data=datasetform.errors)

@csrf.exempt
@app.route('/scripts', methods=['POST', 'GET'])
def scripts():
    """ This method helps in populating scripts section in the curator.
    """
    scriptform = ScriptForm(request.form)
    if request.method == 'POST' and scriptform.validate():
        scriptList = deepcopy(session.get("scripts", []))
        if len(scriptList) <  1:
            scriptList.append(scriptform.data)
            session["scripts"] = deepcopy(scriptList)
        else:
            idList = [eachscript['saveas'] if eachscript['saveas'] else eachscript['id'] for eachscript in scriptList]
            id = scriptform.id.data
            saveas = scriptform.saveas.data
            if id not in idList and saveas not in idList:
                scriptList.append(scriptform.data)
                session["scripts"] = deepcopy(scriptList)
            else:
                scriptList = [item for item in scriptList if item['saveas'] not in scriptform.saveas.data]
                scriptList.append(scriptform.data)
                session["scripts"] = deepcopy(scriptList)
        return jsonify(scriptList = scriptList)
    return jsonify(data=scriptform.errors)

@csrf.exempt
@app.route('/reference', methods=['POST', 'GET'])
def reference():
    """ This method helps in filling reference section for paper.
    """
    referenceform = ReferenceForm(request.form)
    if request.method == 'POST' and referenceform.validate():
        session["reference"] = referenceform.data
        msg = "Reference Saved"
        return jsonify(data=msg)
    return jsonify(data=referenceform.errors)

@csrf.exempt
@app.route('/fetchReferenceDOI', methods=['POST', 'GET'])
def fetchReferenceDOI():
    """ This method fetched reference information via DOI.
    """
    reqDOI = request.get_json()
    try:
        fetchDOI = FetchDOI(reqDOI["doi"])
        refdata = fetchDOI.fetchFromDOI()
    except Exception as e:
        print(e)
        return jsonify(errors="Recheck your DOI")
    return jsonify(fetchDOI=refdata.data)

@csrf.exempt
@app.route('/documentation', methods=['POST', 'GET'])
def documentation():
    """ This method helps in adding documentation to the paper.
    """
    docform = DocumentationForm(request.form)
    if request.method == 'POST' and docform.validate():
        session["documentation"] = docform.data
        msg = "Documentation Saved"
        return jsonify(data=msg)
    return jsonify(data=docform.errors)

@csrf.exempt
@app.route('/workflow', methods=['POST', 'GET'])
def workflow():
    """Collects and Returns values needed for the Workflow section.
	:return: Information of the various nodes and edges - Dictionary
	"""
    GenerateIDs(session)
    if request.method == 'GET':
        return render_template('workflow.html')
    nodesList = []
    workflowsave = request.json
    workflow = WorkflowCreator()
    for chart in session.get("charts",[]):
        try:
            fileServerPath = session.get("fileServerPath","")
            projectName = session.get("ProjectName","")
            if projectName not in fileServerPath:
                img = '<img src="' + fileServerPath  + "/" + projectName+"/"+chart["imageFile"] + '" width="250px;" height="250px;"/>'
            else:
                img = '<img src="' + fileServerPath  +"/"+chart["imageFile"] + '" width="250px;" height="250px;"/>'
            caption = "<b> Image: </b>" + img
        except Exception as e:
            caption = ""
        nodesList.append(chart["id"])
        workflow.addChart(chart["id"], caption)
    for tool in session.get("tools",[]):
        pack = ""
        try:
            pack = "<b> Package Name: </b>" + tool["packageName"]
        except:
            try:
                pack = "<b> Facility Name: </b>" + tool["facilityName"] + " <br/> <b>Measurement: </b>" + tool["measurement"]
            except:
                pack = ""
        nodesList.append(tool["id"])
        workflow.addTool(tool["id"], pack)
    for dataset in session.get("datasets",[]):
        readme = ""
        try:
            readme = "<b> ReadMe: </b>" + dataset["readme"]
        except:
            readme = ""
        nodesList.append(dataset["id"])
        workflow.addDataset(dataset["id"], readme)
    for script in session.get("scripts",[]):
        try:
            readme = "<b> ReadMe: </b>" + script["readme"]
        except:
            readme = ""
        if not script["saveas"]:
            script["saveas"] = script["id"]
        nodesList.append(script["id"])
        workflow.addScript(script["id"], readme)
    for head in session.get("heads",[]):
        try:
            readme = head["readme"]
        except:
            readme = ""
        try:
            nodesList.append(head["id"])
            workflow.addHead(head["id"], readme, head["URLs"])
        except:
            nodesList.append(head["id"])
            workflow.addHead(head["id"], readme)

    for edge in session.get("edges",[]):
        workflow.addEdge(edge)
    try:
        edgeList = []
        for edge in workflowsave[0]:
            workflow.addEdge(edge)
            edgeList.append(edge)
        session["edges"] = edgeList
    except Exception as e:
        print(e)
    try:
        heads = HeadForm(request.form)
        headInfo = workflowsave[1]
        headList = []
        for head in headInfo:
            hinfo = head.split("*")
            nodesList.append(hinfo[0])
            heads.id.data = hinfo[0]
            try:
                if hinfo[1]:
                    heads.readme.data = str(hinfo[1])
            except Exception as e:
                print(e)
            try:
                if hinfo[2]:
                    heads.URLs.data = str(hinfo[2]).strip()
            except Exception as e:
                print(e)
            headList.append(heads.data)
        session["heads"] = headList
        nodesList = list(set(nodesList))
        workflowinfo = WorkflowForm(edges = edgeList,nodes=nodesList)
        session["workflow"] = workflowinfo.data
    except Exception as e:
        print(e)
    return jsonify({'workflow': workflow.__dict__})


# Fetches list of qresp servers for the explorer
@csrf.exempt
@app.route('/publish', methods=['POST', 'GET'])
def publish():
    """ Published the created metadata
    """
    form = PublishForm(request.form)
    serverslist = Servers()
    form.server.choices = [(qrespserver['qresp_server_url'], qrespserver['qresp_server_url']) for qrespserver in
                           serverslist.getServersList()]
    maintaineraddresses = [item for qrespserver in
                           serverslist.getServersList() for item in qrespserver['qresp_maintainer_emails']]
    session['maintaineraddresses'] = maintaineraddresses
    error = []
    if request.method == 'POST':
        projectName = session.get("ProjectName")
        try:
            with open("papers/"+projectName+"/data.json", "r") as jsonData:
                error = serverslist.validateSchema(json.load(jsonData))
            if len(error)>0:
                flash(error)
                return render_template('publish.html', form=form)
            else:
                session['publishserver'] = form.server.data
                session['emailAddress'] = form.emailId.data
                googleauth = GoogleAuth(app.config['GOOGLE_CLIENT_ID'], app.config['REDIRECT_URI'], app.config['SCOPE'])
                google = googleauth.getGoogleAuth()
                auth_url, state = google.authorization_url(app.config['AUTH_URI'], access_type='offline')
                session['oauth_state'] = state
                return redirect(auth_url)
        except Exception as e:
            flash("Could not publish. No project found "+str(e))
            return render_template('publish.html', form=form)
    return render_template('publish.html', form=form)


@csrf.exempt
@app.route('/oauth2callback')
def authorized():
    form = PublishForm()
    serverslist = Servers()
    form.server.choices = [(qrespserver['qresp_server_url'], qrespserver['qresp_server_url']) for qrespserver in
                           serverslist.getServersList()]
    if 'error' in request.args:
        if request.args.get('error') == 'access_denied':
            print('denied access.')
        return render_template('publish.html', form=form)
    if 'code' not in request.args and 'state' not in request.args:
        print('denied access.')
        return render_template('publish.html', form=form)
    googleauth = GoogleAuth(app.config['GOOGLE_CLIENT_ID'], app.config['REDIRECT_URI'])
    google = googleauth.getGoogleAuth(state=session['oauth_state'])
    try:
        token = google.fetch_token(
            app.config['TOKEN_URI'],
            client_secret=app.config['GOOGLE_CLIENT_SECRET'],
            authorization_response=request.url)
    except Exception as e:
        print(e)
        flash(e)
        return 'HTTPError occurred.'
    try:
        googleauth = GoogleAuth(app.config['GOOGLE_CLIENT_ID'], app.config['REDIRECT_URI'])
        google = googleauth.getGoogleAuth(token=token)
        resp = google.get(app.config['USER_INFO'])
        if resp.status_code == 200:
            user_data = resp.json()
            emailAddress = session.get('emailAddress')
            server = session.get("publishserver")
            if user_data['email'] in emailAddress:
                try:
                    projectName = session.get("ProjectName")
                    with open("papers/" + projectName + "/data.json", "r") as jsonData:
                        senddescriptor = SendDescriptor(server)
                        response = senddescriptor.sendDescriptorToServer(json.load(jsonData))
                        if response.status_code == 400:
                           flash("Paper already exists")
                           return render_template('publish.html', form=form)
                        else:
                            try:
                                paperdata = response.json()
                                maintaineraddresses = session.get('maintaineraddresses')
                                body =  'The user ' + str(session.get('insertedBy')['firstName']) + ' with email address ' + emailAddress + ' has inserted paper with paper id ' + str(paperdata["paperid"])
                                fromx = app.config['MAIL_ADDR']
                                to = maintaineraddresses
                                msg = MIMEMultipart()
                                msg['Subject'] = 'New paper inserted into Qresp ecosystem'
                                msg['From'] = fromx
                                msg['To'] = ", ".join(to)
                                msg.attach(MIMEText(body,'plain'))
                                mailserver = smtplib.SMTP('smtp.gmail.com', 587)
                                mailserver.starttls()
                                mailserver.login(app.config['MAIL_ADDR'], app.config['MAIL_PWD'])
                                mailserver.sendmail(fromx, to, msg.as_string())
                                mailserver.close()
                                return redirect(server + "/paperdetails/" + paperdata["paperid"])
                            except Exception as e:
                                print(e)
                                flash('Could not email your administrator')
                                return render_template('publish.html', form=form)
                except Exception as e:
                    print(e)
                    flash('No paper found')
                    return render_template('publish.html', form=form)
                return render_template('publish.html', form=form)
            else:
                flash('Unauthorized access. Could not verify your email address')
    except Exception as e:
        print(e)
        flash('Unauthorized access. Could not verify your email address')
        return render_template('publish.html', form=form)
    return render_template('publish.html', form=form)

@csrf.exempt
@app.route('/download', methods=['POST', 'GET'])
def download():
    """ Downloads the created metadata
    """
    PIs = session.get("PIs")
    charts = session.get("charts")
    collections = session.get("collections")
    datasets = session.get("datasets")
    reference = session.get("reference")
    scripts = session.get("scripts")
    tools = session.get("tools")
    tags = session.get("tags")
    versions = session.get("versions")
    workflow = session.get("workflow")
    heads = session.get("heads")
    projectName = session.get("ProjectName","unknown")
    pubdate = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    fileServerPath = session.get("fileServerPath","")
    notebookPath = session.get("notebookPath","")
    downloadPath = session.get("downloadPath","")
    projectName = session.get("ProjectName","")
    if projectName:
        if projectName not in fileServerPath:
            fileServerPath = fileServerPath + "/" +projectName
        if projectName not in notebookPath:
            notebookPath = notebookPath + "/" +projectName
        if projectName not in downloadPath:
            downloadPath = downloadPath + projectName


    projectForm = ProjectForm(downloadPath = downloadPath,fileServerPath = fileServerPath,notebookPath = notebookPath,
                              folderAbsolutePath = session.get("folderAbsolutePath"),ProjectName = session.get("ProjectName"),gitPath = session.get("gitPath"),
                              insertedBy = session.get("insertedBy"),isPublic = session.get("isPublic"),timeStamp = pubdate,
                              serverPath = session.get("serverPath"),notebookFile = session.get("notebookFile"),doi = session.get("doi"))
    paperform = PaperForm(PIs = PIs, charts = charts, collections=collections, datasets = datasets, info = projectForm.data,
                          reference = reference, scripts =scripts, tools = tools,
                          tags = tags,versions =versions, workflow=workflow,heads=heads,schema='http://paperstack.uchicago.edu/v1_0.json',version=1)
    paperdict = ConvertToList(paperform.data)
    paperdata = paperdict.fetchConvertedList()
    if not os.path.exists("papers/"+projectName):
        os.makedirs("papers/"+projectName)
    with open("papers/"+projectName+"/"+"data.json", "w") as outfile:
        json.dump(paperdata, outfile, default=lambda o: o.__dict__, separators=(',', ':'), sort_keys=True, indent=3)
    session["paper"] = paperdata
    return jsonify(paper=paperdata)


@csrf.exempt
@app.route('/acknowledgement', methods=['POST', 'GET'])
def acknowledgement():
    """Final acknowledgement page
    """
    return render_template('acknowledgement.html')

########################################EXPLORER#############################################################################


@csrf.exempt
@app.route('/verifyPasscode',methods=['POST'])
def verifypasscode():
    """ This method verifies with input passcode of flask connection.
    """
    form = PassCodeForm(request.form)
    confirmpasscode = app.config['passkey']
    if request.method == 'POST' and form.validate():
        if confirmpasscode == form.passcode.data:
            return jsonify(msg="success")
    return jsonify(msg="failed")

# Fetches list of qresp admin
@csrf.exempt
@app.route('/admin', methods=['POST', 'GET'])
def admin():
    """ This method helps in connecting to the mongo database.
    """
    form = AdminForm(request.form)
    form.port.data = "27017"
    verifyform = PassCodeForm(request.form)
    if request.method == 'POST' and form.validate():
        try:
            dbAdmin = MongoDBConnection.getDB(hostname=form.hostname.data, port=int(form.port.data),
                                        username=form.username.data, password=form.password.data,
                                        dbname=form.dbname.data, collection=form.collection.data, isssl=form.isSSL.data)
            paperCollectionlist = Paper.objects.get_unique_values('collections')
        except Exception as e:
            flash('Could not connect to server, \n ' + str(e))
            raise InvalidUsage('Could not connect to server, \n ' + str(e), status_code=410)
        flash('Connected')
        return redirect(url_for('qrespexplorer'))
    return render_template('admin.html', form=form,verifyform =verifyform )

# Fetches list of qresp admin
@csrf.exempt
@app.route('/config', methods=['POST', 'GET'])
def config():
    """ This method helps in connecting to the mongo database.
    :return:
    """
    form = ConfigForm(request.form)
    app.config['qresp_config']['fileServerPath'] = 'https://notebook.rcc.uchicago.edu/files'
    app.config['qresp_config']['downloadPath'] = 'https://www.globus.org/app/transfer?origin_id=72277ed4-1ad3-11e7-bbe1-22000b9a448b&origin_path='
    verifyform = PassCodeForm(request.form)
    return render_template('config.html', form=form,verifyform =verifyform)


# Fetches search options after selecting server
@csrf.exempt
@app.route('/search', methods=['POST', 'GET'])
def search():
    """  This method helps in filtering paper content
    :return: template: search.html
    """
    try:
        dao = PaperDAO()
        allpaperslist = dao.getAllFilteredSearchObjects("", "", "", "", "", "", "")
        if not allpaperslist:
            allpaperslist = []
        return render_template('search.html',
                               collectionlist=dao.getCollectionList(), authorslist=dao.getAuthorList(),
                               publicationlist=dao.getPublicationList(), allPapersSize=len(dao.getAllSearchObjects()),
                               allpaperslist = allpaperslist)
    except Exception as e:
        print(e)
        flash('Error in search. ' + str(e))
        return render_template('search.html',allpaperslist=[])


# Fetches search word options after selecting server
@csrf.exempt
@app.route('/searchWord', methods=['POST', 'GET'])
def searchWord():
    """  filtering paper content
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
        flash('Error in search. ' + str(e))


# Fetches details of chart based on user click
@csrf.exempt
@app.route('/paperdetails/<paperid>', methods=['POST', 'GET'])
def paperdetails(paperid):
    """  fetching papers details content
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
        paperdetail = []
        workflowdetail = []
        return render_template('paperdetails.html', paperdetail=paperdetail, workflowdetail=workflowdetail)



# Fetches workflow of chart based on user click
@csrf.exempt
@app.route('/chartworkflow', methods=['POST', 'GET'])
def chartworkflow():
    """  Fetching chart workflow content
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

@csrf.exempt
@app.route('/getDescriptor', methods=['POST','GET'])
def getDescriptor():
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

@app.route('/mint')
def mint():
    """ Fetches the mint page
    """
    return render_template('mint.html')

def main():
    app.secret_key = '\xfd{H\xe5<\x95\xf9\xe3\x96.5\xd1\x01O<!\xd5\xa2\xa0\x9fR"\xa1\xa8'
    CORS(app)
    app.run(port=80, debug=False)