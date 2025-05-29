# Deployment

## Initialisation

```
ssh web.ybart.fr

sudo mkdir /var/www/srs-flashcards
sudo chown ybart:nginx /var/www/srs-flashcards
sudo cp /etc/nginx/sites-available/japon.ybarthelemy.info.conf \
        /etc/nginx/sites-available/srs-flashcards.ilyba.fr.conf
sudo vim /etc/nginx/sites-available/srs-flashcards.ilyba.fr.conf
sudo ln -s /etc/nginx/sites-available/srs-flashcards.ilyba.fr.conf /etc/nginx/sites-enabled/
sudo systemctl restart nginx
```

## Configuration

Edit `/etc/nginx/sites-available/srs-flashcards.ilyba.fr.conf`:

```
server_name             srs-flashcards.ilyba.fr;
set                     $base /var/www/srs-flashcards;
access_log              /var/log/nginx/srs-flashcards.access.log;
error_log               /var/log/nginx/srs-flashcards.error.log warn;

# headers
add_header              Cross-Origin-Embedder-Policy "require-corp";
add_header              Cross-Origin-Opener-Policy   "same-origin";
add_header              Cross-Origin-Resource-Policy "same-origin";
```

## Deployment

```
scp -r public web.ybart.fr:/var/www/srs-flashcards
``` 