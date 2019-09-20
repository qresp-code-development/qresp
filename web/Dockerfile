FROM alpine:3.4
MAINTAINER Aditya Tanikanti <aditya.tanikanti@gmail.com>

# ensure local python is preferred over distribution python
ENV PATH /usr/local/bin:$PATH

# http://bugs.python.org/issue19846
# > At the moment, setting "LANG=C" on a Linux system *fundamentally breaks Python 3*, and that's not OK.
ENV LANG C.UTF-8

# install ca-certificates so that HTTPS works consistently
# the other runtime dependencies for Python are installed later
RUN apk add --no-cache ca-certificates

ENV GPG_KEY 0D96DF4D4110E5C43FBFB17F2D347EA6AA65421D
ENV PYTHON_VERSION 3.6.1

RUN set -ex \
        && apk add --no-cache --virtual .fetch-deps \
                gnupg \
                openssl \
                tar \
                xz \
        \
        && wget -O python.tar.xz "https://www.python.org/ftp/python/${PYTHON_VERSION%%[a-z]*}/Python-$PYTHON_VERSION.tar.xz" \
        && wget -O python.tar.xz.asc "https://www.python.org/ftp/python/${PYTHON_VERSION%%[a-z]*}/Python-$PYTHON_VERSION.tar.xz.asc" \
        && export GNUPGHOME="$(mktemp -d)" \
        && gpg --keyserver ha.pool.sks-keyservers.net --recv-keys "$GPG_KEY" \
        && gpg --batch --verify python.tar.xz.asc python.tar.xz \
        && rm -rf "$GNUPGHOME" python.tar.xz.asc \
        && mkdir -p /usr/src/python \
        && tar -xJC /usr/src/python --strip-components=1 -f python.tar.xz \
        && rm python.tar.xz \
        \
        && apk add --no-cache --virtual .build-deps  \
                bzip2-dev \
                coreutils \
                dpkg-dev dpkg \
                expat-dev \
                gcc \
                gdbm-dev \
                libc-dev \
                libffi-dev \
                linux-headers \
                make \
                ncurses-dev \
                openssl \
                openssl-dev \
                pax-utils \
                readline-dev \
                sqlite-dev \
                tcl-dev \
                tk \
                tk-dev \
                xz-dev \
                zlib-dev \
                libxslt-dev \
# add build deps before removing fetch deps in case there's overlap
        && apk del .fetch-deps \
        \
        && cd /usr/src/python \
        && gnuArch="$(dpkg-architecture --query DEB_BUILD_GNU_TYPE)" \
        && ./configure \
                --build="$gnuArch" \
                --enable-loadable-sqlite-extensions \
                --enable-shared \
                --with-system-expat \
                --with-system-ffi \
                --without-ensurepip \
        && make -j "$(nproc)" \
        && make install \
        \
        && runDeps="$( \
                scanelf --needed --nobanner --recursive /usr/local \
                        | awk '{ gsub(/,/, "\nso:", $2); print "so:" $2 }' \
                        | sort -u \
                        | xargs -r apk info --installed \
                        | sort -u \
        )" \
        && apk add --virtual .python-rundeps $runDeps \
        && apk del .build-deps \
        \
        && find /usr/local -depth \
                \( \
                        \( -type d -a -name test -o -name tests \) \
                        -o \
                        \( -type f -a -name '*.pyc' -o -name '*.pyo' \) \
                \) -exec rm -rf '{}' + \
        && rm -rf /usr/src/python

# make some useful symlinks that are expected to exist
RUN cd /usr/local/bin \
        && ln -s idle3 idle \
        && ln -s pydoc3 pydoc \
        && ln -s python3 python \
        && ln -s python3-config python-config

# if this is called "PIP_VERSION", pip explodes with "ValueError: invalid truth value '<VERSION>'"
ENV PYTHON_PIP_VERSION 18.1

RUN set -ex; \
        \
        apk add --no-cache --virtual .fetch-deps openssl; \
        \
        wget -O get-pip.py 'https://bootstrap.pypa.io/get-pip.py'; \
        \
        apk del .fetch-deps; \
        \
        python get-pip.py \
                --disable-pip-version-check \
                --no-cache-dir \
                "pip==$PYTHON_PIP_VERSION" \
        ; \
        pip --version; \
        \
        find /usr/local -depth \
                \( \
                        \( -type d -a -name test -o -name tests \) \
                        -o \
                        \( -type f -a -name '*.pyc' -o -name '*.pyo' \) \
                \) -exec rm -rf '{}' +; \
        rm -f get-pip.py

RUN apk add --no-cache curl python pkgconfig python-dev openssl-dev libffi-dev musl-dev make gcc libxslt-dev
RUN pip install lxml

# Create the working directory (and set it as the working directory)
RUN mkdir -p /home/flask/app/web
WORKDIR /home/flask/app/web

# Install the package dependencies (this step is separated
# from copying all the source code to avoid having to
# re-install all python packages defined in requirements.txt
# whenever any source code change is made)
COPY requirements.txt /home/flask/app/web
RUN pip install --no-cache-dir -r requirements.txt



# Copy the source code into the container
COPY . /home/flask/app/web
COPY project/static  /usr/src/app/web/project/static
