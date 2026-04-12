import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getExecSession, checkDiscordLink } from '@/lib/exec-auth';
import {
  HAMMERHEAD_GENERAL_QUESTIONS,
  HAMMERHEAD_TASK_SELECTOR,
  HAMMERHEAD_SECTION_QUESTIONS,
  HAMMERHEAD_FINAL_QUESTIONS,
  HAMMERHEAD_TASK_OPTIONS,
  getAllHammerheadQuestions,
} from '@/lib/application-questions';
import type { ApplicationQuestion } from '@/lib/application-questions';
import { RANK_HIERARCHY } from '@/lib/rank-constants';
import { checkRateLimit, incrementRateLimit, createRateLimitResponse, addRateLimitHeaders } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const ANGLER_INDEX = RANK_HIERARCHY.indexOf('Angler');
const HAMMERHEAD_INDEX = RANK_HIERARCHY.indexOf('Hammerhead');

export async function POST(request: NextRequest) {
  // Rate limit
  const rateLimitCheck = checkRateLimit(request, 'hammerhead-application');
  if (!rateLimitCheck.allowed) {
    return createRateLimitResponse(rateLimitCheck.resetTime);
  }
  incrementRateLimit(request, 'hammerhead-application');

  // Verify exec session
  const session = getExecSession(request);
  if (!session) {
    return NextResponse.json(
      { error: 'You must be logged in to submit a Hammerhead application.' },
      { status: 401 }
    );
  }

  // Re-verify rank from database
  const linkCheck = await checkDiscordLink(session.discord_id);
  if (!linkCheck.ok) {
    return NextResponse.json(
      { error: 'Your account is not linked to a guild member.' },
      { status: 403 }
    );
  }

  const rankIdx = RANK_HIERARCHY.indexOf(linkCheck.rank);
  if (rankIdx < ANGLER_INDEX) {
    return NextResponse.json(
      { error: 'You must be Angler rank or higher to apply for Hammerhead.' },
      { status: 403 }
    );
  }
  if (rankIdx >= HAMMERHEAD_INDEX) {
    return NextResponse.json(
      { error: 'You are already Hammerhead rank or higher.' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { answers } = body;

    if (!answers || typeof answers !== 'object') {
      return NextResponse.json(
        { error: 'Answers are required.' },
        { status: 400 }
      );
    }

    // Validate hh_tasks
    const selectedTasks: string[] = answers.hh_tasks;
    if (!Array.isArray(selectedTasks) || selectedTasks.length === 0) {
      return NextResponse.json(
        { error: 'You must select at least one task area.' },
        { status: 400 }
      );
    }

    const validTasks = new Set<string>(HAMMERHEAD_TASK_OPTIONS);
    for (const task of selectedTasks) {
      if (!validTasks.has(task)) {
        return NextResponse.json(
          { error: `Invalid task selection: "${task}"` },
          { status: 400 }
        );
      }
    }

    // Build the set of questions that should be validated
    const questionsToValidate: ApplicationQuestion[] = [
      ...HAMMERHEAD_GENERAL_QUESTIONS,
      ...HAMMERHEAD_FINAL_QUESTIONS,
    ];

    // Add section questions for selected tasks only
    for (const task of selectedTasks) {
      const sectionQuestions = HAMMERHEAD_SECTION_QUESTIONS[task];
      if (sectionQuestions) {
        questionsToValidate.push(...sectionQuestions);
      }
    }

    // Validate required fields and length limits
    for (const question of questionsToValidate) {
      const answer = answers[question.id];

      if (question.required) {
        if (question.type === 'select') {
          if (!answer || (typeof answer === 'string' && answer.trim().length === 0)) {
            return NextResponse.json(
              { error: `"${question.label}" is required.` },
              { status: 400 }
            );
          }
          // Validate select value is one of the options
          if (question.options && !question.options.includes(answer)) {
            return NextResponse.json(
              { error: `Invalid selection for "${question.label}".` },
              { status: 400 }
            );
          }
        } else {
          if (!answer || (typeof answer === 'string' && answer.trim().length === 0)) {
            return NextResponse.json(
              { error: `"${question.label}" is required.` },
              { status: 400 }
            );
          }
        }
      }

      if (answer && typeof answer === 'string') {
        if (question.maxLength && answer.length > question.maxLength) {
          return NextResponse.json(
            { error: `"${question.label}" exceeds the maximum length of ${question.maxLength} characters.` },
            { status: 400 }
          );
        }
      }
    }

    // Build sanitized answers: only keep known question IDs + hh_tasks
    const allQuestions = getAllHammerheadQuestions();
    const knownIds = new Set(allQuestions.map(q => q.id));
    const sanitizedAnswers: Record<string, string | string[]> = {
      hh_tasks: selectedTasks,
    };
    for (const [key, value] of Object.entries(answers)) {
      if (key === 'hh_tasks') continue;
      if (knownIds.has(key) && typeof value === 'string') {
        sanitizedAnswers[key] = value.trim();
      }
    }

    // Insert into database
    const pool = getPool();
    const client = await pool.connect();

    // Check 3-day cooldown for hammerhead applications
    const cooldownResult = await client.query(
      `SELECT submitted_at FROM applications
       WHERE discord_id = $1 AND application_type = 'hammerhead'
       ORDER BY submitted_at DESC LIMIT 1`,
      [session.discord_id]
    );

    if (cooldownResult.rows.length > 0) {
      const lastSubmitted = new Date(cooldownResult.rows[0].submitted_at);
      const msSinceLastApp = Date.now() - lastSubmitted.getTime();
      const cooldownMs = 3 * 24 * 60 * 60 * 1000; // 3 days

      if (msSinceLastApp < cooldownMs) {
        const remainingMs = cooldownMs - msSinceLastApp;
        const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
        const remainingDays = Math.floor(remainingHours / 24);
        const leftoverHours = remainingHours % 24;
        const timeStr = remainingDays > 0
          ? `${remainingDays} day${remainingDays === 1 ? '' : 's'}${leftoverHours > 0 ? ` and ${leftoverHours} hour${leftoverHours === 1 ? '' : 's'}` : ''}`
          : `${leftoverHours} hour${leftoverHours === 1 ? '' : 's'}`;
        client.release();
        return NextResponse.json(
          { error: `You can only submit one Hammerhead application every 3 days. Please try again in ${timeStr}.` },
          { status: 429 }
        );
      }
    }

    try {
      const result = await client.query(
        `INSERT INTO applications (application_type, discord_id, discord_username, discord_avatar, answers)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, submitted_at`,
        [
          'hammerhead',
          session.discord_id,
          session.discord_username,
          session.discord_avatar,
          JSON.stringify(sanitizedAnswers),
        ]
      );

      const { id, submitted_at } = result.rows[0];

      const response = NextResponse.json(
        { success: true, applicationId: id, submittedAt: submitted_at },
        { status: 201 }
      );
      return addRateLimitHeaders(response, rateLimitCheck.remainingRequests, rateLimitCheck.resetTime);
    } catch (dbError: any) {
      if (dbError.code === '23505') {
        const response = NextResponse.json(
          { error: 'You already have a pending Hammerhead application.' },
          { status: 409 }
        );
        return addRateLimitHeaders(response, rateLimitCheck.remainingRequests, rateLimitCheck.resetTime);
      }
      throw dbError;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error submitting Hammerhead application:', error);
    const response = NextResponse.json(
      { error: 'Failed to submit application. Please try again.' },
      { status: 500 }
    );
    return addRateLimitHeaders(response, rateLimitCheck.remainingRequests, rateLimitCheck.resetTime);
  }
}
