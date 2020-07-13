# # -*- coding: utf-8 -*-
# For desktop version running from command line
import sys
from project import app

# Initialize variables
port = 80

# Read the swagger.yml file to configure the endpoints
if len(sys.argv)>1:
    port = sys.argv[1]

app.run(port=port, debug=False)