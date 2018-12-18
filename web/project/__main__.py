# # -*- coding: utf-8 -*-
# For desktop version running from command line

from flask import Flask
app = Flask(__name__,template_folder='project/templates')
from .routes import main
main()