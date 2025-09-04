# Use Python 3.10 slim base image
FROM python:3.10-slim

# Make Python friendlier in containers
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# System deps often needed by Pillow / OpenCV / PaddleOCR
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libglib2.0-0 \
    libgl1 \
    libjpeg62-turbo \
    libpng16-16 \
    libtiff6 \
    && rm -rf /var/lib/apt/lists/*

# Set working dir inside container
WORKDIR /app

# Install Python deps first (better layer caching)
COPY ./backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the backend source code
COPY ./backend /app

# For Railway/Render/etc. they set $PORT; fall back to 8000 locally
EXPOSE 8000
ENV ENV=production

# Start the app
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
