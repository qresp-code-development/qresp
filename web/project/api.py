from .paperdao import *

#edit swagger.yml file for method changes

def search(searchWord=None,paperTitle=None,doi=None,tags=None,collectionList=None,authorsList=None,publicationList=None):
    """
    This function responds to a request for /api/search
    with the complete lists of papers

    :return:        list of papers
    """
    allpaperslist = []
    try:
        dao = PaperDAO()
        if collectionList:
            collectionList = collectionList.split(",")
        if authorsList:
            authorsList = authorsList.split(",")
        if publicationList:
            publicationList = publicationList.split(",")
        allpaperslist = dao.getAllFilteredSearchObjects(searchWord=searchWord,paperTitle=paperTitle,doi=doi,
                                                        tags=tags,collectionList=collectionList,
                                                        authorsList=authorsList,publicationList=publicationList)
    except Exception as e:
        print("Exception in search", e)
    return allpaperslist

def collections():
    """
    This function responds to a request for /api/collections
    with the complete lists of c

    :return:        list of collections
    """
    allcollectionlist = []
    try:
        dao = PaperDAO()
        allcollectionlist = dao.getCollectionList()
    except Exception as e:
        print("Exception in ", e)
    return list(allcollectionlist)

def authors():
    """
    This function responds to a request for /api/authors
    with the complete lists of authors

    :return:        list of authors
    """
    allauthorlist = []
    try:
        dao = PaperDAO()
        allauthorlist = dao.getAuthorList()
    except Exception as e:
        print("Exception in ", e)
    return list(allauthorlist)

def publications():
    """
    This function responds to a request for /api/publications
    with the complete lists of publications

    :return:        list of publications
    """
    allpublist = []
    try:
        dao = PaperDAO()
        allpublist = dao.getPublicationList()
    except Exception as e:
        print("Exception in ", e)
    return list(allpublist)

def paper(id):
    """
    This function responds to a request for /api/paper/{id}
    with the details of paper given id

    :return:        paper details object
    """
    paperdetail = None
    try:
        dao = PaperDAO()
        paperdetail = dao.getPaperDetails(id)
    except Exception as e:
        msg = "Exception in paper api " + str(e)
        print("Exception in paper api ", e)
        return e, 500
    return paperdetail

def workflow(id):
    """
    This function responds to a request for /api/workflow/{id}
    with the workflow given id

    :return:        workflow object
    """
    workflowdetail = None
    try:
        dao = PaperDAO()
        workflowdetail = dao.getWorkflowDetails(id)
    except Exception as e:
        msg = "Exception in workflow api " + str(e)
        print("Exception in workflow api ", e)
        return msg,500
    return workflowdetail

def chart(id,cid):
    """
    This function responds to a request for /api/paper/{id}/chart/{cid}
    with the chart given id

    :return:        chart object
    """
    chartworkflowdetail = None
    try:
        dao = PaperDAO()
        chartworkflowdetail = dao.getWorkflowForChartDetails(id, cid)
    except Exception as e:
        msg = "Exception in chart api " + str(e)
        print("Exception in chart api ", e)
        return msg,500
    return chartworkflowdetail