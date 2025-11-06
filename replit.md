# R4 Academy - AI Studio App

## Overview
R4 Academy is a React-based AI application powered by Google Gemini. It provides various AI agents including chat, image analysis, image generation, video generation, and prompt specialist capabilities.

## Project Architecture

### Tech Stack
- **Frontend Framework**: React 19.2.0 with TypeScript
- **Build Tool**: Vite 6.2.0
- **AI Integration**: Google Gemini API (@google/genai)
- **Styling**: TailwindCSS (via CDN)

### Project Structure
- `/components/` - React components
  - `/agents/` - AI agent components (Chat, Image Analysis, Image Generation, etc.)
  - Various UI components (Header, Sidebar, Modals, etc.)
- `App.tsx` - Main application component
- `index.tsx` - Application entry point
- `vite.config.ts` - Vite configuration
- `types.ts` - TypeScript type definitions

### Key Features
- Multiple AI agent interfaces
- Community view for content sharing
- Admin view for management
- Video player and editing capabilities
- Chat history sidebar

## Configuration

### Environment Variables
- `GOOGLE_API_KEY` - Google Gemini API key (configured in Replit Secrets)
- `OPENAI_API_KEY` - OpenAI API key for GPT-4o (configured in Replit Secrets, used as fallback)
- `CAKTO_PRODUCT_ID` - ID do produto Cakto para assinaturas (opcional)
- `CAKTO_WEBHOOK_SECRET` - Segredo compartilhado para validar webhooks do Cakto
- `VITE_API_URL` - URL base da API (opcional, padrão: `/api` com proxy)

### Server Configuration
- **Port**: 5000 (required for Replit frontend)
- **Host**: 0.0.0.0 (allows Replit proxy access)
- **HMR**: Configured for Replit's iframe proxy environment

## Development

### Running Locally
The app runs on port 5000 with hot module replacement enabled.

### Build Command
```bash
npm run build
```

### Development Command
```bash
npm run dev
```

## Recent Changes
- **2025-11-06**: Full platform implementation and bug fixes
  - Backend API with Express, JWT authentication, SQLite database
  - Complete database schema (users, subscriptions, courses, lessons, progress, chat history)
  - Cakto payment integration with secure webhook verification
  - Frontend authentication system with React Context
  - Login/Signup UI components
  - Subscription paywall for AI agents
  - Backend and frontend workflows running on ports 3000 and 5000
  - Vite proxy configuration connecting frontend to backend
  - Email-based admin role assignment (includes teste@gmail.com)
  - Security: JWT tokens, bcrypt passwords, webhook signature verification
  - Configured Vite to use port 5000 for Replit compatibility
  - Added `allowedHosts: true` to fix Replit proxy blocking
  - Fixed AgentView black screen by adding state management (history, chatHistories, handlers)
  - Fixed VideoPlayerView black screen by correcting prop name (video → initialVideo)
  - Implemented comments functionality in CommunityView with full UI and state management
  - Added OpenAI integration with GPT-4o chat agent
  - **Lesson Progress System**: Migrated from localStorage to backend database (lesson_progress table), progress now properly scoped per user and lesson, fixing issue where completing a lesson in one course would mark it in all courses
  - Now features dual AI chat: Google Gemini and OpenAI GPT
  - **Secure AI Integration**: Moved API keys from frontend to backend (secure)
  - **Automatic Fallback**: Chat uses Google Gemini first, automatically falls back to OpenAI if Google fails
  - **Admin Role**: teste@gmail.com configured as admin in database
  - **Backend Endpoints**: /api/ai/gemini-chat, /api/ai/chat-with-fallback, /api/ai/openai-chat
  - **SSE Streaming**: Fixed streaming response parsing with proper buffer management
  - **Fixed Google Gemini API (2025-11-06)**: Completely migrated to @google/genai v1.28 package with correct API usage:
    - Uses `ai.models.generateContentStream()` for streaming chat responses
    - All contents properly formatted with `[{ role: 'user', parts: [...] }]` schema
    - Fixed all AI endpoints to work with the new SDK (chat, image analysis, image generation, video generation, prompt specialist, image replicator)
    - Verified all agents are now functional with proper API integration
  - **Fixed AI Communication Error**: Resolved "Ocorreu um erro ao comunicar com a IA" by ensuring test user has active subscription (required by checkSubscription middleware)
  - **Removed OpenAI Chat Agent**: Removed the standalone "Chat com GPT" agent from AgentView as requested, keeping only Google Gemini-based agents
  - **Secure Google AI Agents**: Migrated all Google AI agent operations to backend endpoints to protect API keys:
    - /api/ai/image-analysis - Analyzes images using Gemini Vision
    - /api/ai/image-generation - Generates images using Imagen
    - /api/ai/prompt-specialist - Improves prompts using Gemini
    - /api/ai/image-replicator - Generates prompts from images using Gemini Vision
    - /api/ai/video-generation - Initiates video generation using Veo
    - /api/ai/video-status - Polls video generation status
  - **Frontend-Backend Architecture**: All AI agents now communicate through secure backend endpoints instead of direct browser-to-API calls, preventing exposure of GOOGLE_API_KEY in the frontend
  - **API Key Standardization (2025-11-06)**: Padronizadas todas as referências de API key do Google Gemini para usar `GEMINI_API_KEY` consistentemente em todo o backend, corrigindo inconsistências anteriores com `GOOGLE_API_KEY` e `GOOGLE_IMAGE_API_KEY`
  - **Sistema de Conclusão Sequencial de Aulas (2025-11-06)**: Implementado sistema que garante progressão ordenada nas aulas:
    - Backend valida que todas as aulas anteriores (baseado em `order_index`) foram concluídas antes de permitir marcar uma aula como concluída
    - Frontend desabilita visualmente o botão "Marcar como Concluída" para aulas que ainda não podem ser marcadas
    - Usuários não podem mais "pular" aulas, garantindo aprendizado sequencial
    - Mensagens de erro informativas quando tentam marcar uma aula fora de ordem

## Notes
- This app was imported from AI Studio (https://ai.studio/apps/drive/16b5ElGbSprtdan1jbs4RNGAE78kxil0q)
- The app uses TailwindCSS loaded from CDN
- Custom animations and styling defined in index.html
