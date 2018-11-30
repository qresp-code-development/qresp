import paramiko

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

def openFileToReadConfig(path, configFile,hostname,username,password, projectForm):
    services = []
    try:
        ssh = connectToServer(hostname,username,password)
        ftp = ssh.open_sftp()
        remote_file = ftp.open(str(path + "/" + configFile))
        for line in remote_file:
            if str(line) and "=" in str(line):
                linesplit = line.split("=", 1)
                servicename = str(linesplit[0]).strip()
                servicepath = str(linesplit[1]).strip()
                if "http_service_path" in servicename:
                    if servicepath:
                        services.append("http_service_path")
                        projectForm.fileServerPath = servicepath
                elif "globus_service_path" in servicename:
                    if servicepath:
                        services.append("globus_service_path")
                        projectForm.downloadPath = servicepath
                elif "isgitservice" in servicename:
                    if servicepath:
                        projectForm.gitPath = servicepath
                        services.append("git_service")
    except Exception as e:
        print(e)
    ssh.close()
    return services

def connectToServer(hostname,username,password):
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(hostname, username=username, password=password)
    return ssh