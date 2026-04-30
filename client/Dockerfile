# Stage 1: Build Angular application
FROM node:25 AS build

WORKDIR /workspace

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build Angular application for production
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:1.30-alpine

# Install wget for health checks
RUN apk add --no-cache wget

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built Angular application from build stage
COPY --from=build /workspace/dist /usr/share/nginx/html

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
