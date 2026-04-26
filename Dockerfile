FROM php:8.2-apache

# Install MySQL PDO driver
RUN docker-php-ext-install pdo pdo_mysql

# Enable Apache mod_rewrite (optional but good)
RUN a2enmod rewrite

# Copy your app
COPY . /var/www/html/

# Set permissions
RUN chown -R www-data:www-data /var/www/html