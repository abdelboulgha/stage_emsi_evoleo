#!/bin/bash

# Setup script for EMSI Evoleo production environment

# Exit on error
set -e

echo "🚀 Starting EMSI Evoleo Production Setup"

# Check if running as root
if [ "$(id -u)" -ne 0 ]; then
    echo "❌ This script must be run as root"
    exit 1
fi

# Update system
echo "🔄 Updating system packages..."
apt update && apt upgrade -y

# Install required packages
echo "📦 Installing required packages..."
apt install -y \
    curl \
    wget \
    git \
    ufw \
    fail2ban \
    htop \
    vim \
    cron \
    python3-pip

# Install Docker
echo "🐳 Installing Docker..."
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
usermod -aG docker $USER

# Install Docker Compose
echo "📦 Installing Docker Compose..."
LATEST_COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep 'tag_name' | cut -d '"' -f 4)
curl -L "https://github.com/docker/compose/releases/download/${LATEST_COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Configure firewall
echo "🔒 Configuring firewall..."
ufw allow OpenSSH
ufw allow http
ufw allow https
ufw enable

# Create project directory
PROJECT_DIR="/opt/emsi-evoleo"
mkdir -p $PROJECT_DIR

# Set up backup directory
BACKUP_DIR="/var/backups/emsi-evoleo"
mkdir -p $BACKUP_DIR
chmod 700 $BACKUP_DIR

# Set up log directory
LOG_DIR="/var/log/emsi-evoleo"
mkdir -p $LOG_DIR
chmod 755 $LOG_DIR

# Create systemd service for automatic startup
cat > /etc/systemd/system/emsi-evoleo.service <<EOL
[Unit]
Description=EMSI Evoleo Application
Requires=docker.service
After=docker.service

[Service]
WorkingDirectory=$PROJECT_DIR
ExecStart=/usr/local/bin/docker-compose up
ExecStop=/usr/local/bin/docker-compose down
Restart=always
User=root
Group=docker

[Install]
WantedBy=multi-user.target
EOL

# Enable and start the service
systemctl daemon-reload
systemctl enable emsi-evoleo.service

# Create backup cron job
CRON_JOB="0 2 * * * root $PROJECT_DIR/config/backup.sh"
(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

echo "✅ Setup complete!"
echo "📝 Next steps:"
echo "1. Copy your project files to $PROJECT_DIR"
echo "2. Configure your .env file in $PROJECT_DIR"
echo "3. Start the application: systemctl start emsi-evoleo"
echo "4. Check logs: journalctl -u emsi-evoleo -f"
