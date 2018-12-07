# run.py
from flask_cors import CORS

from project import app

CORS(app)

#app.run()
if __name__ == "__main__":
    app.run(port=80,debug=True)

