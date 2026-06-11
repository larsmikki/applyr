import OpenAI from 'openai';
import { Response } from 'express';
import fs from 'fs';
import path from 'path';
import { getDb } from '../db/connection';
import { getEffectivePrompts } from '../constants/prompts';

function loadBestPractices(): string {
  try {
    const filePath = path.join(__dirname, '../../../resources/application-writing-prompt.md');
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

let cachedClient: OpenAI | null = null;
let cachedClientKey = '';

function getOpenAIClient(): { client: OpenAI; model: string; temperatureOverride: number | null } {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings WHERE key IN (?, ?, ?, ?)').all(
    'ai_api_key', 'ai_model', 'ai_base_url', 'ai_temperature'
  ) as { key: string; value: string }[];

  const settingsMap: Record<string, string> = {};
  for (const row of rows) {
    settingsMap[row.key] = row.value;
  }

  const apiKey = settingsMap['ai_api_key'] || 'no-key-set';
  const model = settingsMap['ai_model'] || 'gpt-4o';
  const baseURL = settingsMap['ai_base_url'] || '';

  const cacheKey = `${apiKey}|${baseURL}`;
  if (!cachedClient || cachedClientKey !== cacheKey) {
    cachedClient = new OpenAI({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
    });
    cachedClientKey = cacheKey;
  }

  const tempStr = settingsMap['ai_temperature'];
  const temperatureOverride = tempStr && tempStr.trim() !== '' ? parseFloat(tempStr) : null;

  return { client: cachedClient, model, temperatureOverride };
}

function setupSSE(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
}

function sendEvent(res: Response, data: object): void {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function parseFitScore(text: string): number | null {
  const patterns = [
    /SCORE:\s*(\d+)/i,
    /fit score[:\s]+(\d+)/i,
    /score[:\s]+(\d+)\/100/i,
    /(\d+)\/100/,
    /(\d+)%/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const score = parseInt(match[1]);
      if (score >= 0 && score <= 100) return score;
    }
  }
  return null;
}

function parseCVScore(text: string): number | null {
  const match = text.match(/SCORE:\s*(\d+(\.\d+)?)/i);
  if (match) {
    const score = parseFloat(match[1]);
    if (score >= 0 && score <= 10) return score;
  }
  return null;
}

async function withSSEStream(
  res: Response,
  signal: AbortSignal | undefined,
  fn: (send: (data: object) => void) => Promise<void>
): Promise<void> {
  setupSSE(res);
  try {
    await fn((data) => sendEvent(res, data));
  } catch (error) {
    if (signal?.aborted) return;
    const message = error instanceof Error ? error.message : 'AI request failed';
    sendEvent(res, { error: message });
  } finally {
    res.end();
  }
}

async function callAIInternal(
  messages: { role: 'system' | 'user'; content: string }[],
  _defaultTemperature: number,
  signal?: AbortSignal
): Promise<string> {
  const { client, model, temperatureOverride } = getOpenAIClient();
  const response = await client.chat.completions.create(
    { model, messages, ...(temperatureOverride !== null ? { temperature: temperatureOverride } : {}) },
    { signal }
  );
  return response.choices[0]?.message?.content || '';
}

function targetContextSection(roles: string[], departments: string[] = []): string {
  if (!roles.length && !departments.length) return '';
  const sections: string[] = [];
  if (roles.length) {
    sections.push(`Target roles: ${roles.join(', ')}.`);
  }
  if (departments.length) {
    sections.push(`Target departments: ${departments.join(', ')}.`);
  }
  return `\n\n## Target Context\n${sections.join('\n')} Tailor all feedback and rewrites to help the candidate excel in these role and department contexts.`;
}

export async function rewriteCVForScore(
  cvText: string,
  reviewText: string,
  signal?: AbortSignal,
  targetRoles: string[] = [],
  targetDepartments: string[] = []
): Promise<string> {
  return callAIInternal([
    { role: 'system', content: getEffectivePrompts(getDb()).rewriteCV },
    { role: 'user', content: `Here is the current CV and its expert review. Rewrite the CV to achieve a 9.5+ score.${targetContextSection(targetRoles, targetDepartments)}\n\n## Current CV\n${cvText}\n\n## Expert Review\n${reviewText}\n\nOutput the complete rewritten CV in Markdown format.` },
  ], 0.5, signal);
}

export async function reviewCVInternal(
  cvText: string,
  signal?: AbortSignal,
  targetRoles: string[] = [],
  targetDepartments: string[] = []
): Promise<{ fullText: string; score: number | null }> {
  const fullText = await callAIInternal([
    { role: 'system', content: getEffectivePrompts(getDb()).analyzeCv },
    { role: 'user', content: `Please perform a direct and practical review of the following CV.${targetContextSection(targetRoles, targetDepartments)}\n\n## Candidate CV\n${cvText}\n\nProvide a detailed analysis, an action plan to reach a score of 9.5+, and end with SCORE: [0-10].` },
  ], 0.4, signal);
  return { fullText, score: parseCVScore(fullText) };
}

export async function streamAnalysis(
  jobDescription: string,
  cvText: string,
  res: Response,
  signal?: AbortSignal
): Promise<void> {
  await withSSEStream(res, signal, async (send) => {
    const { client, model, temperatureOverride } = getOpenAIClient();

    const systemPrompt = getEffectivePrompts(getDb()).fitAnalysis;

    const userPrompt = `Please analyze the fit between this candidate and the job opportunity.

## Job Description
${jobDescription}

## Candidate CV
${cvText}

Provide a thorough analysis and end with SCORE: [number].`;

    let accumulated = '';

    const stream = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: true,
      ...(temperatureOverride !== null ? { temperature: temperatureOverride } : {}),
    }, { signal });

    for await (const chunk of stream) {
      if (signal?.aborted) break;
      const token = chunk.choices[0]?.delta?.content || '';
      if (token) {
        accumulated += token;
        send({ token });
      }
    }

    if (!signal?.aborted) {
      const fitScore = parseFitScore(accumulated);
      send({ done: true, fullText: accumulated, fitScore });
    }
  });
}

