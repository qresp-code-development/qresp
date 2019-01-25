# run.py
from flask_cors import CORS

from project import connexionapp
app = connexionapp.app
CORS(app)

#app.run()
if __name__ == "__main__":
    connexionapp.run(host='0.0.0.0',port=80,debug=True)

