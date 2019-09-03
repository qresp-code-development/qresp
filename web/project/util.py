import json
import re
import socket  # This method requires that we create our own socket
from copy import deepcopy
import paramiko  # Provides SSH functionality
import requests
from jsonschema import Draft4Validator
from requests_oauthlib import OAuth2Session
from lxml import html
from urllib.request import urlopen

import ssl

ssl._create_default_https_context = ssl._create_unverified_context

LOCALHOST = None



class DirectoryTree:
    """ Class Providing Constants for Directory Tree.
    """
    title = ""
    parent = ""
    key = ""
    id = ""
    lazy = ""
    folder = ""
    source = ""


class Servers():
    """ Class providing information about servers for federated search.
    """
    def __init__(self):
        self.__headers = {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/54.0.2840.90 Safari/537.36'}
        self.__urlString = "https://paperstack.uchicago.edu/static/qresp_servers.json"
        #self.__schemaString = "https://paperstack.uchicago.edu/static/v1_1.json"
        self.__schemaString = "http://localhost/static/v1_1.json"
        self.__httpUrlString = "https://paperstack.uchicago.edu/static/http_servers.json"

    def getServersList(self):
        """  Fetches list of servers
        :return object data: Json object of data from server
        """
        url = requests.get(self.__urlString, headers=self.__headers, verify = False)
        data = json.loads(url.text)
        return data

    def getHttpServersList(self):
        """ Fetches list of http servers
        :return object data: Json object of http data
        """
        url = requests.get(self.__httpUrlString, headers=self.__headers, verify=False)
        data = json.loads(url.text)
        return data


    def validateSchema(self,coll_data):
        """ Validates schema

        :param string coll_data:
        :return list exceptions:
        """
        exceptions = []
        try:
            url = requests.get(self.__schemaString, headers=self.__headers, verify = False)
            schema_coll_data = json.loads(url.text)
            a = Draft4Validator(schema_coll_data)
            for error in sorted(a.iter_errors(coll_data), key=str):
                print("errors, ",error)
                message = ""
                try:
                    exp = str(error.absolute_path[2]) + " is missing in " + str(error.absolute_path[0]) + " " + str(
                        error.absolute_path[1])
                    exceptions.append(exp)
                except IndexError:
                    try:
                        message = error.message
                        if "is not of type" or "is too short" in message:
                            message = "Missing values"
                        exp = str(message) + " in " + str(error.absolute_path[0]) + " "+ str(error.absolute_path[1])
                        exceptions.append(exp)
                    except IndexError:
                        try:
                            message = error.message
                            if "is not of type" or "is too short" in message:
                                message = "Missing values"
                            exp = str(message) + " in " + str(error.absolute_path[0])
                            exceptions.append(exp)
                        except IndexError:
                            exceptions.append(str(error.message))
        except:
            exceptions.append("Could not fetch schema")
        return exceptions

class Dtree():
    """ Class to build server tree
    """
    def __init__(self,path,session):
        self.__services = []
        self.session = session
        self.__listObjects = []
        self.__path = path.strip()
        self.__paperObjects = []
        self.__headers = {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/54.0.2840.90 Safari/537.36'}
        self.__previewUrlForZenodo = "/preview/"

    def fetchForTreeFromHttp(self):
        """ Fetches project from http server to build tree for curation
        :return: list listObjects: returns tree objects with file and folder content
        """
        page = requests.get(self.__path, headers=self.__headers, verify=False)
        tree = html.fromstring(page.content)
        for xtag in tree.xpath('//li/a'):
            file = xtag.text_content().strip()
            if 'Parent Directory' not in file:
                dataFile = DirectoryTree()
                dataFile.title = file
                parent = self.__path.split("/")
                parentName = parent[len(parent) - 2]
                dataFile.key = self.__path + "/" + file
                dataFile.id = file
                relPath = str(self.__path + "/" + file).split(parentName, 1)[1]
                dataFile.parent = parentName + relPath
                if '/' in file:
                    dataFile.folder = 'true'
                    dataFile.lazy = 'true'
                self.__listObjects.append(dataFile.__dict__)
        return self.__listObjects

    def fetchForTreeFromZenodo(self):
        """ Fetches project from zenodo to build tree for curation
           :return: list listObjects: returns tree objects with file and folder content
        """
        page = requests.get(self.__path, headers=self.__headers, verify=False)  # open iframe src url
        tree = html.fromstring(page.content)
        tag = '//div[@id="files"]/div[2]/table/tbody/tr/td/a'
        attrArray = self.__path.split("#")
        self.__path = attrArray[0]
        attrid = attrArray[1]
        for xtag in tree.xpath(tag):
            file = xtag.text_content().strip()
            if ".zip" in file:
                page = requests.get(self.__path+self.__previewUrlForZenodo+file, headers=self.__headers, verify=False)  # open iframe src url
                print(self.__path+self.__previewUrlForZenodo+file)
                tree = html.fromstring(page.content)
                tag = '//ul[@id="' + attrid + '"]/li/span[1]'
                for xtag in tree.xpath(tag):
                    file = xtag.text_content().strip()
                    dataFile = DirectoryTree()
                    dataFile.title = file
                    dataFile.key = self.__path +"files/"+ file
                    dataFile.id = file
                    dataFile.parent = attrid
                    print("Files",dataFile.__dict__)
                    self.__listObjects.append(dataFile.__dict__)
                tag = '//ul[@id="' + attrid + '"]/li/a[1]'
                for xtag in tree.xpath(tag):
                    file = xtag.text_content().strip()
                    href = xtag.xpath("@href")[0].split("#")[1]
                    dataFile = DirectoryTree()
                    dataFile.title = file
                    dataFile.key = self.__path + "#" + href
                    dataFile.id = href
                    dataFile.parent = attrid
                    dataFile.folder = 'true'
                    dataFile.lazy = 'true'
                    print("Folders>", dataFile.__dict__)
                    self.__listObjects.append(dataFile.__dict__)
        return self.__listObjects

    def openFileToReadConfigFromHttp(self, configFile):
        try:
            r = urlopen(str(self.__path + configFile))
            for line in r:
                line = str(line)
                if line and "=" in line:
                    linesplit = line.split("=", 1)
                    servicename = str(linesplit[0]).strip()
                    servicepath = str(linesplit[1]).strip()
                    if "http_service_path" in servicename:
                        if servicepath:
                            self.session["fileServerPath"] = servicepath
                            self.session["notebookPath"] = servicepath
                            self.__services.append("http_service_path")
                    elif "globus_service_path" in servicename:
                        if servicepath:
                            self.session["downloadPath"] = servicepath
                            self.__services.append("globus_service_path")
                    elif "isgitservice" in servicename:
                        if servicepath:
                            self.session["gitService"] = servicepath
                            self.__services.append("git_service")
        except Exception as e:
            print("Config file not found", e)

    def checkIsConfigFileFromHttp(self):
        ssh = ""
        isConfigFile = "N"
        try:
            page = requests.get(self.__path, headers=self.__headers, verify=False)
            tree = html.fromstring(page.content)
            for xtag in tree.xpath('//li/a'):
                file = xtag.text_content().strip()
                if 'Parent Directory' not in file:
                    if "qresp.ini" in file:
                        isConfigFile = "Y"
                        break
        except Exception as e:
            print("Could not find file",e)
        return isConfigFile

    def fetchServices(self):
        return self.__services


class FetchDOI():
    """ Fetches information using DOI
    """
    def __init__(self,doi):
        self.__doi = doi

    def find_word(self,text, search):
        """Util Function to find exact match in words.
        :return: Information of the References - Dictionary
        """
        result = re.findall('\\b' + text + '\\b', search, flags=re.IGNORECASE)
        if len(result) > 0:
            return True
        else:
            return False

    def fetchFromDOI(self):
        """Collects and Returns values given DOI for the Reference section of the drop down menu of the Curation step.
        :return: Information of the References - Dictionary
        """
        try:
            headers = {
                'Accept': 'application/rdf+xml;q=0.5, application/vnd.citationstyles.csl+json;q=1.0',
            }
            res = requests.get('https://doi.org/' + str(self.__doi), headers=headers)
            res.encoding = 'utf-8'
            response = json.loads(res.text)
            kind = "Journal"
            title = ""
            journalFull = ""
            volume = ""
            page = ""
            year = 0
            publishedAbstract = ""
            url = ""
            personList = []
            for resp in response.keys():
                if self.find_word(str(resp).strip(), "title"):
                    title = str(response[resp])
                elif self.find_word(str(resp).strip(), "container-title"):
                    journalFull = str(response[resp])
                elif self.find_word(str(resp).strip(), "container-title-short"):
                    journalAbbr = str(response[resp])
                elif self.find_word(str(resp).strip(), "volume"):
                    volume = str(response[resp])
                elif self.find_word(str(resp).strip(), "article-number") or self.find_word(str(resp).strip().lower(), "page"):
                    page = str(response[resp])
                elif self.find_word(str(resp).strip(), "created"):
                    if "date-parts" in str(response['created']).strip():
                        if len(response['created']['date-parts']) > 0:
                            year = int(response['created']['date-parts'][0][0])
                    if "date-time" in str(response['created']).strip().lower():
                        publishedDate = str(response['created']['date-time'])
                elif self.find_word(str(resp).strip(), "abstract"):
                    publishedAbstract = str(response[resp])
                elif self.find_word(str(resp).strip(), "URL"):
                    url = str(response[resp])
                elif self.find_word(str(resp).strip(), "author"):
                    for eachAuth in response['author']:
                        person = {}
                        if "given" in eachAuth:
                            first = ""
                            middle = ""
                            if ' ' in str(eachAuth["given"]):
                                parts = str(eachAuth["given"]).split()
                                first = str(parts[0])
                                middle = str(parts[1])
                                person["firstName"] = first
                                person["middleName"] = middle
                            else:
                                first = str(eachAuth["given"])
                                person["firstName"] = first
                        if "family" in eachAuth:
                            person["lastName"] = str(eachAuth["family"])
                        personList.append(person)
            referenceJSON = {}
            referenceJSON["authors"] = personList
            referenceJSON["journal"] = {"fullName":journalFull}
            referenceJSON["URLs"] = url
            referenceJSON["publishedAbstract"] = publishedAbstract
            referenceJSON["year"] = year
            referenceJSON["page"]= page
            referenceJSON["volume"] = volume
            referenceJSON["title"] = title
            referenceJSON["DOI"] = self.__doi
        except Exception as e:
            print(e)
            raise IOError
        return referenceJSON

class WorkflowCreator(object):
    """Class to create stand alone final workflow for the metadata(JSON) format.
    """
    def __init__(self,fileServerPath=None):
        self.desc = {}
        self.desc["charts"] = []
        self.desc["datasets"] = []
        self.desc["scripts"] = []
        self.desc["tools"] = []
        self.desc["heads"] = []
        self.desc["edges"] = []
        self.desc["nodes"] = []
        self.fileServerPath = fileServerPath

    def addChart(self, chart):
        image = '<img src="' + self.fileServerPath + "/" + chart.get("imageFile","") + '" width="250px;" height="250px;"/>'
        caption = "<b> Image: </b>" + image
        chart_tooltip = {}
        chart_tooltip['id'] = chart.get("id")
        chart_tooltip['caption'] = caption
        self.desc["charts"].append(chart_tooltip)

    def addDataset(self, dataset):
        caption = "<b> Description: </b>" + dataset.get("readme", "")
        dataset_tooltip = {}
        dataset_tooltip['id'] = dataset.get("id")
        dataset_tooltip['caption'] = caption
        self.desc["datasets"].append(dataset_tooltip)

    def addScript(self, script):
        caption = "<b> Description: </b>" + script.get("readme", "")
        script_tooltip = {}
        script_tooltip['id'] = script.get("id")
        script_tooltip['caption'] = caption
        self.desc["scripts"].append(script_tooltip)

    def addTool(self, tool):
        caption = None
        if tool.get("packageName") and tool.get("version"):
            caption = "<b> Package Name: </b>" + tool.get("packageName", "") + "<br/> <b> Version: </b>" + tool.get(
                "version", "")
        elif tool.get("facilityName") and tool.get("measurement"):
            caption = "<b> Facility Name: </b>" + tool.get("facilityName",
                                                           "") + " <br/> <b>Measurement: </b>" + tool.get(
                "measurement", "")
        tool_tooltip = {}
        tool_tooltip['id'] = tool.get("id")
        tool_tooltip['caption'] = caption
        self.desc["tools"].append(tool_tooltip)

    def addHead(self, head):
        if head.get("readme") or head.get("URLs"):
            caption = "<b> Description: </b>" + head.get("readme", "") + "<br/> <b> URLs: </b>" + head.get("URLs", "")
        head_tooltip = {}
        head_tooltip['id'] = head.get("id")
        head_tooltip['caption'] = caption
        self.desc["heads"].append(head_tooltip)

    def addEdge(self, edge):
        self.desc["edges"].append(edge)



class GenerateId():
    """
    Generates Ids to charts, datasets,scripts,heads
    """
    def __init__(self,type):
        self.index = 0
        self.type = type

    def addId(self,item):
        item['id'] = self.type[0] + str(self.index)
        self.index = self.index + 1
        return item


class ConvertField():
    """
    Util method to convert fields to List and list to String
    """
    def convertToList(fieldsList = [], formsList = [], data = None):
        if fieldsList and formsList:
            for forms in formsList:
                 for form in data.get(forms,[]):
                     for field in fieldsList:
                         if isinstance(form.get(field),str):
                            form[field] = [x.strip() for x in form[field].split(",")]
        else:
            if isinstance(data, str):
                data = [x.strip() for x in data.split(",")]
        return data

    def convertToString(fieldsList = [], formsList = [], data = None):
        for forms in formsList:
             for form in data.get(forms,[]):
                 for field in fieldsList:
                     if isinstance(form.get(field),list):
                        form[field] = ", ".join(form.get(field))
        return data



class SendDescriptor():
    """sends descriptor
    """
    def __init__(self,servername):
        self.__servername = servername

    def sendDescriptorToServer(self,data):
        """ Sends email to server
        :return: object: sends descriptor to server
        """
        url = self.__servername + "/getDescriptor"
        payload = {'metadata': data, 'servername': self.__servername}
        headers = {'Application': 'qresp', 'Accept': 'application/json', 'Content-Type': 'application/json'}
        response = requests.post(url, data=json.dumps(payload), headers=headers, verify=False)
        return response

class FetchDataFromAPI():
    """ Fetches data for search,paper details and chart details for explorer
    """
    def __init__(self,servernames):
        if isinstance(servernames,str):
            servernames = [servernames]
        if servernames and len(servernames)>0:
            serverList = servernames
        else:
            serverslist = Servers()
            serverList = [qrespserver['qresp_server_url'] for qrespserver in
                               serverslist.getServersList()]
        global LOCALHOST
        if LOCALHOST:
            serverList.append(LOCALHOST)
        self.__servernames = serverList

    def fetchOutput(self,apiname):
        """ Fetches output to server
        :return: object: sends descriptor to server
        """
        outDict = {}
        output = None
        self.__servernames = list(set(self.__servernames))
        for snames in self.__servernames:
            url = snames + apiname
            headers = {'Application': 'qresp', 'Accept': 'application/json', 'Content-Type': 'application/json'}
            response = requests.get(url,headers=headers, verify=False)
            if response.status_code == 200:
                if "paper" or "workflow" in apiname:
                    output = response.json()
                elif "search" in apiname:
                    outDict.update({eachsearchObj['_Search__title']:eachsearchObj for eachsearchObj in response.json()})
                    output = list(outDict.values())
                else:
                    outDict.update({eachsearchObj:eachsearchObj for eachsearchObj in response.json()})
                    output = list(outDict.values())
        return output


class ObjectsForPreview():
    """
    Generates Paper details and Workflow details objects
    """
    def __init__(self,form=None):
        self.data = form
        self.workflowinfo = WorkflowInfo()
        self.workflowinfo.nodes = {}
        self.workflowinfo.edges = []

    def getPaperDetails(self):
        paperDetails = PaperDetails()
        paper = self.data
        paperDetails.id = "preview_qresp"
        paperDetails.title = paper.reference.title.data
        paperDetails.tags = [form.data for form in paper.tags.entries]
        paperDetails.collections = [form.data for form in paper.collections.entries]
        if len(paper.reference.authors) > 0:
            if paper.reference.authors.entries[0].data.get("firstName"):
                paperDetails.authors = [authors.data.get("firstName") + " " + authors.data.get("lastName") for authors in paper.reference.authors.entries]
            paperDetails.authors = ", ".join(paperDetails.authors)
        if len(paper.PIs.entries) > 0:
            if paper.PIs.entries[0].data.get("firstName"):
                paperDetails.PIs = [pi.data.get("firstName") + " " + pi.data.get("lastName") for pi in
                                        paper.PIs.entries]
            paperDetails.PIs = ", ".join(paperDetails.PIs)
        if paper.reference.journal.fullName.data:
            paperDetails.publication = paper.reference.journal.fullName.data + " " + paper.reference.volume.data + ", " + paper.reference.page.data
        paperDetails.abstract = paper.reference.publishedAbstract.data
        paperDetails.doi = paper.reference.DOI.data
        paperDetails.fileServerPath = paper.info.fileServerPath.data
        paperDetails.downloadPath = paper.info.downloadPath.data
        paperDetails.notebookPath = paper.info.notebookPath.data
        paperDetails.notebookFile = paper.info.notebookFile.data
        paperDetails.year = paper.reference.year.data
        paperDetails.charts = [form.data for form in paper.charts.entries]
        paperDetails.datasets = [form.data for form in paper.datasets.entries]
        paperDetails.scripts = [form.data for form in paper.scripts.entries]
        paperDetails.tools = [form.data for form in paper.tools.entries]
        paperDetails.workflows = paper.workflow.data
        paperDetails.heads = [form.data for form in paper.heads]
        paperDetails.cite = 'N/A'
        paperDetails.timeStamp = paper.info.timeStamp.data
        paperDetails.firstName = paper.info.insertedBy.firstName.data
        paperDetails.middleName = paper.info.insertedBy.middleName.data
        paperDetails.lastName = paper.info.insertedBy.lastName.data
        paperDetails.emailId = paper.info.insertedBy.emailId.data
        paperDetails.affiliation = paper.info.insertedBy.affiliation.data
        paperDetails.documentation = paper.documentation.readme.data
        return paperDetails.__dict__

    def getWorkflowDetails(self):
        paper = self.data
        self.workflowinfo.paperTitle = paper.reference.title.data
        self.workflowinfo.edges = [form.data for form in paper.workflow.edges]
        nodes = [form.data for form in paper.workflow.nodes]
        for node in nodes:
            self.__insertWorkflowNodeDetails(node, paper)
        if paper.reference.title.data:
            self.workflowinfo.workflowType = "paper: " + paper.reference.title.data
        return self.workflowinfo.__dict__

    def __insertWorkflowNodeDetails(self, node, paper):
        """

        :param node:
        :param paper:
        :param nodeInfo:
        :return:
        """
        try:
            if "h" in node:
                for head in paper.heads.entries:
                    head = dotdict(head.data)
                    if node in str(head.id):
                        workflownodeinfo = WorkflowNodeInfo()
                        workflownodeinfo.toolTip = "<p><b>External " + head.id + "</b>: <i>" + head.readme + "</i></p>"
                        details = []
                        details.append("Head " + node)
                        details.append("<p><i>" + head.readme + "</i></p>" + self.__getLinks(head.URLs))
                        workflownodeinfo.details = details
                        workflownodeinfo.hasNotebookFile = False
                        if head.saveas:
                            workflownodeinfo.nodelabel = head.saveas
                        else:
                            workflownodeinfo.nodelabel = node
                        self.workflowinfo.nodes[node] = workflownodeinfo.__dict__
            elif "t" in node:
                for tool in paper.tools.entries:
                    tool = dotdict(tool.data)
                    if node in str(tool.id):
                        workflownodeinfo = WorkflowNodeInfo()
                        workflownodeinfo.toolTip = self.__getTooltipForTools(tool)
                        details = []
                        details.append("Tool " + node)
                        toollinks = self.__getLinks(tool.URLs)
                        tooldetails = self.__getTooltipForTools(tool)
                        toolfiles = self.__getFiles(tool.files, paper.info.fileServerPath.data)
                        workflowtools = tooldetails + toollinks + toolfiles + "</i></p>"
                        details.append(workflowtools)
                        workflownodeinfo.details = details
                        if tool.saveas:
                            workflownodeinfo.nodelabel = tool.saveas
                        else:
                            workflownodeinfo.nodelabel = node
                        workflownodeinfo.hasNotebookFile = False
                        self.workflowinfo.nodes[node] = workflownodeinfo.__dict__

            elif "d" in node:
                for dataset in paper.datasets.entries:
                    dataset = dotdict(dataset.data)
                    if node in str(dataset.id):
                        workflownodeinfo = WorkflowNodeInfo()
                        workflownodeinfo.toolTip = self.__getTooltipForNode(dataset, node)
                        details = []
                        extradatasetfields = ""
                        details.append("Dataset " + node)
                        datasetlinks = self.__getLinks(dataset.URLs)
                        datasetdetails = self.__getTooltipForNode(dataset, node)
                        datasetfiles = self.__getFiles(dataset.files, paper.info.fileServerPath.data)
                        # extradatasetfields = self.__getExtraFields(dataset)
                        workflowdatasets = datasetdetails + datasetlinks + datasetfiles + extradatasetfields
                        details.append(workflowdatasets)
                        workflownodeinfo.details = details
                        if dataset.saveas:
                            workflownodeinfo.nodelabel = dataset.saveas
                        else:
                            workflownodeinfo.nodelabel = node
                        workflownodeinfo.hasNotebookFile = False
                        self.workflowinfo.nodes[node] = workflownodeinfo.__dict__

            elif "s" in node:
                for script in paper.scripts.entries:
                    script = dotdict(script.data)
                    if node in str(script.id):
                        workflownodeinfo = WorkflowNodeInfo()
                        workflownodeinfo.toolTip = self.__getTooltipForNode(script, node)
                        details = []
                        extrascriptfields = ""
                        details.append("Script " + node)
                        scriptlinks = self.__getLinks(script.URLs)
                        scriptdetails = self.__getTooltipForNode(script, node)
                        scriptfiles = self.__getFiles(script.files, paper.info.fileServerPath.data)
                        workflowscripts = scriptdetails + scriptlinks + scriptfiles + extrascriptfields
                        details.append(workflowscripts)
                        workflownodeinfo.details = details
                        if script.saveas:
                            workflownodeinfo.nodelabel = script.saveas
                        else:
                            workflownodeinfo.nodelabel = node
                        workflownodeinfo.hasNotebookFile = False
                        self.workflowinfo.nodes[node] = workflownodeinfo.__dict__

            elif "c" in node:
                for chart in paper.charts.entries:
                    chart = dotdict(chart.data)
                    print("c",chart.files)
                    if node in str(chart.id):
                        workflownodeinfo = WorkflowNodeInfo()
                        workflownodeinfo.toolTip = self.__getTooltipForNode(chart, node, paper.info.fileServerPath.data)
                        details = []
                        extrachartfields = ""
                        details.append("Chart " + node)
                        chartlinks = self.__getLinks(chart.properties, "charts")
                        chartdetails = self.__getTooltipForNode(chart, node, paper.info.fileServerPath.data)
                        chartfiles = self.__getFiles(chart.files, paper.info.fileServerPath.data)
                        # extrachartfields = self.__getExtraFields(chart)
                        workflowcharts = chartdetails + chartlinks + chartfiles + extrachartfields
                        details.append(workflowcharts)
                        workflownodeinfo.details = details
                        if chart.saveas:
                            workflownodeinfo.nodelabel = chart.saveas
                        else:
                            workflownodeinfo.nodelabel = node
                        workflownodeinfo.hasNotebookFile = False
                        self.workflowinfo.nodes[node] = workflownodeinfo.__dict__
                        self.workflowinfo.workflowType = chart.number + " of " + paper.reference.title.data
        except Exception as e:
            print(e)

    def __getLinks(self, urls, properties=None):
        links = ""
        if urls and len(urls) > 0:
            if properties:
                for url in urls:
                    links = links + ", " + url
                if links:
                    links = "<p><b>Properties: </b>" + links.strip(",") + "</p>"
            else:
                for url in urls:
                    links = links + "<p><a href=" + url + " title=" + url + " target='_blank'>" + url + "</a></p>"
                if links:
                    links = links.strip()
                    links = links.strip(",")
                    links = "<p><b>URLs:</b>" + links + "</p>"
        return links

    def __getFiles(self, files, fileserverpath):
        filelinks = ""
        if files and len(files) > 0:
            for file in files:
                filename = file.rsplit('/', 1)[-1]
                if filename:
                    filelinks = filelinks + "<a href=" + fileserverpath + "/" + file + " title='Click to view " + filename + "' target='_blank'>" + filename + "</a>" + ", "
        if filelinks:
            filelinks = filelinks.strip()
            filelinks = filelinks.strip(",")
            filelinks = "<p><b>Files: </b>" + filelinks + "</p>"
        return filelinks

    def __getTooltipForTools(self, tool):
        details = ""
        if "experiment" in tool.kind:
            details = "<i>Experiment</i></p><p><b>Facility Name:</b> " + tool.facilityName + \
                      "</p><p><b>Measurement:</b> " + tool.measurement + "</p>"
        elif "software" in tool.kind:
            details = "<i>Software</i></p><p><b>Package Name:</b> " + tool.packageName \
                      + "</p><p><b>Executable Name:</b> " + tool.programName \
                      + "</p><p><b>Version:</b> " + tool.version
            if tool.readme:
                details = details + "</p><p><b>Readme:</b> " + tool.readme + "</p>"
        return "<p><b>Tool " + tool.id + "</b>: " + details

    def __getTooltipForNode(self, node, workflowtype, fileServerPath=None):
        tooltip = ""
        if "d" in workflowtype:
            tooltip = "<p><b>Dataset " + node.id + "</b>: <i>" + node.readme + "</i>"
        elif "s" in workflowtype:
            tooltip = "<p><b>Script " + node.id + "</b>: <i>" + node.readme + "</i>"
        elif "c" in workflowtype:
            tooltip = "<p><img src='" + fileServerPath + "/" + node.imageFile + "' class='img-responsive img-thumbnail'></p><p><b>" \
                      + node.number + ": </b><i>" + node.caption + "</i></p>"
        return tooltip

    def __getExtraFields(self, node):
        extraFieldValues = ""
        for hashkey, value in node.extraFields.items():
            if hashkey:
                for extrafieldkey, extrafieldval in hashkey.items():
                    extraFieldValues = extraFieldValues + "<p><b>" + extrafieldkey + ": </b><br>" + ", " + extrafieldval + "</p>"
        return extraFieldValues

class dotdict(dict):
    """dot.notation access to dictionary attributes"""
    __getattr__ = dict.get
    __setattr__ = dict.__setitem__
    __delattr__ = dict.__delitem__

class GoogleAuth():
    """ Authorization for google.
    """

    def __init__(self,clientid = None,redirecturi = None,scope = None):
        self.clientid = clientid
        self.redirecturi = redirecturi
        self.scope = scope


    def getGoogleAuth(self,state=None,token=None):
        if token:
            return OAuth2Session(self.clientid, token=token)
        if state:
            return OAuth2Session(
                self.clientid,
                state=state,
                redirect_uri=self.redirecturi)
        oauth = OAuth2Session(self.clientid,redirect_uri=self.redirecturi,scope=self.scope)
        return oauth

class SetLocalHost:
    def __init__(self,localhost):
        global LOCALHOST
        LOCALHOST = localhost


class Search(object):
    """ Class collecting Search details"""
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
    """
    Class collecting details of Paper
    """
    id = ""
    title = ""
    tags = []
    collections = []
    authors = []
    PIs = []
    firstName = ""
    middleName = ""
    lastName = ""
    emailId = ""
    affiliation = ""
    publication = ""
    abstract = ""
    doi = ""
    serverPath = ""
    folderAbsolutePath = ""
    fileServerPath = ""
    downloadPath = ""
    notebookPath = ""
    notebookFile = ""
    cite = ""
    heads = ""
    charts = []
    datasets = []
    workflows = []
    scripts = []
    tools = []
    year = 0
    timeStamp = ""
    documentation = ""

class WorkflowInfo:
    """
    Class collecting info for workflow
    """
    paperTitle = ""
    edges = []
    nodes = {}
    workflowType = ""

class WorkflowNodeInfo:
    """
    Class collecting node info
    """
    toolTip = ""
    details = []
    notebookFile = ""
    fileServerPath = ""
    nodelabel = ""
    hasNotebookFile = False