# হালকা ইমেজ ব্যবহার করছি যাতে ফাস্ট লোড হয়
FROM node:18-alpine

WORKDIR /app

# ডিপেন্ডেন্সি ইন্সটল
COPY package.json ./
RUN npm install --production

# কোড কপি
COPY index.js ./

# পোর্ট এক্সপোজ
EXPOSE 80

# রান কমান্ড
CMD ["npm", "start"]