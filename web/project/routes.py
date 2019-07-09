import os
from datetime import timedelta, datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


import schedule
from flask import render_template, request, flash, redirect, url_for, jsonify, session,send_file
from project import csrf
from project import ext
import smtplib

from flask_cors import CORS

from .paperdao import PaperDAO,MongoDBConnection
from .util import *
from .views import *
from project import app
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
    #TO BE DELETED
    #SetLocalHost(str(request.host_url).strip("/"))
    return render_template('index.html')

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


@app.route('/qrespcurator')
def qrespcurator():
    """ Fetches the curator homepage
    """
    return render_template('qrespcurator.html')

@app.route('/startfromscratch')
def startfromscratch():
    """ clears session
    """
    session.clear()
    return redirect(url_for('details'))

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
        infoform.notebookFile.data = paperform.info.notebookFile.data
        session["info"] = infoform.data
        session["PIs"] = [form.data for form in infoform.PIs.entries]
        session["tags"] = [form for form in paperform.tags.data]
        session["collections"] = [form for form in paperform.collections.data]
        session["workflow"] = paperform.workflow.data
        return jsonify(out="Processed text"), 200
    except Exception as e:
        print(e)
        return jsonify(error=str(e)), 400

@csrf.exempt
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
            render_template('server.html', form=form), 400
    return render_template('server.html', form=form), 200


@csrf.exempt
@app.route('/project', methods=['GET'])
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
            if "/" in absPath:
                dtree = Dtree(ftp, absPath.rsplit("/", 1)[0], session)
            else:
                dtree = Dtree(ftp, absPath, session)
            dtree.openFileToReadConfig("qresp.ini")
            services = dtree.fetchServices()
            isConfig = dtree.checkIsConfigFile()
            session["folderAbsolutePath"] = absPath
            if "/" in absPath:
                session["ProjectName"] = absPath.rsplit("/",1)[1]
            else:
                session["ProjectName"] = absPath
            return jsonify(folderAbsolutePath=absPath,isConfigFile=isConfig,services=services), 200
    except Exception as e:
        print(e)
        flash("Could not connect to server. Plase try again! " + str(e))
        return jsonify(folderAbsolutePath=absPath, isConfigFile=isConfig, services=services), 401


@csrf.exempt
@app.route('/getTreeInfo', methods=['POST', 'GET'])
def getTreeInfo():
    """   Renders the Tree containing Project Information which is 'SSH'ed with the remote directory.
    """
    pathDetails = request.get_json()
    listObjects = []
    services = []
    try:
        ftpclient = session.get("sftpclient")
        ftp = ftp_dict[ftpclient]
        if 'folderAbsolutePath' in pathDetails:
            content_path = pathDetails['folderAbsolutePath']
        else:
            content_path = session.get("folderAbsolutePath")
        dtree = Dtree(ftp,content_path,session)
        listObjects = dtree.fetchForTree()
        services = dtree.fetchServices()
    except Exception as e:
        jsonify({'errors':str(e)}), 400
        print(e)
    return jsonify({'listObjects': listObjects, 'services': services}), 200

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
    use_hybrid3 = 'use-hybrid3' in session
    hybrid3_add_data_url = (f'{app.config["HYBRID3_URL"]}/materials/add-data?'
                            f'return-url={app.config["HOST_URL"]}/hybrid3')
    if use_hybrid3:
        chartform.make_fields_readonly()
    if session.get('hybrid3-reference'):
        hybrid3_ref = session.get('hybrid3-reference')
        authors = [{'firstName': a['first_name'], 'lastName': a['last_name']}
                   for a in hybrid3_ref['authors']]
        referenceform = ReferenceForm(
            kind=hybrid3_ref['kind'],
            DOI=hybrid3_ref['DOI'],
            authors=authors,
            title=hybrid3_ref['title'],
            page=hybrid3_ref['page'],
            publishedAbstract=hybrid3_ref['publishedAbstract'],
            volume=hybrid3_ref['volume'],
            year=hybrid3_ref['year'],
            URLs=hybrid3_ref['URLs'])
        referenceform.journal = JournalForm(fullName=hybrid3_ref['journal'])
        referenceform.make_fields_readonly()
        hybrid3_add_data_url = f'{hybrid3_add_data_url}&reference={hybrid3_ref["pk"]}'
    return render_template('curate.html',infoform=infoform,chartlistform=chartlist,chartform=chartform,
                           toollistform=toollist,toolform=toolform,datalistform=datasetlist,datasetform=datasetform,
                           scriptlistform=scriptlist,scriptform=scriptform,referenceform=referenceform,projName=projectName,documentationform=documentationform,
                           use_hybrid3=use_hybrid3, hybrid3_add_data_url=hybrid3_add_data_url)

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
        session["notebookFile"] = infoform.notebookFile.data
        msg = "Info Saved"
        return jsonify(data=msg), 200
    return jsonify(data=infoform.errors), 400

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
        return jsonify(chartList = chartList), 200
    return jsonify(data=chartform.errors), 200

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
        return jsonify(toolList = toolList), 200
    return jsonify(errors=toolform.errors), 200

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
        return jsonify(datasetList = datasetList), 200
    return jsonify(data=datasetform.errors), 200

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
        return jsonify(scriptList = scriptList), 200
    return jsonify(data=scriptform.errors), 200