export async function streamGeneration(
  jobDescription: string,
  cvText: string,
  fitAnalysis: string,
  snippets: string[],
  additionalInstructions: string,
  language: string,
  res: Response,
  signal?: AbortSignal,
  onPrompts?: (system: string, user: string) => void
): Promise<void> {
  await withSSEStream(res, signal, async (send) => {
    const { client, model, temperatureOverride } = getOpenAIClient();

    const bestPractices = loadBestPractices();

    const languageInstruction = language && language !== 'en'
      ? `Language: Write the entire cover letter in ${language}. Do not switch languages.\n\n`
      : '';

    const systemPrompt = `${languageInstruction}${bestPractices}`;

    const snippetSection = snippets.length > 0
      ? `\n## Additional Context to Incorporate\n${snippets.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
      : '';

    const analysisSection = fitAnalysis
      ? `\n## Fit Analysis (use to inform key points)\n${fitAnalysis}`
      : '';

    const instructionsSection = additionalInstructions
      ? `\n## Special Instructions\n${additionalInstructions}`
      : '';

    const userPrompt = `Write a cover letter for this job application.

## Job Description
${jobDescription}

## Candidate CV
${cvText}
${analysisSection}
${snippetSection}
${instructionsSection}

Write a complete, polished cover letter in Markdown format.`;

    onPrompts?.(systemPrompt, userPrompt);

    let accumulated = '';

    const stream = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: true,
      ...(temperatureOverride !== null ? { temperature: temperatureOverride } : {}),
    }, { signal });

    for await (const chunk of stream) {
      if (signal?.aborted) break;
      const token = chunk.choices[0]?.delta?.content || '';
      if (token) {
        accumulated += token;
        send({ token });
      }
    }

    if (!signal?.aborted) {
      send({ done: true, fullText: accumulated });
    }
  });
}

export async function streamRefinement(
  currentLetter: string,
  instruction: string,
  res: Response,
  signal?: AbortSignal,
  onPrompts?: (system: string, user: string) => void,
  cvText?: string
): Promise<void> {
  await withSSEStream(res, signal, async (send) => {
    const { client, model, temperatureOverride } = getOpenAIClient();

    const systemPrompt = getEffectivePrompts(getDb()).refinement;

    const cvSection = cvText ? `\n\n## Candidate CV\n${cvText}` : '';

    const userPrompt = `Please revise this cover letter according to the instructions.

## Current Cover Letter
${currentLetter}${cvSection}

## Revision Instructions
${instruction}

Output the complete revised cover letter.`;

    onPrompts?.(systemPrompt, userPrompt);

    let accumulated = '';

    const stream = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: true,
      ...(temperatureOverride !== null ? { temperature: temperatureOverride } : {}),
    }, { signal });

    for await (const chunk of stream) {
      if (signal?.aborted) break;
      const token = chunk.choices[0]?.delta?.content || '';
      if (token) {
        accumulated += token;
        send({ token });
      }
    }

    if (!signal?.aborted) {
      send({ done: true, fullText: accumulated });
    }
  });
}

export async function streamCVReview(
  cvText: string,
  res: Response,
  signal?: AbortSignal,
  targetRoles: string[] = [],
  targetDepartments: string[] = []
): Promise<void> {
  await withSSEStream(res, signal, async (send) => {
    const { client, model, temperatureOverride } = getOpenAIClient();

    const systemPrompt = getEffectivePrompts(getDb()).analyzeCv;
    const userPrompt = `Please perform a direct and practical review of the following CV.${targetContextSection(targetRoles, targetDepartments)}

## Candidate CV
${cvText}

Provide a detailed analysis, an action plan to reach a score of 9.5+, and end with SCORE: [0-10].`;

    let accumulated = '';

    const stream = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: true,
      ...(temperatureOverride !== null ? { temperature: temperatureOverride } : {}),
    }, { signal });

    for await (const chunk of stream) {
      if (signal?.aborted) break;
      const token = chunk.choices[0]?.delta?.content || '';
      if (token) {
        accumulated += token;
        send({ token });
      }
    }

    if (!signal?.aborted) {
      const score = parseCVScore(accumulated);
      send({ done: true, fullText: accumulated, score });
    }
  });
}

