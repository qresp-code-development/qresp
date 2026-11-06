import mongoengine
from pymongo import errors
from project import connexionapp
app = connexionapp.app


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
            try:
                cls.__db = None
                # The admin page can re-point the app at a different MongoDB at
                # runtime; mongoengine refuses to reuse the default alias with
                # new settings, so drop it first (no-op when not connected).
                mongoengine.disconnect()
                cls.__db = mongoengine.connect(
                    db=kwargs.get("dbname"),
                    host=kwargs.get("hostname"),
                    port=int(kwargs.get("port")),
                    username=kwargs.get("username") or None,
                    password=kwargs.get("password") or None,
                )
            except (errors.ConnectionFailure, mongoengine.ConnectionFailure) as e:
                print(e)
                raise ConnectionError("Could not connect to server: %s" % e)
        return cls.__db