@csrf.exempt
@app.route('/reference', methods=['POST', 'GET'])
def reference():
    """ This method helps in filling reference section for paper.
    """
    referenceform = ReferenceForm(request.form)
    if request.method == 'POST' and referenceform.validate():
        session["reference"] = referenceform.data
        msg = "Reference Saved"
        return jsonify(data=msg), 200
    return jsonify(data=referenceform.errors), 200

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
        return jsonify(errors="Recheck your DOI"), 400
    return jsonify(fetchDOI=refdata.data), 200

@csrf.exempt
@app.route('/documentation', methods=['POST', 'GET'])
def documentation():
    """ This method helps in adding documentation to the paper.
    """
    docform = DocumentationForm(request.form)
    if request.method == 'POST' and docform.validate():
        session["documentation"] = docform.data
        msg = "Documentation Saved"
        return jsonify(data=msg), 200
    return jsonify(data=docform.errors), 200

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
    return jsonify({'workflow': workflow.__dict__}), 200


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
    if projectName and 'use-hybrid3' not in session:
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
    return jsonify(paper=paperdata), 200


@csrf.exempt
@app.route('/acknowledgement', methods=['POST', 'GET'])
def acknowledgement():
    """Final acknowledgement page
    """
    return render_template('acknowledgement.html')

########################################EXPLORER#############################################################################

@csrf.exempt
@app.route('/qrespexplorer',methods=['GET','POST'])
def qrespexplorer():
    """ Fetches the explorer homepage
    """
    form = QrespServerForm()
    serverslist = Servers()
    form.serverList = [qrespserver['qresp_server_url'] for qrespserver in
                           serverslist.getServersList()]
    if request.method == 'POST':
        if request.form.getlist('serversList'):
            session["selectedserver"] = request.form.getlist('serversList')
        else:
            session['selectedserver'] = form.serverList
        return redirect(url_for('search'))
    return render_template('qrespexplorer.html', form=form)

@csrf.exempt
@app.route('/verifyPasscode',methods=['POST'])
def verifypasscode():
    """ This method verifies with input passcode of flask connection.
    """
    form = PassCodeForm(request.form)
    confirmpasscode = app.config['passkey']
    if request.method == 'POST' and form.validate():
        if confirmpasscode == form.passcode.data:
            return jsonify(msg="success"),200
    return jsonify(msg="failed"),401

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
        except Exception as e:
            flash('Could not connect to server, \n ' + str(e))
            raise InvalidUsage('Could not connect to server, \n ' + str(e), status_code=410)
        flash('Connected')
        SetLocalHost(str(request.host_url).strip("/"))
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
    allpaperslist = []
    collectionlist = []
    authorslist = []
    publicationlist = []
    allPapersSize = 0
    try:
        selectedserver = session.get("selectedserver")
        fetchdata = FetchDataFromAPI(selectedserver)
        fetchallpaperslist = fetchdata.fetchOutput('/api/search')
        fetchcollectionlist = fetchdata.fetchOutput('/api/collections')
        fetchauthorslist = fetchdata.fetchOutput('/api/authors')
        fetchpublicationlist = fetchdata.fetchOutput('/api/publications')
        if fetchallpaperslist and len(fetchallpaperslist)>0:
            allpaperslist = fetchallpaperslist
            collectionlist = fetchcollectionlist
            authorslist = fetchauthorslist
            publicationlist = fetchpublicationlist
            allPapersSize = len(allpaperslist)
    except Exception as e:
        print(e)
        flash('Error in search. ' + str(e))
        return render_template('search.html', allpaperslist=allpaperslist)
    return render_template('search.html',allpaperslist=allpaperslist,collectionlist=collectionlist,authorslist=authorslist,
                           publicationlist=publicationlist,allPapersSize=allPapersSize)


