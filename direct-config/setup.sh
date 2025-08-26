#!/bin/bash

# Direct Deployment Setup Script for EMSI Evoleo
# Run as root or with sudo

set -e

echo "🚀 Starting Direct Deployment Setup"

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
    python3-pip python3-venv \
    mysql-server \
    nginx \
    nodejs npm \
    git \
    build-essential \
    libmysqlclient-dev \
    python3-dev \
    certbot \
    python3-certbot-nginx

# Configure MySQL
echo "🔐 Securing MySQL installation..."
mysql_secure_installation

echo "✅ Basic server setup complete!"
echo "📝 Please continue with the manual steps in DEPLOYMENT.md:"
echo "1. Set up the database"
echo "2. Configure the backend"
echo "3. Set up the frontend"
echo "4. Configure Nginx"
echo "5. Set up systemd service"
echo "6. Obtain SSL certificate"
