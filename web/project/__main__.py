# # -*- coding: utf-8 -*-
# For desktop version running from command line

import os

from flask import Flask
from flask_cors import CORS
from flask_session import Session
from flask_wtf import CSRFProtect
from flask_sitemap import Sitemap
from flask_oauth import OAuth

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET")
REDIRECT_URI = os.environ.get("REDIRECT_URI")
AUTH_URI = 'https://accounts.google.com/o/oauth2/auth'
TOKEN_URI = 'https://accounts.google.com/o/oauth2/token'
USER_INFO = 'https://www.googleapis.com/userinfo/v2/me'

app = Flask(__name__,template_folder='routes/templates')
app.secret_key = '\\\xfcS\x1e\x8f\xfb]6\x1e.\xa8\xb3\xe1x\xc8\x8e\xc1\xeb5^x\x81\xcc\xd5'
csrf = CSRFProtect(app)
SESSION_TYPE = 'filesystem'
app.config.from_object(__name__)
app.config['passkey'] = os.environ.get("KEY")
app.config['GOOGLE_CLIENT_ID'] = GOOGLE_CLIENT_ID
app.config['GOOGLE_CLIENT_SECRET'] = GOOGLE_CLIENT_SECRET
app.config['REDIRECT_URI'] = REDIRECT_URI
app.config['AUTH_URI'] = AUTH_URI
app.config['TOKEN_URI'] = TOKEN_URI
app.config['USER_INFO'] = USER_INFO
app.config['SCOPE'] = ['profile','email']
os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'
Session(app)
CORS(app)
ext = Sitemap(app)

from .routes import main
main()

