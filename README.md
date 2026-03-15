# Bonagiri Chits Backend

This is the backend repository for the Bonagiri Chits application, built with Node.js, Express, Sequelize, and PostgreSQL.

## Prerequisites

- Node.js (v18 or higher recommended)
- PostgreSQL
- npm or yarn

## Installation

1. Clone the repository and navigate into the project directory:
   ```bash
   git clone <repository-url>
   cd bonagiri-chits-backend
   ```

2. Install the necessary dependencies:
   ```bash
   npm install
   ```

3. Setup environment variables:
   Create a `.env` file in the root directory and add the necessary configuration following the structure of the variables located in your configurations. Example:
   ```env
   PORT=5002
   DB_USERNAME=postgres
   DB_PASSWORD=your_password
   DB_DATABASE=bonagiri_chits
   DB_HOST=127.0.0.1
   DB_DIALECT=postgres
   DEFAULT_API_TOKEN=your_secure_default_token
   JWT_SECRET=your_jwt_secret
   JWT_REFRESH_SECRET=your_jwt_refresh_secret
   ```

## Database Migration

1. Run Sequelize migrations to set up the database schemas:
   ```bash
   npx sequelize-cli db:migrate
   ```

## Running the Application

To start the server in development mode using `nodemon`:
```bash
npm run dev
```

To start the server normally:
```bash
npm start
```

By default, the API will be accessible at `http://localhost:5002` (or the port specified in `.env`).

## Features

- **RBAC Authentication:** Uses robust JWTs logic for assigning access and refresh tokens.
- **Protected Routes:** Certain API endpoints require either a Default API Bearer token for open access, or a fully signed JWT token for sensitive reads/writes.
- **Soft Deletion:** Safely disables application models (e.g., Company) using `is_deleted_status` instead of physical deletion.
- **Sequelize ORM:** Streamlined querying, migrations, and model life-cycle hooks.
