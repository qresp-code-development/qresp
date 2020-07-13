import re
from project.db import *
from project.models import *
from project.util import WorkflowInfo, WorkflowNodeInfo, Search, PaperDetails, dotdict, WorkflowObject


class PaperDAO(MongoDBConnection,WorkflowObject):
    """
    Class providing data access objects
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
            if not searchquery.empty:
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
        paperDetailsObject = Paper.objects.get(id=str(paperid))
        paperDetails = PaperDetails()
        paper = paperDetailsObject
        paperDetails.id = str(paper.id)
        paperDetails.title = paper.reference.title
        paperDetails.tags = paper.tags
        paperDetails.collections = paper.collections
        if paper.reference.authors and paper.reference.authors[0].firstName:
            paperDetails.authors = [authors.firstName + " " + authors.lastName for authors in paper.reference.authors]
            paperDetails.authors = ", ".join(paperDetails.authors)
        if paper.PIs and paper.PIs[0].firstName:
            paperDetails.PIs = [pi.firstName + " " + pi.lastName for pi in paper.PIs]
            paperDetails.PIs = ", ".join(paperDetails.PIs)
        paperDetails.publication = paper.reference.journal.fullName + " " + paper.reference.volume + ", " + paper.reference.page
        paperDetails.abstract = paper.reference.publishedAbstract
        paperDetails.doi = paper.reference.DOI
        paperDetails.serverPath = getattr(paper.info,'serverPath','')
        paperDetails.folderAbsolutePath = getattr(paper.info,'folderAbsolutePath','')
        paperDetails.fileServerPath = getattr(paper.info,'fileServerPath','')
        paperDetails.downloadPath = getattr(paper.info,'downloadPath','')
        paperDetails.notebookPath = getattr(paper.info,'notebookPath','')
        paperDetails.notebookFile = getattr(paper.info,'notebookFile','')
        paperDetails.ProjectName = getattr(paper.info,'ProjectName','')
        paperDetails.year = int(paper.reference.year)
        paperDetails.charts = paper.charts
        paperDetails.datasets = paper.datasets
        paperDetails.scripts = paper.scripts
        paperDetails.tools = paper.tools
        paperDetails.workflows = paper.workflow
        paperDetails.heads = paper.heads
        paperDetails.cite = getattr(paper.info,'doi','')
        paperDetails.timeStamp = paper.info.timeStamp
        paperDetails.firstName = paper.info.insertedBy.firstName
        paperDetails.middleName = getattr(paper.info.insertedBy,'middleName','')
        paperDetails.lastName = paper.info.insertedBy.lastName
        paperDetails.emailId = getattr(paper.info.insertedBy,'emailId','')
        paperDetails.affiliation = getattr(paper.info.insertedBy,'affiliation','')
        paperDetails.documentation = getattr(paper.documentation,'readme','')
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
                        details.append("<p><i>" + head.readme + "</i></p>" + self._getLinks(head.URLs))
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
                        workflownodeinfo.toolTip = self._getTooltipForTools(tool)
                        details = []
                        details.append("Tool " + node)
                        toollinks = self._getLinks(tool.URLs)
                        tooldetails = self._getTooltipForTools(tool)
                        toolfiles = self._getFiles(tool.files, paper.info.fileServerPath)
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
                        workflownodeinfo.toolTip = self._getTooltipForNode(dataset, node)
                        details = []
                        extradatasetfields = ""
                        details.append("Dataset " + node)
                        datasetlinks = self._getLinks(dataset.URLs)
                        datasetdetails = self._getTooltipForNode(dataset, node)
                        datasetfiles = self._getFiles(dataset.files, paper.info.fileServerPath)
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
                        workflownodeinfo.toolTip = self._getTooltipForNode(script, node)
                        details = []
                        extrascriptfields = ""
                        details.append("Script " + node)
                        scriptlinks = self._getLinks(script.URLs)
                        scriptdetails = self._getTooltipForNode(script, node)
                        scriptfiles = self._getFiles(script.files, paper.info.fileServerPath)
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
                        workflownodeinfo.toolTip = self._getTooltipForNode(chart, node, paper.info.fileServerPath)
                        details = []
                        extrachartfields = ""
                        details.append("Chart " + node)
                        chartlinks = self._getLinks(chart.properties, "charts")
                        chartdetails = self._getTooltipForNode(chart, node, paper.info.fileServerPath)
                        chartfiles = self._getFiles(chart.files, paper.info.fileServerPath)
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


class ObjectsForPreview(WorkflowObject):
    """
    Generates Paper details and Workflow details objects
    """
    def __init__(self,form=None):
        self.data = form
        self.workflowinfo = WorkflowInfo()
        self.workflowinfo.nodes = {}
        self.workflowinfo.edges = []
        self.hasvisited = []

    def getPaperDetails(self):
        paperDetails = PaperDetails()
        paper = self.data
        serverpathList = paper.info.fileServerPath.data.rsplit("/", 2)
        paperDetails.id = serverpathList[len(serverpathList)-2] + "_" + serverpathList[len(serverpathList)-1]
        paperDetails.title = paper.reference.title.data
        paperDetails.tags = [form.data for form in paper.tags.entries]
        paperDetails.collections = [form.data for form in paper.collections.entries]
        if paper.reference.authors.data and paper.reference.authors.entries[0].data.get("firstName"):
            paperDetails.authors = [authors.data.get("firstName","") + " " + authors.data.get("lastName","") for authors in paper.reference.authors.entries]
            paperDetails.authors = ", ".join(paperDetails.authors)
        if paper.PIs.data:
            paperDetails.PIs = [pi.data.get("firstName","") + " " + pi.data.get("lastName","") for pi in paper.PIs.entries]
            paperDetails.PIs = ", ".join(paperDetails.PIs)
        if paper.reference.journal.fullName.data:
            paperDetails.publication = paper.reference.journal.fullName.data + " " + paper.reference.volume.data + ", " + paper.reference.page.data
        paperDetails.abstract = paper.reference.publishedAbstract.data
        paperDetails.doi = paper.reference.DOI.data
        paperDetails.fileServerPath = paper.info.fileServerPath.data
        if paper.info.ProjectName.data not in paper.info.downloadPath.data:
            paperDetails.downloadPath = paper.info.downloadPath.data + paper.info.ProjectName.data
        else:
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
        paperDetails.ProjectName = paper.info.ProjectName.data
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

    def getWorkflowForChartDetails(self, chartid):
        """ Build workflow details based on paper
        :param string paperid: Id of paper to construct workflow
        :return object workflow : Object of workflow with chart details
        """
        paper = self.data
        self.workflowinfo.paperTitle = paper.reference.title.data
        self.__insertWorkflowNodeDetails(chartid, paper)
        self.__addEdgeToWorkflowForChart(chartid, paper)
        return self.workflowinfo.__dict__

    def __addEdgeToWorkflowForChart(self, chartid, paper):
        """
        Adds edges to workflow for chart
        :param chartid: id of chart
        :param paper: object of type Paper
        """
        for edge in paper.workflow.edges.entries:
            edge = edge.data
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
        """
        Adds other node details for the chart
        :param paper: Object of paper
        :param edge: list of edges
        """
        if edge[0] not in self.workflowinfo.nodes:
            self.__insertWorkflowNodeDetails(edge[0], paper)
        elif edge[1] not in self.workflowinfo.nodes:
            self.__insertWorkflowNodeDetails(edge[1], paper)

    def __hasPath(self, destination, chartid, workflow):
        """
        Checks if path is found for a given chart
        :param destination: target node
        :param chartid: id of chart
        :param workflow: Workflow object
        :return boolean: (T/F) given chart has a target
        """
        for edge in workflow.edges.entries:
            edge = edge.data
            if destination in edge[0]:
                if edge[1] not in self.hasvisited:
                    self.hasvisited.append(edge[1])
                    if chartid in edge[1] or self.__hasPath(edge[1], chartid, workflow):
                        return True
        return False

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
                        details.append("<p><i>" + head.readme + "</i></p>" + self._getLinks(head.URLs))
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
                        workflownodeinfo.toolTip = self._getTooltipForTools(tool)
                        details = []
                        details.append("Tool " + node)
                        toollinks = self._getLinks(tool.URLs)
                        tooldetails = self._getTooltipForTools(tool)
                        toolfiles = self._getFiles(tool.files, paper.info.fileServerPath.data)
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
                        workflownodeinfo.toolTip = self._getTooltipForNode(dataset, node)
                        details = []
                        extradatasetfields = ""
                        details.append("Dataset " + node)
                        datasetlinks = self._getLinks(dataset.URLs)
                        datasetdetails = self._getTooltipForNode(dataset, node)
                        datasetfiles = self._getFiles(dataset.files, paper.info.fileServerPath.data)
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
                        workflownodeinfo.toolTip = self._getTooltipForNode(script, node)
                        details = []
                        extrascriptfields = ""
                        details.append("Script " + node)
                        scriptlinks = self._getLinks(script.URLs)
                        scriptdetails = self._getTooltipForNode(script, node)
                        scriptfiles = self._getFiles(script.files, paper.info.fileServerPath.data)
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
                    if node in str(chart.id):
                        workflownodeinfo = WorkflowNodeInfo()
                        workflownodeinfo.toolTip = self._getTooltipForNode(chart, node, paper.info.fileServerPath.data)
                        details = []
                        extrachartfields = ""
                        details.append("Chart " + node)
                        chartlinks = self._getLinks(chart.properties, "charts")
                        chartdetails = self._getTooltipForNode(chart, node, paper.info.fileServerPath.data)
                        chartfiles = self._getFiles(chart.files, paper.info.fileServerPath.data)
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

