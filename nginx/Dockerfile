FROM nginx:alpine

# Remove any existing config files
RUN rm /etc/nginx/conf.d/*

# Copy config files
# *.conf files in conf.d/ dir get included in main config
COPY ./default.conf /etc/nginx/conf.d/

# Add certificates and keys
RUN mkdir -p /etc/certs

COPY  localhost.crt /etc/certs
COPY  localhost.key /etc/certs

# Expose the listening port
EXPOSE 443

# Launch NGINX
CMD [ "nginx", "-g", "daemon off;" ]
