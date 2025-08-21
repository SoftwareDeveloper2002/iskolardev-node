# Use official Python image
FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install system dependencies
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential

# Copy Python dependencies files
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

# Expose the port your Flask app runs on
EXPOSE 5000

# Default command to run the app
CMD ["python", "app.py"]
