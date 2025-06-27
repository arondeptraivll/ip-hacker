// file: index.js
const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const cors = require('cors');
const { nanoid } = require('nanoid');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- MIDDLEWARE ----
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- DATABASE CONNECTION ----
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Hàm khởi tạo/cập nhật database
const initializeDatabase = async () => {
    // [CẢI TIẾN] Thêm cột 'destination_url' để lưu link đích
    await pool.query(`
        CREATE TABLE IF NOT EXISTS links (
            id SERIAL PRIMARY KEY,
            unique_path VARCHAR(10) UNIQUE NOT NULL,
            tracking_code VARCHAR(15) UNIQUE NOT NULL,
            destination_url TEXT NOT NULL, 
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    `);
    // [CẢI TIẾN] Thêm cột 'referrer' để lưu trang web nguồn
    await pool.query(`
        CREATE TABLE IF NOT EXISTS clicks (
            id SERIAL PRIMARY KEY,
            link_id INTEGER REFERENCES links(id) ON DELETE CASCADE,
            ip_address VARCHAR(45),
            user_agent TEXT,
            country VARCHAR(100),
            city VARCHAR(100),
            latitude REAL,
            longitude REAL,
            referrer TEXT, 
            timestamp TIMESTAMPTZ DEFAULT NOW()
        );
    `);
    console.log("Database tables checked/created successfully.");
};

// ---- API ROUTES ----

// [API] Tạo một liên kết theo dõi mới
app.post('/api/links', async (req, res) => {
    // [CẢI TIẾN] Nhận destination_url từ người dùng
    const { destinationUrl } = req.body;
    if (!destinationUrl) {
        return res.status(400).json({ error: 'Vui lòng cung cấp URL đích.' });
    }

    try {
        const uniquePath = nanoid(7);
        const trackingCode = nanoid(10).toUpperCase();

        const result = await pool.query(
            // [CẢI TIẾN] Chèn destination_url vào database
            'INSERT INTO links(unique_path, tracking_code, destination_url) VALUES($1, $2, $3) RETURNING *',
            [uniquePath, trackingCode, destinationUrl]
        );

        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.get('host');
        const trackableLink = `${protocol}://${host}/track/${uniquePath}`;

        res.status(201).json({ 
            tracking_code: result.rows[0].tracking_code, 
            trackable_link: trackableLink 
        });
    } catch (error) {
        console.error('Error creating link:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// [LOGIC] Xử lý khi người dùng nhấp vào link theo dõi
app.get('/track/:uniquePath', async (req, res) => {
    try {
        const { uniquePath } = req.params;
        // [CẢI TIẾN] Lấy cả destination_url từ database
        const linkResult = await pool.query('SELECT id, destination_url FROM links WHERE unique_path = $1', [uniquePath]);

        if (linkResult.rows.length === 0) {
            return res.status(404).send('Link not found');
        }

        const linkId = linkResult.rows[0].id;
        const destinationUrl = linkResult.rows[0].destination_url;
        
        const ip_address = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const user_agent = req.headers['user-agent'];
        // [CẢI TIẾN] Lấy thông tin referrer
        const referrer = req.headers['referer'] || 'Truy cập trực tiếp';
        
        let geoData = { country: 'N/A', city: 'N/A', lat: null, lon: null };
        try {
            const geoResponse = await fetch(`http://ip-api.com/json/${ip_address.split(',')[0].trim()}`);
            const data = await geoResponse.json();
            if (data.status === 'success') geoData = data;
        } catch (geoError) {
            console.error("Geo API Error:", geoError);
        }

        // [CẢI TIẾN] Lưu referrer vào database
        await pool.query(
            `INSERT INTO clicks(link_id, ip_address, user_agent, country, city, latitude, longitude, referrer)
             VALUES($1, $2, $3, $4, $5, $6, $7, $8)`,
            [linkId, ip_address, user_agent, geoData.country, geoData.city, geoData.lat, geoData.lon, referrer]
        );
        
        // [CẢI TIẾN] Chuyển hướng tới link đích người dùng đã nhập
        res.redirect(destinationUrl);
    } catch (error) {
        console.error('Error tracking click:', error);
        res.status(500).send('Error processing your request.');
    }
});

// [API] Xem kết quả tracking
app.get('/api/results/:trackingCode', async (req, res) => {
    try {
        const { trackingCode } = req.params;
        const linkResult = await pool.query('SELECT id FROM links WHERE tracking_code = $1', [trackingCode]);

        if (linkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Mã theo dõi không hợp lệ' });
        }
        
        const linkId = linkResult.rows[0].id;
        // Lấy tất cả thông tin, bao gồm cả referrer
        const clicksResult = await pool.query('SELECT * FROM clicks WHERE link_id = $1 ORDER BY timestamp DESC', [linkId]);
        
        res.json(clicksResult.rows);
    } catch (error) {
        console.error('Error fetching results:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ---- START SERVER ----
app.listen(PORT, () => {
    initializeDatabase();
    console.log(`Server is running on port ${PORT}`);
});
