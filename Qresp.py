from flask_cors import CORS

from app import app

CORS(app)
app.run(port=8080, debug=True)
