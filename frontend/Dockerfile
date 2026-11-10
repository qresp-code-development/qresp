# Node 24 LTS (was node:14.21.3-alpine): Next 16 requires Node >= 20.9, and 24
# matches the verified local toolchain. pm2 no longer needs the Node-14 pin.
# Local `yarn build` + `yarn test` verified on Node 24.18.0 (2026-07-02).
FROM node:24-alpine

WORKDIR /usr/src/app

RUN yarn global add pm2

# Installing dependencies
COPY package*.json ./
COPY yarn.lock ./
RUN yarn install

# Copying source files
COPY . .

# Build the production build
RUN yarn build
