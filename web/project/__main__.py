# # -*- coding: utf-8 -*-
# from flask_wtf import CSRFProtect
# from flask_session import Session
# import threading, webbrowser
# from flask_cors import CORS
# from flask import Flask
# import os
#
# """qresp_curation_flask_api.__main__: executed when qresp_curation_flask_api directory is called as script."""
# def main():
#     app = Flask(__name__)
#     app.secret_key = '\\\xfcS\x1e\x8f\xfb]6\x1e.\xa8\xb3\xe1x\xc8\x8e\xc1\xeb5^x\x81\xcc\xd5'
#     csrf = CSRFProtect(app)
#     app.config.from_object(__name__)
#     app.config['passkey'] = os.environ.get("KEY")
#     Session(app)
#     app.secret_key = '\xfd{H\xe5<\x95\xf9\xe3\x96.5\xd1\x01O<!\xd5\xa2\xa0\x9fR"\xa1\xa8'
#     CORS(app)
#     url = "http://127.0.0.1:8080"
#     threading.Timer(1.25, lambda: webbrowser.open(url)).start()
#     app.run(port=8080, debug=True)
#
# if __name__ == '__main__':
#     main()
#     from project import routes
from flask import Flask
from flask_wtf import CSRFProtect
from flask_session import Session
import sys
import os
from flask_cors import CORS

# app = connexion.App(__name__, specification_dir='./')
# app.add_api('swagger.yml')
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
from .routes import main
main()

