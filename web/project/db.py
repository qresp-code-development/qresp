from flask_mongoengine import MongoEngine
from pymongo import errors

from project import app

class MongoDBConnection():
    """Class representing connection to Mongo database

        :param : keywords arguments

    """
    __db = None


    @classmethod
    def getDB(cls,**kwargs):
        if cls.__db is None or kwargs.get("hostname") is not None:
            cls.__db = cls.__connectToDB(**kwargs)
        return cls.__db

    @classmethod
    def __connectToDB(cls,**kwargs):
        if kwargs.get("hostname") is not None:
            print(kwargs.get("username"))
            app.config['MONGODB_HOST'] = kwargs.get("hostname")
            app.config['MONGODB_PORT'] = int(kwargs.get("port"))
            app.config['MONGODB_USERNAME'] = kwargs.get("username")
            app.config['MONGODB_PASSWORD'] = kwargs.get("password")
            app.config['MONGODB_DB'] = kwargs.get("dbname")
            app.config['MONGODB_HOST'] = "paperstack.uchicago.edu"
            app.config['MONGODB_PORT'] = 27017
            app.config['MONGODB_USERNAME'] = "qresp_user_explorer"
            app.config['MONGODB_PASSWORD'] = "qresp_pwd"
            app.config['MONGODB_DB'] = "explorer"
            try:
                cls.__db = None
                cls.__db = MongoEngine()
                cls.__db.init_app(app)
            except errors.ConnectionFailure as e:
                print(e)
                raise ConnectionError("Could not connect to server: %s" % e)
        return cls.__db