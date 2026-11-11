FROM node:22-bookworm-slim

WORKDIR /app

# Prisma CLI is needed at startup to apply production migrations.
COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npm run db:generate

COPY src ./src

ENV NODE_ENV=production
EXPOSE 3000

CMD ["sh", "-c", "npm run db:migrate:deploy && npm run db:seed && npm start"]