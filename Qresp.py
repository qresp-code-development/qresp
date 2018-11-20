from flask_cors import CORS

from app import app

app.secret_key = '\\\xfcS\x1e\x8f\xfb]6\x1e.\xa8\xb3\xe1x\xc8\x8e\xc1\xeb5^x\x81\xcc\xd5'
CORS(app)
app.run(port=5000, debug=True)
