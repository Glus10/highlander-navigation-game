# Stage 1: build the static app
FROM node:22.20.0-alpine3.22 AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Non-secret build-time configuration (DECISIONS.md D6b). Empty values fall back to the defaults in .env.example.
ARG VITE_OSRM_FOOT_URL=""
ARG VITE_ROUTING_TIMEOUT_MS=""
ARG VITE_GOAL_MIN_RADIUS_M=""
ARG VITE_GOAL_MAX_RADIUS_M=""
ARG VITE_MAX_SNAP_DISTANCE_M=""
ARG VITE_MAX_ROUTE_LENGTH_M=""
ARG VITE_MAX_GOAL_ATTEMPTS=""
ARG VITE_GOAL_THRESHOLD_M=""
ARG VITE_START_FIX_MAX_ACCURACY_M=""
ARG VITE_START_FIX_WAIT_MS=""
ARG VITE_GEOLOCATION_TIMEOUT_MS=""
ARG VITE_SIM_START_LAT=""
ARG VITE_SIM_START_LNG=""
RUN npm run build

# Stage 2: serve with unprivileged nginx (port 8080, non-root)
FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
