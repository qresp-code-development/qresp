FROM nginx:alpine

# Remove any existing config files
RUN rm /etc/nginx/conf.d/*

# Copy config files
# *.conf files in conf.d/ dir get included in main config
COPY ./default.conf /etc/nginx/conf.d/

# Add certificates and keys
RUN mkdir -p /etc/certs

# Cert filenames must match default.conf (ssl_certificate /etc/certs/nginx.crt).
# These are git-ignored; generate local dev certs with generate-local-certs.sh.
COPY  nginx.crt /etc/certs
COPY  nginx.key /etc/certs

# Expose the listening port
EXPOSE 443

# Launch NGINX
CMD [ "nginx", "-g", "daemon off;" ]
