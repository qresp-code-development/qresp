import connexion
import os
from flask_session import Session
from flask_sitemap import Sitemap
from project.config import Config
from flask_mongoengine import MongoEngine
from flask_cors import CORS

Config.initialize()

# Create the application instance
connexionapp = connexion.FlaskApp(__name__)

# Read the swagger.yml file to configure the endpoints
swagger_file = (os.path.join(os.getcwd(), 'project/swagger.yml'))
connexionapp.add_api(swagger_file)
app = connexionapp.app

# Create protection and session variables
app.secret_key = Config.get_setting('SECRETS','FLASK_SECRET_KEY')
SESSION_TYPE = 'filesystem'
app.config.from_object(__name__)
os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'
Session(app)
ext = Sitemap(app)
CORS(app)

#initialize db
if Config.get_setting('PROD','MONGODB_HOST'):
    db = MongoEngine()
    app.config['MONGODB_HOST'] = Config.get_setting('PROD','MONGODB_HOST')
    app.config['MONGODB_PORT'] = int(Config.get_setting('PROD','MONGODB_PORT'))
    app.config['MONGODB_USERNAME'] = Config.get_setting('PROD','MONGODB_USERNAME')
    app.config['MONGODB_PASSWORD'] = Config.get_setting('PROD','MONGODB_PASSWORD')
    app.config['MONGODB_DB'] = Config.get_setting('PROD','MONGODB_DB_NAME')
    db.init_app(app)

from project import routes
