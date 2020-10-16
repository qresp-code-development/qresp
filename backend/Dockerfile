FROM python:3.6-alpine

# Add to dump logs to file without buffering
ENV PYTHONUNBUFFERED 1

# install ca-certificates so that HTTPS works consistently
# the other runtime dependencies for Python are installed later
RUN apk add --no-cache ca-certificates

# Create the working directory (and set it as the working directory)
RUN mkdir -p /home/flask/app/web
WORKDIR /home/flask/app/web

# Install the package dependencies 
RUN apk add --no-cache curl pkgconfig openssl-dev libffi-dev musl-dev make gcc libxslt-dev
RUN pip install lxml


COPY requirements.txt /home/flask/app/web
RUN pip install --no-cache-dir -r requirements.txt

# Copy the source code into the container
COPY . /home/flask/app/web
COPY project/static  /usr/src/app/web/project/static