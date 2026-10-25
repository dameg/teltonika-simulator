# syntax=docker/dockerfile:1

FROM node:24-alpine AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY src ./src
COPY routes ./routes
COPY tsconfig.json ./
RUN pnpm run build:app

FROM node:24-alpine AS production
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/dist/src ./dist/src
COPY --from=build /app/routes ./routes
USER node
CMD ["node", "dist/src/cli.js"]