# Fetches search word options after selecting server
@csrf.exempt
@app.route('/searchWord', methods=['POST', 'GET'])
def searchWord():
    """  filtering paper content
    :return: object: allpaperlist
    """
    allpaperslist = []
    try:
        dao = PaperDAO()
        searchWord = request.args.get('searchWord', type=str)
        paperTitle = request.args.get('paperTitle', type=str)
        doi = request.args.get('doi', type=str)
        tags = request.args.get('tags', type=str)
        collectionList = json.loads(request.args.get('collectionList'))
        authorsList = json.loads(request.args.get('authorsList'))
        publicationList = json.loads(request.args.get('publicationList'))
        selectedserver = session.get("selectedserver")
        fetchdata = FetchDataFromAPI(selectedserver)
        url = '/api/search'+"?searchWord="+searchWord+"&paperTitle="+paperTitle+"&doi="+doi+"&tags="+tags+"&collectionList="+",".join(collectionList) + \
              "&authorsList="+",".join(authorsList)+"&publicationList="+",".join(publicationList)
        allpaperslist = fetchdata.fetchOutput(url)
        return jsonify(allpaperslist=allpaperslist), 200
    except Exception as e:
        print(e)
        flash('Error in search. ' + str(e))
        return jsonify(allpaperslist=allpaperslist), 400


# Fetches details of chart based on user click
@csrf.exempt
@app.route('/paperdetails/<paperid>', methods=['POST', 'GET'])
def paperdetails(paperid):
    """  fetching papers details content
    :return: template: paperdetails.html
    """
    paperdetail = []
    workflowdetail = []
    try:
        selectedserver = session.get("selectedserver")
        fetchdata = FetchDataFromAPI(selectedserver)
        url = '/api/paper/'+paperid
        paperdetail = fetchdata.fetchOutput(url)
        url = '/api/workflow/'+paperid
        workflowdetail = fetchdata.fetchOutput(url)
        return render_template('paperdetails.html', paperdetail=paperdetail, workflowdetail=workflowdetail)
    except Exception as e:
        print(e)
        flash('Error in paperdetails. ' + str(e))
        return render_template('paperdetails.html', paperdetail=paperdetail, workflowdetail=workflowdetail)



# Fetches workflow of chart based on user click
@csrf.exempt
@app.route('/chartworkflow', methods=['POST', 'GET'])
def chartworkflow():
    """  Fetching chart workflow content
    :return: object: chartworkflow
    """
    chartworkflowdetail = []
    try:
        dao = PaperDAO()
        paperid = request.args.get('paperid', 0, type=str)
        paperid = str(paperid).strip()
        chartid = request.args.get('chartid', 0, type=str)
        chartid = str(chartid).strip()
        selectedserver = session.get("selectedserver")
        fetchdata = FetchDataFromAPI(selectedserver)
        url = '/api/paper/' + paperid + '/chart/' + chartid
        chartworkflowdetail = fetchdata.fetchOutput(url)
        return jsonify(chartworkflowdetail=chartworkflowdetail), 200
    except Exception as e:
        print(e)
        flash('Error in chartdetails. ' + str(e))
        return jsonify(chartworkflowdetail=chartworkflowdetail), 400

@csrf.exempt
@app.route('/getDescriptor', methods=['POST','GET'])
def getDescriptor():
    """
    Inserts and fetches the metadata into Papers collections
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

@app.route('/mint', methods=['POST','GET'])
def mint():
    """ Fetches the mint page
    """
    return render_template('mint.html')

@app.route('/insertDOI', methods=['POST','GET'])
def insertDOI():
    """ Inserts DOI to database
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

