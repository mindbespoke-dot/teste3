import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import db from './database.js';
import { generateToken, verifyToken, requireAdmin, checkSubscription } from './auth.js';

const app = express();
const PORT = 3000;

const ADMIN_EMAILS = ['admin@r4academy.com', 'seu@email.com', 'teste@gmail.com'];
const CAKTO_WEBHOOK_SECRET = process.env.CAKTO_WEBHOOK_SECRET || 'change-this-secret';

app.use(cors());

app.post('/api/webhooks/cakto', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    const signature = req.headers['x-cakto-signature'];
    const secret = CAKTO_WEBHOOK_SECRET;
    
    if (!signature || signature !== secret) {
      console.log('Invalid webhook signature');
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const payload = JSON.parse(req.body.toString());
    
    if (payload.event === 'compra aprovada' || payload.event === 'purchase.approved') {
      const customerEmail = payload.customer?.email;
      
      if (customerEmail) {
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(customerEmail);
        
        if (user) {
          const existing = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(user.id);
          
          const expiresAt = new Date();
          expiresAt.setMonth(expiresAt.getMonth() + 1);
          
          if (existing) {
            db.prepare(`
              UPDATE subscriptions 
              SET status = 'active', expires_at = ?, plan_type = 'premium' 
              WHERE user_id = ?
            `).run(expiresAt.toISOString(), user.id);
          } else {
            db.prepare(`
              INSERT INTO subscriptions (user_id, status, plan_type, expires_at) 
              VALUES (?, 'active', 'premium', ?)
            `).run(user.id, expiresAt.toISOString());
          }
          
          console.log(`Subscription activated for user ${user.email}`);
        }
      }
    }
    
    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const existingUser = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const role = ADMIN_EMAILS.includes(email) ? 'admin' : 'user';

    const result = db.prepare(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)'
    ).run(name, email, passwordHash, role);

    db.prepare(
      'INSERT INTO user_profiles (user_id) VALUES (?)'
    ).run(result.lastInsertRowid);

    const user = { id: result.lastInsertRowid, name, email, role };
    const token = generateToken(user);

    res.json({ user: { ...user, password: undefined }, token });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log(`[Login] Attempt for email: ${email}`);

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      console.log(`[Login] User not found: ${email}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      console.log(`[Login] Invalid password for: ${email}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user);
    const { password_hash, ...userWithoutPassword } = user;
    
    console.log(`[Login] Success for user ${user.id} (${email})`);
    res.json({ user: userWithoutPassword, token });
  } catch (error) {
    console.error('[Login] Error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/auth/me', verifyToken, (req, res) => {
  try {
    const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      console.log(`[Auth/Me] User not found in database: ${req.user.id}`);
      return res.status(404).json({ error: 'User not found' });
    }
    console.log(`[Auth/Me] Returning user data for ${user.id} (${user.email})`);
    res.json({ user });
  } catch (error) {
    console.error('[Auth/Me] Error:', error);
    res.status(500).json({ error: 'Failed to get user data' });
  }
});

app.get('/api/profile', verifyToken, (req, res) => {
  const profile = db.prepare(`
    SELECT u.id, u.name, u.email, u.role, up.profile_image_url, up.bio
    FROM users u
    LEFT JOIN user_profiles up ON u.id = up.user_id
    WHERE u.id = ?
  `).get(req.user.id);
  
  res.json(profile);
});

app.put('/api/profile', verifyToken, (req, res) => {
  const { name, bio, profile_image_url } = req.body;
  
  db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, req.user.id);
  db.prepare('UPDATE user_profiles SET bio = ?, profile_image_url = ? WHERE user_id = ?')
    .run(bio || null, profile_image_url || null, req.user.id);
  
  res.json({ success: true });
});

app.get('/api/subscription/status', verifyToken, (req, res) => {
  const subscription = db.prepare(
    'SELECT * FROM subscriptions WHERE user_id = ?'
  ).get(req.user.id);
  
  res.json({
    hasSubscription: subscription?.status === 'active',
    subscription: subscription || null
  });
});

