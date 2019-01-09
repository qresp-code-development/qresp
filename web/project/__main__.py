# # -*- coding: utf-8 -*-
# For desktop version running from command line

from flask import Flask
import connexion
#app = Flask(__name__)
# Create the application instance
connexionapp = connexion.App(__name__, specification_dir='./',template_folder='project/templates')

# Read the swagger.yml file to configure the endpoints
connexionapp.add_api('swagger.yml')
app = connexionapp.app
from .routes import main
import sys
port = 80
if len(sys.argv)>1:
    port = sys.argv[1]
main(port)