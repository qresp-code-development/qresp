import requests
from lxml import html
from urllib.request import urlopen

import ssl
ssl._create_default_https_context = ssl._create_unverified_context


class Dtree():
    """
    Class to build server tree
    """

    def __init__(self, path):
        self.__listObjects = []
        self.__path = path.strip()
        self.__paperObjects = []
        self.__serviceObjects = {}
        self.__headers = {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/54.0.2840.90 Safari/537.36'}
        self.__previewUrlForZenodo = "/preview/"

    def fetchForTreeFromHttp(self):
        """
        Fetches project from http server to build tree for curation
        :return: list listObjects: returns tree objects with file and folder content
        """
        page = requests.get(self.__path, headers=self.__headers, verify=False)
        tree = html.fromstring(page.content)
        for xtag in tree.xpath('//table//tr/td[2]/a'):
            file, fileLink = xtag.text_content().strip(), xtag.attrib['href']
            if 'Parent Directory' not in file:
                dataFile = DirectoryTree()
                dataFile.title = fileLink
                # parent = self.__path.split("/")
                # parentName = parent[len(parent) - 2]
                dataFile.key = self.__path + "/" + fileLink
                # dataFile.id = fileLink
                # relPath = str(self.__path + "/" +fileLink.strip("/")).split(parentName, 1)[1]
                # dataFile.parent = parentName + relPath
                if '/' in fileLink:
                    dataFile.folder = 'true'
                    dataFile.lazy = 'true'
                self.__listObjects.append(dataFile.__dict__)
        return self.__listObjects

    def fetchForTreeFromZenodo(self):
        """
        Fetches project from zenodo to build tree for curation
        :return: list listObjects: returns tree objects with file and folder content
        """
        page = requests.get(self.__path, headers=self.__headers,
                            verify=False)  # open iframe src url
        tree = html.fromstring(page.content)
        tag = '//div[@id="files"]/div[2]/table/tbody/tr/td/a'
        attrArray = self.__path.split("#")
        self.__path = attrArray[0]
        attrid = attrArray[1]
        for xtag in tree.xpath(tag):
            file = xtag.text_content().strip()
            if ".zip" in file:
                page = requests.get(self.__path+self.__previewUrlForZenodo+file,
                                    headers=self.__headers, verify=False)  # open iframe src url
                tree = html.fromstring(page.content)
                tag = '//ul[@id="' + attrid + '"]/li/span[1]'
                for xtag in tree.xpath(tag):
                    file = xtag.text_content().strip()
                    dataFile = DirectoryTree()
                    dataFile.title = file
                    dataFile.key = self.__path + "files/" + file
                    dataFile.id = file
                    dataFile.parent = attrid
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
                    self.__listObjects.append(dataFile.__dict__)
        return self.__listObjects

    def openFileToReadConfigFromHttp(self, configFile):
        """
        Reads config file by scrping ini file
        :param configFile: qresp.ini file
        :return: objects with paths for notebook and download
        """
        try:
            r = urlopen(str(self.__path + "/"+configFile))
            for line in r:
                line = str(line)
                if line and "=" in line:
                    linesplit = line.split("=", 1)
                    servicename = str(linesplit[0]).strip()
                    servicepath = str(linesplit[1]).strip("\\n'").strip()
                    if "http_service_path" in servicename:
                        if servicepath:
                            self.__serviceObjects["fileServerPath"] = servicepath
                            self.__serviceObjects["notebookPath"] = servicepath
                    elif "globus_service_path" in servicename:
                        if servicepath:
                            self.__serviceObjects["downloadPath"] = servicepath
                    elif "isgitservice" in servicename:
                        if servicepath:
                            self.__serviceObjects["gitPath"] = servicepath
        except Exception as e:
            print("Config file not found", e)
        return self.__serviceObjects


class dotdict(dict):
    """dot.notation access to dictionary attributes"""
    __getattr__ = dict.get
    __setattr__ = dict.__setitem__
    __delattr__ = dict.__delitem__


class WorkflowObject:
    """
    Class defining HTML workflow objects for Paper workflow
    """

    def _getLinks(self, urls, properties=None):
        """
        Builds links for url and properties
        :param urls: url objects for each node
        :param properties: properties for each node
        :return: string objects with links
        """
        links = ""
        if urls and len(urls) > 0:
            if properties:
                for url in urls:
                    links = links + ", " + url
                if links:
                    links = "<p><b>Properties: </b>" + \
                        links.strip(",") + "</p>"
            else:
                for url in urls:
                    links = links + "<p><a href=" + url + " title=" + \
                        url + " target='_blank'>" + url + "</a></p>"
                if links:
                    links = links.strip()
                    links = links.strip(",")
                    links = "<p><b>URLs:</b>" + links + "</p>"
        return links

    def _getFiles(self, files, fileserverpath):
        """
        Builds links for files
        :param files: files object
        :param fileserverpath: path to files
        :return: links for files
        """
        filelinks = ""
        if files and len(files) > 0:
            for file in files:
                filename = file.rsplit('/', 1)[-1]
                if filename:
                    filelinks = filelinks + "<a href=" + fileserverpath + "/" + file + \
                        " title='Click to view " + filename + \
                        "' target='_blank'>" + filename + "</a>" + ", "
        if filelinks:
            filelinks = filelinks.strip()
            filelinks = filelinks.strip(",")
            filelinks = "<p><b>Files: </b>" + filelinks + "</p>"
        return filelinks

    def _getTooltipForTools(self, tool):
        """
        Tool tip for node tools
        :param tool: Tool object
        :return: string object for tool node
        """
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

    def _getTooltipForNode(self, node, workflowtype, fileServerPath=None):
        """
        Fetches tool tips for node
        :param node: node of type head,dataset, chart,script,tools
        :param workflowtype: workflow of type dataset, script or charts
        :param fileServerPath: File Server path to files destination
        :return: tooltip for each node
        """
        tooltip = ""
        if "d" in workflowtype:
            # Descriptions and captions are optional and may be absent.
            tooltip = "<p><b>Dataset " + node.id + "</b>: <i>" + (node.readme or "") + "</i>"
        elif "s" in workflowtype:
            tooltip = "<p><b>Script " + node.id + "</b>: <i>" + (node.readme or "") + "</i>"
        elif "c" in workflowtype:
            tooltip = "<p><img src='" + fileServerPath + "/" + node.imageFile + "' class='img-responsive img-thumbnail'></p><p><b>" \
                      + node.number + ": </b><i>" + (node.caption or "") + "</i></p>"
        return tooltip

    def _getExtraFields(self, node):
        """
        Fetch extra fields values for each node
        :param node: node of type head,chart,script,tools
        :return: A string object with extra fields
        """
        extraFieldValues = ""
        for hashkey, value in node.extraFields.items():
            if hashkey:
                for extrafieldkey, extrafieldval in hashkey.items():
                    extraFieldValues = extraFieldValues + "<p><b>" + \
                        extrafieldkey + ": </b><br>" + ", " + extrafieldval + "</p>"
        return extraFieldValues


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
        # Optional, record-level -- see project.models.Paper.institution.
        # Absent on records published before the field existed.
        self.institution = ""
        # Private records are listed only to sessions that can open them;
        # the flag lets the explorer badge them.
        self.is_private = False
        # 'paper' | 'report' | 'software' | 'dataset' | 'other'; legacy
        # records are 'paper'. Lets the explorer badge non-paper works.
        self.work_type = "paper"
        # The requesting session's role on the record ('owner', 'editor',
        # 'viewer' or ''), so the explorer can label the reader's own records.
        self.my_role = ""

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
    def institution(self):
        return self.__institution

    @institution.setter
    def institution(self, val):
        self.__institution = val

    @property
    def is_private(self):
        return self.__is_private

    @is_private.setter
    def is_private(self, val):
        self.__is_private = val

    @property
    def work_type(self):
        return self.__work_type

    @work_type.setter
    def work_type(self, val):
        self.__work_type = val

    @property
    def my_role(self):
        return self.__my_role

    @my_role.setter
    def my_role(self, val):
        self.__my_role = val

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
    # 'paper' (published, and every legacy record) | 'report' | 'software' |
    # 'dataset' | 'other', and the reference URL (a code repository's URL).
    work_type = "paper"
    url = ""
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
    license = ""
    # Optional, record-level -- see project.models.Paper.institution.
    institution = ""


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


class DirectoryTree:
    """
    Class Providing Constants for Directory Tree.
    """
    title = ""
    parent = ""
    key = ""
    id = ""
    lazy = ""
    folder = ""
    source = ""
