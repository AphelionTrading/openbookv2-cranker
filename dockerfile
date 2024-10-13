# Use an official Node.js runtime as the base image
FROM node:22

# Set the working directory inside the container
WORKDIR /app

# Copy the application files to the container
COPY . .

# Install the project dependencies
RUN yarn install

# Build the application
RUN yarn build

# Command to run your application
CMD ["yarn", "start"]