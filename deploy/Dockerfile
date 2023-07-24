# syntax = docker/dockerfile:1

################################################################################
# Requires package.json, package-lock.json and m-ld-gateway-${GW_VERSION}.tgz
# in the local context. See ../package.json/scripts/predocker

# Adjust NODE_VERSION as desired
ARG NODE_VERSION=16.19.0
FROM node:${NODE_VERSION}-slim as base
ARG GW_VERSION=0.1.0

LABEL fly_launch_runtime="Node.js"

# Node.js app lives here
WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Install node modules
COPY --link package-lock.json package.json ./
RUN npm ci

# Add application package
ADD m-ld-gateway-${GW_VERSION}.tgz ./

# Start the server by default, this can be overwritten at runtime
EXPOSE 3000
CMD [ "node", "package/ext/start.js" ]