app.post('/api/payment/create-checkout', verifyToken, async (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    
    const checkoutUrl = `https://pay.cakto.com.br/checkout?product_id=${process.env.CAKTO_PRODUCT_ID || 'PRODUCT_ID'}&customer_email=${encodeURIComponent(user.email)}&customer_name=${encodeURIComponent(user.name)}`;
    
    res.json({ checkoutUrl });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ error: 'Failed to create checkout' });
  }
});


app.get('/api/courses', verifyToken, (req, res) => {
  const courses = db.prepare(`
    SELECT c.*, COUNT(l.id) as lesson_count
    FROM courses c
    LEFT JOIN lessons l ON c.id = l.course_id
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `).all();
  
  res.json(courses);
});

app.post('/api/courses', verifyToken, requireAdmin, (req, res) => {
  const { title, description, thumbnail_url } = req.body;
  
  const result = db.prepare(
    'INSERT INTO courses (title, description, thumbnail_url) VALUES (?, ?, ?)'
  ).run(title, description || null, thumbnail_url || null);
  
  res.json({ id: result.lastInsertRowid, title, description, thumbnail_url });
});

app.put('/api/courses/:id', verifyToken, requireAdmin, (req, res) => {
  const { title, description, thumbnail_url } = req.body;
  
  db.prepare(
    'UPDATE courses SET title = ?, description = ?, thumbnail_url = ? WHERE id = ?'
  ).run(title, description, thumbnail_url, req.params.id);
  
  res.json({ success: true });
});

app.delete('/api/courses/:id', verifyToken, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM courses WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/courses/:courseId/lessons', verifyToken, (req, res) => {
  const lessons = db.prepare(`
    SELECT l.*, 
           COALESCE(lp.completed, 0) as completed
    FROM lessons l
    LEFT JOIN lesson_progress lp ON l.id = lp.lesson_id AND lp.user_id = ?
    WHERE l.course_id = ?
    ORDER BY l.order_index, l.id
  `).all(req.user.id, req.params.courseId);
  
  res.json(lessons);
});

app.post('/api/lessons', verifyToken, requireAdmin, (req, res) => {
  const { course_id, title, description, youtube_video_id, order_index } = req.body;
  
  const result = db.prepare(
    'INSERT INTO lessons (course_id, title, description, youtube_video_id, order_index) VALUES (?, ?, ?, ?, ?)'
  ).run(course_id, title, description || null, youtube_video_id, order_index || 0);
  
  res.json({ id: result.lastInsertRowid, course_id, title, description, youtube_video_id, order_index });
});

app.put('/api/lessons/:id', verifyToken, requireAdmin, (req, res) => {
  const { title, description, youtube_video_id, order_index } = req.body;
  
  db.prepare(
    'UPDATE lessons SET title = ?, description = ?, youtube_video_id = ?, order_index = ? WHERE id = ?'
  ).run(title, description, youtube_video_id, order_index, req.params.id);
  
  res.json({ success: true });
});

app.delete('/api/lessons/:id', verifyToken, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM lessons WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.post('/api/lessons/:id/complete', verifyToken, (req, res) => {
  const { completed } = req.body;
  
  const existing = db.prepare(
    'SELECT * FROM lesson_progress WHERE user_id = ? AND lesson_id = ?'
  ).get(req.user.id, req.params.id);
  
  if (existing) {
    db.prepare(
      'UPDATE lesson_progress SET completed = ?, completed_at = ? WHERE user_id = ? AND lesson_id = ?'
    ).run(completed ? 1 : 0, completed ? new Date().toISOString() : null, req.user.id, req.params.id);
  } else {
    db.prepare(
      'INSERT INTO lesson_progress (user_id, lesson_id, completed, completed_at) VALUES (?, ?, ?, ?)'
    ).run(req.user.id, req.params.id, completed ? 1 : 0, completed ? new Date().toISOString() : null);
  }
  
  res.json({ success: true });
});

app.get('/api/chat/history/:agentType', verifyToken, checkSubscription(db), (req, res) => {
  const history = db.prepare(
    'SELECT * FROM ai_chat_history WHERE user_id = ? AND agent_type = ? ORDER BY created_at ASC'
  ).all(req.user.id, req.params.agentType);
  
  res.json(history);
});

app.post('/api/chat/history', verifyToken, checkSubscription(db), (req, res) => {
  const { agent_type, role, content, image_url } = req.body;
  
  const result = db.prepare(
    'INSERT INTO ai_chat_history (user_id, agent_type, role, content, image_url) VALUES (?, ?, ?, ?, ?)'
  ).run(req.user.id, agent_type, role, content, image_url || null);
  
  res.json({ id: result.lastInsertRowid });
});

app.post('/api/ai/openai-chat', verifyToken, checkSubscription(db), async (req, res) => {
  try {
    const { messages } = req.body;
    
    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: messages,
      max_tokens: 2000
    });

    const assistantMessage = response.choices[0].message.content;
    res.json({ message: assistantMessage });
  } catch (error) {
    console.error('OpenAI Chat error:', error);
    res.status(500).json({ error: 'Failed to get response from OpenAI' });
  }
});

