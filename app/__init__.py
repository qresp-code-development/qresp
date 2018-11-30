from flask import Flask
from flask_wtf import CSRFProtect
from flask_session import Session
import sys

# app = connexion.App(__name__, specification_dir='./')
# app.add_api('swagger.yml')

app = Flask(__name__)
app.secret_key = '\\\xfcS\x1e\x8f\xfb]6\x1e.\xa8\xb3\xe1x\xc8\x8e\xc1\xeb5^x\x81\xcc\xd5'
csrf = CSRFProtect(app)
SESSION_TYPE = 'filesystem'
app.config.from_object(__name__)
app.config['passkey'] = sys.argv[1]
app.config['qresp_config'] = {}
Session(app)

from app import routes
