"""JSON serialization helpers for mongoengine objects.

flask-mongoengine 1.0 (removed 2026-07-02: unmaintained, blocked Flask>=2.3)
used to patch a MongoEngineJSONEncoder into Flask's json machinery, which is
what made API payloads containing mongoengine documents serializable (e.g.
/api/paper/{id} returns raw EmbeddedDocuments in `charts`/`datasets`/...).

The same conversion, in the same bson json_util representation (so payload
shapes do not change for existing clients), is provided here for BOTH of the
serialization layers that exist after the Connexion 3 migration:
- Connexion's jsonifier, which serializes /api/* responses, and
- Flask's JSON provider, which serializes jsonify() responses in
  the retired server-rendered Flask routes.
"""
from bson import json_util
from connexion.jsonifier import JSONEncoder as ConnexionJSONEncoder
from flask.json.provider import DefaultJSONProvider
from mongoengine.base import BaseDocument
from mongoengine.queryset import QuerySet


def convert_mongoengine(obj):
    """Convert mongoengine objects exactly the way flask-mongoengine 1.0 did."""
    if isinstance(obj, BaseDocument):
        return json_util._json_convert(obj.to_mongo())
    if isinstance(obj, QuerySet):
        return json_util._json_convert(obj.as_pymongo())
    raise TypeError(
        f"Object of type {type(obj).__name__} is not JSON serializable")


class MongoJSONEncoder(ConnexionJSONEncoder):
    """Connexion 3 response encoder with mongoengine support."""

    def default(self, o):
        try:
            return convert_mongoengine(o)
        except TypeError:
            return super().default(o)


class MongoJSONProvider(DefaultJSONProvider):
    """Flask-side equivalent, for jsonify() in the server-rendered routes."""

    @staticmethod
    def default(o):
        try:
            return convert_mongoengine(o)
        except TypeError:
            return DefaultJSONProvider.default(o)