app.post('/api/ai/gemini-chat', verifyToken, checkSubscription(db), async (req, res) => {
  try {
    const { message, history } = req.body;
    
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
    
    const contents = [];
    if (history && history.length > 0) {
      for (const msg of history) {
        contents.push({
          role: msg.role,
          parts: msg.parts || [{ text: msg.content || '' }]
        });
      }
    }
    contents.push({ role: 'user', parts: [{ text: message }] });
    
    const response = await ai.models.generateContentStream({
      model: 'gemini-2.0-flash',
      contents: contents,
    });
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    for await (const chunk of response) {
      if (chunk.text) {
        res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
      }
    }
    
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('Gemini Chat error:', error);
    res.status(500).json({ error: 'Failed to get response from Gemini' });
  }
});

app.post('/api/ai/chat-with-fallback', verifyToken, checkSubscription(db), async (req, res) => {
  try {
    const { message, history } = req.body;
    
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
      
      const contents = [];
      if (history && history.length > 0) {
        for (const msg of history) {
          contents.push({
            role: msg.role,
            parts: msg.parts || [{ text: msg.content || '' }]
          });
        }
      }
      contents.push({ role: 'user', parts: [{ text: message }] });
      
      const response = await ai.models.generateContentStream({
        model: 'gemini-2.0-flash',
        contents: contents,
      });
      
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      for await (const chunk of response) {
        if (chunk.text) {
          res.write(`data: ${JSON.stringify({ text: chunk.text, provider: 'google' })}\n\n`);
        }
      }
      
      res.write('data: [DONE]\n\n');
      res.end();
      
      console.log('[AI Fallback] Successfully used Google Gemini');
    } catch (googleError) {
      console.error('[AI Fallback] Google failed, trying OpenAI:', googleError.message);
      
      const { default: OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const messages = [
        ...(history || []).map(msg => ({
          role: msg.role === 'model' ? 'assistant' : msg.role,
          content: msg.parts?.[0]?.text || msg.content || ''
        })),
        { role: 'user', content: message }
      ];

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: messages,
        max_tokens: 2000,
        stream: true
      });

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      for await (const chunk of response) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          res.write(`data: ${JSON.stringify({ text: content, provider: 'openai' })}\n\n`);
        }
      }
      
      res.write('data: [DONE]\n\n');
      res.end();
      
      console.log('[AI Fallback] Successfully used OpenAI as fallback');
    }
  } catch (error) {
    console.error('[AI Fallback] Both providers failed:', error);
    res.status(500).json({ error: 'Failed to get response from AI providers' });
  }
});

