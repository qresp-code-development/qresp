import json

import requests

"""

"""


class Servers():
    def __init__(self):
        self.__headers = {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/54.0.2840.90 Safari/537.36'}
        self.__urlString = "http://paperstack.uchicago.edu/qresp_servers.json"

    def getServersList(self):
        url = requests.get(self.__urlString, headers=self.__headers)
        data = json.loads(url.text)
        return data
