# Direct Deployment Guide (No Docker)

This guide explains how to deploy the EMSI Evoleo project directly on a Linux server without Docker.

## Prerequisites

- Ubuntu 22.04 LTS server
- MySQL 8.0+
- Python 3.10+
- Node.js 18+ (for frontend)
- Nginx (as reverse proxy)
- Git

## Server Setup

1. **Update system packages**
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

2. **Install required system packages**
   ```bash
   sudo apt install -y \
       python3-pip python3-venv \
       mysql-server \
       nginx \
       nodejs npm \
       git \
       build-essential \
       libmysqlclient-dev \
       python3-dev
   ```

## Database Setup

1. **Secure MySQL installation**
   ```bash
   sudo mysql_secure_installation
   ```

2. **Create database and user**
   ```bash
   sudo mysql -u root -p
   ```
   ```sql
   CREATE DATABASE emsi_evoleo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'emsi_user'@'localhost' IDENTIFIED BY 'your_secure_password';
   GRANT ALL PRIVILEGES ON emsi_evoleo.* TO 'emsi_user'@'localhost';
   FLUSH PRIVILEGES;
   EXIT;
   ```

## Backend Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/stage_emsi_evoleo.git
   cd stage_emsi_evoleo/backend
   ```

2. **Create and activate virtual environment**
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

3. **Install Python dependencies**
   ```bash
   pip install -r Requirements+Readme/requirements.txt
   ```

4. **Configure environment variables**
   Create a `.env` file in the backend directory:
   ```env
   DATABASE_URL=mysql+pymysql://emsi_user:your_secure_password@localhost/emsi_evoleo
   SECRET_KEY=your_secret_key_here
   ALGORITHM=HS256
   ACCESS_TOKEN_EXPIRE_MINUTES=30
   ```

5. **Run database migrations**
   ```bash
   alembic upgrade head
   ```

## Frontend Setup

1. **Install Node.js dependencies**
   ```bash
   cd ../front_end
   npm install
   ```

2. **Build the frontend**
   ```bash
   npm run build
   ```

## Nginx Configuration

1. **Create Nginx config**
   ```bash
   sudo nano /etc/nginx/sites-available/emsi-evoleo
   ```
   
   ```nginx
   server {
       listen 80;
       server_name yourdomain.com www.yourdomain.com;
       
       # Frontend
       location / {
           root /path/to/stage_emsi_evoleo/front_end/build;
           try_files $uri /index.html;
       }
       
       # Backend API
       location /api {
           proxy_pass http://127.0.0.1:8000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       }
   }
   ```

2. **Enable the site**
   ```bash
   sudo ln -s /etc/nginx/sites-available/emsi-evoleo /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

## Systemd Service

1. **Create backend service**
   ```bash
   sudo nano /etc/systemd/system/emsi-backend.service
   ```
   
   ```ini
   [Unit]
   Description=EMSI Evoleo Backend
   After=network.target
   
   [Service]
   User=www-data
   Group=www-data
   WorkingDirectory=/path/to/stage_emsi_evoleo/backend
   Environment="PATH=/path/to/stage_emsi_evoleo/backend/venv/bin"
   ExecStart=/path/to/stage_emsi_evoleo/backend/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
   Restart=always
   
   [Install]
   WantedBy=multi-user.target
   ```

2. **Start and enable services**
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl start emsi-backend
   sudo systemctl enable emsi-backend
   ```

## SSL Certificate (Let's Encrypt)

1. **Install Certbot**
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   ```

2. **Obtain SSL certificate**
   ```bash
   sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
   ```

## Maintenance

- **Update the application**
  ```bash
  cd /path/to/stage_emsi_evoleo
  git pull
  cd backend
  source venv/bin/activate
  pip install -r Requirements+Readme/requirements.txt
  alembic upgrade head
  cd ../front_end
  npm install
  npm run build
  sudo systemctl restart emsi-backend
  ```

- **Backup database**
  ```bash
  mysqldump -u emsi_user -p emsi_evoleo > backup_$(date +%Y%m%d).sql
  ```

## Troubleshooting

- Check backend logs: `journalctl -u emsi-backend -f`
- Check Nginx logs: `sudo tail -f /var/log/nginx/error.log`
- Check MySQL logs: `sudo tail -f /var/log/mysql/error.log`
