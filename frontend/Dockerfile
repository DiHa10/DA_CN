FROM node:22-alpine AS build
WORKDIR /app
# cài thư viện trước khi chép code để Docker giữ cache khi chỉ sửa code
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# giữ cả devDependencies: next đọc next.config.ts cần typescript
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.ts ./
EXPOSE 3000
CMD ["npm", "start"]
