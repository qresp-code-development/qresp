# run.py
from flask_cors import CORS

from project import connexionapp
app = connexionapp.app
CORS(app)

#app.run()
if __name__ == "__main__":
    connexionapp.run(port=80,debug=True)

