# QRESP
Qresp Code

## About
**Qresp** "Curation and Exploration of Reproducible Scientific Papers" is a Python application that facilitates the organization, annotation and exploration of data presented in scientific papers.

## Installation 
To quickly install **Qresp**, execute : 

     pip install qresp 
     qresp

Alternatively you can execute : 

     pip install -e .
	 
### Docker
To download using docker

Download source code and change the environment variable docker-compose and docker-compose.override and add a user defined key to set environment variable so as to connect to a mongo database.
	
     docker-compose build
     docker-compose up -d	

Alternatively you can execute :

     docker run -p 8080:8080 qrespcontainer/qresp:latest