from .paperdao import *
def search(searchWord=None,paperTitle=None,doi=None,tags=None,collectionList=[],authorsList=[],publicationList=[]):
    """
    This function responds to a request for /api/search
    with the complete lists of papers

    :return:        list of papers
    """
    allpaperslist = []
    try:
        dao = PaperDAO()
        allpaperslist = dao.getAllFilteredSearchObjects(searchWord=searchWord,paperTitle=paperTitle,doi=doi,
                                                        tags=tags,collectionList=collectionList,
                                                        authorsList=authorsList,publicationList=publicationList)
    except Exception as e:
        print("Exception in ", e)
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