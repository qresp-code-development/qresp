from decouple import config
import os

from flask import Flask
from flask_session import Session
from flask_wtf import CSRFProtect
from flask_sitemap import Sitemap
import connexion

HYBRID3_URL = config('HYBRID3_URL', default='')
HOST_URL = config('HOST_URL', default='')

GOOGLE_CLIENT_ID = config('GOOGLE_CLIENT_ID',
                          default=os.environ.get("GOOGLE_CLIENT_ID"))
GOOGLE_CLIENT_SECRET = config('GOOGLE_CLIENT_SECRET',
                              default=os.environ.get("GOOGLE_CLIENT_SECRET"))
REDIRECT_URI = config('REDIRECT_URI', default=os.environ.get("REDIRECT_URI"))
MAIL_ADDR = os.environ.get("MAIL_ADDR")
MAIL_PWD = os.environ.get("MAIL_PWD")

AUTH_URI = 'https://accounts.google.com/o/oauth2/auth'
TOKEN_URI = 'https://accounts.google.com/o/oauth2/token'
USER_INFO = 'https://www.googleapis.com/userinfo/v2/me'

MONGODB_HOST = config('MONGODB_HOST', default=os.environ.get("MONGODB_HOST"))
MONGODB_PORT = config('MONGODB_PORT', default=os.environ.get("MONGODB_PORT"))
MONGODB_USERNAME = config('MONGODB_USERNAME',
                          default=os.environ.get("MONGODB_USERNAME"))
MONGODB_PASSWORD = config('MONGODB_PASSWORD',
                          default=os.environ.get("MONGODB_PASSWORD"))
MONGODB_DB = config('MONGODB_DB', default=os.environ.get("MONGODB_DB"))

# Create the application instance
connexionapp = connexion.App(__name__, specification_dir='./')

# Read the swagger.yml file to configure the endpoints
connexionapp.add_api('swagger.yml')
app = connexionapp.app
app.secret_key = '\\\xfcS\x1e\x8f\xfb]6\x1e.\xa8\xb3\xe1x\xc8\x8e\xc1\xeb5^x\x81\xcc\xd5'

csrf = CSRFProtect(app)
SESSION_TYPE = 'filesystem'
app.config.from_object(__name__)
app.config['passkey'] = config('KEY', default=os.environ.get("KEY"))

app.config['GOOGLE_CLIENT_ID'] = GOOGLE_CLIENT_ID
app.config['GOOGLE_CLIENT_SECRET'] = GOOGLE_CLIENT_SECRET
app.config['REDIRECT_URI'] = REDIRECT_URI
app.config['AUTH_URI'] = AUTH_URI
app.config['TOKEN_URI'] = TOKEN_URI
app.config['USER_INFO'] = USER_INFO
app.config['SCOPE'] = ['https://www.googleapis.com/auth/userinfo.profile','https://www.googleapis.com/auth/userinfo.email']
os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'
app.config['MAIL_ADDR'] = MAIL_ADDR
app.config['MAIL_PWD'] = MAIL_PWD
app.config['MONGODB_HOST'] = MONGODB_HOST
app.config['MONGODB_PORT'] = MONGODB_PORT
app.config['MONGODB_USERNAME'] = MONGODB_USERNAME
app.config['MONGODB_PASSWORD'] = MONGODB_PASSWORD
app.config['MONGODB_DB'] = MONGODB_DB

Session(app)
ext = Sitemap(app)


from project import routes
