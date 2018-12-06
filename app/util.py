import paramiko     #Provides SSH functionality
import getpass      #Allows for secure prompting and collection of the user password
import os           #Used to setup the Paramiko log file
import logging      #Used to setup the Paramiko log file
import socket       #This method requires that we create our own socket
import re
import requests
import json
from .views import ReferenceForm

class DirectoryTree:
    """Class Providing Constants for Directory Tree.
    """
    title = ""
    parent = ""
    key = ""
    id = ""
    lazy = ""
    folder = ""
    source = ""


class ConnectToServer():
    def __init__(self,servername,username,password,isDUO,choice):
        # Global variables are used to store these data because they're sent to the server by a callback
        self.__user = username
        self.__pw = password
        self.__mfa = choice
        self.__serverName = servername
        self.__isDUO = isDUO
        self.__ftp = None
        self.connectToServer()

    def inter_handler(self,title, instructions, prompt_list):


        resp = []  #Initialize the response container

        #Walk the list of prompts that the server sent that we need to answer
        for pr in prompt_list:
            #str() used to to make sure that we're dealing with a string rather than a unicode string
            #strip() used to get rid of any padding spaces sent by the server
            if str(pr[0]).strip() == "Username:":
                resp.append(self.__user)
            elif str(pr[0]).strip() == "Password:":
                resp.append(self.__pw)
            else:
                resp.append(self.__mfa)

        return tuple(resp)  #Convert the response list to a tuple and return it


    #Setup Paramiko logging; this is useful for troubleshooting

    #Get the username, password, and MFA token code from the user

    def call2FAsftpclient(self):

        #Create a socket and connect it to port 22 on the host
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.connect((self.__serverName, 22))

        #Make a Paramiko Transport object using the socket
        ts = paramiko.Transport(sock)

        #Tell Paramiko that the Transport is going to be used as a client
        ts.start_client(timeout=10)

        #Begin authentication; note that the username and callback are passed
        ts.auth_interactive(self.__user, self.inter_handler)

        #Opening a session creates a channel along the socket to the server
        chan = ts.open_session(timeout=100)

        sftp = paramiko.SFTPClient.from_transport(ts)

        return sftp

    def connectToServer(self):
        if "No" in self.__isDUO:
            ssh = paramiko.SSHClient()
            ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            ssh.connect(self.__serverName, username=self.__user, password=self.__pw)
            self.__ftp = ssh.open_sftp()
        else:
            self.__ftp = self.call2FAsftpclient()

    def getSftp(self):
        return self.__ftp

class Dtree():
    def __init__(self,ftp,path,session):
        self.__services = []
        self.__listObjects = []
        self.__ftp = ftp
        self.__path = path
        self.session = session

    def fetchForTree(self):
        for f in self.__ftp.listdir_attr(self.__path):
            dataFile = DirectoryTree()
            lstatout = str(f).split()[0]
            file = str(f).split()[8]
            if "qresp.ini" in file:
                self.openFileToReadConfig("qresp.ini")
            dataFile.title = file
            parent = self.__path.split("/")
            parentName = parent[len(parent) - 1]
            dataFile.key = self.__path + "/" + file
            dataFile.id = file
            relPath = str(self.__path + "/" + file).split(parentName, 1)[1]
            dataFile.parent = parentName + "/" + relPath
            if 'd' in lstatout:
                prev = file
                dataFile.folder = "true"
                dataFile.lazy = 'true'
            self.__listObjects.append(dataFile.__dict__)
        return self.__listObjects

    def openFileToReadConfig(self,configFile):
        try:
            remote_file = self.__ftp.open(str(self.__path + "/" + configFile))
            for line in remote_file:
                if str(line) and "=" in str(line):
                    linesplit = line.split("=", 1)
                    servicename = str(linesplit[0]).strip()
                    servicepath = str(linesplit[1]).strip()
                    if "http_service_path" in servicename:
                        if servicepath:
                            self.session["fileServerPath"] = servicepath
                            self.__services.append("http_service_path")
                    elif "globus_service_path" in servicename:
                        if servicepath:
                            self.session["downloadPath"] = servicepath
                            self.__services.append("globus_service_path")
                    elif "isgitservice" in servicename:
                        if servicepath:
                            self.session["gitService"] = servicepath
                            self.__services.append("git_service")
        except:
            print("Config file not found")

    def checkIsConfigFile(self):
        ssh = ""
        isConfigFile = "N"
        try:
            for f in self.__ftp.listdir_attr(self.__path):
                dataFile = DirectoryTree()
                lstatout = str(f).split()[0]
                file = str(f).split()[8]
                if "qresp.ini" in file:
                    isConfigFile = "Y"
                    break
        except:
            print("Could not connect to remote server")
        return isConfigFile

    def fetchServices(self):
        return self.__services


