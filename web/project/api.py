from project.paperdao import *

#edit swagger.yml file for method changes

def search(searchWord=None,paperTitle=None,doi=None,tags=None,collectionList=None,authorsList=None,publicationList=None):
    """
    This function responds to a request for /api/search
    with the complete lists of papers

    :return list allpaperslist: A list of all papers
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
        msg = "Exception in search api " + str(e)
        print(msg)
        return msg, 400
    return allpaperslist, 200

def collections():
    """
    This function responds to a request for /api/collections
    with the complete lists of c

    :return list allcollectionlist: A list of all collections
    """
    allcollectionlist = []
    try:
        dao = PaperDAO()
        allcollectionlist = dao.getCollectionList()
    except Exception as e:
        msg = "Exception in collections api " + str(e)
        print(msg)
        return msg, 400
    return list(allcollectionlist), 200

def authors():
    """
    This function responds to a request for /api/authors
    with the complete lists of authors

    :return list allauthorlist: A list of all authors
    """
    allauthorlist = []
    try:
        dao = PaperDAO()
        allauthorlist = dao.getAuthorList()
    except Exception as e:
        msg = "Exception in authors api " + str(e)
        print(msg)
        return msg, 400
    return list(allauthorlist), 200

def publications():
    """
    This function responds to a request for /api/publications
    with the complete lists of publications

    :return list allpublist: A list of all publications
    """
    allpublist = []
    try:
        dao = PaperDAO()
        allpublist = dao.getPublicationList()
    except Exception as e:
        msg = "Exception in publications api " + str(e)
        print(msg)
        return msg, 400
    return list(allpublist), 200

def paper(id):
    """
    This function responds to a request for /api/paper/{id}
    with the details of paper given id

    :return object paperdetail: An object of paper with paper contents
    """
    paperdetail = None
    try:
        dao = PaperDAO()
        paperdetail = dao.getPaperDetails(id)
    except Exception as e:
        msg = "Exception in paper api " + str(e)
        print(msg)
        return msg, 400
    return paperdetail, 200

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
        print(msg)
        return msg,400
    return workflowdetail, 200

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
        print(msg)
        return msg,400
    return chartworkflowdetail, 200