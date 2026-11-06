# Python 3.14 slim: newest stable CPython, verified in-container on 2026-07-02
# (pip install lock + GET / boot + nose2 29 tests). Debian-slim provides
# manylinux wheels for lxml etc., so no apt build toolchain is required.
# Installing the exact lockfile keeps the Docker dependency set identical to
# the verified baseline (lock generated on win/3.11 -- see its header note).
FROM python:3.14-slim

# Dump logs without buffering
ENV PYTHONUNBUFFERED=1

WORKDIR /home/flask/app/web

# Install the exact, verified dependency set.
COPY requirements.lock.txt /home/flask/app/web/
RUN pip install --no-cache-dir --progress-bar off -r requirements.lock.txt

# Copy the source code into the container
COPY . /home/flask/app/web