@app.route('/use-hybrid3', methods=['GET'])
def use_hybrid3():
    """Switch on the global flag for exporting data to HybriD3."""
    session['use-hybrid3'] = True
    return redirect(url_for('curate'))


@app.route('/hybrid3', methods=['GET'])
def hybrid3():
    """Fetch data from HybriD3 and prefill forms in Qresp."""
    dataset = requests.get(f'{app.config["HYBRID3_URL"]}/materials/datasets/'
                           f'{request.args.get("pk")}/info').json()
    pk = dataset['pk']
    session['fileServerPath'] = app.config['HYBRID3_URL']
    session['downloadPath'] = 'materials'
    if not session.get("ProjectName"):
        session['ProjectName'] = f'materials_{pk}'
    if dataset['caption']:
        caption = dataset['caption']
    else:
        caption = f'dataset {pk}'
    properties = [dataset['primary_property']]
    if dataset['primary_unit']:
        properties[-1] += f' ({dataset["primary_unit"]})'
    if dataset['secondary_property']:
        properties.append(dataset["secondary_property"])
    if dataset['secondary_unit']:
        properties[-1] += f' ({dataset["secondary_unit"]})'
    chartList = deepcopy(session.get('charts', []))
    chartList.append({
        'id': '',
        'caption': caption,
        'number': str(len(chartList) + 1),
        'files': f'media/qresp/dataset_{pk}/data.txt',
        'imageFile': f'media/qresp/dataset_{pk}/figure.png',
        'notebookFile': '',
        'properties': properties,
        'saveas': f'dataset_{pk}.png',
        'extraFields': [
            {
                'extrakey': '',
                'extravalue': ''
            }
        ]
    })
    session['charts'] = deepcopy(chartList)
    reference = requests.get(
        f'{app.config["HYBRID3_URL"]}/materials/references/'
        f'{dataset["reference"]}').json()
    session['hybrid3-reference'] = {
        'pk': reference['pk'],
        'kind': 'journal',
        'DOI': reference['doi_isbn'],
        'authors': reference['author_set'],
        'title': reference['title'],
        'journal': reference['journal'],
        'page': reference['pages_start'],
        'publishedAbstract': '',
        'volume': reference['vol'],
        'year': reference['year'],
        'URLs': '',
    }
    return redirect(url_for('curate'))


@app.route('/export/<paperid>', methods=['GET'])
def export(paperid):
    """Export some of the data to HybriD3.

    Since HybriD3 is a structured database (MariaDB), the user will
    have to fill in most fields on the HybriD3 data submission
    webpage.

    """
    selectedserver = session.get('selectedserver')
    fetchdata = FetchDataFromAPI(selectedserver)
    paper_detail = fetchdata.fetchOutput(f'/api/paper/{paperid}')
    n_charts = len(paper_detail['_PaperDetails__charts'])
    if 'current_export_chart' not in session:
        session['current_export_chart'] = 0
    else:
        session['current_export_chart'] += 1
    if session.get('current_export_chart') == n_charts - 1:
        return_url = f'{app.config["HOST_URL"]}/paperdetails/{paperid}'
    else:
        return_url = f'{app.config["HOST_URL"]}/export/{paperid}'
    hybrid3_add_data_url = (
        f'{app.config["HYBRID3_URL"]}/materials/add-data?'
        f'return-url={return_url}&'
        f'qresp-fetch-url={app.config["HOST_URL"]}/get-paper-details/{paperid}'
        f'&qresp-chart-nr={session.get("current_export_chart")}')
    if session.get('current_export_chart') == n_charts - 1:
        session.pop('current_export_chart')
    return redirect(hybrid3_add_data_url)


@app.route('/get-paper-details/<paperid>', methods=['GET'])
def get_paper_details(paperid):
    selectedserver = session.get('selectedserver')
    fetchdata = FetchDataFromAPI(selectedserver)
    paper_detail = fetchdata.fetchOutput(f'/api/paper/{paperid}')
    return jsonify(paper_detail)


def main(port):
    app.secret_key = '\xfd{H\xe5<\x95\xf9\xe3\x96.5\xd1\x01O<!\xd5\xa2\xa0\x9fR"\xa1\xa8'
    CORS(app)
    app.run(port=port, debug=False)
