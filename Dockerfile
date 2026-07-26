FROM nginx:alpine

RUN rm -f /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html

RUN nginx -t

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]