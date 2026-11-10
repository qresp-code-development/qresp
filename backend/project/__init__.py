import connexion
import mongoengine
import os
from connexion.jsonifier import Jsonifier
from flask_session import Session
from project.config import Config
from project.jsonutil import MongoJSONEncoder, MongoJSONProvider
from project import logredact
from flask_cors import CORS

Config.initialize()

# OAuth callbacks carry their authorization code and state in the query
# string, which access loggers write verbatim. Redact those values before
# anything is emitted -- status/method/path logging is untouched.
logredact.install()

# Create the application instance. Connexion 3: FlaskApp is an ASGI app that
# wraps Flask (routing/validation/swagger-ui run as ASGI middleware). The
# custom jsonifier restores mongoengine-document serialization, which
# flask-mongoengine used to provide (see project/jsonutil.py).
connexionapp = connexion.FlaskApp(__name__, jsonifier=Jsonifier(cls=MongoJSONEncoder))

# Read the swagger.yml file to configure the endpoints. Resolved relative to
# this file so imports work regardless of the process working directory.
swagger_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'swagger.yml')
connexionapp.add_api(swagger_file)
# The underlying Flask app provides sessions and request context for Connexion
# handlers. Production must serve `project:connexionapp` (ASGI) -- serving this
# Flask object directly would bypass Connexion's validation middleware.
app = connexionapp.app
app.json = MongoJSONProvider(app)

# Create protection and session variables
app.secret_key = Config.get_setting('SECRETS','FLASK_SECRET_KEY')
SESSION_TYPE = 'filesystem'
app.config.from_object(__name__)
app.config['env'] = 'DEV'
# oauthlib refuses OAuth over plain HTTP by default. That safety check is
# only relaxed when EXPLICITLY requested for local/dev/staging tunnels via
# QRESP_OAUTHLIB_INSECURE_TRANSPORT (env, or [AUTH] ini) -- it was previously
# hardcoded on, which silently weakened production. HTTPS deployments (the
# nginx stack, the staging tunnel) do not need it.
if (Config.get_setting('AUTH', 'OAUTHLIB_INSECURE_TRANSPORT') or '') \
        .strip().lower() in ('1', 'true', 'yes', 'on'):
    os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'
Session(app)
CORS(app)


#initialize db
if Config.get_setting(app.config['env'],'MONGODB_HOST'):
    # flask-mongoengine is unmaintained and blocks Flask>=2.3; the models are
    # plain mongoengine Documents, so connect mongoengine directly instead.
    # Username/password are only passed when configured (empty ini values must
    # not trigger authentication).
    _mongo = dict(
        db=Config.get_setting(app.config['env'],'MONGODB_DB_NAME'),
        host=Config.get_setting(app.config['env'],'MONGODB_HOST'),
        port=int(Config.get_setting(app.config['env'],'MONGODB_PORT')),
    )
    _username = Config.get_setting(app.config['env'],'MONGODB_USERNAME')
    if _username:
        _mongo.update(username=_username,
                      password=Config.get_setting(app.config['env'],'MONGODB_PASSWORD'))
    # connect=False defers background thread creation (pymongo monitor) until
    # the first actual DB operation; avoids hitting the container pids limit
    # before uvicorn has started serving.
    mongoengine.connect(**_mongo, connect=False)
