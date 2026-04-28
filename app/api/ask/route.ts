import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const ONBOARDING_PROMPT = `You are a goal-setting coach inside a personal productivity app. The user has just completed an onboarding questionnaire. Based on their answers, your job is to:

1. Suggest 3 to 5 category names that make sense for organizing their goals. Categories should be specific to their situation, not generic. For example, instead of "Learning", suggest "AWS Cert Prep". Instead of "Career", suggest "Job Applications". Make them feel personal and actionable.

2. For each category, suggest 2 to 3 specific weekly goals the user could start with this week. Each goal should be concrete and completable within 7 days.

3. Return your response ONLY as a valid JSON object with no extra text, no markdown, no code blocks. The format must be exactly:

{
  "categories": [
    {
      "name": "Category name",
      "color": "one of: amber, teal, blue, gray, purple",
      "goals": [
        { "text": "Goal description", "dueDay": "Fri" },
        { "text": "Goal description", "dueDay": "Sun" }
      ]
    }
  ],
  "summary": "One sentence summarizing the user's focus and plan in a warm, direct tone."
}`

function buildChatPrompt(profile: Record<string, string>, goals: { title: string; status: string; category: string }[], streak: number) {
  const active    = goals.filter(g => g.status !== 'done').map(g => `- ${g.title} (${g.category})`).join('\n') || 'None'
  const completed = goals.filter(g => g.status === 'done').map(g => `- ${g.title} (${g.category})`).join('\n') || 'None'

  return `You are a goal-setting coach inside a personal productivity app. Your only job is to help the user set, break down, track, and reflect on their goals. You are not a general assistant.

USER PROFILE:
- Focus area: ${profile.focusArea ?? 'Not set'}
- Big goal: ${profile.bigGoal ?? 'Not set'}
- Timeline: ${profile.timeline ?? 'Not set'}
- Main challenge: ${profile.challenge ?? 'Not set'}

CURRENT WEEK:
- Active goals:
${active}
- Completed goals:
${completed}
- Current streak: ${streak} week${streak !== 1 ? 's' : ''}

YOUR RULES:
1. Only discuss goal setting, planning, habits, productivity, and accountability. If asked anything unrelated, redirect warmly.
2. When a user mentions a big goal, always break it into specific weekly milestones automatically.
3. When you suggest goals, format them clearly so the user can add them to their tracker with one click.
4. Ask only one question at a time. Never ask multiple questions in one message.
5. End every response with either a suggested goal to add, a short reflection question, or a one-line motivational statement. Never end generically.
6. Tone: direct, warm, concise. Like a smart friend, not a corporate chatbot.
7. Never mention Claude, Anthropic, or that you are an AI unless directly asked.`
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  // ── onboarding mode ──────────────────────────────────────────────────────
  if (body.mode === 'onboarding') {
    const { profile } = body
    const userMessage = `My answers:
- Focus area: ${profile.focusArea}
- Big goal: ${profile.bigGoal}
- Timeline: ${profile.timeline}
- Biggest challenge: ${profile.challenge}

Please build my goal categories and starter goals now.`

    const message = await client.messages.create({
      model:      'claude-opus-4-6',
      max_tokens: 2048,
      system:     ONBOARDING_PROMPT,
      messages:   [{ role: 'user', content: userMessage }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : '{}'
    return NextResponse.json({ reply: text })
  }

  // ── chat mode ─────────────────────────────────────────────────────────────
  const { message, history = [], profile = {}, goals = [], streak = 0 } = body

  const systemPrompt = buildChatPrompt(profile, goals, streak)

  // Build messages array: full history + new message
  const messages: Anthropic.Messages.MessageParam[] = [
    ...history.map((m: { role: string; content: string }) => ({
      role:    m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: message },
  ]

  const response = await client.messages.create({
    model:      'claude-opus-4-6',
    max_tokens: 1024,
    system:     systemPrompt,
    messages,
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  return NextResponse.json({ reply: text })
}
