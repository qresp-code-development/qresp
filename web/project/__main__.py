# # -*- coding: utf-8 -*-
# For desktop version running from command line

import os

from flask import Flask
from flask_cors import CORS
from flask_session import Session
from flask_wtf import CSRFProtect
from flask_sitemap import Sitemap

app = Flask(__name__,template_folder='routes/templates')
app.secret_key = '\\\xfcS\x1e\x8f\xfb]6\x1e.\xa8\xb3\xe1x\xc8\x8e\xc1\xeb5^x\x81\xcc\xd5'
csrf = CSRFProtect(app)
SESSION_TYPE = 'filesystem'
app.config.from_object(__name__)
app.config['passkey'] = os.environ.get("KEY")
app.config['qresp_config'] = {}
app.config['qresp_config']['fileServerPath'] = 'https://notebook.rcc.uchicago.edu/files'
app.config['qresp_config']['downloadPath'] = 'https://www.globus.org/app/transfer?origin_id=72277ed4-1ad3-11e7-bbe1-22000b9a448b&origin_path='
Session(app)
CORS(app)
ext = Sitemap(app)
from .routes import main
main()