class FetchDOI():
    def __init__(self,doi):
        self.__doi = doi

    def find_word(self,text, search):
        """Util Function to find exact match in words.
        :return: Information of the References - Dictionary
        """
        result = re.findall('\\b' + text + '\\b', search, flags=re.IGNORECASE)
        if len(result) > 0:
            return True
        else:
            return False

    def fetchFromDOI(self):
        """Collects and Returns values given DOI for the Reference section of the drop down menu of the Curation step.
        :return: Information of the References - Dictionary
        """
        try:
            headers = {
                'Accept': 'application/rdf+xml;q=0.5, application/vnd.citationstyles.csl+json;q=1.0',
            }
            res = requests.get('https://doi.org/' + str(self.__doi), headers=headers)
            res.encoding = 'utf-8'
            response = json.loads(res.text)
            kind = "Journal"
            title = ""
            journalFull = ""
            journalAbbr = ""
            volume = ""
            page = ""
            year = 0
            publishedDate = ""
            receivedDate = ""
            publishedAbstract = ""
            url = ""
            authorfnamelist = ""
            authormnamelist = ""
            authorlnamelist = ""
            personList = []
            for resp in response.keys():
                if self.find_word(str(resp).strip(), "title"):
                    title = str(response[resp])
                elif self.find_word(str(resp).strip(), "container-title"):
                    journalFull = str(response[resp])
                elif self.find_word(str(resp).strip(), "container-title-short"):
                    journalAbbr = str(response[resp])
                elif self.find_word(str(resp).strip(), "volume"):
                    volume = str(response[resp])
                elif self.find_word(str(resp).strip(), "article-number") or self.find_word(str(resp).strip().lower(), "page"):
                    page = str(response[resp])
                elif self.find_word(str(resp).strip(), "created"):
                    if "date-parts" in str(response['created']).strip():
                        if len(response['created']['date-parts']) > 0:
                            year = int(response['created']['date-parts'][0][0])
                    if "date-time" in str(response['created']).strip().lower():
                        publishedDate = str(response['created']['date-time'])
                elif self.find_word(str(resp).strip(), "abstract"):
                    publishedAbstract = str(response[resp])
                elif self.find_word(str(resp).strip(), "URL"):
                    url = str(response[resp])
                elif self.find_word(str(resp).strip(), "author"):
                    for eachAuth in response['author']:
                        person = {}
                        if "given" in eachAuth:
                            first = ""
                            middle = ""
                            if ' ' in str(eachAuth["given"]):
                                parts = str(eachAuth["given"]).split()
                                first = str(parts[0])
                                middle = str(parts[1])
                                person["firstName"] = first
                                person["middleName"] = middle
                            else:
                                first = str(eachAuth["given"])
                                person["firstName"] = first
                        if "family" in eachAuth:
                            person["lastName"] = str(eachAuth["family"])
                        personList.append(person)
            authors = {}
            authors["authors"] = personList
            ref = ReferenceForm(**authors)
            ref.journal.fullName.data = journalFull
            ref.URLs.data = url
            ref.publishedAbstract.data = publishedAbstract
            ref.year.data = year
            ref.page.data = page
            ref.volume.data = volume
            ref.title.data = title
            ref.DOI.data = self.__doi
        except Exception as e:
            print("e>",e)
            raise IOError
        return ref