app.post('/api/ai/image-analysis', verifyToken, checkSubscription(db), async (req, res) => {
  try {
    const { imageData, prompt } = req.body;
    
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
    
    const imagePart = {
      inlineData: {
        data: imageData.split(',')[1],
        mimeType: imageData.split(':')[1].split(';')[0]
      }
    };
    
    const systemPrompt = `Você é um analisador de imagens especializado em criar prompts estruturados para geração de imagens, seguindo o estilo do Google Whisk.

Analise a imagem fornecida e crie um prompt detalhado e estruturado seguindo EXATAMENTE este formato:

**[DESCRIÇÃO DO CONTEÚDO PRINCIPAL]**
Descreva objetivamente os elementos principais da imagem, personagens, objetos, ações acontecendo.

**[COMPOSIÇÃO E ENQUADRAMENTO]**
Descreva o enquadramento, ângulo da câmera, perspectiva, posição dos elementos, regra dos terços, etc.

**[ESTILO VISUAL / ARTE]**
Identifique o estilo artístico: fotorrealista, ilustração, 3D, pixel art, aquarela, óleo, cartoon, anime, minimalista, etc.

**[ILUMINAÇÃO E AMBIENTE]**
Descreva a iluminação (natural, artificial, dourada, dramática, suave), temperatura de cor, atmosfera, mood.

**[DETALHES TÉCNICOS]**
Especifique detalhes como profundidade de campo, bokeh, nitidez, textura, qualidade, resolução sugerida.

**[REFERÊNCIAS ARTÍSTICAS OU ESTILÍSTICAS]**
Mencione artistas, movimentos artísticos, ou referências culturais relevantes (se aplicável).

**[CONFIGURAÇÕES EXTRAS]**
Sugira parâmetros adicionais como aspect ratio, peso de estilo, número de variações, etc.

Importante: 
- Seja extremamente detalhado e preciso
- Use linguagem técnica quando apropriado
- O prompt deve ser rico em detalhes visuais
- Considere a solicitação do usuário: "${prompt}"`;
    
    const result = await ai.models.generateContent({
      model: 'gemini-1.5-pro',
      contents: [{ role: 'user', parts: [imagePart, { text: systemPrompt }] }],
    });
    
    res.json({ text: result.text });
  } catch (error) {
    console.error('Image analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze image' });
  }
});

app.post('/api/ai/image-generation', verifyToken, checkSubscription(db), async (req, res) => {
  try {
    const { prompt, imageData } = req.body;
    
    try {
      const { GoogleGenAI, Modality } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
      
      const parts = [];
      
      if (imageData) {
        parts.push({
          inlineData: {
            data: imageData.split(',')[1],
            mimeType: imageData.split(':')[1].split(';')[0]
          }
        });
      }
      parts.push({ text: prompt });
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: [{ role: 'user', parts }],
        config: {
          responseModalities: [Modality.IMAGE],
        },
      });
      
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          console.log('[Image Generation] Successfully used Nano Banana (Gemini 2.5 Flash Image)');
          res.json({ imageData: part.inlineData.data });
          return;
        }
      }
      
      throw new Error('No image returned from Nano Banana');
    } catch (geminiError) {
      console.log('[Image Generation] Nano Banana failed, falling back to DALL-E 3:', geminiError.message);
      
      const { default: OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      const response = await openai.images.generate({
        model: 'dall-e-3',
        prompt: prompt,
        n: 1,
        size: '1024x1024',
        response_format: 'b64_json',
      });
      
      console.log('[Image Generation] Successfully used DALL-E 3 as fallback');
      res.json({ imageData: response.data[0].b64_json });
    }
  } catch (error) {
    console.error('Image generation error (all providers failed):', error);
    res.status(500).json({ error: 'Failed to generate image' });
  }
});

