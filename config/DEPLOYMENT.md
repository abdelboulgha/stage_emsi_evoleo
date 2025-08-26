# Deployment Guide

This guide explains how to deploy the EMSI Evoleo project on a production server.

## Prerequisites

- Linux server (Ubuntu 22.04 recommended)
- Docker and Docker Compose installed
- Git
- Domain name (optional, for production)
- SSL certificate (recommended for production)

## Server Setup

1. **Update system packages**
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

2. **Install Docker and Docker Compose**
   ```bash
   # Install Docker
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh
   
   # Install Docker Compose
   sudo apt install docker-compose-plugin
   ```

3. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/stage_emsi_evoleo.git
   cd stage_emsi_evoleo
   ```

## Configuration

1. **Environment Variables**
   Create a `.env` file in the project root with the following variables:
   ```env
   # Database
   MYSQL_ROOT_PASSWORD=your_secure_password
   MYSQL_DATABASE=emsi_evoleo
   MYSQL_USER=emsi_user
   MYSQL_PASSWORD=your_secure_password
   
   # Backend
   SECRET_KEY=your_secret_key
   ALGORITHM=HS256
   ACCESS_TOKEN_EXPIRE_MINUTES=30
   
   # Email (if applicable)
   SMTP_SERVER=smtp.example.com
   SMTP_PORT=587
   SMTP_USER=your_email@example.com
   SMTP_PASSWORD=your_email_password
   ```

2. **Nginx Configuration**
   Update `nginx.conf` with your domain name:
   ```nginx
   server_name yourdomain.com www.yourdomain.com;
   ```

## Deployment

1. **Build and start containers**
   ```bash
   docker compose up --build -d
   ```

2. **Verify containers are running**
   ```bash
   docker ps
   ```

3. **View logs**
   ```bash
   docker compose logs -f
   ```

## Post-Deployment

1. **Create database tables** (if not automatically created)
   ```bash
   docker compose exec backend alembic upgrade head
   ```

2. **Create admin user** (if applicable)
   ```bash
   docker compose exec backend python -m scripts.create_admin
   ```

## Maintenance

- **Backup database**
  ```bash
  docker compose exec db sh -c 'exec mysqldump -u$MYSQL_USER -p$MYSQL_PASSWORD $MYSQL_DATABASE' > backup_$(date +%Y%m%d).sql
  ```

- **Update the application**
  ```bash
  git pull
  docker compose down
  docker compose up --build -d
  ```

## Monitoring

- **View logs**
  ```bash
  docker compose logs -f
  ```

- **Resource usage**
  ```bash
  docker stats
  ```

## Security

- Keep your server updated
- Use strong passwords
- Configure a firewall
- Set up SSL certificates (Let's Encrypt recommended)
- Regularly backup your data

## Troubleshooting

Check container logs:
```bash
docker compose logs [service_name]
```

Access database:
```bash
docker compose exec db mysql -u$MYSQL_USER -p$MYSQL_PASSWORD $MYSQL_DATABASE
```

## Support

For issues, please contact your system administrator or open an issue on the project repository.
