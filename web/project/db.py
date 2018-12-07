from flask_mongoengine import MongoEngine
from pymongo import errors

from project import app


class Singleton:
    _shared_state = {}

    def __init__(self):
        self.__dict__ = self._shared_state


class MongoDBConnection(Singleton):
    """Class representing connection to Mongo database

        :param : keywords arguments

    """

    def __init__(self, **kwargs):
        Singleton.__init__(self)
        self.__db = MongoEngine()
        if kwargs.get("hostname") is not None:
            app.config['MONGODB_HOST'] = kwargs.get("hostname")
            app.config['MONGODB_PORT'] = int(kwargs.get("port"))
            app.config['MONGODB_USERNAME'] = kwargs.get("username")
            app.config['MONGODB_PASSWORD'] = kwargs.get("password")
            app.config['MONGODB_DB'] = kwargs.get("dbname")
            try:
                self.__db.init_app(app)
            except errors.ConnectionFailure as e:
                raise ConnectionError("Could not connect to server: %s" % e)

    def getDB(self):
        return self.__db
