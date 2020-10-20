from connexion import request, jsonifier

from project.paperdao import *
from project.util import Dtree

from project.controllers.preview import Preview
from project.controllers.publish import Publish

# edit swagger.yml file for method changes


def search(searchWord=None, paperTitle=None, doi=None, tags=None, collectionList=None, authorsList=None, publicationList=None):
    """
    This function responds to a request for /api/search
    with the complete lists of papers

    :return list allpaperslist: A list of all papers
    """
    allpaperslist = []
    try:
        dao = PaperDAO()
        if tags:
            tags = tags.split(",")
        if collectionList:
            collectionList = collectionList.split(",")
        if authorsList:
            authorsList = authorsList.split(",")
        if publicationList:
            publicationList = publicationList.split(",")
        allpaperslist = dao.getAllFilteredSearchObjects(searchWord=searchWord, paperTitle=paperTitle, doi=doi,
                                                        tags=tags, collectionList=collectionList,
                                                        authorsList=authorsList, publicationList=publicationList)
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
        return msg, 400
    return workflowdetail, 200


def chart(id, cid):
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
        return msg, 400
    return chartworkflowdetail, 200


def dircontents(req):
    """
    This function responds to the request for /api/dircont

    :return: structure object
    """
    link = req['link']
    src = req['src']
    service = req['service']
    services = {}

    try:
        structure = Dtree(link)
        if src == 'http':
            files = structure.fetchForTreeFromHttp()
            if service:
                services = structure.openFileToReadConfigFromHttp('qresp.ini')

        else:
            files = structure.fetchForTreeFromZenodo()
    except Exception as e:
        msg = "Exception in Directory Structure API "+str(e)
        print(msg)
        return msg, 500

    return {"files": files, "services": services}, 200


def generatePreview(paper):
    """
    Generate a preview of the metadata
    Handler for POST: /api/preview 

    :return : ID for the metadata to be previewed
    """
    result = Preview().generateLink(paper)
    if result == 400:
        return "Validation Error, incorrect paper supplied", 400

    if result == 500:
        return "Internal Server Error", 500

    return result, 200


def getPreview(id):
    """
    View the preview of the metadata
    Handler for GET: /api/preview/{id}

    :return: Metadata object using the id provided for the metadata
    """
    result = Preview().getMetadata(id)

    if result == 400:
        return "Preview does not exist, incorrect id", 400

    if result == 500:
        return "Internal Server Error", 500

    return result, 200


def publish(paper):
    """
    Validate the paper json and send an email to the user with the link to publish
    Handler for POST: /api/publish

    :return: Metadata object using the id provided for the metadata
    """
    result = Publish().publish(paper, request.headers.get('origin'))

    if isinstance(result, int):
        return 200
    else:
        return result['msg'], result['code']


def verify(id):
    """
    Add the paper specified by the ID provided from the wait list to the database
    Handler for GET: /api/verify

    :return: Object containing ID for the paper added in it  
     Otherwise error, 
    """
    result = Publish().verify(id)

    if isinstance(result, str):
        return {"id": result, "error": ""}, 200

    return {"id": '', "error": result['msg']}, result['code']