app.post('/api/ai/prompt-specialist', verifyToken, checkSubscription(db), async (req, res) => {
  try {
    const { idea, targetModel } = req.body;
    
    const systemInstruction = "Você é um especialista em engenharia de prompts para modelos de IA generativa de imagem e vídeo. Sua tarefa é pegar uma ideia simples do usuário e transformá-la em um prompt em inglês, extremamente detalhado e eficaz, otimizado para o modelo alvo (imagem ou vídeo).";
    const userPrompt = `
      Baseado na seguinte ideia simples: "${idea}", crie um prompt detalhado e otimizado para um modelo de IA que gera ${targetModel === 'image' ? 'imagens (como DALL-E 3, Midjourney, ou Nano Banana)' : 'vídeos (como Sora ou Veo)'}.

      O prompt deve ser rico em detalhes, incluindo, quando aplicável:
      - **Sujeito/Personagem:** Descrição detalhada da aparência, roupas, emoções.
      - **Cenário/Ambiente:** Onde a cena se passa? É interno, externo, fantástico? Detalhes de fundo.
      - **Composição da Cena:** Como os elementos estão arranjados? Close-up, plano geral, ângulo da câmera?
      - **Iluminação:** Tipo de luz (ex: luz do amanhecer, luz de velas, neon, cinemática, dramática).
      - **Paleta de Cores:** Cores dominantes, atmosfera (vibrante, sombria, pastel).
      - **Estilo Artístico:** Fotorrealista, pintura a óleo, 3D render, anime, arte conceitual, etc.
      - **Qualidade/Detalhes:** Especifique alta resolução, 4K, 8K, detalhes intrincados.
      - **Para vídeos:** Adicione descrição da ação principal, movimento de câmera (ex: travelling, panning, aéreo), e a atmosfera/mood do vídeo.

      O prompt final deve ser apenas o texto em INGLÊS, sem nenhuma introdução ou explicação sua. Apenas o prompt.
    `;
    
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      systemInstruction: systemInstruction,
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    });
    
    res.json({ text: response.text.trim() });
  } catch (error) {
    console.error('Prompt specialist error:', error);
    res.status(500).json({ error: 'Failed to generate prompt' });
  }
});

app.post('/api/ai/image-replicator', verifyToken, checkSubscription(db), async (req, res) => {
  try {
    const { imageData } = req.body;
    
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
    
    const imagePart = {
      inlineData: {
        data: imageData.split(',')[1],
        mimeType: imageData.split(':')[1].split(';')[0]
      }
    };
    
    const textPart = { 
      text: "Analise esta imagem em detalhes e gere um prompt descritivo em inglês que possa ser usado em um modelo de texto para imagem (como Nano Banana ou Midjourney) para recriar uma imagem semelhante. Descreva o sujeito, cenário, estilo, composição, iluminação e cores. O resultado deve ser APENAS o prompt, sem nenhuma introdução ou texto adicional." 
    };
    
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: [{ role: 'user', parts: [imagePart, textPart] }],
    });
    
    res.json({ text: result.text.trim() });
  } catch (error) {
    console.error('Image replicator error:', error);
    res.status(500).json({ error: 'Failed to generate prompt from image' });
  }
});

app.post('/api/ai/video-generation', verifyToken, checkSubscription(db), async (req, res) => {
  try {
    const { prompt, imageData } = req.body;
    
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
    
    const parts = [];
    
    if (imageData) {
      parts.push({
        inlineData: {
          data: imageData.split(',')[1],
          mimeType: imageData.split(':')[1].split(';')[0]
        }
      });
    }
    parts.push({ text: prompt });
    
    const operation = await ai.models.generateVideos({
      model: 'veo-004',
      prompt: [{ role: 'user', parts }],
    });
    
    res.json({ operationName: operation.name });
  } catch (error) {
    console.error('Video generation error:', error);
    res.status(500).json({ error: 'Failed to start video generation' });
  }
});

app.post('/api/ai/video-status', verifyToken, checkSubscription(db), async (req, res) => {
  try {
    const { operationName } = req.body;
    
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
    
    const operation = await ai.operations.getVideosOperation({ 
      operation: { name: operationName } 
    });
    
    if (operation.done) {
      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (downloadLink) {
        const videoResponse = await fetch(`${downloadLink}&key=${process.env.GOOGLE_API_KEY}`);
        const buffer = await videoResponse.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        res.json({ done: true, videoData: base64 });
      } else {
        res.json({ done: true, error: 'No video link returned' });
      }
    } else {
      res.json({ done: false });
    }
  } catch (error) {
    console.error('Video status check error:', error);
    res.status(500).json({ error: 'Failed to check video status' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Backend ready to accept connections`);
});
