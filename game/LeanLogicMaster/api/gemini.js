// api/gemini.js
export default async function handler(req, res) {
    // 1. 仅允许 POST 请求
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // 2. 从前端请求中获取 prompt
        const { prompt } = req.body;
        
        // 3. 从 Vercel 环境变量中读取你的 API Key (绝对安全，不暴露给前端)
        const API_KEY = process.env.GEMINI_API_KEY;
        
        // Google Gemini API 的官方请求地址 (这里建议用 1.5-flash，更稳定)
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

        // 4. 在云端向 Google 发起真实的请求
        const googleResponse = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { response_mime_type: "application/json" }
            })
        });

        const data = await googleResponse.json();

        // 5. 检查 Google 的响应是否有错误
        if (!googleResponse.ok) {
            return res.status(googleResponse.status).json({ error: data });
        }

        // 6. 将 Google 返回的干净数据转发回你的前端
        return res.status(200).json(data);

    } catch (error) {
        console.error("API Error:", error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}