export async function streamGapAnalysis(
  fitAnalyses: { company: string; role: string; analysis: string }[],
  res: Response,
  signal?: AbortSignal
): Promise<void> {
  await withSSEStream(res, signal, async (send) => {
    const { client, model, temperatureOverride } = getOpenAIClient();

    const analysesText = fitAnalyses
      .map((a, i) => `### Analysis ${i + 1}: ${a.company} — ${a.role}\n${a.analysis}`)
      .join('\n\n');

    const userPrompt = `Here are the fit analysis reports from ${fitAnalyses.length} job application${fitAnalyses.length !== 1 ? 's' : ''} by the same candidate. Please synthesise these into a gap analysis and CV improvement plan.\n\n${analysesText}`;

    let accumulated = '';

    const stream = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: getEffectivePrompts(getDb()).gapAnalysis },
        { role: 'user', content: userPrompt },
      ],
      stream: true,
      ...(temperatureOverride !== null ? { temperature: temperatureOverride } : {}),
    }, { signal });

    for await (const chunk of stream) {
      if (signal?.aborted) break;
      const token = chunk.choices[0]?.delta?.content || '';
      if (token) {
        accumulated += token;
        send({ token });
      }
    }

    if (!signal?.aborted) {
      send({ done: true, fullText: accumulated });
    }
  });
}

export async function streamCareerGuidance(
  cvText: string,
  recentGapAnalysis: string | null,
  res: Response,
  signal?: AbortSignal
): Promise<void> {
  await withSSEStream(res, signal, async (send) => {
    const { client, model, temperatureOverride } = getOpenAIClient();

    const gapSection = recentGapAnalysis
      ? `\n\n## Recent Gap Analysis (for context on their application history — do NOT repeat gaps)\n${recentGapAnalysis}`
      : '';

    const userPrompt = `Please generate career guidance for this candidate based on their CV.

## Candidate CV
${cvText}${gapSection}`;

    let accumulated = '';

    const stream = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: getEffectivePrompts(getDb()).careerGuidance },
        { role: 'user', content: userPrompt },
      ],
      stream: true,
      ...(temperatureOverride !== null ? { temperature: temperatureOverride } : {}),
    }, { signal });

    for await (const chunk of stream) {
      if (signal?.aborted) break;
      const token = chunk.choices[0]?.delta?.content || '';
      if (token) {
        accumulated += token;
        send({ token });
      }
    }

    if (!signal?.aborted) {
      send({ done: true, fullText: accumulated });
    }
  });
}

export async function streamInterviewPrep(
  jobDescription: string,
  cvText: string | null,
  res: Response,
  signal?: AbortSignal,
  onDone?: (fullText: string) => void
): Promise<void> {
  await withSSEStream(res, signal, async (send) => {
    const { client, model, temperatureOverride } = getOpenAIClient();

    const systemPrompt = getEffectivePrompts(getDb()).interviewPrep;

    const cvSection = cvText ? `\n\n## Candidate CV\n${cvText}` : '';
    const userPrompt = `Prepare a focused interview brief for the following role.

## Job Description
${jobDescription}${cvSection}

Output ONLY valid JSON in this exact format, with no other text before or after:
{"questions":[{"question":"...","talking_points":["...","..."]}],"questions_to_ask":[{"question":"...","purpose":"..."}]}

Rules:
- "questions": exactly 5 questions. These must be the most probable and highest-stakes questions for THIS specific role — not generic interview questions. Cover: a core technical/domain skill, a behavioural competency critical to the role, a situational or problem-solving scenario, a question about past experience directly relevant to this job, and one wildcard based on something distinctive in the job description.
- Each question has at most 3 talking points. Talking points must be concrete and specific — draw directly from the job description and (if provided) the candidate's CV. No filler advice like "be confident" or "show enthusiasm".
- "questions_to_ask": exactly 5 questions for the candidate to ask the interviewer. These must be genuinely insightful — not "what does a typical day look like". They should uncover role clarity, team health, success metrics, company direction, or potential red flags. Each has a "purpose" field (1 sentence): what this question reveals and why it signals a strong candidate.`;

    let accumulated = '';

    const stream = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: true,
      ...(temperatureOverride !== null ? { temperature: temperatureOverride } : {}),
    }, { signal });

    for await (const chunk of stream) {
      if (signal?.aborted) break;
      const token = chunk.choices[0]?.delta?.content || '';
      if (token) {
        accumulated += token;
        send({ token });
      }
    }

    if (!signal?.aborted) {
      onDone?.(accumulated);
      send({ done: true, fullText: accumulated });
    }
  });
}
