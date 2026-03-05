# DOB Violation Tracker

A web application to monitor NYC DOB (Department of Buildings) devices for new violations. Track elevators, escalators, and other devices at specific buildings and get alerts when new violations are issued.

## Features

- **Building Management**: Add buildings by BIN (Building Identification Number) to monitor
- **Automatic Monitoring**: Scheduled checks for new violations (configurable interval)
- **Real-time Alerts**: Dashboard shows new violations prominently
- **Violation History**: Track all violations over time
- **Device Tracking**: See all devices at monitored buildings

## Quick Start

### Prerequisites

- Node.js 18 or higher
- npm

### Installation

1. Clone or navigate to this directory:
   ```bash
   cd violation-tracker
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm start
   ```

4. Open your browser to `http://localhost:3000`

### Development Mode

For development with auto-restart on file changes:
```bash
npm run dev
```

## Usage

1. **Add a Building**: Click "+ Add Building" and enter the 7-digit BIN number
   - Find BINs at [DOB BIS](https://a810-bisweb.nyc.gov/bisweb/bispi00.jsp)
   
2. **Monitor Violations**: The app automatically checks for new violations based on the configured interval

3. **Acknowledge Violations**: Mark violations as acknowledged once you've reviewed them

4. **Manual Check**: Click "Check Now" to immediately check all buildings for new violations

## API Endpoints

### Buildings
- `GET /api/buildings` - List all monitored buildings
- `POST /api/buildings` - Add a new building
- `GET /api/buildings/:bin` - Get building details
- `DELETE /api/buildings/:bin` - Remove a building

### Violations
- `GET /api/violations` - List violations (with filters)
- `GET /api/violations/new` - Get new/unacknowledged violations
- `POST /api/violations/:id/acknowledge` - Acknowledge a violation
- `POST /api/violations/acknowledge-all` - Acknowledge all violations

### Checks
- `GET /api/checks/status` - Get check status and scheduler info
- `POST /api/checks/run` - Trigger a manual check
- `GET /api/checks/history` - Get check history
- `PUT /api/checks/interval` - Update check interval

## Deployment

### Render (Recommended for Free Tier)

1. Create a new Web Service on [Render](https://render.com)
2. Connect your repository
3. Configure:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: Node

### Railway

1. Create a new project on [Railway](https://railway.app)
2. Deploy from GitHub or drag the folder
3. Railway will auto-detect Node.js

### Docker (Optional)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## Data Storage

The application uses SQLite for data storage. The database file is stored at `data/violations.db`. 

**Important**: If deploying to a platform with ephemeral storage (like Render free tier), the database will be reset on each deploy. For persistent data, consider:
- Using a persistent disk (Render paid tier)
- Migrating to PostgreSQL
- Using an external database service

## NYC DOB APIs Used

- **Device Data**: `https://data.cityofnewyork.us/resource/e5aq-a4j2.json`
- **DOB Violations**: `https://data.cityofnewyork.us/resource/3h2n-5cm9.json`
- **ECB Violations**: `https://data.cityofnewyork.us/resource/6bgk-3dad.json`

## License

MIT
