FROM nginx:1.11.3
RUN rm /etc/nginx/nginx.conf
COPY nginx.conf /etc/nginx/
RUN rm /etc/nginx/conf.d/default.conf
COPY family_recipes.conf /etc/nginx/conf.d/
RUN mkdir -p /etc/certs
#Copy certificates
#COPY cert /etc/certs
#COPY cert_key /etc/certs
