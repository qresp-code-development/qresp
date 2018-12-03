import paramiko     #Provides SSH functionality
import getpass      #Allows for secure prompting and collection of the user password
import os           #Used to setup the Paramiko log file
import logging      #Used to setup the Paramiko log file
import socket       #This method requires that we create our own socket


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
        self.__session = session

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
                            self.__session['fileServerPath'] = servicepath
                            self.__services.append("http_service_path")
                    elif "globus_service_path" in servicename:
                        if servicepath:
                            self.__session['downloadPath'] = servicepath
                            self.__services.append("globus_service_path")
                    elif "isgitservice" in servicename:
                        if servicepath:
                            self.__session['gitService'] = servicepath
                            self.__services.append("git_service")
        except:
            print("Config file not found")

    def fetchServices(self):
        return self.__services

