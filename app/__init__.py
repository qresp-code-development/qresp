from flask import Flask

# app = connexion.App(__name__, specification_dir='./')
# app.add_api('swagger.yml')

app = Flask(__name__)

from app import routes
