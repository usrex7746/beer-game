const { OAuth2Client } = require('google-auth-library');
const { Resend } = require('resend'); // 新增：引入 Resend
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const resend = new Resend(process.env.RESEND_API_KEY); // 新增：初始化 Resend

app.use(cors({
    origin: [
        'https://respace-disaster.com', 
        'https://www.respace-disaster.com',
        'http://localhost:3000', 
        'http://127.0.0.1:5500',
        /\.vercel\.app$/ 
    ]
}));
app.use(express.json());

// 临时数据库
let users = []; 
const verificationCodes = new Map(); // 新增：用于临时存储验证码 { email: { code, expiresAt } }

// --- 接口 1: 检查用户是否存在 ---
app.post('/api/check-user', (req, res) => {
    const { email } = req.body;
    const user = users.find(u => u.email === email);
    res.json({ isNew: !user });
});

// --- 新增：接口 5: 发送验证码 ---
app.post('/api/send-code', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    // 检查是否已注册
    if (users.find(u => u.email === email)) {
        return res.status(400).json({ error: "User already exists" });
    }

    // 生成 6 位数字验证码
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // 设置验证码，5 分钟后过期
    verificationCodes.set(email, {
        code: code,
        expiresAt: Date.now() + 5 * 60 * 1000 
    });

    try {
        await resend.emails.send({
            from: 'noreply@respace-disaster.com', // 请确保此发件人地址正确
            to: email,
            subject: '您的注册验证码 - Respace Disaster',
            html: `<p>您的验证码是：<strong>${code}</strong>。该验证码在 5 分钟内有效，请勿泄露给他人。</p>`
        });
        res.json({ success: true, message: "Verification code sent" });
    } catch (err) {
        console.error("Resend API Error:", err);
        res.status(500).json({ error: "Failed to send verification code" });
    }
});

// --- 修改：接口 2: 注册 (加入验证码校验) ---
app.post('/api/register', (req, res) => {
    const { email, password, code } = req.body; // 接收前端传来的 code

    // 1. 校验验证码是否存在及是否匹配
    const record = verificationCodes.get(email);
    if (!record) return res.status(400).json({ error: "Please request a verification code first" });
    if (record.code !== code) return res.status(400).json({ error: "Invalid verification code" });
    
    // 2. 校验验证码是否过期
    if (Date.now() > record.expiresAt) {
        verificationCodes.delete(email);
        return res.status(400).json({ error: "Verification code expired" });
    }

    // 3. 正常注册逻辑
    if (users.find(u => u.email === email)) return res.status(400).json({ error: "User exists" });
    
    users.push({ email, password, method: 'email' });
    verificationCodes.delete(email); // 注册成功后，清理已使用的验证码
    res.json({ success: true });
});

// --- 接口 3: 登录 ---
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const user = users.find(u => u.email === email);
    if (!user || user.password !== password) {
        return res.status(401).json({ error: "Invalid credentials" });
    }
    res.json({ success: true });
});

// --- 接口 4: Google 登录 ---
app.post('/api/google-login', async (req, res) => {
    try {
        const ticket = await googleClient.verifyIdToken({
            idToken: req.body.token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const { email } = ticket.getPayload();
        let user = users.find(u => u.email === email);
        let isNew = false;
        if (!user) {
            users.push({ email, method: 'google' });
            isNew = true;
        }
        res.json({ email, isNewUser: isNew });
    } catch (err) { res.status(401).json({ error: "Google Auth Failed" }); }
});

module.exports = app;

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const PORT = 3000;
    app.listen(PORT, () => {
        console.log(`>>> Local Server running on http://localhost:${PORT}`);
    });
}