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
app.use(cors()); // Cho phép yêu cầu từ các tên miền khác
app.use(express.json()); // Đọc dữ liệu JSON từ request
app.use(express.static(path.join(__dirname, 'public'))); // Phục vụ các tệp HTML, CSS, JS trong thư mục 'public'

// ---- DATABASE CONNECTION ----
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Render cung cấp biến này
  ssl: {
    rejectUnauthorized: false
  }
});

// Hàm khởi tạo database
const initializeDatabase = async () => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS links (
            id SERIAL PRIMARY KEY,
            unique_path VARCHAR(10) UNIQUE NOT NULL,
            tracking_code VARCHAR(15) UNIQUE NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    `);
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
            timestamp TIMESTAMPTZ DEFAULT NOW()
        );
    `);
    console.log("Database tables checked/created successfully.");
};

// ---- API ROUTES ----

// [API] Tạo một liên kết theo dõi mới
app.post('/api/links', async (req, res) => {
    try {
        const uniquePath = nanoid(7);
        const trackingCode = nanoid(10).toUpperCase();

        const result = await pool.query(
            'INSERT INTO links(unique_path, tracking_code) VALUES($1, $2) RETURNING *',
            [uniquePath, trackingCode]
        );

        // Tự động tạo URL chính xác dựa trên request
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
        const linkResult = await pool.query('SELECT id FROM links WHERE unique_path = $1', [uniquePath]);

        if (linkResult.rows.length === 0) {
            return res.status(404).send('Link not found');
        }

        const linkId = linkResult.rows[0].id;
        
        const ip_address = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const user_agent = req.headers['user-agent'];
        
        let geoData = { country: 'N/A', city: 'N/A', lat: null, lon: null };
        try {
            // Sử dụng ip-api.com, miễn phí với giới hạn
            const geoResponse = await fetch(`http://ip-api.com/json/${ip_address.split(',')[0].trim()}`);
            const data = await geoResponse.json();
            if (data.status === 'success') geoData = data;
        } catch (geoError) {
            console.error("Geo API Error:", geoError);
        }

        await pool.query(
            `INSERT INTO clicks(link_id, ip_address, user_agent, country, city, latitude, longitude)
             VALUES($1, $2, $3, $4, $5, $6, $7)`,
            [linkId, ip_address, user_agent, geoData.country, geoData.city, geoData.lat, geoData.lon]
        );
        
        // Chuyển hướng người dùng về trang chủ
        res.redirect('/');
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
        const clicksResult = await pool.query('SELECT * FROM clicks WHERE link_id = $1 ORDER BY timestamp DESC', [linkId]);
        
        res.json(clicksResult.rows);
    } catch (error) {
        console.error('Error fetching results:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ---- START SERVER ----
app.listen(PORT, () => {
    initializeDatabase().catch(err => console.error("Database initialization failed:", err));
    console.log(`Server is running on port ${PORT}`);
});
