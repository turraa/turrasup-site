FROM nginx:alpine

# Убираем дефолтный конфиг (иначе Timeweb видит 80 и 8080 и падает health check)
RUN rm -f /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
