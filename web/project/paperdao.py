import re
import traceback
from project.db import *
from project.models import *
from project.util import WorkflowInfo, WorkflowNodeInfo, Search, PaperDetails


class PaperDAO(MongoDBConnection):
    """ Class providing data access objects
    """
    def __init__(self):
        self.hasvisited = []
        self.workflowinfo = WorkflowInfo()
        self.workflowinfo.nodes = {}
        self.workflowinfo.edges = []

    def getCollectionList(self):
        """ fetches all collections from paper
        :return list: List of collections
        """
        paperCollectionlist = Paper.objects.get_unique_values('collections')
        return paperCollectionlist

    def getPublicationList(self):
        """ fetches all publications from paper
        :return list: List of publications
        """
        paperPublicationlist = Paper.objects.get_unique_values('reference.journal.fullName')
        return paperPublicationlist

    def getAuthorList(self):
        """ fetches all authors from paper
        :return list authorslist: List of all authors
        """
        authorslist = Paper.objects.get_unique_names('reference.authors')
        return authorslist

    def getAllPapers(self):
        """ fetches all papers
        :return list allPapers: List of all papers
        """
        allPapers = [paper.to_json() for paper in Paper.objects()]
        return allPapers

    def getAllFilteredSearchObjects(self, searchWord=None, paperTitle=None, doi=None, tags=None, collectionList=[], authorsList=[],
                                    publicationList=[]):
        """ Fetches all filtered papers based on word / title / doi / tags / collections / authors / publications
        :param string searchWord: word to fiter papers
        :param string paperTitle: title of paper
        :param string doi: DOI of paper
        :param string tags: tag of paper
        :param list collectionsList: list of collections
        :param list authorsList: list of authors
        :param list publicationList: list of publications
        :return object allFilteredSearchObjects : Object of Paper with filtered search paper
        """
        allFilteredSearchObjects = []
        if searchWord:
            regSearch = '.*' + searchWord + '.*'
            searchRegWord = re.compile(regSearch, re.IGNORECASE)
            filteredPaper = Paper.objects.filter(
                Q(reference__title=searchRegWord) | Q(reference__publishedAbstract=searchRegWord) |
                Q(tags__in=[searchRegWord]) | Q(collections__in=[searchRegWord]) | Q(reference__authors__firstName__in=[searchRegWord]) |
                Q(reference__authors__lastName__in=[searchRegWord]))
            allFilteredSearchObjects = self.__filtersearchedPaper(filteredPaper)
        else:
            searchquery = Q()
            if paperTitle and paperTitle.strip():
                regSearch = '.*' + paperTitle + '.*'
                searchRegWord = re.compile(regSearch, re.IGNORECASE)
                searchTitleQuery = Q(reference__title=searchRegWord)
                searchquery = searchquery & searchTitleQuery
            if doi and doi.strip():
                regSearch = '.*' + doi + '.*'
                searchRegWord = re.compile(regSearch, re.IGNORECASE)
                searchdoiquery = Q(reference__DOI=searchRegWord)
                searchquery = searchquery & searchdoiquery
            if tags and len(tags)>0:
                newtagList = []
                for item in tags:
                    regSearch = '.*' + item + '.*'
                    searchRegWord = re.compile(regSearch, re.IGNORECASE)
                    newtagList.append(searchRegWord)
                searchtagquery = Q(tags__in=newtagList)
                searchquery = searchquery & searchtagquery
            if collectionList and len(collectionList) > 0:
                newcollectionList = []
                for item in collectionList:
                    regSearch = '.*' + item + '.*'
                    searchRegWord = re.compile(regSearch, re.IGNORECASE)
                    newcollectionList.append(searchRegWord)
                searchcollectionquery = Q(collections__in=newcollectionList)
                searchquery = searchquery & searchcollectionquery
            if authorsList and len(authorsList) > 0:
                namelist = [name.split(" ") for name in authorsList]
                newnamelist = []
                for sublist in namelist:
                    for item in sublist:
                        regSearch = '.*' + item + '.*'
                        searchRegWord = re.compile(regSearch, re.IGNORECASE)
                        newnamelist.append(searchRegWord)
                searchlastauthorquery = Q(reference__authors__lastName__in=newnamelist)
                searchfirstauthorquery = Q(reference__authors__firstName__in=newnamelist)
                searchquery = searchquery & (searchlastauthorquery | searchfirstauthorquery)
            if publicationList and len(publicationList) > 0:
                newpubList = []
                for item in publicationList:
                    regSearch = '.*' + item + '.*'
                    searchRegWord = re.compile(regSearch, re.IGNORECASE)
                    newpubList.append(searchRegWord)
                searchpubquery = Q(reference__journal__fullName__in=newpubList)
                searchquery = searchquery & searchpubquery
            if searchquery:
                filteredPaper = Paper.objects.filter(searchquery)
                allFilteredSearchObjects = self.__filtersearchedPaper(filteredPaper)
            else:
                allFilteredSearchObjects = self.__filtersearchedPaper(Paper.objects())
        return allFilteredSearchObjects

    def getAllSearchObjects(self):
        """ Produces all search objects
        :return: list: all Search objects
        """
        allSearchobjects = self.__filtersearchedPaper(Paper.objects())
        return allSearchobjects

    def insertIntoPapers(self,paperdata):
        """ Inserts into collection"""
        listoftitles = [paper.reference.title for paper in Paper.objects()]
        if paperdata['reference']['title'] in listoftitles:
            return None
        paper = Paper(**paperdata)
        paper.save()
        return str(paper.id)

    def insertDOI(self,id,doi):
        """ Inserts into collection"""
        paper = Paper.objects(id=id).update(info__doi=doi)
        return paper


    def __filtersearchedPaper(self, filteredPaper):
        """ Produces search results after filter
        :return: list filteredSearchobjects: filtered search objects
        """
        filteredSearchobjects = []
        for paper in filteredPaper:
            search = Search()
            search.id = str(paper.id)
            search.title = paper.reference.title
            search.tags = paper.tags
            search.collections = paper.collections
            search.authors = [authors.firstName + " " + authors.lastName for authors in paper.reference.authors]
            search.authors = ", ".join(search.authors)
            search.publication = paper.reference.journal.fullName + " " + paper.reference.volume + ", " + paper.reference.page
            search.abstract = paper.reference.publishedAbstract
            search.doi = paper.reference.DOI
            search.serverPath = paper.info.serverPath
            search.folderAbsolutePath = paper.info.folderAbsolutePath
            search.fileServerPath = paper.info.fileServerPath
            search.downloadPath = paper.info.downloadPath
            search.notebookPath = paper.info.notebookPath
            search.notebookFile = paper.info.notebookFile
            search.year = int(paper.reference.year)
            filteredSearchobjects.append(search.__dict__)
        return filteredSearchobjects

    def getPaperDetails(self, paperid):
        """ Produces details of paper based on paper clicked
        :param string paperid: Id of paper
        :return object paperDetails: Object with details of paper
        """
        paperDetailsObject = Paper.objects.filter(id=str(paperid))
        paperDetails = PaperDetails()
        paper = paperDetailsObject[0]
        paperDetails.id = str(paper.id)
        paperDetails.title = paper.reference.title
        paperDetails.tags = paper.tags
        paperDetails.collections = paper.collections
        paperDetails.authors = [authors.firstName + " " + authors.lastName for authors in paper.reference.authors]
        paperDetails.authors = ", ".join(paperDetails.authors)
        paperDetails.publication = paper.reference.journal.fullName + " " + paper.reference.volume + ", " + paper.reference.page
        paperDetails.abstract = paper.reference.publishedAbstract
        paperDetails.doi = paper.reference.DOI
        paperDetails.serverPath = paper.info.serverPath
        paperDetails.folderAbsolutePath = paper.info.folderAbsolutePath
        paperDetails.fileServerPath = paper.info.fileServerPath
        paperDetails.downloadPath = paper.info.downloadPath
        paperDetails.notebookPath = paper.info.notebookPath
        paperDetails.notebookFile = paper.info.notebookFile
        paperDetails.year = int(paper.reference.year)
        paperDetails.charts = paper.charts
        paperDetails.datasets = paper.datasets
        paperDetails.scripts = paper.scripts
        paperDetails.tools = paper.tools
        paperDetails.workflows = paper.workflow
        paperDetails.heads = paper.heads
        paperDetails.cite = paper.info.doi
        paperDetails.timeStamp = paper.info.timeStamp
        return paperDetails.__dict__

    def getWorkflowDetails(self, paperid):
        """ Build workflow details based on paper
        :param string paperid: Id of paper to construct workflow
        :return object workflowinfo: Object of workflow with info details
        """
        try:
            paperDetailsObject = Paper.objects.filter(id=str(paperid))
            paper = paperDetailsObject[0]
            self.workflowinfo.paperTitle = paper.reference.title
            self.workflowinfo.edges = paper.workflow.edges
            for node in paper.workflow.nodes:
                self.__insertWorkflowNodeDetails(node, paper)
            self.workflowinfo.workflowType = "paper: " + paper.reference.title
            return self.workflowinfo.__dict__
        except Exception as e:
            print(e)


    def getWorkflowForChartDetails(self, paperid, chartid):
        """ Build workflow details based on paper
        :param string paperid: Id of paper to construct workflow
        :return object workflow : Object of workflow with chart details
        """
        paperDetailsObject = Paper.objects.filter(id=str(paperid))
        paper = paperDetailsObject[0]
        self.workflowinfo.paperTitle = paper.reference.title
        self.__insertWorkflowNodeDetails(chartid, paper)
        self.__addEdgeToWorkflowForChart(chartid, paper)
        return self.workflowinfo.__dict__

    def __addEdgeToWorkflowForChart(self, chartid, paper):
        """ Adds nodes to build workflow for chart
        """
        for edge in paper.workflow.edges:
            if chartid in edge[1]:
                self.workflowinfo.edges.append(edge)
                self.__addNodeToWorkflowForChart(paper, edge)
            else:
                self.hasvisited.append(edge[1])
                if self.__hasPath(edge[1], chartid, paper.workflow):
                    self.workflowinfo.edges.append(edge)
                    self.__addNodeToWorkflowForChart(paper, edge)
                self.hasvisited.clear()

    def __addNodeToWorkflowForChart(self, paper, edge):
        """ Adds other node details for the chart
        :param string paper: Object of paper
        :param list edge: list of edges
        """
        if edge[0] not in self.workflowinfo.nodes:
            self.__insertWorkflowNodeDetails(edge[0], paper)
        elif edge[1] not in self.workflowinfo.nodes:
            self.__insertWorkflowNodeDetails(edge[1], paper)

    def __hasPath(self, destination, chartid, workflow):
        """ Checks if path is found """
        for edge in workflow.edges:
            if destination in edge[0]:
                if edge[1] not in self.hasvisited:
                    self.hasvisited.append(edge[1])
                    if chartid in edge[1] or self.__hasPath(edge[1], chartid, workflow):
                        return True
        return False

    def __insertWorkflowNodeDetails(self, node, paper):
        """ Inserts with workflow node details """
        try:
            if "h" in node:
                for head in paper.heads:
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
                for tool in paper.tools:
                    if node in str(tool.id):
                        workflownodeinfo = WorkflowNodeInfo()
                        workflownodeinfo.toolTip = self.__getTooltipForTools(tool)
                        details = []
                        details.append("Tool " + node)
                        toollinks = self.__getLinks(tool.URLs)
                        tooldetails = self.__getTooltipForTools(tool)
                        toolfiles = self.__getFiles(tool.files, paper.info.fileServerPath)
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
                for dataset in paper.datasets:
                    if node in str(dataset.id):
                        workflownodeinfo = WorkflowNodeInfo()
                        workflownodeinfo.toolTip = self.__getTooltipForNode(dataset, node)
                        details = []
                        extradatasetfields = ""
                        details.append("Dataset " + node)
                        datasetlinks = self.__getLinks(dataset.URLs)
                        datasetdetails = self.__getTooltipForNode(dataset, node)
                        datasetfiles = self.__getFiles(dataset.files, paper.info.fileServerPath)
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
                for script in paper.scripts:
                    if node in str(script.id):
                        workflownodeinfo = WorkflowNodeInfo()
                        workflownodeinfo.toolTip = self.__getTooltipForNode(script, node)
                        details = []
                        extrascriptfields = ""
                        details.append("Script " + node)
                        scriptlinks = self.__getLinks(script.URLs)
                        scriptdetails = self.__getTooltipForNode(script, node)
                        scriptfiles = self.__getFiles(script.files, paper.info.fileServerPath)
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
                for chart in paper.charts:
                    if node in str(chart.id):
                        workflownodeinfo = WorkflowNodeInfo()
                        workflownodeinfo.toolTip = self.__getTooltipForNode(chart, node, paper.info.fileServerPath)
                        details = []
                        extrachartfields = ""
                        details.append("Chart " + node)
                        chartlinks = self.__getLinks(chart.properties, "charts")
                        chartdetails = self.__getTooltipForNode(chart, node, paper.info.fileServerPath)
                        chartfiles = self.__getFiles(chart.files, paper.info.fileServerPath)
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
                        self.workflowinfo.workflowType = chart.number + " of " + paper.reference.title
        except Exception as e:
            print(e)

    def __getLinks(self, urls, properties=None):
        """ Adds links to workflow """
        links = ""
        if len(urls) > 0:
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
        """Adds filelinks to workflow """
        filelinks = ""
        if len(files) > 0:
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
        """ Adds tool tip to tools """
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
        """ Adds tooltip for node """
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
        """ Adds extra fields to node """
        extraFieldValues = ""
        for hashkey, value in node.extraFields.items():
            if hashkey:
                for extrafieldkey, extrafieldval in hashkey.items():
                    extraFieldValues = extraFieldValues + "<p><b>" + extrafieldkey + ": </b><br>" + ", " + extrafieldval + "</p>"
        return extraFieldValues

